import { collectXmlCiiWeightMatchRows } from '../../../../converters/xml-cii2019-core/weight-match-model.js?v=20260626-weight-review-2';
import { createEmpiricalWeightValidator } from '../../../../converters/empirical-weight/empirical-weight-validation.js';
import {
  qualifiedXmlCiiRigidAutoWeightCandidate,
  xmlCiiWeightSuggestionConfidence,
  XML_CII_AUTO_APPLY_MIN_CONFIDENCE_PCT,
  XML_CII_AUTO_APPLY_MAX_CONFIDENCE_PCT,
} from '../../../../converters/xml-cii2019-core/rigid-weight-auto-apply.js';
import { applyXmlCiiFlangeWeightFallbackToIssue } from '../../../../converters/xml-cii2019-core/flange-weight-fallback.js?v=20260626-special-factor-guard-1';
import { applyXmlCiiStagedGeometryAuthority } from '../../../../converters/xml-cii2019-core/staged-geometry-authority.js?v=20260625-staged-geometry-1';
import {
  readXmlCiiPreviewRatingSnapshot,
  resolveXmlCiiWeightMatchRating,
} from '../../../../converters/xml-cii2019-core/preview-rating-snapshot.js';
import {
  ensureValveHintConfig,
  formatValveHint,
  rankXmlCiiWeightCandidates,
  semanticKeywordRows,
  specialValveFactorRows,
  valveHintLengthToleranceMm,
  valveHintMappingRows,
} from '../../../../converters/xml-cii2019-core/weight-valve-hints.js?v=20260626-weight-factor-1';
import { getXmlCiiPreviewRuntimeConfig } from '../../shared/preview-filldown.js?v=20260620-rating-runtime-1';

