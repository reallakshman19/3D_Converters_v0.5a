import { runStandaloneRegexTester } from '../xml-cii-regex-tester.js';
import { runStandaloneResolverJsonTrace } from '../xml-cii-resolver-json-trace.js';
import { runStandaloneManualElementSideload } from '../xml-cii-manual-element-sideload.js';
import { buildStandalonePreviewDiagnosticsAudit } from '../xml-cii-preview-diagnostics-audit.js';
import { runStandaloneWeightMatch } from '../xml-cii-weight-match.js';
import { runStandaloneSupportTypeMapper } from '../xml-cii-support-type-mapper.js';
import { buildStandaloneOutputRunReadiness } from '../xml-cii-output-run-readiness.js';
import { readTextFile } from '../xml-cii-workflow-ui-adapter.js';
import { downloadTextFile } from './xml-cii-adapted-dom.js';
import { applyPreviewDiagnosticsAuditReport, applyStandaloneManualElementSideloadResult, applyStandaloneOutputRunReadiness, applyStandaloneRegexTesterResult, applyStandaloneResolverJsonTraceResult, applyStandaloneSupportTypeMapperResult, applyStandaloneWeightMatchResult, clearWorkflowResult, patchResolverJsonTraceConfig, resetWorkflowState, updateManualElementSideloadConfig, updateRegexTesterConfig, updateResolverJsonTraceConfig, updateSupportTypeMapperConfig, updateSupportTypeMapperTestInput, updateWeightMatchOverrides, updateWorkflowOptions, updateWorkflowState } from './xml-cii-adapted-state.js';
import { detectXmlCiiWorkflowSourceKind, maskedFileName } from '../xml-cii-workflow-source-detect.js';
import { bindImportMastersEvents, clearMasterContextFromUi, loadImportMastersFromUi } from './xml-cii-adapted-master-events.js?v=20260713-v9';
import { runWorkflowFromUi } from './xml-cii-adapted-run-workflow.js';
import { bindTraceTableEvents } from './xml-cii-adapted-table-trace-events.js';
import { compareTraceResultsByComponentRef } from '../xml-cii-table-trace-source.js';
import {
  buildEvidenceTreeCsv,
  buildEvidenceTreeRows,
  buildMatchedFactsRows,
  buildMatchedFactsTsv,
  buildXmlNodeWiseTraceCsv,
  buildXmlNodeWiseTraceRows,
} from '../xml-cii-trace-export.js';

export function bindAdaptedWorkflowEvents(container, stateRef, render) {
  bindPhaseEvents(container, stateRef, render);
  bindSourceEvents(container, stateRef, render);
  bindOptionEvents(container, stateRef, render);
  bindRegexEvents(container, stateRef, render);
  bindImportMastersEvents(container, stateRef, render);
  bindResolverEvents(container, stateRef, render);
  bindTraceTableEvents(container, stateRef, render);
  bindManualEvents(container, stateRef, render);
  bindWeightMatchEvents(container, stateRef, render);
  bindSupportMapperEvents(container, stateRef, render);
  bindActionEvents(container, stateRef, render);
  bindSubTabEvents(container, stateRef, render);
}

export function replaceState(stateRef, nextState, render) { stateRef.current = nextState; render(); }
export function patchState(stateRef, patch, render) { replaceState(stateRef, updateWorkflowState(stateRef.current, patch), render); }
export function patchOptions(stateRef, optionPatch) { stateRef.current = updateWorkflowOptions(stateRef.current, optionPatch); }

export function bindSubTabEvents(container, stateRef, render) {
  container.querySelectorAll('[data-sub-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      stateRef.current = updateWorkflowState(stateRef.current, { activeSubTabId: button.dataset.subTab });
      render();
    });
  });
  container.querySelectorAll('[data-json-trace-sub-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      stateRef.current = updateWorkflowState(stateRef.current, { jsonTraceActiveSubTabId: button.dataset.jsonTraceSubTab });
      render();
    });
  });
}

export function bindPhaseEvents(container, stateRef, render) { container.querySelectorAll('[data-phase]').forEach((button) => { button.addEventListener('click', () => patchState(stateRef, { activePhaseId: button.dataset.phase }, render)); }); }

