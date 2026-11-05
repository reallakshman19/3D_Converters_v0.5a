#!/usr/bin/env node
/**
 * R8 browser-level regression: clicking the real XML->CII Workflow launcher
 * opens the modal and uses a non-null singleton legacy phase bridge.
 * No private GLRD inputs are needed.
 *
 * Usage:
 * node tests/xml-cii-workflow-popup-browser.mjs --root . [--chromium PATH]
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';

const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) options.set(process.argv[i], process.argv[i + 1]);
const arg = (key) => options.get('--' + key);
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
const ROOT = resolve(arg('root') || process.cwd());

async function freePort() {
  const server = createSocketServer();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  await new Promise((ok) => server.close(ok));
  return port;
}

function serveCheckout() {
  return createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const rel = path === '/' ? './index.html' : '.' + path;
      const absolute = resolve(ROOT, rel);
      if (absolute !== ROOT && !absolute.startsWith(ROOT + sep)) throw Error('Outside checkout');
      const data = await readFile(absolute);
      const extension = extname(absolute).toLowerCase();
      const type = extension === '.html' ? 'text/html;charset=utf-8'
        : extension === '.css' ? 'text/css'
        : extension === '.js' || extension === '.mjs' ? 'text/javascript'
        : extension === '.json' ? 'application/json'
        : extension === '.wasm' ? 'application/wasm'
        : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(data);
    } catch (error) {
      res.writeHead(404);
      res.end('Missing file: ' + String(error?.message || error));
    }
  });
}

async function browserSocket(debugPort, pagePort) {
  for (let i = 0; i < 160; i++) {
    try {
      const response = await fetch('http://127.0.0.1:' + debugPort + '/json');
      if (response.ok) {
        const pages = await response.json();
        const page = pages.find((entry) => entry.type === 'page'
          && entry.webSocketDebuggerUrl
          && String(entry.url).startsWith('http://127.0.0.1:' + pagePort + '/'));
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(125);
  }
  throw Error('Chrome DevTools page did not appear');
}

async function evalOnce(wsUrl, expression) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = () => fail(Error('CDP socket failed'));
  });
  try {
    return await new Promise((ok, fail) => {
      ws.onmessage = ({ data }) => {
        const event = JSON.parse(data);
        if (event.id !== 1) return;
        if (event.error) fail(Error(JSON.stringify(event.error)));
        else if (event.result?.exceptionDetails)
          fail(Error(String(event.result.exceptionDetails.text) + ' '
            + String(event.result.result?.description || '')));
        else ok(event.result?.result?.value);
      };
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
        expression, returnByValue: true, awaitPromise: true,
      } }));
    });
  } finally { ws.close(); }
}

async function evaluate(wsUrl, expression) {
  let last;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      if (await evalOnce(wsUrl, "document.readyState === 'complete'"))
        return await evalOnce(wsUrl, expression);
    } catch (error) {
      if (!/Execution context was destroyed|Cannot find context|Context with specified id not found/i.test(String(error?.message || error)))
        throw error;
      last = error;
    }
    await sleep(300);
  }
  throw Error('Chrome execution context unavailable after 10 retries: ' + String(last?.message || last));
}

const CHECK = String.raw`(async () => {
  const waitFor = async (predicate, label) => {
    const deadline = performance.now() + 20000;
    while (!predicate()) {
      if (performance.now() >= deadline) throw Error('Timed out: ' + label);
      await new Promise((done) => setTimeout(done, 100));
    }
  };
  const host = document.createElement('section');
  host.dataset.r8PopupProbe = 'true';
  document.body.appendChild(host);
  const tab = await import('/tabs/model-converters/ModelConvertersTab.js?v=20260816-cii-v11-v14-dropdown-release-4');
  tab.renderModelConvertersTab(host, {});
  await waitFor(() => !!host.querySelector('#model-converters-xml-cii-workflow-btn'), 'workflow launcher');
  const bridgeModule = await import('/tabs/model-converters/xml-cii-workflow-bridge.js?v=20260708-workflow-bridge-align-1');
  await waitFor(() => !!bridgeModule.xmlCiiWorkflowGetBridge(), 'single shared phase bridge');
  const bridge = bridgeModule.xmlCiiWorkflowGetBridge();
  if (!bridge || typeof bridge.renderPhaseInto !== 'function')
    throw Error('Workflow popup bridge is null or lacks production rendering');
  const button = host.querySelector('#model-converters-xml-cii-workflow-btn');
  button.click();
  await waitFor(() => !!document.querySelector('[data-xml-cii-workflow-overlay="true"]'), 'workflow modal');
  const popup = document.querySelector('[data-xml-cii-workflow-overlay="true"]');
  if (!popup || !popup.textContent.includes('XML->CII(2019) Workflow'))
    throw Error('Workflow popup did not open after clicking launcher');
  return { status: 'PASS', popupOpen: true, bridgeNonNull: true,
    hasProductionRenderer: true, launcherClicked: true };
})()`;

async function main() {
  const pagePort = await freePort();
  const debugPort = await freePort();
  const server = serveCheckout();
  await new Promise((ok) => server.listen(pagePort, '127.0.0.1', ok));
  const profile = await mkdtemp(join(tmpdir(), 'glrd-r8-popup-'));
  const chrome = spawn(arg('chromium') || process.env.CHROME_PATH || 'google-chrome',
    ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--remote-allow-origins=*',
      '--remote-debugging-port=' + debugPort, '--user-data-dir=' + profile,
      'http://127.0.0.1:' + pagePort + '/'],
    { stdio: 'ignore' });
  try {
    const ws = await browserSocket(debugPort, pagePort);
    const result = await evaluate(ws, CHECK);
    if (result?.status !== 'PASS' || !result.bridgeNonNull || !result.popupOpen)
      throw Error('Popup browser contract failed: ' + JSON.stringify(result));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    chrome.kill();
    await new Promise((ok) => server.close(ok));
    await rm(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('R8 popup browser probe FAILED:', error?.stack || error);
  process.exitCode = 1;
});
