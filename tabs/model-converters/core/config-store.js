import { CONVERTERS } from '../converter-registry.js';

const STORAGE_KEY = 'model-converters.defaults.v1';
const FETCH_RATING_JOURNAL = 'model-converters.xml-cii.fetch-rating-journal.v1';

// The small, synchronous Fetch journal is replayed when the page reloads
// before the background full-config serializer can finish. It is never a
// Preview row cache or a replacement for the Owner's imported masters.
export function stageXmlCiiFetchedRatings(overrides, previousFetchedKeys = []) {
  const source = overrides && typeof overrides === 'object' ? overrides : {};
  const touchedKeys = [...new Set([
    ...previousFetchedKeys,
    ...Object.keys(source.__dtxrRatingKeys || {}),
  ])];
  const rating = {};
  const processRating = {};
  for (const key of touchedKeys) {
    if (Object.hasOwn(source.rating || {}, key)) rating[key] = source.rating[key];
    if (Object.hasOwn(source.processData?.[key] || {}, 'rating'))
      processRating[key] = source.processData[key].rating;
  }
  const payload = JSON.stringify({
    version: 2,
    touchedKeys,
    rating,
    processRating,
    fetchedKeys: source.__dtxrRatingKeys || {},
  });
  if (new TextEncoder().encode(payload).byteLength > 1_000_000)
    throw new Error('Fetch rating journal exceeds browser storage budget');
  window.localStorage.setItem(FETCH_RATING_JOURNAL, payload);
}
export function clearXmlCiiFetchedRatingsJournal() {
  try { window.localStorage.removeItem(FETCH_RATING_JOURNAL); } catch {}
}
export function applyStagedXmlCiiFetchedRatings(config) {
  try {
    const raw = window.localStorage.getItem(FETCH_RATING_JOURNAL);
    if (!raw) return config;
    const patch = JSON.parse(raw);
    if (patch?.version !== 2 || !Array.isArray(patch.touchedKeys)) {
      // R14's whole-overrides journal cannot be safely merged. Retire it
      // rather than retaining a stale cross-version rating override forever.
      clearXmlCiiFetchedRatingsJournal();
      return config;
    }
    const base = config?.overrides && typeof config.overrides === 'object'
      && !Array.isArray(config.overrides) ? config.overrides : {};
    const overrides = { ...base };
    const rating = { ...(base.rating || {}) };
    const processData = { ...(base.processData || {}) };
    for (const key of patch.touchedKeys) {
      if (Object.hasOwn(patch.rating || {}, key)) rating[key] = patch.rating[key];
      else delete rating[key];
      const processRow = { ...(processData[key] || {}) };
      if (Object.hasOwn(patch.processRating || {}, key))
        processRow.rating = patch.processRating[key];
      else delete processRow.rating;
      if (Object.keys(processRow).length) processData[key] = processRow;
      else delete processData[key];
    }
    overrides.rating = rating;
    overrides.processData = processData;
    overrides.__dtxrRatingKeys = { ...(patch.fetchedKeys || {}) };
    config.overrides = overrides;
  } catch {
    clearXmlCiiFetchedRatingsJournal();
  }
  return config;
}

function _clone(obj) {
  if (obj === undefined) return undefined;
  return JSON.parse(JSON.stringify(obj));
}