function t(value) { return value === null || value === undefined ? '' : String(value); }
function clean(value) { return t(value).replace(/\s+/g, ' ').trim(); }
function esc(value) { return t(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function attr(value) { return esc(value).replaceAll("'", '&#39;'); }
function nfmt(value, digits = 1) { const numeric = Number(value); return Number.isFinite(numeric) ? numeric.toFixed(digits) : ''; }
function selectedWeight(candidate) { return candidate?.selectedWeight ?? candidate?.suggestedWeight ?? candidate?.weight ?? ''; }
function convOn(config) { return config?.weight?.convertSmallLengthsInToMm === true; }
function allowedType(value) { const type = clean(value).toUpperCase(); return type === 'RIGID' || type.startsWith('FLAN') || type.startsWith('INST') || ['VALV', 'VALVE', 'VLV'].includes(type); }
function unsafeDtxr(row) { const source = clean(row?.dtxrSource).toLowerCase(); const dtxr = clean(row?.dtxr).toUpperCase(); return /owner|support|ps-tag/.test(source) && /(PIPE REST|SUPPORT|GUIDE|STOP|SHOE|WEAR PLATE|TEE|ELBOW|BEND|REDUCER)/.test(dtxr); }
function cleanRow(row) { if (!allowedType(row?.componentType)) return null; return unsafeDtxr(row) ? { ...row, dtxr: '', dtxrSource: 'weight-dtxr-suppressed' } : row; }
async function stagedText(stagedJsonText) { const direct = clean(stagedJsonText); if (direct) return direct; const file = document?.querySelector?.('#model-converters-secondary-input')?.files?.[0]; return file ? await file.text().catch(() => '') : ''; }
function currentXmlFile(passedFile) { return passedFile || document?.querySelector?.('#model-converters-primary-input')?.files?.[0] || null; }
function normalizeComponentRefNo(value) { return clean(value).replace(/^=/, ''); }
function componentRefEndpoint(componentRefNo, endpoint) { const ref = normalizeComponentRefNo(componentRefNo); const ep = clean(endpoint); return ref && ep ? `${ref}_${ep}` : ref; }
function truthy(value) { if (value === true) return true; if (value === false || value == null) return false; return /^(1|true|yes|on)$/i.test(clean(value)); }
function desc(candidate) { return clean(candidate?.typeDesc || candidate?.valveType || candidate?.type || 'Unknown') || 'Unknown'; }
function plainObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

function parseConfigText(value) {
  try {
    const parsed = JSON.parse(clean(value) || '{}');
    return plainObject(parsed) ? parsed : {};
  } catch { return {}; }
}

function currentDomSupportConfig() {
  const input = document?.querySelector?.('[data-option-key="supportConfigJson"]');
  return input && 'value' in input ? parseConfigText(input.value) : {};
}

let defaultWeightMasterRowsPromise = null;
let defaultWeightMasterRowsError = '';
let defaultWeightMasterRowsSource = '';
function hasWeightMasterRows(config) { return Array.isArray(config?.weight?.masterRows) && config.weight.masterRows.length > 0; }

function defaultWeightMasterCandidateUrls() {
  const urls = [];
  try { urls.push(new URL('../../../../docs/Masters/wtValveweights.json', import.meta.url).href); } catch {}
  try {
    const origin = window?.location?.origin || '';
    const path = window?.location?.pathname || '';
    const prefix = path.includes('/3D_Viewer/') ? '/3D_Viewer' : '';
    if (origin) urls.push(`${origin}${prefix}/docs/Masters/wtValveweights.json`);
    if (origin) urls.push(`${origin}/docs/Masters/wtValveweights.json`);
  } catch {}
  try { urls.push(new URL('../docs/Masters/wtValveweights.json', document.baseURI).href); } catch {}
  try { urls.push(new URL('docs/Masters/wtValveweights.json', document.baseURI).href); } catch {}
  return [...new Set(urls.filter(Boolean))];
}

async function loadDefaultWeightMasterRows() {
  if (defaultWeightMasterRowsPromise) return defaultWeightMasterRowsPromise;
  defaultWeightMasterRowsPromise = (async () => {
    if (typeof fetch !== 'function') {
      defaultWeightMasterRowsError = 'fetch() is not available in this browser context';
      return [];
    }
    const errors = [];
    for (const url of defaultWeightMasterCandidateUrls()) {
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (!response.ok) { errors.push(`${url} -> HTTP ${response.status}`); continue; }
        const rows = await response.json();
        if (Array.isArray(rows) && rows.length) {
          defaultWeightMasterRowsSource = url;
          defaultWeightMasterRowsError = '';
          return rows;
        }
        errors.push(`${url} -> JSON did not contain rows`);
      } catch (error) { errors.push(`${url} -> ${error?.message || error}`); }
    }
    defaultWeightMasterRowsError = errors.join(' | ') || 'No default weight master URL candidates were generated';
    console.warn('XML->CII 4A: default weight master hydration failed', defaultWeightMasterRowsError);
    return [];
  })();
  return defaultWeightMasterRowsPromise;
}

async function ensureWeightMasterRows(config) {
  const out = plainObject(config) ? config : {};
  if (hasWeightMasterRows(out)) return out;
  const rows = await loadDefaultWeightMasterRows();
  if (!rows.length) return out;
  out.weight = plainObject(out.weight) ? { ...out.weight } : {};
  out.weight.masterRows = rows;
  return out;
}

function mergeSection(out, live, sectionName, rowsKey) {
  const liveSection = plainObject(live?.[sectionName]) ? live[sectionName] : null;
  if (!liveSection) return;
  const outSection = plainObject(out?.[sectionName]) ? out[sectionName] : {};
  out[sectionName] = { ...liveSection, ...outSection };
  const liveRows = Array.isArray(liveSection[rowsKey]) ? liveSection[rowsKey] : [];
  const outRows = Array.isArray(outSection[rowsKey]) ? outSection[rowsKey] : [];
  if (liveRows.length && !outRows.length) out[sectionName][rowsKey] = liveRows;
  if (plainObject(liveSection.fieldMap) && !plainObject(outSection.fieldMap)) out[sectionName].fieldMap = liveSection.fieldMap;
}

function mergeRuntimeOverrides(baseConfig, liveConfig) {
  const out = { ...(baseConfig || {}) };
  const live = plainObject(liveConfig) ? liveConfig : {};
  mergeSection(out, live, 'linelist', 'masterRows');
  mergeSection(out, live, 'pipingClass', 'masterRows');
  mergeSection(out, live, 'material', 'mapRows');
  mergeSection(out, live, 'weight', 'masterRows');
  if (plainObject(live.overrides)) {
    out.overrides = plainObject(out.overrides) ? { ...out.overrides } : {};
    for (const [bucketName, bucketValue] of Object.entries(live.overrides)) {
      if (plainObject(bucketValue)) out.overrides[bucketName] = { ...(out.overrides[bucketName] || {}), ...bucketValue };
      else if (clean(bucketValue)) out.overrides[bucketName] = bucketValue;
    }
  }
  return out;
}

function renderWeightMasterBlocked(contentEl) {
  const attempted = defaultWeightMasterRowsSource
    ? `Default master source: ${defaultWeightMasterRowsSource}`
    : `Default master hydration failed: ${defaultWeightMasterRowsError || 'No weight.masterRows and no default rows loaded.'}`;
  contentEl.innerHTML = `<div class="model-converters-workflow-detail-note" style="padding:10px;border:1px solid #7c5a18;border-radius:8px;background:#2a210b;color:#ffe7a3;">Weight master is not ready, so 4A is blocked to prevent false <strong>0 / No match</strong> rows.<br><small style="display:block;margin-top:6px;color:#ffd98a;word-break:break-word;">${esc(attempted)}</small></div>`;
}

function normalizeRatingText(value) {
  const source = clean(value).toUpperCase();
  const match = source.match(/\b(?:CL|CLASS|PN)?\s*(1500|2500|150|300|600|900|16|40)\b/);
  return match ? match[1] : source.replace(/[^0-9]/g, '');
}

export function xmlCiiWeightMatchRatingFromPreview(row, snapshot = readXmlCiiPreviewRatingSnapshot()) {
  return resolveXmlCiiWeightMatchRating(row, { mode: 'preview', snapshot }).rating;
}

function ratingDisplayInfo(issue) {
  const shownRating = clean(issue?.rating);
  const dtxrRating = clean(issue?.dtxrRating);
  const conflict = Boolean(shownRating && dtxrRating && normalizeRatingText(shownRating) !== normalizeRatingText(dtxrRating));
  const missingWithDtxr = Boolean(!shownRating && dtxrRating);
  const isDtxrMode = issue?.ratingMode === 'dtxr';
  const title = isDtxrMode
    ? (shownRating ? `Weight Match explicitly uses DTXR Rating ${shownRating}#.` : 'DTXR mode is active, but this row has no DTXR Rating.')
    : (conflict
      ? `Preview Rating ${shownRating} differs from DTXR Rating ${dtxrRating}#. Weight Match uses the Preview value.`
      : (missingWithDtxr
        ? `Preview has no Rating. DTXR ${dtxrRating}# is not used unless “Use Rating as per DTXR” is selected.`
        : `Weight Match Rating copied from Preview (${issue?.ratingSource || 'preview'}).`));
  const style = isDtxrMode
    ? 'background:#062d22;color:#bbf7d0;border:1px solid #10b981;font-weight:700;'
    : (conflict || missingWithDtxr ? 'background:#3a1010;color:#ffd6d6;border:1px solid #ef4444;font-weight:700;' : '');
  return { shownRating, dtxrRating, conflict, missingWithDtxr, title, style };
}

function emptyRanking() { return { nodeHint: null, semanticSource: null, candidates: [], rejectedCandidates: [] }; }

function rerankWithRating(row, config, { ratingMode = 'preview', snapshot = readXmlCiiPreviewRatingSnapshot() } = {}) {
  const authority = resolveXmlCiiWeightMatchRating(row, { mode: ratingMode, snapshot });
  const rating = authority.rating;
  const ranking = rating
    ? rankXmlCiiWeightCandidates({ boreMm: row.boreMm, rating, lengthMm: row.lengthMm, nodeName: row.nodeName, componentType: row.componentType, componentRefNo: row.componentRefNo, dtxr: row.dtxr }, config, { includeRejected: true })
    : emptyRanking();
  const derivedValveHint = formatValveHint(ranking.nodeHint) || (() => {
    const best = ranking.candidates?.[0];
    if (best?.specialFactorRule && best?.specialFactorCode) return (best.typeDesc || '').split(':')[0].trim() || best.specialFactorCode;
    const semantic = ranking.semanticSource;
    return semantic?.matches?.[0] ? `${semantic.matches[0].label} (keyword)` : '';
  })();
  return {
    ...row,
    rating,
    ratingSource: authority.source,
    ratingMode: authority.mode,
    previewRatingSnapshotRevision: authority.snapshotRevision,
    dtxrRating: authority.dtxrRating,
    valveHint: derivedValveHint,
    nodeHint: ranking.nodeHint,
    candidates: ranking.candidates.slice(0, 5),
    rejectedCandidates: ranking.rejectedCandidates.slice(0, 3),
    ranking,
  };
}

function xmlLocalName(node) { return clean(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
function xmlChildText(node, name) { const child = [...(node?.childNodes || [])].find((item) => item.nodeType === 1 && xmlLocalName(item) === name); return clean(child?.textContent); }
function regexXmlValue(block, name) { return clean(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]?.replace(/<[^>]+>/g, '')); }

function nodeMetaFromXml(xmlText) {
  const out = new Map();
  const source = t(xmlText);
  if (!source) return out;
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(source, 'application/xml');
      if (!doc.getElementsByTagName('parsererror').length) {
        for (const branch of [...doc.getElementsByTagName('Branch')]) {
          const branchName = xmlChildText(branch, 'Branchname');
          for (const node of [...branch.getElementsByTagName('Node')]) {
            const nodeNumber = xmlChildText(node, 'NodeNumber');
            if (!nodeNumber) continue;
            const componentRefNo = xmlChildText(node, 'ComponentRefNo');
            const endpoint = xmlChildText(node, 'Endpoint');
            const meta = { branchName, nodeNumber, componentRefNo, endpoint, componentType: xmlChildText(node, 'ComponentType'), componentRefEndpoint: componentRefEndpoint(componentRefNo, endpoint) };
            out.set(`${branchName}::${nodeNumber}`, meta);
          }
        }
        return out;
      }
    } catch {}
  }
  for (const branchMatch of source.matchAll(/<Branch\b[\s\S]*?<\/Branch>/gi)) {
    const branchBlock = branchMatch[0];
    const branchName = regexXmlValue(branchBlock, 'Branchname');
    for (const nodeMatch of branchBlock.matchAll(/<Node\b[\s\S]*?<\/Node>/gi)) {
      const nodeBlock = nodeMatch[0];
      const nodeNumber = regexXmlValue(nodeBlock, 'NodeNumber');
      if (!nodeNumber) continue;
      const componentRefNo = regexXmlValue(nodeBlock, 'ComponentRefNo');
      const endpoint = regexXmlValue(nodeBlock, 'Endpoint');
      const meta = { branchName, nodeNumber, componentRefNo, endpoint, componentType: regexXmlValue(nodeBlock, 'ComponentType'), componentRefEndpoint: componentRefEndpoint(componentRefNo, endpoint) };
      out.set(`${branchName}::${nodeNumber}`, meta);
    }
  }
  return out;
}

