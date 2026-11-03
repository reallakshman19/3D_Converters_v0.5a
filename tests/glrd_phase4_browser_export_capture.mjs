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
const MAGIC='xml-cii-2019-step4-browser-enriched-xml';
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
      const fixture={'/__glrd/source.xml':files.xml,'/__glrd/stage.json':files.staged,'/__glrd/config.json':files.config}[pathname];
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
async function evaluate(wsUrl,expression){
  const ws=new WebSocket(wsUrl);
  await new Promise((yes,no)=>{ws.onopen=yes;ws.onerror=()=>no(Error('CDP connection failed'));});
  try{
    return await new Promise((yes,no)=>{
      ws.onmessage=(event)=>{
        const message=JSON.parse(event.data);
        if(message.id!==1)return;
        if(message.error)no(Error(JSON.stringify(message.error)));
        else if(message.result?.exceptionDetails)no(Error(
          String(message.result.exceptionDetails.text)+' '+String(message.result.result?.description||'')));
        else yes(message.result?.result?.value);
      };
      ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{
        expression,returnByValue:true,awaitPromise:true,userGesture:false
      }}));
    });
  }finally{ws.close();}
}
const EXPRESSION=[
  '(async()=>{',
  "const paths=['/__glrd/source.xml','/__glrd/stage.json','/__glrd/config.json'];",
  "const input=await Promise.all(paths.map(async p=>{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw Error('Missing '+p);return r.text();}));",
  'const xml=input[0],staged=input[1],config=JSON.parse(input[2]);',
  "const {xmlCiiDryRunPreview}=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js');",
  'const p0=performance.now();',
  'const preview=xmlCiiDryRunPreview(xml,config,staged);',
  'const p1=performance.now();',
  "if(!Array.isArray(preview?.branchRows)||!Array.isArray(preview?.nodeRows))throw Error('Preview did not return branch and node rows');",
  "const {runXmlCii2019Workflow}=await import('/tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js');",
  "const job={sourceKind:'xml',sourceName:'GLRD-1000-PSI-02.xml',sourceText:xml,stagedJsonText:staged,supportConfigJson:JSON.stringify(config),options:{outputMode:'enriched-only',createEnrichedXml:true,kgToNewton:true,coordsMode:'first'}};",
  'const r0=performance.now();',
  'const run=await runXmlCii2019Workflow(job);',
  'const r1=performance.now();',
  "if(!run?.ok||typeof run.enrichedText!=='string'||!run.enrichedText.trim())throw Error('Real Run service failed: '+String(run?.error||'no enriched XML')+'; logs='+JSON.stringify(run?.logs||[]).slice(-3000));",
  'return {previewText:JSON.stringify(preview),enrichedText:run.enrichedText,',
  'previewMs:p1-p0,runMs:r1-r0,branchCount:preview.branchRows.length,nodeRows:preview.nodeRows.length,',
  "enrichedName:run.enrichedName,diagnostics:run.diagnostics,logs:(run.logs||[]).slice(-30)};",
  '})()'
].join('\n');
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
    return await evaluate(ws,EXPRESSION);
  }catch(e){throw Error(String(e.message||e)+'; chrome stderr='+stderr.slice(-3000));}
  finally{
    chrome.kill('SIGKILL');
    await new Promise(ok=>server.close(ok));
    await rm(profile,{force:true,recursive:true});
  }
}
async function main(){
  requireArgs();
  await mkdir(OUT,{recursive:true});
  const report={schema:'glrd-step4-browser-export-capture-v1',captureKind:MAGIC,label:LABEL,status:'NOT_PROVEN'};
  try{
    const commit=assertCheckout();
    const inputPaths={sourceXml:arg('xml'),stagedJson:arg('staged'),lineList:arg('linelist'),config:arg('config')};
    const buffers={};
    for(const [key,path] of Object.entries(inputPaths))buffers[key]=await readFile(path);
    const masterFiles={pipingClass:await readFile(arg('piping-class')),
      weight:await readFile(arg('weight')),materialMap:await readFile(arg('material-map'))};
    const config=JSON.parse(buffers.config.toString('utf8'));
    const inputSha256={
      sourceXml:hash(buffers.sourceXml),stagedJson:hash(buffers.stagedJson),
      lineList:hash(buffers.lineList),config:hash(buffers.config),
      masters:hash(JSON.stringify(Object.fromEntries(Object.entries(masterFiles).map(([k,v])=>[k,hash(v)])))),
      manualOverrides:hash(JSON.stringify(config.overrides||{}))
    };
    const result=await browserCapture({xml:buffers.sourceXml,staged:buffers.stagedJson,config:buffers.config});
    if(!result||typeof result.enrichedText!=='string'||typeof result.previewText!=='string')throw Error('Browser returned incomplete capture');
    const manifest={captureKind:MAGIC,commit,inputSha256,
      provenance:{runtime:'Chromium CDP',module:'tabs/xml-cii-2019-standalone/xml-cii-workflow-api.js',
        entrypoint:'runXmlCii2019Workflow',sourceKind:'xml',outputMode:'enriched-only',
        previewEntrypoint:'xmlCiiDryRunPreview',sourceHead:commit}};
    await writeFile(join(OUT,LABEL+'-enriched.xml'),result.enrichedText);
    await writeFile(join(OUT,LABEL+'-preview.json'),result.previewText);
    await writeFile(join(OUT,LABEL+'-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    report.status='PASS';
    report.commit=commit;
    report.inputSha256=inputSha256;
    report.previewSha256=hash(result.previewText);
    report.enrichedSha256=hash(result.enrichedText);
    report.enrichedBytes=Buffer.byteLength(result.enrichedText);
    report.previewMs=result.previewMs;
    report.runMs=result.runMs;
    report.branchCount=result.branchCount;
    report.nodeRows=result.nodeRows;
    report.enrichedName=result.enrichedName;
    report.diagnostics=result.diagnostics;
    report.logs=result.logs;
  }catch(e){report.error=String(e?.message||e);}
  await writeFile(join(OUT,LABEL+'-capture-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='PASS')process.exitCode=2;
}
main().catch(e=>{console.error(e);process.exitCode=2;});
