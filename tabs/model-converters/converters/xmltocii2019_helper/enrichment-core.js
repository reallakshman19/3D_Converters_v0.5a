import { parseXmlCiiEnrichmentConfig } from '../../../../converters/xml-cii2019-core/config.js';
import { resolveXmlCiiNodeBoreFromOutsideDiameter } from '../../../../converters/xml-cii2019-core/od-bore-resolver.js';
import {
  DEFAULT_PIPING_CLASS_MASTER_URLS,
  loadXmlCiiMaterialMap,
  loadXmlCiiMasterRows,
  loadXmlCiiWeightMasterRows,
  prepareXmlCiiMasterContext,
} from '../../../../converters/xml-cii2019-core/master-context.js';
import { deriveLineKeyFromBranchName } from '../../../../converters/xml-cii2019-core/regex-line-key.js';
import { normalizeLineListRow } from '../../../../converters/xml-cii2019-core/linelist-mapping.js';
import { buildPipingClassIndex } from '../../../../converters/xml-cii2019-core/piping-class-resolver.js';
import { resolveBranchProcessData } from '../../../../converters/xml-cii2019-core/branch-process-resolver.js';
import { buildStagedDtxrIndex, resolveXmlCiiNodeDtxr } from '../../../../converters/xml-cii2019-core/dtxr-resolver.js';
import { xmlCiiDtxrPsForNode, xmlCiiDtxrPosForNode, buildStagedDtxrPositionIndex, xmlCiiCalibrateDtxrPositionIndex } from '../../../../converters/xml-cii2019-core/dtxr-resolver.js';
import {
  collectXmlCiiZeroRigidWeightIssues,
  applyXmlCiiRigidWeightOverrides,
  scoreXmlCiiWeightCandidates,
  xmlCiiRigidWeightOverrideKey,
  isXmlCiiRigidNode,
  xmlCiiNumberText,
  xmlCiiAncestorBranchName,
  xmlCiiRigidWeightOverrideForNode,
  xmlCiiForwardElementLengths,
  buildStagedComponentIndex,
  stagedComponentForXmlNode
} from '../../../../converters/xml-cii2019-core/weight-match-model.js';
import {
  buildStagedSupportIndex,
  calibrateStagedSupportIndexCoordinates,
  xmlCiiRestraintEntriesFromSupportMatch,
  xmlCiiTypeEntryFromExistingRestraint,
  dedupeXmlCiiRestraintEntries,
  applyXmlRestraints
} from '../../../../converters/xml-cii2019-core/support-mapping.js';

export {
  DEFAULT_PIPING_CLASS_MASTER_URLS,
  loadXmlCiiMaterialMap,
  loadXmlCiiMasterRows,
  loadXmlCiiWeightMasterRows,
  prepareXmlCiiMasterContext,
};

function xmlLocalName(node) {
  const name = node?.localName || node?.nodeName || '';
  return String(name).replace(/^.*:/, '');
}

function xmlChildrenByName(parent, localName) {
  return [...(parent?.childNodes || [])].filter((child) => child.nodeType === 1 && xmlLocalName(child) === localName);
}

function xmlFirstChild(parent, localName) {
  return xmlChildrenByName(parent, localName)[0] || null;
}

function xmlText(parent, localName) {
  const child = xmlFirstChild(parent, localName);
  return String(child?.textContent || '').trim();
}

function xmlSetText(document, parent, localName, value) {
  let element = xmlFirstChild(parent, localName);
  if (!element) {
    element = parent?.namespaceURI
      ? document.createElementNS(parent.namespaceURI, localName)
      : document.createElement(localName);
    parent.appendChild(element);
  }
  element.textContent = String(value);
  return element;
}

function normalizePoint(point) {
  if (point === undefined || point === null || point === '') return null;
  if (Array.isArray(point) && point.length >= 3) {
    const x = Number(point[0]);
    const y = Number(point[1]);
    const z = Number(point[2]);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
  }
  if (typeof point === 'object') {
    const x = Number(point.x ?? point.X);
    const y = Number(point.y ?? point.Y);
    const z = Number(point.z ?? point.Z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x, y, z };
  }
  const text = String(point).trim();
  if (!text) return null;
  const tokens = text.split(/\s+/g);
  const directional = { x: 0, y: 0, z: 0 };
  let parsedDirectional = false;
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = tokens[i].toUpperCase();
    const val = parseNumericMm(tokens[i + 1]);
    if (!Number.isFinite(val)) continue;
    if (axis === 'E') { directional.x = val; parsedDirectional = true; }
    else if (axis === 'W') { directional.x = -val; parsedDirectional = true; }
    else if (axis === 'N') { directional.y = val; parsedDirectional = true; }
    else if (axis === 'S') { directional.y = -val; parsedDirectional = true; }
    else if (axis === 'U') { directional.z = val; parsedDirectional = true; }
    else if (axis === 'D') { directional.z = -val; parsedDirectional = true; }
  }
  if (parsedDirectional) return directional;
  const values = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function xmlPositionKey(positionText, tolerance) {
  const point = normalizePoint(positionText);
  if (!point) return '';
  const tol = toFiniteNumber(tolerance, 1) || 1;
  return [point.x, point.y, point.z].map((val) => Math.round(val / tol)).join('|');
}

