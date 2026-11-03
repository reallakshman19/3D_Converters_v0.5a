/** Builds read-only Preview rows from source XML, standalone config, and staged
 * JSON. Returns rows with provenance; invalid XML returns empty rows. */

import { deriveLineKeyFromBranchName, tokenAtPosition } from '../../../converters/xml-cii2019-core/regex-line-key.js';
import { computeLineNoKey, normalizeLineListRow } from '../../../converters/xml-cii2019-core/linelist-mapping.js';
import { xmlCiiWeightReviewNodeOverrideKey, isXmlCiiWeightReviewNode, xmlCiiNumberText } from '../../../converters/xml-cii2019-core/weight-match-model.js';
import { rankXmlCiiWeightCandidates, formatValveHint } from '../../../converters/xml-cii2019-core/weight-valve-hints.js';
import { buildPipingClassIndex } from '../../../converters/xml-cii2019-core/piping-class-resolver.js';
import { resolveBranchProcessData } from '../../../converters/xml-cii2019-core/branch-process-resolver.js';
import { buildStagedDtxrIndex, resolveXmlCiiNodeDtxr } from '../../../converters/xml-cii2019-core/dtxr-resolver.js';
import { resolveLineListDensity } from '../../../converters/xml-cii2019-core/line-density-resolver.js';
import { resolveXmlCiiWallThicknessFromDtxr } from '../../../converters/xml-cii2019-core/dtxr-wall-thickness-resolver.js';
import { previewOverrideProvenance } from './xml-cii-adapted-preview-provenance.js';

