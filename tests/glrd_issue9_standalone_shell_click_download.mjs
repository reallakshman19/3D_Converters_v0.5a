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
      const fixture={'/__glrd/source.xml':files.xml,'/__glrd/stage.json':files.staged,'/__glrd/config.json':files.config,'/__glrd/audit-mode':files.mode}[pathname];
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
  const wait=async(predicate,label,limit=25000)=>{
    const start=performance.now();let error='';
    while(performance.now()-start<limit){try{const value=predicate();if(value)return value;}catch(e){error=String(e);}
      await sleep(80);}
    throw Error('UI timeout '+label+'; error='+error+'; visible='+document.body.textContent?.slice(-1200));
  };
  async function fixture(path){
    for(let retry=0;retry<4;retry++){try{const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.text();}
      catch(e){if(retry===3)throw Error('Fixture '+path+': '+e);await sleep(200);}}
  }
  const [xml,stage,rawConfig]=await Promise.all(['/__glrd/source.xml','/__glrd/stage.json','/__glrd/config.json'].map(fixture));
  localStorage.clear();
  const stateModule=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-state.js');
  const shell=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-workflow-shell-strict-line.js');
  const cfg=JSON.parse(rawConfig);
  const state=stateModule.createXmlCiiAdaptedWorkflowState();
  state.sourceKind='xml';
  state.masterContext={
    config:cfg,
    lineRows:cfg.linelist?.masterRows||[],pipingClassRows:cfg.pipingClass?.masterRows||[],
    materialMapRows:cfg.material?.mapRows||[],weightMasterRows:cfg.weight?.masterRows||[],
    rowCounts:{lineList:cfg.linelist?.masterRows?.length||0,pipingClass:cfg.pipingClass?.masterRows?.length||0,
      materialMap:cfg.material?.mapRows?.length||0,weight:cfg.weight?.masterRows?.length||0},
  };
  state.supportConfigJson=rawConfig;
  state.options={...state.options,outputMode:'enriched-only',createEnrichedXml:true,coordsMode:'first',kgToNewton:true};
  const root=document.createElement('div');root.id='g3-standalone-workflow';document.body.appendChild(root);
  shell.renderXmlCiiAdaptedWorkflowShell(root,state);
  if(!root.querySelector('[data-phase="source"]')||!root.querySelector('[data-field="source-file"]'))
    throw Error('Actual standalone workflow/source control not rendered');
  const steps=[];
  const choose=(selector,label)=>{
    const el=root.querySelector(selector);if(!el)throw Error('Missing live UI control '+label+' ('+selector+')');el.click();steps.push(label);return el;
  };
  const fileUpload=async(selector,text,name,mime,label)=>{
    const input=await wait(()=>root.querySelector(selector),label+' input');
    const transfer=new DataTransfer();
    transfer.items.add(new File([text],name,{type:mime}));
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    steps.push(label);
  };
  await fileUpload('[data-field="source-file"]',xml,'GLRD-1000-PSI-02.xml','application/xml','uploaded source XML via UI');
  await wait(()=>root.textContent.includes('Source: Loaded'), 'source file status');
  choose('[data-phase="json-trace"]','entered JSON Trace phase');
  await fileUpload('[data-field="staged-json-file"]',stage,'STF_2026Nov03-0839_managed_stage.json','application/json','uploaded staged JSON via UI');
  await wait(()=>root.textContent.includes('Staged JSON: Loaded'),'staged JSON status');
  choose('[data-phase="preview"]','entered Step 4 Preview phase');
  const buildButton=await wait(()=>root.querySelector('[data-mc-preview-build]'),'manual Preview button');
  buildButton.click();steps.push('clicked actual Build Preview');
  await wait(()=>root.querySelectorAll('tr.mc-preview-row').length===30,'30 rendered GLRD Preview branches',40000);
  await wait(()=>!!root.querySelector('[data-mc-dtxr-rating-fetch]'),'DTXR rating action',12000);
  const preview={branchRows:root.querySelectorAll('tr.mc-preview-row').length,
    cacheStatus:root.querySelector('#mc-preview-table-host')?.dataset.mcPreviewCacheStatus||'',
    dtxrRatingAction:!!root.querySelector('[data-mc-dtxr-rating-fetch]'),
    versionedCachePresent:!!localStorage.getItem('xml-cii-pv-cache-v8-rating-policy')};
  choose('[data-phase="weight-match"]','entered Weight Match phase');
  const weightPanel=await wait(()=>root.querySelector('[data-active-phase="weight-match"]'),'weight match panel');
  const weight={present:!!weightPanel,buttons:[...weightPanel.querySelectorAll('button')].map(x=>x.textContent?.trim()).slice(0,15)};
  choose('[data-phase="run"]','entered Finalise and Run phase');
  const runButton=await wait(()=>root.querySelector('[data-action="run"]'),'Run conversion button');
  const readiness={disabled:runButton.disabled,details:root.querySelector('[data-active-phase="run"]')?.textContent?.slice(-1800)||''};
  if(runButton.disabled)throw Error('Real Run button blocked by UI readiness: '+readiness.details);
  runButton.click();steps.push('clicked actual Finalise and Run');
  let popupSkipped=0,outputButton=null;
  const started=performance.now();let last='';
  while(performance.now()-started<105000){
    const popup=document.querySelector('[data-rigid-review-skip]');
    if(popup){popup.click();popupSkipped++;steps.push('clicked Skip Review in rigid-weight dialog');}
    const dl=root.querySelector('[data-action="download-enriched"]');
    if(dl&&!dl.disabled){outputButton=dl;break;}
    const errors=root.querySelector('[data-active-phase="run"]')?.textContent||'';
    if(errors.includes('Run error:'))last=errors.slice(-1500);
    await sleep(200);
  }
  if(!outputButton)throw Error('Real Run did not yield enabled enriched XML download; '+last+
     '; status '+root.querySelector('[data-active-phase="run"]')?.textContent?.slice(-1400));
  outputButton.click();steps.push('clicked actual Download Enriched XML');
  return{status:'PASS',scope:'real standalone workflow shell, clicked source/stage file import, phase navigation, Preview Build, Weight Match, Run, and download; masterContext is controlled fixture preloaded in memory',
    steps,preview,weight,readinessDisabled:readiness.disabled,popupSkipped,
    outputButtonLabel:outputButton.textContent?.trim(),
    renderedDownloadEnabled:true,
    cacheSnapshotStored:!!localStorage.getItem('xml-cii-pv-cache-v8-rating-policy'),
    sourceBytes:xml.length,stagedBytes:stage.length};
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
    const origin='http://127.0.0.1:'+pagePort;
    const absolute=EXPRESSION.replaceAll("'/__glrd/", "'"+origin+"/__glrd/")
      .replaceAll("'/tabs/", "'"+origin+"/tabs/");
    return await evaluate(ws,absolute,join(OUT,'downloads'))
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
  const report={schema:'glrd-g3-standalone-shell-click-to-download-v1',status:'NOT_PROVEN'};
  try{
    const sha=assertCheckout();const files={xml:await readFile(arg('xml')),staged:await readFile(arg('staged')),
      config:await readFile(arg('config')),mode:'shell-g3'};
    report.commit=sha;report.inputs={xml:hash(files.xml),staged:hash(files.staged),config:hash(files.config)};
    const observed=await browserCapture(files);
    report.observed=observed;
    if(observed?.status!=='PASS'||!observed.renderedDownloadEnabled)throw Error('UI click flow did not produce download');
    for(let retries=0;retries<100;retries++){
      const files=await (await import('node:fs/promises')).readdir(join(OUT,'downloads'));
      const done=files.filter(n=>/\.(xml|inputxml)$/i.test(n));
      if(done.length===1&&!files.some(n=>n.endsWith('.crdownload'))){
        const xml=await readFile(join(OUT,'downloads',done[0]));
        if(xml.byteLength<1000)throw Error('Downloaded XML unexpectedly small');
        report.download={name:done[0],bytes:xml.byteLength,sha256:hash(xml)};
        break;
      }
      await sleep(120);
    }
    if(!report.download)throw Error('CDP click did not yield a downloaded XML file');
    report.status='PASS';
  }catch(error){report.error=String(error?.message||error);}
  await writeFile(join(OUT,'glrd-shell-g3-download.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=2;
}
main().catch(error=>{console.error(error);process.exitCode=2;});
