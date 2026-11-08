import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { prepareStoredStatePayload } from '../tabs/model-converters/core/config-store.js';

async function runRealWorkerMessage(data, prepare = prepareStoredStatePayload) {
  const raw = await readFile(
    new URL('../tabs/model-converters/core/config-save-worker.js', import.meta.url), 'utf8');
  // Execute the actual browser Worker module body against a deterministic
  // Worker-global facade (not a source-regex approximation).
  const body = raw.replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*/m, '');
  let onMessage;
  const outputs = [];
  const scope = {
    addEventListener(type, listener) {
      assert.equal(type, 'message');
      onMessage = listener;
    },
    postMessage(value) { outputs.push(value); },
  };
  new Function('self', 'prepareStoredStatePayload', body)(scope, prepare);
  assert.equal(typeof onMessage, 'function');
  onMessage({ data });
  return outputs;
}

test('J3/W4/W5: actual Worker posts once with compact config and exact storage payload', async () => {
  const config = { linelist: { masterRows: [{ lineNo: 'BM2-L1' }] },
    overrides: { rating: { B1: '900' } } };
  const opts = { generation: 17, config, compact: true, selectedConverter: 'xml_to_cii',
    defaultsByConverter: { xml_to_cii: { supportConfigJson: '' } } };
  const posts = await runRealWorkerMessage(opts);
  assert.equal(posts.length, 1, 'W4: Worker must post completion, not silently finish');
  assert.equal(posts[0].generation, 17);
  assert.equal(posts[0].fullJson, JSON.stringify(config),
    'W5: Fetch must serialize compact, not pretty JSON');
  assert.deepEqual(JSON.parse(posts[0].fullJson), config);
  const prepared = prepareStoredStatePayload('xml_to_cii',
    { xml_to_cii: { supportConfigJson: JSON.stringify(config) } });
  assert.equal(posts[0].payload, prepared.payload);
  assert.equal(posts[0].error, undefined);
  // Mutants: no post, pretty-print, or synthetic output change these assertions.
});

test('J3/W4: actual Worker reports preparation errors rather than silently hanging', async () => {
  const opts = { generation: 18, config: {}, compact: true,
    selectedConverter: 'xml_to_cii', defaultsByConverter: {} };
  const posts = await runRealWorkerMessage(opts, () => { throw Error('payload prepare failed'); });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].generation, 18);
  assert.match(posts[0].error, /payload prepare failed/);
});
