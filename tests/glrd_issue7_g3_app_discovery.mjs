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
      if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(join(ROOT,'index.html')));return;}
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
const EXPRESSION=String.raw`(async()=>{
  const pause=(ms)=>new Promise(done=>setTimeout(done,ms));
  async function waitFor(fn,ms=20000) {
    const started=performance.now();
    while(performance.now()-started<ms){
      const candidate=fn();
      if(candidate)return candidate;
      await pause(120);
    }
    return null;
  }
  const result={status:'NOT_PROVEN',basis:'real index.html entrypoint with UI DOM interactions',uiSteps:[],appErrors:[],warnings:[]};
  const errListener=e=>result.appErrors.push(String(e.message||e.error?.message||e));
  const rejectListener=e=>result.appErrors.push('unhandledrejection: '+String(e.reason?.message||e.reason));
  window.addEventListener('error',errListener);
  window.addEventListener('unhandledrejection',rejectListener);
  // The app initially loads Model Converters asynchronously. Wait for that
  // renderer to settle before navigating; otherwise an in-flight default
  // render can replace the tab during this test, obscuring the G3 route.
  const initialDefault=await waitFor(()=>document.querySelector('.app-content .model-converters-root')||document.querySelector('.app-content .tab-error'),60000);
  result.initialDefaultLoaded=!!initialDefault;
  result.initialDefaultError=initialDefault?.classList?.contains('tab-error')?initialDefault.innerText?.slice(0,450):'';
  await pause(550);
  const nav=await waitFor(()=>document.querySelector('.app-nav button.app-tab[data-tab="xml-cii-2019-standalone"]'),20000);
  result.initialBodyText=(document.body?.innerText||'').slice(0,950);
  result.appShellPresent=!!document.querySelector('.app-shell');
  result.navTabs=[...document.querySelectorAll('.app-nav button.app-tab')].map(el=>({id:el.dataset.tab,title:el.textContent.trim()}));
  if(!nav){
    result.blocker='Standalone app did not mount the real XML CII tab';
    result.loadingText=document.querySelector('#app-loading-overlay')?.innerText||'';
    return result;
  }
  nav.click();
  result.uiSteps.push('clicked live Application tabs > XML→CII 2019 Standalone');
  const shell=await waitFor(()=>document.querySelector('.app-content .xml-cii-standalone-root'),22000);
  if(!shell){
    result.blocker='Standalone app tab failed to render';
    result.tabError=document.querySelector('.app-content .tab-error')?.innerText||'';
    result.activeTab=document.querySelector('.app-content')?.dataset.activeTab;
    return result;
  }
  result.activeTab=document.querySelector('.app-content')?.dataset.activeTab;
  result.liveShell=true;
  await pause(700);
  result.initialTabStillActive=document.querySelector('.app-content')?.dataset.activeTab==='xml-cii-2019-standalone' && !!document.querySelector('.app-content .xml-cii-standalone-root');
  result.phaseButtons=[...shell.querySelectorAll('[data-phase]')].map(el=>({id:el.dataset.phase,label:el.textContent.trim().slice(0,100)}));
  result.sourceControls=[...shell.querySelectorAll('input[type=file]')].map(el=>({field:el.dataset.field,master:el.dataset.masterFile,mode:el.dataset.modeAFile,accept:el.accept}));
  result.sourcePhaseText=shell.querySelector('.xml-cii-main-workspace')?.innerText?.slice(0,1700)||'';
  const sourceInput=shell.querySelector('input[type=file][data-field="source-file"]');
  if(sourceInput) {
    const response=await fetch('/__glrd/source.xml',{cache:'no-store'});
    if(!response.ok){result.blocker='GLRD source fixture HTTP '+response.status;return result;}
    const file=new File([await response.arrayBuffer()],'GLRD-1000-PSI-02.xml',{type:'application/xml'});
    const transfer=new DataTransfer();transfer.items.add(file);
    sourceInput.files=transfer.files;
    sourceInput.dispatchEvent(new Event('change',{bubbles:true}));
    result.uiSteps.push('imported pinned GLRD-1000-PSI-02.xml via actual file input');
    await pause(1600);
    result.afterSourceImportText=document.querySelector('.app-content .xml-cii-main-workspace')?.innerText?.slice(0,1250)||'';
    result.afterSourceInput=(document.querySelector('.app-content input[data-field="source-file"]')?.files?.[0]?.name||'');
    result.phaseButtonsAfterSource=[...document.querySelectorAll('.app-content [data-phase]')].map(x=>x.dataset.phase);
    result.shellAfterSource=!!document.querySelector('.app-content .xml-cii-standalone-root');
    result.sourceImportAttempted=true;
  }else{
    result.sourceImportAttempted=false;
    result.sourceImportBlocker='Mode A entry does not expose standard source-file input on initial pane';
  }
  const phase=document.querySelector('.app-content [data-phase="json-trace"]');
  if(phase) {
    phase.click();
    result.uiSteps.push('clicked real phase 3 Resolver / JSON Trace');
    await pause(700);
    result.jsonTraceControls=[...document.querySelectorAll('.app-content input[type=file]')].map(el=>({field:el.dataset.field,accept:el.accept}));
    result.phaseButtonsAfterJsonTrace=[...document.querySelectorAll('.app-content [data-phase]')].map(x=>x.dataset.phase);
    result.shellAfterJsonTrace=!!document.querySelector('.app-content .xml-cii-standalone-root');
    result.jsonTracePageText=document.querySelector('.app-content .xml-cii-main-workspace')?.innerText?.slice(0,1900)||'';
    const stagedInput=document.querySelector('.app-content input[type=file][data-mode-a-staged-json-all],.app-content input[type=file][data-field="staged-json-file"]');
    if(stagedInput){
      const response=await fetch('/__glrd/stage.json',{cache:'no-store'});
      if(response.ok){
        const file=new File([await response.arrayBuffer()],'STF_2026Nov03-0839_managed_stage.json',{type:'application/json'});
        const dt=new DataTransfer();dt.items.add(file);
        stagedInput.files=dt.files;
        stagedInput.dispatchEvent(new Event('change',{bubbles:true}));
        result.uiSteps.push('imported pinned managed stage JSON via real file input');
        await pause(800);
        result.stagedImportAttempted=true;
        result.stagedAfterImportText=document.querySelector('.app-content .xml-cii-main-workspace')?.innerText?.slice(0,600)||'';
        result.phaseButtonsAfterStaged=[...document.querySelectorAll('.app-content [data-phase]')].map(x=>x.dataset.phase);
      }else{result.stagedImportBlocker='Staged fixture HTTP '+response.status;}
    }else{result.stagedImportBlocker='No staged-json-file input in active phase';}
  }
  const preview=await waitFor(()=>document.querySelector('.app-content [data-phase="preview"]'),7000);
  result.phaseButtonsBeforePreview=[...document.querySelectorAll('.app-content [data-phase]')].map(x=>x.dataset.phase);
  if(preview){
    preview.click();
    result.uiSteps.push('clicked real phase 4 Preview');
    await pause(900);
    result.previewText=document.querySelector('.app-content .xml-cii-main-workspace')?.innerText?.slice(0,2000)||'';
    result.previewButtonLabels=[...document.querySelectorAll('.app-content button')].map(x=>x.innerText.trim()).filter(x=>/Preview|Build|Map|Review|Refresh/i.test(x)).slice(0,32);
    result.previewHostCount=document.querySelectorAll('.app-content #mc-preview-table-host').length;
    result.phasePreviewReached=true;
  }else {
    result.previewNavigationBlocker='Preview phase button not present after file and staged import';
    result.finalAppText=(document.querySelector('.app-content')?.innerText||'').slice(0,1650);
  }
  result.status='ENTRYPOINT_AND_PHASES_OBSERVED';
  result.finalActivePhase=document.querySelector('.app-content [data-active-phase]')?.dataset.activePhase||'';
  result.fetchedInputs={source:!!sourceInput,staged:!!result.stagedImportAttempted};
  return result;
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
    return await evaluate(ws,absolute);
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
  requireArgs();
  await mkdir(OUT,{recursive:true});
  const result={schema:'glrd-g3-real-app-entrypoint-discovery-v1',status:'NOT_PROVEN'};
  try{
    result.sourceSha=assertCheckout();
    const files={xml:await readFile(arg('xml')),staged:await readFile(arg('staged')),
      config:await readFile(arg('config')),mode:'g3-app'};
    result.inputs={xml:hash(files.xml),staged:hash(files.staged),config:hash(files.config)};
    result.observation=await browserCapture(files);
    if(!result.observation?.liveShell)throw Error(result.observation?.blocker||'Real workbench not reached');
    result.status='APP_ENTRYPOINT_OBSERVED';
  }catch(error){result.error=String(error?.message||error);}
  await writeFile(join(OUT,'g3-real-workbench-discovery.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
  if(result.status!=='APP_ENTRYPOINT_OBSERVED')process.exitCode=2;
}
main().catch(error=>{console.error(error);process.exitCode=2;});
