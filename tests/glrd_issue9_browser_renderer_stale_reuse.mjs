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
  const files=await Promise.all(paths.map(async(path)=>{
    const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error('Missing pinned input: '+path);return r.text();
  }));
  const [xml,staged,rawConfig]=files;
  const config=JSON.parse(rawConfig);
  config.overrides={...(config.overrides||{})};
  const paddingKey='ui9-unused-'+('Z'.repeat(450));
  config.overrides.rating={[paddingKey]:'unused',...(config.overrides.rating||{})};
  const preview=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js');
  const renderer=await import('/tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer.js');
  const root=document.createElement('section');
  root.innerHTML='<div id="mc-preview-table-host"></div>';
  document.body.appendChild(root);
  const host=root.querySelector('#mc-preview-table-host');
  if(!host)throw Error('Real renderer host missing');
  const keyName='xml-cii-pv-cache-v8-dtxr';
  const args={onSaveConfig:()=>{},openOverridePopup:()=>{},
    ensureOverrides:(cfg)=>{cfg.overrides=cfg.overrides||{};return cfg.overrides;},
    stagedJsonText:staged};
  const start=performance.now();
  await renderer.xmlCiiBuildAndRenderPreview(root,xml,config,{...args,forceBuild:true});
  const firstMs=performance.now()-start;
  const oldCache=JSON.parse(localStorage.getItem(keyName)||'null');
  if(!oldCache?.data?.branchRows?.length)throw Error('Real renderer did not persist branch Preview; inspect quota or UI lifecycle');
  if(oldCache.data.branchRows.length!==30)throw Error('Unexpected branch count in persisted real Preview');
  const targetIndex=oldCache.data.branchRows.findIndex(row=>row.lineKey&&row.rating&&row.pipingClass);
  if(targetIndex<0)throw Error('No candidate branch with rating, class and line key');
  const target=oldCache.data.branchRows[targetIndex];
  const beforeRating=String(target.rating);
  const desired=beforeRating==='1500'?'900':'1500';
  const targetName=target.branchName;
  const getCell=()=>{
    const td=host.querySelector('[data-mc-edit-type="rating"][data-mc-edit-row="'+targetIndex+'"]');
    return td?.querySelector('.mc-preview-editable-val')?.textContent?.trim()||td?.textContent?.trim()||null;
  };
  const initialCell=getCell();
  if(!initialCell)throw Error('Real renderer rating cell not found in live DOM');
  const classKey='PC:'+String(target.pipingClass).toUpperCase().replace(/\\s+/g,'');
  let freshRow=null,overrideKey='',freshPreview=null;
  for(const key of [classKey,target.lineKey,targetName]){
    config.overrides.rating[key]=desired;
    const recomputed=preview.xmlCiiDryRunPreview(xml,structuredClone(config),staged);
    const changed=recomputed.branchRows.find(row=>row.branchName===targetName);
    if(changed&&String(changed.rating)!==beforeRating){
      freshRow=changed;overrideKey=key;freshPreview=recomputed;break;
    }
  }
  if(!freshRow)throw Error('Manual rating override did not affect authoritative Preview; cannot establish stale UI');
  const mutatedRating=String(freshRow.rating);
  if(mutatedRating===beforeRating)throw Error('No actual engineering difference');
  let stagedResolutions=0;
  const p0=performance.now();
  await renderer.xmlCiiBuildAndRenderPreview(root,xml,config,{
    ...args,forceBuild:false,
    resolveStagedJsonText:async()=>{stagedResolutions+=1;return {text:staged,label:'fresh-stage'};}
  });
  const cacheVisitMs=performance.now()-p0;
  const cacheCell=getCell();
  const servedOld=JSON.parse(localStorage.getItem(keyName)||'null');
  if(stagedResolutions!==0)throw Error('Renderer unexpectedly resolved stage on alleged cache hit');
  if(!host.textContent.includes('(from cache)'))throw Error('Real renderer did not label reused cache');
  if(String(servedOld.data.branchRows[targetIndex].rating)!==beforeRating)throw Error('Stored cache was unexpectedly invalidated');
  if(cacheCell!==initialCell)throw Error('Real DOM rating cell did not remain stale on cache hit');
  const p1=performance.now();
  await renderer.xmlCiiBuildAndRenderPreview(root,xml,config,{...args,forceBuild:true});
  const forcedMs=performance.now()-p1;
  const forced=JSON.parse(localStorage.getItem(keyName)||'null');
  const forcedRow=forced?.data?.branchRows?.[targetIndex];
  const forcedCell=getCell();
  if(String(forcedRow?.rating)!==mutatedRating)throw Error('ForceBuild did not refresh cached engineering rating');
  if(forcedCell===initialCell)throw Error('Real UI rating cell did not change after explicit forceBuild');
  if(!forcedCell)throw Error('Live rating cell disappeared after ForceBuild');
  return {
    status:'PASS',actualRenderer:true,scope:'real renderer browser DOM; direct config mutation, not full app import',
    reusedStaleVisibleRating:true,targetIndex,targetName,
    overrideKey,oldRating:beforeRating,correctRating:mutatedRating,
    firstDomRating:initialCell,staleDomRating:cacheCell,forcedDomRating:forcedCell,
    stagedResolutionsOnCacheHit:stagedResolutions,
    cachedBranchCount:oldCache.data.branchRows.length,
    fpBefore:oldCache.fp,fpOnCacheHit:servedOld.fp,fpAfterForce:forced.fp,
    initialStoredBytes:JSON.stringify(oldCache).length,
    baselineRenderMs:firstMs,cacheVisitMs,forcedRebuildMs:forcedMs,
    freshBranchCount:freshPreview.branchRows.length,
    cacheEntryPresent:true,location:location.origin
  };
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
  const report={schema:'glrd-issue9-chromium-renderer-stale-cache-v1',status:'NOT_PROVEN'};
  try {
    const sha=assertCheckout();
    const files={xml:await readFile(arg('xml')),staged:await readFile(arg('staged')),
      config:await readFile(arg('config')),mode:'renderer'};
    report.sha=sha;
    report.inputs={xml:hash(files.xml),staged:hash(files.staged),config:hash(files.config)};
    const result=await browserCapture(files);
    if(!result||result.status!=='PASS'||!result.actualRenderer||!result.reusedStaleVisibleRating)
      throw Error('Real renderer did not reproduce stale visible cache entry');
    report.status='PASS';
    report.evidence=result;
  }catch(error){report.error=String(error?.message||error);}
  await writeFile(join(OUT,'ui9-renderer-cache-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='PASS')process.exitCode=2;
}
main().catch(error=>{console.error(error);process.exitCode=2;});
