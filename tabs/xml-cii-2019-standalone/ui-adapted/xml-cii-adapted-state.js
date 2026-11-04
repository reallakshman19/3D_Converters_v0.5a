/** Owns isolated XML→CII Standalone state, persistence, and effective config.
 * Parameters are explicit state/config values; outputs are copied state data. */

import { defaultXmlCii2019SupportConfigJson } from '../xml-cii-standalone-default-config.js';
import { createDefaultRegexTesterConfig } from '../xml-cii-regex-tester.js';
import { createDefaultResolverJsonTraceConfig } from '../xml-cii-resolver-json-trace.js';
import { createDefaultManualElementSideloadConfig } from '../xml-cii-manual-element-sideload.js';
import { createDefaultTraceTableConfig } from '../xml-cii-table-trace-config.js';
import { DEFAULT_WEIGHT_MASTER_ROWS } from '../../../converters/xml-cii2019-core/default-weight-master-rows.js';
import { normalizeAdaptedWorkflowPhaseId } from './xml-cii-adapted-phase-registry.js';

const SUPPORT_MAPPER_DEFAULTS = Object.freeze([
  { kind: 'REST', aliases: ['Shoe', 'Pipe Rest', 'Wear Pad', 'Rest'], ciiKind: 'REST_STYLE_CII_SUPPORT' },
  { kind: 'GUIDE', aliases: ['Guide', 'PG', 'Lateral Guide'], ciiKind: 'GUIDE_STYLE_CII_SUPPORT' },
  { kind: 'LINESTOP', aliases: ['Line Stop', 'Directional Anchor', 'LS', 'Axial Stop'], ciiKind: 'LINESTOP_STYLE_CII_SUPPORT' },
  { kind: 'ANCHOR', aliases: ['Anchor', 'Fixed'], ciiKind: 'ANCHOR_STYLE_CII_SUPPORT' },
]);

function withStandaloneMaterialCodeDefaults(config) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  return { ...source, useDefaultPipingClassMaterialCodeMap: source.useDefaultPipingClassMaterialCodeMap !== false };
}

export function createDefaultWorkflowOptions() {
  return {
    coordsMode: 'first', kgToNewton: true, splitCondensedValveFlange: true, useRestraintTypeBasedOnJson: true,
    outputMode: 'both', inputXmlOutputMode: 'full-document', pointPropertiesBasis: 'auto',
    inputXmlRestraintPolicy: 'merge-existing-and-dtxr-derived-restraints', fillSentinelFromLineContext: true,
    normalizePressureCaseNames: true, escapeXmlAttributes: true,
  };
}

export function getStoredJson(key, defaultVal = null) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return defaultVal;
    const val = storage.getItem(key);
    return val ? JSON.parse(val) : defaultVal;
  } catch {
    return defaultVal;
  }
}

export function setStoredJson(key, value) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    if (value) storage.setItem(key, JSON.stringify(value));
    else storage.removeItem(key);
  } catch {}
}

function getStoredMaster(key) {
  return getStoredJson(`xml-cii-master-${key}`);
}

export function setStoredMaster(key, rows) {
  setStoredJson(`xml-cii-master-${key}`, rows);
}

export function getSavedMappingsForMaster(masterKey) {
  return getStoredJson(`xml-cii-saved-mappings-${masterKey}`, {});
}

export function saveMappingForFile(masterKey, fileName, fieldMap) {
  if (!fileName) return;
  const mappings = getSavedMappingsForMaster(masterKey);
  mappings[fileName] = fieldMap;
  setStoredJson(`xml-cii-saved-mappings-${masterKey}`, mappings);
}

export function findSmartMatchingMapping(filename, savedKeys) {
  if (!filename || !savedKeys || !savedKeys.length) return null;
  const norm = filename.toUpperCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Z0-9]/g, '');
  if (savedKeys.includes(filename)) return filename;
  for (const key of savedKeys) {
    const keyNorm = key.toUpperCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Z0-9]/g, '');
    if (norm.slice(0, 18) === keyNorm.slice(0, 18)) return key;
  }
  return null;
}

