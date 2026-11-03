#!/usr/bin/env node
/** Compare genuine browser DOM-driven Step 4 Preview calculations across two checkout roots.
 * Inputs and configuration MUST be the same. This is not an enriched-XML export check.
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const arg = (name) => args.get('--' + name);
const hash = (s) => createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const SPEC = 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun.js';
const MAGIC = 'glrd-real-browser-direct-preview-v1';
function gitCheckout(root) {
  const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  if (dirty) throw Error('Checkout contains modified tracked files: ' + root);
  return sha;
}

async function freePort() {
  const server = createSocketServer();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  await new Promise((ok) => server.close(ok));
  return port;
}

function webServer(repoRoot, contents) {
  const root = resolve(repoRoot);
  return createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('<!DOCTYPE html><html><body>Step 4 Preview parity</body></html>');
        return;
      }
      const fixture = { '/__input.xml': contents.xml, '/__staged.json': contents.staged,
        '/__config.json': contents.config }[pathname];
      let data;
      if (fixture !== undefined) data = fixture;
      else {
        const path = resolve(root, '.' + pathname);
        if (!path.startsWith(root + sep)) throw new Error('path outside checkout root');
        data = await readFile(path);
      }
      const extension = extname(pathname).toLowerCase();
      const mime = extension === '.js' || extension === '.mjs' ? 'text/javascript'
        : extension === '.json' ? 'application/json' : 'application/xml';
      res.writeHead(200, { 'Content-Type': mime + ';charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(data);
    } catch (error) {
      res.writeHead(404); res.end('Module missing: ' + error.message);
    }
  });
}

async function chromiumPage(debugPort, pagePort) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch('http://127.0.0.1:' + debugPort + '/json');
      if (response.ok) {
        const pages = await response.json();
        const page = pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl &&
          item.url?.startsWith('http://127.0.0.1:' + pagePort + '/'));
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(100);
  }
  throw new Error('Chromium CDP page never became available');
}

async function evaluateCDP(socketUrl, expression) {
  const socket = new WebSocket(socketUrl);
  await new Promise((ok, bad) => {
    socket.onopen = ok;
    socket.onerror = () => bad(new Error('Chromium WebSocket connection failed'));
  });
  try {
    return await new Promise((ok, bad) => {
      socket.onmessage = (message) => {
        const obj = JSON.parse(message.data);
        if (obj.id !== 1) return;
        if (obj.error) bad(new Error(JSON.stringify(obj.error)));
        else if (obj.result?.exceptionDetails) bad(new Error(
          obj.result.exceptionDetails.text + ': ' + (obj.result.result?.description || '')));
        else ok(obj.result?.result?.value);
      };
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true,
          replMode: false, userGesture: false } }));
    });
  } finally { socket.close(); }
}

async function runBrowser(root, contents, outPath, chromiumBinary) {
  await readFile(join(root, SPEC));
  const server = webServer(root, contents);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const pagePort = server.address().port;
  const debugPort = await freePort();
  const profile = await mkdtemp(join(tmpdir(), 'glrd-step4-cdp-'));
  const browser = spawn(chromiumBinary, [
    '--headless=new', '--no-sandbox', '--no-proxy-server', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=' + debugPort, '--user-data-dir=' + profile,
    'http://127.0.0.1:' + pagePort + '/',
  ], { stdio: 'ignore' });
  try {
    const ws = await chromiumPage(debugPort, pagePort);
    const pageHref = await evaluateCDP(ws, 'location.href');
    if (!String(pageHref).startsWith('http://127.0.0.1:' + pagePort + '/')) {
      throw Error('Headless browser could not load local Preview host: ' + pageHref);
    }
    const expression = [
      '(async () => {',
      "const paths = ['/__input.xml', '/__staged.json', '/__config.json'];",
      "const inputs = await Promise.all(paths.map(async (path) => {",
      "  const res = await fetch(path, {cache:'no-store'});",
      "  if (!res.ok) throw Error('Missing fixture ' + path);",
      "  return res.text();",
      "}));",
      "const module = await import('/" + SPEC + "');",
      "const started = performance.now();",
      "const result = module.xmlCiiDryRunPreview(inputs[0], JSON.parse(inputs[2]), inputs[1]);",
      "return {elapsedMs:performance.now()-started, previewJson:JSON.stringify(result),",
      "  branchCount:result?.branchRows?.length??0, nodeCount:result?.nodeRows?.length??0};",
      '})()',
    ].join('\n');
    const result = await evaluateCDP(ws, expression);
    if (!result || typeof result.previewJson !== 'string') throw Error('Missing Preview result');
    const parsed = JSON.parse(result.previewJson);
    if (!Array.isArray(parsed.branchRows) || !Array.isArray(parsed.nodeRows)) {
      throw Error('Invalid Preview row structure');
    }
    await writeFile(outPath, JSON.stringify(parsed, null, 2) + '\n');
    return { elapsedMs: result.elapsedMs, branchCount: result.branchCount,
      nodeCount: result.nodeCount, previewSha256: hash(result.previewJson) };
  } finally {
    browser.kill('SIGKILL');
    await new Promise((ok) => server.close(ok));
    await rm(profile, { force: true, recursive: true });
  }
}

async function main() {
  const needed = ['before-root', 'after-root', 'xml', 'staged', 'config', 'out'];
  for (const n of needed) if (!arg(n)) throw Error('Missing --' + n);
  const outDir = resolve(arg('out'));
  const { mkdir } = await import('node:fs/promises');
  await mkdir(outDir, { recursive: true });
  const contents = {
    xml: await readFile(arg('xml'), 'utf8'),
    staged: await readFile(arg('staged'), 'utf8'),
    config: await readFile(arg('config'), 'utf8'),
  };
  JSON.parse(contents.config);
  const identity = Object.fromEntries(Object.entries(contents).map(([k, v]) => [k, hash(v)]));
  const results = {};
  const report = { schema: MAGIC, inputSha256: identity, status: 'NOT_PROVEN' };
  try {
    const revisions = { before: gitCheckout(resolve(arg('before-root'))),
      after: gitCheckout(resolve(arg('after-root'))) };
    report.revisions = revisions;
    if (revisions.before === revisions.after) {
      throw Error('Cannot compare the same Git commit against itself');
    }
    if (arg('expected-before-sha') && revisions.before !== arg('expected-before-sha')) {
      throw Error('Baseline checkout SHA does not match pin');
    }
    if (arg('expected-after-sha') && revisions.after !== arg('expected-after-sha')) {
      throw Error('Candidate checkout SHA does not match pin');
    }
    for (const [label, root] of [['before', arg('before-root')], ['after', arg('after-root')]]) {
      results[label] = await runBrowser(resolve(root), contents,
        join(outDir, label + '-preview.json'), arg('chromium') || 'chromium');
    }
    const before = await readFile(join(outDir, 'before-preview.json'), 'utf8');
    const after = await readFile(join(outDir, 'after-preview.json'), 'utf8');
    report.before = results.before;
    report.after = results.after;
    report.status = before === after ? 'PASS' : 'DIFF_REQUIRES_RCA';
    if (report.status !== 'PASS') {
      const at = [...before].findIndex((char, index) => char !== after[index]);
      report.firstDifferentChar = at < 0 ? Math.min(before.length, after.length) : at;
      report.beforeExcerpt = before.slice(Math.max(0, at - 80), at + 120);
      report.afterExcerpt = after.slice(Math.max(0, at - 80), at + 120);
    }
  } catch (error) {
    report.status = 'NOT_PROVEN';
    report.error = String(error?.message || error);
  }
  await writeFile(join(outDir, 'preview-parity-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'DIFF_REQUIRES_RCA' ? 1 : 2;
}

main().catch((error) => { console.error(error); process.exitCode = 2; });
