import { XmlCiiAdaptedEditablePreviewTable } from './xml-cii-adapted-editable-preview-table.js';
import { renderBranchLineMapPanel } from './xml-cii-adapted-branch-line-map-panel.js';
import { _xmlCiiLineListKeys } from './xml-cii-adapted-preview-diagnostics-audit.js';
import { applyAdaptedPreviewOverrideFillDown, applyAdaptedPreviewProcessFillDown, markAdaptedPreviewOverrideManual, markAdaptedPreviewProcessManual, applyAdaptedPreviewSmartFillByClass, applyAdaptedPreviewSmartProcessFillByClass } from './xml-cii-adapted-preview-filldown.js';
import { replaceJsonObject, runAtomicPreviewClassTransaction } from './xml-cii-adapted-preview-class-transaction.js';
import {
  _toText,
  _esc,
  _ratingKeys,
  _bucketText,
  _classSizeKey,
  _classKey,
  _uniqueKeys,
  _hasOwn,
  xmlCiiDryRunPreview
} from './xml-cii-adapted-preview-dryrun.js';

// Temporary handoff for the standalone v7 SHA-256 Preview authority. This is
// NOT an eligible cache-read path: old incomplete-fingerprint entries are never
// consulted to render engineering values. The v7 wrapper captures and removes
// this explicit-build payload, then publishes its fully keyed envelope.
const PREVIEW_V7_BRIDGE_KEY = 'xml-cii-pv-cache-v8-dtxr';
const PREVIEW_V7_BRIDGE_MAX_BYTES = 2500000;

function publishExplicitPreviewBridge(branchRows, nodeRows) {
  try {
    const serialized = JSON.stringify({
      fp: 'explicit-preview-build-v1-not-a-reuse-key',
      data: { branchRows, nodeRows },
      ts: Date.now(),
    });
    if (serialized.length <= PREVIEW_V7_BRIDGE_MAX_BYTES) {
      localStorage.setItem(PREVIEW_V7_BRIDGE_KEY, serialized);
    } else {
      localStorage.removeItem(PREVIEW_V7_BRIDGE_KEY);
    }
  } catch {
    try { localStorage.removeItem(PREVIEW_V7_BRIDGE_KEY); } catch {}
  }
}

function _overrideSource(overrides, bucket, key) {
  return _hasOwn(overrides?.[bucket], key) ? 'override' : 'auto';
}

function _isDefaultSource(source) {
  return source === 'default' || source === 'config-default' || source === 'default-zero';
}

function _percentText(confidence) {
  const numeric = Number(confidence);
  return Number.isFinite(numeric) ? `${Math.max(0, Math.min(100, Math.round(numeric * 100)))}%` : '';
}

function _setProcessDataField(overrides, key, field, value) {
  if (!key) return;
  if (!overrides.processData || typeof overrides.processData !== 'object' || Array.isArray(overrides.processData)) overrides.processData = {};
  overrides.processData[key] = overrides.processData[key] && typeof overrides.processData[key] === 'object' && !Array.isArray(overrides.processData[key]) ? { ...overrides.processData[key] } : {};
  overrides.processData[key][field] = value;
}

function _fieldOverrideKey(editType, derivedKey) {
  return _toText(derivedKey).trim();
}

function _savePreviewOverride({ config, ensureOverrides, editType, row, derivedKey, value }) {
  const overrides = ensureOverrides(config);
  const cleanValue = _toText(value).trim();
  if (editType === 'rating') {
    const keys = _ratingKeys(row, derivedKey);
    overrides.rating = overrides.rating && typeof overrides.rating === 'object' && !Array.isArray(overrides.rating) ? { ...overrides.rating } : {};
    for (const key of keys) overrides.rating[key] = cleanValue;
    for (const key of _uniqueKeys([row?.lineKey, row?.branchName])) _setProcessDataField(overrides, key, 'rating', cleanValue);
    return keys[0] || derivedKey || row?.lineKey || row?.branchName || '';
  }
  if (!overrides[editType] || typeof overrides[editType] !== 'object') overrides[editType] = {};
  const key = _fieldOverrideKey(editType, derivedKey) || row?.lineKey || row?.branchName || '';
  if (key) overrides[editType] = { ...overrides[editType], [key]: cleanValue };
  return key;
}

function _useParsedCustomInputSource(config) {
  return config?.useJsonTraceStagedSource === true || config?.useParsedCustomInputSource === true || config?.useParsedCustomInputSourceForPreview === true;
}