export function saveMasterContextToLocalStorage(context) {
  if (!context) return;
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    // Strip all large arrays — they are persisted under their own dedicated keys
    const strippedConfig = context.config ? (() => {
      const c = { ...context.config };
      if (c.linelist) c.linelist = { ...c.linelist, masterRows: null };
      if (c.pipingClass) c.pipingClass = { ...c.pipingClass, masterRows: null };
      if (c.material) c.material = { ...c.material, mapRows: null };
      if (c.weight) c.weight = { ...c.weight, masterRows: null };
      return c;
    })() : context.config;
    const cleaned = {
      ...context,
      config: strippedConfig,
      lineRows: null,
      pipingClassRows: null,
      materialMapRows: null,
      weightMasterRows: null,
      rawRows: { lineList: null, pipingClass: null, materialMap: null, weight: null },
      workbookData: { lineList: null, materialMap: null, weight: null },
      previewRows: null,
      // pipingClassIndex holds a self-referential Map (see piping-class-resolver.js's `map.byClass
      // = map`) and is rebuilt on load anyway — it must not be JSON.stringify'd.
      pipingClassIndex: null,
    };
    storage.setItem('xml-cii-import-masters-v1', JSON.stringify(cleaned));
  } catch (e) {
    console.error('Failed to save master config overrides:', e);
  }
}

function restorePersistentMasters() {
  const lineRows = getStoredMaster('lineList') || [];
  const materialMapRows = getStoredMaster('materialMap') || [];
  const storedWeightRows = getStoredMaster('weight') || [];
  // Valve weights ship embedded in the app — use them whenever nothing was
  // uploaded or restored, so the Weight tabs are never blocked by default.
  const usingDefaultWeights = !storedWeightRows.length;
  const weightMasterRows = usingDefaultWeights ? DEFAULT_WEIGHT_MASTER_ROWS.map((row) => ({ ...row })) : storedWeightRows;

  let savedContext = null;
  try {
    const val = localStorage.getItem('xml-cii-import-masters-v1');
    if (val) savedContext = JSON.parse(val);
  } catch {}

  let config;
  if (savedContext && savedContext.config) {
    config = withStandaloneMaterialCodeDefaults(savedContext.config);
  } else {
    config = withStandaloneMaterialCodeDefaults(JSON.parse(defaultXmlCii2019SupportConfigJson() || '{}'));
  }

  if (lineRows.length) config.linelist = { ...(config.linelist || {}), masterRows: lineRows };
  if (materialMapRows.length) config.material = { ...(config.material || {}), mapRows: materialMapRows };
  if (weightMasterRows.length) config.weight = { ...(config.weight || {}), masterRows: weightMasterRows };

  // Piping class rows have no dedicated LocalStorage key and are stripped from
  // the saved context, so their count must reflect what was actually restored
  // (usually 0) — never a stale count from a previous session.
  const pipingClassRows = Array.isArray(config.pipingClass?.masterRows) ? config.pipingClass.masterRows : [];

  return {
    lineRows, pipingClassRows, materialMapRows, weightMasterRows, diagnostics: [], config,
    rowCounts: { lineList: lineRows.length, pipingClass: pipingClassRows.length, materialMap: materialMapRows.length, weight: weightMasterRows.length },
    previewRows: savedContext?.previewRows || { lineList: lineRows.slice(0, 150), pipingClass: pipingClassRows.slice(0, 150), materialMap: materialMapRows.slice(0, 150), weight: weightMasterRows.slice(0, 150) },
    sourceMetadata: {
      lineList: { key: 'lineList', source: lineRows.length ? getStoredJson('xml-cii-master-source-lineList', 'LocalStorage') : 'not-loaded', sourceType: lineRows.length ? 'manual' : 'empty', status: lineRows.length ? 'loaded' : 'empty', rowCount: lineRows.length },
      pipingClass: { key: 'pipingClass', source: pipingClassRows.length ? 'Saved config' : 'not-loaded', sourceType: pipingClassRows.length ? 'manual' : 'empty', status: pipingClassRows.length ? 'loaded' : 'empty', rowCount: pipingClassRows.length },
      materialMap: { key: 'materialMap', source: materialMapRows.length ? getStoredJson('xml-cii-master-source-materialMap', 'LocalStorage') : 'not-loaded', sourceType: materialMapRows.length ? 'manual' : 'empty', status: materialMapRows.length ? 'loaded' : 'empty', rowCount: materialMapRows.length },
      weight: { key: 'weight', source: usingDefaultWeights ? 'Embedded default' : getStoredJson('xml-cii-master-source-weight', 'LocalStorage'), sourceType: usingDefaultWeights ? 'default' : 'manual', status: 'loaded', rowCount: weightMasterRows.length }
    },
    rawRows: {
      lineList: getStoredJson('xml-cii-master-raw-lineList', []),
      materialMap: getStoredJson('xml-cii-master-raw-materialMap', []),
      weight: getStoredJson('xml-cii-master-raw-weight', [])
    },
    sheetNames: {
      lineList: getStoredJson('xml-cii-master-sheetnames-lineList', []),
      materialMap: getStoredJson('xml-cii-master-sheetnames-materialMap', []),
      weight: getStoredJson('xml-cii-master-sheetnames-weight', [])
    },
    activeSheet: {
      lineList: getStoredJson('xml-cii-master-activesheet-lineList', ''),
      materialMap: getStoredJson('xml-cii-master-activesheet-materialMap', ''),
      weight: getStoredJson('xml-cii-master-activesheet-weight', '')
    },
    workbookData: {
      lineList: getStoredJson('xml-cii-master-workbook-lineList', {}),
      materialMap: getStoredJson('xml-cii-master-workbook-materialMap', {}),
      weight: getStoredJson('xml-cii-master-workbook-weight', {})
    }
  };
}

