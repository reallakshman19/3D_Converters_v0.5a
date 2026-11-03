import { buildStandaloneOutputRunReadiness } from '../xml-cii-output-run-readiness.js';
import { detectXmlCiiWorkflowSourceKind, maskedFileName } from '../xml-cii-workflow-source-detect.js';
import { createElement, createOption, downloadTextFile } from './xml-cii-adapted-dom.js';
import { updateWorkflowOptions, applyStandaloneOutputRunReadiness, updateWorkflowState, xmlCiiEnrichedConfigFromState } from './xml-cii-adapted-state.js';
import { deriveLineKeyFromBranchName } from '../../../converters/xml-cii2019-core/regex-line-key.js';
import { renderAdaptedCiiPreviewCanvas } from './xml-cii-adapted-cii-preview-canvas.js';
import {
  outputReviewRawRef,
  runOutputEmpiricalReviewFromUi,
} from './xml-cii-adapted-output-empirical-review.js';
import { digestXmlCiiParityText } from '../xml-cii-run-parity-evidence.js';

const autoReviewFingerprints = new WeakMap();
const activeReviews = new WeakSet();
function rows(value) { return Array.isArray(value) ? value : []; }

export function outputEmpiricalReviewFingerprint(state = {}) {
  const sources = Array.isArray(state.sourceBatch?.sources) && state.sourceBatch.sources.length
    ? state.sourceBatch.sources.filter((source) => source.enabled !== false).map((source) => [
        source.sourceId, source.sourceText, source.stagedJsonText,
        source.supportConfigJson, source.branchSelection, source.workflow,
      ])
    : [[state.sourceNameOverride, state.sourceText, state.stagedJsonText,
      state.supportConfigJson, state.branchSelection, state.previewDiagnosticsAuditReport?.matchedFacts]];
  return digestXmlCiiParityText(JSON.stringify(sources));
}

export async function triggerOutputEmpiricalReview(stateRef, {
  manualInspection = false, onStatus = () => {}, ...options
} = {}) {
  const rawRef = outputReviewRawRef(stateRef);
  if (activeReviews.has(rawRef)) {
    onStatus('Empirical inspection is already running; use the dialog that is currently opening.');
    return null;
  }
  activeReviews.add(rawRef);
  try {
    return await runOutputEmpiricalReviewFromUi(stateRef, {
      ...options, manualInspection, onStatus,
    });
  } catch (error) {
    const reason = 'Empirical Output / Run inspection could not finish: ' +
      String(error?.message || error) + '. No weights were silently approved.';
    onStatus(reason);
    return { ok: false, error: reason };
  } finally {
    // Prevent repeated automatic prompts after the user has just approved a
    // correction and the workspace re-renders with its new support config.
    autoReviewFingerprints.set(rawRef, outputEmpiricalReviewFingerprint(rawRef.current));
    activeReviews.delete(rawRef);
  }
}
function text(value) { return String(value ?? ''); }

function section(parent, title) {
  const el = createElement('section', '', 'xml-cii-weight-panel');
  el.appendChild(createElement('h3', title));
  parent.appendChild(el);
  return el;
}

function button(action, label, disabled = false) {
  const el = createElement('button', label);
  el.type = 'button';
  el.dataset.action = action;
  el.disabled = !!disabled;
  return el;
}

function table(headers, data, emptyText) {
  if (!data.length) return createElement('div', emptyText, 'xml-cii-phase-help');
  const el = createElement('table', '', 'xml-cii-weight-table');
  const head = createElement('thead');
  const hr = createElement('tr');
  for (const header of headers) hr.appendChild(createElement('th', header));
  head.appendChild(hr);
  el.append(head, tableBody(headers, data));
  return el;
}

function tableBody(headers, data) {
  const body = createElement('tbody');
  for (const item of data.slice(0, 80)) {
    const tr = createElement('tr');
    for (const header of headers) tr.appendChild(createElement('td', text(valueFor(item, header))));
    body.appendChild(tr);
  }
  return body;
}

function valueFor(item, header) {
  const key = { ID: 'id', Label: 'label', Status: 'status', Severity: 'severity', Blocking: 'blocking', Message: 'message', Kind: 'kind', Artifact: 'label', Available: 'available', Filename: 'filename', Bytes: 'bytes', Level: 'level', Source: 'source' }[header] || header;
  return item?.[key] ?? item?.[header];
}

function reportFromState(state) {
  return state.outputRunReadinessReport || buildStandaloneOutputRunReadiness(state);
}

