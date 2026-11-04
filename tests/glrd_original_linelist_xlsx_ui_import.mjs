#!/usr/bin/env node
/**
 * Reproducible real-Chromium GLRD Preview + downstream enriched XML capture.
 * This runner imports production Preview and the production Run service.
 * A Python pre-parser artifact is never accepted as a baseline.
 * Repository contents under --root must be a clean, pinned checkout.
 */
import {createHash} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createServer as createSocketServer} from 'node:net';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname, join, resolve, sep} from 'node:path';

const flags=new Map();
for(let i=2;i<process.argv.length;i+=2) flags.set(process.argv[i],process.argv[i+1]);
const arg=(name)=>flags.get('--'+name);
const hash=(value)=>createHash('sha256').update(value).digest('hex');
const sleep=(ms)=>new Promise((done)=>setTimeout(done,ms));
const ROOT=resolve(arg('root')||'');
const OUT=resolve(arg('out')||'');
const LABEL=arg('label')||'baseline';
const MAGIC='glrd-issue7-browser-stage-write-observation';
function requireArgs() {
  for(const key of ['root','out','xml','staged','config','linelist','piping-class','weight','material-map','expected-sha'])
    if(!arg(key)) throw Error('Missing --'+key);
  if(!/^(baseline|optimized)$/.test(LABEL)) throw Error('Invalid capture label');
}
function assertCheckout() {
  const sha=execFileSync('git',['-C',ROOT,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(sha!==arg('expected-sha'))throw Error('Source commit mismatch: '+sha);
  const dirty=execFileSync('git',['-C',ROOT,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim();
  if(dirty)throw Error('Source checkout has modified tracked files');
  return sha;
}
async function freePort(){
  const s=createSocketServer();
  await new Promise((ok)=>s.listen(0,'127.0.0.1',ok));
  const p=s.address().port;
  await new Promise((ok)=>s.close(ok));
  return p;
}
function serveSource(files){
  return createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      const pathname=decodeURIComponent(url.pathname);
      if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><title>GLRD verified Chromium capture</title>');return;}
      const fixture={'/__glrd/source.xml':files.xml,'/__glrd/stage.json':files.staged,'/__glrd/config.json':files.config,'/__glrd/linelist.xlsx':files.linelistBytes,'/__glrd/audit-mode':files.mode}[pathname];
      let data=fixture;
      if(data===undefined){
        const location=resolve(ROOT,'.'+pathname);
        if(!location.startsWith(ROOT+sep))throw Error('Path outside checkout');
        data=await readFile(location);
      }
      const ext=extname(pathname).toLowerCase();
      const mime=ext==='.js'||ext==='.mjs'?'text/javascript'
        :ext==='.json'?'application/json'
        :ext==='.xml'?'application/xml'
        :ext==='.wasm'?'application/wasm'
        :ext==='.html'?'text/html'
        :ext==='.css'?'text/css':'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
      res.end(data);
    }catch(e){res.writeHead(404);res.end('Not found: '+String(e.message||e));}
  });
}
async function browserSocket(port,pagePort){
  for(let i=0;i<160;i++){
    try{
      const response=await fetch('http://127.0.0.1:'+port+'/json');
      if(response.ok){
        const pages=await response.json();
        const page=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl&&String(x.url).startsWith('http://127.0.0.1:'+pagePort+'/'));
        if(page)return page.webSocketDebuggerUrl;
      }
    }catch{}
    await sleep(125);
  }
  throw Error('Chromium DevTools page unavailable');
}
async function configureBrowserDownloads(debugPort,downloadPath) {
  const versionResponse=await fetch('http://127.0.0.1:'+debugPort+'/json/version');
  if(!versionResponse.ok)throw Error('Cannot fetch Chromium browser CDP endpoint');
  const info=await versionResponse.json();
  if(!info.webSocketDebuggerUrl)throw Error('Chromium browser CDP target missing');
  const socket=new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((ok,no)=>{socket.onopen=ok;socket.onerror=()=>no(Error('Browser CDP socket failed'));});
  const events=[];
  socket.addEventListener('message',event=>{
    try{const value=JSON.parse(event.data);
      if(value.method?.startsWith('Browser.download'))events.push({method:value.method,params:value.params});
    }catch{}
  });
  await new Promise((ok,no)=>{
    const handler=event=>{const val=JSON.parse(event.data);
      if(val.id!==141)return;socket.removeEventListener('message',handler);
      if(val.error)no(Error('Browser.setDownloadBehavior: '+JSON.stringify(val.error)));else ok();
    };
    socket.addEventListener('message',handler);
    socket.send(JSON.stringify({id:141,method:'Browser.setDownloadBehavior',params:{
      behavior:'allow',downloadPath,eventsEnabled:true}}));
  });
  return {socket,events};
}
async function evaluate(wsUrl,expression,downloadsDir){
  const ws=new WebSocket(wsUrl);
  await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=()=>no(Error('CDP connection failed'));});
  try{
    const send=(id,method,params={})=>new Promise((ok,no)=>{
      const handler=event=>{
        const msg=JSON.parse(event.data);
        if(msg.id!==id)return;
        ws.removeEventListener('message',handler);
        if(msg.error||msg.result?.exceptionDetails)no(Error('CDP '+method+': '+JSON.stringify(msg.error||msg.result.exceptionDetails)));
        else ok(msg.result);
      };
      ws.addEventListener('message',handler);
      ws.send(JSON.stringify({id,method,params}));
    });
    await send(20,'Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloadsDir});
    const out=await send(21,'Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    return out?.result?.value;
  }finally{ws.close();}
}
const EXPRESSION=String.raw`(async()=>{
  const sleep=ms=>new Promise(done=>setTimeout(done,ms));
  const wait=async(predicate,label,max=30000)=>{
    const start=performance.now();
    while(performance.now()-start<max){const x=predicate();if(x)return x;await sleep(100);}
    throw Error('Timeout waiting for '+label+'; UI='+document.body.textContent?.slice(-1300));
  };
  const configResponse=await fetch('/__glrd/config.json',{cache:'no-store'});
  const workbookResponse=await fetch('/__glrd/linelist.xlsx',{cache:'no-store'});
  if(!configResponse.ok||!workbookResponse.ok)throw Error('Pinned config or XLSX not served');
  const configText=await configResponse.text(),xlsxBytes=await workbookResponse.arrayBuffer();
  if(xlsxBytes.byteLength<10000)throw Error('Original XLSX input unexpectedly small');
  const stateModule=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-state.js');
  const shell=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell-strict-line.js');
  localStorage.clear();
  const state=stateModule.createXmlCiiAdaptedWorkflowState();
  state.sourceKind='xml';
  state.supportConfigJson=configText;
  const root=document.createElement('div');root.id='g3-original-xlsx-import';
  document.body.appendChild(root);
  const alerts=[];const originalAlert=window.alert;window.alert=value=>alerts.push(String(value));
  try{
    shell.renderXmlCiiAdaptedWorkflowShell(root,state);
    const phase=root.querySelector('[data-phase="source"]');
    if(!phase)throw Error('Actual standalone source phase missing');
    const sub=root.querySelector('[data-sub-tab="linelist"]');
    if(!sub)throw Error('Actual standalone line-list sub-tab missing');
    sub.click();
    const input=await wait(()=>root.querySelector('[data-master-file="lineList"]'),'lineList original workbook input');
    const files=new DataTransfer();
    files.items.add(new File([xlsxBytes],'STD-00-PX-4338-01001-0001-02.xlsx',
      {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    input.files=files.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    const outcome=await wait(()=>{
      const st=shell.createStateRef().current;
      if(st.importMastersWriteBackStatus)return st.importMastersWriteBackStatus;
      return null;
    },'import status',60000);
    const st=shell.createStateRef().current;
    const context=st.masterContext||{};
    const rawRows=context.rawRows?.lineList||[];
    const normalizedRows=context.lineRows||[];
    const row=context.rawRows?.lineList?.[0]||{};
    const actualMap=context.config?.linelist?.fieldMap||{};
    const report={
      status:outcome.startsWith('Imported')?'PASS':'IMPORT_ERROR',
      scope:'actual standalone shell original XLSX file-input upload; browser SheetJS module and default worksheet parsing',
      sourceFile:'STD-00-PX-4338-01001-0001-02.xlsx',
      xlsxInputBytes:xlsxBytes.byteLength,
      originalControlledLineRows:JSON.parse(configText).linelist.masterRows.length,
      importStatus:outcome,alerts,
      rawParsedRowCount:rawRows.length,normalizedRowCount:normalizedRows.length,
      firstRawRowKeys:Object.keys(row),
      firstRawRowSample:Object.fromEntries(Object.entries(row).slice(0,6)),
      rowMap:actualMap,
      activeSheet:context.activeSheet?.lineList||'',
      sheetNames:context.sheetNames?.lineList||[],
      sourceMetadata:context.sourceMetadata?.lineList||null,
      visibleLoadedText:root.querySelector('[data-master="lineList"]')?.textContent?.slice(0,700)||'',
    };
    return report;
  }finally{window.alert=originalAlert;}
})()`;
async function browserCapture(files){
  const server=serveSource(files);
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const pagePort=server.address().port;
  const debugPort=await freePort();
  const profile=await mkdtemp(join(tmpdir(),'glrd-chrome-capture-'));
  const exe=arg('chromium')||'google-chrome';
  let stderr='';
  const chrome=spawn(exe,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--disable-background-networking','--no-first-run','--remote-allow-origins=*',
    '--remote-debugging-port='+debugPort,'--user-data-dir='+profile,
    'http://127.0.0.1:'+pagePort+'/'],{stdio:['ignore','ignore','pipe']});
  chrome.stderr.on('data',chunk=>{if(stderr.length<16000)stderr+=String(chunk).slice(0,2000);});
  try{
    const ws=await browserSocket(debugPort,pagePort);
    const downloads=await configureBrowserDownloads(debugPort,join(OUT,'downloads'));
    const origin='http://127.0.0.1:'+pagePort;
    const absolute=EXPRESSION.replaceAll("'/__glrd/", "'"+origin+"/__glrd/")
      .replaceAll("'/tabs/", "'"+origin+"/tabs/");
    const rendered=await evaluate(ws,absolute,join(OUT,'downloads'));
    if(rendered?.status!=='PASS'||!rendered.renderedDownloadEnabled)
      throw Error('Workflow did not render enabled Download Enriched XML control');
    // CDP userGesture expires during the long async Preview/Run sequence. Trigger
    // the real Download button with a NEW user gesture after Run completion.
    const downloadExpression='(()=>{const btn=document.querySelector("#g3-standalone-workflow [data-action=\\"download-enriched\\"]");if(!btn||btn.disabled)throw Error("Download button unavailable");btn.click();return{clicked:true,label:btn.textContent?.trim()||""};})()';
    const click=await evaluate(ws,downloadExpression,join(OUT,'downloads'));
    if(!click?.clicked)throw Error('CDP user-gesture download button click not confirmed');
    const downloadDir=join(OUT,'downloads');
    let complete=false;
    for(let attempt=0;attempt<120;attempt++){
      const entries=await (await import('node:fs/promises')).readdir(downloadDir);
      const finished=entries.filter(name=>/\.(xml|inputxml)$/i.test(name));
      if(finished.length===1&&!entries.some(name=>name.endsWith('.crdownload'))){
        const file=await readFile(join(downloadDir,finished[0]));
        if(file.byteLength>1000){complete=true;break;}
      }
      await sleep(125);
    }
    if(!complete){
      // Some Chrome runner installations ignore requested downloadPath and
      // save into the profile's default Downloads directory. CDP's completed
      // Browser.downloadProgress.filePath is the authoritative actual file.
      const completed=downloads.events.filter(e=>e.method==='Browser.downloadProgress'
        &&e.params?.state==='completed'&&typeof e.params?.filePath==='string');
      const event=completed.at(-1);
      const filePath=event?.params?.filePath||'';
      if(filePath&&!filePath.includes('..')&&/\.xml$/i.test(filePath)){
        const downloaded=await readFile(filePath);
        if(downloaded.byteLength>1000){
          const name=filePath.split(/[\\/]/).at(-1);
          await writeFile(join(downloadDir,name),downloaded);
          complete=true;
        }
      }
    }
    if(!complete)throw Error('Actual browser click produced no completed downloaded XML; Browser CDP events='+JSON.stringify(downloads.events));
    try { downloads.socket.close(); } catch {}
    return {...rendered,actualDownloadClick:click,downloadEvents:downloads.events.slice(-8)};

  }catch(e){throw Error(String(e.message||e)+'; chrome stderr='+stderr.slice(-3000));}
  finally{
    chrome.kill('SIGKILL');
    await new Promise(ok=>server.close(ok));
    await sleep(400);
    try { await rm(profile,{force:true,recursive:true,maxRetries:8,retryDelay:250}); }
    catch(cleanupError) { console.warn('Nonfatal Chrome profile cleanup error: '+String(cleanupError?.message||cleanupError)); }
  }
}
async function main(){
  requireArgs();await mkdir(OUT,{recursive:true});await mkdir(join(OUT,'downloads'),{recursive:true});
  const report={schema:'glrd-original-linelist-xlsx-ui-import-v1',status:'NOT_PROVEN'};
  try{
    report.commit=assertCheckout();
    const files={xml:await readFile(arg('xml')),staged:await readFile(arg('staged')),
      config:await readFile(arg('config')),linelistBytes:await readFile(arg('linelist')),mode:'xlsx'};
    report.inputSha256={xml:hash(files.xml),staged:hash(files.staged),
      config:hash(files.config),originalXlsx:hash(files.linelistBytes)};
    const observed=await browserCapture(files);
    report.observed=observed;report.status=observed?.status==='PASS'?'PASS':'IMPORT_ERROR';
  }catch(error){report.error=String(error?.message||error);}
  await writeFile(join(OUT,'original-linelist-xlsx-ui-import.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='PASS')process.exitCode=2;
}
main().catch(e=>{console.error(e);process.exitCode=2;});
