import { normalizeXmlCiiPipingClassMasterRow } from './nps-bore-resolver.js';

export const DEFAULT_PIPING_CLASS_MATCH_CONFIG = Object.freeze({
  classExactScore: 1000,
  overrideScore: 1100,
  leadingNumericExactScore: 940,
  prefixBaseScore: 910,
  startsWithScore: 860,
  numericFamilyBaseScore: 800,
  numericFamilyPrefixWeight: 35,
  fuzzyRatioWeight: 780,
  fuzzyMinRatio: 0.60,
  ambiguousScoreDelta: 50,
  minAcceptScore: 760,
  reviewBelowConfidence: 1.0,
  maxCandidates: 8,
  rowScoring: Object.freeze({
    boreToleranceMm: 1.0,
    classExactWeight: 1000,
    boreExactWeight: 300,
    boreNearWeight: 220,
    componentExactWeight: 180,
    pipeRigidWeight: 120,
    ratingExactWeight: 80,
    scheduleExactWeight: 60,
    minAcceptScore: 1000,
    ambiguousScoreDelta: 50,
  }),
});

// Bounded normalization cache: a class label is immutable text, reused across
// thousands of row comparisons. Never cache objects or mutable master rows.
const normalizedClassStrings = new Map();
const PIPE_CLASS_CACHE_LIMIT = 16384;
let normalizeClassMemoHits = 0;
export function readPipingClassNormalizerMemoStats() {
  return { hits: normalizeClassMemoHits, size: normalizedClassStrings.size };
}
const indexedClassWork = new WeakMap();
function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function number(value) {
  const match = text(value).replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
  const numeric = match ? Number(match[0]) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizePipingClass(value) {
  const raw = text(value);
  if (normalizedClassStrings.has(raw)) {
    normalizeClassMemoHits += 1;
    return normalizedClassStrings.get(raw);
  }
  const result = raw.toUpperCase().replace(/^=/, '').replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
  if (normalizedClassStrings.size >= PIPE_CLASS_CACHE_LIMIT) normalizedClassStrings.clear();
  normalizedClassStrings.set(raw, result);
  return result;
}

export function displayPipingClass(value) { return text(value).toUpperCase(); }

function mergeConfig(config = {}) {
  const supplied = config?.pipingClassMatch || config || {};
  return {
    ...DEFAULT_PIPING_CLASS_MATCH_CONFIG,
    ...supplied,
    rowScoring: {
      ...DEFAULT_PIPING_CLASS_MATCH_CONFIG.rowScoring,
      ...(supplied.rowScoring || config?.rowScoring || {}),
    },
  };
}

function readClassFromRow(row, fieldMap = {}) {
  return row?.[fieldMap.pipingClass]
    ?? row?.pipingClass
    ?? row?.['Piping Class']
    ?? row?.PIPING_CLASS
    ?? row?.Class
    ?? row?.SPEC
    ?? row?.Spec
    ?? '';
}

function leadingDigits(value) { return normalizePipingClass(value).match(/^\d+/)?.[0] || ''; }
function commonPrefixLength(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

function sequenceRatio(left, right) {
  const a = normalizePipingClass(left).toLowerCase();
  const b = normalizePipingClass(right).toLowerCase();
  if (!a || !b) return 0;
  const row = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const prior = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = prior;
    }
  }
  return (2 * row[b.length]) / (a.length + b.length);
}

function overrideForClass(overrides, requestedClass) {
  const bucket = overrides?.pipingClass || overrides?.pipingClassApprox || overrides?.approxPipingClass || {};
  const requested = normalizePipingClass(requestedClass);
  for (const [key, value] of Object.entries(bucket)) {
    if (normalizePipingClass(key) === requested && text(value)) return displayPipingClass(value);
  }
  return '';
}