function renderSummary(parent, report) {
  const panel = section(parent, 'Pre-run Summary');
  panel.appendChild(table(['Source', 'Status', 'Message'], [
    { Source: 'source mode', Status: report.summary.sourceMode, Message: `${report.summary.blockingCount} blocking items` },
    { Source: 'artifacts', Status: report.summary.artifactCount, Message: 'available artifacts' },
  ], 'No readiness summary yet.'));
}

function renderChecklist(parent, report) {
  const panel = section(parent, 'Pre-run Checklist');
  panel.appendChild(table(['ID', 'Label', 'Status', 'Severity', 'Blocking', 'Message'], rows(report.checklistRows), 'No checklist rows yet.'));
}

function renderArtifacts(parent, state, report) {
  const panel = section(parent, 'Output Artifacts / Downloads');
  panel.appendChild(table(['Kind', 'Artifact', 'Available', 'Filename', 'Bytes'], rows(report.artifactRows), 'No artifact rows yet.'));
  const buttonsDiv = createElement('div');
  buttonsDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;';
  for (const row of rows(report.artifactRows)) {
    const btn = button(row.downloadAction || `download-${row.kind}`, `Download ${row.label}`, !row.available);
    btn.style.cssText = `cursor:pointer;padding:6px 12px;border-radius:6px;background:${row.available ? '#1e293b' : '#334155'};color:${row.available ? '#cbd5e1' : '#64748b'};border:1px solid #334155;font-size:12px;`;
    btn.dataset.action = row.downloadAction || `download-${row.kind}`;
    buttonsDiv.appendChild(btn);
  }
  panel.appendChild(buttonsDiv);
  renderAdaptedCiiPreviewCanvas(panel, state, report);
}

function topologyArtifactRows(result) {
  return [
    { kind: 'topology-findings', label: 'Topology Findings JSON', filename: result?.topologyFindingsName, value: result?.topologyFindingsText, mime: 'application/json;charset=utf-8' },
    { kind: 'topology-plan', label: 'Topology Fix Plan JSON', filename: result?.topologyFixPlanName, value: result?.topologyFixPlanText, mime: 'application/json;charset=utf-8' },
    { kind: 'topofix-xml', label: 'Committed TopoFix XML', filename: result?.topoFixXmlName, value: result?.topoFixXmlText, mime: 'application/xml;charset=utf-8' },
    { kind: 'topofix-transaction', label: 'TopoFix Transaction JSON', filename: result?.topoFixTransactionName, value: result?.topoFixTransactionText, mime: 'application/json;charset=utf-8' },
    { kind: 'topofix-validation', label: 'TopoFix Validation JSON', filename: result?.topoFixValidationName, value: result?.topoFixValidationText, mime: 'application/json;charset=utf-8' },
  ].map((row) => ({ ...row, available: text(row.value).length > 0, bytes: new TextEncoder().encode(text(row.value)).length }));
}

function renderTopologyArtifacts(parent, state) {
  const requested = state.options?.analyzeTopology === true || state.options?.generateTopoFix === true || !!state.result?.topologyFindingsText;
  if (!requested) return;
  const panel = section(parent, 'Topology Sidecars / Downloads');
  const data = topologyArtifactRows(state.result);
  panel.appendChild(table(['Kind', 'Artifact', 'Available', 'Filename', 'Bytes'], data.map((row) => ({ ...row, Artifact: row.label, Kind: row.kind, Available: row.available, Filename: row.filename || '', Bytes: row.bytes })), 'Run topology analysis to build sidecars.'));
  const actions = createElement('div');
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;';
  for (const row of data) {
    const control = button(`download-${row.kind}`, `Download ${row.label}`, !row.available);
    control.style.cssText = 'cursor:pointer;padding:6px 12px;border-radius:6px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;font-size:12px;';
    control.addEventListener('click', () => {
      if (!row.available) return;
      downloadTextFile(maskedFileName(row.filename || `${row.kind}.txt`), row.value, row.mime);
    });
    actions.appendChild(control);
  }
  panel.appendChild(actions);
  if (state.result?.topologyFindingsText) {
    const status = state.result?.topoFixCommitted === true ? 'Committed TopoFix available.' : (state.options?.generateTopoFix ? 'TopoFix was not committed; inspect transaction/validation reports.' : 'Analysis-only sidecars available.');
    panel.appendChild(createElement('div', `${status} CII input: ${state.result?.ciiInputSource || 'original'}.`, 'model-converters-workflow-detail-note'));
  }
}

function renderLogs(parent, report) {
  const panel = section(parent, 'Logs');
  panel.appendChild(table(['Level', 'Source', 'Message'], rows(report.logRows), 'No logs yet.'));
}