function applyNodeMeta(rows, xmlText) {
  const meta = nodeMetaFromXml(xmlText);
  return (Array.isArray(rows) ? rows : []).map((row) => {
    if (row?.componentRefNo) return { ...row, componentRefEndpoint: row?.componentRefEndpoint || componentRefEndpoint(row.componentRefNo, row?.endpoint || '') };
    const key = `${clean(row?.branchName)}::${clean(row?.nodeNumber)}`;
    const nodeMeta = meta.get(key) || {};
    const componentRefNo = nodeMeta.componentRefNo || '';
    const endpoint = row?.endpoint || nodeMeta.endpoint || '';
    return { ...row, componentRefNo, endpoint, componentType: row?.componentType || nodeMeta.componentType || '', componentRefEndpoint: row?.componentRefEndpoint || nodeMeta.componentRefEndpoint || componentRefEndpoint(componentRefNo, endpoint) };
  });
}

function hintPanel(config) { ensureValveHintConfig(config); return `<div class="model-converters-workflow-detail-note" style="margin:8px 0;white-space:pre-line;">Rows included: RIGID, FLAN*, VALV / VALVE / VLV, INST. Rows excluded: support-only, TEE, ELBO/BEND, REDUCER, OLET, PIPE, GASK. Nodes with a non-empty ConnectionType (e.g. BRAN) are excluded. Valve Hint applies to all eligible nodes (Endpoint restriction removed). Exact candidate length gate is ±${esc(valveHintLengthToleranceMm(config))} mm.</div>`; }
function patternText(patterns) { return esc((patterns || []).join('\n')); }
function targetText(targets) { return esc((targets || []).map((target) => `${target.code || ''}|${target.label || ''}|${target.factor || 1}`).join('\n')); }
function semanticRuleRowsHtml(config) { return semanticKeywordRows(config).map((rule) => `<tr data-wm-semantic-row><td><input type="checkbox" data-wm-rule-on ${rule.on ? 'checked' : ''}></td><td><input type="number" data-wm-rule-priority value="${attr(rule.priority)}" style="width:72px;"></td><td><input type="text" data-wm-rule-code value="${attr(rule.code)}" style="width:130px;"></td><td><input type="text" data-wm-rule-label value="${attr(rule.label)}" style="width:150px;"></td><td><textarea data-wm-rule-patterns spellcheck="false" style="min-width:320px;min-height:64px;">${patternText(rule.patterns)}</textarea></td></tr>`).join(''); }
function factorRuleRowsHtml(config) { return specialValveFactorRows(config).map((rule) => `<tr data-wm-factor-row><td><input type="checkbox" data-wm-rule-on ${rule.on ? 'checked' : ''}></td><td><input type="number" data-wm-rule-priority value="${attr(rule.priority)}" style="width:72px;"></td><td><input type="text" data-wm-rule-code value="${attr(rule.code)}" style="width:150px;"></td><td><input type="text" data-wm-rule-label value="${attr(rule.label)}" style="width:170px;"></td><td><textarea data-wm-rule-patterns spellcheck="false" style="min-width:280px;min-height:64px;">${patternText(rule.patterns)}</textarea></td><td><textarea data-wm-rule-targets spellcheck="false" style="min-width:260px;min-height:64px;" title="One target per line: CODE|Label|Factor">${targetText(rule.targets)}</textarea></td></tr>`).join(''); }
function editableRuleTable(title, headers, rowsHtml, helpText) { return `<section style="border:1px solid #253a55;border-radius:6px;overflow:hidden;background:#101a29;"><div style="padding:7px 9px;color:#9cc5ff;font-weight:700;font-size:12px;border-bottom:1px solid #253a55;">${esc(title)}</div><div style="overflow:auto;max-height:280px;"><table class="mc-rigid-review-table" style="border-collapse:collapse;font-size:12px;min-width:100%;"><thead><tr>${headers.map((header) => `<th style="white-space:nowrap;">${esc(header)}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div><div class="model-converters-workflow-detail-text" style="padding:6px 8px;">${esc(helpText)}</div></section>`; }
function enhancedHintPanel(config) { ensureValveHintConfig(config); return `${hintPanel(config)}<details class="model-converters-workflow-master-card" style="margin:8px 0;"><summary style="cursor:pointer;color:#d7e6ff;font-weight:700;">Editable weight keyword / factor rules</summary><div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;align-items:stretch;"><label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#9cc5ff;">Length gate (mm)<input type="number" min="0" step="0.1" data-wm-weight-tolerance value="${attr(valveHintLengthToleranceMm(config))}" style="max-width:180px;background:#0b1320;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:6px;"></label>${editableRuleTable('DTXR semantic keyword rules', ['On', 'Priority', 'Code', 'Label', 'Regex patterns'], semanticRuleRowsHtml(config), 'Use one regex per line. Higher priority rules use lower priority numbers.')}${editableRuleTable('Non-standard valve factor rules', ['On', 'Priority', 'Code', 'Label', 'Regex patterns', 'Targets'], factorRuleRowsHtml(config), 'Targets use CODE|Label|Factor, one per line. Candidate weight uses the maximum factored interpolated/extrapolated subset weight.')}</div><div class="model-converters-workflow-detail-text" style="margin-top:8px;">Factor targets use semantic codes such as CONTROL and BALL. Candidate weight uses the maximum factored interpolated/extrapolated subset weight and flags odd extrapolation ratios.</div></details>`; }
function methodLabel(candidate) { if (candidate?.flangeWeightFallback) return 'Flange extrapolated'; if (candidate?.specialFactorRule) return candidate?.oddEntry ? 'Factor odd' : 'Factor'; if (candidate?.weightMethod === 'length-interpolated') return 'Interpolated'; if (candidate?.weightMethod === 'length-extrapolated' && candidate?.inferredWeight) return 'Extrapolated'; if (candidate?.zeroFallback) return 'No match'; return candidate?.preferred ? 'Suggested' : ''; }
function renderAcceptedChip(candidate, rowIndex, issue) {
  const value = selectedWeight(candidate);
  const confidence = xmlCiiWeightSuggestionConfidence(candidate);
  const confidenceText = confidence === null ? 'unscored' : `${Math.round(confidence * 100)}% match`;
  const title = [`Rating: ${issue.rating || '-'}`, `TypeDesc: ${desc(candidate)}`, `Selected weight: ${value} kg`,
    `Confidence: ${confidenceText}`, `Length delta: ${nfmt(candidate.lengthDelta)} mm`, candidate?.weightWarning || '']
    .filter(Boolean).join(' | ');
  const marker = candidate?.inferredWeight ? '≈ ' : (candidate.preferred ? '★ ' : '');
  const method = methodLabel(candidate);
  const suffix = method ? ` · ${method}` : ` · Δ${nfmt(candidate.lengthDelta)}`;
  return `<button type="button" class="mc-rigid-review-candidate${candidate.preferred ? ' best' : ''}"
    data-wm-candidate="${rowIndex}" data-wm-weight="${attr(value)}" title="${attr(title)}"
    style="font-size:11px;line-height:1.1;padding:3px 6px;border-radius:999px;white-space:nowrap;max-width:330px;overflow:hidden;text-overflow:ellipsis;">${marker}${esc(value)}kg · ${esc(confidenceText)}${esc(suffix)}</button>`;
}
function renderRejectedChip(candidate) { return `<span class="mc-rigid-review-candidate mc-wm-chip-rejected" title="${attr(candidate.rejectedReason || '')}" style="font-size:11px;line-height:1.1;padding:3px 6px;border-radius:999px;white-space:nowrap;max-width:330px;overflow:hidden;text-overflow:ellipsis;opacity:.72;border-style:dashed!important;">× ${esc(desc(candidate))} · Δ${esc(nfmt(candidate.lengthDelta))}mm</span>`; }
function enrichedOptionsForWeightMatch(config) { const split = truthy(config?.splitCondensedValveFlange) || truthy(config?.split_condensed_valve_flange); return { dryRun: true, skipAutoWeightMatch: true, supportConfigJson: JSON.stringify(config || {}), splitCondensedValveFlange: split, split_condensed_valve_flange: split, condenseRigidXsd: truthy(config?.condenseRigidXsd) || truthy(config?.condense_rigid_xsd) }; }
function widthTh(label, widthPx) { return `<th style="min-width:${widthPx}px;width:${widthPx}px;resize:horizontal;overflow:auto;white-space:nowrap;">${esc(label)}</th>`; }
function lines(value) { return t(value).split(/\r?\n/).map(clean).filter(Boolean); }
function parseTargetLines(value) { return lines(value).map((line) => { const parts = line.split(/[|\t,]/).map(clean); const code = (parts[0] || '').toUpperCase(); const factor = Number(parts[2] || parts[1]); return { code, label: parts[1] && Number.isNaN(Number(parts[1])) ? parts[1] : code, factor: Number.isFinite(factor) && factor > 0 ? factor : 1 }; }).filter((target) => target.code); }
function parseRuleRows(panelEl, selector, withTargets) { return [...(panelEl?.querySelectorAll(selector) || [])].map((row, index) => ({ on: row.querySelector('[data-wm-rule-on]')?.checked !== false, priority: Number(row.querySelector('[data-wm-rule-priority]')?.value || ((index + 1) * 10)), code: clean(row.querySelector('[data-wm-rule-code]')?.value).toUpperCase(), label: clean(row.querySelector('[data-wm-rule-label]')?.value), patterns: lines(row.querySelector('[data-wm-rule-patterns]')?.value), ...(withTargets ? { targets: parseTargetLines(row.querySelector('[data-wm-rule-targets]')?.value) } : {}) })).filter((rule) => rule.code || rule.patterns.length); }
function applyWeightRulePanelConfig(panelEl, config) { const cfg = plainObject(config) ? config : {}; cfg.weight = plainObject(cfg.weight) ? cfg.weight : {}; const tolerance = Number(panelEl?.querySelector('[data-wm-weight-tolerance]')?.value); if (Number.isFinite(tolerance) && tolerance >= 0) cfg.weight.valveHintLengthToleranceMm = tolerance; cfg.weight.semanticKeywordRules = parseRuleRows(panelEl, '[data-wm-semantic-row]', false); cfg.weight.specialValveFactorRules = parseRuleRows(panelEl, '[data-wm-factor-row]', true); ensureValveHintConfig(cfg); return cfg; }

export function xmlCiiRenderWeightMatchPhase() {
  const info = 'Default Rating authority is the exact Rating shown in Preview. Weight Match does not derive Rating again.';
  return `<div class="model-converters-workflow-detail-title">5 Weight Match <span title="${attr(info)}" style="cursor:help;color:#8bb7ff;border:1px solid #406089;border-radius:50%;padding:0 5px;font-size:11px;">i</span></div><div class="model-converters-workflow-detail-text">Weight suggestions auto-apply only at <strong>60–100% match confidence</strong> and when available A1/A2 empirical estimates are <strong>within ±50%</strong>. Lower-confidence, out-of-range, or unvalidated weights require review. Rating follows Preview unless you explicitly select DTXR.</div><div id="mc-wm-hint-panel"></div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0;"><button type="button" class="model-converters-run-btn" id="mc-wm-refresh">Build Weight Data</button><button type="button" class="model-converters-download-btn" id="mc-wm-use-dtxr-rating">Use Rating as per DTXR</button><button type="button" class="model-converters-download-btn" id="mc-wm-fill-best">Apply eligible suggestions (60–100%)</button><button type="button" class="model-converters-download-btn" id="mc-wm-length-toggle" title="Convert small master lengths (<100) from inch to mm. Default OFF.">⇄ in→mm: OFF</button><span id="mc-wm-status" class="mc-diag-run-status"></span></div><div id="mc-wm-content"><div class="model-converters-workflow-detail-note">Click <strong>Build Weight Data</strong> to compute matches using Preview Rating.</div></div>`;
}