function _manualPreviewActionHtml(label = 'Build Preview', includeDtxrWall = false, config = {}) {
  return `<div class="model-converters-workflow-master-card mc-preview-manual-card" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;"><div class="model-converters-workflow-detail-text" style="margin:0;">Preview is manual to protect saved overrides. Edit Regex/Masters freely, then click Build Preview.</div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><label class="xml-cii-native-check" title="Use the imported JSON Trace staged source instead of the sidebar staged JSON when available." style="margin:0;"><input type="checkbox" data-mc-use-parsed-custom-source ${_useParsedCustomInputSource(config)?'checked':''}> Use JSON Trace staged source</label><button type="button" class="model-converters-run-btn" data-mc-preview-build style="padding:8px 14px;min-width:140px;">${_esc(label)}</button>${includeDtxrWall ? '<button type="button" class="model-converters-download-btn" data-mc-dtxr-wall-update style="padding:8px 14px;min-width:220px;">Update Wall thickness based on DTXR</button>' : ''}</div></div>`;
}

function _bindParsedCustomSourceToggle(host, config, options = {}) {
  host?.querySelector('[data-mc-use-parsed-custom-source]')?.addEventListener('change', (event) => {
    const enabled = !!event.target.checked;
    config.useJsonTraceStagedSource = enabled;
    config.useParsedCustomInputSource = enabled;
    config.useParsedCustomInputSourceForPreview = enabled;
    options.onSaveConfig?.(config);
    _markPreviewSaved(host, enabled ? 'JSON Trace staged source enabled. Click Build/Rebuild Preview to recompute DTXR matches from traced JSON.' : 'JSON Trace staged source disabled. Click Build/Rebuild Preview to use sidebar staged JSON.');
  });
}

async function _resolvePreviewStagedJsonText(options = {}, config = {}) {
  if (typeof options.resolveStagedJsonText === 'function') {
    const resolved = await options.resolveStagedJsonText(config);
    if (resolved && typeof resolved === 'object') return { text: _toText(resolved.text ?? resolved.stagedJsonText), label: _toText(resolved.label || resolved.sourceLabel) };
    return { text: _toText(resolved), label: '' };
  }
  return { text: _toText(options.stagedJsonText), label: _toText(options.stagedSourceLabel) };
}

function _bindManualPreviewButton(host, rootEl, xmlText, config, options, label = 'Building preview...') {
  host?.querySelectorAll('[data-mc-preview-build]').forEach((button) => {
    button.addEventListener('click', () => {
      host.innerHTML = `<div class="model-converters-workflow-detail-note" style="text-align:center;padding:18px;">${_esc(label)}</div>`;
      setTimeout(() => xmlCiiBuildAndRenderPreview(rootEl, xmlText, config, { ...options, forceBuild: true }), 0);
    });
  });
}

function _renderManualPreviewIdle(host, rootEl, xmlText, config, options) {
  if (!host) return;
  host.innerHTML = `${_manualPreviewActionHtml('Build Preview', false, config)}<div class="model-converters-workflow-detail-note" style="text-align:center;padding:18px;">Preview has not been built for this visit. Click <strong>Build Preview</strong> when ready.</div>`;
  _bindManualPreviewButton(host, rootEl, xmlText, config, options);
  _bindParsedCustomSourceToggle(host, config, options);
}

function _markPreviewSaved(host, message = 'Saved. Click Rebuild Preview when you want to recompute suggestions.') {
  const existing = host?.querySelector('[data-mc-preview-save-note]');
  if (existing) {
    existing.textContent = message;
    return;
  }
  host?.insertAdjacentHTML('afterbegin', `<div data-mc-preview-save-note class="model-converters-workflow-detail-note" style="margin:0 0 8px;border-color:#2f855a;color:#14532d;background:#f0fff4;">${_esc(message)}</div>`);
}

function _updateEditedPreviewCell(td, newVal) {
  const val = _toText(newVal).trim() || '—';
  const span = td?.querySelector?.('.mc-preview-editable-val');
  if (span) span.textContent = val;
}

function _renderClassTransactionStatus(host, value) {
  if (!host) return;
  host.innerHTML = `<div class="model-converters-workflow-detail-note" style="text-align:center;padding:18px;border-color:#2b6cb0;color:#1e3a8a;background:#eff6ff;">Resolving Piping Class <strong>${_esc(value)}</strong>, loading exact authority if needed, and recomputing dependent fields…</div>`;
}