export function bindSourceEvents(container, stateRef, render) {
  onChange(container, 'source-kind', (value) => {
    const nextState = updateWorkflowState(stateRef.current, { sourceKind: value, result: null });
    const detected = detectXmlCiiWorkflowSourceKind(nextState.sourceText, 'xml');
    const actual = value === 'auto' ? detected : value;
    if (actual === 'inputxml' && nextState.activePhaseId === 'json-trace') {
      nextState.activePhaseId = 'source';
    }
    replaceState(stateRef, nextState, render);
  });
  onChange(container, 'source-file', async (_, event) => {
    try {
      const file = event.target.files?.[0] || null;
      const text = file ? await readTextFile(file) : '';
      const nextState = updateWorkflowState(stateRef.current, {
        sourceFile: file,
        sourceText: text,
        result: null,
        regexTesterResult: null,
        format1SelectedSample: '',
        format2SelectedSample: ''
      });
      const detected = detectXmlCiiWorkflowSourceKind(text, 'xml');
      const actual = nextState.sourceKind === 'auto' ? detected : nextState.sourceKind;
      if (actual === 'inputxml' && nextState.activePhaseId === 'json-trace') {
        nextState.activePhaseId = 'source';
      }
      replaceState(stateRef, nextState, render);
    } catch (err) {
      console.error('Error reading source file:', err);
    }
  });
  onChange(container, 'staged-json-file', async (_, event) => {
    try {
      const file = event.target.files?.[0] || null;
      const text = file ? await readTextFile(file) : '';
      replaceState(stateRef, updateWorkflowState(stateRef.current, { stagedJsonFile: file, stagedJsonText: text, result: null }), render);
    } catch (err) {
      console.error('Error reading staged json file:', err);
    }
  });
  onChange(container, 'source-text', (value) => {
    const nextState = clearWorkflowResult(updateWorkflowState(stateRef.current, {
      sourceText: value,
      regexTesterResult: null,
      format1SelectedSample: '',
      format2SelectedSample: ''
    }));
    const detected = detectXmlCiiWorkflowSourceKind(value, 'xml');
    const actual = nextState.sourceKind === 'auto' ? detected : nextState.sourceKind;
    if (actual === 'inputxml' && nextState.activePhaseId === 'json-trace') {
      nextState.activePhaseId = 'source';
    }
    replaceState(stateRef, nextState, render);
  });
  onChange(container, 'element-side-load', (value) => { stateRef.current = clearWorkflowResult(updateWorkflowState(stateRef.current, { elementSideLoadText: value })); render(); });
  onChange(container, 'support-config', (value) => patchState(stateRef, { supportConfigJson: value, masterContext: null, result: null }, render));
}

export function bindOptionEvents(container, stateRef, render) {
  onChange(container, 'inputxml-output-mode', (value) => patchOptions(stateRef, { inputXmlOutputMode: value }));
  onChange(container, 'point-properties-basis', (value) => patchOptions(stateRef, { pointPropertiesBasis: value }));
  onChange(container, 'inputxml-restraint-policy', (value) => patchOptions(stateRef, { inputXmlRestraintPolicy: value }));
  onChange(container, 'fill-sentinel', (_, event) => patchOptions(stateRef, { fillSentinelFromLineContext: !!event.target.checked }));
  onChange(container, 'pressure-aliases', (_, event) => patchOptions(stateRef, { normalizePressureCaseNames: !!event.target.checked }));
  onChange(container, 'coords-mode', (value) => patchOptions(stateRef, { coordsMode: value }));
  onChange(container, 'kg-to-newton', (_, event) => patchOptions(stateRef, { kgToNewton: !!event.target.checked }));
  onChange(container, 'json-restraints', (_, event) => patchOptions(stateRef, { useRestraintTypeBasedOnJson: !!event.target.checked }));
  onChange(container, 'split-condensed', (value) => patchOptions(stateRef, { splitCondensedValveFlange: parseTriState(value) }));
  onChange(container, 'output-mode', (value) => patchOptions(stateRef, { outputMode: value }));
}

export function bindRegexEvents(container, stateRef, render) {
  container.querySelectorAll('[data-field^="regex-"]').forEach((input) => {
    input.addEventListener('change', () => {
      stateRef.current = updateRegexTesterConfig(stateRef.current, input.dataset.field, input.value);
      const result = runStandaloneRegexTester({
        ...stateRef.current,
        sourceText: stateRef.current.sourceText,
        extractionConfig: stateRef.current.regexTesterConfig
      });
      stateRef.current = updateWorkflowState(stateRef.current, { regexTesterResult: result });
      render();
    });
  });
}

