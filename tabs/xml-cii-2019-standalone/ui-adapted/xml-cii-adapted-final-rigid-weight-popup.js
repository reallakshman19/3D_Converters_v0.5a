const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (value) => esc(value).replace(/'/g, '&#39;');
function numberText(value, decimals = 1) {
  const n = Number(value);
  return value !== null && value !== undefined && Number.isFinite(n) ? n.toFixed(decimals) : 'unknown';
}

function evidenceCell(approach) {
  if (!approach?.available) return `<span style="color:#fda4af;">Unavailable: ${esc(approach?.error?.code || approach?.status || 'NO_ESTIMATE')}</span>`;
  const deviation = Number(approach.deviationPct);
  const signed = Number.isFinite(deviation) ? `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%` : 'unknown';
  return `<span style="color:${approach.abnormal ? '#fca5a5' : '#86efac'};">${numberText(approach.estimatedWeightKg, 3)} kg · Δ ${signed}</span>`;
}

function reviewRow(issue, index, inNewton) {
  const existing = Number(issue.currentWeightKg);
  const current = Number.isFinite(existing) && existing > 0 ? existing : null;
  const proposed = Number(issue.proposedWeightKg);
  const suggestion = Number.isFinite(proposed) && proposed > 0 ? proposed : null;
  const flags = Array.isArray(issue.reviewFlags) ? issue.reviewFlags : [];
  const evidence = issue.empiricalEvidence || {};
  const confidence = issue.suggestionConfidencePct;
  const confidenceLabel = confidence === null || confidence === undefined || !Number.isFinite(Number(confidence))
    ? 'match confidence unavailable' : `${Number(confidence).toFixed(1)}% match confidence`;
  const ref = issue.componentRefNo || 'Unresolved component reference';
  const displayElement = `${issue.fromNode || '?'} → ${issue.toNode || '?'}`;
  const exportValue = current === null ? 'unresolved' : `${numberText(current * (inNewton ? 10 : 1), 2)} ${inNewton ? 'N' : 'kg'}`;
  return `<tr data-final-rigid-review-row style="border-bottom:1px solid #334155;">
    <td style="padding:8px;white-space:nowrap;">${esc(displayElement)}</td>
    <td style="padding:8px;min-width:180px;" title="${attr(issue.branchName)}">${esc(issue.branchName)}</td>
    <td style="padding:8px;word-break:break-all;">${esc(ref)}</td>
    <td style="padding:8px;white-space:nowrap;">${numberText(issue.elementLengthMm)} mm${Number(issue.wholeComponentSpanMm) > 0 ? ` / component ${numberText(issue.wholeComponentSpanMm)} mm` : ''}</td>
    <td style="padding:8px;white-space:nowrap;">${current === null ? '0 / missing' : `${numberText(current, 3)} kg`}</td>
    <td style="padding:8px;white-space:nowrap;">${esc(exportValue)}</td>
    <td style="padding:8px;">${suggestion === null ? 'No qualified suggestion' : `${numberText(suggestion, 3)} kg · ${confidenceLabel} (review required)`}</td>
    <td style="padding:8px;min-width:150px;">${evidenceCell(evidence.approach1)}</td>
    <td style="padding:8px;min-width:150px;">${evidenceCell(evidence.approach2)}</td>
    <td style="padding:8px;min-width:190px;color:#fbbf24;">${esc(flags.join('; '))}</td>
    <td style="padding:8px;">
      <input type="number" min="0.001" step="any" data-final-rigid-mass="${index}"
       value="${attr(current === null ? '' : current)}" placeholder="Enter kg"
       aria-label="Approved mass in kg for element ${attr(displayElement)}"
       style="width:94px;padding:6px;border-radius:5px;color:#fff;background:#101827;border:1px solid #64748b;">
    </td>
    <td style="padding:8px;text-align:center;">
      <input type="checkbox" data-final-rigid-approve="${index}"
        aria-label="Explicitly approve element ${attr(displayElement)} after review">
    </td>
  </tr>`;
}

export function finalRigidWeightReviewMarkup(issues, options = {}) {
  const inNewton = options.kgToNewton !== false;
  return `<div class="mc-rigid-review-dialog" role="dialog" aria-modal="true"
    aria-label="Empirical A1 A2 weight deviation review before CII export"
    style="background:#0f172a;color:#e2e8f0;border:1px solid #475569;border-radius:8px;padding:18px;width:96%;max-width:1500px;max-height:90vh;overflow:auto;">
    <header style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding-bottom:12px;border-bottom:1px solid #334155;">
      <div>
        <h2 style="font-size:18px;font-weight:700;color:#fbbf24;margin:0 0 6px;">Empirical Weight Deviation Review — Final CII Export</h2>
        <div>${issues.length} rigid weight(s) needing approval in ${esc(options.sourceName || 'current source')}: empirical deviation &gt; ±50%, unavailable A1/A2 evidence, or auto-suggestion confidence outside 60–100%.</div>
      </div>
      <button type="button" data-final-rigid-cancel style="padding:8px;background:#334155;color:#fff;border:0;border-radius:5px;">Cancel CII Export</button>
    </header>
    <p style="padding:8px 0;color:#fde68a;">Source values are in <strong>kg</strong>. CII output will use <strong>${inNewton ? 'N (kg × 10)' : 'kg (no conversion)'}</strong>.
    The empirical API checks A1 (size-band) and A2 (leave-target-cell-out matrix). Deviation = (observed kg − estimated kg) / estimated kg × 100.
    <strong>Empirical review threshold: ±50% (strictly greater than 50% deviation).</strong> Either available approach exceeding it triggers review. If neither approach is available, review is required.
    <strong>Separate suggestion auto-apply range: 60–100% match confidence</strong> and within empirical ±50%; other suggestions cannot be assigned without manual approval.
    Enter or correct each mass, then check its explicit approval box. Cancel blocks conversion; no silent skip.</p>
    <div style="overflow:auto;max-height:55vh;">
      <table style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr style="position:sticky;top:0;background:#1e293b;">
          <th>Actual CII element</th><th>Branch</th><th>ComponentRefNo</th><th>Element / physical span</th>
          <th>Current mass</th><th>CII mass/force</th><th>Unapproved proposal</th><th>A1 estimate / deviation</th><th>A2 estimate / deviation</th><th>Reason for review</th><th>Approved kg</th><th>Reviewed</th>
        </tr></thead><tbody>${issues.map((row, index) => reviewRow(row, index, inNewton)).join('')}</tbody>
      </table>
    </div>
    <p data-final-rigid-status role="status" style="min-height:18px;color:#fca5a5;"></p>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
      <button type="button" data-final-rigid-cancel-secondary style="background:#334155;color:#fff;border:0;border-radius:5px;padding:10px 14px;">Cancel</button>
      <button type="button" data-final-rigid-confirm style="background:#1d4ed8;color:#fff;border:0;border-radius:5px;padding:10px 14px;font-weight:700;">Apply Reviewed Weights and Continue</button>
    </div>
  </div>`;
}

export function openStandaloneFinalRigidWeightReviewPopup(issues = [], options = {}) {
  if (!Array.isArray(issues) || !issues.length) return Promise.resolve({ cancelled: false, weightsByKey: {}, approvedKeys: [] });
  if (typeof document === 'undefined') return Promise.resolve({ cancelled: true, error: 'Review dialog unavailable' });
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'model-converters-workflow-popup-overlay mc-rigid-review-overlay';
    overlay.innerHTML = finalRigidWeightReviewMarkup(issues, options);
    document.body.appendChild(overlay);
    let settled = false;
    const finish = (response) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(response);
    };
    const cancel = () => finish({ cancelled: true, weightsByKey: {}, approvedKeys: [] });
    overlay.querySelector('[data-final-rigid-cancel]')?.addEventListener('click', cancel);
    overlay.querySelector('[data-final-rigid-cancel-secondary]')?.addEventListener('click', cancel);
    overlay.querySelector('[data-final-rigid-confirm]')?.addEventListener('click', () => {
      const weightsByKey = {};
      const approvedKeys = [];
      const missing = [];
      for (let index = 0; index < issues.length; index += 1) {
        const input = overlay.querySelector(`[data-final-rigid-mass="${index}"]`);
        const approval = overlay.querySelector(`[data-final-rigid-approve="${index}"]`);
        const mass = Number(input?.value);
        if (!approval?.checked || !String(input?.value || '').trim() || !Number.isFinite(mass) || mass <= 0) {
          missing.push(`${issues[index].fromNode || '?'} → ${issues[index].toNode || '?'}`);
          if (input) input.style.borderColor = '#ef4444';
          continue;
        }
        weightsByKey[issues[index].key] = mass;
        approvedKeys.push(issues[index].key);
      }
      if (missing.length) {
        const status = overlay.querySelector('[data-final-rigid-status]');
        if (status) status.textContent = `Explicit kg value and Reviewed checkbox required for: ${missing.join(', ')}`;
        return;
      }
      finish({ cancelled: false, weightsByKey, approvedKeys });
    });
  });
}
