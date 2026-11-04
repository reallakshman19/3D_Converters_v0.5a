import {
  clearXmlCiiPreviewRatingSnapshot,
  publishXmlCiiPreviewRatingSnapshot,
} from '../../../converters/xml-cii2019-core/preview-rating-snapshot.js';

export const XML_CII_PREVIEW_CACHE_SCHEMA = 'xml-cii-preview-cache/v8-rating-policy';
export const XML_CII_PREVIEW_CACHE_KEY = 'xml-cii-pv-cache-v8-rating-policy';
export const XML_CII_PREVIEW_LEGACY_CACHE_KEY = 'xml-cii-pv-cache-v8-dtxr';

const DEFAULT_MAX_BYTES = 2500000;
const LEGACY_KEYS = Object.freeze([
  XML_CII_PREVIEW_LEGACY_CACHE_KEY,
  'xml-cii-pv-cache-v6',
  'xml-cii-pv-cache-v2',
]);
const OLD_ENVELOPE_KEYS = Object.freeze(['xml-cii-pv-cache-v7']);

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function storageOrNull(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function utf8Bytes(value) {
  const source = text(value);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(source);
  return Uint8Array.from(unescape(encodeURIComponent(source)), (char) => char.charCodeAt(0));
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(value, stack = new Set(), inArray = false) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return JSON.stringify(value);
  if (type === 'number') return Number.isFinite(value) ? JSON.stringify(Object.is(value, -0) ? 0 : value) : 'null';
  if (type === 'bigint') throw new TypeError('BigInt is not supported in Preview cache authority.');
  if (type === 'undefined' || type === 'function' || type === 'symbol') return inArray ? 'null' : undefined;

  if (stack.has(value)) throw new TypeError('Circular value is not supported in Preview cache authority.');
  stack.add(value);
  try {
    if (value instanceof Date) return JSON.stringify(value.toJSON());
    if (value instanceof Map) {
      const entries = [...value.entries()].map(([key, item]) => [text(key), item]);
      entries.sort(([left], [right]) => left.localeCompare(right));
      return canonicalJson(Object.fromEntries(entries), stack, inArray);
    }
    if (value instanceof Set) {
      return canonicalJson([...value].sort((left, right) => text(left).localeCompare(text(right))), stack, inArray);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJson(item, stack, true) ?? 'null').join(',')}]`;
    }

    const pairs = [];
    for (const key of Object.keys(value).sort()) {
      const serialized = canonicalJson(value[key], stack, false);
      if (serialized !== undefined) pairs.push(`${JSON.stringify(key)}:${serialized}`);
    }
    return `{${pairs.join(',')}}`;
  } finally {
    stack.delete(value);
  }
}

export function stablePreviewCacheStringify(value) {
  return canonicalJson(value) ?? 'null';
}

async function sha256(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') {
    throw new Error('SHA-256 is unavailable; Preview cache reuse is disabled.');
  }
  return hex(await subtle.digest('SHA-256', utf8Bytes(value)));
}

export async function createPreviewCacheAuthority({ xmlText = '', stagedJsonText = '', config = {} } = {}) {
  const canonical = stablePreviewCacheStringify({
    schema: XML_CII_PREVIEW_CACHE_SCHEMA,
    xmlText: text(xmlText),
    stagedJsonText: text(stagedJsonText),
    config: config && typeof config === 'object' ? config : {},
  });
  return {
    schema: XML_CII_PREVIEW_CACHE_SCHEMA,
    digest: `sha256:${await sha256(canonical)}`,
    canonicalBytes: utf8Bytes(canonical).byteLength,
    xmlBytes: utf8Bytes(xmlText).byteLength,
    stagedJsonBytes: utf8Bytes(stagedJsonText).byteLength,
  };
}

function parseStored(raw) {
  try {
    const parsed = JSON.parse(raw || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validLegacyPayload(value) {
  return !!(
    value
    && typeof value === 'object'
    && typeof value.fp === 'string'
    && value.data
    && Array.isArray(value.data.branchRows)
  );
}

export function restorePreviewCacheV7(authority, storage) {
  const target = storageOrNull(storage);
  if (!target || !authority?.digest) return { restored: false, reason: 'storage-or-authority-unavailable' };
  const envelope = parseStored(target.getItem(XML_CII_PREVIEW_CACHE_KEY));
  const exact = envelope?.schema === XML_CII_PREVIEW_CACHE_SCHEMA
    && envelope?.authority?.digest === authority.digest
    && validLegacyPayload(envelope?.legacyPayload);
  try {
    if (exact) {
      target.setItem(XML_CII_PREVIEW_LEGACY_CACHE_KEY, JSON.stringify(envelope.legacyPayload));
      publishXmlCiiPreviewRatingSnapshot(envelope.legacyPayload.data.branchRows, {
        authorityDigest: authority.digest,
      });
      return { restored: true, reason: 'exact-authority-match', envelope };
    }
    target.removeItem(XML_CII_PREVIEW_LEGACY_CACHE_KEY);
    clearXmlCiiPreviewRatingSnapshot();
  } catch {}
  return { restored: false, reason: envelope ? 'authority-mismatch' : 'cache-missing-or-invalid' };
}

export function capturePreviewCacheV7(authority, storage, maxBytes = DEFAULT_MAX_BYTES, committedResult = null) {
  const target = storageOrNull(storage);
  if (!authority?.digest) return { stored: false, reason: 'authority-unavailable' };
  // An explicit build supplies its rows in memory. Existing legacy callers of
  // this helper may still use the old storage input until they are migrated.
  const direct = Array.isArray(committedResult?.branchRows);
  const legacyPayload = direct ? {
    fp: 'explicit-preview-build-v1-not-a-reuse-key',
    data: { branchRows: committedResult.branchRows, nodeRows: committedResult.nodeRows },
    ts: Date.now(),
  } : (target ? parseStored(target.getItem(XML_CII_PREVIEW_LEGACY_CACHE_KEY)) : null);
  if (!direct) {
    try { target?.removeItem(XML_CII_PREVIEW_LEGACY_CACHE_KEY); } catch {}
  }
  if (!validLegacyPayload(legacyPayload)) {
    clearXmlCiiPreviewRatingSnapshot();
    return { stored: false, reason: 'legacy-payload-missing-or-invalid' };
  }

  publishXmlCiiPreviewRatingSnapshot(legacyPayload.data.branchRows, {
    authorityDigest: authority.digest,
  });
  if (!target) return { stored: false, reason: 'storage-unavailable' };
  const envelope = {
    schema: XML_CII_PREVIEW_CACHE_SCHEMA,
    authority,
    legacyPayload,
    writtenAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(envelope);
  if (serialized.length > maxBytes) {
    try { target.removeItem(XML_CII_PREVIEW_CACHE_KEY); } catch {}
    return { stored: false, reason: 'cache-envelope-too-large', bytes: serialized.length };
  }
  try {
    target.setItem(XML_CII_PREVIEW_CACHE_KEY, serialized);
    for (const key of OLD_ENVELOPE_KEYS) target.removeItem(key);
    return { stored: true, reason: 'stored', bytes: serialized.length, envelope };
  } catch (error) {
    try { target.removeItem(XML_CII_PREVIEW_CACHE_KEY); } catch {}
    return { stored: false, reason: 'storage-write-failed', error };
  }
}

export function clearPreviewCacheBridge(storage) {
  const target = storageOrNull(storage);
  if (target) for (const key of LEGACY_KEYS) {
    try { target.removeItem(key); } catch {}
  }
  clearXmlCiiPreviewRatingSnapshot();
}

export function clearPreviewCachesV7(storage) {
  const target = storageOrNull(storage);
  if (target) for (const key of [
    XML_CII_PREVIEW_CACHE_KEY,
    ...OLD_ENVELOPE_KEYS,
    ...LEGACY_KEYS,
    'xml-cii-wm-cache-v1',
    'xml-cii-wm-cache-v2-preview-rating',
  ]) {
    try { target.removeItem(key); } catch {}
  }
  clearXmlCiiPreviewRatingSnapshot();
}

export function discardPreviewCacheV7(storage) {
  const target = storageOrNull(storage);
  try { target?.removeItem(XML_CII_PREVIEW_CACHE_KEY); } catch {}
  clearPreviewCacheBridge(target);
}

export function shortPreviewCacheDigest(authority) {
  return text(authority?.digest).replace(/^sha256:/, '').slice(0, 16) || 'unavailable';
}