const WM_CACHE_KEY = 'xml-cii-wm-cache-v2-preview-rating';
const PV_CACHE_KEY = 'xml-cii-pv-cache-v2';
const CACHE_MAX_BYTES = 2_500_000;
function wmCacheFingerprint(file, jsonLen, masterLen, overrides, ratingMode, snapshotRevision) { return `${file?.name || ''}:${file?.size || 0}|j${jsonLen}|m${masterLen}|o${JSON.stringify(overrides || {})}|rm${ratingMode}|pr${snapshotRevision || ''}`; }
function readCache(storageKey) { try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; } }
function writeCache(storageKey, fingerprint, data) { try { const payload = JSON.stringify({ fp: fingerprint, data, ts: Date.now() }); if (payload.length > CACHE_MAX_BYTES) return; localStorage.setItem(storageKey, payload); } catch {} }
export function invalidateXmlCiiWeightCache() { try { localStorage.removeItem(WM_CACHE_KEY); } catch {} }
export function invalidateXmlCiiPreviewCache() { try { localStorage.removeItem(PV_CACHE_KEY); } catch {} }

export function bindXmlCiiWeightMatchPhase(detailEl, { xmlFile, stagedJsonText, config, enrichXmlForCii2019, onSaveConfig, ensureOverrides, resolveStagedJsonText }) {
  if (!detailEl) return;
  const contentEl = detailEl.querySelector('#mc-wm-content');
  const statusEl = detailEl.querySelector('#mc-wm-status');
  const toggleEl = detailEl.querySelector('#mc-wm-length-toggle');
  const ratingModeButton = detailEl.querySelector('#mc-wm-use-dtxr-rating');
  const panelEl = detailEl.querySelector('#mc-wm-hint-panel');
  if (!contentEl) return;
  let localIssues = [];
  let workingMasterRows = [];
  let ratingMode = 'preview';
  const status = (message, tone) => { if (statusEl) { statusEl.textContent = message || ''; statusEl.className = `mc-diag-run-status ${tone || ''}`.trim(); } };
  const activeConfig = () => mergeRuntimeOverrides(mergeRuntimeOverrides(mergeRuntimeOverrides(config, currentDomSupportConfig()), getXmlCiiPreviewRuntimeConfig()), currentDomSupportConfig());
  const syncToggle = () => { if (!toggleEl) return; const on = convOn(activeConfig()); toggleEl.textContent = `⇄ in→mm: ${on ? 'ON' : 'OFF'}`; toggleEl.style.borderColor = on ? '#2f9e63' : ''; toggleEl.style.color = on ? '#fff' : ''; toggleEl.style.background = on ? '#14532d' : ''; };
  const syncRatingMode = () => {
    if (!ratingModeButton) return;
    const dtxr = ratingMode === 'dtxr';
    ratingModeButton.textContent = dtxr ? 'Use Rating shown in Preview' : 'Use Rating as per DTXR';
    ratingModeButton.title = dtxr ? 'Return to the exact Rating shown in Preview.' : 'Explicitly rerank each Weight Match row using its DTXR Rating.';
    ratingModeButton.style.borderColor = dtxr ? '#10b981' : '';
    ratingModeButton.style.color = dtxr ? '#bbf7d0' : '';
  };
  const drawPanel = () => { if (panelEl) panelEl.innerHTML = enhancedHintPanel(activeConfig()); };
  const saveInput = (input) => { const key = input.getAttribute('data-wm-key') || ''; const value = Number(input.value); if (!key || !Number.isFinite(value) || value <= 0) return; const cfg = activeConfig(); const overrides = ensureOverrides(cfg); overrides.rigidWeight = { ...(overrides.rigidWeight || {}), [key]: value }; onSaveConfig(cfg); };
  const drawRows = (issues) => {
    if (!issues.length) { contentEl.innerHTML = '<div class="model-converters-workflow-detail-note">No actual RIGID / FLAN* / VALVE / INST nodes with ElementLengthMm &gt; 6 mm were found.</div>'; return; }
    const rows = issues.map((issue, rowIndex) => {
      const best = issue.candidates?.[0];
      const initial = issue.weight && issue.weight > 0 ? issue.weight : (best ? selectedWeight(best) : '');
      const rowStyle = issue.mapped ? 'background:#0f2a1b;border-left:4px solid #2f9e63;' : (best?.zeroFallback ? 'background:#3a1010;border-left:4px solid #ef4444;' : (best?.inferredWeight ? 'background:#302607;border-left:4px solid #d9a441;' : 'background:#3a240f;border-left:4px solid #d08a22;'));
      const inputStyle = `width:86px;${best?.zeroFallback ? 'background:#3a1010;border:1px solid #ef4444;color:#ffd6d6;' : (best?.inferredWeight ? 'background:#352706;border:1px solid #d9a441;color:#fff1b8;' : '')}`;
      const accepted = (issue.candidates || []).map((candidate) => renderAcceptedChip(candidate, rowIndex, issue)).join('');
      const rejected = (issue.rejectedCandidates || []).map(renderRejectedChip).join('');
      const chips = accepted || rejected || '<span class="model-converters-muted">No suggestion</span>';
      const statusText = issue.mapped ? `Mapped (${issue.weightSource || 'weight'})` : (methodLabel(best) || 'Unresolved');
      const refEndpoint = issue.componentRefEndpoint || componentRefEndpoint(issue.componentRefNo, issue.endpoint);
      const nodeDisplay = issue.nodeNumberDisplay || issue.nodeNumber;
      const ratingInfo = ratingDisplayInfo(issue);
      return `<tr style="${rowStyle}"><td>${esc(statusText)}</td><td title="${attr(issue.branchName)}">${esc(issue.branchName)}</td><td>${esc(issue.lineKey || '')}</td><td>${esc(issue.componentType || '')}</td><td>${esc(issue.boreMm == null ? '' : `${Number(issue.boreMm).toFixed(0)} mm`)}</td><td title="${attr(ratingInfo.title)}" style="${ratingInfo.style}">${esc(ratingInfo.shownRating || '')}</td><td title="${attr(issue.nodeNumber)}">${esc(nodeDisplay)}</td><td title="${attr(refEndpoint)}">${esc(refEndpoint)}</td><td title="${attr([issue.dtxrSource, issue.dtxrMatchedKey, issue.dtxrSourcePath, issue.dtxrSuppressionReason, ratingInfo.dtxrRating ? `DTXR Rating ${ratingInfo.dtxrRating}#` : ''].filter(Boolean).join(' · '))}">${esc(issue.dtxr || 'Not found')}</td><td>${esc(issue.valveHint || '')}</td><td title="${attr(issue.elementLengthSource || '')}">${esc(issue.lengthMm == null ? '' : `${Number(issue.lengthMm).toFixed(1)} mm`)}</td><td><input type="number" min="0" step="0.001" class="mc-rigid-review-input" data-wm-key="${attr(issue.key)}" value="${attr(initial)}" placeholder="kg" style="${inputStyle}"></td><td style="max-width:540px;"><div style="display:flex;flex-wrap:wrap;gap:4px;max-height:72px;overflow:auto;align-items:flex-start;">${chips}</div></td></tr>`;
    }).join('');
    const cfg = activeConfig();
    const authorityText = ratingMode === 'dtxr' ? 'Explicit DTXR Rating mode' : 'Exact Rating shown in Preview';
    contentEl.innerHTML = `<div class="model-converters-workflow-detail-note" style="margin-bottom:8px;">Rating authority: <strong>${esc(authorityText)}</strong>. Weight Match does not derive Rating again. Exact candidate length gate is ±${nfmt(valveHintLengthToleranceMm(cfg))} mm. Length conversion is ${convOn(cfg) ? 'ON' : 'OFF'}.</div><div class="mc-rigid-review-table-wrap" style="overflow:auto;max-height:48vh;"><table class="mc-rigid-review-table" style="border-collapse:collapse;font-size:12px;table-layout:auto;"><thead><tr>${[['Status', 140], ['Branch', 280], ['Line Key', 110], ['ComponentType', 130], ['Bore', 90], ['Rating', 90], ['Node', 90], ['ComponentRefNo_Endpoint', 190], ['DTXR', 260], ['Valve Hint', 160], ['Length', 100], ['Weight (kg)', 110], ['Nearest Suggestions (match %)', 360]].map(([label, width]) => widthTh(label, width)).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    contentEl.querySelectorAll('[data-wm-candidate]').forEach((button) => button.addEventListener('click', () => { const input = contentEl.querySelectorAll('.mc-rigid-review-input')[Number(button.dataset.wmCandidate)]; if (!input) return; input.value = button.dataset.wmWeight || ''; input.dispatchEvent(new Event('change', { bubbles: true })); }));
  };
  const fillBest = () => {
    const cfg = activeConfig();
    const masterRows = Array.isArray(cfg?.weight?.masterRows) && cfg.weight.masterRows.length
      ? cfg.weight.masterRows : workingMasterRows;
    if (!masterRows.length) return 0;
    const validator = createEmpiricalWeightValidator({ masterRows });
    let count = 0;
    contentEl.querySelectorAll('.mc-rigid-review-input').forEach((input, index) => {
      const issue = localIssues[index];
      const best = issue?.candidates?.[0];
      if (!best) return;
      const qualified = qualifiedXmlCiiRigidAutoWeightCandidate(
        { ...issue, ranking: { best } }, { validator },
      );
      if (!qualified) return;
      input.value = String(qualified.weightKg);
      saveInput(input);
      count += 1;
    });
    return count;
  };
  const compute = async (opts = {}) => {
    let liveConfig = activeConfig();
    syncToggle(); syncRatingMode(); drawPanel();
    const file = currentXmlFile(xmlFile);
    if (!file) { localIssues = []; workingMasterRows = []; contentEl.innerHTML = '<div class="model-converters-workflow-detail-note">No XML source loaded. Import an XML file first.</div>'; status('No input', 'bad'); return; }
    liveConfig = await ensureWeightMasterRows(liveConfig);
    if (!hasWeightMasterRows(liveConfig)) { localIssues = []; workingMasterRows = []; renderWeightMasterBlocked(contentEl); status('Weight master not ready', 'bad'); return; }
    const snapshot = readXmlCiiPreviewRatingSnapshot();
    if (!opts.force) {
      const stagedSourceForFp = typeof resolveStagedJsonText === 'function' ? await resolveStagedJsonText(liveConfig).catch(() => ({ text: '' })) : { text: await stagedText(stagedJsonText).catch(() => '') };
      const jsonLenForFp = clean(stagedSourceForFp?.text ?? stagedSourceForFp).length;
      const fingerprint = wmCacheFingerprint(file, jsonLenForFp, liveConfig?.weight?.masterRows?.length || 0, liveConfig?.overrides, ratingMode, snapshot.revision);
      const cached = readCache(WM_CACHE_KEY);
      if (cached?.fp === fingerprint && Array.isArray(cached?.data) && cached.data.length) {
        workingMasterRows = liveConfig.weight.masterRows;
        localIssues = cached.data.map((row) => applyXmlCiiFlangeWeightFallbackToIssue(rerankWithRating(row, liveConfig, { ratingMode, snapshot }), liveConfig));
        const mapped = localIssues.filter((row) => row.mapped).length;
        const zero = localIssues.filter((row) => row.candidates?.[0]?.zeroFallback).length;
        const unresolved = localIssues.length - mapped - localIssues.filter((row) => row.candidates?.[0]?.preferred || row.candidates?.[0]?.flangeWeightFallback || (row.candidates?.[0]?.inferredWeight && !row.candidates?.[0]?.zeroFallback)).length - zero;
        status(`${mapped} mapped · restored · ${ratingMode === 'dtxr' ? 'DTXR Rating' : 'Preview Rating'} · ${localIssues.length} shown`, (zero || unresolved) ? 'bad' : 'ok');
        drawRows(localIssues);
        if (window.__xmlCiiPendingValidation) { window.__xmlCiiPendingValidation = false; detailEl?.dispatchEvent(new CustomEvent('xml-cii-weight-validator-ready', { bubbles: true, cancelable: true, detail: { issues: localIssues, masterRows: liveConfig.weight?.masterRows || [], config: liveConfig } })); }
        return;
      }
    }
    status(`Computing with ${ratingMode === 'dtxr' ? 'DTXR Rating' : 'Preview Rating'}…`);
    try {
      const xmlText = await file.text();
      const stagedSource = typeof resolveStagedJsonText === 'function' ? await resolveStagedJsonText(liveConfig) : { text: await stagedText(stagedJsonText), label: '' };
      const jsonText = clean(stagedSource?.text ?? stagedSource);
      const enriched = await enrichXmlForCii2019(xmlText, jsonText, enrichedOptionsForWeightMatch(liveConfig));
      const enrichedConfig = await ensureWeightMasterRows(enriched.config || liveConfig);
      const cfg = await ensureWeightMasterRows(mergeRuntimeOverrides(mergeRuntimeOverrides(enrichedConfig, liveConfig), getXmlCiiPreviewRuntimeConfig()));
      if (!hasWeightMasterRows(cfg)) { localIssues = []; renderWeightMasterBlocked(contentEl); status('Weight master not ready', 'bad'); return; }
      const geometryXml = applyXmlCiiStagedGeometryAuthority(enriched.xmlText || xmlText, jsonText, { config: cfg }).xmlText;
      workingMasterRows = cfg.weight.masterRows;
       localIssues = applyNodeMeta(collectXmlCiiWeightMatchRows(geometryXml, jsonText, cfg), geometryXml).map(cleanRow).filter(Boolean).map((row) => applyXmlCiiFlangeWeightFallbackToIssue(rerankWithRating(row, cfg, { ratingMode, snapshot }), cfg));
      const mapped = localIssues.filter((row) => row.mapped).length;
      const suggested = localIssues.filter((row) => row.candidates?.[0]?.preferred).length;
      const flange = localIssues.filter((row) => row.candidates?.[0]?.flangeWeightFallback).length;
      const inferred = localIssues.filter((row) => row.candidates?.[0]?.inferredWeight && !row.candidates?.[0]?.zeroFallback && !row.candidates?.[0]?.flangeWeightFallback).length;
      const zero = localIssues.filter((row) => row.candidates?.[0]?.zeroFallback).length;
      const unresolved = localIssues.length - mapped - suggested - flange - inferred - zero;
      const missingRatings = localIssues.filter((row) => !row.rating).length;
      status(`${mapped} mapped · ${suggested} exact · ${flange} flange fallback · ${inferred} inferred · ${missingRatings} missing Rating · ${unresolved} unresolved · ${localIssues.length} shown${stagedSource?.label ? ` · ${stagedSource.label}` : ''}`, (zero || unresolved || missingRatings) ? 'bad' : 'ok');
      drawRows(localIssues);
      const cacheable = localIssues.map((row) => { const { ranking, ...rest } = row; return rest; });
      const fingerprint = wmCacheFingerprint(file, jsonText.length, cfg?.weight?.masterRows?.length || 0, cfg?.overrides, ratingMode, snapshot.revision);
      writeCache(WM_CACHE_KEY, fingerprint, cacheable);
      if (window.__xmlCiiPendingValidation) { window.__xmlCiiPendingValidation = false; detailEl?.dispatchEvent(new CustomEvent('xml-cii-weight-validator-ready', { bubbles: true, cancelable: true, detail: { issues: localIssues, masterRows: cfg.weight?.masterRows || [], config: cfg } })); }
    } catch (error) {
      localIssues = [];
      contentEl.innerHTML = `<div class="model-converters-workflow-detail-note">Could not compute weight matches: ${esc(error?.message || error)}</div>`;
      status('Error', 'bad');
    }
  };
  detailEl.querySelector('#mc-wm-refresh')?.addEventListener('click', () => compute({ force: true }));
  ratingModeButton?.addEventListener('click', () => { ratingMode = ratingMode === 'preview' ? 'dtxr' : 'preview'; invalidateXmlCiiWeightCache(); syncRatingMode(); compute({ force: true }); });
  toggleEl?.addEventListener('click', () => { invalidateXmlCiiWeightCache(); const cfg = activeConfig(); cfg.weight = plainObject(cfg.weight) ? cfg.weight : {}; cfg.weight.convertSmallLengthsInToMm = cfg.weight.convertSmallLengthsInToMm !== true; onSaveConfig(cfg); contentEl.innerHTML = '<div class="model-converters-workflow-detail-note">Length conversion changed. Click <strong>Build Weight Data</strong> to recompute.</div>'; localIssues = []; syncToggle(); });
  detailEl.querySelector('#mc-wm-fill-best')?.addEventListener('click', () => { const count = fillBest(); status(`Applied ${count} suggestion(s): ${XML_CII_AUTO_APPLY_MIN_CONFIDENCE_PCT}–${XML_CII_AUTO_APPLY_MAX_CONFIDENCE_PCT}% confidence + empirical ±50%`, count ? 'ok' : 'bad'); });
  panelEl?.addEventListener('change', () => { try { const cfg = applyWeightRulePanelConfig(panelEl, activeConfig()); cfg.weight.valveHintMapping = valveHintMappingRows(cfg); onSaveConfig(cfg); invalidateXmlCiiWeightCache(); contentEl.innerHTML = '<div class="model-converters-workflow-detail-note">Weight keyword/factor rules changed. Click <strong>Build Weight Data</strong> to recompute.</div>'; localIssues = []; status('Weight rules saved'); } catch (error) { status(error?.message || String(error), 'bad'); } });
  contentEl.addEventListener('change', (event) => { const input = event.target.closest?.('.mc-rigid-review-input'); if (input) saveInput(input); });
  syncToggle(); syncRatingMode(); drawPanel();
  if (typeof window !== 'undefined' && window.__xmlCiiPendingValidation) compute();
  else status('Ready to build with Preview Rating');
}

export async function computeXmlCiiWeightIssues({ xmlFile, resolveStagedJsonText, stagedJsonText, config, enrichXmlForCii2019 }) {
  let liveConfig = await ensureWeightMasterRows(config || {});
  if (!hasWeightMasterRows(liveConfig)) return null;
  const file = currentXmlFile(xmlFile);
  if (!file) return null;
  try {
    const xmlText = await file.text();
    const stagedSource = typeof resolveStagedJsonText === 'function' ? await resolveStagedJsonText(liveConfig).catch(() => ({ text: '' })) : { text: await stagedText(stagedJsonText || '').catch(() => '') };
    const jsonText = clean(stagedSource?.text ?? stagedSource ?? '');
    const enriched = await enrichXmlForCii2019(xmlText, jsonText, enrichedOptionsForWeightMatch(liveConfig));
    const enrichedConfig = await ensureWeightMasterRows(enriched.config || liveConfig);
    const cfg = await ensureWeightMasterRows(mergeRuntimeOverrides(mergeRuntimeOverrides(enrichedConfig, liveConfig), getXmlCiiPreviewRuntimeConfig()));
    if (!hasWeightMasterRows(cfg)) return null;
    const geometryXml = applyXmlCiiStagedGeometryAuthority(enriched.xmlText || xmlText, jsonText, { config: cfg }).xmlText;
    const snapshot = readXmlCiiPreviewRatingSnapshot();
    const issues = applyNodeMeta(collectXmlCiiWeightMatchRows(geometryXml, jsonText, cfg), geometryXml).map(cleanRow).filter(Boolean).map((row) => applyXmlCiiFlangeWeightFallbackToIssue(rerankWithRating(row, cfg, { ratingMode: 'preview', snapshot }), cfg));
    return { issues, masterRows: cfg.weight?.masterRows || [], config: cfg, previewRatingSnapshot: snapshot };
  } catch (error) {
    console.warn('XML→CII standalone weight computation failed:', error);
    return null;
  }
}
