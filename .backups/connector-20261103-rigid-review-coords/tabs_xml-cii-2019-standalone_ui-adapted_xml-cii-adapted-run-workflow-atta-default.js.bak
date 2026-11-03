import { runXmlCii2019Workflow, validateSupportConfigJson } from '../xml-cii-workflow-api-atta-default.js?v=20260803-atta-default-rest-closure-1';
import { buildStandaloneOutputRunReadiness } from '../xml-cii-output-run-readiness.js';
import { buildXmlCiiWorkflowJobFromUiState } from '../xml-cii-workflow-ui-adapter.js';
import { applyStandaloneOutputRunReadiness, updateWorkflowState, xmlCiiEnrichedConfigFromState, saveMasterContextToLocalStorage } from './xml-cii-adapted-state.js';
import {
  resolveStandaloneWeightReviewRating,
  standaloneWeightReviewRatingInfo,
} from './xml-cii-adapted-weight-rating-authority.js';

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');
const attr = (value) => esc(value).replace(/'/g, '&#39;');

export function standaloneRunReviewRatingFromConfig(row, config) {
  return resolveStandaloneWeightReviewRating(row, config).rating;
}

function ratingInfo(issue) {
  const {
    shownRating,
    dtxrRating,
    conflict,
    missingWithDtxr,
    derivedRating,
  } = standaloneWeightReviewRatingInfo(issue);
  const title = conflict
    ? `DTXR rating ${dtxrRating}# differs from resolved/override rating ${shownRating}. DTXR: ${issue.dtxr || ''}`
    : (missingWithDtxr
      ? `DTXR contains ${dtxrRating}#, but normal execution does not auto-populate Rating. Use “Fetch Rating as per DTXR” in Preview or enter a manual Rating.`
      : (derivedRating ? `Resolved rating from Piping Class master, Regex, or explicit override: ${derivedRating}` : 'Rating used for weight suggestions'));
  const style = conflict || missingWithDtxr
    ? 'width:64px;background:#3a1010;color:#ffd6d6;border:1px solid #ef4444;border-radius:4px;padding:4px;font-size:11px;'
    : 'width:64px;background:#101827;color:#fff;border:1px solid #31455f;border-radius:4px;padding:4px;font-size:11px;';
  return { shownRating, dtxrRating, conflict, missingWithDtxr, title, style };
}

function rigidCandidateButtons(issue, index) {
  return (issue.candidates || []).map((candidate) => {
    const value = candidate.suggestedWeight ?? candidate.weight;
    const scoreValue = Math.round((candidate.totalScore || candidate.score || 0) * 100);
    return `<button type="button" class="mc-rigid-review-candidate${candidate.preferred ? ' best' : ''}"
      data-rigid-review-candidate="${index}" data-rigid-review-weight="${esc(value)}"
      title="Bore ${candidate.boreMm || candidate.rowBore || '-'} | Rating ${candidate.rating || candidate.rowRating || issue.rating || '-'} | Master length ${(candidate.lengthMm || candidate.rowLength || 0).toFixed(1)} | Score ${scoreValue}%"
      style="font-size:11px;padding:3px 6px;margin:2px;cursor:pointer;">${candidate.preferred ? '* ' : ''}${esc(value)} kg - ${scoreValue}%</button>`;
  }).join('');
}

function rigidReviewRow(issue, index) {
  const best = issue.candidates?.[0] || null;
  const info = ratingInfo(issue);
  const ratingBadge = info.conflict
    ? ' <span title="Rating conflict with DTXR" style="color:#fca5a5;font-weight:700;">!</span>'
    : (info.missingWithDtxr ? ' <span title="DTXR Rating is evidence only; use the Preview fetch button" style="color:#fbbf24;font-weight:700;">DTXR available</span>' : '');
  return `<tr>
    <td class="mc-rigid-review-branch" title="${attr(issue.branchName)}" style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.branchName)}</td>
    <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.boreMm == null ? '' : `${Number(issue.boreMm).toFixed(0)} mm`)}</td>
    <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);"><input type="text" class="mc-rigid-review-rating-input" data-rigid-review-key="${attr(issue.key)}" value="${attr(info.shownRating)}" placeholder="Rating" title="${attr(info.title)}" style="${info.style}">${ratingBadge}</td>
    <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.nodeNumberDisplay || issue.nodeNumber)}</td>
    <td class="mc-rigid-review-dtxr" title="${attr([issue.dtxrSourcePath, info.dtxrRating ? `DTXR rating ${info.dtxrRating}# (evidence only)` : ''].filter(Boolean).join(' · '))}" style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.dtxr || 'Not found')}</td>
    <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.lengthMm == null ? '' : `${Number(issue.lengthMm).toFixed(1)} mm`)}</td>
    <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);"><input type="number" min="0" step="0.001" class="mc-rigid-review-input" data-rigid-review-key="${attr(issue.key)}" value="${esc(best ? (best.suggestedWeight ?? best.weight) : '')}" placeholder="kg" style="width:72px;background:#101827;color:#fff;border:1px solid #31455f;border-radius:4px;padding:4px;"></td>
    <td class="mc-rigid-review-candidates" style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${rigidCandidateButtons(issue, index) || '<span style="color:#64748b;">No suggestion</span>'}</td>
  </tr>`;
}

function rigidReviewMarkup(rows) {
  return `<div class="mc-rigid-review-dialog" role="dialog" aria-modal="true" aria-label="Rigid zero weight review" style="color:#e2e8f0;max-height:86vh;overflow:auto;background:#0f172a;border:1px solid #253a55;border-radius:8px;padding:20px;max-width:960px;width:90%;">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #253a55;padding-bottom:12px;margin-bottom:16px;">
      <div><div style="font-size:18px;font-weight:700;color:#9cc5ff;">Rigid Weights Need Review</div><div style="font-size:12px;color:#94a3b8;margin-top:4px;">${rows.length} rigid node(s) have zero weight and length greater than 6 mm.</div></div>
      <button type="button" data-rigid-review-cancel style="cursor:pointer;background:transparent;border:1px solid #475569;border-radius:6px;color:#94a3b8;padding:6px 12px;font-size:12px;">Cancel</button>
    </div>
    <div style="background:#2a210b;border:1px solid #7c5a18;color:#ffe7a3;padding:10px;border-radius:6px;font-size:12px;margin-bottom:16px;">Enter missing weights before conversion. Suggestions use the resolved Rating from explicit overrides, Piping Class master, or Regex extraction. DTXR Rating is comparison evidence only unless explicitly fetched in Preview.</div>
    <div style="overflow:auto;max-height:45vh;border:1px solid rgba(148,163,184,0.15);border-radius:6px;"><table style="border-collapse:collapse;font-size:12px;width:100%;text-align:left;"><thead><tr style="background:rgba(30,41,59,0.3);color:#fff;border-bottom:1px solid rgba(148,163,184,0.15);"><th style="padding:8px;">Branch</th><th style="padding:8px;">Bore</th><th style="padding:8px;">Rating</th><th style="padding:8px;">Node</th><th style="padding:8px;">DTXR</th><th style="padding:8px;">Length</th><th style="padding:8px;">Manual Weight</th><th style="padding:8px;">Nearest Suggestions</th></tr></thead><tbody>${rows.map(rigidReviewRow).join('')}</tbody></table></div>
    <div data-rigid-review-status style="font-size:12px;margin-top:8px;"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;border-top:1px solid #253a55;padding-top:16px;">
      <button type="button" data-rigid-review-refresh style="cursor:pointer;background:#1e293b;border:1px solid #334155;color:#cbd5e1;border-radius:6px;padding:8px 16px;font-size:12px;">Refresh Suggestions</button>
      <div style="display:flex;gap:12px;">
        <button type="button" data-rigid-review-fill-best style="cursor:pointer;background:#1e293b;border:1px solid #334155;color:#cbd5e1;border-radius:6px;padding:8px 16px;font-size:12px;">Use All Suggestions</button>
        <button type="button" data-rigid-review-skip style="cursor:pointer;background:#1e293b;border:1px solid #334155;color:#cbd5e1;border-radius:6px;padding:8px 16px;font-size:12px;">Skip Review</button>
        <button type="button" data-rigid-review-apply style="cursor:pointer;background:#1e4ed8;border:none;color:#fff;border-radius:6px;padding:8px 16px;font-size:12px;font-weight:700;">Apply Weights and Continue</button>
      </div>
    </div>
  </div>`;
}

function openStandaloneRigidWeightReviewPopup(issues, stateRef, config) {
  const rows = Array.isArray(issues) ? issues : [];
  if (!rows.length) return Promise.resolve({ cancelled: false, skipped: false, weightsByKey: {} });
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'model-converters-workflow-popup-overlay mc-rigid-review-overlay';
    overlay.innerHTML = rigidReviewMarkup(rows);
    document.body.appendChild(overlay);
    bindRigidReviewPopup(overlay, rows, resolve, stateRef, config);
  });
}

function bindRigidReviewPopup(overlay, rows, resolve, stateRef, config) {
  const finish = (result) => { overlay.remove(); resolve(result); };
  const statusValue = overlay.querySelector('[data-rigid-review-status]');
  const setStatus = (message, bad) => {
    if (!statusValue) return;
    statusValue.textContent = message;
    statusValue.style.color = bad ? '#ef4444' : '#10b981';
  };
  const bindCandidates = () => {
    overlay.querySelectorAll('[data-rigid-review-candidate]').forEach((button) => button.addEventListener('click', () => {
      const input = overlay.querySelectorAll('.mc-rigid-review-input')[Number(button.getAttribute('data-rigid-review-candidate'))];
      if (input) input.value = button.getAttribute('data-rigid-review-weight') || '';
    }));
  };
  bindCandidates();

  overlay.querySelector('[data-rigid-review-refresh]')?.addEventListener('click', async () => {
    setStatus('Refreshing suggestions...', false);
    const refreshButton = overlay.querySelector('[data-rigid-review-refresh]');
    if (refreshButton) refreshButton.disabled = true;
    const newRatings = {};
    overlay.querySelectorAll('.mc-rigid-review-rating-input').forEach((input) => {
      const value = input.value.trim();
      const key = input.getAttribute('data-rigid-review-key') || '';
      if (value && key) newRatings[key] = value;
    });
    if (Object.keys(newRatings).length > 0) {
      config.overrides = { ...(config.overrides || {}) };
      config.overrides.rating = { ...(config.overrides.rating || {}), ...newRatings };
      if (stateRef?.current) {
        stateRef.current.supportConfigJson = JSON.stringify(config, null, 2);
        if (stateRef.current.masterContext) {
          stateRef.current.masterContext.config = config;
          saveMasterContextToLocalStorage(stateRef.current.masterContext);
        }
      }
    }
    const currentWeights = {};
    overlay.querySelectorAll('.mc-rigid-review-input').forEach((input) => {
      const numeric = Number(input.value);
      if (Number.isFinite(numeric) && numeric > 0) currentWeights[input.getAttribute('data-rigid-review-key') || ''] = numeric;
    });
    if (stateRef?.current) {
      const newIssues = await unresolvedRigidIssues(stateRef.current, config);
      const tbody = overlay.querySelector('tbody');
      if (tbody) {
        tbody.innerHTML = newIssues.map(rigidReviewRow).join('');
        overlay.querySelectorAll('.mc-rigid-review-input').forEach((input) => {
          const key = input.getAttribute('data-rigid-review-key') || '';
          if (currentWeights[key]) input.value = currentWeights[key];
        });
        bindCandidates();
      }
      rows.length = 0;
      rows.push(...newIssues);
    }
    setStatus('Suggestions refreshed based on updated ratings; rows remain visible until a weight is applied or review is skipped.', false);
    if (refreshButton) refreshButton.disabled = false;
  });

  overlay.querySelector('[data-rigid-review-fill-best]')?.addEventListener('click', () => {
    rows.forEach((issue, index) => {
      const input = overlay.querySelectorAll('.mc-rigid-review-input')[index];
      const best = issue.candidates?.[0] || null;
      if (input && best) input.value = String(best.suggestedWeight ?? best.weight ?? '');
    });
    setStatus('Filled available best suggestions. Review values before applying.', false);
  });
  overlay.querySelector('[data-rigid-review-cancel]')?.addEventListener('click', () => finish({ cancelled: true, skipped: false, weightsByKey: {} }));
  overlay.querySelector('[data-rigid-review-skip]')?.addEventListener('click', () => finish({ cancelled: false, skipped: true, weightsByKey: {} }));
  overlay.querySelector('[data-rigid-review-apply]')?.addEventListener('click', () => applyRigidReviewWeights(overlay, finish, setStatus));
}

function applyRigidReviewWeights(overlay, finish, setStatus) {
  const weightsByKey = {};
  const missing = [];
  overlay.querySelectorAll('.mc-rigid-review-input').forEach((input) => {
    const numeric = Number(input.value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      missing.push(input.getAttribute('data-rigid-review-key') || '');
      input.style.borderColor = '#ef4444';
      return;
    }
    input.style.borderColor = '';
    weightsByKey[input.getAttribute('data-rigid-review-key') || ''] = numeric;
  });
  if (missing.length) {
    setStatus('Enter a positive weight for every listed rigid component, or click Skip Review.', true);
    return;
  }
  finish({ cancelled: false, skipped: false, weightsByKey });
}

async function unresolvedRigidIssues(state, config) {
  const { collectXmlCiiZeroRigidWeightIssues } = await import('../../../converters/xml-cii2019-core/weight-match-model.js');
  const { applyXmlCiiFlangeWeightFallbackToIssue } = await import('../../../converters/xml-cii2019-core/flange-weight-fallback.js');
  const { rankXmlCiiWeightCandidates } = await import('../../../converters/xml-cii2019-core/weight-valve-hints.js');
  return collectXmlCiiZeroRigidWeightIssues(state.sourceText || '', state.stagedJsonText || '', config).map((issue) => {
    const ratingAuthority = resolveStandaloneWeightReviewRating(issue, config);
    const rating = ratingAuthority.rating;
    const ranking = rating
      ? rankXmlCiiWeightCandidates({ boreMm: issue.boreMm, rating, lengthMm: issue.lengthMm, nodeName: issue.nodeName, componentType: issue.componentType, componentRefNo: issue.componentRefNo, dtxr: issue.dtxr }, config, { includeRejected: true })
      : { candidates: [], rejectedCandidates: [] };
    return applyXmlCiiFlangeWeightFallbackToIssue({
      ...issue,
      rating,
      dtxrRating: ratingAuthority.dtxrRating,
      ratingAuthority,
      ratingConflict: ratingAuthority.conflict,
      branchRating: issue.rating,
      candidates: ranking.candidates.slice(0, 5),
      rejectedCandidates: ranking.rejectedCandidates.slice(0, 3),
    }, config);
  }).filter((issue) => !issue.mapped);
}

async function reviewRigidWeights(stateRef, config) {
  try {
    const result = await openStandaloneRigidWeightReviewPopup(await unresolvedRigidIssues(stateRef.current, config), stateRef, config);
    if (result.cancelled) return false;
    if (result.weightsByKey && Object.keys(result.weightsByKey).length > 0) {
      config.overrides = { ...(config.overrides || {}), rigidWeight: { ...(config.overrides?.rigidWeight || {}), ...result.weightsByKey } };
      stateRef.current.supportConfigJson = JSON.stringify(config, null, 2);
      if (stateRef.current.masterContext) {
        stateRef.current.masterContext.config = config;
        saveMasterContextToLocalStorage(stateRef.current.masterContext);
      }
    }
    return true;
  } catch (error) {
    console.warn('Standalone rigid weight review failed to execute:', error);
    return true;
  }
}

export async function runWorkflowFromUi(stateRef, render) {
  if (stateRef.current.running || !validateSupportConfigJson(stateRef.current.supportConfigJson).ok) return;
  const readiness = buildStandaloneOutputRunReadiness(stateRef.current);
  if (readiness.summary.blockingCount > 0) {
    stateRef.current = applyStandaloneOutputRunReadiness(stateRef.current, readiness);
    render();
    return;
  }
  if (!await reviewRigidWeights(stateRef, xmlCiiEnrichedConfigFromState(stateRef.current))) return;
  stateRef.current = updateWorkflowState(stateRef.current, { running: true, result: null });
  render();
  try {
    const result = await runXmlCii2019Workflow(await buildXmlCiiWorkflowJobFromUiState(stateRef.current));
    stateRef.current = updateWorkflowState(stateRef.current, { result });
  } finally {
    stateRef.current = applyStandaloneOutputRunReadiness(
      updateWorkflowState(stateRef.current, { running: false }),
      buildStandaloneOutputRunReadiness(stateRef.current),
    );
    render();
  }
}
