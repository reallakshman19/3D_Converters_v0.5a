export const XML_CII_WORKFLOW_SOURCE_KINDS = Object.freeze(['xml', 'inputxml', 'auto']);
export const XML_CII_WORKFLOW_RESOLVED_SOURCE_KINDS = Object.freeze(['xml', 'inputxml']);
export const XML_CII_WORKFLOW_COORDS_MODES = Object.freeze(['first', 'all', 'none']);
export const XML_CII_WORKFLOW_OUTPUT_MODES = Object.freeze(['enriched-only', 'cii-only', 'both']);
export const XML_CII_INPUTXML_OUTPUT_MODES = Object.freeze(['full-document', 'fragment']);
export const XML_CII_POINT_PROPERTY_BASIS = Object.freeze(['TO', 'FROM', 'auto']);
export const XML_CII_INPUTXML_RESTRAINT_POLICIES = Object.freeze([
  'preserve-existing-restraints',
  'convert-existing-restraints',
  'replace-with-dtxr-derived-restraints',
  'merge-existing-and-dtxr-derived-restraints',
]);

export const DEFAULT_XML_CII_WORKFLOW_OPTIONS = Object.freeze({
  coordsMode: 'first',
  kgToNewton: true,
  splitCondensedValveFlange: true,
  useRestraintTypeBasedOnJson: true,
  outputMode: 'both',
  inputXmlOutputMode: 'full-document',
  pointPropertiesBasis: 'auto',
  inputXmlRestraintPolicy: 'merge-existing-and-dtxr-derived-restraints',
  fillSentinelFromLineContext: true,
  normalizePressureCaseNames: true,
  escapeXmlAttributes: true,
  analyzeTopology: false,
  generateTopoFix: false,
  useTopoFixForCii: false,
  topologyActionIds: Object.freeze([]),
});

function bool(value, fallback) {
  if (value === true || value === false) return value;
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function enumValue(value, allowed, fallback) {
  const text = String(value || '').trim();
  return allowed.includes(text) ? text : fallback;
}

function arrayValue(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function objectArrayValue(value) {
  return Array.isArray(value) ? value.filter((entry) => entry != null) : [];
}

function actionIdArray(value) {
  const rows = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[\s,;]+/);
  return [...new Set(rows.map((entry) => String(entry).trim()).filter(Boolean))];
}

function normalizedDiagnostics(input, sourceKind, outputKind) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return createWorkflowDiagnostics({
    sourceKind,
    outputKind,
    branch: raw.branch ?? null,
    elementCount: Number.isFinite(Number(raw.elementCount)) ? Number(raw.elementCount) : 0,
    enrichedElementCount: Number.isFinite(Number(raw.enrichedElementCount)) ? Number(raw.enrichedElementCount) : 0,
    restraintCount: Number.isFinite(Number(raw.restraintCount)) ? Number(raw.restraintCount) : 0,
    sideLoadMatched: Number.isFinite(Number(raw.sideLoadMatched)) ? Number(raw.sideLoadMatched) : 0,
    sideLoadUnmatched: Array.isArray(raw.sideLoadUnmatched) ? raw.sideLoadUnmatched.map((entry) => String(entry)) : [],
    inheritedFieldCount: Number.isFinite(Number(raw.inheritedFieldCount)) ? Number(raw.inheritedFieldCount) : 0,
    sentinelFieldCount: Number.isFinite(Number(raw.sentinelFieldCount)) ? Number(raw.sentinelFieldCount) : 0,
    engineDiagnostics: raw.engineDiagnostics ?? null,
    warnings: arrayValue(raw.warnings),
    ...raw,
  });
}

export function normalizeWorkflowOptions(options = {}) {
  const input = options && typeof options === 'object' ? options : {};
  return {
    coordsMode: enumValue(String(input.coordsMode || '').toLowerCase(), XML_CII_WORKFLOW_COORDS_MODES, 'first'),
    kgToNewton: bool(input.kgToNewton, true),
    splitCondensedValveFlange: bool(input.splitCondensedValveFlange, true),
    useRestraintTypeBasedOnJson: bool(input.useRestraintTypeBasedOnJson, true),
    outputMode: enumValue(String(input.outputMode || '').toLowerCase(), XML_CII_WORKFLOW_OUTPUT_MODES, 'both'),
    inputXmlOutputMode: enumValue(String(input.inputXmlOutputMode || '').toLowerCase(), XML_CII_INPUTXML_OUTPUT_MODES, 'full-document'),
    pointPropertiesBasis: enumValue(String(input.pointPropertiesBasis || '').toUpperCase(), XML_CII_POINT_PROPERTY_BASIS, 'auto'),
    inputXmlRestraintPolicy: enumValue(String(input.inputXmlRestraintPolicy || ''), XML_CII_INPUTXML_RESTRAINT_POLICIES, 'merge-existing-and-dtxr-derived-restraints'),
    fillSentinelFromLineContext: bool(input.fillSentinelFromLineContext, true),
    normalizePressureCaseNames: bool(input.normalizePressureCaseNames, true),
    escapeXmlAttributes: bool(input.escapeXmlAttributes, true),
    analyzeTopology: bool(input.analyzeTopology, false),
    generateTopoFix: bool(input.generateTopoFix, false),
    useTopoFixForCii: bool(input.useTopoFixForCii, false),
    topologyActionIds: actionIdArray(input.topologyActionIds),
  };
}

