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

// Host identity and connectivity prevent a result from publishing after
// navigation or after a newer Build/Rebuild has started.
function isCurrentPreviewBuild(rootEl, host, generation) {
  return rootEl?.querySelector?.('#mc-preview-table-host') === host
    && host?.__xmlCiiPreviewGeneration === generation
    && host.isConnected !== false
    && rootEl.isConnected !== false;
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
  button.addEventListener('click', () => {
    const perf = typeof performance !== 'undefined' ? performance : null;
    perf?.mark?.('xml-cii:popup:fetch-rating:start');
    // This mark is the browser-visible contract: click to a DOM notice, not
    // click to the end of an asynchronous save/rebuild promise chain.
    const notice = (message, bad = false) => {
      addNotice(host, message, bad);
      perf?.mark?.('xml-cii:popup:fetch-rating:notice');
      perf?.measure?.('xml-cii:popup:fetch-click-to-notice',
        'xml-cii:popup:fetch-rating:start', 'xml-cii:popup:fetch-rating:notice');
    };
    button.disabled = true;
    try {
      perf?.mark?.('xml-cii:popup:fetch-apply:start');
      const previouslyFetched = new Set(Object.keys(config?.overrides?.__dtxrRatingKeys || {}));
      const result = applyPreviewDtxrRatingOverrides(config, branchRows);
      perf?.mark?.('xml-cii:popup:fetch-apply:end');
      perf?.measure?.('xml-cii:popup:fetch-apply',
        'xml-cii:popup:fetch-apply:start', 'xml-cii:popup:fetch-apply:end');

      if (!result.applied && !result.cleared) {
        notice(ratingFetchMessage(result), true);
        return;
      }

      // Fetch changes only Rating overrides. Update the live Preview rows and
      // their corresponding visible cells instead of parsing XML, resolving
      // every master and rebuilding the whole editable table a second time.
      const fetched = new Map(result.targets.map(({ key, rating }) => [key, rating]));
      for (let i = 0; i < branchRows.length; i += 1) {
        const row = branchRows[i];
        const key = text(row?.branchName).trim() || text(row?.lineKey).trim();
        if (!fetched.has(key) && !previouslyFetched.has(key)) continue;
        if (!fetched.has(key) && config?.overrides?.__previewFillDown?.rating?.[key]?.fillState === 'manual') continue;
        const rating = fetched.get(key) ?? text(row?.ratingDerived);
        row.rating = rating;
        row.ratingSource = fetched.has(key) ? 'dtxr-rating-fetched' : 'derived';
        const cell = host.querySelector?.(`[data-mc-edit-type="rating"][data-mc-edit-row="${i}"]`);
        const displayed = cell?.querySelector?.('.mc-preview-editable-val');
        if (displayed) displayed.textContent = rating || '—';
        if (cell) cell.dataset.mcCurrentVal = rating;
      }

      // Retire an unfinished asynchronous digest for the preceding build,
      // but keep the now-consistent displayed Preview in the completed state.
      host.__xmlCiiPreviewGeneration = (host.__xmlCiiPreviewGeneration || 0) + 1;
      discardPreviewCacheV7();
      publishXmlCiiPreviewRatingSnapshot(branchRows, {
        authorityDigest: 'explicit-fetch-rating-live',
      });
      host.dataset.mcPreviewBuildCompleted = 'true';
      addCacheEvidence(host, { status: 'UNCACHED', reason: 'Rating overrides changed; Rebuild recomputes other suggestions' });
      notice(ratingFetchMessage(result), result.applied === 0);

      // Persistence is deliberately OUTSIDE the user-visible click handler.
      // A single scheduled save retains the R12 compact-config/storage policy.
      // A failure is visible and never reported as a successful persistence.
      if (!host.__xmlCiiFetchSaveScheduled) {
        host.__xmlCiiFetchSaveScheduled = true;
        setTimeout(async () => {
          host.__xmlCiiFetchSaveScheduled = false;
          perf?.mark?.('xml-cii:popup:fetch-save:start');
          try {
            await options?.onSaveConfig?.(config);
          } catch (error) {
            if (rootEl?.querySelector?.('#mc-preview-table-host') === host && host.isConnected !== false)
              addNotice(host, `DTXR ratings applied but could not be saved: ${text(error?.message || error)}`, true);
          } finally {
            perf?.mark?.('xml-cii:popup:fetch-save:end');
            perf?.measure?.('xml-cii:popup:fetch-save',
              'xml-cii:popup:fetch-save:start', 'xml-cii:popup:fetch-save:end');
          }
        }, 0);
      }
    } catch (error) {
      notice(`DTXR Rating fetch failed: ${text(error?.message || error)}`, true);
    } finally {
      button.disabled = false;
      perf?.mark?.('xml-cii:popup:fetch-rating:end');
      perf?.measure?.('xml-cii:popup:fetch-rating',
        'xml-cii:popup:fetch-rating:start', 'xml-cii:popup:fetch-rating:end');
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
// retain these callbacks so manual and internal rebuilds reach the v7 wrapper.
export async function xmlCiiBuildAndRenderPreview(rootEl, xmlText, config, options = {}) {
  const host = rootEl?.querySelector?.('#mc-preview-table-host');
  if (!host || host.isConnected === false || rootEl.isConnected === false) return;

  // Reserve the generation before source resolution: overlapping v7 calls
  // cannot start an older calculation after a newer request has begun.
  const generation = options.__previewGeneration === undefined
    ? (host.__xmlCiiPreviewGeneration = (host.__xmlCiiPreviewGeneration || 0) + 1)
    : options.__previewGeneration;
  const isCurrent = () => isCurrentPreviewBuild(rootEl, host, generation);
  if (!isCurrent()) return;
  host.dataset.mcPreviewBuildCompleted = 'false';
  // Clear a prior visit's rating before asynchronous resolution can yield.
  discardPreviewCacheV7();

  const stagedSource = await resolveStagedSource(options, config);
  if (!isCurrent()) return;

  let committed = false;
  const delegatedOptions = {
    ...options,
    __previewGeneration: generation,
    __resolvedStagedSource: stagedSource,
    stagedJsonText: stagedSource.text,
    stagedSourceLabel: stagedSource.label,
    // Resolve afresh for manual builds; the initial idle source may have changed.
    resolveStagedJsonText: (currentConfig) => resolveStagedSource(options, currentConfig),
    onPreviewStarted: ({ generation: buildGeneration }) => {
      if (!isCurrentPreviewBuild(rootEl, host, buildGeneration)) return;
      host.dataset.mcPreviewBuildCompleted = 'false';
      // A new calculation invalidates the prior snapshot, including when it fails.
      discardPreviewCacheV7();
      options.onPreviewStarted?.({ generation: buildGeneration });
    },
    onPreviewCommitted: async (result) => {
      const buildGeneration = result?.generation;
      const isBuildCurrent = () => isCurrentPreviewBuild(rootEl, host, buildGeneration);
      if (!isBuildCurrent() || !Array.isArray(result?.branchRows)) return;

      // The engineering rows are already rendered and are the live authority.
      // The digest is evidence, not permission to show the completed Build.
      // Awaiting SubtleCrypto here used to extend Build/Fetch's completion
      // promise under resource-starved Chrome despite an idle JS main thread.
      await options.onPreviewCommitted?.(result);
      if (!isBuildCurrent()) return;
      publishXmlCiiPreviewRatingSnapshot(result.branchRows, {
        authorityDigest: 'explicit-preview-build',
      });
      installDtxrRatingAction({
        host, rootEl, xmlText, config, options, branchRows: result.branchRows,
      });
      addCacheEvidence(host, { status: 'UNCACHED', reason: 'SHA-256 evidence pending (Preview rows are not persisted)' });
      host.dataset.mcPreviewBuildCompleted = 'true';
      committed = true;

      // Fire-and-observe the diagnostic hash after Build completion. It never
      // creates a persisted Preview and an obsolete generation cannot publish.
      setTimeout(async () => {
        if (!isBuildCurrent()) return;
        const perf = typeof performance !== 'undefined' ? performance : null;
        perf?.mark?.('xml-cii:popup:build:authority:start');
        let authority = null;
        let reason = '';
        try {
          authority = await createPreviewCacheAuthority({
            xmlText, stagedJsonText: result.stagedJsonText, config,
          });
          if (!isBuildCurrent()) return;
          const captured = capturePreviewCacheV7(authority, undefined, undefined, result);
          if (!captured.stored) reason = captured.reason;
        } catch (error) {
          reason = text(error?.message || error);
        } finally {
          perf?.mark?.('xml-cii:popup:build:authority:end');
          perf?.measure?.('xml-cii:popup:build:authority',
            'xml-cii:popup:build:authority:start', 'xml-cii:popup:build:authority:end');
        }
        if (isBuildCurrent()) addCacheEvidence(host, {
          status: authority ? 'UNCACHED' : 'MISS', authority, reason,
        });
      }, 0);
    },
  };

  // The legacy renderer retains idle/manual behavior; no persisted rows restore.
  if (!isCurrent()) return;
  await buildLegacyPreview(rootEl, xmlText, config, delegatedOptions);
  if (!isCurrent() || committed) return;

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
  if (!isCurrent()) return;
  addCacheEvidence(host, { status: 'MISS', authority, reason });
}
