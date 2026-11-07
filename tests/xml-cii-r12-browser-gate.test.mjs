import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('R12 E4 CDP dynamic imports are absolute page URLs, not unresolved /tabs specifiers', async () => {
  const code = await readFile(new URL('./xml-cii-workflow-popup-browser.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /await import\('\/tabs\//);
  assert.match(code, /import\(new URL\('\/tabs\/model-converters\/ModelConvertersTab\.js[^']*', location\.href\)\.href\)/);
  assert.match(code, /import\(new URL\('\/tabs\/model-converters\/xml-cii-workflow-bridge\.js[^']*', location\.href\)\.href\)/);
});

test('R12 E4 first visit is measured separately; Build and Fetch enforce their own deadlines', async () => {
  const code = await readFile(new URL('./xml-cii-workflow-popup-browser.mjs', import.meta.url), 'utf8');
  assert.match(code, /'popup Step 4', __MAX_FIRST_VISIT_MS__/);
  assert.match(code, /'popup Build', __MAX_BUILD_MS__/);
  assert.match(code, /'Fetch Rating', __MAX_FETCH_MS__/);
  assert.match(code, /replaceAll\('__MAX_FIRST_VISIT_MS__'/);
});
