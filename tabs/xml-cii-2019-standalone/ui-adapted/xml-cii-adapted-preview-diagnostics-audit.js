import { createElement } from './xml-cii-adapted-dom.js';
import { xmlCiiRenderPreviewPhase, xmlCiiBuildAndRenderPreview } from './xml-cii-adapted-preview-renderer.js';
import { saveMasterContextToLocalStorage, xmlCiiEnrichedConfigFromState } from './xml-cii-adapted-state.js';

function rows(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? ''); }

function actionButton() {
  const button = createElement('button', 'Build / refresh preview report');
  button.type = 'button';
  button.dataset.action = 'build-preview-audit';
  return button;
}

function table(headers, data, emptyText) {
  if (!data.length) return createElement('div', emptyText, 'xml-cii-phase-help');
  const tableEl = createElement('table', '', 'xml-cii-audit-table');
  const head = createElement('thead');
  const hr = createElement('tr');
  for (const header of headers) hr.appendChild(createElement('th', header));
  head.appendChild(hr);
  tableEl.append(head, tableBody(headers, data));
  return tableEl;
}

function tableBody(headers, data) {
  const body = createElement('tbody');
  for (const item of data.slice(0, 50)) {
    const tr = createElement('tr');
    for (const header of headers) tr.appendChild(createElement('td', cell(item, header)));
    body.appendChild(tr);
  }
  return body;
}

function cell(item, header) {
  const key = {
    Section: 'section', Name: 'name', Value: 'value', Source: 'source', Field: 'field', Before: 'before', After: 'after', Message: 'message', Key: 'key', Detail: 'detail', Level: 'level', Type: 'type', Rows: 'rows'
  }[header] || header;
  const value = item?.[key];
  return typeof value === 'object' && value ? JSON.stringify(value) : text(value);
}

function renderActions(parent, state) {
  const panel = createElement('section', '', 'xml-cii-audit-panel');
  panel.append(createElement('h3', 'Report Controls'), actionButton(), createElement('span', state.previewDiagnosticsAuditStatus || 'Preview report not built yet.', 'xml-cii-phase-help'));
  parent.appendChild(panel);
}

function safeJsonStringify(obj, space = 2) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    if (value instanceof Map) return { dataType: 'Map', value: Array.from(value.entries()), knownClasses: value.knownClasses, rowsCount: value.rows?.length };
    return value;
  }, space);
}

function renderRaw(parent, report) {
  const details = createElement('details', '', 'xml-cii-audit-panel');
  details.appendChild(createElement('summary', 'Raw JSON'));
  details.appendChild(createElement('pre', safeJsonStringify(report || {}, 2)));
  parent.appendChild(details);
}