function _toText(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

function _migrateXmlCiiSupportConfigJson(rawJson) {
  const text = _toText(rawJson).trim();
  if (!text) return text;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return text;
    parsed.supportKindToXmlType = _normalizeXmlCiiSupportKindToTypeConfig(parsed.supportKindToXmlType);
    if (parsed._xmlCiiDefaultTrueFlagsMigrated20260705 !== true) {
      parsed.disableCiiSupportTagPopulation = true;
      parsed.splitCondensedValveFlange = true;
      parsed.split_condensed_valve_flange = true;
      parsed._xmlCiiDefaultTrueFlagsMigrated20260705 = true;
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

function _normalizeXmlCiiSupportKindToTypeConfig(value) {
  const mapping = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  const normalizedGuide = _toText(mapping.GUIDE).trim().toUpperCase();
  const normalizedLimit = _toText(mapping.LIMIT).trim().toUpperCase();
  const normalizedLinestop = _toText(mapping.LINESTOP).trim().toUpperCase();
  if (normalizedGuide === 'X' || normalizedGuide === 'GUIDE') mapping.GUIDE = 'GUI';
  if (normalizedLimit === 'Z' || normalizedLimit === 'LIMIT') mapping.LIMIT = 'LIM';
  if (normalizedLinestop === 'Z' || normalizedLinestop === 'LINESTOP') mapping.LINESTOP = 'LIM';
  return mapping;
}

const STORAGE_MASTER_ARRAY_PATHS = Object.freeze([
  ['linelist', 'masterRows'],
  ['pipingClass', 'masterRows'],
  ['material', 'mapRows'],
  ['weight', 'masterRows'],
]);

function _storageSafeDefaults(defaultsByConverter, { defaultOnly = false } = {}) {
  let result = defaultsByConverter;
  let cloned = false;
  for (const [converterId, values] of Object.entries(defaultsByConverter || {})) {
    const json = values && typeof values.supportConfigJson === 'string' ? values.supportConfigJson : '';
    if (!json) continue;
    let config;
    try { config = JSON.parse(json); } catch { continue; }
    let stripped = false;
    const strippedSections = [];
    const omittedDefaults = [];
    for (const [section, key] of STORAGE_MASTER_ARRAY_PATHS) {
      const master = config?.[section];
      const rows = master?.[key];
      if (!Array.isArray(rows) || !rows.length) continue;
      // The lite autoloader marks Material Map and Valve Weights as replaceable
      // defaults. They must never force a small Owner-imported line list or
      // piping-class table out of persistent storage.
      const autoDefault = (section === 'material' || section === 'weight')
        && Number(master._autoloadedRows) === rows.length
        && typeof master._autoloadedFrom === 'string' && master._autoloadedFrom.length > 0;
      if (defaultOnly && !autoDefault) continue;
      master[key] = [];
      stripped = true;
      if (autoDefault) omittedDefaults.push(section);
      else strippedSections.push(section);
    }
    if (!stripped) continue;
    if (strippedSections.length) {
      config._mastersStrippedForStorage = true;
      config._mastersStrippedSectionsForStorage = [
        ...new Set([...(Array.isArray(config._mastersStrippedSectionsForStorage)
          ? config._mastersStrippedSectionsForStorage : []), ...strippedSections]),
      ];
    }
    if (omittedDefaults.length) {
      config._autoloadDefaultsOmittedForStorage = [
        ...new Set([...(Array.isArray(config._autoloadDefaultsOmittedForStorage)
          ? config._autoloadDefaultsOmittedForStorage : []), ...omittedDefaults]),
      ];
    }
    if (!cloned) { result = { ...defaultsByConverter }; cloned = true; }
    result[converterId] = { ...values, supportConfigJson: JSON.stringify(config) };
  }
  return result;
}

export function loadStoredState() {
  const defaultsByConverter = {};
  for (const converter of CONVERTERS) {
    defaultsByConverter[converter.id] = _clone(converter.defaults || {});
  }
  const enabledConverterIds = new Set(CONVERTERS.map((c) => c.id));

  let selectedConverter = 'rvm_to_rev';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (enabledConverterIds.has(parsed.selectedConverter)) {
          selectedConverter = parsed.selectedConverter;
        }
        const source = parsed.defaultsByConverter || {};
        for (const [converterId, sourceValues] of Object.entries(source)) {
          if (!enabledConverterIds.has(converterId) || !sourceValues || typeof sourceValues !== 'object') continue;
          defaultsByConverter[converterId] = {
            ...defaultsByConverter[converterId],
            ...sourceValues,
          };
          if (converterId === 'xml_to_cii') {
            defaultsByConverter[converterId].supportConfigJson = _migrateXmlCiiSupportConfigJson(
              defaultsByConverter[converterId].supportConfigJson,
            );
          }
        }
      }
    }
  } catch {
    // Keep defaults
  }

  // A page reload may preempt the deferred worker save. Replay the very
  // small rating-only journal over the stored config without dropping masters.
  const storedXmlCii = defaultsByConverter.xml_to_cii;
  let hasJournal = false;
  try { hasJournal = !!window.localStorage.getItem(FETCH_RATING_JOURNAL); } catch {}
  if (hasJournal && storedXmlCii && typeof storedXmlCii.supportConfigJson === 'string') {
    try {
      const config = JSON.parse(storedXmlCii.supportConfigJson);
      const patched = applyStagedXmlCiiFetchedRatings(config);
      if (patched.overrides && window.localStorage.getItem(FETCH_RATING_JOURNAL)) {
        storedXmlCii.supportConfigJson = JSON.stringify(patched);
      }
    } catch {}
  }
  return { selectedConverter, defaultsByConverter };
}