export function bindResolverEvents(container, stateRef, render) {
  onChange(container, 'resolver-json-config', (value) => { stateRef.current = updateResolverJsonTraceConfig(stateRef.current, value); });
  const useDelimiterInput = container.querySelector('[data-field="resolver-use-delimiter"]');
  if (useDelimiterInput) {
    useDelimiterInput.addEventListener('change', (event) => {
      stateRef.current = patchResolverJsonTraceConfig(stateRef.current, { useDelimiter: !!event.target.checked });
      render();
    });
  }
  onChange(container, 'resolver-delimiter', (value) => {
    stateRef.current = patchResolverJsonTraceConfig(stateRef.current, { delimiter: value || '|' });
    render();
  });
  onChange(container, 'resolver-join-mode', (value) => {
    stateRef.current = patchResolverJsonTraceConfig(stateRef.current, { joinMode: value || 'unique' });
    render();
  });
  onChange(container, 'resolver-coordinate-tolerance', (value) => {
    const tol = parseFloat(value);
    if (Number.isFinite(tol) && tol >= 0) {
      stateRef.current = patchResolverJsonTraceConfig(stateRef.current, { coordinateTolerance: tol });
      render();
    }
  });
}
export function bindManualEvents(container, stateRef, render) { for (const field of ['manual-policy', 'manual-tolerance', 'manual-restraints-text']) onChange(container, field, (value) => { stateRef.current = updateManualElementSideloadConfig(stateRef.current, field, value); }); }
export function bindWeightMatchEvents(container, stateRef, render) { onChange(container, 'weight-match-overrides', (value) => { stateRef.current = updateWeightMatchOverrides(stateRef.current, value); }); }

export function bindSupportMapperEvents(container, stateRef, render) {
  onChange(container, 'support-mapper-test-input', (value) => { stateRef.current = updateSupportTypeMapperTestInput(stateRef.current, value); });
  container.querySelectorAll('[data-field^="support-mapper-aliases-"], [data-field^="support-mapper-cii-"]').forEach((input) => {
    input.addEventListener('change', () => { stateRef.current = updateSupportTypeMapperConfig(stateRef.current, input.dataset.field, input.value); });
  });
}

export function bindActionEvents(container, stateRef, render) {
  onClick(container, 'test-regex', () => testRegexFromUi(stateRef, render, false));
  onClick(container, 'save-regex-config', () => testRegexFromUi(stateRef, render, true));
  onClick(container, 'build-resolver-index', () => runResolverJsonTraceFromUi(container, stateRef, render, false));
  onClick(container, 'save-resolver-json-config', () => runResolverJsonTraceFromUi(container, stateRef, render, true));
  onClick(container, 'download-evidence-tree-csv', () => downloadResolverTraceCsvFromUi(stateRef, render, 'evidence-tree'));
  onClick(container, 'download-node-wise-trace-csv', () => downloadResolverTraceCsvFromUi(stateRef, render, 'node-wise-trace'));
  onClick(container, 'copy-matched-facts', () => copyMatchedFactsFromUi(stateRef, render));
  onClick(container, 'run-manual-element-sideload', () => runManualElementSideloadFromUi(container, stateRef, render, false));
  onClick(container, 'save-manual-element-sideload', () => runManualElementSideloadFromUi(container, stateRef, render, true));
  onClick(container, 'build-preview-audit', () => buildPreviewAuditFromUi(stateRef, render));
  onClick(container, 'build-weight-match', () => runWeightMatchFromUi(stateRef, render, false));
  onClick(container, 'finalize-weight-match', () => runWeightMatchFromUi(stateRef, render, true));
  onClick(container, 'build-support-mapper', () => runSupportMapperFromUi(stateRef, render, false));
  onClick(container, 'save-support-mapper', () => runSupportMapperFromUi(stateRef, render, true));
  onClick(container, 'refresh-output-run', () => refreshOutputRunFromUi(stateRef, render));
  onClick(container, 'load-import-masters', () => loadImportMastersFromUi(stateRef, render));
  onClick(container, 'clear-master-context', () => clearMasterContextFromUi(stateRef, render));
  onClick(container, 'run', () => runWorkflowFromUi(stateRef, render));
  for (const kind of ['enriched', 'cii', 'rigid-ledger', 'diagnostics', 'manifest']) onClick(container, `download-${kind}`, () => downloadArtifact(stateRef.current, kind));
  onClick(container, 'clear', () => replaceState(stateRef, resetWorkflowState(), render));
}

