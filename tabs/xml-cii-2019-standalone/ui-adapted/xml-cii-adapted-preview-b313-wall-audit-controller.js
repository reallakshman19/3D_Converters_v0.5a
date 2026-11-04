import {
  B313_PREVIEW_ACTION_LABEL,
  B313_PREVIEW_REPORT_SCHEMA,
  buildPreviewB313WallUpdateReport,
  installPreviewB313WallUpdateController,
  readCommittedPreviewB313Rows,
} from './xml-cii-adapted-preview-b313-wall-update.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function esc(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fixed(value, digits = 3) {
  const number = finite(value);
  return number === null ? '—' : number.toFixed(digits);
}

function compact(value, digits = 4) {
  const number = finite(value);
  if (number === null) return '—';
  return Number(number.toFixed(digits)).toString();
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') : [];
}

export function selectPreviewB313AuditRows(snapshot = [], live = []) {
  const liveRows = normalizeRows(live);
  if (liveRows.length) return liveRows;
  return normalizeRows(snapshot);
}

export function derivePreviewB313AuditSummary(report = {}) {
  const rows = normalizeRows(report?.rows);
  const declaredInput = Math.max(0, finite(report?.summary?.inputRows) ?? 0);
  const evaluatedRows = Math.max(declaredInput, rows.length);
  const updatedRows = rows.filter((row) => row.status === 'UPDATED').length;
  const explicitNotUpdatedRows = rows.filter((row) => row.status !== 'UPDATED').length;
  const notUpdatedRows = Math.max(explicitNotUpdatedRows, evaluatedRows - updatedRows);
  const declaredUpdated = Math.max(0, finite(report?.summary?.updatedRows) ?? 0);
  const declaredSkipped = Math.max(0, finite(report?.summary?.skippedRows) ?? 0);
  const summaryMismatch = declaredInput !== evaluatedRows
    || declaredUpdated !== updatedRows
    || declaredSkipped !== notUpdatedRows;
  return {
    evaluatedRows,
    updatedRows,
    notUpdatedRows,
    summaryMismatch,
    hasInput: evaluatedRows > 0,
    allUpdated: evaluatedRows > 0 && updatedRows === evaluatedRows,
  };
}

function statusPill(status) {
  const updated = status === 'UPDATED';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.03em;background:${updated ? '#dcfce7' : '#fef3c7'};color:${updated ? '#166534' : '#92400e'};border:1px solid ${updated ? '#86efac' : '#fcd34d'};">${updated ? 'UPDATED' : 'NOT UPDATED'}</span>`;
}

function authorityLabel(mode) {
  if (mode === 'ACTIVE_MASTER_STRICT') return 'ACTIVE MASTER / STRICT';
  if (mode === 'MANUAL_EXPLICIT_FALLBACK') return 'MANUAL CONTROLLED FALLBACK';
  return text(mode) || 'UNRESOLVED';
}

function updatedRowHtml(row) {
  const evidence = row?.evidence || {};
  const result = row?.result || {};
  const calculation = result?.calculation || evidence?.calculation || {};
  const schedule = Array.isArray(result?.equivalentSchedules) && result.equivalentSchedules.length
    ? result.equivalentSchedules.join(' / ')
    : text(result?.selectedSchedule) || '—';
  const material = text(evidence.previewMaterial) || text(row.materialId) || '—';
  const materialId = text(row.materialId) || text(evidence.materialId) || '—';
  const t1 = text(evidence.designTemperature) || '—';
  const factorMode = authorityLabel(row.factorBasisMode || evidence.factorBasisMode);
  const factorSource = evidence.factorDesignAuthority === true ? 'design-authority factor record' : 'non-design-authority fallback';
  const factorDetail = `S ${compact(evidence.allowableStress)} ${esc(evidence.stressUnit || '')} · E ${compact(evidence.qualityFactorE)} · W ${compact(evidence.weldStrengthReductionW)} · Y ${compact(evidence.coefficientY)}`;
  const wallDetail = `OD ${fixed(result.outsideDiameterMm, 3)} mm · P ${compact(result.designPressure)} ${esc(result.pressureUnit || '')} · CA ${compact(result.corrosionAllowanceMm)} mm`;
  const resultDetail = `required nominal ${fixed(calculation.requiredNominalThicknessMm, 4)} mm → selected ${fixed(result.selectedNominalWallMm, 4)} mm · Sch ${esc(schedule)} · margin ${fixed(result.selectionMarginMm, 4)} mm`;
  return `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-family:monospace;font-size:11px;color:#0f172a;">${esc(row.branchName || '—')}</div><div style="font-size:10px;color:#64748b;margin-top:2px;">Line ${esc(row.lineKey || '—')}</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-weight:700;">${esc(material)}</div><div style="font-size:10px;color:#64748b;">${esc(materialId)} · T1 ${esc(t1)} °C</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-weight:700;color:#166534;">${esc(factorMode)}</div><div style="font-size:10px;color:#475569;">${factorDetail}</div><div style="font-size:10px;color:#64748b;">${esc(factorSource)}</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div>${wallDetail}</div><div style="font-size:10px;color:#475569;margin-top:2px;">${resultDetail}</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;">${statusPill('UPDATED')}</td>
  </tr>`;
}