// Helper utilities
function toText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return fallback;
}

function parseNumericMm(value) {
  const text = toText(value).replace(/mm/gi, ' ').trim();
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function rowNumber(row, keys) {
  for (const key of keys) {
    const direct = row?.[key];
    const raw = row?._raw?.[key];
    const numeric = parseNumericMm(direct ?? raw);
    if (numeric !== null) return numeric;
  }
  return null;
}

function rowText(row, keys) {
  for (const key of keys) {
    const value = row?.[key] ?? row?._raw?.[key];
    if (toText(value).trim()) return toText(value).trim();
  }
  return '';
}

function stagedComponentDtxr(indexed) {
  const attrs = indexed?.attrs || {};
  return toText(attrs.DTXR_POS || attrs.DTXR || attrs.DESC || attrs.DESCRIPTION || attrs.NAME || indexed?.component?.name || '').trim();
}

function stagedAttrValue(attrs, names) {
  for (const name of names || []) {
    const normalizedName = toText(name).toUpperCase();
    for (const [key, value] of Object.entries(attrs || {})) {
      if (toText(key).toUpperCase() === normalizedName && toText(value).trim()) return value;
    }
  }
  return '';
}

function xmlElementTextMap(parent) {
  const out = {};
  for (const child of [...(parent?.childNodes || [])]) {
    if (child.nodeType === 1) out[child.localName || child.nodeName] = toText(child.textContent).trim();
  }
  return out;
}

function xmlEnsureChild(document, parent, localName) {
  let element = xmlFirstChild(parent, localName);
  if (element) return element;
  element = parent?.namespaceURI
    ? document.createElementNS(parent.namespaceURI, localName)
    : document.createElement(localName);
  parent.appendChild(element);
  return element;
}

// Customization algorithms
function xcNorm(value) {
  return toText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function xcTokens(value) {
  return new Set(xcNorm(value).split(' ').filter(Boolean));
}

function xcJaccard(a, b) {
  const ta = xcTokens(a);
  const tb = xcTokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

function xcRatio(a, b) {
  const x = xcNorm(a);
  const y = xcNorm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const longer = x.length >= y.length ? x : y;
  const shorter = x.length >= y.length ? y : x;
  return longer.includes(shorter) ? shorter.length / longer.length : xcJaccard(x, y);
}

function xcOverride(overrides, kind, key) {
  const bucket = overrides?.[kind];
  if (!bucket || typeof bucket !== 'object') return null;
  const nk = xcNorm(key);
  for (const k of Object.keys(bucket)) if (xcNorm(k) === nk) return bucket[k];
  return null;
}

export function xmlCiiKnownClasses(config) {
  const rows = Array.isArray(config.pipingClass?.masterRows) ? config.pipingClass.masterRows : [];
  return [...new Set(rows.map((r) => rowText(r, ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'Class'])).filter(Boolean))];
}

export function xmlCiiApproximateClass(derived, config) {
  const ov = xcOverride(config.overrides, 'pipingClass', derived);
  if (ov != null && toText(ov) !== '') return { pipingClass: toText(ov), method: 'override', confidence: 1, needsReview: false };
  const d = xcNorm(derived);
  const classes = xmlCiiKnownClasses(config);
  if (!d || !classes.length) return { pipingClass: derived || null, method: 'none', confidence: 0, needsReview: true };
  for (const c of classes) if (xcNorm(c) === d) return { pipingClass: c, method: 'exact', confidence: 1, needsReview: false };
  const reviewBelow = toFiniteNumber(config.pipingClass?.reviewBelow, 1);
  const sw = classes.filter((c) => xcNorm(c).startsWith(d) || d.startsWith(xcNorm(c)));
  if (sw.length === 1) {
    const conf = toFiniteNumber(config.pipingClass?.startsWithConfidence, 0.8);
    return { pipingClass: sw[0], method: 'startsWith', confidence: conf, needsReview: conf < reviewBelow };
  }
  if (sw.length > 1) return { pipingClass: null, method: 'ambiguous', confidence: toFiniteNumber(config.pipingClass?.startsWithConfidence, 0.8), needsReview: true, candidates: sw };
  let best = null;
  let bestS = 0;
  for (const c of classes) {
    const s = xcRatio(d, c);
    if (s > bestS) {
      best = c;
      bestS = s;
    }
  }
  if (best && bestS >= toFiniteNumber(config.pipingClass?.fuzzyThreshold, 0.6)) return { pipingClass: best, method: 'fuzzy', confidence: bestS, needsReview: bestS < reviewBelow };
  return { pipingClass: null, method: 'none', confidence: bestS, needsReview: true };
}

export function findPipingClassMaster({ pipingClass, boreMm }, config) {
  const rows = Array.isArray(config.pipingClass?.masterRows) ? config.pipingClass.masterRows : [];
  if (!rows.length || !pipingClass) return null;
  const want = xcNorm(pipingClass);
  for (const row of rows) {
    if (xcNorm(rowText(row, ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'Class'])) !== want) continue;
    const rBore = rowNumber(row, ['convertedBore', 'Converted Bore', 'DN', 'NB', 'Size', 'bore', 'Bore']);
    if (boreMm != null && rBore != null && Math.abs(rBore - boreMm) >= 1) continue;
    return {
      wallThickness: rowText(row, ['Wall thickness', 'Wall Thickness', 'wallThickness', 'WT']),
      corrosion: rowText(row, ['Corrosion', 'corrosionAllowance', 'Corrosion Allowance', 'CA']),
      materialName: rowText(row, ['Material_Name', 'Material', 'material']),
      rating: rowText(row, ['Rating', 'rating']),
    };
  }
  return null;
}

export function xmlCiiResolveMaterialCode(materialName, config) {
  const ov = xcOverride(config.overrides, 'material', materialName);
  if (ov != null && toText(ov) !== '') return { code: toText(ov), method: 'override', confidence: 1, needsReview: false };
  const rows = Array.isArray(config.material?.mapRows) ? config.material.mapRows : [];
  const n = xcNorm(materialName);
  if (!n || !rows.length) return { code: null, method: 'none', confidence: 0, needsReview: !!materialName };
  for (const r of rows) if (xcNorm(r.material) === n) return { code: toText(r.code), method: 'exact', confidence: 1, needsReview: false };
  let best = null;
  const containsConf = toFiniteNumber(config.material?.containsConfidence, 0.9);
  for (const r of rows) {
    const c = xcNorm(r.material);
    if (c && (c.includes(n) || n.includes(c))) {
      if (!best || containsConf > best.confidence) best = { code: toText(r.code), method: 'contains', confidence: containsConf };
    }
  }
  if (best) return { ...best, needsReview: best.confidence < 1 };
  const thr = toFiniteNumber(config.material?.tokenJaccardThreshold, 0.35);
  for (const r of rows) {
    const j = xcJaccard(n, r.material);
    if (j >= thr && (!best || j > best.confidence)) best = { code: toText(r.code), method: 'token-jaccard', confidence: j };
  }
  return best ? { ...best, needsReview: best.confidence < 1 } : { code: null, method: 'none', confidence: 0, needsReview: true };
}

export function deriveRatingText(attrs, config, derivedPipingClass = '') {
  const direct = stagedAttrValue(attrs, config.rating?.sourceFields || []);
  const text = toText(direct);
  const explicit = text.match(/(?:RATING|CLASS|CL)\s*[:=\-/ ]*([0-9]{2,4})/i);
  if (explicit) return explicit[1];
  const hash = text.match(/([0-9]{2,4})\s*#/);
  if (hash) return hash[1];
  const fromClass = deriveRatingFromPipingClass(derivedPipingClass || text, config);
  return fromClass || text;
}

export function deriveWeightText(attrs, config) {
  const raw = stagedAttrValue(attrs, config.weight?.sourceFields || []);
  const text = toText(raw).trim();
  if (!text) return '';
  const match = text.match(/-?\d+(?:\.\d+)?(?:\s*kg)?/i);
  return match ? match[0].replace(/\s+/g, '') : text;
}

export function diagnosticRowsForTable(diagnostics) {
  return (Array.isArray(diagnostics) ? diagnostics : []).map((item) => ({
    type: item?.type || '',
    nodeNumber: item?.nodeNumber || item?.keptNode || item?.removedNode || '',
    branchName: item?.branchName || '',
    pipingClass: item?.pipingClass || '',
    rating: item?.rating || '',
    boreMm: item?.boreMm == null ? '' : Number(item.boreMm).toFixed ? Number(item.boreMm).toFixed(3) : item.boreMm,
    lengthMm: item?.lengthMm == null ? '' : Number(item.lengthMm).toFixed ? Number(item.lengthMm).toFixed(3) : item.lengthMm,
    weight: item?.weight ?? '',
    method: item?.method || item?.reason || item?.source || '',
    kind: item?.kind || '',
    componentType: item?.componentType || '',
    matchedBy: item?.matchedBy || '',
    matchedKey: item?.matchedKey || '',
    sourcePath: item?.sourcePath || '',
    jsonNodeNo: item?.jsonNodeNo || '',
    finalValue: item?.finalValue || item?.dtxrPos || item?.dtxrPs || item?.restraintTypes || item?.kind || '',
    oldValue: item?.oldValue || '',
    status: item?.status || '',
    tags: Array.isArray(item?.tags) ? item.tags.join('|') : (item?.tags || ''),
    message: item?.message || item?.stagedName || item?.url || item?.reason || '',
  }));
}

// Linelist matching helpers
function xmlCiiNormalizeLineKey(value) {
  return toText(value).trim().toUpperCase().replace(/\s+/g, '');
}

function regexGroup(text, pattern, groupIndex = 1) {
  const source = toText(text);
  const patternText = toText(pattern).trim();
  if (!source || !patternText) return '';
  try {
    const match = new RegExp(patternText, 'i').exec(source);
    const index = Math.max(0, Number(groupIndex || 0));
    return toText(match?.[index] || '').trim();
  } catch {
    return '';
  }
}

function xmlCiiLineKeyRegexValue(value, pattern, groupIndex) {
  const text = toText(value).trim();
  const patternText = toText(pattern).trim();
  if (!text || !patternText) return text;
  const regexHit = regexGroup(text, patternText, groupIndex || 1);
  return regexHit || text;
}

export function xmlCiiFindLineListRow(branchLineKey, config) {
  const rows = Array.isArray(config.linelist?.masterRows) ? config.linelist.masterRows : [];
  if (!rows.length) return null;
  const lookupKey = xmlCiiNormalizeLineKey(branchLineKey);
  const columnRegex = config.linelist?.linelistColumnRegex || '';
  const columnGroup = config.linelist?.linelistColumnGroup || 1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rawKey = rowText(row, ['lineNo', 'lineKey', 'LineNo', 'Line No', 'PipelineReference']);
    const cleanKey = xmlCiiNormalizeLineKey(xmlCiiLineKeyRegexValue(rawKey, columnRegex, columnGroup));
    if (cleanKey && cleanKey === lookupKey) return normalizeLineListRow(row, config.linelist?.fieldMap || {}, index);
  }
  return null;
}

function xmlCiiProcessValue(pdOverride, row, overrideKey, rowKeys) {
  if (pdOverride && Object.prototype.hasOwnProperty.call(pdOverride, overrideKey)) {
    const overrideText = toText(pdOverride[overrideKey]).trim();
    if (overrideText !== '') return overrideText;
  }
  return rowText(row, rowKeys);
}

export function xmlCiiApplyLineListProcessData(document, branch, row, config, branchLineKey) {
  if (!row) return 0;
  let count = 0;
  const rowLineKey = rowText(row, ['lineNo', 'lineSeqNo', 'lineKey']) || '';
  const lineKey = branchLineKey || rowLineKey;
  const pdOverride = (lineKey && config?.overrides?.processData?.[lineKey]) || {};
  const p1 = xmlCiiProcessValue(pdOverride, row, 'p1', ['p1', 'P1']);
  const hydro = xmlCiiProcessValue(pdOverride, row, 'hydroPressure', ['hydroPressure', 'Hydro Test Pressure', 'Hydrotest Pressure', 'Hydro Pressure', 'Hydro Pr', 'Hyd Test Pr', 'Hyd. Test Pressure', 'Test Pressure', 'TEST_PRESSURE', 'HYDRO_TEST_PRESSURE', 'Pressure Test', 'Proof Pressure']);
  const t1 = xmlCiiProcessValue(pdOverride, row, 't1', ['t1', 'T1']);
  const t2 = xmlCiiProcessValue(pdOverride, row, 't2', ['t2', 'T2', 'Temperature2', 'Temperature 2', 'Temp', 'Temp. C', 'Temp °C']);
  const t3 = xmlCiiProcessValue(pdOverride, row, 't3', ['t3', 'T3', 'Temperature3', 'Temperature 3', 'Temp Min', 'Temp Min C', 'Temp Min °C', 'Min']);
  const insThk = xmlCiiProcessValue(pdOverride, row, 'insThk', ['insThk', 'InsThk']);
  const density = xmlCiiProcessValue(pdOverride, row, 'density', ['density', 'Density']);
  
  const pressure = xmlEnsureChild(document, branch, 'Pressure');
  if (p1) {
    xmlSetText(document, pressure, 'Pressure1', p1);
    count += 1;
  }
  if (hydro) {
    xmlSetText(document, pressure, 'HydroPressure', hydro);
    count += 1;
  } else {
    const _existingHydroEl = xmlFirstChild(pressure, 'HydroPressure');
    if (!_existingHydroEl || !String(_existingHydroEl.textContent).trim()) {
      xmlSetText(document, pressure, 'HydroPressure', '0');
    }
  }
  
  const temperature = xmlEnsureChild(document, branch, 'Temperature');
  if (t1) {
    xmlSetText(document, temperature, 'Temperature1', t1);
    count += 1;
  }
  if (t2) {
    xmlSetText(document, temperature, 'Temperature2', t2);
    count += 1;
  }
  if (t3) {
    xmlSetText(document, temperature, 'Temperature3', t3);
    count += 1;
  }
  if (insThk) {
    xmlSetText(document, branch, 'InsulationThickness', insThk);
    xmlSetText(document, branch, 'InsulationDensity', insThk);
    count += 1;
  }
  if (density) {
    xmlSetText(document, branch, 'FluidDensity', density);
    count += 1;
  }
  return count;
}

// Branch attributes derivation
function branchTokens(branchName, delimiter = '-') {
  const cleaned = toText(branchName).trim().replace(/^\/+/, '').replace(/\/B\d+$/i, '');
  const delim = toText(delimiter) || '-';
  return cleaned.split(delim).map((token) => token.trim()).filter(Boolean);
}

function tokenAtPosition(branchName, delimiter, oneBasedIndex) {
  const index = Number(oneBasedIndex);
  if (!Number.isFinite(index) || index <= 0) return '';
  return branchTokens(branchName, delimiter)[Math.round(index) - 1] || '';
}

export function derivePipingClassFromBranchName(branchName, config) {
  const spec = config.rating?.pipingClassTokenIndex || 5;
  const delimiter = config.rating?.tokenDelimiter || '-';
  const raw = regexGroup(branchName, config.rating?.pipingClassRegex, config.rating?.pipingClassGroup || 1)
    || tokenAtPosition(branchName, delimiter, spec);
  return raw;
}

export function deriveRatingFromPipingClass(pipingClass, config) {
  const pc = xcNorm(pipingClass);
  if (!pc || !config.rating?.ratingSequence) return '';
  for (const [pattern, rating] of config.rating.ratingSequence) {
    if (pc.includes(xcNorm(pattern))) return toText(rating);
  }
  return '';
}

export function deriveBoreFromBranchName(branchName, config) {
  const raw = regexGroup(branchName, config.weight?.boreRegex, config.weight?.boreGroup || 1)
    || tokenAtPosition(branchName, config.weight?.tokenDelimiter || '-', config.weight?.boreTokenIndex || 3);
  
  // Clean size token
  const match = toText(raw).match(/\d+(?:\.\d+)?/);
  const sizeText = match ? match[0] : '';
  const num = Number(sizeText);
  if (!Number.isFinite(num) || num <= 0) return null;
  const isInch = config.weight?.masterLengthUnit !== 'mm' && !toText(raw).includes('mm');
  if (isInch) {
    const factor = toFiniteNumber(config.weight?.inchToMm, 25.4);
    const mmVal = num * factor;
    // Map to nominal DN if possible
    const mapping = config.weight?.npsToDn || {};
    const exact = mapping[sizeText];
    if (exact) return Number(exact);
    return mmVal;
  }
  return num;
}

// Core enrichXmlForCii2019 implementation
export async function enrichXmlForCii2019(xmlTextVal, stagedJsonText, options = {}) {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new Error('XML enrichment requires browser DOMParser/XMLSerializer support.');
  }
  const config = parseXmlCiiEnrichmentConfig(options.supportConfigJson);
  const parser = new DOMParser();
  const document = parser.parseFromString(toText(xmlTextVal), 'application/xml');
  const parseErrors = document.getElementsByTagName('parsererror');
  if (parseErrors.length) throw new Error(`Unable to parse XML for enrichment: ${toText(parseErrors[0].textContent).slice(0, 160)}`);

  const diagnostics = [];
  await loadXmlCiiWeightMasterRows(config, diagnostics);
  await loadXmlCiiMasterRows(config.pipingClass, [], 'piping-class', diagnostics);
  await loadXmlCiiMaterialMap(config, diagnostics);
  let stagedSupportIndex = buildStagedSupportIndex(stagedJsonText, config, diagnostics);
  const stagedComponentIndex = buildStagedComponentIndex(stagedJsonText, config);
  let stagedDtxrPositionIndex = buildStagedDtxrPositionIndex(stagedJsonText, config);
  stagedDtxrPositionIndex = xmlCiiCalibrateDtxrPositionIndex(stagedDtxrPositionIndex, document, config);
  const stagedDtxrRefIndex = buildStagedDtxrIndex(stagedJsonText, config);
  if (stagedDtxrPositionIndex?.inferredOffset) {
    stagedSupportIndex = calibrateStagedSupportIndexCoordinates(stagedSupportIndex, stagedDtxrPositionIndex.inferredOffset, config);
    diagnostics.push({
      type: 'dtxr-position-offset-calibrated',
      samples: stagedDtxrPositionIndex.calibration?.samples || 0,
      uniqueTags: stagedDtxrPositionIndex.calibration?.uniqueTags || 0,
      xOffset: stagedDtxrPositionIndex.inferredOffset.x,
      yOffset: stagedDtxrPositionIndex.inferredOffset.y,
      zOffset: stagedDtxrPositionIndex.inferredOffset.z,
    });
  }
  const tolerance = toFiniteNumber(config.coordinateTolerance, 1);
  const stats = { removedDuplicateSupports: 0, normalizedRestraints: 0, stagedSupportsMapped: 0, dtxrPsAnnotations: 0, dtxrPosAnnotations: 0, branchLineKeys: 0, lineListMatches: 0, processAnnotations: 0, ratingAnnotations: 0, weightAnnotations: 0 };
  diagnostics.push({ type: 'config', duplicateSupportPolicy: config.duplicateSupportPolicy, coordinateTolerance: tolerance, rating: config.rating, weight: { ...config.weight, masterRows: Array.isArray(config.weight?.masterRows) ? `${config.weight.masterRows.length} row(s)` : 'none' } });

  const pipingClassIndex = buildPipingClassIndex(config.pipingClass?.masterRows || []);
  const materialMap = config.material?.mapRows || [];

  for (const branch of [...document.getElementsByTagName('Branch')]) {
    const branchName = xmlText(branch, 'Branchname');
    const lineKey = deriveLineKeyFromBranchName(branchName, config);
    const lineListMatch = lineKey ? xmlCiiFindLineListRow(lineKey, config) : null;
    if (lineKey) {
      xmlSetText(document, branch, 'PipelineReference', lineKey);
      xmlSetText(document, branch, 'LineNo', lineKey);
      stats.branchLineKeys += 1;
    }
    if (lineListMatch) {
      stats.lineListMatches += 1;
      stats.processAnnotations += xmlCiiApplyLineListProcessData(document, branch, lineListMatch, config, lineKey);
      diagnostics.push({ type: 'linelist-match', branchName, lineKey, lineSeqNo: lineListMatch.lineSeqNo || '', p1: lineListMatch.p1 || '', t1: lineListMatch.t1 || '', t2: lineListMatch.t2 || '', t3: lineListMatch.t3 || '', density: lineListMatch.density || '' });
    } else if (lineKey) {
      const pdOverride = config?.overrides?.processData?.[lineKey];
      if (pdOverride) {
        xmlCiiApplyLineListProcessData(document, branch, pdOverride, config, lineKey);
        diagnostics.push({ type: 'process-override', branchName, lineKey, p1: pdOverride.p1 || '', t1: pdOverride.t1 || '', t2: pdOverride.t2 || '', t3: pdOverride.t3 || '', density: pdOverride.density || '' });
      }
    }

    const nodes = xmlChildrenByName(branch, 'Node');
    const groups = new Map();
    for (const node of nodes) {
      if (xmlText(node, 'ComponentType').toUpperCase() !== 'ATTA') continue;
      const key = xmlPositionKey(xmlText(node, 'Position'), tolerance);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(node);
    }
    for (const group of groups.values()) {
      if (group.length <= 1 || toText(config.duplicateSupportPolicy).toLowerCase() !== 'prefer_datum') continue;
      const datumNode = group.find((node) => xmlText(node, 'NodeName').toUpperCase().includes('DATUM'));
      const restrainedNode = group.find((node) => !!xmlFirstChild(node, 'Restraint'));
      const keepNode = datumNode || restrainedNode || group[0];
      for (const node of group) {
        if (node !== keepNode && node.parentNode) {
          node.parentNode.removeChild(node);
          stats.removedDuplicateSupports += 1;
          diagnostics.push({ type: 'duplicate-support-removed', keptNode: xmlText(keepNode, 'NodeNumber'), removedNode: xmlText(node, 'NodeNumber'), position: xmlText(node, 'Position'), reason: datumNode ? 'DATUM' : restrainedNode ? 'restrained-node' : 'first-node' });
        }
      }
    }

    const derivedClassRaw = derivePipingClassFromBranchName(branchName, config) || rowText(lineListMatch, ['pipingClass', 'PipingClass']);
    const branchBore = deriveBoreFromBranchName(branchName, config) || rowNumber(lineListMatch, ['convertedBore', 'Bore']);

    // Use unified branch-process resolver
    const resolved = resolveBranchProcessData({
      branchName,
      lineKey,
      lineRow: lineListMatch,
      boreMm: branchBore,
      componentType: 'PIPE',
      rating: deriveRatingFromPipingClass(derivedClassRaw, config) || rowText(lineListMatch, ['rating', 'Rating']),
      materialMap,
      pipingClassIndex,
      overrides: config.overrides || {},
      xmlNode: null,
      xmlBranch: branch,
      config
    });

    const pipingClass = resolved.pipingClass || derivedClassRaw;
    const pcMaster = resolved.pipingClassMatchedRow;
    const branchRating = resolved.pipingClassMatchedRow?.rating || deriveRatingFromPipingClass(pipingClass, config) || rowText(lineListMatch, ['rating', 'Rating']);

    if (pcMaster || resolved.pipingClassMatchMethod !== 'none') {
      diagnostics.push({
        type: 'class-master-match',
        branchName,
        derivedClass: derivedClassRaw,
        pipingClass,
        classMethod: resolved.pipingClassMatchMethod,
        classConfidence: resolved.pipingClassConfidence,
        wallThickness: resolved.wallThicknessMm ? String(resolved.wallThicknessMm) : '',
        corrosion: resolved.corrosionAllowanceMm != null ? String(resolved.corrosionAllowanceMm) : '',
        materialName: resolved.material || '',
        materialCode: resolved.materialCode || '',
        materialMethod: resolved.materialSource === 'override' ? 'override' : (resolved.materialSource === 'line-list-material-map' || resolved.materialSource === 'piping-class-material-map' ? 'exact' : resolved.materialSource),
        needsReview: resolved.pipingClassNeedsReview || (!resolved.materialCode && !!resolved.material)
      });
    }
    diagnostics.push({ type: 'branch-derived', branchName, pipingClass, rating: branchRating, boreMm: branchBore, processParameters: { temperature: xmlElementTextMap(xmlFirstChild(branch, 'Temperature')), pressure: xmlElementTextMap(xmlFirstChild(branch, 'Pressure')) } });
    const branchNodeList = xmlChildrenByName(branch, 'Node');
    const forwardLengths = xmlCiiForwardElementLengths(branchNodeList);
    branchNodeList.forEach((node, nodeIdx) => {
      const lengthMm = forwardLengths[nodeIdx];
      if (pipingClass) xmlSetText(document, node, 'PipingClass', pipingClass);
      if (branchRating) {
        xmlSetText(document, node, 'Rating', branchRating);
        stats.ratingAnnotations += 1;
      }
      // A branch can contain a reducer. Each node's OutsideDiameter is more
      // specific than its branch-name nominal bore; preserve the old branch
      // fallback only when this node has no recognized OD evidence.
      const nodeBore = resolveXmlCiiNodeBoreFromOutsideDiameter(
        xmlText(node, 'OutsideDiameter'), branchBore);
      if (nodeBore != null) xmlSetText(document, node, 'BoreMm', nodeBore.toFixed(3));
      if (lengthMm !== null) xmlSetText(document, node, 'ElementLengthMm', lengthMm.toFixed(3));

      if (resolved.wallThicknessMm) {
        xmlSetText(document, node, 'WallThickness', Number(resolved.wallThicknessMm.toPrecision(6)).toString());
      }
      if (resolved.corrosionAllowanceMm != null) {
        xmlSetText(document, node, 'CorrosionAllowance', String(resolved.corrosionAllowanceMm));
      }
      if (resolved.material) {
        xmlSetText(document, node, 'MaterialName', resolved.material);
      }
      if (resolved.materialCode) {
        xmlSetText(document, node, 'MaterialCode', resolved.materialCode);
        // Also write to branch-level MaterialNumber (CII native field)
        xmlSetText(document, branch, 'MaterialNumber', resolved.materialCode);
      }
      if (pcMaster) {
        stats.classMasterAnnotations = (stats.classMasterAnnotations || 0) + 1;
      }
      const manualRigidWeight = xmlCiiRigidWeightOverrideForNode(branchName, node, config, nodeIdx);
      if (manualRigidWeight !== null) {
        xmlSetText(document, node, 'Weight', String(manualRigidWeight));
        stats.weightAnnotations += 1;
        diagnostics.push({ type: 'rigid-weight-manual-override', nodeNumber: xmlText(node, 'NodeNumber'), branchName, boreMm: branchBore, rating: branchRating, lengthMm, weight: manualRigidWeight });
      }
    });
  }

  for (const node of [...document.getElementsByTagName('Node')]) {
    const componentType = xmlText(node, 'ComponentType').toUpperCase();
    const positionKey = xmlPositionKey(xmlText(node, 'Position'), tolerance);
    const coordMatches = positionKey ? (stagedSupportIndex.byCoord.get(positionKey) || []) : [];
    const supportTags = xmlNodeSupportTags(node);
    const tagMatches = supportTags.flatMap((tag) => stagedSupportIndex.byTag.get(tag) || []);
    const relaxedTagMatches = tagMatches.length ? [] : relaxedSameDtxrPosSupportMatches(supportTags, coordMatches);
    
    const stagedMatches = coordMatches.length > 0
      ? coordMatches
      : (tagMatches.length > 0 ? tagMatches : relaxedTagMatches);
    const supportMatchMethod = coordMatches.length > 0
      ? 'dtxr-pos-coordinate'
      : (tagMatches.length > 0 ? 'dtxr-ps-tag-fallback' : (relaxedTagMatches.length > 0 ? 'dtxr-ps-tag-relaxed-fallback' : 'unmatched'));
    const staged = stagedMatches[0] || null;
    const restraints = xmlChildrenByName(node, 'Restraint');
    const combinedTypes = dedupeXmlCiiRestraintEntries(stagedMatches.flatMap(m => xmlCiiRestraintEntriesFromSupportMatch(m, node, config)));
    const dtxrPs = xmlCiiDtxrPsForNode(node, stagedComponentIndex);
    if (dtxrPs.text) {
      xmlSetText(document, node, 'DTXR_PS', dtxrPs.text);
      stats.dtxrPsAnnotations += 1;
      diagnostics.push({ type: 'dtxr-ps', nodeNumber: xmlText(node, 'NodeNumber'), nodeName: xmlText(node, 'NodeName'), componentType, tags: dtxrPs.tags.join('|'), count: dtxrPs.values.length, matchedBy: 'DTXR_PS', matchedKey: dtxrPs.tags.join('|'), finalValue: dtxrPs.text, status: 'applied' });
    }
    const dtxrPos = xmlCiiDtxrPosForNode(node, stagedDtxrPositionIndex, config);
    if (dtxrPos.text) {
      xmlSetText(document, node, 'DTXR_POS', dtxrPos.text);
      stats.dtxrPosAnnotations += 1;
      diagnostics.push({ type: 'dtxr-pos', nodeNumber: xmlText(node, 'NodeNumber'), nodeName: xmlText(node, 'NodeName'), componentType, position: xmlText(node, 'Position'), count: dtxrPos.values.length, matchedBy: 'DTXR_POS', matchedKey: xmlText(node, 'Position'), sourcePath: dtxrPos.matchedPath || '', method: 'DTXR_POS exact or within +/-6mm trace tolerance', finalValue: dtxrPos.text, status: 'applied' });
    } else {
      // Fallback: component-refno based DTXR when position match misses (e.g. INST/VALV with POSI ≠ XML node endpoint positions)
      const _existingDtxrPos = xmlText(node, 'DTXR_POS');
      if (!_existingDtxrPos) {
        const _dtxrRef = resolveXmlCiiNodeDtxr(node, stagedDtxrRefIndex, config);
        if (_dtxrRef?.value && _dtxrRef.matchedBy === 'component-refno') {
          xmlSetText(document, node, 'DTXR_POS', _dtxrRef.value);
          stats.dtxrPosAnnotations += 1;
          diagnostics.push({ type: 'dtxr-pos', nodeNumber: xmlText(node, 'NodeNumber'), nodeName: xmlText(node, 'NodeName'), componentType, matchedBy: 'component-refno', matchedKey: _dtxrRef.matchedKey || '', sourcePath: _dtxrRef.sourcePath || _dtxrRef.matchedKey || '', jsonNodeNo: '', method: `component-refno: ${_dtxrRef.matchedKey || ''}`, finalValue: _dtxrRef.value, status: 'applied' });
        }
      }
    }
    if (staged) {
      const allKinds = Array.from(new Set(stagedMatches.map(m => m.kind).filter(Boolean)));
      const xmlTypes = restraints.map((r) => xmlText(r, 'Type')).filter(Boolean).join('+');
      diagnostics.push({ type: 'support-match', nodeNumber: xmlText(node, 'NodeNumber'), nodeName: xmlText(node, 'NodeName'), componentType, method: supportMatchMethod, matchedBy: supportMatchMethod, matchedKey: coordMatches.length > 0 ? positionKey : supportTags.join('|'), kind: allKinds.join('+'), xmlRestraintTypes: xmlTypes, restraintTypes: combinedTypes.join('+'), finalValue: combinedTypes.join('+'), stagedName: staged.component?.name || staged.attrs?.NAME || '', tags: supportTags, status: 'applied' });
    }

    let targetEntries = [];
    if (staged) {
      targetEntries = combinedTypes.length > 0 ? combinedTypes : [config.defaultXmlSupportType || 'Y'];
    } else if (restraints.length) {
      targetEntries = restraints
        .map((restraint) => xmlCiiTypeEntryFromExistingRestraint(restraint, config))
        .filter((entry) => !!entry.type);
    }

    if (componentType === 'ATTA' && targetEntries.length > 0) {
      applyXmlRestraints(document, node, targetEntries, config);
      if (staged) stats.stagedSupportsMapped += 1;
      stats.normalizedRestraints += targetEntries.length;
    } else if (restraints.length) {
      applyXmlRestraints(document, node, targetEntries, config);
      stats.normalizedRestraints += targetEntries.length;
    }
    if (staged) {
      const rating = deriveRatingText(staged.attrs, config, xmlText(node, 'PipingClass'));
      const weight = deriveWeightText(staged.attrs, config);
      const manualRigidWeight = xmlCiiRigidWeightOverrideForNode(xmlCiiAncestorBranchName(node), node, config);
      if (rating) {
        xmlSetText(document, node, 'Rating', rating);
        stats.ratingAnnotations += 1;
      }
      if (weight && manualRigidWeight === null) {
        xmlSetText(document, node, 'Weight', weight);
        stats.weightAnnotations += 1;
      }
    }
  }

  const xmlOut = new XMLSerializer().serializeToString(document);
  const diagnosticText = JSON.stringify({ generatedAt: new Date().toISOString(), stats, diagnostics }, null, 2);
  if (Array.isArray(options._diagOut)) options._diagOut.push(...diagnostics);
  return { xmlText: xmlOut, stats, config, diagnostics, diagnosticRows: diagnosticRowsForTable(diagnostics), diagnosticText };
}