function renderManifest(parent, report) {
  const panel = section(parent, 'Run Manifest');
  panel.appendChild(createElement('pre', JSON.stringify(report.manifest || {}, null, 2)));
}

function renderRaw(parent, report) {
  const details = createElement('details', '', 'xml-cii-weight-panel');
  details.appendChild(createElement('summary', 'Raw JSON advanced/debug'));
  details.appendChild(createElement('pre', JSON.stringify(report.raw || {}, null, 2)));
  parent.appendChild(details);
}

function runStatusRow(ok, label, value) {
  const rowEl = createElement('div', '', 'model-converters-workflow-run-status-row');
  rowEl.append(
    createElement('span', ok ? 'OK' : '!', `model-converters-workflow-run-status-icon ${ok ? 'ok' : 'warn'}`),
    createElement('span', ` ${label} `),
    createElement('strong', value)
  );
  return rowEl;
}

function renderReadinessCard(parent, config) {
  const readyCard = createElement('div', '', 'model-converters-workflow-master-card');
  readyCard.appendChild(createElement('div', 'Readiness', 'model-converters-workflow-section-title'));
  const counts = {
    linelist: Array.isArray(config.linelist?.masterRows) ? config.linelist.masterRows.length : 0,
    pipingClass: Array.isArray(config.pipingClass?.masterRows) ? config.pipingClass.masterRows.length : 0,
    material: Array.isArray(config.material?.mapRows) ? config.material.mapRows.length : 0,
    weight: Array.isArray(config.weight?.masterRows) ? config.weight.masterRows.length : 0,
  };
  readyCard.append(
    runStatusRow(counts.linelist > 0, 'Line List', counts.linelist ? `${counts.linelist} row(s)` : 'not loaded'),
    runStatusRow(counts.pipingClass > 1, 'Piping Class Master', counts.pipingClass > 1 ? `${counts.pipingClass} row(s)` : 'not loaded'),
    runStatusRow(counts.material > 0, 'Material Map', counts.material ? `${counts.material} row(s)` : 'not loaded'),
    runStatusRow(counts.weight > 0, 'Valve Weights', counts.weight ? `${counts.weight} row(s)` : 'not loaded')
  );
  const sampleBranch = String(config.linelist?.sampleBranchName || '/ASIM-1885-10"-S8810101-91261M7-HC/B1');
  const lineKey = deriveLineKeyFromBranchName(sampleBranch, config);
  const sampleRow = createElement('div', '', 'model-converters-workflow-run-status-row');
  if (sampleRow.style) sampleRow.style.marginTop = '8px';
  sampleRow.append(
    createElement('span', lineKey ? 'OK' : '!', `model-converters-workflow-run-status-icon ${lineKey ? 'ok' : 'warn'}`),
    createElement('span', ' Sample line key from '),
    createElement('code', sampleBranch),
    createElement('strong', ` ${lineKey || '(no key derived)'}`)
  );
  readyCard.appendChild(sampleRow);
  parent.appendChild(readyCard);
}

function actualSourceKind(state) {
  return state.sourceKind === 'auto' ? detectXmlCiiWorkflowSourceKind(state.sourceText || '', 'xml') : (state.sourceKind || 'xml');
}

function parseActionIds(value) {
  return [...new Set(String(value ?? '').split(/[\s,;]+/).map((entry) => entry.trim()).filter(Boolean))];
}

function topologyOptionsPatch(options, key, checked) {
  const next = { [key]: checked };
  if (key === 'analyzeTopology' && !checked) Object.assign(next, { generateTopoFix: false, useTopoFixForCii: false });
  if (key === 'generateTopoFix' && checked) next.analyzeTopology = true;
  if (key === 'generateTopoFix' && !checked) next.useTopoFixForCii = false;
  if (key === 'useTopoFixForCii' && checked) Object.assign(next, { analyzeTopology: true, generateTopoFix: true });
  return next;
}

