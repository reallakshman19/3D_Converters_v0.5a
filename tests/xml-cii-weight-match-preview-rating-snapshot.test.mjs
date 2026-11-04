import assert from 'node:assert/strict';
import test from 'node:test';

import {
  XML_CII_PREVIEW_CACHE_ENVELOPE_KEY,
  buildXmlCiiDisplayedPreviewRatingSnapshot,
  buildXmlCiiPreviewRatingSnapshot,
  clearXmlCiiPreviewRatingSnapshot,
  publishXmlCiiPreviewRatingSnapshot,
  readXmlCiiPreviewRatingSnapshot,
  resolveXmlCiiPreviewRating,
  resolveXmlCiiWeightMatchRating,
} from '../converters/xml-cii2019-core/preview-rating-snapshot.js';

test('Weight Match uses exact Preview branch Rating instead of node Rating', () => {
  const snapshot = buildXmlCiiPreviewRatingSnapshot([
    { branchName: '/GLRD/B1', lineKey: 'P4110003', pipingClass: '93833', sizeMm: 100, rating: '900', ratingSource: 'piping-class-master' },
  ]);
  const result = resolveXmlCiiWeightMatchRating({
    branchName: '/GLRD/B1',
    lineKey: 'P4110003',
    rating: '150',
    dtxr: 'WELDING NECK FLANGE SCH 40S 900#',
  }, { mode: 'preview', snapshot });
  assert.equal(result.rating, '900');
  assert.equal(result.source, 'preview-branch');
  assert.equal(result.dtxrRating, '900');
});

test('overridden piping-class Preview Rating wins despite stale Weight Match class and node Rating', () => {
  const snapshot = buildXmlCiiPreviewRatingSnapshot([
    {
      branchName: '/GLRD-1000-4"-P4110003-93833-01/B1',
      lineKey: 'P4110003',
      pipingClass: '93842',
      sizeMm: 100,
      rating: '900',
      ratingSource: 'override',
    },
  ]);
  const result = resolveXmlCiiWeightMatchRating({
    branchName: '=/GLRD-1000-4"-P4110003-93833-01/B1',
    lineKey: 'P4110003',
    resolvedPipingClass: '13421',
    boreMm: 100,
    rating: '150',
  }, { mode: 'preview', snapshot });
  assert.equal(result.rating, '900');
  assert.equal(result.source, 'preview-branch');
});

test('line plus bore selects the displayed Preview Rating when branch serialization differs', () => {
  const snapshot = buildXmlCiiPreviewRatingSnapshot([
    { branchName: '/A/B1', lineKey: 'L1', pipingClass: 'PC150', sizeMm: 100, rating: '150' },
    { branchName: '/A/B2', lineKey: 'L1', pipingClass: 'PC900', sizeMm: 50, rating: '900' },
  ]);
  const result = resolveXmlCiiPreviewRating({
    branchName: '/SERIALIZED/UNKNOWN',
    lineKey: ' l1 ',
    boreMm: 50,
    resolvedPipingClass: 'STALE',
  }, snapshot);
  assert.equal(result.rating, '900');
  assert.equal(result.source, 'preview-line-bore');
});

test('Preview line-key fallback is allowed only when unambiguous', () => {
  const unambiguous = buildXmlCiiPreviewRatingSnapshot([
    { branchName: '/A/B1', lineKey: 'L1', rating: '900' },
    { branchName: '/A/B2', lineKey: 'L1', rating: '900' },
  ]);
  assert.equal(resolveXmlCiiPreviewRating({ lineKey: 'L1' }, unambiguous).rating, '900');

  const ambiguous = buildXmlCiiPreviewRatingSnapshot([
    { branchName: '/A/B1', lineKey: 'L1', rating: '150' },
    { branchName: '/A/B2', lineKey: 'L1', rating: '900' },
  ]);
  assert.equal(resolveXmlCiiPreviewRating({ lineKey: 'L1' }, ambiguous).rating, '');
});