export async function testRegexFromUi(stateRef, render, save) { stateRef.current = updateWorkflowState(stateRef.current, { regexTesterRunning: true }); render(); const sourceText = await sourceTextFromState(stateRef.current); const result = runStandaloneRegexTester({ ...stateRef.current, sourceText, extractionConfig: stateRef.current.regexTesterConfig }); stateRef.current = save ? applyStandaloneRegexTesterResult(stateRef.current, result) : updateWorkflowState(stateRef.current, { regexTesterResult: result, regexTesterRunning: false }); render(); }
export async function runResolverJsonTraceFromUi(container, stateRef, render, save) {
  stateRef.current = updateWorkflowState(stateRef.current, { resolverJsonTraceRunning: true, resolverJsonTraceExportStatus: '' });
  render();
  const tx = container.querySelector('[data-field="resolver-json-config"]');
  if (tx) stateRef.current = updateResolverJsonTraceConfig(stateRef.current, tx.value);
  const sourceText = await sourceTextFromState(stateRef.current);
  const stagedJsonText = await stagedJsonTextFromState(stateRef.current);
  const result = runStandaloneResolverJsonTrace({ ...stateRef.current, sourceText, stagedJsonText, jsonConfig: stateRef.current.resolverJsonTraceConfig });
  const benchmark = stateRef.current.resolverJsonTraceTableResult
    ? compareTraceResultsByComponentRef(result, stateRef.current.resolverJsonTraceTableResult)
    : stateRef.current.jsonTraceTableBenchmark;
  stateRef.current = save ?
    updateWorkflowState(applyStandaloneResolverJsonTraceResult(stateRef.current, result), { jsonTraceTableBenchmark: benchmark, resolverJsonTraceExportStatus: '' }) :
    updateWorkflowState(stateRef.current, {
      resolverJsonTraceResult: result,
      resolverJsonTraceJsonResult: result,
      jsonTraceTableBenchmark: benchmark,
      resolverJsonTraceRunning: false,
      resolverJsonTraceExportStatus: '',
      resolverJsonTraceWriteBackStatus: `Resolver index built: ${result.resolvedFacts.length} facts processed.`
    });
  render();
}
export async function runManualElementSideloadFromUi(container, stateRef, render, save) {
  stateRef.current = updateWorkflowState(stateRef.current, { manualElementSideloadRunning: true });
  render();
  const tx = container.querySelector('[data-field="manual-restraints-text"]');
  if (tx) stateRef.current = updateManualElementSideloadConfig(stateRef.current, 'manual-restraints-text', tx.value);
  const pol = container.querySelector('[data-field="manual-policy"]');
  if (pol) stateRef.current = updateManualElementSideloadConfig(stateRef.current, 'manual-policy', pol.value);
  const tol = container.querySelector('[data-field="manual-tolerance"]');
  if (tol) stateRef.current = updateManualElementSideloadConfig(stateRef.current, 'manual-tolerance', tol.value);
  const sourceText = await sourceTextFromState(stateRef.current);
  const result = runStandaloneManualElementSideload({ ...stateRef.current, sourceText, config: stateRef.current.manualElementSideloadConfig });
  stateRef.current = save ? applyStandaloneManualElementSideloadResult(stateRef.current, result) : updateWorkflowState(stateRef.current, { manualElementSideloadResult: result, manualElementSideloadRunning: false });
  render();
}
export function buildPreviewAuditFromUi(stateRef, render) { stateRef.current = applyPreviewDiagnosticsAuditReport(stateRef.current, buildStandalonePreviewDiagnosticsAudit(stateRef.current)); render(); }
export function runWeightMatchFromUi(stateRef, render, finalize) { stateRef.current = updateWorkflowState(stateRef.current, { weightMatchRunning: true }); render(); const result = runStandaloneWeightMatch({ ...stateRef.current, weightMatchOverridesJson: stateRef.current.weightMatchOverridesJson }); stateRef.current = applyStandaloneWeightMatchResult(stateRef.current, result, finalize); render(); }
export function runSupportMapperFromUi(stateRef, render, save) { stateRef.current = updateWorkflowState(stateRef.current, { supportTypeMapperRunning: true }); render(); const result = runStandaloneSupportTypeMapper({ ...stateRef.current, mapperRows: stateRef.current.supportTypeMapperConfig, testInput: stateRef.current.supportTypeMapperTestInput }); stateRef.current = applyStandaloneSupportTypeMapperResult(stateRef.current, result, save); render(); }
export function refreshOutputRunFromUi(stateRef, render) { stateRef.current = applyStandaloneOutputRunReadiness(stateRef.current, buildStandaloneOutputRunReadiness(stateRef.current)); render(); }

function traceResult(state) {
  return state?.resolverJsonTraceResult || state?.resolverJsonTraceJsonResult || null;
}

