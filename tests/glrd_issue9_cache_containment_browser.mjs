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
import {dirname, extname, join, resolve, sep} from 'node:path';

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
async function evaluateOnce(wsUrl,expression){
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
// A page target can appear before Chrome has installed its final execution
// context. Both probes use this identical bounded readiness/retry helper.
async function evaluate(wsUrl,expression){
  let lastError=null;
  for(let attempt=1;attempt<=10;attempt++){
    try{
      const ready=await evaluateOnce(wsUrl,"document.readyState === 'complete'");
      if(ready===true)return await evaluateOnce(wsUrl,expression);
      lastError=new Error('document.readyState is not complete');
    }catch(error){
      if(!/Execution context was destroyed|Cannot find context|Context with specified id not found/i.test(String(error?.message||error)))
        throw error;
      lastError=error;
    }
    if(attempt<10)await sleep(300);
  }
  throw Error('Chromium execution context unavailable after 10 attempts (300 ms retry): '+String(lastError?.message||lastError));
}
const EXPRESSION=String.raw`(async()=>{
  const paths=['/__glrd/source.xml','/__glrd/stage.json','/__glrd/config.json'];
  async function fetchLocal(path){
    let last;
    for(let attempt=0;attempt<4;attempt++){
      try {
        const response=await fetch(path,{cache:'no-store'});
        if(!response.ok)throw Error('HTTP '+response.status+' '+path);
        return await response.text();
      }catch(error){last=error;if(attempt<3)await new Promise(ok=>setTimeout(ok,100*(attempt+1)));}
    }
    throw Error('Pinned fixture unavailable: '+path+'; '+String(last));
  }
  const [xml,staged,rawConfig]=await Promise.all(paths.map(fetchLocal));
  const config=JSON.parse(rawConfig);
  config.overrides={...(config.overrides||{})};
  const paddingKey='ui9-unused-'+('Z'.repeat(450));
  config.overrides.rating={[paddingKey]:'unused',...(config.overrides.rating||{})};
  const prev=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js');
  const renderer=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js');
  const cache=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-cache-v7.js');
  const rating=await import('/converters/xml-cii2019-core/preview-rating-snapshot.js');
  const root=document.createElement('section');
  root.innerHTML='<div id="mc-preview-table-host"></div>';
  document.body.appendChild(root);
  const host=root.querySelector('#mc-preview-table-host');
  const keyName=cache.XML_CII_PREVIEW_LEGACY_CACHE_KEY;
  const envelopeKey=cache.XML_CII_PREVIEW_CACHE_KEY;
  const assertNoPersistedPreview=(phase)=>{
    if(localStorage.getItem(keyName)!==null||localStorage.getItem(envelopeKey)!==null)
      throw Error('Obsolete Preview cache key present after '+phase);
  };
  // Pre-seed both retired keys before Build: a stale prior session must be
  // discarded without ever being promoted to current engineering authority.
  const priorSession=JSON.stringify({fp:'pv5|stale-prior-session',
    data:{branchRows:[{branchName:'/STALE/B1',rating:'900'}],nodeRows:[]},ts:1});
  localStorage.setItem(keyName,priorSession);
  localStorage.setItem(envelopeKey,priorSession);
  let stagedResolvers=0;
  let committedResult=null;
  let publicationCount=0;
  const assertCurrentRating=(phase,branchName,expectedRating)=>{
    const rows=committedResult?.branchRows;
    const snapshot=rating.readXmlCiiPreviewRatingSnapshot();
    const row=rows?.find(item=>item.branchName===branchName);
    const record=snapshot.records.find(item=>item.branchName===branchName);
    if(!Array.isArray(rows)||!rows.length||!snapshot.records.length
      ||!row||!record||String(row.rating)!==String(expectedRating)
      ||String(record.rating)!==String(expectedRating))
      throw Error('Current in-memory Preview Rating mismatch after '+phase);
    return snapshot.records.length;
  };
  const options={
    onSaveConfig:()=>{},
    openOverridePopup:()=>{},
    ensureOverrides:c=>{c.overrides=c.overrides||{};return c.overrides;},
    resolveStagedJsonText:async()=>{stagedResolvers++;return {text:staged,label:'pinned-stage'};},
    stagedJsonText:staged,
    onPreviewCommitted:result=>{committedResult=result;publicationCount++;},
  };
  const initial=prev.xmlCiiDryRunPreview(xml,structuredClone(config),staged);
  const expectedBranchCount=initial.branchRows.length;
  if(!expectedBranchCount)throw Error('Source has no calculable Preview branch rows');
  const start=performance.now();
  await renderer.xmlCiiBuildAndRenderPreview(root,xml,config,{...options,forceBuild:true});
  const firstMs=performance.now()-start;
  assertNoPersistedPreview('initial Build');
  if(publicationCount!==1||committedResult?.branchRows?.length!==expectedBranchCount)
    throw Error('Preview branch count differs from source: expected '+expectedBranchCount
      +', published '+String(committedResult?.branchRows?.length));
  const index=initial.branchRows.findIndex(row=>row.lineKey&&row.rating&&row.pipingClass);
  if(index<0)throw Error('No rated GLRD branch available');
  const target=initial.branchRows[index];
  const getCell=()=>{
    const td=host.querySelector('[data-mc-edit-type="rating"][data-mc-edit-row="'+index+'"]');
    return td?.querySelector('.mc-preview-editable-val')?.textContent?.trim()||td?.textContent?.trim()||null;
  };
  const before=getCell();
  if(before!==String(target.rating))throw Error('Initial UI rating does not match direct Preview: '+before+' vs '+target.rating);
  assertCurrentRating('initial Build',target.branchName,target.rating);
  // A legacy cache entry is deliberately planted to prove the new renderer
  // cannot silently hydrate stale branch rows, regardless of its old key.
  const oldEntry=JSON.stringify({fp:'pv5|legacy-unverified-input-key',
    data:{branchRows:initial.branchRows,nodeRows:initial.nodeRows},ts:Date.now()});
  localStorage.setItem(keyName,oldEntry);
  localStorage.setItem(envelopeKey,oldEntry);
  const classKey='PC:'+String(target.pipingClass).toUpperCase().replace(/\s+/g,'');
  const desired=String(target.rating)==='1500'?'900':'1500';
  config.overrides.rating[classKey]=desired;
  const direct=prev.xmlCiiDryRunPreview(xml,structuredClone(config),staged);
  const corrected=direct.branchRows.find(row=>row.branchName===target.branchName);
  if(!corrected||String(corrected.rating)===String(target.rating))throw Error('Controlled override did not change authoritative rating');
  const beforeIdleResolutions=stagedResolvers;
  const p0=performance.now();
  await renderer.xmlCiiBuildAndRenderPreview(root,xml,config,{...options,forceBuild:false});
  const idleMs=performance.now()-p0;
  if(getCell()!==null)throw Error('Stale visible rating retained after fail-closed idle navigation');
  if(!host.querySelector('[data-mc-preview-build]'))throw Error('Fail-closed state lost Build Preview button');
  if(!/Preview has not been built|Click Build Preview/.test(host.textContent))
    throw Error('Renderer did not show safe manual Preview idle state');
  // The v7 wrapper resolves source authority on entry, even for manual idle.
  const afterIdleResolutions=stagedResolvers;
  if(afterIdleResolutions<=beforeIdleResolutions)
    throw Error('V7 wrapper did not resolve the staged source at idle entry');
  assertNoPersistedPreview('manual idle');
  if(rating.readXmlCiiPreviewRatingSnapshot().records.length!==0)
    throw Error('Manual idle incorrectly exposed a stale Preview rating');
  const button=host.querySelector('[data-mc-preview-build]');
  const beforeManualCommit=publicationCount;
  if(!button)throw Error('Manual Build Preview button missing');
  button.click();
  const clickTime=performance.now();
  await new Promise((resolve,reject)=>{
    function poll(){
      if(getCell()===String(corrected.rating)
        &&publicationCount>beforeManualCommit&&host.dataset.mcPreviewBuildCompleted==='true'){
        resolve();return;
      }
      if(performance.now()-clickTime>25000){reject(Error('Actual Build button failed to update rating; visible='+getCell()));return;}
      setTimeout(poll,75);
    }
    poll();
  });
  if(stagedResolvers<=afterIdleResolutions)
    throw Error('Build button did not resolve pinned staged source');
  assertNoPersistedPreview('manual Build');
  const finalRatingSnapshotCount=assertCurrentRating('manual Build',target.branchName,corrected.rating);
  // The Run phase exports result.enrichedText (output-run.js:87-90).
  // Use its actual standalone workflow service; Preview itself only builds rows.
  const runService=await import('/tabs/xml-cii-2019-standalone/xml-cii-workflow-service.js');
  const enrichedRun=await runService.runXmlCii2019WorkflowService({
    sourceKind:'xml',sourceName:'glrd-probe.xml',
    sourceText:xml,stagedJsonText:staged,
    supportConfigJson:JSON.stringify(config),
    options:{outputMode:'enriched-only',analyzeTopology:false,generateTopoFix:false,useTopoFixForCii:false}
  });
  if(!enrichedRun?.ok||typeof enrichedRun.enrichedText!=='string'||!enrichedRun.enrichedText.trim())
    throw Error('Production Run service has no enriched XML output: '+String(enrichedRun?.error||'enrichedText missing'));
  const enrichedXmlText=enrichedRun.enrichedText;
  return {
    status:'PASS',scope:'actual Chromium renderer DOM and button-click; not full app import/navigation',
    enrichedXmlText,
    realRendererInvoked:true,
    legacyCacheIgnored:true,failClosedIdle:true,manualBuildButtonWorked:true,
    noPersistedPreviewCacheAfterBuild:true,inMemoryRatingPublished:true,
    finalRatingSnapshotCount,
    actualSourceCommit:location.origin,targetIndex:index,
    branchName:target.branchName,overrideKey:classKey,
    oldRating:String(target.rating),newRating:String(corrected.rating),
    beforeDomRating:before,idleDomRating:getCell()===String(corrected.rating)?null:getCell(),
    finalDomRating:getCell(),resolutionsBeforeIdle:beforeIdleResolutions,
    resolutionsAfterIdle:afterIdleResolutions,
    resolutionsAfterBuild:stagedResolvers,initialRendererMs:firstMs,
    idleVisitMs:idleMs,manualBuildMs:performance.now()-clickTime,
    branchCount:direct.branchRows.length,expectedBranchCount,
    oldCacheEntryLength:oldEntry.length
  };
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
  requireArgs();
  await mkdir(OUT,{recursive:true});
  const report={schema:'glrd-issue9-cache-fail-closed-browser-v1',status:'NOT_PROVEN'};
  try {
    const sha=assertCheckout();
    const files={xml:await readFile(arg('xml')),staged:await readFile(arg('staged')),
      config:await readFile(arg('config')),mode:'safe-preview'};
    report.commit=sha;
    report.inputs={xml:hash(files.xml),staged:hash(files.staged),config:hash(files.config)};
    const observed=await browserCapture(files);
  const enrichedXmlText=observed?.enrichedXmlText;
  if(typeof enrichedXmlText!=='string'||!enrichedXmlText.trim())
    throw Error('No enriched XML was published by the production Run service');
  const enrichedBytes=Buffer.from(enrichedXmlText,'utf8');
  delete observed.enrichedXmlText;
  observed.enrichedXmlBytes=enrichedBytes.byteLength;
  observed.enrichedXmlSha256=hash(enrichedBytes);
  if(arg('out-xml')){
    const destination=resolve(arg('out-xml'));
    await mkdir(dirname(destination),{recursive:true});
    await writeFile(destination,enrichedBytes);
    observed.enrichedXmlFile=destination;
  }
    const result=observed;
    if(!result||result.status!=='PASS'||!result.legacyCacheIgnored||!result.manualBuildButtonWorked)
      throw Error('Real browser did not validate fail-closed Preview');
    report.status='PASS';
    report.observations=result;
  }catch(error){report.error=String(error?.message||error);}
  await writeFile(join(OUT,'issue9-cache-containment-browser-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='PASS')process.exitCode=2;
}
main().catch(error=>{console.error(error);process.exitCode=2;});
