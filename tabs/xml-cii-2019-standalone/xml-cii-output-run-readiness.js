import { detectXmlCiiWorkflowSourceKind } from './xml-cii-workflow-source-detect.js';

function text(value) { return String(value ?? '').trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function bytes(value) { return new TextEncoder().encode(String(value ?? '')).length; }

function parseConfig(value) {
  try { return { ok: true, value: JSON.parse(text(value) || '{}') }; }
  catch (error) { return { ok: false, error: error?.message || String(error) }; }
}

function sourceText(input) { return text(input.sourceText || input.sourceFileText); }
function resolvedKind(input) { return input.sourceKind === 'auto' ? detectXmlCiiWorkflowSourceKind(sourceText(input)) : (input.sourceKind || 'xml'); }
function hasResult(input) { return !!input.result?.enrichedText || !!input.result?.ciiText || !!input.result?.topologyFindingsText || input.result?.ok === true; }

function row(id, label, ok, message, opts = {}) {
  return { id, label, status: ok ? 'ready' : (opts.status || 'missing'), severity: ok ? 'ok' : (opts.severity || 'warning'), blocking: !!opts.blocking && !ok, message, detail: opts.detail || '' };
}

function topologyActionIds(input) {
  const value = input.options?.topologyActionIds;
  const rows = Array.isArray(value) ? value : String(value ?? '').split(/[\s,;]+/);
  return [...new Set(rows.map((entry) => String(entry).trim()).filter(Boolean))];
}

function optionRows(input, kind) {
  const rows = [row('source-loaded', 'Source loaded', !!sourceText(input) || !!input.sourceFile, 'Source text or file is available.', { blocking: true, severity: 'error' })];
  rows.push(row('source-kind', 'Source kind resolved', ['xml', 'inputxml'].includes(kind), `Resolved source kind: ${kind}.`, { blocking: true, severity: 'error' }));
  rows.push(row('support-config-valid', 'Support config valid', parseConfig(input.supportConfigJson).ok, 'Support/config JSON is parseable.', { blocking: true, severity: 'error' }));
  rows.push(row('output-mode', 'Output mode selected', !!input.options?.outputMode, `Output mode: ${input.options?.outputMode || 'not selected'}.`, { blocking: true, severity: 'error' }));
  return rows;
}

function topologyRows(input, kind) {
  const options = input.options || {};
  const requested = options.analyzeTopology === true || options.generateTopoFix === true || options.useTopoFixForCii === true;
  if (!requested) return [];
  const ids = topologyActionIds(input);
  return [
    row('topology-source-mode', 'PSI116 topology source mode', kind === 'xml', kind === 'xml' ? 'Topology analysis will run against the effective PSI116 XML.' : 'Topology analysis is not available for InputXML source mode.', { blocking: true, severity: 'error' }),
    row('topology-analysis-enabled', 'Analyze PSI116 topology', options.analyzeTopology === true, 'Analyze topology must be enabled before correction.', { blocking: options.generateTopoFix === true || options.useTopoFixForCii === true, severity: 'error' }),
    row('topofix-action-ids', 'Reviewed TopoFix action IDs', options.generateTopoFix !== true || ids.length > 0, options.generateTopoFix === true ? `${ids.length} reviewed action ID(s) selected.` : 'No correction requested; action IDs are optional.', { blocking: options.generateTopoFix === true, severity: 'error' }),
    row('topofix-use-dependency', 'Use committed TopoFix for CII dependency', options.useTopoFixForCii !== true || options.generateTopoFix === true, options.useTopoFixForCii === true ? 'CII will use the fixed XML only after the transaction commits.' : 'CII will use the original effective XML.', { blocking: options.useTopoFixForCii === true, severity: 'error' }),
    row('topofix-output-mode', 'TopoFix CII output mode', options.useTopoFixForCii !== true || ['cii-only', 'both'].includes(options.outputMode), options.useTopoFixForCii === true ? `Output mode ${options.outputMode || 'not selected'} must include CII.` : 'TopoFix is not selected as CII input.', { blocking: options.useTopoFixForCii === true, severity: 'error' }),
  ];
}

function xmlRows(input) {
  const regex = !!input.regexTesterResult;
  const resolver = !!input.resolverJsonTraceResult;
  const manual = !!input.manualElementSideloadResult;
  return [
    row('regex', 'Regex status for XML mode', regex, regex ? 'Regex tester result is available.' : 'Regex tester has not been run yet.'),
    row('resolver-json', 'Resolver / JSON Trace status for XML mode', resolver, resolver ? 'Resolver / JSON Trace result is available.' : 'Resolver / JSON Trace has not been built yet.'),
    row('manual-restraints', 'Manual restraints status for XML mode', manual, manual ? 'Manual restraint review result is available.' : 'Manual restraint review has not been run yet.'),
  ];
}

function inputXmlRows(input) {
  const matched = Number(input.manualElementSideloadResult?.summary?.matchedRows || input.result?.diagnostics?.sideLoadMatched || 0);
  return [row('inputxml-side-load', 'InputXML side-load status', matched > 0 || !!text(input.elementSideLoadText), `InputXML side-load evidence rows: ${matched || 'not built yet'}.`)];
}

function cachedRows(storageKey, picker) {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return picker(parsed?.data ?? parsed);
  } catch { return false; }
}