// Worker-safe preparation; no storage access and no DOM dependencies.
// Fetch can execute this on a dedicated worker to keep large master-table
// serialization off the browser's main thread.
export function prepareStoredStatePayload(selectedConverter, defaultsByConverter) {
  const MAX_WRITE_BYTES = 1_000_000;
  const xmlConfigSize = Object.values(defaultsByConverter || {}).reduce(
    (sum, value) => sum + (typeof value?.supportConfigJson === 'string' ? value.supportConfigJson.length : 0), 0);
  // First omit only reproducible lite-autoload defaults; keep Owner imports.
  // Fall back to stripping Owner masters only when the remaining payload still
  // exceeds the browser budget. Never try a multi-megabyte localStorage write.
  let storageDefaults = xmlConfigSize > 750_000
    ? _storageSafeDefaults(defaultsByConverter, { defaultOnly: true }) : defaultsByConverter;
  let strippedImportedMasters = false;
  const serialize = (defaults) => JSON.stringify({ selectedConverter, defaultsByConverter: defaults });
  let payload = serialize(storageDefaults);
  const payloadBytes = (value) => new TextEncoder().encode(value).byteLength;
  if (payloadBytes(payload) > MAX_WRITE_BYTES) {
    const reduced = _storageSafeDefaults(storageDefaults);
    if (reduced !== storageDefaults) strippedImportedMasters = true;
    storageDefaults = reduced;
    payload = serialize(storageDefaults);
  }
  return {
    payload, storageDefaults, strippedImportedMasters,
    status: storageDefaults === defaultsByConverter ? 'full'
      : (strippedImportedMasters ? 'trimmed' : 'autoload-trimmed'),
  };
}

export function writePreparedStoredState(payload) {
  if (new TextEncoder().encode(payload).byteLength > 1_000_000)
    throw new Error('persistent defaults exceed 1MB budget');
  const perf = typeof performance !== 'undefined' ? performance : null;
  perf?.mark?.('xml-cii:config-store:write:start');
  try { window.localStorage.setItem(STORAGE_KEY, payload); }
  finally {
    perf?.mark?.('xml-cii:config-store:write:end');
    perf?.measure?.('xml-cii:config-store:write',
      'xml-cii:config-store:write:start', 'xml-cii:config-store:write:end');
  }
}

export function saveStoredState(selectedConverter, defaultsByConverter) {
  // Retain the synchronous legacy contract for normal config edits.
  const perf = typeof performance !== 'undefined' ? performance : null;
  perf?.mark?.('xml-cii:config-store:prepare:start');
  const { payload, storageDefaults, status } = prepareStoredStatePayload(selectedConverter, defaultsByConverter);
  perf?.mark?.('xml-cii:config-store:prepare:end');
  perf?.measure?.('xml-cii:config-store:prepare',
    'xml-cii:config-store:prepare:start', 'xml-cii:config-store:prepare:end');
  try {
    writePreparedStoredState(payload);
    return status;
  } catch (error) {
    if (storageDefaults === defaultsByConverter) {
      try {
        const compact = _storageSafeDefaults(defaultsByConverter);
        if (compact !== defaultsByConverter) {
          writePreparedStoredState(JSON.stringify({ selectedConverter, defaultsByConverter: compact }));
          return 'trimmed';
        }
      } catch (innerError) {
        console.warn('model-converters: config not persisted to localStorage.', innerError);
        return 'failed';
      }
    }
    console.warn('model-converters: config not persisted to localStorage.', error);
    return 'failed';
  }
}
