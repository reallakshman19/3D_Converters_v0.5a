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
  const fetchInput=async path=>{
    for(let i=0;i<5;i++){try{const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return await r.text();}
      catch(e){if(i===4)throw Error('Pinned input '+path+': '+e);await new Promise(ok=>setTimeout(ok,150*(i+1)));}}
  };
  const [xml,stage,configSource]=await Promise.all(['/__glrd/source.xml','/__glrd/stage.json','/__glrd/config.json'].map(fetchInput));
  const cfg=JSON.parse(configSource);
  const v7=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js');
  const cache=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-cache-v7.js');
  const rating=await import('/converters/xml-cii2019-core/preview-rating-snapshot.js');
  if(!v7.xmlCiiBuildAndRenderPreview||!cache.XML_CII_PREVIEW_CACHE_KEY)throw Error('Wrong workbench Preview modules');
  localStorage.clear();
  const root=document.createElement('section');root.innerHTML=v7.xmlCiiRenderPreviewPhase(
    new File([xml],'GLRD-1000-PSI-02.xml',{type:'application/xml'}),cfg);
  document.body.appendChild(root);
  const host=root.querySelector('#mc-preview-table-host');
  if(!host)throw Error('Workbench Preview host missing');
  let committedResult=null;
  let publicationCount=0;
  const options={onSaveConfig:()=>{},ensureOverrides:c=>{c.overrides=c.overrides||{};return c.overrides;},
    openOverridePopup:()=>{},stagedJsonText:stage,stagedSourceLabel:'pinned-GLRD',
    resolveStagedJsonText:async()=>({text:stage,label:'pinned-GLRD'}),
    onPreviewCommitted:result=>{committedResult=result;publicationCount+=1;}};
  const assertNoEnvelope=(action)=>{
    if(localStorage.getItem(cache.XML_CII_PREVIEW_CACHE_KEY)!==null)
      throw Error('R5 violation: persisted v7 Preview envelope present after '+action);
  };
  const readCurrentRatingRows=(action)=>{
    const rows=committedResult?.branchRows;
    const snapshot=rating.readXmlCiiPreviewRatingSnapshot();
    if(!Array.isArray(rows)||!rows.length||!snapshot.records.length)
      throw Error('No current in-memory Preview Rating after '+action);
    const current=rows.find(row=>String(row.rating??'').trim());
    const matched=snapshot.records.find(record=>record.branchName===current?.branchName);
    if(!current||!matched||String(matched.rating)!==String(current.rating))
      throw Error('Current Preview Rating differs from the direct in-memory publication after '+action);
    return snapshot.records.length;
  };
  const waitFor=async(predicate,action)=>{
    const startWaiting=performance.now();
    while(!predicate()){
      if(performance.now()-startWaiting>25000)throw Error('Timed out waiting for '+action);
      await new Promise(ok=>setTimeout(ok,75));
    }
  };
  const start=performance.now();
  await v7.xmlCiiBuildAndRenderPreview(root,xml,cfg,{...options,forceBuild:true});
  await new Promise(ok=>setTimeout(ok,250));
  const first= {ms:performance.now()-start,rendered:!!host.querySelector('table[data-resizable-table="branch-preview"]'),
    branchRows:host.querySelectorAll('tr.mc-preview-row').length,status:host.dataset.mcPreviewCacheStatus||'',
    envelopePresent:!!localStorage.getItem(cache.XML_CII_PREVIEW_CACHE_KEY),
    legacyPresent:!!localStorage.getItem(cache.XML_CII_PREVIEW_LEGACY_CACHE_KEY),
    ratingSnapshotCount:rating.readXmlCiiPreviewRatingSnapshot().records.length,
    dtxrRatingButton:!!host.querySelector('[data-mc-dtxr-rating-fetch]'),
    cacheEvidenceText:host.querySelector('[data-mc-preview-cache-evidence]')?.textContent?.slice(0,500)||''};
  assertNoEnvelope('initial Build');
  if(publicationCount!==1)throw Error('Initial Build did not publish exactly one direct result');
  readCurrentRatingRows('initial Build');
  const startRevisit=performance.now();
  await v7.xmlCiiBuildAndRenderPreview(root,xml,cfg,{...options,forceBuild:false});
  await new Promise(ok=>setTimeout(ok,250));
  const revisit={ms:performance.now()-startRevisit,
    rendered:!!host.querySelector('table[data-resizable-table="branch-preview"]'),
    branchRows:host.querySelectorAll('tr.mc-preview-row').length,
    status:host.dataset.mcPreviewCacheStatus||'',
    envelopePresent:!!localStorage.getItem(cache.XML_CII_PREVIEW_CACHE_KEY),
    legacyPresent:!!localStorage.getItem(cache.XML_CII_PREVIEW_LEGACY_CACHE_KEY),
    ratingSnapshotCount:rating.readXmlCiiPreviewRatingSnapshot().records.length,
    manualBuildButton:!!host.querySelector('[data-mc-preview-build]'),
    dtxrRatingButton:!!host.querySelector('[data-mc-dtxr-rating-fetch]'),
    cacheEvidenceText:host.querySelector('[data-mc-preview-cache-evidence]')?.textContent?.slice(0,500)||''};
  assertNoEnvelope('manual idle');
  if(revisit.ratingSnapshotCount!==0)throw Error('Manual idle published an obsolete Rating snapshot');

  // Exercise the actual manual Build and Rebuild actions: the v7 wrapper's
  // direct callback, not localStorage, is the current engineering authority.
  const buildButton=host.querySelector('[data-mc-preview-build]');
  if(!buildButton)throw Error('Manual Build Preview button missing');
  const beforeManualBuild=publicationCount;
  buildButton.click();
  await waitFor(()=>publicationCount>beforeManualBuild&&host.dataset.mcPreviewBuildCompleted==='true','manual Build');
  assertNoEnvelope('manual Build');
  const manualBuild={rendered:!!host.querySelector('table[data-resizable-table="branch-preview"]'),
    branchRows:host.querySelectorAll('tr.mc-preview-row').length,
    ratingSnapshotCount:readCurrentRatingRows('manual Build'),
    envelopePresent:!!localStorage.getItem(cache.XML_CII_PREVIEW_CACHE_KEY)};

  const rebuildButton=host.querySelector('[data-mc-preview-build]');
  if(!rebuildButton)throw Error('Rebuild Preview button missing');
  const beforeRebuild=publicationCount;
  rebuildButton.click();
  await waitFor(()=>publicationCount>beforeRebuild&&host.dataset.mcPreviewBuildCompleted==='true','Rebuild');
  assertNoEnvelope('Rebuild');
  const rebuild={rendered:!!host.querySelector('table[data-resizable-table="branch-preview"]'),
    branchRows:host.querySelectorAll('tr.mc-preview-row').length,
    ratingSnapshotCount:readCurrentRatingRows('Rebuild'),
    envelopePresent:!!localStorage.getItem(cache.XML_CII_PREVIEW_CACHE_KEY)};

  const fetchButton=host.querySelector('[data-mc-dtxr-rating-fetch]');
  if(!fetchButton)throw Error('Fetch Rating as per DTXR action missing');
  const beforeFetch=publicationCount;
  fetchButton.click();
  await waitFor(()=>!!host.querySelector('[data-mc-dtxr-rating-notice]')
    &&host.dataset.mcPreviewBuildCompleted==='true','Fetch Rating');
  assertNoEnvelope('Fetch Rating');
  const fetchRating={actionPresent:true,rebuilt:publicationCount>beforeFetch,
    branchRows:committedResult?.branchRows?.length||0,
    ratingSnapshotCount:readCurrentRatingRows('Fetch Rating'),
    envelopePresent:!!localStorage.getItem(cache.XML_CII_PREVIEW_CACHE_KEY)};

  return{status:'PASS',module:'real-workbench-v7-preview-renderer',first,revisit,
    manualBuild,rebuild,fetchRating,
    inMemoryPayloadRows:committedResult?.branchRows?.length||0,
    configHasRows:{linelist:cfg.linelist?.masterRows?.length,pipingClass:cfg.pipingClass?.masterRows?.length,
      weight:cfg.weight?.masterRows?.length},version:cache.XML_CII_PREVIEW_CACHE_SCHEMA};
})()`;
async function browserCapture(files){
  const server=serveSource(files);
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const pagePort=server.address().port;
  const debugPort=await freePort();
  const profile=await mkdtemp(join(tmpdir(),'glrd-chrome-capture-'));
  const exe=arg('chromium')||process.env.CHROME_PATH||'google-chrome';
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
  requireArgs();await mkdir(OUT,{recursive:true});
  const report={schema:'glrd-real-workbench-v7-wrapper-integration-v1',status:'NOT_PROVEN'};
  try{
    const sha=assertCheckout();const files={xml:await readFile(arg('xml')),staged:await readFile(arg('staged')),
      config:await readFile(arg('config')),mode:'v7-wrapper'};
    const observed=await browserCapture(files);
    if(observed?.status!=='PASS'||observed?.module!=='real-workbench-v7-preview-renderer'||!observed.first.rendered)
      throw Error('Real v7 wrapper did not render GLRD');
    report.status='PASS';report.commit=sha;
    report.inputs={xml:hash(files.xml),staged:hash(files.staged),config:hash(files.config)};
    report.observed=observed;
  }catch(error){report.error=String(error?.message||error);}
  const name=LABEL+'-v7-wrapper-audit.json';
  await writeFile(join(OUT,name),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=2;
}
main().catch(error=>{console.error(error);process.exitCode=2;});
