function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function clean(value) {
  return text(value).replace(/\s+/g, ' ').trim();
}

function pickText(row, keys) {
  for (const key of keys || []) {
    const value = row?.[key] ?? row?._raw?.[key];
    if (clean(value)) return clean(value);
  }
  return '';
}

function pickNumber(row, keys) {
  for (const key of keys || []) {
    const match = text(row?.[key] ?? row?._raw?.[key]).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) continue;
    const numeric = Number(match[0]);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function normalizedRating(value) {
  return clean(value).replace(/#/g, '').toUpperCase();
}

function masterLength(rawLength, xmlLengthMm, config) {
  if (rawLength === null || rawLength === undefined) return null;
  if (config?.weight?.convertSmallLengthsInToMm !== true) return rawLength;
  return rawLength < 100 && Number(xmlLengthMm) > 100
    ? rawLength * (Number(config?.weight?.inchToMm) || 25.4)
    : rawLength;
}

function roundWeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 1000) / 1000;
}

function rowToCandidate(row, config, lengthMm) {
  const rowBore = pickNumber(row, ['boreMm', 'convertedBore', 'Converted Bore', 'bore', 'Bore', 'DN', 'NB']);
  const rawLength = pickNumber(row, ['lengthMm', 'length', 'Length (RF-F/F)', 'RF-F/F', 'LEN', 'faceToFace']);
  const rowLength = masterLength(rawLength, Number(lengthMm), config);
  const weight = pickNumber(row, ['valveWeight', 'directWeight', 'weight', 'Weight', 'RF/RTJ KG', 'Valve Weight']);
  const rowRating = normalizedRating(pickText(row, ['ratingClass', 'rating', 'Rating', 'RATING', 'Class', 'CLASS', 'Pressure Class']));
  const type = pickText(row, ['type', 'Type', 'TYPE', 'valveType', 'Valve Type']);
  const typeDesc = pickText(row, ['typeDesc', 'TypeDesc', 'Type Desc', 'Type Description', 'Description', 'Valve Type']);
  if (rowBore === null || rowLength === null || weight === null || !rowRating) return null;
  return { rowBore, rowLength, weight, rowRating, type, valveType: type, typeDesc, rowData: row };
}

function isFlangeCandidate(candidate) {
  const value = `${candidate?.type || ''} ${candidate?.typeDesc || ''}`.toUpperCase();
  return /\b(FLAN|FLANGE|FLANGED|WELDNECK|WELDING[- ]?NECK|WNFL|BLIND[- ]?FLANGE)\b/.test(value);
}

function selectedWeight(candidate) {
  return Number(candidate?.selectedWeight ?? candidate?.suggestedWeight ?? candidate?.weight);
}

function shouldAddFlangeFallback(issue) {
  const best = Array.isArray(issue?.candidates) ? issue.candidates[0] : null;
  if (!best) return true;
  if (best.zeroFallback) return true;
  if (best.specialFactorRule) return false;
  if (best.fallbackSuggestion && !best.flangeWeightFallback && !best.preferred) return true;
  return !Number.isFinite(selectedWeight(best)) || selectedWeight(best) <= 0;
}

function formatIssueValveHint(issue) {
  const existing = clean(issue?.valveHint);
  if (existing) return existing;
  const hint = issue?.nodeHint;
  if (!hint) return '';
  const code = clean(hint.code);
  const label = clean(hint.label || hint.subtype || hint.family || 'Valve');
  return code ? `${code} → ${label}` : label;
}

function ensureIssueValveHint(issue) {
  if (!issue) return issue;
  const valveHint = formatIssueValveHint(issue);
  return valveHint && issue.valveHint !== valveHint ? { ...issue, valveHint } : issue;
}

export function buildXmlCiiFlangeWeightFallback(issue, config) {
  const rows = Array.isArray(config?.weight?.masterRows) ? config.weight.masterRows : [];
  const targetLength = Number(issue?.lengthMm);
  const bore = Number(issue?.boreMm);
  const rating = normalizedRating(issue?.rating);
  if (!rows.length || !Number.isFinite(targetLength) || targetLength <= 0 || !Number.isFinite(bore) || !rating) return null;

  const matches = rows
    .map((row) => rowToCandidate(row, config, targetLength))
    .filter(Boolean)
    .filter((candidate) => {
      const boreDelta = Math.abs(Number(candidate.rowBore) - bore);
      return Number.isFinite(boreDelta)
        && boreDelta < 1
        && candidate.rowRating === rating
        && Number(candidate.rowLength) > 0
        && Number(candidate.weight) > 0
        && isFlangeCandidate(candidate);
    })
    .sort((a, b) => Math.abs(Number(a.rowLength) - targetLength) - Math.abs(Number(b.rowLength) - targetLength));

  const reference = matches[0];
  if (!reference) return null;

  const ratio = targetLength / Number(reference.rowLength);
  const proposedWeight = roundWeight(Number(reference.weight) * ratio);
  if (!Number.isFinite(proposedWeight) || proposedWeight <= 0) return null;

  const lengthDelta = Math.abs(Number(reference.rowLength) - targetLength);
  return {
    ...reference,
    masterWeight: Number(reference.weight),
    selectedWeight: proposedWeight,
    suggestedWeight: proposedWeight,
    weight: proposedWeight,
    weightMethod: 'flange-length-extrapolated',
    weightWarning: `Flange weight fallback: same Bore ${bore.toFixed(0)} / Rating ${rating}, ${Number(reference.weight)} kg at ${Number(reference.rowLength).toFixed(1)} mm scaled to ${targetLength.toFixed(1)} mm.`,
    inferredWeight: true,
    fallbackSuggestion: true,
    zeroFallback: false,
    rowBore: bore,
    rowRating: rating,
    lengthDelta,
    boreDelta: 0,
    ratingExact: true,
    ratingScore: 1,
    score: 0.45,
    candidateClass: { family: 'FLANGE', subtype: 'FLANGE' },
    lengthQualified: false,
    lengthToleranceMm: Number(config?.weight?.valveHintLengthToleranceMm) || 0,
    nodeValveHint: issue?.nodeHint || null,
    valveHintLabel: formatIssueValveHint(issue),
    semanticTier: 0,
    semanticPotentialTier: 0,
    semanticReason: 'Flange WT extrapolated by element length',
    semanticSource: '',
    rejectedReason: '',
    preferred: false,
    type: reference.type || 'FLANGE',
    valveType: reference.valveType || 'FLANGE',
    typeDesc: 'Flange WT scaled to ElementLength',
  };
}

export function applyXmlCiiFlangeWeightFallbackToIssue(issue, config) {
  const withHint = ensureIssueValveHint(issue);
  if (!withHint || !shouldAddFlangeFallback(withHint)) return withHint;
  const fallback = buildXmlCiiFlangeWeightFallback(withHint, config);
  if (!fallback) return withHint;
  return {
    ...withHint,
    candidates: [fallback],
    ranking: { ...(withHint.ranking || {}), best: fallback, candidates: [fallback] },
    flangeWeightFallback: true,
  };
}

export function applyXmlCiiFlangeWeightFallbackToIssues(issues, config) {
  return Array.isArray(issues)
    ? issues.map((issue) => applyXmlCiiFlangeWeightFallbackToIssue(issue, config))
    : [];
}