function getStoredRegexConfig() {
  if (typeof localStorage === 'undefined') return createDefaultRegexTesterConfig();
  try {
    const val = localStorage.getItem('xml-cii-regex-config-v1');
    return val ? JSON.parse(val) : createDefaultRegexTesterConfig();
  } catch {
    return createDefaultRegexTesterConfig();
  }
}

function getStoredResolverConfig() {
  if (typeof localStorage === 'undefined') return createDefaultResolverJsonTraceConfig();
  try {
    const val = localStorage.getItem('xml-cii-resolver-config-v1');
    return val ? JSON.parse(val) : createDefaultResolverJsonTraceConfig();
  } catch {
    return createDefaultResolverJsonTraceConfig();
  }
}

function getStoredMasterLastLoadedPaths() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const val = localStorage.getItem('xml-cii-master-last-loaded-paths');
    return val ? JSON.parse(val) : {};
  } catch {
    return {};
  }
}

export function createXmlCiiAdaptedWorkflowState() {
  const mContext = restorePersistentMasters();
  const configJson = mContext ? JSON.stringify(mContext.config, null, 2) : defaultXmlCii2019SupportConfigJson();
  return {
    activePhaseId: 'source', activeSubTabId: 'loader', jsonTraceActiveSubTabId: 'index', sourceKind: 'auto', sourceFile: null, sourceText: '', stagedJsonFile: null, stagedJsonText: '', elementSideLoadText: '',
    supportConfigJson: configJson,
    regexTesterConfig: getStoredRegexConfig(), regexTesterResult: null, regexTesterRunning: false, regexTesterWriteBackStatus: '',
    resolverJsonTraceConfig: getStoredResolverConfig(), resolverJsonTraceResult: null, resolverJsonTraceJsonResult: null, resolverJsonTraceTableResult: null, resolverJsonTraceRunning: false, resolverJsonTraceWriteBackStatus: '',
    jsonTraceTableText: '', jsonTraceTableRows: [], jsonTraceTableFieldMap: {}, jsonTraceTableConfig: createDefaultTraceTableConfig(), jsonTraceTableSourceName: '', jsonTraceTableSheetNames: [], jsonTraceTableActiveSheet: '', jsonTraceTableWorkbookData: null, jsonTraceTableStatus: '', jsonTraceTableBenchmark: null,
    manualElementSideloadConfig: createDefaultManualElementSideloadConfig(), manualElementSideloadResult: null, manualElementSideloadRunning: false, manualElementSideloadWriteBackStatus: '',
    previewDiagnosticsAuditReport: null, previewDiagnosticsAuditStatus: '',
    weightMatchResult: null, weightMatchRunning: false, weightMatchStatus: '', weightMatchOverridesJson: '{}',
    supportTypeMapperConfig: null, supportTypeMapperResult: null, supportTypeMapperRunning: false, supportTypeMapperStatus: '', supportTypeMapperTestInput: '',
    outputRunReadinessReport: null, outputRunReadinessStatus: '',
    masterContext: mContext, importMastersLoading: false, importMastersWriteBackStatus: mContext ? 'Restored master rows from LocalStorage.' : '', options: createDefaultWorkflowOptions(), running: false, result: null,
    masterLastLoadedPaths: getStoredMasterLastLoadedPaths(),
  };
}

