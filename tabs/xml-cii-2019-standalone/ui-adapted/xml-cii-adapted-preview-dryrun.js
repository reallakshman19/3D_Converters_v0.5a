export * from './xml-cii-adapted-preview-dryrun-core.js';

import { xmlCiiDryRunPreview as buildCorePreview } from './xml-cii-adapted-preview-dryrun-core.js';
import { applyPreviewBoreWallAuthority } from './xml-cii-adapted-preview-bore-wall-authority.js';
import { applyPreviewMaterialCodeAuthority } from './xml-cii-adapted-preview-material-authority.js';
import { applyPreviewRatingAuthority } from './xml-cii-adapted-preview-rating-authority.js';
import { createPreviewPerBuildCache } from './xml-cii-adapted-preview-per-build-cache.js';

const AUTOMATIC_LINE_MATCH_METHODS = new Set(['similar-lineseq', 'similar-linekey']);
const LINE_AUTHORITY_VERSION = 'strict-explicit-or-exact-v1';
const LINE_AUTHORITY_MARKER_KEY = 'xml-cii-preview-line-authority-version';
const PREVIEW_CACHE_KEYS = Object.freeze([
  'xml-cii-pv-cache-v8-rating-policy',
  'xml-cii-pv-cache-v8-dtxr',
  'xml-cii-pv-cache-v7',
  'xml-cii-pv-cache-v6',
]);

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
  const coreResult = build(xmlText, config, stagedJsonText, runtime.previewCache) || {};
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
      const rebuilt = build(fragment.xmlText, strictConfig, stagedJsonText, runtime.previewCache) || {};
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

try {
  if (typeof localStorage !== 'undefined'
    && localStorage.getItem(LINE_AUTHORITY_MARKER_KEY) !== LINE_AUTHORITY_VERSION) {
    for (const key of PREVIEW_CACHE_KEYS) localStorage.removeItem(key);
    localStorage.setItem(LINE_AUTHORITY_MARKER_KEY, LINE_AUTHORITY_VERSION);
  }
} catch {}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  import('../../xml-cii-effective-class-shard-hydrator.js')
    .then(({ installXmlCiiEffectiveClassShardHydrator }) => installXmlCiiEffectiveClassShardHydrator())
    .catch((error) => console.error('Failed to install XML→CII effective-class shard hydrator:', error));
}

export function xmlCiiDryRunPreview(xmlText, config, stagedJsonText) {
  const previewCache = createPreviewPerBuildCache();
  const coreResult = buildStrictLineAuthorityCorePreview(xmlText, config, stagedJsonText, { previewCache });
  const wallResult = applyPreviewBoreWallAuthority({
    xmlText,
    config,
    stagedJsonText,
    result: coreResult,
  });
  const materialResult = applyPreviewMaterialCodeAuthority({
    config,
    result: wallResult,
  });
  return applyPreviewRatingAuthority({
    xmlText,
    config,
    stagedJsonText,
    result: materialResult,
    previewCache,
  });
}
