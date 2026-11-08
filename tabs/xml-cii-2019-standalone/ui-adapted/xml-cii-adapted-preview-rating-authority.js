import { findBestPipingClassRow, buildPipingClassIndex } from '../../../converters/xml-cii2019-core/piping-class-resolver.js';
import { deriveXmlCiiPipingClassFromBranchName } from '../../../converters/xml-cii2019-core/piping-class-source-resolver.js';
import { buildStagedDtxrIndex, resolveXmlCiiNodeDtxr } from '../../../converters/xml-cii2019-core/dtxr-resolver.js';
import { rankXmlCiiWeightCandidates, formatValveHint } from '../../../converters/xml-cii2019-core/weight-valve-hints.js';
import {
  resolveXmlCiiAutomaticRating,
  resolveXmlCiiRatingAuthority,
} from '../../../converters/xml-cii2019-core/dtxr-rating-resolver.js';
import { isPreviewDtxrRatingOverride } from './xml-cii-adapted-preview-rating-fetch.js';
import {
  _ratingKeys,
  _rowText,
  _toText,
  _xmlChildrenByName,
  _xmlText,
} from './xml-cii-adapted-preview-dryrun-core.js';

const BLOCKED_DTXR_RATING_TYPES = new Set(['SUPPORT', 'RESTRAINT', 'ATTA', 'GASK']);

function ratingEvidenceCarrierAllowed(componentType) {
  return !BLOCKED_DTXR_RATING_TYPES.has(_toText(componentType).trim().toUpperCase());
}

function classRowRating(row) {
  return _rowText(row, ['rating', 'Rating', 'RATING', 'Pressure Class', 'classRating', 'Class Rating', 'PRESSURE_CLASS']);
}