export function updateMasterLastLoadedPath(state, masterKey, path) {
  const current = state.masterLastLoadedPaths?.[masterKey] || '';
  const currentNorm = current.replace(/\\/g, '/');
  const pathNorm = path.replace(/\\/g, '/');
  
  if (currentNorm.includes('/') && !pathNorm.includes('/')) {
    const filename = currentNorm.split('/').pop();
    if (filename.toLowerCase() === pathNorm.toLowerCase()) {
      return state;
    }
  }

  const nextPaths = { ...(state.masterLastLoadedPaths || {}), [masterKey]: path };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('xml-cii-master-last-loaded-paths', JSON.stringify(nextPaths));
    } catch {}
  }
  return { ...state, masterLastLoadedPaths: nextPaths };
}

export function updateWorkflowState(state, patch = {}) {
  return { ...state, ...patch, activePhaseId: patch.activePhaseId ? normalizeAdaptedWorkflowPhaseId(patch.activePhaseId) : state.activePhaseId };
}

export function updateWorkflowOptions(state, optionPatch = {}) { return { ...state, options: { ...state.options, ...optionPatch } }; }
export function clearWorkflowResult(state) { return updateWorkflowState(state, { result: null, outputRunReadinessReport: null }); }
export function resetWorkflowState() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('xml-cii-regex-config-v1');
      localStorage.removeItem('xml-cii-resolver-config-v1');
    } catch {}
  }
  return createXmlCiiAdaptedWorkflowState();
}

function totalMasterRows(masterContext) {
  const counts = masterContext?.rowCounts || {};
  return Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
}

export function applyStandaloneImportMastersContext(state, masterContext) {
  return updateWorkflowState(state, { masterContext, supportConfigJson: masterContext?.supportConfigJson || state.supportConfigJson, importMastersLoading: false, importMastersWriteBackStatus: `Loaded ${totalMasterRows(masterContext)} master rows into standalone config.`, result: null });
}

function nestedRuleKey(field) {
  return {
    'regex-line-key-regex': ['lineKey', 'regex'], 'regex-line-key-group': ['lineKey', 'group'], 'regex-line-key-token': ['lineKey', 'tokenPosition'],
    'regex-piping-class-regex': ['pipingClass', 'regex'], 'regex-piping-class-group': ['pipingClass', 'group'], 'regex-piping-class-token': ['pipingClass', 'tokenPosition'],
    'regex-rating-regex': ['rating', 'regex'], 'regex-rating-group': ['rating', 'group'], 'regex-rating-token': ['rating', 'tokenPosition'],
    'regex-bore-regex': ['bore', 'regex'], 'regex-bore-group': ['bore', 'group'], 'regex-bore-token': ['bore', 'tokenPosition'],
  }[field] || null;
}

function numericRuleValue(key, value) { return key === 'group' ? Number(value || 0) : value; }

function updateAndPersistRegexConfig(state, newConfig) {
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('xml-cii-regex-config-v1', JSON.stringify(newConfig)); } catch {}
  }
  return updateWorkflowState(state, { regexTesterConfig: newConfig });
}