async function _hydrateEffectiveClassConfig(config, xmlText) {
  const { hydrateXmlCiiEffectivePipingClassShards } = await import('../../xml-cii-effective-class-shard-hydrator.js');
  const configInput = {
    value: JSON.stringify(config),
    dispatchEvent() {},
  };
  const result = await hydrateXmlCiiEffectivePipingClassShards({
    input: configInput,
    xmlText,
    force: true,
  });
  const hydratedConfig = JSON.parse(configInput.value || '{}');
  replaceJsonObject(config, hydratedConfig);
  return result;
}

function _classTransactionSuccessMessage(hydrationResult, value) {
  const unmatched = Array.isArray(hydrationResult?.unmatched)
    ? hydrationResult.unmatched.map((item) => _toText(item?.value || item?.normalized || item).trim()).filter(Boolean)
    : [];
  if (unmatched.length) {
    return `Piping Class ${value} saved and the full Preview row was recomputed. No exact shard exists for ${unmatched.join(', ')}; dependent fields remain review-required.`;
  }
  const loaded = Array.isArray(hydrationResult?.loadedClasses) ? hydrationResult.loadedClasses.filter(Boolean) : [];
  return loaded.length
    ? `Piping Class ${value} saved. Loaded ${loaded.join(', ')} and atomically recomputed Rating, material, wall, corrosion, and Weight Match.`
    : `Piping Class ${value} saved and atomically recomputed Rating, material, wall, corrosion, and Weight Match.`;
}

import {
  _dtxrWallCandidateForRow,
  _dtxrWallCandidateIndex
} from './xml-cii-adapted-preview-dryrun.js';

function _bindDtxrWallUpdateButtonBranchScoped({ host, branchRows, config, ensureOverrides, onSaveConfig, stagedSourceLabel = '' }) {
  host?.querySelector('[data-mc-dtxr-wall-update]')?.addEventListener('click', () => {
    const sourceSuffix = stagedSourceLabel ? ` using ${stagedSourceLabel}` : '';
    const overrides = ensureOverrides(config);
    overrides.wallThickness = overrides.wallThickness && typeof overrides.wallThickness === 'object' && !Array.isArray(overrides.wallThickness) ? { ...overrides.wallThickness } : {};
    overrides.__dtxrWallKeys = overrides.__dtxrWallKeys && typeof overrides.__dtxrWallKeys === 'object' ? overrides.__dtxrWallKeys : {};
    const { index, available } = _dtxrWallCandidateIndex(branchRows);
    let applied = 0;
    branchRows.forEach((row, ri) => {
      const candidate = _dtxrWallCandidateForRow(row, index);
      if (!candidate) return;
      const key = row.wallThicknessKey || _classSizeKey(row) || row.lineKey || row.branchName;
      if (!key) return;
      overrides.wallThickness[key] = candidate.value;
      overrides.__dtxrWallKeys[key] = true;
      markAdaptedPreviewOverrideManual({ config, ensureOverrides, field: 'wallThickness', key, value: candidate.value });
      const cell = host.querySelector(`[data-mc-edit-type="wallThickness"][data-mc-edit-row="${ri}"]`);
      _updateEditedPreviewCell(cell, candidate.value);
      if (cell) {
        cell.dataset.mcFillState = 'manual';
        cell.title = `Wall thickness from any DTXR schedule in this branch/class group. Sch ${candidate.schedule || ''}: ${candidate.dtxr || ''}${sourceSuffix}`;
        const badge = cell.querySelector('.mc-preview-badge');
        if (badge) { badge.textContent = 'DTXR Sch'; badge.className = 'mc-preview-badge exact'; }
        else cell.insertAdjacentHTML('beforeend', ' <span class="mc-preview-badge exact">DTXR Sch</span>');
      }
      applied += 1;
    });
    if (applied > 0) {
      onSaveConfig?.(config);
      _markPreviewSaved(host, `${applied} Wall Thk override${applied === 1 ? '' : 's'} updated from ${available} DTXR schedule source row${available === 1 ? '' : 's'}${sourceSuffix}. Click Rebuild Preview to recompute enriched XML.`);
    } else {
      _markPreviewSaved(host, available ? `No Wall Thk keys could be updated from DTXR${sourceSuffix}.` : `No DTXR schedule + bore matches found for Wall Thk update${sourceSuffix}.`);
    }
  });
}