test('displayed Preview table is captured as the Rating authority', () => {
  const valueCell = (value) => ({
    querySelector: (selector) => selector === '.mc-preview-editable-val' ? { textContent: value } : null,
  });
  const branchCell = {
    dataset: { mcEditKey: '/LIVE/B1' },
    querySelector: (selector) => selector === '.mc-preview-editable-val' ? { textContent: 'LIVE1' } : null,
  };
  const row = {
    children: [{}, {}, {}, {}, { textContent: '100mm' }],
    querySelector: (selector) => {
      if (selector === '[data-mc-edit-type="branchLineKey"]') return branchCell;
      if (selector === '[data-mc-edit-type="pipingClass"]') return valueCell('93842');
      if (selector === '[data-mc-edit-type="rating"]') return valueCell('900');
      return null;
    },
  };
  const root = { querySelectorAll: () => [row] };
  const snapshot = buildXmlCiiDisplayedPreviewRatingSnapshot(root);
  assert.equal(snapshot.records[0].rating, '900');
  assert.equal(snapshot.records[0].pipingClass, '93842');
  assert.equal(snapshot.records[0].sizeMm, '100');
});

test('live Preview publication outranks an older deterministic envelope', () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  try {
    clearXmlCiiPreviewRatingSnapshot();
    values.set(XML_CII_PREVIEW_CACHE_ENVELOPE_KEY, JSON.stringify({
      authority: { digest: 'sha256:old-preview-150' },
      legacyPayload: { data: { branchRows: [{ branchName: '/LIVE/B1', lineKey: 'LIVE1', rating: '150' }] } },
    }));
    publishXmlCiiPreviewRatingSnapshot([
      { branchName: '/LIVE/B1', lineKey: 'LIVE1', pipingClass: '93842', sizeMm: 100, rating: '900' },
    ], { authorityDigest: 'preview-displayed-live' });
    const snapshot = readXmlCiiPreviewRatingSnapshot();
    assert.equal(resolveXmlCiiPreviewRating({ branchName: '/LIVE/B1' }, snapshot).rating, '900');
  } finally {
    clearXmlCiiPreviewRatingSnapshot();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test('persisted Preview cache envelope never supplies current Weight Match Rating', () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  try {
    clearXmlCiiPreviewRatingSnapshot();
    values.set(XML_CII_PREVIEW_CACHE_ENVELOPE_KEY, JSON.stringify({
      authority: { digest: 'sha256:preview-900' },
      legacyPayload: {
        data: {
          branchRows: [{
            branchName: '/E/B1',
            lineKey: 'E1',
            pipingClass: '93842',
            sizeMm: 100,
            rating: '900',
          }],
        },
      },
    }));
    const snapshot = readXmlCiiPreviewRatingSnapshot();
    assert.equal(snapshot.records.length, 0);
    assert.equal(resolveXmlCiiPreviewRating({ branchName: '/E/B1' }, snapshot).rating, '');
  } finally {
    clearXmlCiiPreviewRatingSnapshot();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test('DTXR Rating is used only in explicit DTXR mode', () => {
  const snapshot = buildXmlCiiPreviewRatingSnapshot([
    { branchName: '/A/B1', lineKey: 'L1', rating: '150' },
  ]);
  const row = { branchName: '/A/B1', lineKey: 'L1', dtxr: 'BALL VALVE TRUNN FB FLGD 900#' };
  assert.equal(resolveXmlCiiWeightMatchRating(row, { mode: 'preview', snapshot }).rating, '150');
  const dtxr = resolveXmlCiiWeightMatchRating(row, { mode: 'dtxr', snapshot });
  assert.equal(dtxr.rating, '900');
  assert.equal(dtxr.source, 'weight-match-dtxr-explicit');
});

test('missing Preview Rating remains unresolved rather than re-derived', () => {
  const snapshot = buildXmlCiiPreviewRatingSnapshot([]);
  const result = resolveXmlCiiWeightMatchRating({
    branchName: '/A/B1',
    lineKey: 'L1',
    rating: '150',
    resolvedPipingClass: '93834',
    dtxr: 'VALVE 900#',
  }, { mode: 'preview', snapshot });
  assert.equal(result.rating, '');
  assert.equal(result.source, 'preview-rating-missing');
});