function uniqueClasses(values) {
  const output = [];
  const seen = new Set();
  for (const value of values || []) {
    const raw = displayPipingClass(value);
    const normalized = normalizePipingClass(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(raw);
  }
  return output;
}

function knownClassesFromIndex(index) {
  if (Array.isArray(index?.knownClasses)) return uniqueClasses(index.knownClasses);
  if (index?.byClass instanceof Map) return uniqueClasses([...index.byClass.keys()]);
  if (index instanceof Map) return uniqueClasses([...index.keys()]);
  return [];
}

function rowsForClass(index, pipingClass) {
  const key = normalizePipingClass(pipingClass);
  if (!key) return [];
  if (index?.byClass instanceof Map) return index.byClass.get(key) || [];
  if (index instanceof Map) return index.get(key) || [];
  return [];
}

function familyCandidates(requestedClass, classes) {
  const requestedDigits = leadingDigits(requestedClass);
  if (!requestedDigits) return classes;
  const ranked = classes.map((candidate) => ({
    candidate,
    depth: commonPrefixLength(requestedDigits, leadingDigits(candidate)),
  }));
  const maxDepth = Math.max(0, ...ranked.map((item) => item.depth));
  return maxDepth > 0 ? ranked.filter((item) => item.depth === maxDepth).map((item) => item.candidate) : [];
}

function scorePipingClassCandidatePrepared(requestedClass, candidateClass, cfg) {
  const requested = normalizePipingClass(requestedClass);
  const candidate = normalizePipingClass(candidateClass);
  const result = (score, confidence, method, reasons) => ({
    candidate: displayPipingClass(candidateClass), score, confidence, method, reasons,
  });
  if (!requested || !candidate) return result(-Infinity, 0, 'invalid', ['invalid-empty-class']);
  if (requested === candidate) return result(cfg.classExactScore, 1, 'exact', ['class-exact']);
  if (requested.startsWith(candidate) || candidate.startsWith(requested)) {
    const candidateIsBase = requested.startsWith(candidate);
    const score = candidateIsBase ? cfg.prefixBaseScore : cfg.startsWithScore;
    return result(score, Math.min(0.94, score / cfg.classExactScore), candidateIsBase ? 'prefix-base' : 'starts-with', ['prefix-compatible']);
  }
  const requestedDigits = leadingDigits(requested);
  const candidateDigits = leadingDigits(candidate);
  if (requestedDigits || candidateDigits) {
    const depth = commonPrefixLength(requestedDigits, candidateDigits);
    if (!requestedDigits || !candidateDigits || depth === 0) return result(-Infinity, 0, 'family-mismatch', ['numeric-family-mismatch']);
    const lengthPenalty = Math.abs(requestedDigits.length - candidateDigits.length) * 3;
    const score = cfg.numericFamilyBaseScore + Math.min(5, depth) * cfg.numericFamilyPrefixWeight - lengthPenalty;
    return result(score, Math.min(0.95, score / cfg.classExactScore), 'prefix-base', [`numeric-family-prefix:${requestedDigits.slice(0, depth)}`]);
  }
  const ratio = sequenceRatio(requested, candidate);
  const score = Math.round(ratio * cfg.fuzzyRatioWeight);
  return result(score, Math.max(0, Math.min(ratio >= cfg.fuzzyMinRatio ? 0.8 : 0.6, ratio)), ratio >= cfg.fuzzyMinRatio ? 'fuzzy-ratio' : 'below-threshold', [`ratio:${ratio.toFixed(3)}`]);
}

export function scorePipingClassCandidate(requestedClass, candidateClass, config = {}) {
  return scorePipingClassCandidatePrepared(requestedClass, candidateClass, mergeConfig(config));
}

export function resolveApproximatePipingClass({ requestedClass, knownClasses, pipingClassIndex, overrides = {}, config = {} }) {
  const cfg = mergeConfig(config);
  const rawRequested = displayPipingClass(requestedClass);
  const normalizedRequestedClass = normalizePipingClass(rawRequested);
  // The index is built afresh per calculation. Reuse its unique class list
  // and the class-family shortlist, but NEVER cache config/override-dependent
  // scores, reviews or final selections.
  const cached = !knownClasses && pipingClassIndex && indexedClassWork.get(pipingClassIndex);
  const allClasses = cached?.knownClasses || uniqueClasses(knownClasses || knownClassesFromIndex(pipingClassIndex));
  const candidateKey = normalizePipingClass(rawRequested);
  let candidateClasses = cached?.families?.get(candidateKey);
  if (!candidateClasses) {
    candidateClasses = familyCandidates(rawRequested, allClasses);
    if (cached) cached.families.set(candidateKey, candidateClasses);
  } else if (cached) {
    cached.familyCacheHits += 1;
  }
  const scored = candidateClasses
    .map((candidate) => scorePipingClassCandidatePrepared(rawRequested, candidate, cfg))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score || left.candidate.localeCompare(right.candidate));
  const best = scored[0] || null;
  const second = scored[1] || null;
  const override = overrideForClass(overrides, rawRequested);
  if (!normalizedRequestedClass) return { requestedClass: rawRequested, pipingClass: '', normalizedRequestedClass: '', method: 'none', confidence: 0, score: 0, needsReview: true, reasons: ['missing-requested-class'], candidates: [] };
  if (override) return { requestedClass: rawRequested, pipingClass: override, normalizedRequestedClass, method: 'override', confidence: 1, score: cfg.overrideScore, needsReview: false, reasons: ['manual-override'], candidates: scored.slice(0, cfg.maxCandidates) };
  if (!best || best.score < cfg.minAcceptScore) return { requestedClass: rawRequested, pipingClass: '', normalizedRequestedClass, method: 'none', confidence: best?.confidence ?? 0, score: best?.score ?? 0, needsReview: true, reasons: [candidateClasses.length ? 'below-min-accept-score' : 'numeric-family-not-found', ...(best?.reasons || [])], candidates: scored.slice(0, cfg.maxCandidates) };
  const ambiguous = Boolean(second && Math.abs(best.score - second.score) <= cfg.ambiguousScoreDelta);
  return { requestedClass: rawRequested, pipingClass: best.candidate, normalizedRequestedClass, method: ambiguous ? 'ambiguous-approximate' : best.method, confidence: best.confidence, score: best.score, needsReview: ambiguous || best.confidence < cfg.reviewBelowConfidence || best.method !== 'exact', reasons: best.reasons, candidates: scored.slice(0, cfg.maxCandidates) };
}

