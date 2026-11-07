import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Preview exposes the explicit DTXR Rating fetch action', async () => {
  const source = await read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-renderer-v7.js');
  assert.match(source, /Fetch Rating as per DTXR/);
  assert.match(source, /applyPreviewDtxrRatingOverrides/);
  assert.doesNotMatch(source, /fetch-rebuild:start/);
  assert.match(source, /xml-cii:popup:fetch-click-to-notice/);
});

test('run review does not auto-populate Rating from DTXR or defaults', async () => {
  const source = await read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-run-workflow.js');
  assert.match(source, /standaloneRunReviewRatingFromConfig/);
  assert.doesNotMatch(source, /return[^;]*row\?\.dtxrRating/s);
  assert.doesNotMatch(source, /return[^;]*defaultRating/s);
  assert.match(source, /DTXR Rating is comparison evidence only/);
});

test('Weight Match consumes Preview Rating and exposes explicit DTXR mode', async () => {
  const source = await read('tabs/model-converters/converters/xmltocii2019_helper/weight-match-renderer.js');
  assert.match(source, /xmlCiiWeightMatchRatingFromPreview/);
  assert.match(source, /readXmlCiiPreviewRatingSnapshot/);
  assert.match(source, /resolveXmlCiiWeightMatchRating/);
  assert.match(source, /Use Rating as per DTXR/);
  assert.match(source, /Use Rating shown in Preview/);
  assert.match(source, /Weight Match does not derive Rating again/);
  assert.doesNotMatch(source, /xmlCiiWeightMatchRatingFromConfig/);
  assert.doesNotMatch(source, /processRating\(/);
  assert.doesNotMatch(source, /overrideValue\(config,\s*'rating'/);
  assert.match(source, /xml-cii-wm-cache-v2-preview-rating/);
});

test('standalone Weight Match routes only through the shared renderer authority', async () => {
  const phaseSource = await read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-phase-panels.js');
  const routeSource = await read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-weight-match-v2.js');
  assert.match(phaseSource, /renderAdaptedWeightMatchPanelV2/);
  assert.doesNotMatch(phaseSource, /renderAdaptedWeightMatchPanel\s+from\s+'\.\/xml-cii-adapted-weight-match\.js'/);
  assert.match(routeSource, /loadParentWeightMatchModules/);
  assert.match(routeSource, /xmlCiiRenderWeightMatchPhase/);
  assert.match(routeSource, /shared Preview Rating authority could not load/);
  assert.doesNotMatch(routeSource, /bindAdaptedWeightMatchPanel/);
});

test('Piping Class import declares separate NPS and Bore mm columns', async () => {
  const source = await read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-fields-config.js');
  assert.match(source, /name:\s*'nps',\s*label:\s*'NPS \(in\)'/);
  assert.match(source, /name:\s*'convertedBore',\s*label:\s*'Bore \(mm\)'/);
});

test('Preview cache schema publishes and clears Weight Match Rating snapshots atomically', async () => {
  const source = await read('tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-cache-v7.js');
  assert.match(source, /xml-cii-preview-cache\/v8-rating-policy/);
  assert.match(source, /xml-cii-pv-cache-v8-dtxr/);
  assert.match(source, /publishXmlCiiPreviewRatingSnapshot/);
  assert.match(source, /clearXmlCiiPreviewRatingSnapshot/);
  assert.match(source, /xml-cii-wm-cache-v2-preview-rating/);
});