function renderRunOptions(parent, stateRef, state, render) {
  const optCard = createElement('div', '', 'model-converters-workflow-master-card');
  optCard.appendChild(createElement('div', 'Run Options', 'model-converters-workflow-section-title'));
  const optGrid = createElement('div', '', 'model-converters-workflow-regex-grid');
  const coordsLabel = createElement('label', '', 'model-converters-workflow-regex-field');
  coordsLabel.appendChild(createElement('span', 'Coords Mode'));
  const coordsSelect = createElement('select');
  for (const opt of ['first', 'all', 'none']) coordsSelect.appendChild(createOption(opt, opt, (state.options?.coordsMode || 'first') === opt));
  coordsSelect.addEventListener('change', (e) => { stateRef.current = updateWorkflowOptions(stateRef.current, { coordsMode: e.target.value }); if (typeof render === 'function') render(); });
  coordsLabel.appendChild(coordsSelect);
  optGrid.append(coordsLabel, optionCheckbox('createEnrichedXml', 'Create enriched XML before CII', !!state.options?.createEnrichedXml, stateRef, render), optionCheckbox('kgToNewton', 'kg -> N weight conversion (x10)', state.options?.kgToNewton !== false, stateRef, render));
  optCard.appendChild(optGrid);

  const topologyCard = createElement('div', '', 'model-converters-workflow-master-card');
  topologyCard.appendChild(createElement('div', 'PSI116 Topology Sidecar', 'model-converters-workflow-section-title'));
  const xmlMode = actualSourceKind(state) === 'xml';
  const topologyGrid = createElement('div', '', 'model-converters-workflow-regex-grid');
  topologyGrid.append(
    optionCheckbox('analyzeTopology', 'Analyze PSI116 topology', state.options?.analyzeTopology === true, stateRef, render, !xmlMode, topologyOptionsPatch),
    optionCheckbox('generateTopoFix', 'Generate reviewed TopoFix XML', state.options?.generateTopoFix === true, stateRef, render, !xmlMode, topologyOptionsPatch),
    optionCheckbox('useTopoFixForCii', 'Use committed TopoFix XML for CII', state.options?.useTopoFixForCii === true, stateRef, render, !xmlMode, topologyOptionsPatch),
  );
  const actionField = createElement('label', '', 'model-converters-workflow-regex-field');
  actionField.appendChild(createElement('span', 'Reviewed TopoFix action IDs'));
  const actionInput = createElement('textarea');
  actionInput.dataset.field = 'topology-action-ids';
  actionInput.rows = 3;
  actionInput.placeholder = 'ACT-000184, ACT-000185';
  actionInput.value = rows(state.options?.topologyActionIds).join('\n');
  actionInput.disabled = !xmlMode || state.options?.generateTopoFix !== true;
  actionInput.addEventListener('change', (event) => {
    stateRef.current = updateWorkflowOptions(stateRef.current, { topologyActionIds: parseActionIds(event.target.value) });
    if (typeof render === 'function') render();
  });
  actionField.appendChild(actionInput);
  topologyCard.append(topologyGrid, actionField, createElement('div', xmlMode
    ? 'Analysis is non-mutating. TopoFix requires explicit reviewed action IDs and is used for CII only after the atomic transaction commits.'
    : 'Topology controls are available only for PSI116 XML source mode.', 'model-converters-workflow-detail-note'));
  parent.append(optCard, topologyCard);
}

