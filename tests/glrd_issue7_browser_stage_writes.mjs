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
  const paths=['/__glrd/source.xml','/__glrd/stage.json','/__glrd/config.json'];
  const inputs=await Promise.all(paths.map(async path=>{
    const response=await fetch(path,{cache:'no-store'});
    if(!response.ok)throw Error('Fixture HTTP '+response.status+': '+path);
    return response.text();
  }));
  const xml=inputs[0],staged=inputs[1],config=JSON.parse(inputs[2]);
  const virginConfig=JSON.parse(inputs[2]);
  const wrapper=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js');
  const core=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun-core.js');
  const wall=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-bore-wall-authority.js');
  const material=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-material-authority.js');
  const rating=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-rating-authority.js');
  const mode=(await (await fetch('/__glrd/audit-mode')).text()).trim();
  const cache=mode==='candidate'
    ? (await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-per-build-cache.js')).createPreviewPerBuildCache()
    : null;
  if(!config.weight || typeof config.weight!=='object')throw Error('No weight config to audit');
  const writes=[];
  let stage='before';
  const monitored=['useNodeNameValveHints','showLengthRejectedSemanticMatches','useWeightExtrapolation'];
  for(const key of monitored){
    let value=config.weight[key];
    Object.defineProperty(config.weight,key,{
      configurable:true,enumerable:true,
      get(){return value;},
      set(next){writes.push({stage,key,prior:value,next,changed:!Object.is(value,next)});value=next;}
    });
  }
  function configSummary(){
    const wt=config.weight||{};
    const keys=Object.keys(wt).sort();
    const scalars={};
    for(const key of keys){
      const value=wt[key];
      if(value===null || ['number','boolean','string','undefined'].includes(typeof value))scalars[key]=value;
      else if(Array.isArray(value))scalars[key]={kind:'array',length:value.length};
      else if(typeof value==='object')scalars[key]={kind:'object',keys:Object.keys(value).sort()};
      else scalars[key]={kind:typeof value};
    }
    return {weight:scalars,weightMasterRows:wt.masterRows?.length||0,
      classMasterRows:config.pipingClass?.masterRows?.length||0,
      lineMasterRows:config.linelist?.masterRows?.length||0};
  }
  const stages=[];
  function execute(name,fn){
    stage=name;
    const writeStart=writes.length;
    const before=configSummary();
    const start=performance.now();
    const value=fn();
    const elapsedMs=performance.now()-start;
    const after=configSummary();
    const currentWrites=writes.slice(writeStart);
    stages.push({name,elapsedMs,writeAttempts:currentWrites.length,
      changedWriteCount:currentWrites.filter(w=>w.changed).length,
      writtenKeys:[...new Set(currentWrites.map(w=>w.key))],
      configSummaryChanged:JSON.stringify(before)!==JSON.stringify(after),
      addedWeightKeys:Object.keys(after.weight).filter(key=>!Object.hasOwn(before.weight,key)),
      weightMasterRowsAfter:after.weightMasterRows,classMasterRowsAfter:after.classMasterRows,
      lineMasterRowsAfter:after.lineMasterRows});
    return value;
  }
  const initialConfig=configSummary();
  const coreResult=execute('core+strict-line',()=>wrapper.buildStrictLineAuthorityCorePreview(xml,config,staged,{previewCache:cache}));
  const wallResult=execute('bore-wall',()=>wall.applyPreviewBoreWallAuthority({xmlText:xml,config,stagedJsonText:staged,result:coreResult}));
  const materialResult=execute('material',()=>material.applyPreviewMaterialCodeAuthority({config,result:wallResult}));
  const finalResult=execute('rating+rerank',()=>rating.applyPreviewRatingAuthority({xmlText:xml,config,stagedJsonText:staged,result:materialResult,previewCache:cache}));
  stage='done';
  const stagedPreviewText=JSON.stringify(finalResult);
  function canonicalData(value){
    if(Array.isArray(value))return value.map(canonicalData);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalData(value[key])]));
    return value;
  }
  const stagedConfigText=JSON.stringify(canonicalData(config));
  const start=performance.now();
  const originalWrapper=wrapper.xmlCiiDryRunPreview(xml,virginConfig,staged);
  const originalWrapperMs=performance.now()-start;
  const wrapperPreviewText=JSON.stringify(originalWrapper);
  const sameWithinRevision=stagedPreviewText===wrapperPreviewText;
  if(!sameWithinRevision)throw Error('Stage instrumentation changed complete Preview JSON within same revision');
  return {mode,previewText:stagedPreviewText,sameWithinRevision,
    stageTimes:stages,initialConfig,afterConfig:configSummary(),
    postConfigMatchesWrapper:stagedConfigText===JSON.stringify(canonicalData(virginConfig)),
    totalWriteAttempts:writes.length,totalChangedWrites:writes.filter(w=>w.changed).length,
    writesByStage:stages.map(s=>({stage:s.name,count:s.writeAttempts,changed:s.changedWriteCount})),
    cacheStats:cache?cache.stats:null,
    directWrapperMs:originalWrapperMs,
    branchCount:finalResult.branchRows.length,nodeRows:finalResult.nodeRows.length,
    strictAutomaticMatchesRemoved:finalResult.strictLineAuthority?.automaticMatchesRemoved||0,
    capturedConfigFieldNames:monitored};
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
  const mode=arg('audit-mode')||'';
  if(!['baseline','candidate'].includes(mode))throw Error('Provide --audit-mode baseline|candidate');
  await mkdir(OUT,{recursive:true});
  const report={schema:'glrd-issue7-observed-stage-write-contract-v1',mode,label:LABEL,status:'NOT_PROVEN'};
  try{
    const commit=assertCheckout();
    const inputs={xml:await readFile(arg('xml')),staged:await readFile(arg('staged')),
      config:await readFile(arg('config'))};
    report.sourceSha=commit;
    report.fixtureHash={xml:hash(inputs.xml),staged:hash(inputs.staged),config:hash(inputs.config)};
    const result=await browserCapture({...inputs,mode});
    if(!result||!result.sameWithinRevision)throw Error('Source wrapper/stage parity failed');
    if(!result.previewText || result.branchCount!==30 || result.nodeRows!==269)
      throw Error('Unexpected GLRD node/branch sizes');
    report.status='PASS';
    report.previewSha=hash(result.previewText);
    report.previewBytes=Buffer.byteLength(result.previewText);
    report.branchCount=result.branchCount;
    report.nodeRows=result.nodeRows;
    report.strictAutomaticMatchesRemoved=result.strictAutomaticMatchesRemoved;
    report.stages=result.stageTimes;
    report.initialConfig=result.initialConfig;
    report.afterConfig=result.afterConfig;
    report.postConfigMatchesWrapper=result.postConfigMatchesWrapper;
    report.totalWriteAttempts=result.totalWriteAttempts;
    report.totalChangedWrites=result.totalChangedWrites;
    report.writesByStage=result.writesByStage;
    report.cacheStats=result.cacheStats;
    report.directWrapperMs=result.directWrapperMs;
    await writeFile(join(OUT,LABEL+'-preview.json'),result.previewText);
  }catch(error){report.error=String(error?.message||error);}
  await writeFile(join(OUT,LABEL+'-write-audit.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='PASS')process.exitCode=2;
}
main().catch(error=>{console.error(error);process.exitCode=2;});
