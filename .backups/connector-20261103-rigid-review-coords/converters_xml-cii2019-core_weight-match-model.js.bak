import { deriveLineKeyFromBranchName, tokenAtPosition } from './regex-line-key.js';
import { computeLineNoKey } from './linelist-mapping.js';
import { buildPipingClassIndex } from './piping-class-resolver.js';
import { resolveBranchProcessData } from './branch-process-resolver.js';
import { buildDtxrContext, resolveDtxrForXmlNode } from './dtxr-resolver.js';
import { rankXmlCiiWeightCandidates } from './weight-valve-hints.js';

function toText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseNumericMm(value) {
  const match = toText(value).replace(/mm/gi, ' ').match(/-?\d+(?:\.\d+)?/);
  const numeric = match ? Number(match[0]) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function rowText(row, keys) {
  for (const key of keys || []) {
    const value = row?.[key] ?? row?._raw?.[key];
    if (toText(value).trim()) return toText(value).trim();
  }
  return '';
}

function rowNumber(row, keys) {
  for (const key of keys || []) {
    const numeric = parseNumericMm(row?.[key] ?? row?._raw?.[key]);
    if (numeric !== null) return numeric;
  }
  return null;
}

function xmlLocalName(node) {
  return toText(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function xmlChildrenByName(parent, localName) {
  return [...(parent?.childNodes || [])].filter((child) => child.nodeType === 1 && xmlLocalName(child) === localName);
}

function xmlFirstChild(parent, localName) {
  return xmlChildrenByName(parent, localName)[0] || null;
}

function xmlText(parent, localName) {
  return toText(xmlFirstChild(parent, localName)?.textContent).trim();
}

function xmlSetText(document, parent, localName, value) {
  let element = xmlFirstChild(parent, localName);
  if (!element) {
    element = parent?.namespaceURI ? document.createElementNS(parent.namespaceURI, localName) : document.createElement(localName);
    parent.appendChild(element);
  }
  element.textContent = toText(value);
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
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
  }
  const text = toText(point).trim();
  const tokens = text.split(/\s+/g);
  const directional = { x: 0, y: 0, z: 0 };
  let parsedDirectional = false;
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = tokens[i].toUpperCase();
    const value = parseNumericMm(tokens[i + 1]);
    if (!Number.isFinite(value)) continue;
    if (axis === 'E') { directional.x = value; parsedDirectional = true; }
    else if (axis === 'W') { directional.x = -value; parsedDirectional = true; }
    else if (axis === 'N') { directional.y = value; parsedDirectional = true; }
    else if (axis === 'S') { directional.y = -value; parsedDirectional = true; }
    else if (axis === 'U') { directional.z = value; parsedDirectional = true; }
    else if (axis === 'D') { directional.z = -value; parsedDirectional = true; }
  }
  if (parsedDirectional) return directional;
  const values = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function xmlPositionKey(positionText, tolerance) {
  const point = normalizePoint(positionText);
  if (!point) return '';
  const tol = toFiniteNumber(tolerance, 1) || 1;
  return [point.x, point.y, point.z].map((value) => Math.round(value / tol)).join('|');
}

export function normalizeSupportTag(value) {
  const text = toText(value).trim().toUpperCase().replace(/^\/+/, '').replace(/\s+/g, ' ');
  const match = text.match(/PS-\d+(?:\.\d+)?/i);
  return match ? match[0].toUpperCase() : '';
}

function supportTagsFromText(value) {
  const tags = new Set();
  for (const match of toText(value).matchAll(/\/?PS-\d+(?:\.\d+)?/ig)) {
    const tag = normalizeSupportTag(match[0]);
    if (tag) tags.add(tag);
  }
  return [...tags];
}

function supportTagsFromAttrs(attrs, componentName = '') {
  const tags = new Set(supportTagsFromText(componentName));
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value && typeof value === 'object') continue;
    for (const tag of supportTagsFromText(`${key} ${value}`)) tags.add(tag);
  }
  return [...tags];
}