function failedRowHtml(row) {
  const details = row?.details || {};
  const identity = details.materialIdentity || details.factorBasis?.materialIdentity || null;
  const factorBasis = details.factorBasis || null;
  const materialId = identity?.ok ? identity.material?.materialId : '';
  const factorMode = factorBasis?.ok ? authorityLabel(factorBasis.mode) : text(factorBasis?.code) || 'NOT RESOLVED';
  const reason = text(row.message || row.code || 'Row was not updated.');
  return `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-family:monospace;font-size:11px;color:#0f172a;">${esc(row.branchName || '—')}</div><div style="font-size:10px;color:#64748b;margin-top:2px;">Line ${esc(row.lineKey || '—')}</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-weight:700;">${esc(materialId || 'Material identity unresolved')}</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-weight:700;color:#92400e;">${esc(factorMode)}</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><div style="font-weight:700;color:#991b1b;">${esc(row.code || 'B313_PREVIEW_NOT_UPDATED')}</div><div style="font-size:11px;color:#475569;margin-top:2px;">${esc(reason)}</div></td>
    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;">${statusPill('NOT_UPDATED')}</td>
  </tr>`;
}

export function renderPreviewB313WallAuditHtml(report = {}) {
  const rows = normalizeRows(report?.rows);
  const summary = derivePreviewB313AuditSummary(report);
  const warning = !summary.hasInput
    ? '<div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;font-size:11px;font-weight:700;">No Preview branch rows were available to evaluate. No wall-thickness change was made.</div>'
    : summary.summaryMismatch
      ? '<div style="margin-top:8px;padding:7px 10px;border-radius:6px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;font-size:10px;">Audit counters were recomputed from row evidence because the supplied summary was stale or inconsistent.</div>'
      : '';
  const border = summary.allUpdated ? '#86efac' : '#f59e0b';
  const titleColor = summary.allUpdated ? '#166534' : '#92400e';
  const tableRows = rows.map((row) => row.status === 'UPDATED' ? updatedRowHtml(row) : failedRowHtml(row)).join('');
  const emptyRows = rows.length ? '' : '<tr><td colspan="5" style="padding:12px;text-align:center;color:#64748b;">No row-level audit evidence available.</td></tr>';

  return `<details data-mc-b313-report open style="margin:10px 0;border:1px solid ${border};border-radius:8px;background:#ffffff;padding:10px;box-shadow:0 1px 2px rgba(15,23,42,.06);">
    <summary style="cursor:pointer;font-weight:800;color:${titleColor};">B31.3 wall update audit · Evaluated ${summary.evaluatedRows} · Updated ${summary.updatedRows} · Not updated ${summary.notUpdatedRows}</summary>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 6px;">
      <span style="padding:4px 8px;border-radius:6px;background:#f1f5f9;color:#334155;font-size:10px;"><strong>Code basis</strong> ASME B31.3-2024 §304.1.2 Eq. (3a)</span>
      <span style="padding:4px 8px;border-radius:6px;background:#ecfdf5;color:#166534;font-size:10px;"><strong>Primary factors</strong> Preview Material → B31.3 identity → active strict S/E/W/Y at T1</span>
      <span style="padding:4px 8px;border-radius:6px;background:#fffbeb;color:#92400e;font-size:10px;"><strong>Fallback</strong> manual S/E/W/Y only when active master is incomplete; controlled source required</span>
      <span style="padding:4px 8px;border-radius:6px;background:#f8fafc;color:#475569;font-size:10px;"><strong>Excluded</strong> BENCHMARK_ONLY factors</span>
      <span style="padding:4px 8px;border-radius:6px;background:#f8fafc;color:#475569;font-size:10px;"><strong>Mill tolerance</strong> 12.5% negative</span>
    </div>
    ${warning}
    <div style="overflow:auto;max-height:380px;margin-top:8px;border:1px solid #e2e8f0;border-radius:6px;">
      <table style="border-collapse:collapse;width:100%;font-size:11px;min-width:1120px;">
        <thead style="position:sticky;top:0;background:#f8fafc;z-index:1;"><tr>
          <th style="text-align:left;padding:7px 10px;">Branch / Line</th>
          <th style="text-align:left;padding:7px 10px;">Material / T1</th>
          <th style="text-align:left;padding:7px 10px;">Factor authority / S-E-W-Y</th>
          <th style="text-align:left;padding:7px 10px;">Wall calculation / selection</th>
          <th style="text-align:left;padding:7px 10px;">Status</th>
        </tr></thead>
        <tbody>${tableRows}${emptyRows}</tbody>
      </table>
    </div>
  </details>`;
}