function previewDone(input) {
  if (input.previewDiagnosticsAuditReport) return true;
  return ['xml-cii-pv-cache-v6', 'xml-cii-pv-cache-v5'].some((key) => cachedRows(key, (data) => array(data?.branchRows).length > 0 || array(data?.nodeRows).length > 0));
}

function weightMatchDone(input) {
  if (input.weightMatchResult) return true;
  return cachedRows('xml-cii-wm-cache-v1', (data) => array(data).length > 0);
}

function supportMapperDone(input) {
  if (input.supportTypeMapperResult || array(input.supportTypeMapperConfig).length) return true;
  const parsed = parseConfig(input.supportConfigJson);
  if (!parsed.ok) return false;
  if (array(parsed.value?.supportMapperRules).length > 0) return true;
  const kindMap = parsed.value?.supportKindToXmlType;
  if (kindMap && typeof kindMap === 'object' && Object.keys(kindMap).length > 0) return true;
  return array(parsed.value?.keywordRules).length > 0;
}

function commonRows(input) {
  const preview = previewDone(input);
  const weight = weightMatchDone(input);
  const mapper = supportMapperDone(input);
  return [
    row('import-masters', 'Import Masters status', !!input.masterContext, 'Master context is available.'),
    row('preview-audit', 'Preview / Diagnostics / Matched Audit status', preview, preview ? 'Preview / dry-run data is available.' : 'Preview has not been built yet.'),
    row('weight-match', 'Weight Match status', weight, weight ? (input.weightMatchStatus || 'Weight Match data is available.') : 'Weight Match result is not available.'),
    row('support-mapper', 'Support Type Mapper status', mapper, mapper ? (input.supportTypeMapperStatus || 'Support mapper rules are available.') : 'Support mapper result is not available.'),
    row('run-result', 'Run result available after run', hasResult(input), hasResult(input) ? 'Run result is available.' : 'No run result yet.', { status: 'pending' }),
  ];
}

export function buildOutputRunChecklist(input = {}) {
  const kind = resolvedKind(input);
  return [...optionRows(input, kind), ...topologyRows(input, kind), ...commonRows(input), ...(kind === 'inputxml' ? inputXmlRows(input) : xmlRows(input))];
}

function artifact(kind, label, name, value, mime) {
  const available = text(value).length > 0;
  return { kind, label, available, filename: available ? name : '', bytes: available ? bytes(value) : 0, mime, downloadAction: available ? `download-${kind}` : '' };
}

export function buildOutputArtifactRows(input = {}, manifest = {}) {
  const result = object(input.result);
  return [
    artifact('enriched', 'Enriched XML/InputXML', result.enrichedName || 'enriched-output.xml', result.enrichedText, 'application/xml;charset=utf-8'),
    artifact('cii', 'CII', result.ciiName || 'output.cii', result.ciiText, 'text/plain;charset=utf-8'),
    artifact('rigid-ledger', 'Actual Python RIGID auxiliary ledger JSON', result.rigidLedgerName || 'rigid_ledger.json', result.rigidLedgerText, 'application/json;charset=utf-8'),
    artifact('diagnostics', 'Diagnostics JSON', 'xml-cii-diagnostics.json', result.diagnostics ? JSON.stringify(result.diagnostics, null, 2) : '', 'application/json;charset=utf-8'),
    artifact('manifest', 'Run Manifest JSON', 'xml-cii-run-manifest.json', hasResult(input) ? JSON.stringify(manifest, null, 2) : '', 'application/json;charset=utf-8'),
  ];
}