function xmlNodeSupportTags(node) {
  const parts = [xmlText(node, 'NodeName'), xmlText(node, 'ComponentRefNo')];
  for (const child of xmlChildrenByName(node, 'SupportTag')) parts.push(toText(child.textContent));
  return [...new Set(parts.flatMap(supportTagsFromText))];
}

function walkStagedComponents(value, branchName = '', out = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkStagedComponents(item, branchName, out));
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  const attrs = value.attributes && typeof value.attributes === 'object' ? value.attributes : {};
  const type = toText(value.type || attrs.TYPE).toUpperCase();
  const currentBranch = type === 'BRANCH' || Array.isArray(value.children) ? toText(value.name || attrs.NAME || attrs.OWNER || branchName) : branchName;
  out.push({ component: value, attrs, branchName: currentBranch });
  if (Array.isArray(value.children)) value.children.forEach((child) => walkStagedComponents(child, currentBranch, out));
  return out;
}

export function buildStagedComponentIndex(stagedJsonText, config = {}) {
  const empty = { byCoord: new Map(), byTag: new Map(), count: 0 };
  if (!toText(stagedJsonText).trim()) return empty;
  let parsed = null;
  try { parsed = JSON.parse(stagedJsonText); } catch { return empty; }
  const byCoord = new Map();
  const byTag = new Map();
  let count = 0;
  for (const entry of walkStagedComponents(parsed)) {
    const attrs = entry.attrs || {};
    let point = null;
    for (const key of ['SUPPORTCOORD', 'POS', 'BPOS', 'APOS', 'LPOS', 'CPOS', 'HPOS', 'TPOS']) {
      point = normalizePoint(attrs[key]);
      if (point) break;
    }
    const indexed = { ...entry, point };
    if (point) {
      const key = xmlPositionKey(`${point.x} ${point.y} ${point.z}`, toFiniteNumber(config.coordinateTolerance, 1));
      if (key) {
        if (!byCoord.has(key)) byCoord.set(key, []);
        byCoord.get(key).push(indexed);
      }
    }
    for (const tag of supportTagsFromAttrs(attrs, entry.component?.name || '')) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(indexed);
    }
    count += 1;
  }
  return { byCoord, byTag, count };
}

export function stagedComponentForXmlNode(node, stagedIndex, config = {}) {
  if (!stagedIndex || stagedIndex.count <= 0) return { match: null, method: '' };
  for (const tag of xmlNodeSupportTags(node)) {
    const matches = stagedIndex.byTag.get(tag) || [];
    if (matches.length) return { match: matches[0], method: `PS tag ${tag}` };
  }
  const positionKey = xmlPositionKey(xmlText(node, 'Position'), toFiniteNumber(config.coordinateTolerance, 1));
  const coordMatches = positionKey ? (stagedIndex.byCoord.get(positionKey) || []) : [];
  return coordMatches.length ? { match: coordMatches[0], method: 'coordinate' } : { match: null, method: '' };
}

export function shouldConvertSmallWeightLengthsToMm(config) {
  return config?.weight?.convertSmallLengthsInToMm === true;
}

function resolveWeightMasterLength(rowLengthRaw, xmlLengthMm, config) {
  if (rowLengthRaw === null) return null;
  if (!shouldConvertSmallWeightLengthsToMm(config)) return rowLengthRaw;
  return rowLengthRaw < 100 && xmlLengthMm > 100 ? rowLengthRaw * toFiniteNumber(config.weight?.inchToMm, 25.4) : rowLengthRaw;
}

function weightType(row) {
  return rowText(row, ['type', 'Type', 'TYPE', 'valveType', 'Valve Type']);
}

function weightTypeDesc(row) {
  return rowText(row, ['typeDesc', 'TypeDesc', 'Type Desc', 'Type Description', 'Description', 'Valve Type']);
}

