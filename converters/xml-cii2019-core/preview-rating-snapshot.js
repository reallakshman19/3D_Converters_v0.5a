import { extractXmlCiiRatingFromDtxr } from './dtxr-rating-resolver.js';

export const XML_CII_PREVIEW_RATING_SNAPSHOT_SCHEMA = 'xml-cii-preview-rating-snapshot/v2';
export const XML_CII_PREVIEW_RATING_SNAPSHOT_KEY = 'xml-cii-preview-rating-snapshot-v2';
export const XML_CII_PREVIEW_RATING_SNAPSHOT_LEGACY_KEY = 'xml-cii-preview-rating-snapshot-v1';
export const XML_CII_PREVIEW_CACHE_ENVELOPE_KEY = 'xml-cii-pv-cache-v8-rating-policy';
export const XML_CII_PREVIEW_CACHE_BRIDGE_KEY = 'xml-cii-pv-cache-v8-dtxr';
export const XML_CII_LEGACY_PREVIEW_CACHE_KEY = 'xml-cii-pv-cache-v2';

const LIVE_SNAPSHOT_KEY = '__xmlCiiPreviewRatingSnapshotV2';
const OBSERVER_KEY = '__xmlCiiPreviewRatingObserverV2';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function displayText(value) {
  const valueText = text(value);
  return valueText === '—' || valueText === '-' ? '' : valueText;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeXmlCiiPreviewBranchIdentity(value) {
  return text(value)
    .toUpperCase()
    .replace(/^=+/, '')
    .replace(/\\/g, '/')
    .replace(/\s+/g, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '');
}

export function normalizeXmlCiiPreviewLineKey(value) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

export function normalizeXmlCiiPreviewPipingClass(value) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

export function normalizeXmlCiiPreviewBore(value) {
  const match = text(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  const numeric = match ? Number(match[0]) : NaN;
  return Number.isFinite(numeric) && numeric > 0
    ? Number(numeric.toPrecision(9)).toString()
    : '';
}

function normalizeRecord(row, sequence) {
  const branchName = text(row?.branchName);
  const lineKey = text(row?.lineKey);
  const pipingClass = text(
    row?.pipingClass
    || row?.resolvedPipingClass
    || row?.requestedPipingClass
    || row?.pipingClassDerived,
  );
  const sizeMm = normalizeXmlCiiPreviewBore(
    row?.sizeMm ?? row?.boreMm ?? row?.size ?? row?.bore,
  );
  const rating = displayText(row?.rating);
  if (!branchName && !lineKey) return null;
  return {
    sequence,
    branchName,
    branchIdentity: normalizeXmlCiiPreviewBranchIdentity(branchName),
    lineKey,
    lineKeyIdentity: normalizeXmlCiiPreviewLineKey(lineKey),
    pipingClass,
    pipingClassIdentity: normalizeXmlCiiPreviewPipingClass(pipingClass),
    sizeMm,
    rating,
    ratingSource: text(row?.ratingSource || row?.ratingResolvedSource),
  };
}

function revisionFor(records) {
  let hash = 2166136261;
  const source = records
    .map((record) => [
      record.branchIdentity,
      record.lineKeyIdentity,
      record.pipingClassIdentity,
      record.sizeMm,
      record.rating,
      record.ratingSource,
    ].join('\u0000'))
    .join('\u0001');
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `r${records.length}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildXmlCiiPreviewRatingSnapshot(branchRows = [], metadata = {}) {
  const records = (Array.isArray(branchRows) ? branchRows : [])
    .map((row, index) => normalizeRecord(row, index))
    .filter(Boolean);
  return {
    schema: XML_CII_PREVIEW_RATING_SNAPSHOT_SCHEMA,
    revision: revisionFor(records),
    authorityDigest: text(metadata.authorityDigest),
    updatedAt: text(metadata.updatedAt) || new Date().toISOString(),
    records,
  };
}

function previewRowValue(rowElement, selector) {
  const cell = rowElement?.querySelector?.(selector);
  return displayText(cell?.querySelector?.('.mc-preview-editable-val')?.textContent);
}

function displayedPreviewRows(root) {
  if (!root?.querySelectorAll) return [];
  const rowElements = root.querySelectorAll(
    'table[data-resizable-table="branch-preview"] tbody tr.mc-preview-row, table.mc-preview-table tbody tr.mc-preview-row',
  );
  // In-progress v7 rendering cannot publish uncommitted engineering values.
  return [...rowElements].filter((rowElement) => {
    const host = rowElement.closest?.('#mc-preview-table-host');
    return host?.isConnected !== false
      && host?.dataset?.mcPreviewBuildCompleted !== 'false';
  }).map((rowElement) => {
    const branchCell = rowElement.querySelector?.('[data-mc-edit-type="branchLineKey"]');
    const branchName = text(branchCell?.dataset?.mcEditKey);
    const lineKey = displayText(branchCell?.querySelector?.('.mc-preview-editable-val')?.textContent);
    const pipingClass = previewRowValue(rowElement, '[data-mc-edit-type="pipingClass"]');
    const ratingCell = rowElement.querySelector?.('[data-mc-edit-type="rating"]');
    const rating = displayText(ratingCell?.querySelector?.('.mc-preview-editable-val')?.textContent);
    const size = displayText(rowElement?.children?.[4]?.textContent);
    return {
      branchName,
      lineKey,
      pipingClass,
      size,
      rating,
      ratingSource: 'preview-displayed',
    };
  }).filter((row) => row.branchName || row.lineKey);
}

export function buildXmlCiiDisplayedPreviewRatingSnapshot(root, metadata = {}) {
  const target = root || (typeof document !== 'undefined' ? document : null);
  return buildXmlCiiPreviewRatingSnapshot(displayedPreviewRows(target), {
    authorityDigest: metadata.authorityDigest || 'preview-displayed-live',
    updatedAt: metadata.updatedAt,
  });
}

function parseStored(value) {
  const parsed = safeObject(value);
  if (!Array.isArray(parsed.records)) return null;
  if (
    parsed.schema !== XML_CII_PREVIEW_RATING_SNAPSHOT_SCHEMA
    && parsed.schema !== 'xml-cii-preview-rating-snapshot/v1'
  ) return null;
  return buildXmlCiiPreviewRatingSnapshot(parsed.records, {
    authorityDigest: parsed.authorityDigest,
    updatedAt: parsed.updatedAt,
  });
}

function setLiveSnapshot(snapshot) {
  try { globalThis[LIVE_SNAPSHOT_KEY] = snapshot; } catch {}
}

function liveSnapshot() {
  return parseStored(globalThis?.[LIVE_SNAPSHOT_KEY]);
}

export function publishXmlCiiPreviewRatingSnapshot(branchRows = [], metadata = {}) {
  const snapshot = buildXmlCiiPreviewRatingSnapshot(branchRows, metadata);
  // A fresh build supplies the live snapshot; never persist it for reuse.
  setLiveSnapshot(snapshot);
  return snapshot;
}

export function publishXmlCiiDisplayedPreviewRatingSnapshot(root, metadata = {}) {
  const snapshot = buildXmlCiiDisplayedPreviewRatingSnapshot(root, metadata);
  if (!snapshot.records.length) return null;
  return publishXmlCiiPreviewRatingSnapshot(snapshot.records, {
    authorityDigest: snapshot.authorityDigest,
    updatedAt: snapshot.updatedAt,
  });
}

export function clearXmlCiiPreviewRatingSnapshot() {
  try { delete globalThis[LIVE_SNAPSHOT_KEY]; } catch {}
  // The browser can throw while merely accessing its storage property.
  let storage;
  try { storage = globalThis.localStorage; } catch { return; }
  if (!storage) return;
  for (const key of [
    XML_CII_PREVIEW_RATING_SNAPSHOT_KEY,
    XML_CII_PREVIEW_RATING_SNAPSHOT_LEGACY_KEY,
  ]) {
    try { storage.removeItem(key); } catch {}
  }
}

export function readXmlCiiPreviewRatingSnapshot() {
  const displayed = buildXmlCiiDisplayedPreviewRatingSnapshot();
  if (displayed.records.length) return displayed;
  // Persisted snapshots, envelopes and legacy bridges are not eligible.
  return liveSnapshot() || buildXmlCiiPreviewRatingSnapshot([]);
}

function resultFromMatches(matches, source, snapshot) {
  if (!matches.length) return null;
  const ratings = [...new Set(matches.map((record) => text(record.rating)).filter(Boolean))];
  if (ratings.length === 1) {
    const record = matches.find((item) => text(item.rating) === ratings[0]) || matches[0];
    return {
      rating: ratings[0],
      source,
      record,
      snapshotRevision: snapshot?.revision || '',
    };
  }
  return {
    rating: '',
    source: ratings.length > 1 ? `${source}-conflict` : `${source}-empty`,
    record: matches[0] || null,
    snapshotRevision: snapshot?.revision || '',
  };
}

export function resolveXmlCiiPreviewRating(row = {}, snapshot = readXmlCiiPreviewRatingSnapshot()) {
  const records = Array.isArray(snapshot?.records) ? snapshot.records : [];
  const branchIdentity = normalizeXmlCiiPreviewBranchIdentity(row?.branchName);
  const lineKeyIdentity = normalizeXmlCiiPreviewLineKey(row?.lineKey);
  const pipingClassIdentity = normalizeXmlCiiPreviewPipingClass(
    row?.pipingClass || row?.resolvedPipingClass || row?.requestedPipingClass,
  );
  const sizeMm = normalizeXmlCiiPreviewBore(row?.sizeMm ?? row?.boreMm ?? row?.size ?? row?.bore);

  if (branchIdentity) {
    const exactBranch = records.filter((record) => record.branchIdentity === branchIdentity);
    const result = resultFromMatches(exactBranch, 'preview-branch', snapshot);
    if (result) return result;
  }

  const identityPasses = [
    [
      'preview-line-bore',
      (record) => lineKeyIdentity && sizeMm
        && record.lineKeyIdentity === lineKeyIdentity
        && record.sizeMm === sizeMm,
    ],
    [
      'preview-line-class',
      (record) => lineKeyIdentity && pipingClassIdentity
        && record.lineKeyIdentity === lineKeyIdentity
        && record.pipingClassIdentity === pipingClassIdentity,
    ],
    [
      'preview-line-key-unambiguous',
      (record) => lineKeyIdentity && record.lineKeyIdentity === lineKeyIdentity,
    ],
  ];

  for (const [source, predicate] of identityPasses) {
    const result = resultFromMatches(records.filter(predicate), source, snapshot);
    if (result?.rating) return result;
  }

  return {
    rating: '',
    source: 'preview-rating-missing',
    record: null,
    snapshotRevision: snapshot?.revision || '',
  };
}

export function resolveXmlCiiWeightMatchRating(row = {}, { mode = 'preview', snapshot } = {}) {
  const dtxrRating = extractXmlCiiRatingFromDtxr(row?.dtxr);
  if (mode === 'dtxr') {
    return {
      rating: dtxrRating,
      source: dtxrRating ? 'weight-match-dtxr-explicit' : 'weight-match-dtxr-missing',
      dtxrRating,
      mode: 'dtxr',
      snapshotRevision: snapshot?.revision || '',
    };
  }
  const preview = resolveXmlCiiPreviewRating(row, snapshot || readXmlCiiPreviewRatingSnapshot());
  return {
    ...preview,
    dtxrRating,
    mode: 'preview',
  };
}

function installDisplayedPreviewObserver() {
  if (
    typeof document === 'undefined'
    || typeof MutationObserver === 'undefined'
    || globalThis?.[OBSERVER_KEY]
  ) return;

  const start = () => {
    if (!document.documentElement || globalThis?.[OBSERVER_KEY]) return;
    let scheduled = false;
    const publish = () => {
      scheduled = false;
      publishXmlCiiDisplayedPreviewRatingSnapshot(document, {
        authorityDigest: 'preview-displayed-observer',
      });
    };
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      const enqueue = typeof queueMicrotask === 'function'
        ? queueMicrotask
        : (callback) => Promise.resolve().then(callback);
      enqueue(publish);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-mc-edit-key', 'data-mc-edit-row'],
    });
    globalThis[OBSERVER_KEY] = observer;
    publish();
  };

  if (document.documentElement) start();
  else document.addEventListener?.('DOMContentLoaded', start, { once: true });
}

installDisplayedPreviewObserver();