function branchDtxrEvidence(branch, stagedIndex, config) {
  const out = [];
  for (const node of _xmlChildrenByName(branch, 'Node')) {
    const componentType = _xmlText(node, 'ComponentType');
    const componentRefNo = _xmlText(node, 'ComponentRefNo');
    if (!ratingEvidenceCarrierAllowed(componentType)) continue;
    for (const key of ['DTXR', 'DTXR_POS', 'TEEDESC_POS', 'DTXR_PS']) {
      const dtxr = _xmlText(node, key);
      if (dtxr) out.push({ dtxr, source: `xml-${key.toLowerCase()}`, componentType, componentRefNo });
    }
    const resolved = resolveXmlCiiNodeDtxr(node, stagedIndex, config);
    if (resolved?.value) out.push({ dtxr: resolved.value, source: resolved.source || 'staged-dtxr', componentType, componentRefNo });
  }
  const seen = new Set();
  return out.filter((item) => {
    const key = `${item.dtxr}\u0000${item.source}\u0000${item.componentType}\u0000${item.componentRefNo}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ratingOverrideRecord(config, keys) {
  const rating = config?.overrides?.rating;
  if (rating && typeof rating === 'object' && !Array.isArray(rating)) {
    for (const key of keys) {
      const value = _toText(rating[key]).trim();
      if (value) return { value, key, bucket: 'rating' };
    }
  }
  const processData = config?.overrides?.processData;
  if (processData && typeof processData === 'object' && !Array.isArray(processData)) {
    for (const key of keys) {
      const value = _toText(processData[key]?.rating).trim();
      if (value) return { value, key, bucket: 'processData' };
    }
  }
  return { value: '', key: '', bucket: '' };
}

export function resolvePreviewPipingClassRating(row, pipingClassIndex, config) {
  const pipingClass = _toText(row?.pipingClass || row?.pipingClassDerived).trim();
  const boreMm = Number(row?.sizeMm);
  if (!pipingClass || !Number.isFinite(boreMm) || boreMm <= 0) return '';
  const match = findBestPipingClassRow({
    pipingClass,
    boreMm,
    componentType: 'PIPE',
    rating: '',
    schedule: '',
    pipingClassIndex,
    overrides: config?.overrides || {},
    config,
  });
  return classRowRating(match?.row);
}

function emptyWeightAuthority(nodeRow, rating) {
  return { ...nodeRow, rating, valveHint: '', weightMatch: null, weightCandidates: [], rejectedWeightCandidates: [] };
}

function rerankNodeRows(nodeRows, branchRows, config) {
  const byBranch = new Map(branchRows.map((row) => [row.branchName, row]));
  return (nodeRows || []).map((nodeRow) => {
    const branch = byBranch.get(nodeRow.branchName);
    const rating = _toText(branch?.rating || '').trim();
    if (!rating) return emptyWeightAuthority(nodeRow, '');
    if (!Number.isFinite(Number(nodeRow.boreMm)) || !Number.isFinite(Number(nodeRow.lengthMm))) return emptyWeightAuthority(nodeRow, rating);
    const ranking = rankXmlCiiWeightCandidates({
      boreMm: nodeRow.boreMm,
      rating,
      lengthMm: nodeRow.lengthMm,
      nodeName: nodeRow.nodeName || '',
      componentType: nodeRow.componentType || nodeRow.type || '',
      componentRefNo: nodeRow.componentRefNo || '',
      dtxr: nodeRow.dtxr || '',
    }, config, { includeRejected: true });
    const candidates = ranking.candidates.slice(0, 5);
    const selectedOverride = nodeRow.weightMatch?.selectedOverride === true;
    const selectedWeight = Number(nodeRow.weightMatch?.selectedWeight ?? nodeRow.weightMatch?.weight);
    const weightMatch = selectedOverride && Number.isFinite(selectedWeight) && selectedWeight > 0
      ? { ...(candidates[0] || nodeRow.weightMatch || {}), selectedWeight, suggestedWeight: selectedWeight, weight: selectedWeight, selectedOverride: true }
      : (ranking.best || null);
    return { ...nodeRow, rating, valveHint: formatValveHint(ranking.nodeHint), weightMatch, weightCandidates: candidates, rejectedWeightCandidates: ranking.rejectedCandidates.slice(0, 3) };
  });
}

export function applyPreviewRatingAuthority({ xmlText, config = {}, stagedJsonText = '', result, sourceDocument = null, stagedIndex: sharedStagedIndex = null } = {}) {
  const branchRows = Array.isArray(result?.branchRows) ? result.branchRows : [];
  if (!branchRows.length || typeof DOMParser === 'undefined') return result || { branchRows: [], nodeRows: [] };
  let document;
  try {
    document = sourceDocument ||
      new DOMParser().parseFromString(_toText(xmlText), 'application/xml');
    if (document.getElementsByTagName('parsererror').length) return result;
  } catch {
    return result;
  }
  const branches = [...document.getElementsByTagName('Branch')];
  const stagedIndex = sharedStagedIndex || buildStagedDtxrIndex(stagedJsonText || '', config);
  const pipingClassIndex = buildPipingClassIndex(config?.pipingClass?.masterRows || []);
  const ratedRows = branchRows.map((row, index) => {
    const branch = branches[index] || branches.find((item) => _xmlText(item, 'Branchname') === row.branchName);
    const branchPipingClass = deriveXmlCiiPipingClassFromBranchName(row.branchName, config);
    const ratingKeys = _ratingKeys(row);
    const manual = ratingOverrideRecord(config, ratingKeys);
    const pipingClass = _toText(row.pipingClass || branchPipingClass || row.pipingClassDerived).trim();
    const pipingClassRating = resolvePreviewPipingClassRating({ ...row, pipingClass }, pipingClassIndex, config);
    const dtxrValues = branch ? branchDtxrEvidence(branch, stagedIndex, config) : [];
    const authority = resolveXmlCiiRatingAuthority({ manualRating: manual.value, pipingClassRating, pipingClass, branchName: row.branchName, config, dtxrValues });
    const automatic = resolveXmlCiiAutomaticRating({ pipingClassRating, pipingClass, branchName: row.branchName, config });
    const fetched = manual.key && isPreviewDtxrRatingOverride(config, manual.key);
    return {
      ...row,
      pipingClassDerived: branchPipingClass || row.pipingClassDerived,
      pipingClassSource: branchPipingClass ? 'branch-name' : (row.pipingClassSource || 'line-list'),
      rating: authority.rating || '',
      ratingDerived: automatic.rating || '',
      ratingSource: fetched ? 'dtxr-rating-fetched' : authority.source,
      ratingResolvedSource: fetched ? 'dtxr-rating-fetched' : authority.resolvedSource,
      ratingDtxr: authority.dtxrRating,
      ratingDtxrRatings: authority.dtxrRatings,
      ratingDtxrEvidence: authority.dtxrEvidence,
      ratingDtxrConflict: authority.dtxrConflict,
      ratingConflict: false,
      ratingNeedsReview: !authority.rating,
    };
  });
  return { ...(result || {}), branchRows: ratedRows, nodeRows: rerankNodeRows(result?.nodeRows || [], ratedRows, config) };
}
