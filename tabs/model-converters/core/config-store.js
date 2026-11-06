import { CONVERTERS } from '../converter-registry.js';

const STORAGE_KEY = 'model-converters.defaults.v1';

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

function _storageSafeDefaults(defaultsByConverter) {
  let result = defaultsByConverter;
  let cloned = false;
  for (const [converterId, values] of Object.entries(defaultsByConverter || {})) {
    const json = values && typeof values.supportConfigJson === 'string' ? values.supportConfigJson : '';
    if (!json) continue;
    let config;
    try { config = JSON.parse(json); } catch { continue; }
    let stripped = false;
    for (const [section, key] of STORAGE_MASTER_ARRAY_PATHS) {
      if (config && config[section] && Array.isArray(config[section][key]) && config[section][key].length) {
        config[section][key] = [];
        stripped = true;
      }
    }
    if (!stripped) continue;
    config._mastersStrippedForStorage = true;
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

  return { selectedConverter, defaultsByConverter };
}

export function saveStoredState(selectedConverter, defaultsByConverter) {
  // A small config must keep its imported masters across reloads. For a
  // multi-MB config choose the existing master-stripped format BEFORE setItem,
  // never attempt the large localStorage write and rely on a quota exception.
  const perf = typeof performance !== 'undefined' ? performance : null;
  const MAX_WRITE_BYTES = 1_000_000;
  perf?.mark?.('xml-cii:config-store:prepare:start');
  const xmlConfigSize = Object.values(defaultsByConverter || {}).reduce(
    (sum, value) => sum + (typeof value?.supportConfigJson === 'string' ? value.supportConfigJson.length : 0), 0);
  let storageDefaults = xmlConfigSize > 750_000
    ? _storageSafeDefaults(defaultsByConverter) : defaultsByConverter;
  const serialize = (defaults) => JSON.stringify({ selectedConverter, defaultsByConverter: defaults });
  let payload = serialize(storageDefaults);
  const payloadBytes = (value) => new TextEncoder().encode(value).byteLength;
  if (payloadBytes(payload) > MAX_WRITE_BYTES && storageDefaults === defaultsByConverter) {
    storageDefaults = _storageSafeDefaults(defaultsByConverter);
    payload = serialize(storageDefaults);
  }
  perf?.mark?.('xml-cii:config-store:prepare:end');
  perf?.measure?.('xml-cii:config-store:prepare',
    'xml-cii:config-store:prepare:start', 'xml-cii:config-store:prepare:end');
  const write = (value) => {
    if (payloadBytes(value) > MAX_WRITE_BYTES) throw new Error('persistent defaults exceed 1MB budget');
    perf?.mark?.('xml-cii:config-store:write:start');
    try { window.localStorage.setItem(STORAGE_KEY, value); }
    finally {
      perf?.mark?.('xml-cii:config-store:write:end');
      perf?.measure?.('xml-cii:config-store:write',
        'xml-cii:config-store:write:start', 'xml-cii:config-store:write:end');
    }
  };
  try {
    write(payload);
    return storageDefaults === defaultsByConverter ? 'full' : 'trimmed';
  } catch (error) {
    if (storageDefaults === defaultsByConverter) {
      try {
        const compact = _storageSafeDefaults(defaultsByConverter);
        if (compact !== defaultsByConverter) {
          write(serialize(compact));
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