function optionCheckbox(optionKey, labelText, checked, stateRef, render, disabled = false, patcher = null) {
  const label = createElement('label', '', 'model-converters-workflow-map-field');
  if (label.style) Object.assign(label.style, { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' });
  const input = createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.disabled = disabled;
  input.addEventListener('change', (e) => {
    const patch = typeof patcher === 'function' ? patcher(stateRef.current.options || {}, optionKey, e.target.checked) : { [optionKey]: e.target.checked };
    stateRef.current = updateWorkflowOptions(stateRef.current, patch);
    if (typeof render === 'function') render();
  });
  label.append(input, createElement('span', labelText));
  return label;
}

function renderRunControls(parent, stateRef, state, report, render) {
  const ctrlCard = section(parent, 'Run Conversion');
  const actionDiv = createElement('div');
  if (actionDiv.style) Object.assign(actionDiv.style, { marginTop: '12px', display: 'flex', gap: '8px', flexDirection: 'column' });
  const runReviewBtn = createElement('button', 'Run - Review Weight Matches', 'model-converters-run-btn');
  if (runReviewBtn.style) Object.assign(runReviewBtn.style, { width: '100%', padding: '12px' });
  runReviewBtn.addEventListener('click', () => { stateRef.current = updateWorkflowState(stateRef.current, { activePhaseId: 'weight-match' }); if (typeof render === 'function') render(); });
  const noteDiv = createElement('div', '', 'model-converters-workflow-detail-note');
  noteDiv.innerHTML = 'Opens <strong>4A Weight Match</strong> to review approximate weights, then Finalize and Run.';
  const empiricalBtn = button('review-output-empirical-weights',
    'Review Empirical Weights (±50%) — Inspect All RIGID');
  empiricalBtn.style.cssText = 'cursor:pointer;padding:12px;border-radius:6px;background:#1e293b;color:#fef3c7;border:1px solid #a16207;font-size:12px;width:100%;text-align:center;font-weight:700;';
  empiricalBtn.disabled = !!state.running;
  const empiricalNote = createElement('div', '', 'model-converters-workflow-detail-note');
  empiricalNote.innerHTML = 'Automatic A1/A2 check opens <strong>Empirical Weight Deviation Review</strong> if a post-enrichment RIGID mass differs by more than <strong>±50%</strong> or cannot be validated. Use the button any time to inspect <strong>all positive RIGID edges, including compliant 19.1 mm elements</strong>, without running Python. Only selected manual edits are saved.';
  const empiricalStatus = createElement('div', '', 'xml-cii-phase-help');
  empiricalStatus.dataset.outputEmpiricalStatus = 'true';
  const status = (message) => {
    empiricalStatus.textContent = message;
    empiricalStatus.style.color = /failed|blocked|could not|cancelled/i.test(message) ? '#fca5a5' : '#bfdbfe';
  };
  empiricalBtn.addEventListener('click', async () => {
    empiricalBtn.disabled = true;
    try {
      await triggerOutputEmpiricalReview(stateRef, { manualInspection: true, onStatus: status });
    } finally {
      empiricalBtn.disabled = false;
      if (typeof render === 'function') render();
    }
  });
  const refreshBtn = button('refresh-output-run', 'Refresh readiness / checklist');
  refreshBtn.style.cssText = 'cursor:pointer;padding:12px;border-radius:6px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;font-size:12px;width:100%;text-align:center;font-weight:700;';
  refreshBtn.addEventListener('click', () => { stateRef.current = applyStandaloneOutputRunReadiness(stateRef.current, buildStandaloneOutputRunReadiness(stateRef.current)); if (typeof render === 'function') render(); });
  const finalizeBtn = createElement('button', state.running ? 'Running...' : 'Finalise and Run Conversion', 'model-converters-download-btn');
  if (finalizeBtn.style) Object.assign(finalizeBtn.style, { width: '100%', padding: '12px', background: (state.running || report.summary.blockingCount > 0) ? '#334155' : '#1e4ed8', color: '#fff', border: 'none', fontWeight: '700' });
  finalizeBtn.disabled = !!(state.running || report.summary.blockingCount > 0);
  finalizeBtn.dataset.action = 'run';
  actionDiv.append(runReviewBtn, noteDiv, empiricalBtn, empiricalNote, empiricalStatus, refreshBtn, finalizeBtn);
  ctrlCard.appendChild(actionDiv);
  // Entering Output / Run automatically checks the post-enrichment physical
  // owner masses once per source/config revision. Manual inspection remains
  // available even if no empirical exception exists.
  if (!state.running && (state.sourceText || state.sourceFile ||
      state.sourceBatch?.sources?.some((source) => source.enabled !== false))) {
    const rawRef = outputReviewRawRef(stateRef);
    const fingerprint = outputEmpiricalReviewFingerprint(rawRef.current);
    if (autoReviewFingerprints.get(rawRef) !== fingerprint && !activeReviews.has(rawRef)) {
      autoReviewFingerprints.set(rawRef, fingerprint);
      Promise.resolve().then(async () => {
        if (rawRef.current.activePhaseId !== 'run') return;
        if (outputEmpiricalReviewFingerprint(rawRef.current) !== fingerprint) return;
        await triggerOutputEmpiricalReview(stateRef, { manualInspection: false, onStatus: status });
        if (typeof render === 'function') render();
      });
    }
  }
}

export function renderStandaloneOutputRunPanel(card, stateOrRef, render) {
  const isRef = stateOrRef && 'current' in stateOrRef;
  const stateRef = isRef ? stateOrRef : { current: stateOrRef };
  const state = stateRef.current;
  const report = reportFromState(state);
  const config = xmlCiiEnrichedConfigFromState(state);
  card.innerHTML = '';
  const title = createElement('div', '5 Run', 'model-converters-workflow-detail-title');
  const desc = createElement('div', 'Run the conversion — optionally analyze PSI116 topology, generate a reviewed TopoFix sidecar, and use only a committed fix for CII.', 'model-converters-workflow-detail-text');
  card.append(title, desc);
  renderSummary(card, report);
  renderChecklist(card, report);
  renderReadinessCard(card, config);
  renderRunOptions(card, stateRef, state, render);
  renderRunControls(card, stateRef, state, report, render);
  renderArtifacts(card, state, report);
  renderTopologyArtifacts(card, state);
  renderLogs(card, report);
  renderManifest(card, report);
  renderRaw(card, report);
}