export function updateRegexTesterConfig(state, field, value) {
  const currentConfig = { ...(state.regexTesterConfig || {}) };
  if (!currentConfig.formats) {
    const defaultFormat = {
      tokenDelimiter: currentConfig.tokenDelimiter || '-',
      lineKeyJoiner: currentConfig.lineKeyJoiner || '',
      lineKey: currentConfig.lineKey || { regex: '', group: 1, tokenPosition: 3 },
      pipingClass: currentConfig.pipingClass || { regex: '', group: 1, tokenPosition: 4 },
      rating: currentConfig.rating || { regex: '', group: 1, tokenPosition: 4 },
      bore: currentConfig.bore || { regex: '', group: 1, tokenPosition: 2 },
    };
    currentConfig.formats = [{ ...defaultFormat }, { ...defaultFormat }];
    currentConfig.activeFormatIndex = 0;
  }
  if (field === 'regex-active-format-index') {
    return updateAndPersistRegexConfig(state, { ...currentConfig, activeFormatIndex: Number(value || 0) });
  }
  const formats = currentConfig.formats.map(f => ({ ...f }));
  const idx = currentConfig.activeFormatIndex ?? 0;
  const activeF = { ...formats[idx] };
  if (field === 'regex-token-delimiter') {
    activeF.tokenDelimiter = value;
    formats[idx] = activeF;
    return updateAndPersistRegexConfig(state, { ...currentConfig, formats });
  }
  if (field === 'regex-line-key-joiner') {
    activeF.lineKeyJoiner = value;
    formats[idx] = activeF;
    return updateAndPersistRegexConfig(state, { ...currentConfig, formats });
  }
  const path = nestedRuleKey(field);
  if (!path) return state;
  const [ruleName, key] = path;
  const rule = { ...(activeF[ruleName] || {}) };
  rule[key] = numericRuleValue(key, value);
  activeF[ruleName] = rule;
  formats[idx] = activeF;
  return updateAndPersistRegexConfig(state, { ...currentConfig, formats });
}

export function applyStandaloneRegexTesterResult(state, regexTesterResult) {
  if (typeof localStorage !== 'undefined' && state.regexTesterConfig) {
    try { localStorage.setItem('xml-cii-regex-config-v1', JSON.stringify(state.regexTesterConfig)); } catch {}
  }
  return updateWorkflowState(state, { regexTesterResult, regexTesterRunning: false, regexTesterWriteBackStatus: 'Regex rules saved into standalone config.', supportConfigJson: regexTesterResult?.supportConfigJson || state.supportConfigJson, result: null });
}

export function updateResolverJsonTraceConfig(state, value) {
  try {
    const config = JSON.parse(String(value || '{}'));
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('xml-cii-resolver-config-v1', JSON.stringify(config)); } catch {}
    }
    return updateWorkflowState(state, { resolverJsonTraceConfig: config });
  }
  catch { return updateWorkflowState(state, { resolverJsonTraceWriteBackStatus: 'Resolver config JSON is invalid.' }); }
}

export function patchResolverJsonTraceConfig(state, patch = {}) {
  const config = { ...(state.resolverJsonTraceConfig || {}), ...patch };
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem('xml-cii-resolver-config-v1', JSON.stringify(config)); } catch {}
  }
  return updateWorkflowState(state, { resolverJsonTraceConfig: config });
}


export function applyStandaloneResolverJsonTraceResult(state, resolverJsonTraceResult) {
  return updateWorkflowState(state, { resolverJsonTraceResult, resolverJsonTraceJsonResult: resolverJsonTraceResult, resolverJsonTraceRunning: false, resolverJsonTraceWriteBackStatus: 'Resolver config saved into standalone config.', supportConfigJson: resolverJsonTraceResult?.supportConfigJson || state.supportConfigJson, result: null });
}

export function updateManualElementSideloadConfig(state, field, value) {
  const cfg = { ...state.manualElementSideloadConfig };
  if (field === 'manual-policy') cfg.policy = value;
  if (field === 'manual-tolerance') cfg.tolerance = Number(value || 0);
  if (field === 'manual-restraints-text') cfg.manualText = value;
  return updateWorkflowState(state, { manualElementSideloadConfig: cfg });
}

export function applyStandaloneManualElementSideloadResult(state, manualElementSideloadResult) {
  return updateWorkflowState(state, { manualElementSideloadResult, manualElementSideloadRunning: false, manualElementSideloadWriteBackStatus: 'Manual / side-load options saved into standalone config.', supportConfigJson: manualElementSideloadResult?.supportConfigJson || state.supportConfigJson, result: null });
}

export function applyPreviewDiagnosticsAuditReport(state, previewDiagnosticsAuditReport) {
  const matched = previewDiagnosticsAuditReport?.summary?.matchedFacts || 0;
  const rejected = previewDiagnosticsAuditReport?.summary?.rejectedFacts || 0;
  return updateWorkflowState(state, { previewDiagnosticsAuditReport, previewDiagnosticsAuditStatus: `Preview report built: ${matched} matched, ${rejected} rejected.` });
}