function _rowText(row, keys) {
  if (!row || typeof row !== 'object') return '';
  for (const k of keys) {
    const value = row[k] ?? row._raw?.[k];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function _xmlCiiKnownClasses(config) {
  const rows = Array.isArray(config.pipingClass?.masterRows) ? config.pipingClass.masterRows : [];
  return [...new Set(rows.map((r) => _rowText(r, ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'Class', 'SPEC', 'Spec'])).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

export function _xmlCiiLineListKeys(config) {
  const rows = Array.isArray(config.linelist?.masterRows) ? config.linelist.masterRows : [];
  return [...new Set(rows.map((r) => _rowText(r, ['lineNoKey', 'lineNo', 'lineKey', 'LineNo', 'Line No', 'Line Number', 'PipelineReference', 'lineSeqNo'])).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function _esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// The non-v7 config-save path must not read or delete persisted Preview rows.
// Preserve the existing legacy Weight Match invalidation on config changes.
export function invalidatePreviewCaches() {
  try { globalThis.localStorage?.removeItem('xml-cii-wm-cache-v1'); } catch {}
}

function _datalistHtml(id, values) {
  if (!values.length) return '';
  return `<datalist id="${_esc(id)}">${values.map((v) => `<option value="${_esc(v)}"></option>`).join('')}</datalist>`;
}

function _keyTypeLabel(editType, derivedKey) {
  if (editType !== 'materialCode' && editType !== 'rating') return '';
  const key = String(derivedKey || '');
  const fieldName = editType === 'rating' ? 'Rating' : 'Material code';
  if (key.startsWith('PC:')) return `<div style="font-size:11px;color:#6ee7b7;margin-top:2px;">✓ Piping class key — ${fieldName} override applies to all lines with this class.</div>`;
  if (key.startsWith('/') || key.startsWith('=') || key.length > 35 || key.startsWith('P4') || key.startsWith('L'))
    return `<div style="font-size:11px;color:#fbbf24;margin-top:2px;">⚠ Using line/branch key fallback (${key}). ${fieldName} override will apply only to this line number.</div>`;
  return `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">Override stored under this key in config.overrides.${editType}.</div>`;
}

function _candidateControlHtml(editType, config) {
  if (editType === 'pipingClass') {
    const classes = _xmlCiiKnownClasses(config);
    if (!classes.length) return '';
    return `<label style="display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:12px;color:#9cc5ff;">
      Known classes from master (${classes.length}); type to filter or edit freely:
      <input id="mc-ov-pick" list="mc-ov-piping-class-list" placeholder="Start typing piping class..." style="background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:6px;">
      ${_datalistHtml('mc-ov-piping-class-list', classes)}
    </label>`;
  }
  if (editType === 'branchLineKey') {
    const lineKeys = _xmlCiiLineListKeys(config);
    if (!lineKeys.length) return '<div style="font-size:11px;color:#fbbf24;">No Line List keys are loaded. You can still type a line key manually.</div>';
    return `<label style="display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:12px;color:#9cc5ff;">
      Loaded Line List keys (${lineKeys.length}); type to filter or edit freely:
      <input id="mc-ov-pick" list="mc-ov-line-key-list" placeholder="Start typing line key..." style="background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:6px;">
      ${_datalistHtml('mc-ov-line-key-list', lineKeys)}
    </label>`;
  }
  return '';
}

export function _xmlCiiOpenPreviewOverridePopup({ editType, derivedKey, currentVal, config, onSave }) {
  const title = {
    branchLineKey: 'Branch → Line List Override',
    pipingClass: 'Piping Class Override',
    material: 'Material Type Override',
    rating: 'Rating Override',
    materialCode: 'Material Code Override',
    wallThickness: 'Wall Thickness Override',
    corrosion: 'Corrosion Allowance Override'
  }[editType] || 'Override';

  const label = {
    branchLineKey: 'Branch name',
    pipingClass: 'Requested / derived class',
    material: 'Line/material key',
    rating: 'Effective rating key (Piping Class)',
    materialCode: 'Override lookup key',
    wallThickness: 'Wall thickness class+DN key',
    corrosion: 'Corrosion piping-class key'
  }[editType] || 'Key';

  const helperText = {
    branchLineKey: 'Select a loaded Line List key for this branch. The mapping is stored in linelist.branchLineKeyMap and is used by preview, weight match, and conversion.',
    pipingClass: 'Suggestions come from the full loaded Piping Class master. You may still type any class manually.',
    materialCode: 'Writes a material-code override (e.g. "A106B"), not a material-name override. The key above is derived from the resolved piping class; if none was resolved it falls back to the line/branch key.',
    corrosion: 'Corrosion remains resolved from the effective Piping Class key unless you manually override this cell.',
    wallThickness: 'Wall thickness is keyed by effective Piping Class + DN so class override changes can drive the lookup.',
    rating: 'Keyed primarily by Piping Class so rating applies across all matching lines. Overrides are synced to processData and weight matching.'
  }[editType] || 'Overrides take priority over regex and fuzzy matching in both preview and real conversion.';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6)';
  overlay.innerHTML = `
    <div style="width:min(520px,92vw);background:#0f1724;border:1px solid #2c3a4f;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:12px;">
      <div style="color:#9cc5ff;font-weight:700;font-size:15px;">${_esc(title)}</div>
      <div style="font-size:12px;color:#9aa8ba;">${_esc(label)}: <strong style="color:#d7e6ff;word-break:break-all;">${_esc(derivedKey)}</strong>${_keyTypeLabel(editType, derivedKey)}</div>
      ${_candidateControlHtml(editType, config)}
      <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:#9cc5ff;">
        Override value:
        <input id="mc-ov-input" type="text" value="${_esc(currentVal)}"
          style="background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:8px;font-size:13px;">
      </label>
      <div style="color:#7a9fc2;font-size:11px;">${_esc(helperText)}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="mc-ov-cancel" type="button" style="background:#27272a;color:#fff;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;">Cancel</button>
        <button id="mc-ov-save" type="button" style="background:#1d4ed8;color:#fff;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;">Save Override →</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#mc-ov-input');
  const picker = overlay.querySelector('#mc-ov-pick');
  if (picker) picker.addEventListener('input', () => { if (picker.value) input.value = picker.value; });
  overlay.querySelector('#mc-ov-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#mc-ov-save').addEventListener('click', () => {
    const val = String(input.value).trim();
    if (val && editType === 'branchLineKey') {
      config.linelist = config.linelist && typeof config.linelist === 'object' ? { ...config.linelist } : {};
      config.linelist.branchLineKeyMap = config.linelist.branchLineKeyMap && typeof config.linelist.branchLineKeyMap === 'object' && !Array.isArray(config.linelist.branchLineKeyMap) ? { ...config.linelist.branchLineKeyMap } : {};
      config.linelist.branchLineKeyMap[String(derivedKey || '').trim()] = val;
    }
    overlay.remove();
    if (val) onSave(val);
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  input.focus();
}

export async function renderStandalonePreviewReportPanel(card, stateRef, render) {
  const state = stateRef && (stateRef.current !== undefined) ? stateRef.current : stateRef;
  const config = xmlCiiEnrichedConfigFromState(state);
  const traceResult = state.resolverJsonTraceResult;
  const traceDataPresent = (Array.isArray(traceResult?.resolvedFacts) && traceResult.resolvedFacts.length > 0)
    || (Array.isArray(traceResult?.matchedFacts) && traceResult.matchedFacts.length > 0);
  if (traceDataPresent && config.useJsonTraceStagedSource == null && config.useParsedCustomInputSource == null && config.useParsedCustomInputSourceForPreview == null) {
    config.useJsonTraceStagedSource = true;
    config.useParsedCustomInputSource = true;
    config.useParsedCustomInputSourceForPreview = true;
  }
  const xmlText = state.sourceText || '';
  const xmlFile = state.sourceFile || (xmlText ? new File([xmlText], 'source.xml', { type: 'application/xml' }) : null);

  card.innerHTML = xmlCiiRenderPreviewPhase(xmlFile, config);
  const host = card.querySelector('#mc-preview-table-host');
  if (!host) return;

  const options = {
    onSaveConfig: (newCfg) => {
      invalidatePreviewCaches();
      const nextJson = JSON.stringify(newCfg, null, 2);
      if (stateRef && stateRef.current !== undefined) {
        const context = stateRef.current.masterContext || {};
        context.config = newCfg;
        stateRef.current = {
          ...stateRef.current,
          supportConfigJson: nextJson,
          masterContext: { ...context, config: newCfg }
        };
        saveMasterContextToLocalStorage(stateRef.current.masterContext);
      }
    },
    openOverridePopup: _xmlCiiOpenPreviewOverridePopup,
    ensureOverrides: (cfg) => {
      if (!cfg.overrides) cfg.overrides = {};
      return cfg.overrides;
    },
    stagedJsonText: state.stagedJsonText || '',
    stagedSourceLabel: state.stagedJsonFile?.name || '',
    resolveStagedJsonText: async (nextConfig) => {
      const currentText = stateRef && stateRef.current !== undefined ? stateRef.current.stagedJsonText : state.stagedJsonText;
      const currentName = stateRef && stateRef.current !== undefined ? stateRef.current.stagedJsonFile?.name : state.stagedJsonFile?.name;
      return { text: currentText || '', label: currentName || '' };
    }
  };

  try {
    await xmlCiiBuildAndRenderPreview(card, xmlText, config, options);
  } catch (err) {
    console.error('Failed to build standalone preview table:', err);
    host.innerHTML = `<div class="xml-cii-phase-help" style="border-color:#7f1d1d;color:#7f1d1d;background:#fff7f7;">⚠ Build failed: ${_esc(err.message || String(err))}</div>`;
  }
}

export function renderStandaloneDiagnosticsReportPanel(card, state) {
  renderActions(card, state);
  const report = state.previewDiagnosticsAuditReport || {}, allLogs = rows(report.diagnostics);
  const llCount = state.masterContext?.lineRows?.length || 0, pcCount = state.masterContext?.pipingClassRows?.length || 0;
  const matCount = state.masterContext?.materialMapRows?.length || 0, wtCount = state.masterContext?.weightMasterRows?.length || 0;

  const auditCard = createElement('div');
  auditCard.style.cssText = 'background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:#cbd5e1;';
  auditCard.innerHTML = `<strong>🛡️ Diagnostic Audit Context</strong><div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:6px;margin:6px 0;"><div>Timestamp: ${new Date().toISOString()}</div><div>XML Source: ${esc(state.sourceFile?.name || (state.sourceText ? 'Pasted' : 'None'))}</div><div>Staged JSON: ${esc(state.stagedJsonFile?.name || (state.stagedJsonText ? 'Pasted' : 'None'))}</div></div><div style="border-top:1px dashed #334155;padding-top:6px;display:flex;gap:12px;color:#94a3b8;">Line List: <b>${llCount}</b> | Piping Class: <b>${pcCount}</b> | Material Maps: <b>${matCount}</b> | Valve Weights: <b>${wtCount}</b></div>`;
  card.appendChild(auditCard);

  const controls = createElement('div');
  controls.style.cssText = 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;';
  const leftGroup = createElement('div');
  leftGroup.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
  const searchInput = createElement('input');
  searchInput.placeholder = 'Filter message, type...';
  searchInput.style.cssText = 'background:#182334;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:6px;font-size:12px;min-width:200px;';
  leftGroup.appendChild(searchInput);

  const tabGroup = createElement('div');
  tabGroup.style.cssText = 'display:flex;gap:2px;background:#0f172a;padding:2px;border-radius:6px;border:1px solid #334155;';
  const tabs = [{ id: 'errors', label: '🚨 Errors & Warnings' }, { id: 'all', label: '🔍 All' }, { id: 'regex', label: '⚙️ Rules' }, { id: 'resolver', label: '🗺️ Resolver' }];
  let activeTabId = 'errors', rowLimit = 150;
  const tabButtons = {};
  tabs.forEach(t => {
    const btn = createElement('button', t.label);
    btn.type = 'button';
    btn.style.cssText = 'background:transparent;color:#94a3b8;border:none;border-radius:4px;padding:4px 8px;font-size:11px;font-weight:bold;cursor:pointer;';
    btn.addEventListener('click', () => { activeTabId = t.id; Object.keys(tabButtons).forEach(k => { tabButtons[k].style.background = k === activeTabId ? '#1e293b' : 'transparent'; tabButtons[k].style.color = k === activeTabId ? '#38bdf8' : '#94a3b8'; }); rowLimit = 150; updateView(); });
    tabButtons[t.id] = btn; tabGroup.appendChild(btn);
  });
  tabButtons.errors.style.background = '#1e293b'; tabButtons.errors.style.color = '#38bdf8';
  leftGroup.appendChild(tabGroup);

  const exportBtn = createElement('button', '📥 Export Audit Log');
  exportBtn.type = 'button';
  exportBtn.style.cssText = 'background:#1d4ed8;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:bold;cursor:pointer;';
  exportBtn.addEventListener('click', () => { const blob = new Blob([JSON.stringify({ auditContext: { timestamp: new Date().toISOString(), xmlSource: state.sourceFile?.name || 'Pasted', stagedJson: state.stagedJsonFile?.name || 'Pasted', masterCounts: { lineList: llCount, pipingClass: pcCount, materialMap: matCount, weight: wtCount } }, diagnostics: allLogs }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `xml-cii-audit-log-${Date.now()}.json`; a.click(); });
  controls.append(leftGroup, exportBtn); card.appendChild(controls);

  const resultsContainer = createElement('div'); card.appendChild(resultsContainer);
  function updateView() {
    const query = (searchInput.value || '').toLowerCase();
    let filtered = allLogs;
    if (activeTabId === 'errors') filtered = allLogs.filter(item => ['warn', 'warning', 'error'].includes(String(item.level || '').toLowerCase()));
    else if (activeTabId === 'regex') filtered = allLogs.filter(item => item.source === 'regex');
    else if (activeTabId === 'resolver') filtered = allLogs.filter(item => ['resolver', 'masters', 'side-load'].includes(item.source));
    if (query) filtered = filtered.filter(item => [item.message, item.source, item.type, item.level].some(v => String(v || '').toLowerCase().includes(query)));
    const visible = filtered.slice(0, rowLimit);
    if (!visible.length) { resultsContainer.innerHTML = '<div class="xml-cii-muted" style="color:#94a3b8;padding:20px;text-align:center;background:#1e293b;border-radius:8px;border:1px solid #334155;">No matching logs found.</div>'; return; }
    const ths = ['Level', 'Source', 'Type', 'Message', 'Rows'].map(h => `<th style="padding:8px;border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;text-align:left;">${h}</th>`).join('');
    const trs = visible.map(item => { const lvl = String(item.level || '').toLowerCase(); const badge = `<span style="background:${lvl === 'error' ? '#ef4444' : (['warn', 'warning'].includes(lvl) ? '#f59e0b' : '#3b82f6')};color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;text-transform:uppercase;">${esc(item.level || 'info')}</span>`; return `<tr style="border-bottom:1px solid #334155;font-size:12px;"><td style="padding:8px;">${badge}</td><td style="padding:8px;color:#cbd5e1;font-weight:600;">${esc(item.source || '')}</td><td style="padding:8px;color:#94a3b8;">${esc(item.type || '')}</td><td style="padding:8px;color:#e2e8f0;line-height:1.4;">${esc(item.message || '')}</td><td style="padding:8px;color:#cbd5e1;">${esc(item.rows ?? '')}</td></tr>`; }).join('');
    resultsContainer.innerHTML = `<div style="overflow-x:auto;background:#0f172a;border:1px solid #334155;border-radius:8px;"><table style="width:100%;border-collapse:collapse;text-align:left;"><thead><tr style="background:#1e293b;">${ths}</tr></thead><tbody>${trs}</tbody></table></div><div id="diag-foot" style="margin-top:8px;font-size:11px;color:#94a3b8;">Showing ${visible.length} of ${filtered.length} matching logs.</div>`;
    if (filtered.length > rowLimit) { const loadMore = createElement('button', `Click to load more (${filtered.length - rowLimit} remaining)...`); loadMore.type = 'button'; loadMore.style.cssText = 'background:#1e293b;color:#38bdf8;border:1px solid #334155;border-radius:6px;padding:6px 12px;font-size:11px;font-weight:bold;cursor:pointer;margin-top:10px;width:100%;'; loadMore.addEventListener('click', () => { rowLimit += 150; updateView(); }); resultsContainer.appendChild(loadMore); }
  }
  searchInput.addEventListener('input', () => { rowLimit = 150; updateView(); });
  updateView();
  renderRaw(card, report);
}

function esc(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function factValue(fact) { return typeof fact?.value === 'object' ? JSON.stringify(fact.value) : String(fact?.value || ''); }
function factKey(fact) { return [fact?.source, fact?.itemType, fact?.basis, fact?.key, fact?.resolvedNodeNumber, factValue(fact)].map(String).join(' ').toLowerCase(); }
function summarizeFacts(facts) { const byItem = new Map(); const bySource = new Map(); for (const fact of facts || []) { byItem.set(fact.itemType || '(none)', (byItem.get(fact.itemType || '(none)') || 0) + 1); bySource.set(fact.source || '(none)', (bySource.get(fact.source || '(none)') || 0) + 1); } return { byItem, bySource }; }

function renderBigAppSummary(payload, filteredFacts) {
  const summary = summarizeFacts(filteredFacts);
  const itemText = Array.from(summary.byItem.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${esc(k)}: <strong>${esc(v)}</strong>`).join(' &middot; ');
  const sourceText = Array.from(summary.bySource.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${esc(k)}: <strong>${esc(v)}</strong>`).join(' &middot; ');
  return `<div class="xml-cii-workflow-preview-grid" style="display:flex;gap:12px;margin-bottom:8px;"><div><span>Matched rows: </span><strong>${esc(filteredFacts.length)}</strong></div><div><span>Rejected hidden: </span><strong>${esc(payload?.rejectedFacts?.length || 0)}</strong></div><div><span>Diagnostics rows: </span><strong>${esc(payload?.diagnostics?.length || 0)}</strong></div></div><div style="margin-top:8px;font-size:12px;color:#d7e6ff;">${itemText || 'No matched item summary'}</div><div style="margin-top:4px;font-size:12px;color:#9aa8ba;">${sourceText || ''}</div>`;
}

function renderBigAppFactRows(facts, maxRows = 300) {
  const rowsToShow = (facts || []).slice(0, maxRows);
  if (!rowsToShow.length) return '<div class="xml-cii-muted">No matched rows loaded. Run XML→CII or use the report builder.</div>';
  return `<div class="xml-cii-preview-wrap xml-cii-preview-table-wrap" style="overflow-x:auto;"><table class="xml-cii-preview-node-table xml-cii-preview-table--fixed" style="min-width:100%;font-size:11px;text-align:left;border-collapse:collapse;"><thead><tr><th style="padding:4px;border-bottom:1px solid #666;">Source</th><th style="padding:4px;border-bottom:1px solid #666;">Item</th><th style="padding:4px;border-bottom:1px solid #666;">Basis</th><th style="padding:4px;border-bottom:1px solid #666;">Key</th><th style="padding:4px;border-bottom:1px solid #666;">Node</th><th style="padding:4px;border-bottom:1px solid #666;">Value</th><th style="padding:4px;border-bottom:1px solid #666;">Action</th><th style="padding:4px;border-bottom:1px solid #666;">Status</th></tr></thead><tbody>${rowsToShow.map((fact) => `<tr style="border-bottom:1px solid #333;"><td style="padding:4px;">${esc(fact.source || '')}</td><td style="padding:4px;">${esc(fact.itemType || '')}</td><td style="padding:4px;">${esc(fact.basis || '')}</td><td style="padding:4px;" title="${esc(fact.key || '')}">${esc(fact.key || '')}</td><td style="padding:4px;">${esc(fact.resolvedNodeNumber || '')}</td><td style="padding:4px;" title="${esc(factValue(fact))}">${esc(factValue(fact))}</td><td style="padding:4px;">${esc(fact.action || '')}</td><td style="padding:4px;">${esc(fact.status || '')}</td></tr>`).join('')}</tbody></table></div>${(facts || []).length > maxRows ? `<div style="color:#9aa8ba;font-size:11px;margin-top:6px;">Showing first ${maxRows} of ${facts.length} matched rows.</div>` : ''}`;
}

export function renderStandaloneMatchedAuditPanel(card, state) {
  renderActions(card, state);
  const report = state.previewDiagnosticsAuditReport || {};
  const allFacts = report.matchedFacts || [];
  const headerContainer = createElement('div');
  headerContainer.style.display = 'flex'; headerContainer.style.gap = '8px'; headerContainer.style.alignItems = 'center'; headerContainer.style.marginBottom = '12px';
  const search = createElement('input');
  search.placeholder = 'Filter source/item/node/key/value'; search.dataset.field = 'audit-search'; search.style.minWidth = '260px'; search.style.padding = '6px';
  headerContainer.append(createElement('h3', 'Matched Audit'), search); card.appendChild(headerContainer);
  const status = createElement('div', '', 'xml-cii-phase-help'); card.appendChild(status);
  const dynamicContainer = createElement('div'); card.appendChild(dynamicContainer);
  function updateDynamicView() {
    const filter = (search.value || '').toLowerCase();
    const filteredFacts = filter ? allFacts.filter((fact) => factKey(fact).includes(filter)) : allFacts;
    dynamicContainer.innerHTML = `<section class="xml-cii-audit-panel" style="background:#1e293b;padding:12px;border-radius:6px;margin-bottom:12px;">${renderBigAppSummary(report, filteredFacts)}</section><section class="xml-cii-audit-panel">${renderBigAppFactRows(filteredFacts)}</section>`;
    status.textContent = allFacts.length === filteredFacts.length ? `${allFacts.length} matched rows loaded.` : `${filteredFacts.length} of ${allFacts.length} matched rows shown by filter.`;
  }
  search.addEventListener('input', updateDynamicView);
  updateDynamicView();
}