function _bindDtxrWallUpdateButton(args) {
  return _bindDtxrWallUpdateButtonBranchScoped(args);
}

export function xmlCiiRenderPreviewPhase(xmlFile, config) {
  const llRows = Array.isArray(config.linelist?.masterRows) ? config.linelist.masterRows.length : 0;
  const pcRows = Array.isArray(config.pipingClass?.masterRows) ? config.pipingClass.masterRows.length : 0;
  const matRows = Array.isArray(config.material?.mapRows) ? config.material.mapRows.length : 0;
  const wtRows = Array.isArray(config.weight?.masterRows) ? config.weight.masterRows.length : 0;

  if (!xmlFile) return `<div class="model-converters-workflow-detail-title">4 Preview</div><div class="model-converters-workflow-detail-note">⚠ Load an XML file in the sidebar first, then return here to preview enrichment.</div>`;

  const masterStatusRow = (label, rows, required) => {
    const ok = rows > 0;
    const icon = ok ? '✓' : (required ? '⚠' : '○');
    const style = ok ? 'color:#22c55e' : (required ? 'color:#f59e0b;font-weight:600' : 'color:#64748b');
    return `<span style="${style}">${icon} ${_esc(label)}: ${ok ? `${rows} row(s)` : 'not loaded'}</span>`;
  };
  const masterStatusHtml = `<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;padding:8px 0 4px;">
    ${masterStatusRow('Line List', llRows, true)}
    ${masterStatusRow('Piping Class', pcRows, true)}
    ${masterStatusRow('Material Map', matRows, false)}
    ${masterStatusRow('Valve Weights', wtRows, false)}
  </div>`;

  if (!llRows && !pcRows) return `<div class="model-converters-workflow-detail-title">4 Preview</div>${masterStatusHtml}<div class="model-converters-workflow-detail-note">⚠ Import at least one master in 2 Import Masters, then return here.</div>`;

  return `<div class="model-converters-workflow-detail-title">4 Preview</div><div class="model-converters-workflow-detail-text">Dry-run enrichment preview per branch — inspect and override approximate matches.</div>${masterStatusHtml}<div id="mc-preview-table-host">${_manualPreviewActionHtml('Build Preview', false, config)}<div class="model-converters-workflow-detail-note" style="text-align:center;padding:18px;">Preview is not auto-built. Click <strong>Build Preview</strong> after loading XML/master data.</div></div>`;
}