export function downloadResolverTraceCsvFromUi(stateRef, render, kind) {
  const result = traceResult(stateRef.current);
  const isEvidence = kind === 'evidence-tree';
  const rowCount = isEvidence ? buildEvidenceTreeRows(result).length : buildXmlNodeWiseTraceRows(result).length;
  if (!rowCount) {
    stateRef.current = updateWorkflowState(stateRef.current, { resolverJsonTraceExportStatus: 'No trace rows are available for export.' });
    render();
    return null;
  }
  const content = isEvidence ? buildEvidenceTreeCsv(result) : buildXmlNodeWiseTraceCsv(result);
  const fileName = isEvidence ? 'xml-cii-evidence-tree.csv' : 'xml-cii-node-wise-trace.csv';
  downloadTextFile(fileName, content, 'text/csv;charset=utf-8');
  stateRef.current = updateWorkflowState(stateRef.current, { resolverJsonTraceExportStatus: `Downloaded ${rowCount} ${isEvidence ? 'evidence' : 'node-trace'} row(s) as CSV.` });
  render();
  return { fileName, rowCount, content };
}

async function writeClipboardText(value) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  if (typeof document === 'undefined' || !document.body) throw new Error('Clipboard API is unavailable.');
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  if (textarea.style) Object.assign(textarea.style, { position: 'fixed', left: '-9999px', top: '0' });
  document.body.appendChild(textarea);
  textarea.select?.();
  const copied = document.execCommand?.('copy') === true;
  textarea.remove?.();
  if (!copied) throw new Error('Clipboard copy was rejected by the browser.');
  return true;
}

export async function copyMatchedFactsFromUi(stateRef, render) {
  const result = traceResult(stateRef.current);
  const matchedRows = buildMatchedFactsRows(result);
  if (!matchedRows.length) {
    stateRef.current = updateWorkflowState(stateRef.current, { resolverJsonTraceExportStatus: 'No matched facts are available to copy.' });
    render();
    return false;
  }
  try {
    await writeClipboardText(buildMatchedFactsTsv(result));
    stateRef.current = updateWorkflowState(stateRef.current, { resolverJsonTraceExportStatus: `Copied ${matchedRows.length} matched fact row(s) with headers.` });
    render();
    return true;
  } catch (error) {
    stateRef.current = updateWorkflowState(stateRef.current, { resolverJsonTraceExportStatus: `Copy failed: ${error?.message || 'Clipboard unavailable.'}` });
    render();
    return false;
  }
}

export async function sourceTextFromState(state) {
  if (state.sourceText) return state.sourceText;
  if (state.sourceFile) {
    try { return await readTextFile(state.sourceFile) || ''; } catch { return ''; }
  }
  return '';
}
export async function stagedJsonTextFromState(state) {
  if (state.stagedJsonText) return state.stagedJsonText;
  if (state.stagedJsonFile) {
    try { return await readTextFile(state.stagedJsonFile) || ''; } catch { return ''; }
  }
  return '';
}

function artifactText(state, kind) {
  const report = state.outputRunReadinessReport || buildStandaloneOutputRunReadiness(state);
  if (kind === 'enriched') return { name: state.result?.enrichedName, text: state.result?.enrichedText, mime: 'application/xml;charset=utf-8' };
  if (kind === 'cii') return { name: state.result?.ciiName, text: state.result?.ciiText, mime: 'text/plain;charset=utf-8' };
  if (kind === 'rigid-ledger') return { name: state.result?.rigidLedgerName || 'rigid_ledger.json', text: state.result?.rigidLedgerText, mime: 'application/json;charset=utf-8' };
  if (kind === 'diagnostics') return { name: 'xml-cii-diagnostics.json', text: JSON.stringify(state.result?.diagnostics || {}, null, 2), mime: 'application/json;charset=utf-8' };
  return { name: 'xml-cii-run-manifest.json', text: JSON.stringify(report.manifest || {}, null, 2), mime: 'application/json;charset=utf-8' };
}

export function downloadArtifact(state, kind) {
  const artifact = artifactText(state, kind);
  if (!artifact.text) return null;
  return downloadTextFile(maskedFileName(artifact.name || `xml-cii-${kind}.txt`), artifact.text, artifact.mime);
}

export function parseTriState(value) { if (value === 'true') return true; if (value === 'false') return false; return null; }
export function onChange(container, field, handler) { container.querySelector(`[data-field="${field}"]`)?.addEventListener('change', (event) => handler(event.target.value, event)); }
export function onClick(container, action, handler) { container.querySelector(`[data-action="${action}"]`)?.addEventListener('click', handler); }
