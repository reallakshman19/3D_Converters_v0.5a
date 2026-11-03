import { resolveStandaloneWeightReviewRating, standaloneWeightReviewRatingInfo } from './xml-cii-adapted-weight-rating-authority.js';
import { collectXmlCiiZeroRigidWeightIssues } from '../../../converters/xml-cii2019-core/weight-match-model.js';
import { applyXmlCiiFlangeWeightFallbackToIssue } from '../../../converters/xml-cii2019-core/flange-weight-fallback.js';
import { rankXmlCiiWeightCandidates } from '../../../converters/xml-cii2019-core/weight-valve-hints.js';
import { flattenModeARigidReviewEntries } from './xml-cii-adapted-rigid-review-mode-a-state.js';

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (value) => esc(value).replace(/'/g, '&#39;');
const text = (value) => value === undefined || value === null ? '' : String(value).trim();

export async function collectModeARigidWeightReviewIssues(state = {}, config = {}) {
  return collectXmlCiiZeroRigidWeightIssues(state.sourceText || '', state.stagedJsonText || '', config).map((issue) => {
    const authority = resolveStandaloneWeightReviewRating(issue, config);
    const rating = authority.rating;
    const ranking = rating
      ? rankXmlCiiWeightCandidates({
          boreMm: issue.boreMm,
          rating,
          lengthMm: issue.lengthMm,
          nodeName: issue.nodeName,
          componentType: issue.componentType,
          componentRefNo: issue.componentRefNo,
          dtxr: issue.dtxr,
        }, config, { includeRejected: true })
      : { candidates: [], rejectedCandidates: [] };
    return applyXmlCiiFlangeWeightFallbackToIssue({
      ...issue,
      rating,
      dtxrRating: authority.dtxrRating,
      ratingAuthority: authority,
      ratingConflict: authority.conflict,
      branchRating: issue.rating,
      candidates: ranking.candidates.slice(0, 5),
      rejectedCandidates: ranking.rejectedCandidates.slice(0, 3),
    }, config);
  }).filter((issue) => !issue.mapped);
}

function ratingInfo(issue) {
  const info = standaloneWeightReviewRatingInfo(issue);
  const title = info.conflict
    ? `DTXR rating ${info.dtxrRating}# differs from resolved/override rating ${info.shownRating}.`
    : (info.missingWithDtxr
      ? `DTXR contains ${info.dtxrRating}#, but normal execution does not auto-populate Rating.`
      : (info.derivedRating ? `Resolved Rating: ${info.derivedRating}` : 'Rating used for weight suggestions'));
  return { ...info, title };
}

function candidateButtons(issue, rowIndex) {
  return (issue.candidates || []).map((candidate) => {
    const weight = candidate.suggestedWeight ?? candidate.selectedWeight ?? candidate.weight;
    const rawScore = Number(candidate.totalScore ?? candidate.score ?? 0);
    const score = Math.round((rawScore <= 1 ? rawScore * 100 : rawScore));
    const method = candidate.preferred ? 'exact' : (candidate.weightMethod || (candidate.inferredWeight ? 'inferred' : 'review'));
    return `<button type="button" class="mc-rigid-review-candidate${candidate.preferred ? ' best' : ''}" data-mode-a-rigid-candidate="${rowIndex}" data-mode-a-rigid-weight="${attr(weight)}" title="${attr(`${method} · ${score}% · ${candidate.typeDesc || candidate.valveType || candidate.type || ''}`)}" style="font-size:11px;padding:3px 6px;margin:2px;cursor:pointer;">${candidate.preferred ? '★ ' : ''}${esc(weight)} kg · ${score}%</button>`;
  }).join('');
}

function rowMarkup(issue, rowIndex) {
  const best = issue.candidates?.[0] || null;
  const info = ratingInfo(issue);
  const badge = info.conflict
    ? '<span title="Rating conflict with DTXR" style="color:#fca5a5;font-weight:700;"> !</span>'
    : (info.missingWithDtxr ? '<span title="DTXR Rating available as evidence" style="color:#fbbf24;font-weight:700;"> DTXR</span>' : '');
  const search = [issue.fileName, issue.alias, issue.branchName, issue.nodeNumberDisplay, issue.nodeNumber, issue.dtxr].map((value) => text(value).toLowerCase()).join(' ');
  return `<tr data-mode-a-rigid-review-row data-source-id="${attr(issue.sourceId)}" data-search="${attr(search)}">
    <td style="padding:7px;border-bottom:1px solid rgba(148,163,184,.1);white-space:nowrap;">${esc(issue.fileName || issue.alias || issue.sourceId)}</td>
    <td title="${attr(issue.branchName)}" style="padding:7px;border-bottom:1px solid rgba(148,163,184,.1);min-width:260px;">${esc(issue.branchName)}</td>
    <td style="padding:7px;border-bottom:1px solid rgba(148,163,184,.1);">${esc(issue.boreMm == null ? '' : `${Number(issue.boreMm).toFixed(0)} mm`)}</td>
    <td style="padding:7px;border-bottom:1px solid rgba(148,163,184,.1);"><input type="text" class="mc-rigid-review-rating-input" data-review-id="${attr(issue.reviewId)}" data-source-id="${attr(issue.sourceId)}" data-issue-key="${attr(issue.key)}" value="${attr(info.shownRating)}" title="${attr(info.title)}" style="width:64px;background:#101827;color:#fff;border:1px solid ${info.conflict || info.missingWithDtxr ? '#ef4444' : '#31455f'};border-radius:4px;padding:4px;font-size:11px;">${badge}</td>
    <td style="padding:7px;border-bottom:1px solid rgba(148,163,184,.1);">${esc(issue.nodeNumberDisplay || issue.nodeNumber)}</td>
    <td title="${attr(issue.dtxrSourcePath || '')}" style="padding:7px;border-bottom:1px solid rgba(148,163,184,.1);min-width:180px;">${esc(issue.dtxr || 'Not found')}</td>
    <td style="padding:7px;border-bottom:1px solid rgba(148,163,184,.1);white-space:nowrap;">${esc(issue.lengthMm == null ? '' : `${Number(issue.lengthMm).toFixed(1)} mm`)}</td>
    <td style="padding:7px;border-bottom:1px solid rgba(148,163,184,.1);"><input type="number" min="0" step="0.001" class="mc-rigid-review-input" data-review-id="${attr(issue.reviewId)}" data-source-id="${attr(issue.sourceId)}" data-issue-key="${attr(issue.key)}" value="${attr(best ? (best.suggestedWeight ?? best.selectedWeight ?? best.weight ?? '') : '')}" placeholder="kg" style="width:78px;background:#101827;color:#fff;border:1px solid #31455f;border-radius:4px;padding:4px;"></td>
    <td style="padding:7px;border-bottom:1px solid rgba(148,163,184,.1);min-width:300px;">${candidateButtons(issue, rowIndex) || '<span style="color:#64748b;">No suggestion</span>'}</td>
  </tr>`;
}

function popupMarkup(rows, entries) {
  const sourceOptions = entries.map((entry) => `<option value="${attr(entry.sourceId)}">${esc(entry.fileName)}</option>`).join('');
  return `<div class="mc-rigid-review-dialog" role="dialog" aria-modal="true" aria-label="Consolidated rigid zero weight review" style="color:#e2e8f0;max-height:90vh;overflow:auto;background:#0f172a;border:1px solid #253a55;border-radius:8px;padding:18px;max-width:1380px;width:96%;">
    <div style="display:flex;justify-content:space-between;gap:16px;align-items:center;border-bottom:1px solid #253a55;padding-bottom:12px;margin-bottom:12px;">
      <div><div style="font-size:18px;font-weight:700;color:#9cc5ff;">Rigid Weights Need Review — Consolidated</div><div data-mode-a-rigid-summary style="font-size:12px;color:#94a3b8;margin-top:4px;">${rows.length} rigid node(s) across ${entries.length} XML file(s).</div></div>
      <button type="button" data-mode-a-rigid-cancel style="cursor:pointer;background:transparent;border:1px solid #475569;border-radius:6px;color:#94a3b8;padding:6px 12px;">Cancel Batch Run</button>
    </div>
    <div style="background:#2a210b;border:1px solid #7c5a18;color:#ffe7a3;padding:9px;border-radius:6px;font-size:12px;margin-bottom:10px;">One review gate covers all enabled XML models. Source identity is preserved; Rating and Weight changes are written only to that XML. “Use All Exact Suggestions” fills only preferred exact candidates.</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
      <input type="search" data-mode-a-rigid-search placeholder="Search source / branch / node..." style="min-width:250px;padding:6px;background:#0b1220;color:#e2e8f0;border:1px solid #475569;border-radius:5px;">
      <select data-mode-a-rigid-source style="padding:6px;background:#0b1220;color:#e2e8f0;border:1px solid #475569;border-radius:5px;"><option value="">All XML files</option>${sourceOptions}</select>
      <button type="button" data-mode-a-rigid-refresh style="cursor:pointer;background:#1e293b;border:1px solid #334155;color:#cbd5e1;border-radius:6px;padding:7px 12px;">Refresh Suggestions</button>
      <button type="button" data-mode-a-rigid-fill-exact style="cursor:pointer;background:#1e293b;border:1px solid #334155;color:#cbd5e1;border-radius:6px;padding:7px 12px;">Use All Exact Suggestions</button>
      <span data-mode-a-rigid-status style="font-size:12px;color:#94a3b8;"></span>
    </div>
    <div style="overflow:auto;max-height:55vh;border:1px solid rgba(148,163,184,.15);border-radius:6px;"><table style="border-collapse:collapse;font-size:12px;width:100%;text-align:left;"><thead><tr style="background:rgba(30,41,59,.55);color:#fff;position:sticky;top:0;z-index:1;"><th style="padding:7px;">Source XML</th><th style="padding:7px;">Branch</th><th style="padding:7px;">Bore</th><th style="padding:7px;">Rating</th><th style="padding:7px;">Node</th><th style="padding:7px;">DTXR</th><th style="padding:7px;">Length</th><th style="padding:7px;">Manual Weight</th><th style="padding:7px;">Nearest Suggestions</th></tr></thead><tbody data-mode-a-rigid-body>${rows.map(rowMarkup).join('')}</tbody></table></div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;border-top:1px solid #253a55;padding-top:14px;"><button type="button" data-mode-a-rigid-apply style="cursor:pointer;background:#1e4ed8;border:none;color:#fff;border-radius:6px;padding:9px 18px;font-weight:700;">Apply Weights and Run All Models</button></div>
  </div>`;
}

function collectCurrentValues(overlay) {
  const weights = new Map();
  const ratings = new Map();
  overlay.querySelectorAll('.mc-rigid-review-input').forEach((input) => {
    const numeric = Number(input.value);
    if (Number.isFinite(numeric) && numeric > 0) weights.set(input.dataset.reviewId || '', numeric);
  });
  overlay.querySelectorAll('.mc-rigid-review-rating-input').forEach((input) => {
    if (text(input.value)) ratings.set(input.dataset.reviewId || '', text(input.value));
  });
  return { weights, ratings };
}

function bindCandidateButtons(overlay) {
  overlay.querySelectorAll('[data-mode-a-rigid-candidate]').forEach((button) => button.addEventListener('click', () => {
    const inputs = [...overlay.querySelectorAll('.mc-rigid-review-input')];
    const input = inputs[Number(button.dataset.modeARigidCandidate)];
    if (input) input.value = button.dataset.modeARigidWeight || '';
  }));
}

export function openModeAConsolidatedRigidWeightReviewPopup(entries = []) {
  const workingEntries = entries.map((entry) => ({ ...entry, issues: [...(entry.issues || [])] }));
  let rows = flattenModeARigidReviewEntries(workingEntries);
  if (!rows.length) return Promise.resolve({ cancelled: false, updates: {} });
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'model-converters-workflow-popup-overlay mc-rigid-review-overlay';
    overlay.innerHTML = popupMarkup(rows, workingEntries);
    document.body.appendChild(overlay);
    const body = overlay.querySelector('[data-mode-a-rigid-body]');
    const status = overlay.querySelector('[data-mode-a-rigid-status]');
    const summary = overlay.querySelector('[data-mode-a-rigid-summary]');
    const search = overlay.querySelector('[data-mode-a-rigid-search]');
    const source = overlay.querySelector('[data-mode-a-rigid-source]');
    const setStatus = (message, bad = false) => { if (status) { status.textContent = message; status.style.color = bad ? '#ef4444' : '#10b981'; } };
    const filter = () => {
      const q = text(search?.value).toLowerCase();
      const sourceId = source?.value || '';
      overlay.querySelectorAll('[data-mode-a-rigid-review-row]').forEach((tr) => {
        const show = (!sourceId || tr.dataset.sourceId === sourceId) && (!q || (tr.dataset.search || '').includes(q));
        tr.style.display = show ? '' : 'none';
      });
    };
    const draw = (preserve = new Map()) => {
      rows = flattenModeARigidReviewEntries(workingEntries);
      if (body) body.innerHTML = rows.map(rowMarkup).join('');
      overlay.querySelectorAll('.mc-rigid-review-input').forEach((input) => { if (preserve.has(input.dataset.reviewId || '')) input.value = preserve.get(input.dataset.reviewId || ''); });
      if (summary) summary.textContent = `${rows.length} rigid node(s) across ${new Set(rows.map((row) => row.sourceId)).size} XML file(s).`;
      bindCandidateButtons(overlay);
      filter();
    };
    bindCandidateButtons(overlay);
    search?.addEventListener('input', filter);
    source?.addEventListener('change', filter);

    overlay.querySelector('[data-mode-a-rigid-fill-exact]')?.addEventListener('click', () => {
      let count = 0;
      rows.forEach((row, index) => {
        const best = row.candidates?.[0];
        const value = Number(best?.suggestedWeight ?? best?.selectedWeight ?? best?.weight);
        if (!best?.preferred || !Number.isFinite(value) || value <= 0) return;
        const input = overlay.querySelectorAll('.mc-rigid-review-input')[index];
        if (input) { input.value = String(value); count += 1; }
      });
      setStatus(`Filled ${count} preferred exact suggestion(s). Review remaining rows manually.`, false);
    });

    overlay.querySelector('[data-mode-a-rigid-refresh]')?.addEventListener('click', async () => {
      const button = overlay.querySelector('[data-mode-a-rigid-refresh]');
      if (button) button.disabled = true;
      setStatus('Refreshing suggestions across XML files…', false);
      const current = collectCurrentValues(overlay);
      for (const entry of workingEntries) {
        const sourceRatings = {};
        rows.filter((row) => row.sourceId === entry.sourceId).forEach((row) => {
          const value = current.ratings.get(row.reviewId);
          if (value) sourceRatings[row.key] = value;
        });
        const config = {
          ...(entry.config || {}),
          overrides: {
            ...(entry.config?.overrides || {}),
            rating: { ...(entry.config?.overrides?.rating || {}), ...sourceRatings },
          },
        };
        entry.config = config;
        entry.issues = await collectModeARigidWeightReviewIssues(entry.state, config);
      }
      draw(current.weights);
      setStatus(`Suggestions refreshed for ${workingEntries.length} XML file(s).`, false);
      if (button) button.disabled = false;
    });

    overlay.querySelector('[data-mode-a-rigid-cancel]')?.addEventListener('click', () => {
      overlay.remove();
      resolve({ cancelled: true, updates: {} });
    });

    overlay.querySelector('[data-mode-a-rigid-apply]')?.addEventListener('click', () => {
      const updates = {};
      const missing = [];
      overlay.querySelectorAll('.mc-rigid-review-input').forEach((input) => {
        const sourceId = input.dataset.sourceId || '';
        const key = input.dataset.issueKey || '';
        const numeric = Number(input.value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          missing.push(`${sourceId}:${key}`);
          input.style.borderColor = '#ef4444';
          return;
        }
        input.style.borderColor = '#31455f';
        updates[sourceId] ||= { ratingsByKey: {}, weightsByKey: {} };
        updates[sourceId].weightsByKey[key] = numeric;
      });
      overlay.querySelectorAll('.mc-rigid-review-rating-input').forEach((input) => {
        const sourceId = input.dataset.sourceId || '';
        const key = input.dataset.issueKey || '';
        if (!text(input.value)) return;
        updates[sourceId] ||= { ratingsByKey: {}, weightsByKey: {} };
        updates[sourceId].ratingsByKey[key] = text(input.value);
      });
      if (missing.length) {
        setStatus(`Enter a positive weight for all ${missing.length} remaining row(s), or cancel the batch run.`, true);
        return;
      }
      overlay.remove();
      resolve({ cancelled: false, updates });
    });
  });
}