function zeroInputReport() {
  return {
    schema: B313_PREVIEW_REPORT_SCHEMA,
    action: B313_PREVIEW_ACTION_LABEL,
    authority: 'EXPLICIT_PREVIEW_ACTION_NOT_AUTOMATIC_WALL_AUTHORITY',
    summary: { inputRows: 0, updatedRows: 0, skippedRows: 0 },
    rows: [],
    diagnostics: [{
      code: 'B313_PREVIEW_ROWS_UNAVAILABLE',
      message: 'No Preview branch rows were available when the explicit wall update was requested.',
    }],
  };
}

function renderReport(host, report) {
  host?.querySelector?.('[data-mc-b313-report]')?.remove?.();
  const editor = host?.querySelector?.('[data-mc-b313-basis-editor]');
  if (editor) {
    editor.insertAdjacentHTML('afterend', renderPreviewB313WallAuditHtml(report));
    return;
  }
  const actionBar = host?.querySelector?.('[data-mc-preview-build]')?.parentElement;
  actionBar?.parentElement?.insertAdjacentHTML?.('afterend', renderPreviewB313WallAuditHtml(report));
}

function bindAuditButton(host, config, xmlText, options) {
  const button = host?.querySelector?.('[data-mc-b313-wall-update]');
  if (!button || button.dataset.mcB313AuditV2Bound === 'true') return;
  button.dataset.mcB313AuditV2Bound = 'true';
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled = true;
    // A missing/in-progress Preview is NOT replaced with stale retained rows.
    const rows = readCommittedPreviewB313Rows(options);
    try {
      const report = rows.length
        ? buildPreviewB313WallUpdateReport({ rows, config, xmlText, host })
        : zeroInputReport();
      await options?.onSaveConfig?.(config);
      await options?.onB313WallUpdateReport?.(report);
      renderReport(host, report);
    } catch (error) {
      const inputRows = rows.length;
      const report = {
        schema: B313_PREVIEW_REPORT_SCHEMA,
        action: B313_PREVIEW_ACTION_LABEL,
        authority: 'EXPLICIT_PREVIEW_ACTION_NOT_AUTOMATIC_WALL_AUTHORITY',
        summary: { inputRows, updatedRows: 0, skippedRows: inputRows },
        rows: [{
          branchName: '',
          lineKey: '',
          status: 'NOT_UPDATED',
          code: 'B313_PREVIEW_ACTION_EXCEPTION',
          message: text(error?.message || error),
        }],
      };
      await options?.onB313WallUpdateReport?.(report);
      renderReport(host, report);
    } finally {
      button.disabled = false;
    }
  }, { capture: true });
}

export function installPreviewB313WallUpdateAuditController({ host, config, xmlText, options = {} } = {}) {
  if (!host || !config) return;
  installPreviewB313WallUpdateController({ host, config, xmlText, options });

  host.__xmlCiiB313WallAuditObserver?.disconnect?.();
  const refresh = () => {
    bindAuditButton(host, config, xmlText, options);
  };
  refresh();
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(refresh);
    observer.observe(host, { childList: true, subtree: true });
    host.__xmlCiiB313WallAuditObserver = observer;
  }
}
