#!/usr/bin/env node
/**
 * R8 browser-level regression: clicking the real XML->CII Workflow launcher
 * opens the modal and uses a non-null singleton legacy phase bridge.
 * No private GLRD inputs are needed.
 *
 * Usage:
 * node tests/xml-cii-workflow-popup-browser.mjs --root . [--chromium PATH]
 * Optional BM2 L3 budget gate (file paths are never committed):
 *   --xml BM2.xml --staged BM2.json --config BM2-config.json
 *   --max-build-ms 15000 --max-fetch-ms 30000 --max-storage-bytes 1000000
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
let bm2Files = null;

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
      const fixture = bm2Files && {
        '/__r10/source.xml': bm2Files.xml,
        '/__r10/staged.json': bm2Files.staged,
        '/__r10/config.json': bm2Files.config,
      }[path];
      if (fixture) {
        res.writeHead(200, { 'Content-Type': path.endsWith('.xml') ? 'application/xml' : 'application/json',
          'Cache-Control': 'no-store' });
        res.end(fixture); return;
      }
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

// The CDP target can retain its app URL in /json while Runtime.evaluate
// still runs in its initial about:blank context. readyState alone is NOT a
// navigation barrier; only a loaded document at the expected app origin is.
export async function waitForAppOrigin(readDocument, expectedOrigin, {
  attempts = 200, pause = sleep, delayMs = 150,
} = {}) {
  let last = '';
  for (let i = 0; i < attempts; i += 1) {
    try {
      const state = await readDocument();
      if (state?.origin === expectedOrigin && state?.ready === 'complete'
        && state?.hasBody && state?.href?.startsWith(expectedOrigin + '/')) return state;
      last = JSON.stringify(state);
    } catch (error) {
      if (!/Execution context was destroyed|Cannot find context|Context with specified id not found/i.test(String(error?.message || error)))
        throw error;
      last = String(error?.message || error);
    }
    await pause(delayMs);
  }
  throw Error('Chrome app origin never became ready: ' + expectedOrigin + ' (last: ' + last + ')');
}

async function evaluate(wsUrl, expression, expectedOrigin) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForAppOrigin(async () => JSON.parse(await evalOnce(wsUrl,
      'JSON.stringify({origin:location.origin,href:location.href,ready:document.readyState,hasBody:Boolean(document.body)})')),
      expectedOrigin);
    try {
      return await evalOnce(wsUrl, expression);
    } catch (error) {
      if (!/Execution context was destroyed|Cannot find context|Context with specified id not found/i.test(String(error?.message || error)))
        throw error;
    }
  }
  throw Error('Chrome navigated during evaluation 3 times');
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
  // CDP Runtime.evaluate has no module base URL. Use an absolute URL
  // anchored to the actual page, after document completion.
  const tab = await import(new URL('/tabs/model-converters/ModelConvertersTab.js?v=20260816-cii-v11-v14-dropdown-release-4', location.href).href);
  tab.renderModelConvertersTab(host, {});
  // A fresh Chrome profile defaults to rvm_to_rev. Select the real XML->CII
  // converter before looking for its workflow launcher.
  const converterSelect = host.querySelector('#model-converters-select');
  if (!converterSelect) throw Error('Model converter selector missing');
  converterSelect.value = 'xml_to_cii';
  converterSelect.dispatchEvent(new Event('change', { bubbles: true }));
  if (converterSelect.value !== 'xml_to_cii') throw Error('Failed to select xml_to_cii');
  await waitFor(() => !!host.querySelector('#model-converters-xml-cii-workflow-btn'), 'workflow launcher');
  const bridgeModule = await import(new URL('/tabs/model-converters/xml-cii-workflow-bridge.js?v=20260708-workflow-bridge-align-1', location.href).href);
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


// Optional real-popup BM2 budget gate. Fetches the Owner's private inputs only
// from the ephemeral local HTTP server; no fixture is committed to GitHub.
const BM2_CHECK = String.raw`(async () => {
  const wait = async (predicate, name, maxMs = 30000) => {
    const start = performance.now();
    while (!predicate()) {
      if (performance.now() - start > maxMs)
        throw Error(name + ' timed out after ' + Math.round(performance.now() - start) + ' ms');
      await new Promise(ok => setTimeout(ok, 100));
    }
  };
  const [xml, stage, config] = await Promise.all([
    '/__r10/source.xml', '/__r10/staged.json', '/__r10/config.json',
  ].map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw Error('BM2 input missing: ' + url);
    return response.text();
  }));
  const bridgeModule = await import(new URL('/tabs/model-converters/xml-cii-workflow-bridge.js?v=20260708-workflow-bridge-align-1', location.href).href);
  const bridge = bridgeModule.xmlCiiWorkflowGetBridge();
  if (!bridge || typeof bridge.importPopupConfigText !== 'function')
    throw Error('BM2 check requires the real popup config-import bridge');
  const violations = [];
  const writes = [];
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    const bytes = new TextEncoder().encode(String(value)).byteLength;
    writes.push({ key: String(key), bytes });
    if (bytes > __MAX_STORAGE_BYTES__)
      violations.push({ key: String(key), bytes });
    return originalSetItem.call(this, key, value);
  };
  const phase = {};
  try {
    bridge.importPopupConfigText(config);
    const xmlInput = document.querySelector('#model-converters-primary-input');
    const stageInput = document.querySelector('#model-converters-secondary-input');
    if (!xmlInput || !stageInput) throw Error('Model Converters file inputs unavailable');
    const setInputFile = (input, name, contents, kind) => {
      const dt = new DataTransfer();
      dt.items.add(new File([contents], name, { type: kind }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setInputFile(xmlInput, 'BM2.xml', xml, 'application/xml');
    setInputFile(stageInput, 'BM2.json', stage, 'application/json');
    const phaseTab = document.querySelector('[data-modal-tab="preview"]');
    if (!phaseTab) throw Error('Popup Step 4 Preview tab missing');
    const visitStart = performance.now();
    phaseTab.click();
    // First visit may await shard hydration. Do not mistake that for a
    // Build/Fetch budget failure: report it separately in firstVisitMs.
    await wait(() => !!document.querySelector('#mc-preview-table-host [data-mc-preview-build]'),
      'popup Step 4', __MAX_FIRST_VISIT_MS__);
    phase.firstVisitMs = performance.now() - visitStart;
    const host = document.querySelector('#mc-preview-table-host');
    if (!host) throw Error('V7 Preview host missing');
    const build = host.querySelector('[data-mc-preview-build]');
    const buildStart = performance.now();
    build.click();
    await wait(() => host.dataset.mcPreviewBuildCompleted === 'true'
      && !!host.querySelector('table[data-resizable-table="branch-preview"]'),
      'popup Build', __MAX_BUILD_MS__);
    phase.buildMs = performance.now() - buildStart;
    if (phase.buildMs > __MAX_BUILD_MS__)
      throw Error('BM2 popup Build exceeded budget: ' + Math.round(phase.buildMs) + ' ms');
    // Optional G4 profile collects all five action spans in the same fresh
    // Chrome profile. The ordinary strict gate still performs only Build/Fetch.
    if (__REPORT_ALL__) {
      const rebuild = async (metric) => {
        const button = host.querySelector('[data-mc-preview-build]');
        if (!button) throw Error('Missing Rebuild button for ' + metric);
        const started = performance.now();
        host.dataset.mcPreviewBuildCompleted = 'false';
        button.click();
        await wait(() => host.dataset.mcPreviewBuildCompleted === 'true'
          && !!host.querySelector('table[data-resizable-table="branch-preview"]'),
          metric, __MAX_REBUILD_MS__);
        phase[metric] = performance.now() - started;
      };
      // Idle is measured separately from the CPU budget of the next click.
      await new Promise(ok => setTimeout(ok, 1500));
      await rebuild('buildAfterIdleMs');
      await rebuild('rebuildMs');
    }
    const fetchButton = host.querySelector('[data-mc-dtxr-rating-fetch]');
    if (!fetchButton) throw Error('Fetch Rating as per DTXR button missing');
    const fetchStart = performance.now();
    fetchButton.click();
    await wait(() => !!host.querySelector('[data-mc-dtxr-rating-notice]')
      && host.dataset.mcPreviewBuildCompleted === 'true', 'Fetch Rating', __MAX_FETCH_MS__);
    phase.fetchRatingMs = performance.now() - fetchStart;
    if (phase.fetchRatingMs > __MAX_FETCH_MS__)
      throw Error('BM2 Fetch Rating exceeded budget: ' + Math.round(phase.fetchRatingMs) + ' ms');
    if (__CAPTURE_OUTPUT__) {
      // Capture the *actual* converter output, via its production Download
      // button; hashing an input, synthetic XML, or Preview rows is not valid.
      const run = document.querySelector('#model-converters-run');
      if (!run) throw Error('Main XML->CII Run button missing');
      const created = [];
      const realCreate = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => { created.push(blob); return realCreate(blob); };
      try {
        await new Promise(ok => setTimeout(ok, 100));
        run.click();
        await wait(() => !!document.querySelector('#model-converters-output [data-output-index]'),
          'BM2 Run output', __MAX_RUN_MS__);
        const downloads = [...document.querySelectorAll('#model-converters-output [data-output-index]')];
        const enriched = downloads.find(button => /enrich.*\.xml$/i.test(
          button.closest('.model-converters-output-row')?.querySelector('strong')?.textContent || ''
        )) || downloads.find(button => /\.xml$/i.test(
          button.closest('.model-converters-output-row')?.querySelector('strong')?.textContent || ''
        ));
        if (!enriched) throw Error('No XML output to hash; output list: ' +
          downloads.map(button => button.closest('.model-converters-output-row')?.querySelector('strong')?.textContent).join(', '));
        enriched.click();
        const blob = created.at(-1);
        if (!blob) throw Error('Output Download did not supply a Blob');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        phase.outputBytes = bytes.byteLength;
        phase.outputSha256 = [...new Uint8Array(digest)]
          .map(byte => byte.toString(16).padStart(2, '0')).join('');
        phase.outputFile = enriched.closest('.model-converters-output-row')?.querySelector('strong')?.textContent || '';
      } finally {
        URL.createObjectURL = realCreate;
      }
    }
  } finally {
    Storage.prototype.setItem = originalSetItem;
  }
  if (violations.length)
    throw Error('Popup Build/Fetch storage write > 1MB: ' + JSON.stringify(violations));
  if (typeof phase.buildMs !== 'number' || typeof phase.fetchRatingMs !== 'number')
    throw Error('BM2 actions were not completed');
  const measures = performance.getEntriesByType('measure')
    .filter(entry => entry.name.startsWith('xml-cii:'))
    .map(entry => ({ name: entry.name, durationMs: entry.duration }));
  return { status: 'PASS', bm2: true, phase, maxWriteBytes: Math.max(0, ...writes.map(x=>x.bytes)),
    storageWrites: writes, popupPerformanceMeasures: measures };
})()`;

async function main() {
  const inputs = ['xml', 'staged', 'config'];
  const present = inputs.filter(key => !!arg(key));
  if (present.length && present.length !== inputs.length)
    throw Error('BM2 mode requires --xml, --staged and --config together');
  if (present.length === inputs.length) bm2Files = Object.fromEntries(
    await Promise.all(inputs.map(async (key) => [key, await readFile(resolve(arg(key)))])));
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
    const origin = 'http://127.0.0.1:' + pagePort;
    const result = await evaluate(ws, CHECK, origin);
    if (result?.status !== 'PASS' || !result.bridgeNonNull || !result.popupOpen)
      throw Error('Popup browser contract failed: ' + JSON.stringify(result));
    if (bm2Files) {
      const budget = BM2_CHECK.replaceAll('__REPORT_ALL__', String(arg('report-all') === 'true'))
        .replaceAll('__CAPTURE_OUTPUT__', String(arg('capture-output') === 'true'))
        .replaceAll('__MAX_REBUILD_MS__', String(Number(arg('max-rebuild-ms') || 120000)))
        .replaceAll('__MAX_RUN_MS__', String(Number(arg('max-run-ms') || 420000)))
        .replaceAll('__MAX_BUILD_MS__', String(Number(arg('max-build-ms') || 15000)))
        .replaceAll('__MAX_FETCH_MS__', String(Number(arg('max-fetch-ms') || 30000)))
        .replaceAll('__MAX_FIRST_VISIT_MS__', String(Number(arg('max-first-visit-ms') || 420000)))
        .replaceAll('__MAX_STORAGE_BYTES__', String(Number(arg('max-storage-bytes') || 1000000)));
      result.bm2Budget = await evaluate(ws, budget, origin);
      if (result.bm2Budget?.status !== 'PASS') throw Error('BM2 budget check did not pass');
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    chrome.kill();
    // Windows keeps the Chrome profile locked while the child is exiting.
    // Wait for process exit before removing its User Data Directory.
    await new Promise((done) => {
      const timeout = setTimeout(done, 5000);
      const settled = () => { clearTimeout(timeout); done(); };
      if (chrome.exitCode !== null || chrome.signalCode !== null) return settled();
      chrome.once('exit', settled);
      chrome.once('error', settled);
    });
    await new Promise((ok) => {
      server.close(ok);
      server.closeAllConnections?.();
    });
    let cleaned = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await rm(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 300 });
        cleaned = true;
        break;
      } catch (error) {
        if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error?.code)) throw error;
        await sleep(250 * (attempt + 1));
      }
    }
    if (!cleaned) console.warn('Chrome profile cleanup deferred (file lock):', profile);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    console.error('R13 popup browser probe FAILED:', error?.stack || error);
    process.exitCode = 1;
  });
}