export async function xmlCiiBuildAndRenderPreview(rootEl, xmlText, config, options = {}) {
  const { onSaveConfig, openOverridePopup, ensureOverrides, forceBuild = false } = options;
  const host = rootEl?.querySelector('#mc-preview-table-host');
  if (!host) return;

  // Fail closed for engineering correctness: the former persisted-cache key
  // omitted effective staged JSON, full XML/master contents, and some overrides.
  // Without a complete validated input identity, only an explicit Build/Rebuild
  // may calculate and present Preview rows. Do not resurrect prior saved rows.
  if (!forceBuild) {
    _renderManualPreviewIdle(host, rootEl, xmlText, config, options);
    return;
  }

  const stagedSource = await _resolvePreviewStagedJsonText(options, config);
  const { branchRows, nodeRows } = xmlCiiDryRunPreview(xmlText, config, stagedSource.text);

  if (!branchRows.length) {
    host.innerHTML = `${_manualPreviewActionHtml('Build Preview', false, config)}<div class="model-converters-workflow-detail-note">No branches found in XML.</div>`;
    _bindManualPreviewButton(host, rootEl, xmlText, config, options);
    _bindParsedCustomSourceToggle(host, config, options);
    return;
  }

  const nodesByBranch = new Map();
  if (Array.isArray(nodeRows)) {
    for (const nr of nodeRows) {
      const bKey = nr.branchName || '';
      if (!nodesByBranch.has(bKey)) nodesByBranch.set(bKey, []);
      nodesByBranch.get(bKey).push(nr);
    }
  }

  const table = new XmlCiiAdaptedEditablePreviewTable({
    branchRows,
    nodesByBranch,
    matchBadgeHtmlRenderer: (method, confidence, needsReview, value, derived) => {
      const valEsc = _esc(value || '—'), derivedEsc = _esc(derived || ''), pctText = _percentText(confidence);
      if (method === 'override') return `<span class="mc-preview-editable-val">${valEsc}</span> <span class="mc-preview-badge exact" title="Manual override applied by user in Preview table${pctText ? ` (${pctText})` : ''}.">✓ override${pctText ? ` ${pctText}` : ''}</span>`;
      if (method === 'exact') return `<span class="mc-preview-editable-val">${valEsc}</span> <span class="mc-preview-badge exact" title="Exact match (100% confidence) verified in master data for: ${derivedEsc || valEsc}.">✓ exact ${pctText || '100%'}</span>`;
      if (['startsWith', 'leading-numeric-base', 'prefix-base', 'leading-numeric-exact'].includes(method)) return `<span class="mc-preview-editable-val">${valEsc}</span> <span class="mc-preview-badge amber" title="Approximate prefix/numeric match (${method}): resolved '${valEsc}' from raw value '${derivedEsc}'${pctText ? ` (${pctText} confidence)` : ''}.">approx${pctText ? ` ${pctText}` : ''}</span>`;
      if (['fuzzy', 'fuzzy-ratio', 'numeric-near'].includes(method)) return `<span class="mc-preview-editable-val">${valEsc}</span> <span class="mc-preview-badge ${needsReview ? 'orange' : 'amber'}" title="Fuzzy similarity match (${method}): proposed '${valEsc}' for raw input '${derivedEsc}'${pctText ? ` (${pctText} confidence)` : ''}.">fuzzy${pctText ? ` ${pctText}` : ''}</span>`;
      if (method === 'ambiguous' || method === 'ambiguous-approximate') return `<span class="mc-preview-editable-val">—</span> <span class="mc-preview-badge bad" title="Ambiguous candidate match for '${derivedEsc}'. Multiple conflicting master rows match with similar scores; manual override required.">ambiguous${pctText ? ` ${pctText}` : ''}</span>`;
      if (needsReview) {
        const noCode = !value || value === '—';
        const badgeTitle = noCode
          ? `No material code found in the material map for: ${derived || 'unknown key'}. Click to override manually.`
          : `Review: material code "${value}" resolved from "${derived || ''}" but confidence is low.`;
        return `<span class="mc-preview-editable-val">${valEsc}</span> <span class="mc-preview-badge bad" title="${_esc(badgeTitle)}">review${pctText ? ` ${pctText}` : ''}</span>`;
      }
      return `<span class="mc-preview-editable-val">${valEsc}</span>`;
    },
    processInputHtmlRenderer: (fieldKey, lineKey, val, src, ri, pcKey = '') => {
      const cls = src === 'override' ? 'mc-preview-pd-cell mc-preview-pd-override' : (src === 'linelist' || src.startsWith('linelist-density') ? 'mc-preview-pd-cell mc-preview-pd-linelist' : ((src === 'default' || src === 'default-zero') ? 'mc-preview-pd-cell mc-preview-pd-default' : 'mc-preview-pd-cell mc-preview-pd-empty'));
      const rangeOrig = ['t1', 't2', 't3'].includes(fieldKey) ? (branchRows[Number(ri)]?.[fieldKey + 'RangeOrig'] || null) : null;
      const inputStyle = rangeOrig ? ` style="color:#d97706;font-weight:600;" title="Range resolved to max: original value was '${_esc(rangeOrig)}'"` : (src === 'default' ? ' style="color:#7f1d1d;font-weight:600;font-style:italic;" title="Config default value"' : (src === 'default-zero' ? ' style="color:#7f1d1d;font-weight:600;font-style:italic;" title="Converter default: no value found — converter writes 0. Enter a value here to override."' : ''));
      const pcKeyAttr = pcKey ? ` data-mc-pd-pckey="${_esc(pcKey)}"` : '';
      return `<div class="${cls}"><input type="text" class="mc-preview-pd-input" value="${_esc(val)}" placeholder="${fieldKey}" data-mc-pd-field="${_esc(fieldKey)}" data-mc-pd-linekey="${_esc(lineKey)}" data-mc-row="${ri}"${pcKeyAttr}${inputStyle}><button type="button" class="mc-preview-filldown-btn mc-pd-filldown" data-mc-fill-field="${_esc(fieldKey)}" data-mc-fill-from="${ri}" title="Smart fill: hydroPressure by piping class, others by line key">↓</button></div>`;
    },
    onWeightCandidateSelect: ({ key, weight }) => {
      const numeric = Number(weight);
      if (!key || !Number.isFinite(numeric) || numeric <= 0) return;
      const overrides = ensureOverrides(config);
      overrides.rigidWeight = { ...(overrides.rigidWeight || {}), [key]: numeric };
      onSaveConfig(config);
      _markPreviewSaved(host, 'Weight override saved. Click Rebuild Preview to recompute suggestions.');
    },
    onCellEditClick: ({ editType, derivedKey, currentVal, rowIndex, td }) => openOverridePopup({ editType, derivedKey, currentVal, config, onSave: (newVal) => {
      const row = branchRows[Number(rowIndex)] || {};
      if (editType === 'pipingClass') {
        _renderClassTransactionStatus(host, newVal);
        void runAtomicPreviewClassTransaction({
          config,
          applyOverride: async () => {
            const savedKey = _savePreviewOverride({ config, ensureOverrides, editType, row, derivedKey, value: newVal });
            markAdaptedPreviewOverrideManual({ config, ensureOverrides, field: editType, key: savedKey, value: newVal });
            return { savedKey, value: newVal };
          },
          hydrateAuthority: async () => _hydrateEffectiveClassConfig(config, xmlText),
          persistConfig: async () => onSaveConfig?.(config),
          rebuildPreview: async ({ hydrationResult, rollback, error }) => {
            await xmlCiiBuildAndRenderPreview(rootEl, xmlText, config, { ...options, forceBuild: true });
            const rebuiltHost = rootEl?.querySelector('#mc-preview-table-host');
            if (rollback) {
              _markPreviewSaved(rebuiltHost, `Piping Class update failed and was rolled back: ${_toText(error?.message || error)}`);
            } else {
              _markPreviewSaved(rebuiltHost, _classTransactionSuccessMessage(hydrationResult, newVal));
            }
          },
        }).catch((error) => {
          console.error('Atomic Piping Class Preview update failed:', error);
          const currentHost = rootEl?.querySelector('#mc-preview-table-host');
          if (error?.rollbackError) {
            currentHost.innerHTML = `<div class="model-converters-workflow-detail-note" style="border-color:#7f1d1d;color:#7f1d1d;background:#fff7f7;">Piping Class update failed, and the prior Preview could not be restored: ${_esc(error.rollbackError?.message || error.rollbackError)}</div>`;
          }
        });
        return;
      }
      const savedKey = _savePreviewOverride({ config, ensureOverrides, editType, row, derivedKey, value: newVal });
      markAdaptedPreviewOverrideManual({ config, ensureOverrides, field: editType, key: savedKey, value: newVal });
      if (editType === 'rating' && row.lineKey) markAdaptedPreviewProcessManual({ config, ensureOverrides, field: 'rating', lineKey: row.lineKey, value: newVal });
      onSaveConfig(config);
      td.dataset.mcFillState = 'manual';
      _updateEditedPreviewCell(td, newVal);
      _markPreviewSaved(host);
    } }),
    onFillDownClick: ({ field, fromRow, currentVal, sourceTd }) => {
      const pipingClassKey = sourceTd?.dataset?.mcPcKey || '';
      const filled = pipingClassKey ? applyAdaptedPreviewSmartFillByClass({ host, config, ensureOverrides, field, pipingClassKey, currentValue: currentVal }) : applyAdaptedPreviewOverrideFillDown({ host, config, ensureOverrides, field, fromRow, currentValue: currentVal });
      if (filled > 0) {
        if (field === 'rating') {
          const overrides = ensureOverrides(config);
          for (const row of branchRows) {
            const value = _bucketText(config, 'rating', _ratingKeys(row));
            if (value && row.lineKey) _setProcessDataField(overrides, row.lineKey, 'rating', value);
          }
        }
        onSaveConfig(config);
        _markPreviewSaved(host, `${filled} override${filled === 1 ? '' : 's'} saved (class smart fill). Click Rebuild Preview to recompute suggestions.`);
      }
    },
    onProcessInputChange: ({ field, fieldKey, lineKey, value, input }) => {
      const overrides = ensureOverrides(config);
      if (!overrides.processData) overrides.processData = {};
      if (!overrides.processData[lineKey]) overrides.processData[lineKey] = {};
      const cleanVal = _toText(value).trim();
      const actualField = field || fieldKey;
      if (cleanVal === '') delete overrides.processData[lineKey][actualField];
      else overrides.processData[lineKey][actualField] = cleanVal;
      if (actualField === 'rating' && cleanVal) overrides.rating = overrides.rating && typeof overrides.rating === 'object' && !Array.isArray(overrides.rating) ? { ...overrides.rating, [lineKey]: cleanVal } : { [lineKey]: cleanVal };
      if (Object.keys(overrides.processData[lineKey]).length === 0) delete overrides.processData[lineKey];
      markAdaptedPreviewProcessManual({ config, ensureOverrides, field: actualField, lineKey, value: cleanVal });
      onSaveConfig(config);
      const cell = input.closest('.mc-preview-pd-cell');
      if (cell) cell.className = cleanVal ? 'mc-preview-pd-cell mc-preview-pd-override' : 'mc-preview-pd-cell mc-preview-pd-empty';
      _markPreviewSaved(host, 'Process override saved. Click Rebuild Preview to recompute suggestions.');
    },
    onProcessFillDownClick: ({ fieldKey, fromRow, value, pipingClassKey }) => {
      const sourceInput = host.querySelector(`[data-mc-pd-field="${fieldKey}"][data-mc-pd-row="${fromRow}"]`);
      const lineKey = sourceInput?.dataset?.mcPdLinekey || '';
      const isPcField = fieldKey === 'hydroPressure';
      const filled = (isPcField && pipingClassKey) ? applyAdaptedPreviewSmartProcessFillByClass({ host, config, ensureOverrides, field: fieldKey, pipingClassKey, lineKey: '', currentValue: value }) : (lineKey ? applyAdaptedPreviewSmartProcessFillByClass({ host, config, ensureOverrides, field: fieldKey, pipingClassKey: '', lineKey, currentValue: value }) : applyAdaptedPreviewProcessFillDown({ host, config, ensureOverrides, field: fieldKey, fromRow, currentValue: value }));
      if (filled > 0) {
        onSaveConfig(config);
        _markPreviewSaved(host, `${filled} process override${filled === 1 ? '' : 's'} saved (smart fill). Click Rebuild Preview to recompute suggestions.`);
      }
    }
  });

  host.innerHTML = `${_manualPreviewActionHtml('Rebuild Preview', true, config)}<div class="bulk-map-container-host"></div>${table.renderHTML()}`;
  const mapContainer = host.querySelector('.bulk-map-container-host');
  if (mapContainer) {
    const lineListKeys = _xmlCiiLineListKeys(config);
    renderBranchLineMapPanel(mapContainer, {
      branchRows,
      lineListKeys,
      config,
      onSaveConfig: (cfg) => {
        if (typeof onSaveConfig === 'function') onSaveConfig(cfg);
        _markPreviewSaved(host, 'Branch mappings saved. Click Rebuild Preview to apply.');
      },
      onRebuildPreview: () => {
        void xmlCiiBuildAndRenderPreview(rootEl, xmlText, config, { ...options, forceBuild: true });
      }
    });
  }
  _bindManualPreviewButton(host, rootEl, xmlText, config, options, 'Rebuilding preview...');
  _bindParsedCustomSourceToggle(host, config, options);

  const defaultFields = ['p1', 'hydroPressure', 't1', 't2', 't3', 'density', 'wallThickness', 'corrosion'];
  const defaultRows = branchRows.map((row, ri) => ({ row, ri, fields: defaultFields.filter((field) => _isDefaultSource(row[`${field}Source`])) })).filter((item) => item.fields.length > 0);

  if (stagedSource.label) host.insertAdjacentHTML('afterbegin', `<div class="model-converters-workflow-detail-note" style="margin:0 0 8px;border-color:#2b6cb0;color:#1e3a8a;background:#eff6ff;">DTXR staged source: ${_esc(stagedSource.label)}</div>`);
  if (defaultRows.length) host.insertAdjacentHTML('afterbegin', `<div class="model-converters-workflow-detail-note" style="margin:0 0 8px;border-color:#7f1d1d;color:#7f1d1d;background:#fff7f7;">${defaultRows.length} line${defaultRows.length === 1 ? '' : 's'} use config defaults. Default values are shown in dark red.</div>`);

  // The v7 wrapper and its internal-rebuild observer require this transient
  // successful-build handoff to preserve rating snapshots and DTXR actions.
  publishExplicitPreviewBridge(branchRows, nodeRows);

  table.bind(host);
  _bindDtxrWallUpdateButton({ host, branchRows, config, ensureOverrides, onSaveConfig, stagedSourceLabel: stagedSource.label });
}
