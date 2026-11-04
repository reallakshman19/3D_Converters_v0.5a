import {
  xmlCiiBuildAndRenderPreview as buildLegacyPreview,
  xmlCiiRenderPreviewPhase,
} from './xml-cii-adapted-preview-renderer.js';
import {
  XML_CII_PREVIEW_CACHE_SCHEMA,
  capturePreviewCacheV7,
  createPreviewCacheAuthority,
  discardPreviewCacheV7,
  shortPreviewCacheDigest,
} from './xml-cii-adapted-preview-cache-v7.js';
import { applyPreviewDtxrRatingOverrides } from './xml-cii-adapted-preview-rating-fetch.js';
import { publishXmlCiiPreviewRatingSnapshot } from '../../../converters/xml-cii2019-core/preview-rating-snapshot.js';

export { xmlCiiRenderPreviewPhase };

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function esc(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function resolveStagedSource(options, config) {
  if (typeof options?.resolveStagedJsonText === 'function') {
    const resolved = await options.resolveStagedJsonText(config);
    if (resolved && typeof resolved === 'object') {
      return {
        text: text(resolved.text ?? resolved.stagedJsonText),
        label: text(resolved.label || resolved.sourceLabel),
      };
    }
    return { text: text(resolved), label: '' };
  }
  return {
    text: text(options?.stagedJsonText),
    label: text(options?.stagedSourceLabel),
  };
}

function addNotice(host, message, bad = false) {
  if (!host) return;
  const existing = host.querySelector?.('[data-mc-dtxr-rating-notice]');
  if (existing) existing.remove();
  host.insertAdjacentHTML?.(
    'afterbegin',
    `<div data-mc-dtxr-rating-notice class="model-converters-workflow-detail-note" style="margin:0 0 8px;border-color:${bad ? '#b91c1c' : '#2f855a'};color:${bad ? '#7f1d1d' : '#14532d'};background:${bad ? '#fff7f7' : '#f0fff4'};">${esc(message)}</div>`,
  );
}

function ratingFetchMessage(result) {
  const parts = [];
  if (result.applied) parts.push(`Fetched DTXR Rating for ${result.applied} branch${result.applied === 1 ? '' : 'es'}.`);
  if (result.conflicts) parts.push(`Skipped ${result.conflicts} branch${result.conflicts === 1 ? '' : 'es'} with conflicting DTXR ratings.`);
  if (result.missing) parts.push(`${result.missing} branch${result.missing === 1 ? '' : 'es'} had no explicit DTXR Rating.`);
  if (!result.applied && result.cleared) parts.push(`Cleared ${result.cleared} previous fetched DTXR Rating override${result.cleared === 1 ? '' : 's'}.`);
  return parts.join(' ') || 'No unambiguous DTXR Rating evidence was available.';
}

function installDtxrRatingAction({ host, rootEl, xmlText, config, options, branchRows }) {
  if (!host || !Array.isArray(branchRows) || !branchRows.length) return;
  const actionBar = host.querySelector?.('[data-mc-preview-build]')?.parentElement;
  if (!actionBar || actionBar.querySelector('[data-mc-dtxr-rating-fetch]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'model-converters-download-btn';
  button.dataset.mcDtxrRatingFetch = 'true';
  button.textContent = 'Fetch Rating as per DTXR';
  button.title = 'Explicitly fetch unambiguous DTXR ratings as branch-scoped overrides. Normal execution uses Piping Class master Rating, then Regex Rating extraction.';
  button.style.cssText = 'padding:8px 14px;min-width:210px;';
  actionBar.appendChild(button);
  button.addEventListener('click', async () => {
    button.disabled = true;
    const result = applyPreviewDtxrRatingOverrides(config, branchRows);
    const changed = result.applied > 0 || result.cleared > 0;
    if (!changed) {
      addNotice(host, ratingFetchMessage(result), true);
      button.disabled = false;
      return;
    }
    try {
      await options?.onSaveConfig?.(config);
      await xmlCiiBuildAndRenderPreview(rootEl, xmlText, config, { ...options, forceBuild: true });
      const rebuiltHost = rootEl?.querySelector?.('#mc-preview-table-host');
      addNotice(rebuiltHost, ratingFetchMessage(result), result.applied === 0);
    } catch (error) {
      addNotice(host, `DTXR Rating fetch failed: ${text(error?.message || error)}`, true);
      button.disabled = false;
    }
  });
}

function addCacheEvidence(host, { status, authority, reason = '' } = {}) {
  if (!host) return;
  const existing = host.querySelector?.('[data-mc-preview-cache-evidence]');
  if (existing) existing.remove();
  host.dataset.mcPreviewCacheSchema = XML_CII_PREVIEW_CACHE_SCHEMA;
  host.dataset.mcPreviewCacheStatus = status;
  host.dataset.mcPreviewCacheDigest = authority?.digest || '';
  const digest = shortPreviewCacheDigest(authority);
  const byteDetail = authority
    ? `XML ${authority.xmlBytes} B · staged JSON ${authority.stagedJsonBytes} B · canonical authority ${authority.canonicalBytes} B`
    : 'SHA-256 authority unavailable';
  const reasonDetail = reason ? ` · ${reason}` : '';
  host.insertAdjacentHTML?.(
    'afterbegin',
    `<div data-mc-preview-cache-evidence class="model-converters-workflow-detail-note" style="margin:0 0 8px;border-color:#475569;color:#334155;background:#f8fafc;">Preview cache authority: <strong>${esc(status)}</strong> · SHA-256 ${esc(digest)} · ${esc(byteDetail)}${esc(reasonDetail)}</div>`,
  );
}

// The legacy renderer owns all Build/Rebuild buttons. Its delegated options
// retain this callback so manual and internal rebuilds reach the v7 wrapper.
export async function xmlCiiBuildAndRenderPreview(rootEl, xmlText, config, options = {}) {
  const host = rootEl?.querySelector?.('#mc-preview-table-host');
  if (!host) return;

  const stagedSource = await resolveStagedSource(options, config);
  let committed = false;
  const delegatedOptions = {
    ...options,
    stagedJsonText: stagedSource.text,
    stagedSourceLabel: stagedSource.label,
    // Resolve afresh for manual builds; the initial idle source may have changed.
    resolveStagedJsonText: (currentConfig) => resolveStagedSource(options, currentConfig),
    onPreviewCommitted: async (result) => {
      const currentHost = rootEl?.querySelector?.('#mc-preview-table-host');
      if (!currentHost || !Array.isArray(result?.branchRows)) return;
      committed = true;
      currentHost.dataset.mcPreviewBuildCompleted = 'true';

      installDtxrRatingAction({
        host: currentHost,
        rootEl,
        xmlText,
        config,
        options,
        branchRows: result.branchRows,
      });

      let authority = null;
      let captured = null;
      let reason = '';
      try {
        authority = await createPreviewCacheAuthority({
          xmlText,
          // Exact staged text used by the calculation, not a later re-read.
          stagedJsonText: result.stagedJsonText,
          config,
        });
        captured = capturePreviewCacheV7(authority, undefined, undefined, result);
        if (!captured.stored) reason = captured.reason;
      } catch (error) {
        reason = text(error?.message || error);
      }
      if (!captured) {
        // A missing SHA-256 implementation must not suppress live Weight Match data.
        publishXmlCiiPreviewRatingSnapshot(result.branchRows, {
          authorityDigest: authority?.digest || 'explicit-preview-build',
        });
      }
      addCacheEvidence(currentHost, {
        status: captured?.stored ? 'REBUILT' : 'UNCACHED',
        authority,
        reason,
      });
      await options.onPreviewCommitted?.(result);
    },
  };

  // No displayed Preview is restored from persisted rows. Only explicit builds
  // may publish new rows or a new authority-bound envelope.
  discardPreviewCacheV7();
  host.dataset.mcPreviewBuildCompleted = 'false';
  await buildLegacyPreview(rootEl, xmlText, config, delegatedOptions);
  if (committed) return;

  let authority = null;
  let reason = 'explicit Build/Rebuild required';
  try {
    authority = await createPreviewCacheAuthority({
      xmlText,
      stagedJsonText: stagedSource.text,
      config,
    });
  } catch (error) {
    reason = text(error?.message || error);
  }
  addCacheEvidence(host, { status: 'MISS', authority, reason });
}