export function _toText(val) { return val === null || val === undefined ? '' : String(val); }
export function _toFiniteNumber(value, fallback) { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : fallback; }
export function _esc(value) { return _toText(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
export function _xmlLocalName(node) { return _toText(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
export function _xmlChildrenByName(parent, localName) { return [...(parent?.childNodes || [])].filter((child) => child.nodeType === 1 && _xmlLocalName(child) === localName); }
export function _xmlFirstChild(parent, localName) { return _xmlChildrenByName(parent, localName)[0] || null; }
export function _xmlText(parent, localName) { return _toText(_xmlFirstChild(parent, localName)?.textContent).trim(); }

export function _normalizePoint(p) {
  if (!p) return null;
  const v = Array.isArray(p) ? p.map(Number) : (typeof p === 'object' ? [p.x ?? p.X, p.y ?? p.Y, p.z ?? p.Z].map(Number) : (_toText(p).match(/-?\d+(?:\.\d+)?/g) || []).map(Number));
  return v.length >= 3 && v.slice(0, 3).every(Number.isFinite) ? { x: v[0], y: v[1], z: v[2] } : null;
}
export function _pointDistanceMm(a, b) {
  const pa = _normalizePoint(a), pb = _normalizePoint(b);
  return pa && pb ? Math.sqrt((pa.x - pb.x)**2 + (pa.y - pb.y)**2 + (pa.z - pb.z)**2) : null;
}
export function _regexGroup(txt, pat, idx = 1) {
  try { const m = new RegExp(_toText(pat).trim(), 'i').exec(_toText(txt)); return _toText(m?.[Math.max(0, Number(idx || 0))] || '').trim(); } catch { return ''; }
}
export function _rowText(row, keys) {
  if (!row || typeof row !== 'object') return '';
  for (const k of keys) {
    const v = _toText(row[k] ?? row._raw?.[k]).trim();
    if (v) return v;
  }
  return '';
}
export function _rowNumber(row, keys) {
  const text = _rowText(row, keys);
  const match = text.match(/[-+]?\d*\.?\d+/);
  const num = match ? Number(match[0]) : Number(text);
  return Number.isFinite(num) ? num : null;
}

export function _xmlCiiLineKeyRegexValue(value, pattern, groupIndex) {
  const text = _toText(value).trim();
  const patternText = _toText(pattern).trim();
  if (!text || !patternText) return text;
  return _regexGroup(text, patternText, groupIndex || 1) || text;
}

export function _xmlCiiNormalizeLineKey(value) { return _toText(value).trim().toUpperCase().replace(/\s+/g, ''); }

function _xmlCiiLineKeyAliases(value) {
  const compact = _xmlCiiNormalizeLineKey(value);
  if (!compact) return [];
  const withoutServicePrefix = compact.replace(/^[A-Z](?=\d{5,}$)/, '');
  return _uniqueKeys([compact, withoutServicePrefix]);
}

export function _lineListRowKey(row, config) {
  const mapped = computeLineNoKey(row, config.linelist?.fieldMap || {});
  const mappedClean = _xmlCiiNormalizeLineKey(mapped);
  if (mappedClean && !/^[A-Z]$/.test(mappedClean)) return mapped;
  const mappedSeq = _rowText(row, [config.linelist?.fieldMap?.lineSeqNo, 'lineSeqNo', 'Line number', 'Line Number', 'Line No']);
  if (mappedSeq) return mappedSeq;
  const key1 = _rowText(row, ['lineKey1', 'Key 1', 'ColumnX1', 'Service', 'Fluid']);
  const key2 = _rowText(row, ['lineKey2', 'Key 2', 'ColumnX2', 'Line number', 'Line Number', 'Line No']);
  if (key1 || key2) return `${key1}${key2}`;
  return _rowText(row, ['lineKey', 'LineNo', 'Line No', 'Line Number', 'PipelineReference']);
}

export function _xmlCiiFindLineListRow(branchLineKey, config) {
  const rows = Array.isArray(config.linelist?.masterRows) ? config.linelist.masterRows : [];
  const lookupKey = _xmlCiiNormalizeLineKey(branchLineKey);
  const lookupAliases = new Set(_xmlCiiLineKeyAliases(branchLineKey));
  const columnRegex = config.linelist?.linelistColumnRegex || '';
  const columnGroup = config.linelist?.linelistColumnGroup || 1;
  const aliasMatches = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rawKey = _lineListRowKey(row, config);
    const cleanKey = _xmlCiiNormalizeLineKey(_xmlCiiLineKeyRegexValue(rawKey, columnRegex, columnGroup));
    if (cleanKey && cleanKey === lookupKey) return { row, index };
    if (_xmlCiiLineKeyAliases(cleanKey).some((key) => lookupAliases.has(key))) aliasMatches.push({ row, index });
  }
  if (aliasMatches.length === 1) return aliasMatches[0];
  return null;
}

// --- Similar Linekey (fuzzy) fallback ---------------------------------------
// When the exact/alias line-key lookup misses (line key not derivable from the
// branch name, format drift, etc.) propose the closest line-list row instead:
//   1) locate the line sequence number inside the branch name and match it
//      against line-list candidates (From/To from the process master are
//      carried along for review);
//   2) fall back to isolating a line-key-looking token independently of the
//      Regex tab and fuzzy-matching it against row keys and From/To text.

export function _xmlCiiRowFromTo(row, config) {
  const fieldMap = config?.linelist?.fieldMap || {};
  const from = _rowText(row, [fieldMap.from, 'from', 'From', 'FROM', 'From (Origin)', 'Origin', 'FROM_EQUIP', 'From Equipment'].filter(Boolean));
  const to = _rowText(row, [fieldMap.to, 'to', 'To', 'TO', 'To (Destination)', 'Destination', 'TO_EQUIP', 'To Equipment'].filter(Boolean));
  return { from, to };
}

function _digitRuns(value, minLen = 4) {
  return (_toText(value).match(new RegExp(`\\d{${minLen},}`, 'g')) || []);
}

function _bigrams(value) {
  const s = _xmlCiiNormalizeLineKey(value);
  const out = [];
  for (let i = 0; i < s.length - 1; i += 1) out.push(s.slice(i, i + 2));
  return out;
}

export function _xmlCiiDiceSimilarity(a, b) {
  const ba = _bigrams(a);
  const bb = _bigrams(b);
  if (!ba.length || !bb.length) return 0;
  const counts = new Map();
  for (const g of ba) counts.set(g, (counts.get(g) || 0) + 1);
  let hits = 0;
  for (const g of bb) {
    const c = counts.get(g) || 0;
    if (c > 0) { hits += 1; counts.set(g, c - 1); }
  }
  return (2 * hits) / (ba.length + bb.length);
}

function _lineSeqScore(branchDigits, rowDigits) {
  let best = 0;
  for (const bd of branchDigits) {
    for (const rd of rowDigits) {
      if (bd === rd) best = Math.max(best, 1);
      else if (bd.includes(rd) || rd.includes(bd)) best = Math.max(best, 0.85);
      else if (bd.length >= 6 && rd.length >= 6 && bd.slice(-6) === rd.slice(-6)) best = Math.max(best, 0.7);
    }
  }
  return best;
}

function _isolateLineKeyToken(branchName, config) {
  const delimiter = config?.rating?.tokenDelimiter || config?.linelist?.tokenDelimiter || '-';
  const cleaned = _toText(branchName).replace(/^\/+/, '').replace(/\/B\d+$/i, '');
  const tokens = cleaned.split(delimiter).map((t) => t.trim()).filter(Boolean);
  // Prefer alphanumeric tokens that carry a long digit run and are not pure
  // size/material tokens — those are the usual line-key shapes.
  const candidates = tokens.filter((t) => !_looksLikeNpsToken(t) && !_isLikelyMaterialToken(t) && /\d{4,}/.test(t));
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] || '';
}

export function _xmlCiiFindSimilarLineListRow(branchName, lineKey, config) {
  const rows = Array.isArray(config?.linelist?.masterRows) ? config.linelist.masterRows : [];
  if (!rows.length) return null;
  const branchDigits = _digitRuns(branchName);
  const isolatedKey = _isolateLineKeyToken(branchName, config);
  const lookupKeys = _uniqueKeys([lineKey, isolatedKey]).filter(Boolean);

  let best = null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowKey = _lineListRowKey(row, config);
    const rowSeq = _rowText(row, [config?.linelist?.fieldMap?.lineSeqNo, 'lineSeqNo', 'Line number', 'Line Number', 'Line No'].filter(Boolean));
    const { from, to } = _xmlCiiRowFromTo(row, config);

    // Pass 1: line sequence number similarity.
    const seqScore = _lineSeqScore(branchDigits, _digitRuns(`${rowSeq} ${rowKey}`));
    // Pass 2: fuzzy line-key similarity (independent of the Regex tab).
    let keyScore = 0;
    for (const key of lookupKeys) keyScore = Math.max(keyScore, _xmlCiiDiceSimilarity(key, rowKey), _xmlCiiDiceSimilarity(key, rowSeq));
    const confidence = Math.max(seqScore, keyScore * 0.95);
    if (confidence <= (best?.confidence || 0.55)) continue;
    best = {
      row,
      index,
      confidence,
      method: seqScore >= keyScore * 0.95 ? 'similar-lineseq' : 'similar-linekey',
      proposedKey: _toText(rowKey).trim(),
      from,
      to,
    };
  }
  return best;
}

export function _normaliseLineListMatch(match, config) {
  if (!match?.row) return null;
  return { ...normalizeLineListRow(match.row, config.linelist?.fieldMap || {}, match.index), _raw: match.row };
}

export function _processDefaultValue(config, fieldKey) { return _toText(config?.processDefaults?.[fieldKey]).trim(); }
export function _resolveTemperatureRangeToMax(raw) {
  const s = _toText(raw).replace(/\s+/g, ' ').trim();
  if (!s || Number.isFinite(Number(s))) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:-|\/|to)\s*(-?\d+(?:\.\d+)?)$/i);
  if (m) return Math.max(Number(m[1]), Number(m[2]));
  const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  return nums.length >= 2 ? Math.max(...nums) : null;
}
export function _xmlCiiProcessValue(pdOverride, row, overrideKey, rowKeys, config) {
  if (pdOverride && Object.hasOwn(pdOverride, overrideKey)) return _toText(pdOverride[overrideKey]).trim();
  return _rowText(row, rowKeys) || _processDefaultValue(config, overrideKey);
}
export function _xmlCiiProcessSource(pdOverride, row, overrideKey, rowKeys, config) {
  if (pdOverride && Object.hasOwn(pdOverride, overrideKey)) return 'override';
  return _rowText(row, rowKeys) ? 'linelist' : (_processDefaultValue(config, overrideKey) ? 'default' : 'none');
}