function countRows(value) { return Array.isArray(value) ? value.length : 0; }
function summaryCount(value, key) { return Number(value?.summary?.[key] || value?.[key] || 0); }

export function buildRunManifest(input = {}) {
  const kind = resolvedKind(input);
  const result = object(input.result);
  return {
    schema: 'xml-cii-2019-output-run-manifest/v1',
    sourceMode: kind,
    outputMode: input.options?.outputMode || 'enriched-only',
    sourceBytes: sourceText(input).length ? bytes(sourceText(input)) : Number(input.sourceFile?.size || 0),
    masterRowCounts: object(input.masterContext?.rowCounts),
    regex: { matched: summaryCount(input.regexTesterResult, 'matchedCount'), rejected: summaryCount(input.regexTesterResult, 'rejectedCount') },
    resolver: { matched: summaryCount(input.resolverJsonTraceResult, 'matchedFacts'), rejected: summaryCount(input.resolverJsonTraceResult, 'rejectedFacts') },
    manualOrSideLoad: { matched: summaryCount(input.manualElementSideloadResult, 'matchedRows'), rejected: summaryCount(input.manualElementSideloadResult, 'rejectedRows') },
    previewAudit: { matched: summaryCount(input.previewDiagnosticsAuditReport, 'matchedFacts'), rejected: summaryCount(input.previewDiagnosticsAuditReport, 'rejectedFacts') },
    weightMatch: { issues: countRows(input.weightMatchResult?.issueRows), finalized: countRows(input.weightMatchResult?.finalizedRows) },
    supportMapper: { previewRows: countRows(input.supportTypeMapperResult?.previewRows), diagnostics: countRows(input.supportTypeMapperResult?.diagnostics) },
    topology: {
      analyze: input.options?.analyzeTopology === true,
      generateTopoFix: input.options?.generateTopoFix === true,
      useTopoFixForCii: input.options?.useTopoFixForCii === true,
      selectedActionIds: topologyActionIds(input),
      committed: result.topoFixCommitted === true,
      ciiInputSource: result.ciiInputSource || 'original',
    },
    artifacts: { enriched: !!result.enrichedText, cii: !!result.ciiText, rigidLedger: !!result.rigidLedgerText, topologyFindings: !!result.topologyFindingsText, topologyPlan: !!result.topologyFixPlanText, topoFixXml: !!result.topoFixXmlText, diagnostics: !!result.diagnostics, manifest: hasResult(input) },
  };
}

function runLogLevel(message) {
  if (/traceback|error|exception|^stderr:/i.test(message)) return 'error';
  if (/warning/i.test(message)) return 'warning';
  return 'info';
}

function logRows(input, checklistRows) {
  const fromResult = array(input.result?.logs).map((message) => ({ level: runLogLevel(text(message)), source: 'run', message: text(message) }));
  if (input.result?.error) fromResult.push({ level: 'error', source: 'run', message: text(input.result.error) });
  const fromChecklist = checklistRows.filter((item) => item.status !== 'ready').map((item) => ({ level: item.severity, source: 'readiness', message: `${item.label}: ${item.message}` }));
  return [...fromChecklist, ...fromResult];
}

function readinessDiagnostics(checklistRows) {
  return checklistRows.filter((item) => item.blocking || item.severity === 'warning').map((item) => ({ level: item.blocking ? 'error' : 'warning', source: 'output-run', type: item.id, message: item.message }));
}

export function buildStandaloneOutputRunReadiness(input = {}) {
  const checklistRows = buildOutputRunChecklist(input);
  const manifest = buildRunManifest(input);
  const artifactRows = buildOutputArtifactRows(input, manifest);
  const blockingCount = checklistRows.filter((item) => item.blocking).length;
  return {
    summary: { sourceMode: resolvedKind(input), blockingCount, checklistCount: checklistRows.length, artifactCount: artifactRows.filter((item) => item.available).length },
    checklistRows,
    artifactRows,
    logRows: logRows(input, checklistRows),
    manifest,
    diagnostics: readinessDiagnostics(checklistRows),
    raw: { resultOk: input.result?.ok === true, sourceKind: input.sourceKind || 'auto' },
  };
}