export function buildPipingClassIndex(rows, fieldMap = {}) {
  const map = new Map();
  const knownClasses = [];
  const seenClasses = new Set();
  const perf = typeof performance !== 'undefined' ? performance : null;
  perf?.mark?.('xml-cii:piping-class:index:start');
  const safeRows = (Array.isArray(rows) ? rows : []).map(normalizeXmlCiiPipingClassMasterRow);
  for (const row of safeRows) {
    const rawClass = readClassFromRow(row, fieldMap);
    const normalized = normalizePipingClass(rawClass);
    if (!normalized) continue;
    if (!map.has(normalized)) map.set(normalized, []);
    map.get(normalized).push(row);
    if (!seenClasses.has(normalized)) {
      seenClasses.add(normalized);
      knownClasses.push(displayPipingClass(rawClass));
    }
  }
  map.byClass = map;
  map.knownClasses = knownClasses;
  map.rows = safeRows;
  indexedClassWork.set(map, { knownClasses, families: new Map(), familyCacheHits: 0 });
  perf?.mark?.('xml-cii:piping-class:index:end');
  perf?.measure?.('xml-cii:piping-class:index',
    'xml-cii:piping-class:index:start', 'xml-cii:piping-class:index:end');
  return map;
}

function normalizeComponentType(value) {
  const source = text(value).toUpperCase();
  if (source === 'RIGID' || source.includes('PIPE')) return 'PIPE';
  if (source.includes('ELBOW') || source === 'BEND') return 'BEND';
  if (source.includes('TEE')) return 'TEE';
  if (source.includes('VALVE') || source.startsWith('VLV')) return 'VALVE';
  if (source.includes('FLANGE') || source === 'FLG') return 'FLANGE';
  return source;
}

