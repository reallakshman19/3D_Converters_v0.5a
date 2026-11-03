import {
  createEmpiricalWeightValidator,
  empiricalWeightValidationReportToCsv,
  downloadEmpiricalWeightValidationEvidenceZip,
} from '../../../converters/empirical-weight/index.js';

function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function esc(value) { return text(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function positive(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

function resolvedWeight(issue, config) {
  const overrides = object(config?.overrides);
  const keys = [issue?.key, issue?.legacyKey, issue?.originalKey, issue?.componentRefEndpoint].map(text).filter(Boolean);
  for (const [bucketName, label] of [
    ['rigidWeightFinal', 'Rigidmatch2'],
    ['rigidWeightMatch1', 'RigidMatch1'],
    ['rigidWeight', 'effective/legacy override'],
  ]) {
    const bucket = object(overrides[bucketName]);
    for (const key of keys) {
      const value = positive(bucket[key]);
      if (value !== null) return { weightKg: value, source: `${label}:${key}` };
    }
  }
  const mapped = positive(issue?.weight);
  if (mapped !== null) return { weightKg: mapped, source: issue?.weightSource || 'resolved Weight Match row' };
  return { weightKg: null, source: 'unresolved' };
}

function bestCandidate(issue) {
  const candidates = Array.isArray(issue?.candidates) ? issue.candidates : [];
  return candidates.find((candidate) => positive(candidate?.selectedWeight ?? candidate?.suggestedWeight ?? candidate?.weight)) || candidates[0] || null;
}

function candidateTarget(candidate) {
  const row = object(candidate?.rowData);
  const rf = positive(row['RF/RTJ KG'] ?? row.rfRtjKg ?? row.rfWeightKg);
  const bw = positive(row['BW KG'] ?? row.bwKg ?? row.bwWeightKg);
  const master = positive(candidate?.masterWeight ?? candidate?.weight);
  if (bw !== null && rf === null) return 'BW KG';
  if (bw !== null && master !== null && Math.abs(bw - master) < 1e-9 && (rf === null || Math.abs(rf - master) > 1e-9)) return 'BW KG';
  return 'RF/RTJ KG';
}

function validationRowsFromResolvedIssues(issues, config) {
  const rows = [];
  const skipped = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    const resolved = resolvedWeight(issue, config);
    if (resolved.weightKg === null) {
      skipped.push({ key: issue?.key || '', nodeNumber: issue?.nodeNumber || '', reason: 'no-positive-resolved-weight' });
      continue;
    }
    const candidate = bestCandidate(issue);
    const typeDesc = text(candidate?.typeDesc || candidate?.valveType || candidate?.type);
    if (!typeDesc) {
      skipped.push({ key: issue?.key || '', nodeNumber: issue?.nodeNumber || '', reason: 'no-empirical-type-description', observedWeightKg: resolved.weightKg });
      continue;
    }
    rows.push({
      rowId: issue?.key || issue?.componentRefEndpoint || issue?.nodeNumber || `row-${rows.length + 1}`,
      source: resolved.source,
      componentRefNo: issue?.componentRefNo || issue?.componentRefEndpoint || null,
      nodeNumber: issue?.nodeNumber || null,
      typeDesc,
      dn: issue?.boreMm,
      rating: issue?.rating,
      target: candidateTarget(candidate),
      observedWeightKg: resolved.weightKg,
    });
  }
  return { rows, skipped };
}

function makeBlobDownload(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function cell(value, digits = null) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (digits !== null && Number.isFinite(n)) return n.toFixed(digits);
  return esc(value);
}

function renderTable(host, report) {
  const rows = report?.abnormalities || [];
  if (!rows.length) {
    host.innerHTML = '<div style="padding:12px;color:#86efac;border:1px solid #166534;background:#052e16;border-radius:6px;">No resolved component weight exceeds ±30% against the available Approach 1 / Approach 2 estimates.</div>';
    return;
  }
  host.innerHTML = `<div style="overflow:auto;max-height:46vh;border:1px solid #334155;border-radius:6px;">
    <table style="border-collapse:collapse;width:100%;font-size:12px;min-width:1280px;">
      <thead><tr>${['Node','ComponentRef','TypeDesc','DN','Rating','Target','Resolved kg','A1 kg','A1 Δ%','A1 status','A2 kg','A2 Δ%','A2 status','Overall'].map((h) => `<th style="position:sticky;top:0;background:#172033;color:#bfdbfe;padding:6px;text-align:left;border-bottom:1px solid #334155;">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr>
        <td style="padding:6px;border-bottom:1px solid #243244;">${esc(row.nodeNumber)}</td>
        <td style="padding:6px;border-bottom:1px solid #243244;">${esc(row.componentRefNo)}</td>
        <td style="padding:6px;border-bottom:1px solid #243244;">${esc(row.typeDesc)}</td>
        <td style="padding:6px;border-bottom:1px solid #243244;">${cell(row.dn)}</td>
        <td style="padding:6px;border-bottom:1px solid #243244;">${cell(row.rating)}</td>
        <td style="padding:6px;border-bottom:1px solid #243244;">${esc(row.target)}</td>
        <td title="${esc(row.source)}" style="padding:6px;border-bottom:1px solid #243244;">${cell(row.observedWeightKg, 3)}</td>
        <td style="padding:6px;border-bottom:1px solid #243244;">${cell(row.approach1?.estimatedWeightKg, 3)}</td>
        <td style="padding:6px;border-bottom:1px solid #243244;">${cell(row.approach1?.deviationPct, 1)}</td>
        <td style="padding:6px;border-bottom:1px solid #243244;">${esc(row.approach1?.status)}</td>
        <td style="padding:6px;border-bottom:1px solid #243244;">${cell(row.approach2?.estimatedWeightKg, 3)}</td>
        <td style="padding:6px;border-bottom:1px solid #243244;">${cell(row.approach2?.deviationPct, 1)}</td>
        <td style="padding:6px;border-bottom:1px solid #243244;">${esc(row.approach2?.status)}</td>
        <td style="padding:6px;border-bottom:1px solid #243244;font-weight:700;color:#fca5a5;">${esc(row.status)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

export function appendEmpiricalWeightValidationReport(card, stateRef) {
  const section = document.createElement('section');
  section.style.cssText = 'margin-top:16px;padding-top:14px;border-top:1px solid #334155;';
  section.innerHTML = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
    <strong style="color:#dbeafe;">Weight Validation Report — resolved components, A1/A2 abnormality &gt; ±30%</strong>
    <button type="button" data-ewv-build style="padding:6px 10px;border-radius:6px;border:1px solid #475569;background:#1d4ed8;color:white;cursor:pointer;">Build report</button>
    <button type="button" data-ewv-csv disabled style="padding:6px 10px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#cbd5e1;cursor:pointer;">Save abnormal CSV</button>
    <button type="button" data-ewv-json disabled style="padding:6px 10px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#cbd5e1;cursor:pointer;">Save audit JSON</button>
    <button type="button" data-ewv-zip disabled style="padding:6px 10px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#cbd5e1;cursor:pointer;">Save validation evidence ZIP</button>
    <span data-ewv-status style="font-size:12px;color:#94a3b8;">Read-only validation; accepted weight is never modified.</span>
  </div>
  <div data-ewv-table style="margin-top:10px;"></div>`;
  card.appendChild(section);

  let report = null;
  const status = section.querySelector('[data-ewv-status]');
  const table = section.querySelector('[data-ewv-table]');
  const csvBtn = section.querySelector('[data-ewv-csv]');
  const jsonBtn = section.querySelector('[data-ewv-json]');
  const zipBtn = section.querySelector('[data-ewv-zip]');

  const buildFromResolved = (detail = {}) => {
    const masterRows = Array.isArray(detail.masterRows) ? detail.masterRows : [];
    const config = object(detail.config);
    const scope = validationRowsFromResolvedIssues(detail.issues, config);
    const validator = createEmpiricalWeightValidator({ masterRows });
    report = validator.buildReport(scope.rows, { abnormalityThresholdPct: 30 });
    report.inputScope = 'RESOLVED_WEIGHT_MATCH_COMPONENTS';
    report.skippedRows = scope.skipped;
    report.skippedRowCount = scope.skipped.length;
    stateRef.current.empiricalWeightValidationReport = report;
    renderTable(table, report);
    csvBtn.disabled = false;
    jsonBtn.disabled = false;
    zipBtn.disabled = false;
    if (status) status.textContent = `${report.summary.abnormalRows} abnormal of ${report.summary.inputRows} resolved component(s); A1 ${report.summary.approach1Abnormal}, A2 ${report.summary.approach2Abnormal}; ${scope.skipped.length} skipped/unresolved.`;
  };

  card.addEventListener('xml-cii-weight-validator-ready', (event) => buildFromResolved(event.detail || {}));

  section.querySelector('[data-ewv-build]')?.addEventListener('click', () => {
    if (typeof window !== 'undefined') window.__xmlCiiPendingValidation = true;
    if (status) status.textContent = 'Recomputing Weight Match rows and validating resolved component weights…';
    const refresh = card.querySelector('#mc-wm-refresh');
    if (refresh) refresh.click();
    else if (status) status.textContent = 'Weight Match Build Weight Data control is unavailable; report not generated.';
  });

  csvBtn?.addEventListener('click', () => {
    if (!report) return;
    makeBlobDownload('empirical-weight-component-abnormalities.csv', empiricalWeightValidationReportToCsv(report, { abnormalOnly: true }), 'text/csv;charset=utf-8');
  });
  jsonBtn?.addEventListener('click', () => {
    if (!report) return;
    makeBlobDownload('empirical-weight-component-validation-report.json', `${JSON.stringify(report, null, 2)}\n`, 'application/json;charset=utf-8');
  });
  zipBtn?.addEventListener('click', () => {
    if (!report) return;
    const manifest = downloadEmpiricalWeightValidationEvidenceZip(report);
    stateRef.current.empiricalWeightValidationEvidenceManifest = manifest;
    if (status) status.textContent = `${report.summary.abnormalRows} abnormal row(s); deterministic validation evidence ZIP saved.`;
  });
}
