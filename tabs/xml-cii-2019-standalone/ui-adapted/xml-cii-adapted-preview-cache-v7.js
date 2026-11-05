import {
  clearXmlCiiPreviewRatingSnapshot,
  publishXmlCiiPreviewRatingSnapshot,
} from '../../../converters/xml-cii2019-core/preview-rating-snapshot.js';

export const XML_CII_PREVIEW_CACHE_SCHEMA = 'xml-cii-preview-cache/v8-rating-policy';
export const XML_CII_PREVIEW_CACHE_KEY = 'xml-cii-pv-cache-v8-rating-policy';
export const XML_CII_PREVIEW_LEGACY_CACHE_KEY = 'xml-cii-pv-cache-v8-dtxr';

const LEGACY_KEYS = Object.freeze([
  XML_CII_PREVIEW_LEGACY_CACHE_KEY,
  'xml-cii-pv-cache-v6',
  'xml-cii-pv-cache-v2',
]);
const OLD_ENVELOPE_KEYS = Object.freeze(['xml-cii-pv-cache-v7', 'xml-cii-pv-cache-v5']);

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

// Persisted engineering rows must never be restored as a new Preview.
export function restorePreviewCacheV7(_authority, storage) {
  clearPreviewCacheBridge(storage);
  return { restored: false, reason: 'explicit-preview-build-required' };
}

// The direct result is the only engineering authority. Optional envelope
// persistence was removed: the envelope was never restored, and retaining it
// would leave another potentially stale copy of Preview rows in storage.
export function capturePreviewCacheV7(authority, _storage, _maxBytes, committedResult = null) {
  if (!authority?.digest) return { stored: false, reason: 'authority-unavailable' };
  if (!Array.isArray(committedResult?.branchRows)) {
    return { stored: false, reason: 'explicit-preview-result-required' };
  }
  publishXmlCiiPreviewRatingSnapshot(committedResult.branchRows, {
    authorityDigest: authority.digest,
  });
  return { stored: false, reason: 'persistence-disabled' };
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
  if (target) for (const key of [XML_CII_PREVIEW_CACHE_KEY, ...OLD_ENVELOPE_KEYS]) {
    try { target.removeItem(key); } catch {}
  }
  clearPreviewCacheBridge(target);
}

export function shortPreviewCacheDigest(authority) {
  return text(authority?.digest).replace(/^sha256:/, '').slice(0, 16) || 'unavailable';
}
