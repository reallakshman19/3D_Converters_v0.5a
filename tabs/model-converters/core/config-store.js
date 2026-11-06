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
  // Keep full masters in the live defaults object. Persist the existing
  // master-stripped representation FIRST: the former full-size setItem attempt
  // could synchronously block the popup and fail the browser storage quota.
  // No conversion or in-memory configuration values are changed.
  const perf = typeof performance !== 'undefined' ? performance : null;
  perf?.mark?.('xml-cii:config-store:prepare:start');
  const storageDefaults = _storageSafeDefaults(defaultsByConverter);
  perf?.mark?.('xml-cii:config-store:prepare:end');
  if (perf?.measure) perf.measure('xml-cii:config-store:prepare',
    'xml-cii:config-store:prepare:start', 'xml-cii:config-store:prepare:end');
  const payload = JSON.stringify({ selectedConverter, defaultsByConverter: storageDefaults });
  try {
    perf?.mark?.('xml-cii:config-store:write:start');
    window.localStorage.setItem(STORAGE_KEY, payload);
    return storageDefaults === defaultsByConverter ? 'full' : 'trimmed';
  } catch (error) {
    console.warn('model-converters: config not persisted to localStorage (quota exceeded).', error);
    return 'failed';
  } finally {
    perf?.mark?.('xml-cii:config-store:write:end');
    if (perf?.measure) perf.measure('xml-cii:config-store:write',
      'xml-cii:config-store:write:start', 'xml-cii:config-store:write:end');
  }
}