export function normalizedXmlCiiRating(value) {
  return toText(value).replace(/#/g, '').trim().toUpperCase();
}

export function xmlCiiWeightCandidateFromRow(row, config, lengthMm) {
  const rowBore = rowNumber(row, ['boreMm', 'convertedBore', 'Converted Bore', 'bore', 'Bore', 'DN', 'NB']);
  const rowLengthRaw = rowNumber(row, ['lengthMm', 'length', 'Length (RF-F/F)', 'RF-F/F', 'LEN', 'faceToFace']);
  const rowLength = resolveWeightMasterLength(rowLengthRaw, lengthMm, config);
  const rowWeight = rowNumber(row, ['valveWeight', 'directWeight', 'weight', 'Weight', 'RF/RTJ KG', 'Valve Weight']);
  const rowRating = normalizedXmlCiiRating(rowText(row, ['ratingClass', 'rating', 'Rating', 'RATING', 'Class', 'CLASS', 'Pressure Class']));
  const valveType = weightType(row);
  const typeDesc = weightTypeDesc(row);
  return rowBore === null || rowLength === null || rowWeight === null ? null : { weight: rowWeight, rowBore, rowLength, rowRating, valveType, type: valveType, typeDesc, rowData: row };
}

export function findWeightMasterMatch(params, config) {
  const ranking = rankXmlCiiWeightCandidates(params || {}, config, { includeRejected: false });
  const best = ranking.best;
  return best && best.preferred === true && best.lengthQualified === true ? best : null;
}

export function findAllWeightCandidates(params, config) {
  return rankXmlCiiWeightCandidates(params || {}, config, { includeRejected: false }).candidates;
}

export function scoreXmlCiiWeightCandidates(params, config) {
  return rankXmlCiiWeightCandidates(params || {}, config, { includeRejected: false }).candidates.slice(0, 5);
}

export function xmlCiiRigidWeightOverrideKey(branchName, nodeNumber) {
  return `${toText(branchName).trim()}::${toText(nodeNumber).trim()}`;
}

function xmlCiiWeightReviewNodeFallbackId(node, nodeIdx) {
  const parts = [
    xmlText(node, 'ComponentRefNo'),
    xmlText(node, 'Endpoint'),
    xmlText(node, 'Position'),
    xmlText(node, 'ComponentType'),
  ].map((part) => toText(part).trim()).filter(Boolean);
  if (parts.length) return parts.join('|');
  return Number.isFinite(Number(nodeIdx)) ? `node-index-${Number(nodeIdx) + 1}` : '';
}

// VALV/INST nodes are never renumbered by the Python engine (only FLAN/RIGID
// are, see xml_to_cii2019_patched.py's RENUMBERABLE_NEGATIVE_TYPES), so their
// NodeNumber stays "-1" permanently — there is no future real number to
// reveal for them the way there is for a suppressed-but-renumbered FLAN/RIGID.
// Showing the raw ComponentRefNo|Endpoint|Position|ComponentType descriptor
// in the NODE column for these is unreadable and duplicates the ComponentRefNo
// column right next to it. The nearest branch-neighbor that already has a
// real positive NodeNumber is the practical "where does this attach" answer,
// so use that (marked with a leading "~" since it's an approximation, not
// this node's own number) instead of dumping the technical descriptor.
function xmlCiiNearestNumberedNodeDisplay(branchNodeList, nodeIdx) {
  for (let i = nodeIdx - 1; i >= 0; i -= 1) {
    const candidate = xmlText(branchNodeList[i], 'NodeNumber');
    if (Number(candidate) > 0) return `~${candidate}`;
  }
  for (let i = nodeIdx + 1; i < branchNodeList.length; i += 1) {
    const candidate = xmlText(branchNodeList[i], 'NodeNumber');
    if (Number(candidate) > 0) return `~${candidate}`;
  }
  return '';
}

export function xmlCiiWeightReviewNodeOverrideKey(branchName, node, nodeIdx) {
  const nodeNumber = xmlText(node, 'NodeNumber');
  if (Number(nodeNumber) > 0) return xmlCiiRigidWeightOverrideKey(branchName, nodeNumber);
  const fallbackId = xmlCiiWeightReviewNodeFallbackId(node, nodeIdx);
  return fallbackId ? xmlCiiRigidWeightOverrideKey(branchName, fallbackId) : xmlCiiRigidWeightOverrideKey(branchName, nodeNumber);
}

export function isXmlCiiRigidNode(node) {
  return xmlText(node, 'ComponentType').toUpperCase() === 'RIGID' || Number(xmlText(node, 'Rigid')) === 2;
}

export function isXmlCiiWeightReviewNode(node, dtxr = '') {
  const compType = xmlText(node, 'ComponentType').toUpperCase();
  const nodeName = xmlText(node, 'NodeName').toUpperCase();
  const dtxrUpper = toText(dtxr).toUpperCase();
  const searchText = `${compType} ${nodeName} ${dtxrUpper}`;
  return isXmlCiiRigidNode(node) ||
         compType.startsWith('INST') ||
         compType.startsWith('FLAN') ||
         compType.startsWith('VALV') ||
         compType === 'VLV' ||
         /FLAN/.test(searchText) ||
         /VALV|\bVLV\b/.test(searchText) ||
         /\bINST\b|INSTRUMENT/.test(searchText);
}

export function isXmlCiiWeightReviewEndpoint(node) {
  const endpointText = toText(xmlText(node, 'Endpoint')).trim().toUpperCase();
  if (!endpointText || endpointText === '0') return true;
  const numeric = Number(endpointText);
  if (Number.isFinite(numeric)) return numeric === 2;
  return endpointText === '2' || endpointText === 'END2' || endpointText === 'ENDPOINT2';
}

export function xmlCiiNumberText(value) {
  const text = toText(value).replace(/,/g, '').trim();
  if (text === '') return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

export function xmlCiiAncestorBranchName(node) {
  let current = node?.parentNode || null;
  while (current) {
    if (current.nodeType === 1 && xmlLocalName(current) === 'Branch') return xmlText(current, 'Branchname');
    current = current.parentNode || null;
  }
  return '';
}

function resolveWeightDtxr(node, dtxrContext, config) {
  return resolveDtxrForXmlNode({ xmlNode: node, context: dtxrContext, purpose: 'weight-review', config, trustExistingXmlDtxr: false });
}

function xmlCiiRigidWeightOverrideKeysForNode(branchName, node, nodeIdx) {
  const nodeNumber = xmlText(node, 'NodeNumber');
  return [
    xmlCiiWeightReviewNodeOverrideKey(branchName, node, nodeIdx),
    xmlCiiRigidWeightOverrideKey(branchName, nodeNumber),
    nodeNumber,
  ].filter((key, index, keys) => toText(key).trim() && keys.indexOf(key) === index);
}

export function xmlCiiRigidWeightOverrideForNode(branchName, node, config, nodeIdx) {
  const overrides = config?.overrides?.rigidWeight || {};
  for (const key of xmlCiiRigidWeightOverrideKeysForNode(branchName, node, nodeIdx)) {
    const numeric = xmlCiiNumberText(overrides[key]);
    if (numeric !== null && numeric > 0) return numeric;
  }
  return null;
}

export function xmlCiiForwardElementLengths(nodes) {
  const out = new Array(nodes.length).fill(null);
  const mapPositionToCii = (positionText) => {
    const point = normalizePoint(positionText);
    return point ? [point.x, point.z, -point.y] : null;
  };
  for (let j = 0; j < nodes.length; j += 1) {
    const toNumber = Number(xmlText(nodes[j], 'NodeNumber'));
    if (!Number.isFinite(toNumber) || toNumber <= 0) continue;
    const toPosition = xmlText(nodes[j], 'Position');
    if (!toPosition) continue;
    let fromPosition = null;
    for (let i = j - 1; i >= 0; i -= 1) {
      const fromNumber = Number(xmlText(nodes[i], 'NodeNumber'));
      if (Number.isFinite(fromNumber) && fromNumber > 0) { fromPosition = xmlText(nodes[i], 'Position'); break; }
    }
    const from = mapPositionToCii(fromPosition);
    const to = mapPositionToCii(toPosition);
    if (!from || !to) continue;
    out[j] = Math.sqrt(((to[0] - from[0]) ** 2) + ((to[1] - from[1]) ** 2) + ((to[2] - from[2]) ** 2));
  }
  return out;
}

const OD_TO_DN = [[10.3,6],[13.7,8],[17.1,10],[21.3,15],[26.7,20],[33.4,25],[42.2,32],[48.3,40],[60.3,50],[73.0,65],[88.9,80],[114.3,100],[141.3,125],[168.3,150],[219.1,200],[273.0,250],[273.1,250],[323.8,300],[323.9,300],[355.6,350],[406.4,400],[457.0,450],[457.2,450],[508.0,500],[609.6,600],[610.0,600],[711.0,700],[762.0,750]];

function nominalDnFromOd(odNum) {
  if (odNum === null || !Number.isFinite(odNum)) return null;
  let best = null;
  for (const [od, dn] of OD_TO_DN) {
    const err = Math.abs(odNum - od);
    if (!best || err < best.err) best = { od, dn, err };
  }
  return best && best.err <= Math.max(1.5, Math.abs(best.od) * 0.006) ? best.dn : odNum;
}

function normalizeLineKey(value) {
  return toText(value).trim().toUpperCase().replace(/\s+/g, '');
}

function lineListRowKey(row, config) {
  const mapped = computeLineNoKey(row, config.linelist?.fieldMap || {});
  if (mapped) return mapped;
  const key1 = rowText(row, ['lineKey1', 'Key 1', 'ColumnX1', 'Service', 'Fluid']);
  const key2 = rowText(row, ['lineKey2', 'Key 2', 'ColumnX2', 'Line number', 'Line Number', 'Line No']);
  if (key1 || key2) return `${key1}${key2}`;
  return rowText(row, ['lineNoKey', 'lineNo', 'lineKey', 'LineNo', 'Line No', 'Line Number', 'PipelineReference']);
}

function lineListRowForBranch(branchName, config) {
  const rows = Array.isArray(config.linelist?.masterRows) ? config.linelist.masterRows : [];
  const lineKey = deriveLineKeyFromBranchName(branchName, config);
  const wanted = normalizeLineKey(lineKey);
  if (!wanted) return { lineKey: '', row: null };
  for (const row of rows) if (normalizeLineKey(lineListRowKey(row, config)) === wanted) return { lineKey, row };
  return { lineKey, row: null };
}

function looksLikeNpsToken(value) {
  return /^\s*\d+(?:\.\d+)?\s*(?:"|in|inch|nps)?\s*$/i.test(toText(value));
}

function isLikelyMaterialToken(value) {
  return /^(CS|SS|LTCS|DSS|SDSS|ALLOY|GI|CI|DI|PVC|CPVC|HDPE|GRP|GRE)$/i.test(toText(value).trim());
}

function derivePipingClassFromBranchName(branchName, config) {
  const regex = toText(config.rating?.pipingClassRegex).trim();
  if (regex) {
    try {
      const match = new RegExp(regex, 'i').exec(branchName);
      const group = Number(config.rating?.pipingClassGroup || 1);
      if (match?.[group]) return toText(match[group]).trim();
    } catch {}
  }
  const delimiter = config.rating?.tokenDelimiter || config.linelist?.tokenDelimiter || '-';
  const index = Number(config.rating?.pipingClassTokenIndex || 5);
  const value = tokenAtPosition(branchName, delimiter, index);
  const fourth = tokenAtPosition(branchName, delimiter, 4);
  const sixth = tokenAtPosition(branchName, delimiter, 6);
  if (index === 5 && isLikelyMaterialToken(value) && looksLikeNpsToken(fourth) && /^S\d+/i.test(sixth)) return '';
  return value;
}

function branchBoreFromFirstUsefulNode(branch) {
  for (const node of xmlChildrenByName(branch, 'Node')) {
    let boreMm = xmlCiiNumberText(xmlText(node, 'BoreMm'));
    if (boreMm !== null) return boreMm;
    const od = xmlCiiNumberText(xmlText(node, 'OutsideDiameter'));
    if (od !== null) {
      boreMm = nominalDnFromOd(od);
      if (boreMm !== null) return boreMm;
    }
  }
  return null;
}

function overrideText(config, bucketName, keys = []) {
  const bucket = config?.overrides?.[bucketName];
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return '';
  for (const key of keys) {
    const value = bucket[key];
    if (toText(value).trim()) return toText(value).trim();
  }
  return '';
}

function ratingOverrideForBranch(config, { lineKey, branchName, lineRow, requestedPipingClass }) {
  const candidates = [lineKey, branchName, requestedPipingClass, lineListRowKey(lineRow, config), rowText(lineRow, ['lineNoKey', 'lineNo', 'lineKey', 'LineNo', 'Line No', 'Line Number', 'PipelineReference'])].filter(Boolean);
  const direct = overrideText(config, 'rating', candidates);
  if (direct) return direct;
  for (const key of candidates) {
    const processRating = config?.overrides?.processData?.[key]?.rating;
    if (toText(processRating).trim()) return toText(processRating).trim();
  }
  return toText(config?.rating?.defaultRating || config?.defaultRating || '').trim();
}

function resolveRigidWeightBranchContext(branch, config, pipingClassIndex) {
  const branchName = xmlText(branch, 'Branchname');
  const { lineKey, row: lineRow } = lineListRowForBranch(branchName, config);
  const derivedClass = derivePipingClassFromBranchName(branchName, config);
  const requestedPipingClass = rowText(lineRow, ['pipingClass', 'Piping Class', 'PIPING_CLASS']) || derivedClass;
  const manualRating = ratingOverrideForBranch(config, { lineKey, branchName, lineRow, requestedPipingClass });
  const lineRating = rowText(lineRow, ['rating', 'Rating', 'RATING']);
  const resolverLineRow = { ...(lineRow || {}), pipingClass: requestedPipingClass };
  if (manualRating || lineRating) resolverLineRow.rating = manualRating || lineRating;
  const boreMm = branchBoreFromFirstUsefulNode(branch);
  const resolved = resolveBranchProcessData({ branchName, lineKey, lineRow: resolverLineRow, boreMm, componentType: 'PIPE', rating: manualRating || lineRating, materialMap: config.material?.mapRows || [], pipingClassIndex, overrides: config.overrides || {}, xmlNode: null, xmlBranch: branch, config });
  const rating = manualRating || resolved.rating || lineRating;
  return { branchName, lineKey, lineRow: resolverLineRow, boreMm, requestedPipingClass: resolverLineRow.pipingClass, resolvedPipingClass: resolved.pipingClass, rating, pipingClassMatchMethod: resolved.pipingClassMatchMethod, pipingClassNeedsReview: resolved.pipingClassNeedsReview, pipingClassCandidates: resolved.pipingClassCandidates || [] };
}

function ratingForRigidWeightIssue(node, branchContext, config) {
  const nodeRating = xmlText(node, 'Rating');
  if (toText(branchContext.rating).trim()) return toText(branchContext.rating).trim();
  const nodeNumber = xmlText(node, 'NodeNumber');
  return overrideText(config, 'rating', [branchContext.lineKey, branchContext.branchName, nodeNumber]) || nodeRating;
}

function collectWeightRows(xmlTextVal, stagedJsonText, config, mode = 'zero-rigid') {
  if (typeof DOMParser === 'undefined') return [];
  const document = new DOMParser().parseFromString(toText(xmlTextVal), 'application/xml');
  if (document.getElementsByTagName('parsererror').length) return [];
  const dtxrContext = buildDtxrContext(stagedJsonText, config);
  const pipingClassIndex = buildPipingClassIndex(config.pipingClass?.masterRows || []);
  const rows = [];
  for (const branch of [...document.getElementsByTagName('Branch')]) {
    const branchContext = resolveRigidWeightBranchContext(branch, config, pipingClassIndex);
    const branchName = branchContext.branchName;
    const branchNodeList = xmlChildrenByName(branch, 'Node');
    const forwardLengths = xmlCiiForwardElementLengths(branchNodeList);
    branchNodeList.forEach((node, nodeIdx) => {
      const nodeNumber = xmlText(node, 'NodeNumber');
      const dtxrResult = resolveWeightDtxr(node, dtxrContext, config);
      const dtxrText = dtxrResult?.suppressed ? '' : toText(dtxrResult?.canonicalText);
      const dtxrSourcePath = dtxrResult?._sourcePath || '';
      const componentType = xmlText(node, 'ComponentType');
      const connectionType = xmlText(node, 'ConnectionType');
      if (connectionType) return;
      const reviewNode = isXmlCiiWeightReviewNode(node, dtxrText);
      const explicitLength = xmlText(node, 'ElementLengthMm') ? xmlCiiNumberText(xmlText(node, 'ElementLengthMm')) : null;
      const lengthMm = explicitLength !== null ? explicitLength : forwardLengths[nodeIdx];
      const weight = xmlCiiNumberText(xmlText(node, 'Weight'));
      const overrideWeight = xmlCiiRigidWeightOverrideForNode(branchName, node, config, nodeIdx);
      const mappedWeight = overrideWeight ?? weight;
      const isMapped = mappedWeight !== null && mappedWeight > 0;
      const reviewEndpoint = isXmlCiiWeightReviewEndpoint(node);
      if (mode === 'all-review-nodes') {
        if (!reviewNode || !reviewEndpoint || lengthMm === null || lengthMm <= 6) return;
      } else if (!reviewNode || !reviewEndpoint || lengthMm === null || (weight !== null && Math.abs(weight) > 1e-12)) return;
      let boreMm = xmlCiiNumberText(xmlText(node, 'BoreMm'));
      if (boreMm === null) {
        const od = xmlCiiNumberText(xmlText(node, 'OutsideDiameter'));
        if (od !== null) boreMm = nominalDnFromOd(od);
      }
      if (boreMm === null) boreMm = branchContext.boreMm;
      const rating = ratingForRigidWeightIssue(node, branchContext, config);
      const ranking = rankXmlCiiWeightCandidates({ boreMm, rating, lengthMm, nodeName: xmlText(node, 'NodeName'), componentType, componentRefNo: xmlText(node, 'ComponentRefNo'), dtxr: dtxrText }, config, { includeRejected: true });
      // NodeNumber can be the literal "-1" sentinel for FLAN/VALV/RIGID/INST
      // nodes whose synthetic ≥10000 fallback number was intentionally
      // suppressed upstream (see staged-geometry-authority.js), and VALV/INST
      // nodes never get a real number at all (only FLAN/RIGID are eligible
      // for renumbering). The Weight Match table still needs *something*
      // node-identifying to show the reviewer: prefer the nearest branch
      // neighbor that already has a real positive number (an approximate but
      // readable "attaches near node N"), and only fall back to the raw
      // ComponentRefNo/Endpoint/Position/ComponentType descriptor (also used
      // for this row's `key`) when no numbered neighbor exists at all.
      const nodeNumberDisplay = Number(nodeNumber) > 0
        ? nodeNumber
        : (xmlCiiNearestNumberedNodeDisplay(branchNodeList, nodeIdx)
          || xmlCiiWeightReviewNodeFallbackId(node, nodeIdx)
          || nodeNumber);
      rows.push({ key: xmlCiiWeightReviewNodeOverrideKey(branchName, node, nodeIdx), branchName, lineKey: branchContext.lineKey, nodeNumber, nodeNumberDisplay, nodeName: xmlText(node, 'NodeName'), endpoint: xmlText(node, 'Endpoint'), componentType, componentRefNo: xmlText(node, 'ComponentRefNo'), boreMm, rating, requestedPipingClass: branchContext.requestedPipingClass, resolvedPipingClass: branchContext.resolvedPipingClass, pipingClassMatchMethod: branchContext.pipingClassMatchMethod, pipingClassNeedsReview: branchContext.pipingClassNeedsReview, pipingClassCandidates: branchContext.pipingClassCandidates, lengthMm, elementLengthSource: explicitLength !== null ? 'ElementLengthMm' : 'computed-forward', weight: mappedWeight, originalWeight: weight, overrideWeight, weightSource: overrideWeight !== null ? 'override' : (weight !== null && weight > 0 ? 'xml-weight' : 'unresolved'), mapped: isMapped, status: isMapped ? 'mapped' : 'unresolved', dtxr: dtxrText, dtxrSource: dtxrResult?.source || '', dtxrMatchedBy: dtxrResult?.matchedBy || '', dtxrMatchedKey: dtxrResult?.matchedKey || '', dtxrSourcePath, dtxrStagedType: dtxrResult?.stagedType || '', dtxrSuppressed: Boolean(dtxrResult?.suppressed), dtxrSuppressionReason: dtxrResult?.suppressionReason || '', ranking, nodeHint: ranking.nodeHint, candidates: ranking.candidates.slice(0, 5), rejectedCandidates: ranking.rejectedCandidates.slice(0, 3) });
    });
  }
  return rows;
}

export function collectXmlCiiWeightMatchRows(xmlTextVal, stagedJsonText, config) {
  return collectWeightRows(xmlTextVal, stagedJsonText, config, 'all-review-nodes');
}

export function collectXmlCiiZeroRigidWeightIssues(xmlTextVal, stagedJsonText, config) {
  return collectWeightRows(xmlTextVal, stagedJsonText, config, 'zero-rigid').filter((row) => !row.mapped);
}

export function applyXmlCiiRigidWeightOverrides(xmlTextVal, weightsByKey) {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return { xmlText: xmlTextVal, appliedCount: 0, appliedRows: [] };
  const document = new DOMParser().parseFromString(toText(xmlTextVal), 'application/xml');
  if (document.getElementsByTagName('parsererror').length) return { xmlText: xmlTextVal, appliedCount: 0, appliedRows: [] };
  const appliedRows = [];
  for (const branch of [...document.getElementsByTagName('Branch')]) {
    const branchName = xmlText(branch, 'Branchname');
    xmlChildrenByName(branch, 'Node').forEach((node, nodeIdx) => {
      const nodeNumber = xmlText(node, 'NodeNumber');
      const keys = xmlCiiRigidWeightOverrideKeysForNode(branchName, node, nodeIdx);
      const numeric = keys.map((key) => xmlCiiNumberText(weightsByKey?.[key])).find((value) => value !== null && value > 0) ?? null;
      if (numeric === null || numeric <= 0) return;
      xmlSetText(document, node, 'Weight', String(numeric));
      appliedRows.push({ type: 'rigid-weight-manual-override', branchName, nodeNumber, weight: numeric });
    });
  }
  return { xmlText: new XMLSerializer().serializeToString(document), appliedCount: appliedRows.length, appliedRows };
}
