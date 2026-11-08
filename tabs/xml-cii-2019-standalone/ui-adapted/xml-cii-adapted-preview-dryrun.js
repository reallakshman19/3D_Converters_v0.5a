export * from './xml-cii-adapted-preview-dryrun-core.js';

import { xmlCiiDryRunPreview as buildCorePreview } from './xml-cii-adapted-preview-dryrun-core.js';
import { applyPreviewBoreWallAuthority } from './xml-cii-adapted-preview-bore-wall-authority.js';
import { applyPreviewMaterialCodeAuthority } from './xml-cii-adapted-preview-material-authority.js';
import { applyPreviewRatingAuthority } from './xml-cii-adapted-preview-rating-authority.js';
import { buildStagedDtxrIndex } from '../../../converters/xml-cii2019-core/dtxr-resolver.js';

const AUTOMATIC_LINE_MATCH_METHODS = new Set(['similar-lineseq', 'similar-linekey']);
const LINE_AUTHORITY_VERSION = 'strict-explicit-or-exact-v1';
function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function localName(node) {
  return text(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function childText(parent, name) {
  for (const child of [...(parent?.childNodes || [])]) {
    if (child?.nodeType === 1 && localName(child) === name) return text(child.textContent);
  }
  return '';
}

export function isAutomaticLineNumberMatchMethod(method) {
  return AUTOMATIC_LINE_MATCH_METHODS.has(text(method).toLowerCase());
}

function strictLineListConfig(config = {}) {
  return {
    ...config,
    linelist: {
      ...(config?.linelist || {}),
      masterRows: [],
    },
  };
}

function browserBranchFragments(xmlText) {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return [];
  try {
    const document = new DOMParser().parseFromString(String(xmlText ?? ''), 'application/xml');
    if (document.getElementsByTagName('parsererror').length) return [];
    const serializer = new XMLSerializer();
    return [...document.getElementsByTagName('Branch')].map((branch, index) => ({
      index,
      branchName: childText(branch, 'Branchname'),
      xmlText: `<Root>${serializer.serializeToString(branch)}</Root>`,
    }));
  } catch {
    return [];
  }
}

function blockedUnmappedRow(row) {
  return {
    ...row,
    lineKeyMethod: 'none',
    lineKeyConfidence: 0,
    lineKeyProposed: '',
    lineFrom: '',
    lineTo: '',
    lineMiss: true,
    pipingClass: '',
    pipingClassDerived: '',
    pipingClassMethod: 'none',
    pipingClassConfidence: 0,
    pipingClassNeedsReview: true,
    material: '',
    materialSource: 'none',
    materialCode: '',
    materialCodeMethod: 'none',
    materialCodeNeedsReview: true,
    rating: '',
    ratingDerived: '',
    ratingSource: 'none',
    p1: '',
    hydroPressure: '0',
    t1: '',
    t2: '',
    t3: '',
    density: '',
    p1Source: 'none',
    hydroPressureSource: 'default-zero',
    t1Source: 'none',
    t2Source: 'none',
    t3Source: 'none',
    densitySource: 'none',
    wallThickness: '',
    wallThicknessSource: 'none',
    corrosion: '',
    corrosionSource: 'none',
    automaticLineMatchRemoved: true,
    strictLineAuthorityBlocked: true,
  };
}

export function buildStrictLineAuthorityCorePreview(
  xmlText,
  config = {},
  stagedJsonText = '',
  runtime = {},
) {
  const build = typeof runtime.buildCorePreview === 'function'
    ? runtime.buildCorePreview
    : buildCorePreview;
  const fragmentBuilder = typeof runtime.branchFragments === 'function'
    ? runtime.branchFragments
    : browserBranchFragments;
  const coreResult = build(xmlText, config, stagedJsonText) || {};
  const branchRows = Array.isArray(coreResult.branchRows)
    ? coreResult.branchRows.map((row) => ({ ...row }))
    : [];
  let nodeRows = Array.isArray(coreResult.nodeRows)
    ? coreResult.nodeRows.map((row) => ({ ...row }))
    : [];
  const automaticIndexes = branchRows
    .map((row, index) => (isAutomaticLineNumberMatchMethod(row?.lineKeyMethod) ? index : -1))
    .filter((index) => index >= 0);
  if (!automaticIndexes.length) return { ...coreResult, branchRows, nodeRows };

  const fragments = fragmentBuilder(xmlText) || [];
  const strictConfig = strictLineListConfig(config);
  for (const index of automaticIndexes) {
    const original = branchRows[index];
    const fragment = fragments[index];
    let replacement = null;
    let replacementNodes = [];
    if (fragment?.xmlText) {
      const rebuilt = build(fragment.xmlText, strictConfig, stagedJsonText) || {};
      replacement = Array.isArray(rebuilt.branchRows) ? rebuilt.branchRows[0] : null;
      replacementNodes = Array.isArray(rebuilt.nodeRows) ? rebuilt.nodeRows : [];
    }
    branchRows[index] = replacement
      ? {
        ...replacement,
        lineKeyMethod: 'none',
        lineKeyConfidence: 0,
        lineKeyProposed: '',
        lineMiss: true,
        automaticLineMatchRemoved: true,
        strictLineAuthorityBlocked: false,
      }
      : blockedUnmappedRow(original);
    const branchName = text(original?.branchName);
    if (branchName) nodeRows = nodeRows.filter((row) => text(row?.branchName) !== branchName);
    if (replacementNodes.length) nodeRows.push(...replacementNodes);
  }
  return {
    ...coreResult,
    branchRows,
    nodeRows,
    strictLineAuthority: {
      version: LINE_AUTHORITY_VERSION,
      automaticMatchesRemoved: automaticIndexes.length,
    },
  };
}

// Strict line authority is enforced by the calculation below. No persisted
// Preview payload is eligible for restoration, so importing this module must
// not read or delete prior-session engineering results.

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  import('../../xml-cii-effective-class-shard-hydrator.js')
    .then(({ installXmlCiiEffectiveClassShardHydrator }) => installXmlCiiEffectiveClassShardHydrator())
    .catch((error) => console.error('Failed to install XML→CII effective-class shard hydrator:', error));
}

export function xmlCiiDryRunPreview(xmlText, config, stagedJsonText, runtime = {}) {
  const perf = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance : null;
  const totalStart = perf?.now() ?? 0;
  const layer = (name, fn) => {
    const started = perf?.now() ?? 0;
    try { return fn(); }
    finally {
      if (perf) {
        try { perf.measure('xml-cii:dryrun:layer:' + name,
          { start: started, duration: perf.now() - started }); } catch {}
      }
    }
  };
  const parse = runtime.parseDocument || ((input) => {
    if (typeof DOMParser === 'undefined') return null;
    try {
      const parsed = new DOMParser().parseFromString(String(input ?? ''), 'application/xml');
      return parsed.getElementsByTagName('parsererror').length ? null : parsed;
    } catch { return null; }
  });

  // Share unmodified source DOM between Bore/Wall and Rating; the core must
  // clone before node cleanup or the post-core authorities would lose GASK
  // and short-node evidence that they previously read from fresh XML parses.
  const sourceDocument = layer('source-parse', () => parse(xmlText));
  // Index staging once for the main core and Rating pass. Strict line-list
  // fallback fragments have a different config and must build their own index.
  const stagedIndex = sourceDocument ? layer('staged-index', () =>
    (runtime.buildStagedIndex || buildStagedDtxrIndex)(stagedJsonText || '', config)) : null;
  const strict = runtime.buildStrict || buildStrictLineAuthorityCorePreview;
  const core = runtime.buildCore || buildCorePreview;
  const coreResult = layer('strict-core', () => strict(xmlText, config, stagedJsonText, {
    buildCorePreview: (input, cfg, staged) => input === xmlText && cfg === config &&
      staged === stagedJsonText
      ? core(input, cfg, staged, { sourceDocument, stagedIndex })
      : core(input, cfg, staged),
    branchFragments: runtime.branchFragments,
  }));
  const wallResult = layer('bore-wall', () =>
    (runtime.applyWall || applyPreviewBoreWallAuthority)({
      xmlText, config, stagedJsonText, result: coreResult, sourceDocument,
    }));
  const materialResult = layer('material', () =>
    (runtime.applyMaterial || applyPreviewMaterialCodeAuthority)({
      config, result: wallResult,
    }));
  const ratingResult = layer('rating', () =>
    (runtime.applyRating || applyPreviewRatingAuthority)({
      xmlText, config, stagedJsonText, result: materialResult,
      sourceDocument, stagedIndex,
    }));
  if (perf) {
    try { perf.measure('xml-cii:dryrun:layer:total',
      { start: totalStart, duration: perf.now() - totalStart }); } catch {}
  }
  return ratingResult;
}