// Helpers for support tags extraction (matches xmlNodeSupportTags in support-mapping.js but with clean support tag parsing)
function xmlNodeSupportTags(node) {
  const parts = [xmlText(node, 'NodeName'), xmlText(node, 'ComponentRefNo')];
  for (const child of xmlChildrenByName(node, 'SupportTag')) parts.push(toText(child.textContent));
  const tags = new Set();
  for (const text of parts) {
    for (const match of text.matchAll(/\/?PS-\d+(?:\.\d+)?/ig)) {
      const cleanTag = match[0].trim().toUpperCase().replace(/^\/+/, '');
      if (cleanTag) tags.add(cleanTag);
    }
  }
  return [...tags];
}

function supportTagBase(value) {
  return toText(value).trim().toUpperCase().replace(/^\/+/, '').replace(/\.\d+$/, '');
}

function relaxedSameDtxrPosSupportMatches(xmlSupportTags, coordMatches) {
  if (!Array.isArray(coordMatches) || !coordMatches.length) return [];
  const baseTags = new Set(xmlSupportTags.map(supportTagBase).filter(Boolean));
  if (!baseTags.size) return [];
  return coordMatches.filter((match) => {
    const stagedBaseTags = Array.isArray(match?.supportBaseTags) ? match.supportBaseTags : [];
    return stagedBaseTags.some((tag) => baseTags.has(tag));
  });
}

function stagedSupportMatchKey(match) {
  const attrs = match?.attrs || {};
  return [
    attrs.REF,
    attrs.NAME,
    attrs.CMPSUPREFN,
    match?.component?.name,
    match?.primaryKind || match?.kind,
  ].map(toText).join('|');
}

function mergeUniqueSupportMatches(...groups) {
  const out = [];
  const seen = new Set();
  for (const group of groups) {
    for (const match of Array.isArray(group) ? group : []) {
      const key = stagedSupportMatchKey(match);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(match);
    }
  }
  return out;
}