export function updateWeightMatchOverrides(state, value) { return updateWorkflowState(state, { weightMatchOverridesJson: value }); }

export function applyStandaloneWeightMatchResult(state, weightMatchResult, finalized = false) {
  return updateWorkflowState(state, {
    weightMatchResult,
    weightMatchRunning: false,
    weightMatchStatus: finalized ? 'Weight match finalized into standalone config.' : 'Weight match report built.',
    supportConfigJson: finalized ? (weightMatchResult?.supportConfigJson || state.supportConfigJson) : state.supportConfigJson,
  });
}

function supportMapperRows(state) {
  return state.supportTypeMapperConfig || SUPPORT_MAPPER_DEFAULTS.map((row) => ({ ...row, aliases: [...row.aliases] }));
}

export function updateSupportTypeMapperConfig(state, field, value) {
  const match = String(field || '').match(/^support-mapper-(aliases|cii)-(.+)$/);
  if (!match) return state;
  const rows = supportMapperRows(state).map((row) => ({ ...row, aliases: [...row.aliases] }));
  const row = rows.find((item) => item.kind === match[2]);
  if (!row) return state;
  if (match[1] === 'aliases') row.aliases = String(value || '').split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  if (match[1] === 'cii') row.ciiKind = String(value || '').trim();
  return updateWorkflowState(state, { supportTypeMapperConfig: rows, result: null });
}

export function updateSupportTypeMapperTestInput(state, value) {
  return updateWorkflowState(state, { supportTypeMapperTestInput: value, result: null });
}

export function applyStandaloneSupportTypeMapperResult(state, supportTypeMapperResult, save = false) {
  return updateWorkflowState(state, {
    supportTypeMapperResult,
    supportTypeMapperRunning: false,
    supportTypeMapperStatus: save ? 'Support Type Mapper saved into standalone config.' : 'Support Type Mapper preview built.',
    supportConfigJson: save ? (supportTypeMapperResult?.supportConfigJson || state.supportConfigJson) : state.supportConfigJson,
    supportTypeMapperConfig: supportTypeMapperResult?.mapperRows || state.supportTypeMapperConfig,
  });
}

export function applyStandaloneOutputRunReadiness(state, outputRunReadinessReport) {
  const blocks = outputRunReadinessReport?.summary?.blockingCount || 0;
  return updateWorkflowState(state, { outputRunReadinessReport, outputRunReadinessStatus: `Output / Run checklist built with ${blocks} blocking item(s).` });
}

export function xmlCiiEnrichedConfigFromState(state) {
  const config = withStandaloneMaterialCodeDefaults(JSON.parse(state.supportConfigJson || '{}'));
  const lineRows = state.masterContext?.lineRows || getStoredMaster('lineList') || [];
  const materialMapRows = state.masterContext?.materialMapRows || getStoredMaster('materialMap') || [];
  const weightMasterRows = (state.masterContext?.weightMasterRows?.length ? state.masterContext.weightMasterRows : null)
    || (getStoredMaster('weight')?.length ? getStoredMaster('weight') : null)
    || DEFAULT_WEIGHT_MASTER_ROWS;
  // Piping class rows are stored in config.pipingClass.masterRows (not a separate LS key)
  // but if masterContext has them in-memory, use those (fresher, not yet persisted)
  const pipingClassRows = state.masterContext?.pipingClassRows?.length
    ? state.masterContext.pipingClassRows
    : (config.pipingClass?.masterRows || []);

  if (lineRows.length) {
    if (!config.linelist) config.linelist = {};
    config.linelist.masterRows = lineRows;
  }
  if (pipingClassRows.length) {
    if (!config.pipingClass) config.pipingClass = {};
    config.pipingClass.masterRows = pipingClassRows;
  }
  if (materialMapRows.length) {
    if (!config.material) config.material = {};
    config.material.mapRows = materialMapRows;
  }
  if (weightMasterRows.length) {
    if (!config.weight) config.weight = {};
    config.weight.masterRows = weightMasterRows;
  }
  return config;
}