export function _looksLikeNpsToken(value) { return /^\s*\d+(?:\.\d+)?\s*(?:"|in|inch|nps)?\s*$/i.test(_toText(value)); }
export function _numericFromSizeToken(value) { const n = Number(_toText(value).replace(/[^0-9.+-]/g, '')); return Number.isFinite(n) ? n : null; }
export function _isLikelyMaterialToken(value) { return /^(CS|SS|LTCS|DSS|SDSS|ALLOY|GI|CI|DI|PVC|CPVC|HDPE|GRP|GRE)$/i.test(_toText(value).trim()); }

export function _shiftedBranchTokens(branchName, delimiter = '-') {
  return {
    third: tokenAtPosition(branchName, delimiter, 3), fourth: tokenAtPosition(branchName, delimiter, 4),
    fifth: tokenAtPosition(branchName, delimiter, 5), sixth: tokenAtPosition(branchName, delimiter, 6),
    seventh: tokenAtPosition(branchName, delimiter, 7)
  };
}

export function _derivePipingClassFromBranchName(branchName, config) {
  const regexValue = _regexGroup(branchName, config.rating?.pipingClassRegex, config.rating?.pipingClassGroup || 1);
  if (regexValue) return regexValue;
  const delimiter = config.rating?.tokenDelimiter || config.linelist?.tokenDelimiter || '-';
  const index = Number(config.rating?.pipingClassTokenIndex || 5);
  const value = tokenAtPosition(branchName, delimiter, index);
  const shifted = _shiftedBranchTokens(branchName, delimiter);
  if (index === 5 && _isLikelyMaterialToken(value) && _looksLikeNpsToken(shifted.fourth) && /^S\d+/i.test(shifted.sixth)) return '';
  return value;
}

export function _deriveRatingFromPipingClass(pipingClass, config) {
  const text = _toText(pipingClass).trim().toUpperCase();
  const pair = (Array.isArray(config.rating?.ratingSequence) ? config.rating.ratingSequence : []).find(p => Array.isArray(p) && text.startsWith(_toText(p[0]).toUpperCase()));
  return pair ? _toText(pair[1]) : '';
}

export function _nominalDnFromNps(inches, config) {
  if (!Number.isFinite(inches)) return null;
  const map = config?.weight?.npsToDn || { '0.25': 8, '0.375': 10, '0.5': 15, '0.75': 20, '1': 25, '1.25': 32, '1.5': 40, '2': 50, '2.5': 65, '3': 80, '4': 100, '6': 150, '8': 200, '10': 250, '12': 300, '14': 350, '16': 400, '18': 450, '20': 500, '24': 600 };
  const mapped = Number(map[String(Number(inches))] ?? map[inches] ?? map[inches.toFixed(3)]);
  return Number.isFinite(mapped) ? mapped : inches * _toFiniteNumber(config?.weight?.inchToMm, 25.4);
}

const OD_TO_DN = [[10.3,6],[13.7,8],[17.1,10],[21.3,15],[26.7,20],[33.4,25],[42.2,32],[48.3,40],[60.3,50],[73.0,65],[88.9,80],[114.3,100],[141.3,125],[168.3,150],[219.1,200],[273.0,250],[273.1,250],[323.8,300],[323.9,300],[355.6,350],[406.4,400],[457.0,450],[457.2,450],[508.0,500],[609.6,600],[610.0,600],[711.0,700],[762.0,750]];
export function _nominalDnFromOd(od) {
  if (!Number.isFinite(od)) return null;
  let best = null;
  for (const [x, y] of OD_TO_DN) { const e = Math.abs(od - x); if (!best || e < best.err) best = { od: x, dn: y, err: e }; }
  return best && best.err <= Math.max(1.5, Math.abs(best.od) * 0.006) ? best.dn : od;
}
// XML-level fallback facts consumed by the branch process resolver when the
// piping class / line list masters have no matching row: the first node's
// MaterialName (mapped through the material map), CorrosionAllowance and
// WallThickness of the branch itself.
export function _branchXmlFallbackFacts(branch) {
  const facts = { material: '', corrosionAllowance: undefined, wallThickness: undefined };
  for (const node of _xmlChildrenByName(branch, 'Node')) {
    if (!facts.material) facts.material = _xmlText(node, 'MaterialName');
    if (facts.corrosionAllowance === undefined) {
      const corrosion = Number(_xmlText(node, 'CorrosionAllowance'));
      if (Number.isFinite(corrosion) && corrosion > 0) facts.corrosionAllowance = corrosion;
    }
    if (facts.wallThickness === undefined) {
      const wall = Number(_xmlText(node, 'WallThickness'));
      if (Number.isFinite(wall) && wall > 0) facts.wallThickness = wall;
    }
    if (facts.material && facts.corrosionAllowance !== undefined && facts.wallThickness !== undefined) break;
  }
  return facts;
}

export function _branchBoreFromFirstUsefulNode(branch) {
  for (const n of _xmlChildrenByName(branch, 'Node')) {
    const b = Number(_xmlText(n, 'BoreMm') || _xmlText(n, 'Bore'));
    if (Number.isFinite(b) && b > 0) return b;
    const od = Number(_xmlText(n, 'OuterDiameter') || _xmlText(n, 'OutsideDiameter') || _xmlText(n, 'OD'));
    if (Number.isFinite(od) && od > 0) { const d = _nominalDnFromOd(od); if (d && d > 0) return d; }
  }
  return null;
}

export function _deriveBoreFromBranchName(branchName, config) {
  const regexRaw = _regexGroup(branchName, config.weight?.boreRegex, config.weight?.boreGroup || 1);
  const delimiter = config.weight?.tokenDelimiter || config.linelist?.tokenDelimiter || '-';
  const index = Number(config.weight?.boreTokenIndex || 3);
  let raw = regexRaw || tokenAtPosition(branchName, delimiter, index);
  if (!_looksLikeNpsToken(raw) && index === 3) {
    const shifted = _shiftedBranchTokens(branchName, delimiter);
    if (_looksLikeNpsToken(shifted.fourth) && /^S\d+/i.test(shifted.sixth)) raw = shifted.fourth;
  }
  return _nominalDnFromNps(_numericFromSizeToken(raw), config);
}

export function _ratingKeys(row, derivedKey = '') { return _uniqueKeys([derivedKey, _classKey(row), row?.pipingClassDerived, row?.pipingClass, row?.lineKey, row?.branchName]); }
export function _ratingOverride(config, keys) { return _bucketText(config, 'rating', keys) || _processDataText(config, keys, 'rating'); }
export function _classKey(row) { const pc = _toText(row?.pipingClass || row?.pipingClassDerived).toUpperCase().replace(/\s+/g, ''); return pc ? `PC:${pc}` : ''; }
export function _classSizeKey(row) { const cls = _classKey(row), bore = Number(row?.sizeMm ?? _toText(row?.size).replace(/[^0-9.+-]/g, '')); return cls && Number.isFinite(bore) && bore > 0 ? `${cls}|DN:${Math.round(bore)}` : cls; }

export function _branchDtxrValues(branch, stagedIndex, config) {
  const values = [];
  for (const node of _xmlChildrenByName(branch, 'Node')) {
    for (const key of ['DTXR', 'DTXR_POS', 'TEEDESC_POS', 'DTXR_PS']) { const v = _xmlText(node, key); if (v) values.push(v); }
    const res = resolveXmlCiiNodeDtxr(node, stagedIndex, config); if (res?.value) values.push(res.value);
  }
  return _uniqueKeys(values);
}

export function _dtxrWallCandidateFromRow(row) {
  const value = Number(row?.dtxrWallThickness);
  if (!Number.isFinite(value) || value <= 0) return null;
  return {
    value: Number(value.toPrecision(6)).toString(),
    schedule: row?.dtxrWallSchedule || '',
    dtxr: row?.dtxrWallDtxr || '',
    source: row?.dtxrWallSource || '',
  };
}

export function _dtxrWallCandidateKeys(row) {
  return _uniqueKeys([row?.branchName, row?.lineKey, row?.wallThicknessKey, _classSizeKey(row)]);
}

export function _dtxrWallCandidateIndex(branchRows) {
  const index = new Map();
  let available = 0;
  for (const row of branchRows || []) {
    const candidate = _dtxrWallCandidateFromRow(row);
    if (!candidate) continue;
    available += 1;
    for (const key of _dtxrWallCandidateKeys(row)) if (!index.has(key)) index.set(key, candidate);
  }
  return { index, available };
}

export function _dtxrWallCandidateForRow(row, candidateIndex) {
  for (const key of _dtxrWallCandidateKeys(row)) {
    const candidate = candidateIndex.get(key);
    if (candidate) return candidate;
  }
  return null;
}

export function _uniqueKeys(values) {
  return [...new Set(values.map((value) => _toText(value).trim()).filter(Boolean))];
}

export function _hasOwn(obj, key) {
  return !!obj && Object.hasOwn(obj, key);
}

export function _overrideSource(overrides, bucket, key) {
  return _hasOwn(overrides?.[bucket], key) ? 'override' : 'auto';
}

export function _bucketText(config, bucketName, keys) {
  const bucket = config?.overrides?.[bucketName];
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return '';
  for (const key of _uniqueKeys(keys)) {
    if (_hasOwn(bucket, key) && _toText(bucket[key]).trim()) return _toText(bucket[key]).trim();
  }
  return '';
}

export function _processDataText(config, keys, fieldKey) {
  const bucket = config?.overrides?.processData;
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return '';
  for (const key of _uniqueKeys(keys)) {
    const value = bucket[key]?.[fieldKey];
    if (_toText(value).trim()) return _toText(value).trim();
  }
  return '';
}

export function xmlCiiDryRunPreview(xmlText, config, stagedJsonText, previewCache = null) {
  if (typeof DOMParser === 'undefined') return { branchRows: [], nodeRows: [] };
  let document;
  try {
    document = new DOMParser().parseFromString(_toText(xmlText), 'application/xml');
    if (document.getElementsByTagName('parsererror').length) return { branchRows: [], nodeRows: [] };
  } catch {
    return { branchRows: [], nodeRows: [] };
  }

  // Node Block Invariant Cleanup Sync (Parity with xml-cii-node-block-cleanup.js)
  const thresholdMm = Math.max(0, Number(config.shortElementLengthDropThresholdMm ?? 6));
  const dropGask = config.disableGasketNodes === true || config.disableGasketInOutput === true || (config.dropGasketNodes !== false && config.dropGasketsInEnrichment !== false);
  const dropShort = config.dropShortElementLengthNodes !== false && thresholdMm > 0;

  for (const node of [...document.getElementsByTagName('Node')]) {
    const componentType = _toText(_xmlText(node, 'ComponentType')).toUpperCase();
    const explicitLength = xmlCiiNumberText(_xmlText(node, 'ElementLengthMm'));
    const isGasket = dropGask && componentType === 'GASK';
    const isShort = dropShort && explicitLength !== null && explicitLength <= thresholdMm;
    if (isGasket || isShort) {
      node.parentNode?.removeChild(node);
    }
  }

  const branchRows = [];
  const nodeRows = [];
  const pipingClassIndex = previewCache?.getPipingClassIndex
    ? previewCache.getPipingClassIndex(config.pipingClass?.masterRows || [])
    : buildPipingClassIndex(config.pipingClass?.masterRows || []);
  const stagedIndex = buildStagedDtxrIndex(stagedJsonText || '', config);
  const materialMap = config.material?.mapRows || [];

  for (const branch of [...document.getElementsByTagName('Branch')]) {
    const branchName = _xmlText(branch, 'Branchname');
    const lineKey = deriveLineKeyFromBranchName(branchName, config);
    let lineListRawMatch = lineKey ? _xmlCiiFindLineListRow(lineKey, config) : null;
    let lineKeyMethod = lineListRawMatch ? 'exact' : 'none';
    let lineKeyConfidence = lineListRawMatch ? 1 : 0;
    let lineKeyProposed = '';
    if (!lineListRawMatch) {
      const similar = _xmlCiiFindSimilarLineListRow(branchName, lineKey, config);
      if (similar) {
        lineListRawMatch = { row: similar.row, index: similar.index };
        lineKeyMethod = similar.method;
        lineKeyConfidence = similar.confidence;
        lineKeyProposed = similar.proposedKey;
      }
    }
    const lineListMatch = _normaliseLineListMatch(lineListRawMatch, config);
    const lineFromTo = _xmlCiiRowFromTo(lineListMatch, config);
    const lineListClass = _rowText(lineListMatch, ['pipingClass', 'Piping Class', 'PIPING_CLASS']);
    const branchClass = _derivePipingClassFromBranchName(branchName, config);
    const derivedClassRaw = lineListClass || branchClass;
    const boreMm = _branchBoreFromFirstUsefulNode(branch) || _deriveBoreFromBranchName(branchName, config) || _rowNumber(lineListMatch, ['convertedBore', 'Bore', 'DN', 'NB']);
    const ratingKeys = _uniqueKeys([lineKey, branchName, derivedClassRaw]);
    const manualRating = _ratingOverride(config, ratingKeys);
    const rowRating = _rowText(lineListMatch, ['rating', 'Rating', 'RATING']);
    const inputRating = manualRating || rowRating || _deriveRatingFromPipingClass(derivedClassRaw, config);
    const resolverLineRow = { ...(lineListMatch || {}), pipingClass: derivedClassRaw };
    const branchXmlFacts = _branchXmlFallbackFacts(branch);
    const resolved = resolveBranchProcessData({ branchName, lineKey, lineRow: resolverLineRow, boreMm, componentType: 'PIPE', rating: inputRating, materialMap, pipingClassIndex, overrides: config.overrides || {}, xmlNode: branchXmlFacts, xmlBranch: branchXmlFacts, config });
    const branchRating = manualRating || resolved.rating || _deriveRatingFromPipingClass(resolved.pipingClass, config) || rowRating;
    const ratingSource = manualRating ? 'override' : _overrideSource(config.overrides, 'rating', lineKey);
    const pdOverride = (lineKey && config?.overrides?.processData?.[lineKey]) || {};

    const p1 = _xmlCiiProcessValue(pdOverride, lineListMatch, 'p1', ['p1', 'P1', 'Pressure1', 'Design Pressure', 'DesignPressure', 'Pressure Max kPa(g)', 'Pressure Max', 'PressureMax', 'P1 / Design Pressure'], config);
    const hydroPressure = _xmlCiiProcessValue(pdOverride, lineListMatch, 'hydroPressure', ['hydroPressure', 'hydro_pressure', 'HydroPressure', 'Hydro Test Pressure', 'Hydrotest Pressure', 'Hydro Pressure', 'Test Pressure', 'Pressure2', 'Hydro/Test Pressure'], config);
    const _hydroPressureSrcRaw = _xmlCiiProcessSource(pdOverride, lineListMatch, 'hydroPressure', ['hydroPressure', 'hydro_pressure', 'HydroPressure', 'Hydro Test Pressure', 'Hydrotest Pressure', 'Hydro Pressure', 'Test Pressure', 'Pressure2', 'Hydro/Test Pressure'], config);
    const hydroPressureFinal = hydroPressure || '0';
    const hydroPressureSourceFinal = hydroPressure ? _hydroPressureSrcRaw : 'default-zero';

    const _t1Raw = _xmlCiiProcessValue(pdOverride, lineListMatch, 't1', ['t1', 'T1', 'Temperature1', 'Design Temp', 'Design Temperature', 'Temp Max ºC', 'Temp Max °C', 'Temp Max', 'T1 (ºC)'], config);
    const _t2Raw = _xmlCiiProcessValue(pdOverride, lineListMatch, 't2', ['t2', 'T2', 'Temperature2', 'Temp. ºC', 'Temp. °C', 'Operating Temp', 'Operating Temperature', 'T2 (ºC)'], config);
    const _t3Raw = _xmlCiiProcessValue(pdOverride, lineListMatch, 't3', ['t3', 'T3', 'Temperature3', 'Temp Min ºC', 'Temp Min °C', 'Temp Min', 'Minimum Temp', 'T3 (ºC)'], config);

    const _t1Res = _resolveTemperatureRangeToMax(_t1Raw);
    const t1 = _t1Res !== null ? String(_t1Res) : _t1Raw;
    const t1RangeOrig = _t1Res !== null ? _t1Raw : null;

    const _t2Res = _resolveTemperatureRangeToMax(_t2Raw);
    const t2 = _t2Res !== null ? String(_t2Res) : _t2Raw;
    const t2RangeOrig = _t2Res !== null ? _t2Raw : null;

    const _t3Res = _resolveTemperatureRangeToMax(_t3Raw);
    const t3 = _t3Res !== null ? String(_t3Res) : _t3Raw;
    const t3RangeOrig = _t3Res !== null ? _t3Raw : null;

    const densityInfo = resolveLineListDensity(lineListMatch, pdOverride);
    const density = densityInfo.value || _processDefaultValue(config, 'density');
    const densitySource = densityInfo.value ? densityInfo.source : (_processDefaultValue(config, 'density') ? 'default' : 'none');

    const dtxrWall = resolveXmlCiiWallThicknessFromDtxr({ boreMm, dtxrValues: _branchDtxrValues(branch, stagedIndex, config), config });
    const wallThickness = resolved.wallThicknessMm != null ? Number(resolved.wallThicknessMm.toPrecision(6)).toString() : '';
    const corrosion = resolved.corrosionAllowanceMm != null ? String(resolved.corrosionAllowanceMm) : '';

    let matMethod = 'none';
    if (resolved.materialSource === 'override' || resolved.materialSource === 'override-material-map') matMethod = 'override';
    else if (resolved.materialSource === 'line-list-material-map' || resolved.materialSource === 'piping-class-material-map' || resolved.materialSource === 'piping-class-config-map' || resolved.materialSource === 'xml-material-map') matMethod = 'exact';
    else if (resolved.materialSource === 'xml-fallback') matMethod = 'xml-fallback';

    branchRows.push({
      branchName,
      lineKey,
      lineKeyMethod,
      lineKeyConfidence,
      lineKeyProposed,
      lineFrom: lineFromTo.from,
      lineTo: lineFromTo.to,
      lineMiss: !lineListMatch,
      size: boreMm != null ? `${boreMm}mm` : '',
      sizeMm: boreMm,
      pipingClass: resolved.pipingClass || '',
      pipingClassDerived: derivedClassRaw || '',
      pipingClassMethod: resolved.pipingClassMatchMethod,
      pipingClassConfidence: resolved.pipingClassConfidence,
      pipingClassScore: resolved.pipingClassScore,
      pipingClassRowScore: resolved.pipingClassRowScore,
      pipingClassRowReasons: resolved.pipingClassRowReasons || [],
      pipingClassNeedsReview: resolved.pipingClassNeedsReview,
      pipingClassCandidates: resolved.pipingClassCandidates || [],
      material: resolved.material || '',
      materialSource: resolved.materialSource || _overrideSource(config.overrides, 'material', lineKey),
      materialCode: resolved.materialCode || '',
      materialCodeMethod: matMethod,
      materialCodeNeedsReview: !resolved.materialCode,
      rating: branchRating || '',
      ratingDerived: resolved.rating || _deriveRatingFromPipingClass(resolved.pipingClass, config) || rowRating || '',
      ratingSource,
      p1,
      hydroPressure: hydroPressureFinal,
      t1,
      t2,
      t3,
      t1RangeOrig,
      t2RangeOrig,
      t3RangeOrig,
      density,
      p1Source: _xmlCiiProcessSource(pdOverride, lineListMatch, 'p1', ['p1', 'P1', 'Pressure1', 'Design Pressure', 'DesignPressure', 'Pressure Max kPa(g)', 'Pressure Max', 'PressureMax', 'P1 / Design Pressure'], config),
      hydroPressureSource: hydroPressureSourceFinal,
      t1Source: _xmlCiiProcessSource(pdOverride, lineListMatch, 't1', ['t1', 'T1', 'Temperature1', 'Design Temp', 'Design Temperature', 'Temp Max ºC', 'Temp Max °C', 'Temp Max', 'T1 (ºC)'], config),
      t2Source: _xmlCiiProcessSource(pdOverride, lineListMatch, 't2', ['t2', 'T2', 'Temperature2', 'Temp. ºC', 'Temp. °C', 'Operating Temp', 'Operating Temperature', 'T2 (ºC)'], config),
      t3Source: _xmlCiiProcessSource(pdOverride, lineListMatch, 't3', ['t3', 'T3', 'Temperature3', 'Temp Min ºC', 'Temp Min °C', 'Temp Min', 'Minimum Temp', 'T3 (ºC)'], config),
      densitySource,
      wallThickness,
      wallThicknessSource: (() => {
        const _wSrc = resolved.wallThicknessSource || _overrideSource(config.overrides, 'wallThickness', lineKey);
        const _wKey = resolved.wallThicknessKey;
        if (_wSrc !== 'override') return _wSrc;
        const _dtxrKeys = config.overrides?.__dtxrWallKeys;
        if (_dtxrKeys && _dtxrKeys[_wKey]) return 'dtxr-sch-applied';
        return previewOverrideProvenance(config.overrides, 'wallThickness', _wKey, _wSrc);
      })(),
      wallThicknessKey: resolved.wallThicknessKey || _classSizeKey({ pipingClass: resolved.pipingClass || derivedClassRaw, sizeMm: boreMm }),
      dtxrWallThickness: dtxrWall?.wallThicknessMm || '',
      dtxrWallSchedule: dtxrWall?.schedule || '',
      dtxrWallSource: dtxrWall?.source || '',
      dtxrWallDtxr: dtxrWall?.dtxr || '',
      corrosion,
      corrosionSource: previewOverrideProvenance(config.overrides, 'corrosion', resolved.corrosionKey, resolved.corrosionSource || _overrideSource(config.overrides, 'corrosion', lineKey)),
      corrosionKey: resolved.corrosionKey || _classKey({ pipingClass: resolved.pipingClass || derivedClassRaw }),
      materialCodeKey: resolved.materialCodeKey || _classKey({ pipingClass: resolved.pipingClass || derivedClassRaw })
    });

    _xmlCiiDryRunNodeRow({ branch, branchName, boreMm, branchRating, resolvedPipingClass: resolved.pipingClass, stagedIndex, config, nodeRows, previewCache });
  }
  return { branchRows, nodeRows };
}

function _xmlCiiDryRunNodeRow({ branch, branchName, boreMm, branchRating, resolvedPipingClass, stagedIndex, config, nodeRows, previewCache }) {
  let previousPosition = null;
  const branchNodes = _xmlChildrenByName(branch, 'Node');
  branchNodes.forEach((node, nodeIdx) => {
    const positionText = _xmlText(node, 'Position');
    const computedLengthMm = previousPosition ? _pointDistanceMm(previousPosition, positionText) : null;
    const explicitLengthMm = xmlCiiNumberText(_xmlText(node, 'ElementLengthMm'));
    const lengthMm = explicitLengthMm !== null ? explicitLengthMm : computedLengthMm;
    const nodeNumber = _xmlText(node, 'NodeNumber');
    const componentType = _xmlText(node, 'ComponentType');
    const weightEligible = isXmlCiiWeightReviewNode(node);
    const dtxrRes = weightEligible ? resolveXmlCiiNodeDtxr(node, stagedIndex, config) : { value: '', source: 'not-weight-eligible', matchedKey: '' };
    const ranking = (weightEligible && boreMm != null && branchRating && lengthMm != null) ? (previewCache?.rankWeight || rankXmlCiiWeightCandidates)({ boreMm, rating: branchRating, lengthMm, nodeName: _xmlText(node, 'NodeName'), componentType, componentRefNo: _xmlText(node, 'ComponentRefNo'), dtxr: dtxrRes.value || '' }, config, { includeRejected: true }) : { nodeHint: null, candidates: [], rejectedCandidates: [], best: null };
    const candidates = ranking.candidates.slice(0, 5);
    const weightKey = xmlCiiWeightReviewNodeOverrideKey(branchName, node, nodeIdx);
    const overrideWeight = Number(config?.overrides?.rigidWeight?.[weightKey]);
    const selectedWeight = Number.isFinite(overrideWeight) && overrideWeight > 0 ? overrideWeight : null;
    const selectedMatch = selectedWeight != null ? { ...(candidates[0] || {}), selectedWeight, suggestedWeight: selectedWeight, weight: selectedWeight, selectedOverride: true } : (ranking.best || null);

    if (weightEligible && (candidates.length || ranking.rejectedCandidates.length)) {
      nodeRows.push({
        key: weightKey,
        branchName,
        nodeNumber,
        componentType,
        boreMm,
        rating: branchRating,
        resolvedPipingClass,
        lengthMm,
        dtxr: dtxrRes.value || '',
        dtxrSource: dtxrRes.source || 'none',
        dtxrMatchedKey: dtxrRes.matchedKey || '',
        valveHint: formatValveHint(ranking.nodeHint),
        weightMatch: selectedMatch,
        weightCandidates: candidates,
        rejectedWeightCandidates: ranking.rejectedCandidates.slice(0, 3),
        componentRefNo: _xmlText(node, 'ComponentRefNo') || '',
        endpoint: _xmlText(node, 'Endpoint') || '',
        componentRefEndpoint: (() => {
          const ref = (_xmlText(node, 'ComponentRefNo') || '').replace(/^=/, '').trim();
          const ep = (_xmlText(node, 'Endpoint') || '').trim();
          return ref && ep ? `${ref}_${ep}` : ref;
        })()
      });
    }
    previousPosition = positionText || previousPosition;
  });
}