function normalizeRating(value) { return text(value).toUpperCase().replace(/CLASS|CL|#|RATING/g, '').replace(/\s+/g, ''); }
function normalizeSchedule(value) { return text(value).toUpperCase().replace(/\s+/g, ''); }

function scorePipingClassRowPrepared({ row, pipingClass, boreMm, componentType, rating, schedule }, cfg) {
  const normalizedRow = normalizeXmlCiiPipingClassMasterRow(row);
  const rowClass = normalizePipingClass(readClassFromRow(normalizedRow));
  const requestedClass = normalizePipingClass(pipingClass);
  if (!rowClass || !requestedClass || rowClass !== requestedClass) return { score: -Infinity, confidence: 0, needsReview: true, reasons: ['class-mismatch'] };
  let score = cfg.classExactWeight;
  const reasons = ['class-exact'];
  const rowBore = number(normalizedRow.convertedBore ?? normalizedRow.boreMm);
  const requestedBore = number(boreMm);
  if (requestedBore != null && rowBore != null) {
    const difference = Math.abs(rowBore - requestedBore);
    if (difference <= 0.001) { score += cfg.boreExactWeight; reasons.push('bore-exact'); }
    else if (difference <= cfg.boreToleranceMm) { score += cfg.boreNearWeight; reasons.push(`bore-near:${difference.toFixed(3)}mm`); }
    else { score -= cfg.boreExactWeight; reasons.push(`bore-mismatch:${difference.toFixed(3)}mm`); }
  } else reasons.push('bore-missing');
  const rowComponent = normalizeComponentType(normalizedRow.componentType ?? normalizedRow['Component Type'] ?? normalizedRow.COMPONENT_TYPE ?? normalizedRow.type ?? normalizedRow.itemType);
  const requestedComponent = normalizeComponentType(componentType);
  if (rowComponent && requestedComponent && rowComponent === requestedComponent) { score += cfg.componentExactWeight; reasons.push('component-exact'); }
  else if (rowComponent === 'PIPE' && requestedComponent === 'PIPE') { score += cfg.pipeRigidWeight; reasons.push('pipe-rigid-compatible'); }
  const rowRating = normalizeRating(normalizedRow.rating ?? normalizedRow.Rating ?? normalizedRow.RATING ?? normalizedRow['Pressure Class'] ?? normalizedRow.class);
  const requestedRating = normalizeRating(rating);
  if (rowRating && requestedRating && rowRating === requestedRating) { score += cfg.ratingExactWeight; reasons.push('rating-exact'); }
  const rowSchedule = normalizeSchedule(normalizedRow.schedule ?? normalizedRow.Schedule ?? normalizedRow.SCH);
  const requestedSchedule = normalizeSchedule(schedule);
  if (rowSchedule && requestedSchedule && rowSchedule === requestedSchedule) { score += cfg.scheduleExactWeight; reasons.push('schedule-exact'); }
  const maximum = cfg.classExactWeight + cfg.boreExactWeight + cfg.componentExactWeight + cfg.ratingExactWeight + cfg.scheduleExactWeight;
  return { score, confidence: Math.max(0, Math.min(1, score / maximum)), needsReview: reasons.includes('bore-missing'), reasons };
}

export function scorePipingClassRow(options) {
  return scorePipingClassRowPrepared(options, mergeConfig(options?.config || {}).rowScoring);
}

// Test diagnostics are confined to per-build index statistics.
export function readPipingClassIndexCacheStats(index) {
  const cached = index && indexedClassWork.get(index);
  return { familyCacheHits: cached?.familyCacheHits || 0,
    distinctFamilyLookups: cached?.families.size || 0 };
}

export function findBestPipingClassRow({ pipingClass, boreMm, componentType, rating, schedule, pipingClassIndex, overrides = {}, config = {} }) {
  const cfg = mergeConfig(config).rowScoring;
  const classMatch = resolveApproximatePipingClass({ requestedClass: pipingClass, pipingClassIndex, overrides, config });
  const resolvedPipingClass = normalizePipingClass(classMatch.pipingClass || pipingClass);
  const scored = rowsForClass(pipingClassIndex, resolvedPipingClass)
    .map((row) => ({ row, ...scorePipingClassRowPrepared({ row, pipingClass: resolvedPipingClass, boreMm, componentType, rating, schedule }, cfg) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score);
  const best = scored[0] || null;
  const second = scored[1] || null;
  if (!best || best.score < cfg.minAcceptScore) return { row: null, resolvedPipingClass, classMatch, method: 'none', confidence: classMatch.confidence || 0, needsReview: true, score: best?.score ?? 0, reasons: ['row-below-min-accept-score', ...(best?.reasons || [])], candidates: scored.slice(0, mergeConfig(config).maxCandidates) };
  const ambiguous = Boolean(second && Math.abs(best.score - second.score) <= cfg.ambiguousScoreDelta);
  return { row: best.row, resolvedPipingClass, classMatch, method: ambiguous ? 'ambiguous-best-score' : 'best-score', confidence: best.confidence, needsReview: classMatch.needsReview || best.needsReview || ambiguous, score: best.score, reasons: [...(classMatch.reasons || []), ...(best.reasons || [])], candidates: scored.slice(0, mergeConfig(config).maxCandidates) };
}