export function validateSupportConfigJson(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return { ok: true, value: {}, normalizedText: '{}' };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Support/config JSON must be a JSON object.' };
    return { ok: true, value, normalizedText: raw };
  } catch (err) {
    return { ok: false, error: 'Malformed support/config JSON: ' + String(err && err.message ? err.message : err) };
  }
}

function validateTopologyOptions(sourceKind, options) {
  if (options.generateTopoFix && !options.analyzeTopology) return 'Generate TopoFix XML requires Analyze PSI116 topology.';
  if (options.useTopoFixForCii && !options.generateTopoFix) return 'Use committed TopoFix XML for CII requires Generate TopoFix XML.';
  if (options.generateTopoFix && !options.topologyActionIds.length) return 'Generate TopoFix XML requires one or more reviewed topology action IDs.';
  if (options.useTopoFixForCii && options.outputMode === 'enriched-only') return 'Using TopoFix for CII requires output mode cii-only or both.';
  if (sourceKind === 'inputxml' && (options.analyzeTopology || options.generateTopoFix || options.useTopoFixForCii)) return 'PSI116 topology options are available only for XML source mode.';
  return '';
}

export function normalizeWorkflowJob(job = {}) {
  if (!job || typeof job !== 'object') return { ok: false, error: 'Workflow job must be an object.' };
  const sourceText = String(job.sourceText ?? '');
  if (!sourceText.trim()) return { ok: false, error: 'Workflow sourceText is required.' };
  const sourceKind = String(job.sourceKind || 'auto').toLowerCase();
  if (!XML_CII_WORKFLOW_SOURCE_KINDS.includes(sourceKind)) return { ok: false, error: 'sourceKind must be xml, inputxml, or auto.' };
  const supportValidation = validateSupportConfigJson(job.supportConfigJson ?? '{}');
  if (!supportValidation.ok) return supportValidation;
  const options = normalizeWorkflowOptions(job.options);
  const topologyError = validateTopologyOptions(sourceKind, options);
  if (topologyError) return { ok: false, error: topologyError };
  return { ok: true, job: {
    sourceKind,
    sourceText,
    sourceName: String(job.sourceName || (sourceKind === 'inputxml' ? 'input.input.xml' : 'input.xml')),
    sourceId: String(job.sourceId || job.sourceName || ''),
    branchSelection: job.branchSelection || null,
    stagedJsonText: job.stagedJsonText == null ? null : String(job.stagedJsonText),
    elementSideLoadText: job.elementSideLoadText == null ? null : String(job.elementSideLoadText),
    supportConfigJson: supportValidation.normalizedText,
    options,
    previewFacts: objectArrayValue(job.previewFacts),
    manualFacts: objectArrayValue(job.manualFacts),
    weightOverrides: job.weightOverrides && typeof job.weightOverrides === 'object' && !Array.isArray(job.weightOverrides) ? job.weightOverrides : {},
    supportMapperRules: objectArrayValue(job.supportMapperRules),
    sifFacts: objectArrayValue(job.sifFacts),
  } };
}

export function createWorkflowDiagnostics(extra = {}) {
  return {
    schema: 'xml-cii-2019-workflow-diagnostics/v1',
    sourceKind: null,
    outputKind: null,
    branch: null,
    elementCount: 0,
    enrichedElementCount: 0,
    restraintCount: 0,
    sideLoadMatched: 0,
    sideLoadUnmatched: [],
    inheritedFieldCount: 0,
    sentinelFieldCount: 0,
    engineDiagnostics: null,
    warnings: [],
    ...extra,
  };
}

export function normalizeWorkflowResult(partial = {}) {
  const sourceKind = XML_CII_WORKFLOW_RESOLVED_SOURCE_KINDS.includes(partial.sourceKind) ? partial.sourceKind : 'xml';
  const outputKind = partial.outputKind || (sourceKind === 'inputxml' ? 'enrichedInputXML' : 'enrichedXML');
  return {
    ok: partial.ok === true,
    sourceKind,
    outputKind,
    enrichedText: String(partial.enrichedText || ''),
    enrichedName: String(partial.enrichedName || ''),
    ciiText: partial.ciiText == null ? null : String(partial.ciiText),
    ciiName: partial.ciiName == null ? null : String(partial.ciiName),
    rigidLedger: partial.rigidLedger || null,
    rigidLedgerText: String(partial.rigidLedgerText || ''),
    rigidLedgerName: String(partial.rigidLedgerName || ''),
    topologyFindingsText: String(partial.topologyFindingsText || ''),
    topologyFindingsName: String(partial.topologyFindingsName || ''),
    topologyFixPlanText: String(partial.topologyFixPlanText || ''),
    topologyFixPlanName: String(partial.topologyFixPlanName || ''),
    topoFixXmlText: String(partial.topoFixXmlText || ''),
    topoFixXmlName: String(partial.topoFixXmlName || ''),
    topoFixTransactionText: String(partial.topoFixTransactionText || ''),
    topoFixTransactionName: String(partial.topoFixTransactionName || ''),
    topoFixValidationText: String(partial.topoFixValidationText || ''),
    topoFixValidationName: String(partial.topoFixValidationName || ''),
    topoFixCommitted: partial.topoFixCommitted === true,
    ciiInputSource: partial.ciiInputSource === 'topofix' ? 'topofix' : 'original',
    diagnostics: normalizedDiagnostics(partial.diagnostics, sourceKind, outputKind),
    logs: Array.isArray(partial.logs) ? partial.logs.map((line) => String(line)) : [],
    error: partial.error ? String(partial.error) : null,
  };
}
