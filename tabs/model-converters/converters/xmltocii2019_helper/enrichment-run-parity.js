import { parseXmlCiiEnrichmentConfig } from '../../../../converters/xml-cii2019-core/config.js';
import { enrichXmlForCii2019 as enrichXmlForCii2019Base } from './enrichment-core.js?v=20260620-rating-override-1';
import { xmlCiiDryRunPreview } from './preview-renderer.js?v=20260626-process-xml-fallback-1';
import { resolveXmlCiiNodeBoreFromOutsideDiameter } from '../../../../converters/xml-cii2019-core/od-bore-resolver.js';

const RENUMBERABLE_NEGATIVE_TYPES = new Set(['FLAN', 'VALV', 'RIGID', 'INST']);
const INLINE_LENGTH_COMPONENT_TYPES = new Set(['FLAN', 'VALV', 'RIGID', 'INST']);
const RESOLVED_RIGID_MARKER_TYPES = new Set(['FLAN', 'VALV', 'RIGID', 'INST']);
const RESOLVED_FLEXIBLE_MARKER_TYPES = new Set([]);
const DTXR_POS_SIF_ZERO_TYPES = new Set(['TEE', 'OLET', 'WELDOLET', 'SOCKOLET', 'THREDOLET', 'THREADOLET', 'ELBOLET', 'LATROLET', 'SWEEPOLET', 'NIPOLET']);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function localName(node) {
  return text(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

function childrenByName(parent, name) {
  return [...(parent?.childNodes || [])].filter((node) => node.nodeType === 1 && localName(node) === name);
}

function firstChild(parent, name) {
  return childrenByName(parent, name)[0] || null;
}

function childText(parent, name) {
  return text(firstChild(parent, name)?.textContent);
}

function createChild(document, parent, name) {
  return parent?.namespaceURI ? document.createElementNS(parent.namespaceURI, name) : document.createElement(name);
}

function ensureChild(document, parent, name) {
  let element = firstChild(parent, name);
  if (element) return element;
  element = createChild(document, parent, name);
  parent.appendChild(element);
  return element;
}

function ensureChildAfter(document, parent, name, anchorName) {
  let element = firstChild(parent, name);
  if (element) return element;
  element = createChild(document, parent, name);
  const anchor = firstChild(parent, anchorName);
  if (anchor && anchor.parentNode === parent) parent.insertBefore(element, anchor.nextSibling);
  else parent.appendChild(element);
  return element;
}

function setText(document, parent, name, value) {
  const clean = text(value);
  if (clean === '') return false;
  const element = ensureChild(document, parent, name);
  const before = text(element.textContent);
  element.textContent = clean;
  return before !== clean;
}

function setTextAfter(document, parent, name, value, anchorName) {
  const clean = text(value);
  if (clean === '') return false;
  const element = ensureChildAfter(document, parent, name, anchorName);
  const before = text(element.textContent);
  element.textContent = clean;
  return before !== clean;
}

function normalizeBranchKey(value) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

function numberText(value) {
  const clean = text(value);
  if (clean === '') return '';
  const numeric = Number(clean);
  return Number.isFinite(numeric) ? String(numeric) : clean;
}

function numericValue(value) {
  const clean = text(value);
  if (!clean) return null;
  const match = clean.replace(/,/g, '').match(/-?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function truthy(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === 'number') return value !== 0;
  return /^(1|true|yes|on)$/i.test(text(value));
}

function defaultTrue(value) {
  return value === undefined || value === null ? true : truthy(value);
}

function rowValue(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key] ?? row?._raw?.[key];
    if (text(value) !== '') return text(value);
  }
  return '';
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(base, override) {
  if (!isObject(base)) return isObject(override) ? { ...override } : override;
  if (!isObject(override)) return { ...base };
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = isObject(value) && isObject(out[key]) ? mergeDeep(out[key], value) : value;
  }
  return out;
}

function configWithRuntimeOptions(baseConfig, options = {}) {
  const parsed = parseXmlCiiEnrichmentConfig(options.supportConfigJson || '{}');
  const merged = mergeDeep(baseConfig || {}, parsed || {});
  if (isObject(options?.overrides)) merged.overrides = mergeDeep(merged.overrides || {}, options.overrides);
  if (Object.prototype.hasOwnProperty.call(options || {}, 'condenseRigidXsd')) merged.condenseRigidXsd = truthy(options.condenseRigidXsd);
  if (Object.prototype.hasOwnProperty.call(options || {}, 'splitCondensedValveFlange')) {
    merged.splitCondensedValveFlange = truthy(options.splitCondensedValveFlange);
    merged.split_condensed_valve_flange = merged.splitCondensedValveFlange;
  }
  if (Object.prototype.hasOwnProperty.call(options || {}, 'split_condensed_valve_flange')) {
    merged.splitCondensedValveFlange = truthy(options.split_condensed_valve_flange);
    merged.split_condensed_valve_flange = merged.splitCondensedValveFlange;
  }
  if (Object.prototype.hasOwnProperty.call(merged || {}, 'split_condensed_valve_flange') && !Object.prototype.hasOwnProperty.call(merged || {}, 'splitCondensedValveFlange')) {
    merged.splitCondensedValveFlange = truthy(merged.split_condensed_valve_flange);
  }
  if (Object.prototype.hasOwnProperty.call(options || {}, 'dropGasketNodes')) merged.dropGasketNodes = truthy(options.dropGasketNodes);
  if (Object.prototype.hasOwnProperty.call(options || {}, 'dropGasketsInEnrichment')) merged.dropGasketsInEnrichment = truthy(options.dropGasketsInEnrichment);
  return merged;
}

function shouldDropGasketNodes(config = {}, options = {}) {
  return truthy(config.disableGasketNodes)
    || truthy(config.disableGasketInOutput)
    || truthy(options.disableGasketNodes)
    || truthy(options.disableGasketInOutput)
    || (defaultTrue(config.dropGasketNodes) && defaultTrue(config.dropGasketsInEnrichment) && defaultTrue(options.dropGasketNodes) && defaultTrue(options.dropGasketsInEnrichment));
}

function dropGasketNodesFromDocument(document, statsTarget, diagnosticsTarget, stage) {
  let dropped = 0;
  for (const node of [...document.getElementsByTagName('Node')]) {
    if (childText(node, 'ComponentType').toUpperCase() !== 'GASK') continue;
    node.parentNode?.removeChild(node);
    dropped += 1;
  }
  if (dropped > 0 && statsTarget) statsTarget.gasketNodesDropped = Number(statsTarget.gasketNodesDropped || 0) + dropped;
  if (dropped > 0 && Array.isArray(diagnosticsTarget)) {
    diagnosticsTarget.push({ type: 'gasket-node-dropped', stage, count: dropped, message: 'GASK Node blocks were removed before inline length annotation and split-condensed renumbering.' });
  }
  return dropped;
}

function dropGasketNodesFromXmlText(xmlTextVal, options = {}) {
  const config = configWithRuntimeOptions({}, options);
  if (!shouldDropGasketNodes(config, options)) return { xmlText: xmlTextVal, stats: {}, diagnostics: [] };
  if (typeof DOMParser !== 'undefined' && typeof XMLSerializer !== 'undefined') {
    try {
      const document = new DOMParser().parseFromString(text(xmlTextVal), 'application/xml');
      if (!document.getElementsByTagName('parsererror').length) {
        const stats = {};
        const diagnostics = [];
        dropGasketNodesFromDocument(document, stats, diagnostics, 'pre-enrichment-source');
        return { xmlText: new XMLSerializer().serializeToString(document), stats, diagnostics };
      }
    } catch {}
  }
  let count = 0;
  const xmlText = text(xmlTextVal).replace(/<Node\b[\s\S]*?<\/Node>/gi, (block) => {
    const type = text(block.match(/<ComponentType[^>]*>([\s\S]*?)<\/ComponentType>/i)?.[1]?.replace(/<[^>]+>/g, '')).toUpperCase();
    if (type !== 'GASK') return block;
    count += 1;
    return '';
  });
  const diagnostics = count ? [{ type: 'gasket-node-dropped', stage: 'pre-enrichment-source-regex', count, message: 'GASK Node blocks were removed before XML enrichment.' }] : [];
  return { xmlText, stats: { gasketNodesDropped: count }, diagnostics };
}

function setProcessBlock(document, branch, row) {
  let count = 0;
  const pressure = ensureChild(document, branch, 'Pressure');
  const temperature = ensureChild(document, branch, 'Temperature');

  if (setText(document, pressure, 'Pressure1', rowValue(row, 'p1', 'P1', 'pressure1', 'Pressure1'))) count += 1;
  const _hydroVal = rowValue(row, 'hydroPressure', 'hydro_pressure', 'HydroPressure', 'Hydro Test Pressure', 'Test Pressure');
  if (_hydroVal) { if (setText(document, pressure, 'HydroPressure', _hydroVal)) count += 1; }
  else if (!childText(pressure, 'HydroPressure')) setText(document, pressure, 'HydroPressure', '0');
  if (setText(document, temperature, 'Temperature1', rowValue(row, 't1', 'T1', 'temperature1', 'Temperature1'))) count += 1;
  if (setText(document, temperature, 'Temperature2', rowValue(row, 't2', 'T2', 'temperature2', 'Temperature2'))) count += 1;
  if (setText(document, temperature, 'Temperature3', rowValue(row, 't3', 'T3', 'temperature3', 'Temperature3'))) count += 1;
  if (setText(document, branch, 'FluidDensity', rowValue(row, 'density', 'Density', 'fluidDensity', 'FluidDensity'))) count += 1;
  return count;
}

function setBranchNodeFacts(document, branch, row) {
  let count = 0;
  const pipingClass = rowValue(row, 'pipingClass', 'pipingClassResolved', 'resolvedPipingClass');
  const rating = rowValue(row, 'rating', 'branchRating');
  const boreMm = row?.sizeMm ?? row?.boreMm;
  const wallThickness = rowValue(row, 'wallThickness', 'wallThicknessMm', 'wallThk');
  const corrosion = rowValue(row, 'corrosion', 'corrosionAllowance', 'corrosionAllowanceMm');
  const material = rowValue(row, 'material', 'materialName');
  const materialCode = rowValue(row, 'materialCode', 'materialNumber');

  for (const node of childrenByName(branch, 'Node')) {
    if (setText(document, node, 'PipingClass', pipingClass)) count += 1;
    if (setText(document, node, 'Rating', rating)) count += 1;
    // Run parity is the final writer: never overwrite physical node OD with
    // the branch nominal size (which may include stale staged bore evidence).
    const nodeBore = resolveXmlCiiNodeBoreFromOutsideDiameter(
      childText(node, 'OutsideDiameter') || childText(node, 'OuterDiameter'), boreMm);
    if (nodeBore != null && setText(document, node, 'BoreMm', nodeBore.toFixed(3))) count += 1;
    if (setText(document, node, 'WallThickness', numberText(wallThickness))) count += 1;
    if (setText(document, node, 'CorrosionAllowance', numberText(corrosion))) count += 1;
    if (setText(document, node, 'MaterialName', material)) count += 1;
    if (setText(document, node, 'MaterialCode', materialCode)) count += 1;
  }
  if (setText(document, branch, 'MaterialNumber', materialCode)) count += 1;
  return count;
}

function rowsByBranchName(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const branchName = row?.branchName;
    if (text(branchName)) map.set(text(branchName), row);
    const normalized = normalizeBranchKey(branchName);
    if (normalized) map.set(normalized, row);
  }
  return map;
}

function rowForBranch(map, branchName) {
  return map.get(text(branchName)) || map.get(normalizeBranchKey(branchName)) || null;
}

function branchNodes(branch) {
  return childrenByName(branch, 'Node');
}

function pointFromPosition(positionText) {
  const values = text(positionText).match(/-?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  if (values.length >= 3) return [values[0], values[2], -values[1]];
  return null;
}

function distanceBetweenPositions(fromText, toText) {
  const from = pointFromPosition(fromText);
  const to = pointFromPosition(toText);
  if (!from || !to) return null;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return Number.isFinite(length) ? length : null;
}

function previousPositiveNode(nodes, startIndex) {
  for (let index = startIndex; index >= 0; index -= 1) {
    const number = numericValue(childText(nodes[index], 'NodeNumber'));
    if (number !== null && number > 0) return nodes[index];
  }
  return null;
}

function sameComponentRefMate(nodes, index) {
  const node = nodes[index];
  const ref = childText(node, 'ComponentRefNo');
  const endpoint = childText(node, 'Endpoint');
  if (!ref) return null;
  for (let cursor = index + 1; cursor < nodes.length; cursor += 1) {
    if (childText(nodes[cursor], 'ComponentRefNo') === ref && childText(nodes[cursor], 'Endpoint') !== endpoint) return nodes[cursor];
  }
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (childText(nodes[cursor], 'ComponentRefNo') === ref && childText(nodes[cursor], 'Endpoint') !== endpoint) return nodes[cursor];
  }
  return null;
}

function shouldAnnotateInlineLength(node) {
  return INLINE_LENGTH_COMPONENT_TYPES.has(childText(node, 'ComponentType').toUpperCase());
}

function annotateInlineElementLengths(document, enriched) {
  let count = 0;
  for (const branch of [...document.getElementsByTagName('Branch')]) {
    const nodes = branchNodes(branch);
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!shouldAnnotateInlineLength(node)) continue;
      const nodeNumber = numericValue(childText(node, 'NodeNumber'));
      if (nodeNumber === null || nodeNumber >= 0) continue;
      const existing = numericValue(childText(node, 'ElementLengthMm'));
      if (existing !== null && existing > 0) continue;

      const mate = sameComponentRefMate(nodes, index);
      const previous = previousPositiveNode(nodes, index - 1);
      const length = mate
        ? distanceBetweenPositions(childText(node, 'Position'), childText(mate, 'Position'))
        : previous
          ? distanceBetweenPositions(childText(previous, 'Position'), childText(node, 'Position'))
          : null;
      if (length === null || length <= 0) continue;
      if (setText(document, node, 'ElementLengthMm', length.toFixed(3))) count += 1;
    }
  }
  enriched.stats = enriched.stats && typeof enriched.stats === 'object' ? enriched.stats : {};
  enriched.stats.inlineElementLengthAnnotations = count;
  enriched.stats.instElementLengthAnnotations = count;
  if (count > 0) {
    enriched.diagnostics = Array.isArray(enriched.diagnostics) ? enriched.diagnostics : [];
    enriched.diagnostics.push({
      type: 'element-length-inline-negative',
      componentTypes: [...INLINE_LENGTH_COMPONENT_TYPES],
      annotatedNodes: count,
      message: 'ElementLengthMm calculated for negative inline FLAN/VALV/RIGID/INST nodes from paired component endpoints or previous positive-node CII coordinate distance. GASK nodes are dropped before this step.',
    });
  }
  return count;
}

function nodeDescriptor(node) {
  return [childText(node, 'ComponentType'), childText(node, 'NodeName'), childText(node, 'ComponentRefNo'), childText(node, 'DTXR_POS'), childText(node, 'TEEDESC_POS')].map(text).filter(Boolean).join(' ').toUpperCase();
}

function isDtxrPosTeeOrOletNode(node) {
  const componentType = childText(node, 'ComponentType').toUpperCase();
  if (DTXR_POS_SIF_ZERO_TYPES.has(componentType)) return true;
  const descriptor = nodeDescriptor(node);
  return /\bTEE\b/.test(descriptor) || /OLET\b/.test(descriptor);
}

function nodeHasResolvedDtxrPos(node) {
  return !!(childText(node, 'DTXR_POS') || childText(node, 'TEEDESC_POS'));
}

function applyDtxrPosSifZero(document, enriched) {
  let count = 0;
  const diagnostics = [];
  for (const node of [...document.getElementsByTagName('Node')]) {
    if (!nodeHasResolvedDtxrPos(node)) continue;
    if (!isDtxrPosTeeOrOletNode(node)) continue;
    if (setText(document, node, 'SIF', '0')) count += 1;
    diagnostics.push({ type: 'dtxr-pos-sif-zero', nodeNumber: childText(node, 'NodeNumber'), componentType: childText(node, 'ComponentType'), dtxrPos: childText(node, 'DTXR_POS') || childText(node, 'TEEDESC_POS'), message: 'DTXR_POS-matched Tee/Olet node assigned SIF=0 before CII worker conversion.' });
  }
  enriched.stats = enriched.stats && typeof enriched.stats === 'object' ? enriched.stats : {};
  enriched.stats.dtxrPosSifZeroAnnotations = count;
  if (diagnostics.length) {
    enriched.diagnostics = Array.isArray(enriched.diagnostics) ? enriched.diagnostics : [];
    enriched.diagnostics.push(...diagnostics);
  }
  return count;
}

function positiveNodeNumberFromOriginal(originalNumbers, nodes, startIndex, step) {
  for (let index = startIndex; index >= 0 && index < nodes.length; index += step) {
    const original = originalNumbers.get(nodes[index]);
    if (original !== null && original !== undefined && original > 0) return Math.round(original);
  }
  return null;
}

function ensureResolvedRigidMarker(document, node, componentType) {
  if (RESOLVED_RIGID_MARKER_TYPES.has(componentType)) return setTextAfter(document, node, 'Rigid', '2', 'Endpoint');
  if (RESOLVED_FLEXIBLE_MARKER_TYPES.has(componentType)) return setTextAfter(document, node, 'Rigid', '1', 'Endpoint');
  return false;
}

function negativeNodeEligible(originalNumbers, node) {
  const nodeNumber = originalNumbers.get(node);
  const componentType = childText(node, 'ComponentType').toUpperCase();
  const elementLength = numericValue(childText(node, 'ElementLengthMm'));
  return nodeNumber !== null && nodeNumber !== undefined && nodeNumber < 0
    && RENUMBERABLE_NEGATIVE_TYPES.has(componentType)
    && elementLength !== null && elementLength > 0;
}

function allocateContiguousNumbers(nodes, start, end, originalNumbers, used, fallback) {
  const count = end - start;
  const previous = positiveNodeNumberFromOriginal(originalNumbers, nodes, start - 1, -1);
  const next = positiveNodeNumberFromOriginal(originalNumbers, nodes, end, 1);
  let first = next !== null && next - count > 0 ? next - count : null;
  if (first !== null && previous !== null && first <= previous) first = null;
  if (first === null && previous !== null) first = previous + 1;
  if (first !== null && next !== null && first + count > next) first = null;
  if (first !== null) {
    const candidateNumbers = Array.from({ length: count }, (_, offset) => first + offset);
    if (!candidateNumbers.some((candidate) => used.has(candidate))) return candidateNumbers;
  }
  const fallbackNumbers = [];
  for (let offset = 0; offset < count; offset += 1) {
    while (used.has(fallback.value)) fallback.value += 10;
    fallbackNumbers.push(fallback.value);
    fallback.value += 10;
  }
  return fallbackNumbers;
}

function renumberLengthBearingNegativeNodes(document) {
  const branches = [...document.getElementsByTagName('Branch')];
  const nodesByBranch = branches.map(branchNodes);
  const originalNumbers = new Map();
  const used = new Set();
  for (const nodes of nodesByBranch) {
    for (const node of nodes) {
      const number = numericValue(childText(node, 'NodeNumber'));
      originalNumbers.set(node, number);
      if (number !== null && number > 0) used.add(Math.round(number));
    }
  }

  const fallback = { value: 10000 };
  let changed = 0;
  let rigidMarkers = 0;
  let blocks = 0;
  for (const nodes of nodesByBranch) {
    let index = 0;
    while (index < nodes.length) {
      if (!negativeNodeEligible(originalNumbers, nodes[index])) { index += 1; continue; }
      const start = index;
      while (index < nodes.length && negativeNodeEligible(originalNumbers, nodes[index])) index += 1;
      const numbers = allocateContiguousNumbers(nodes, start, index, originalNumbers, used, fallback);
      if (numbers.length > 1) blocks += 1;
      numbers.forEach((assigned, offset) => {
        const node = nodes[start + offset];
        const componentType = childText(node, 'ComponentType').toUpperCase();
        setText(document, node, 'NodeNumber', assigned);
        if (ensureResolvedRigidMarker(document, node, componentType)) rigidMarkers += 1;
        used.add(assigned);
        changed += 1;
      });
    }
  }
  return { renumberedNodes: changed, rigidMarkers, condensedValveFlangeBlocks: blocks };
}

function applyCondenseRigidOption(enriched, document, options = {}) {
  const config = enriched?.config || {};
  const enabled = truthy(config.splitCondensedValveFlange) || truthy(config.split_condensed_valve_flange) || truthy(options?.splitCondensedValveFlange) || truthy(options?.split_condensed_valve_flange);
  enriched.stats = enriched.stats && typeof enriched.stats === 'object' ? enriched.stats : {};
  enriched.stats.condenseRigidXsd = truthy(config.condenseRigidXsd) || truthy(options?.condenseRigidXsd);
  enriched.stats.splitCondensedValveFlange = enabled;
  enriched.stats.split_condensed_valve_flange = enabled;
  if (!enabled) return 0;
  const result = renumberLengthBearingNegativeNodes(document);
  enriched.stats.splitCondensedRigidNodes = result.renumberedNodes;
  enriched.stats.instRigid2Annotations = result.rigidMarkers;
  enriched.stats.resolvedRigidMarkers = result.rigidMarkers;
  enriched.stats.condensedValveFlangeBlocks = result.condensedValveFlangeBlocks;
  enriched.diagnostics = Array.isArray(enriched.diagnostics) ? enriched.diagnostics : [];
  enriched.diagnostics.push({
    type: 'split-condensed-valve-flange-resolved',
    enabled: true,
    split_condensed_valve_flange: true,
    renumberedNodes: result.renumberedNodes,
    instRigid2Annotations: result.rigidMarkers,
    condensedValveFlangeBlocks: result.condensedValveFlangeBlocks,
    message: 'Resolved Condense Rigid option applied: contiguous negative FLAN/VALV/RIGID/INST inline blocks are length-annotated, assigned stable positive node numbers in order, and resolved rigid/inline components are marked with Rigid after Endpoint before CII conversion. GASK nodes are dropped before this step.',
  });
  return result.renumberedNodes;
}

function processProvenanceDiagnostics(row) {
  const fieldSpecs = [['p1', 'Pressure1 / P1 / Design Pressure'], ['hydroPressure', 'Hydro/Test Pressure'], ['t1', 'Temperature1 / T1'], ['t2', 'Temperature2 / T2'], ['t3', 'Temperature3 / T3'], ['density', 'FluidDensity / Density']];
  return fieldSpecs.map(([field, label]) => {
    const source = row?.[`${field}Source`] || 'none';
    const sourceField = row?.[`${field}SourceField`] || '';
    const finalValue = row?.[field] ?? '';
    return { type: 'process-provenance', branchName: row?.branchName || '', lineKey: row?.lineKey || '', field, fieldLabel: label, lineListRowFound: row?.lineMiss ? 'no' : 'yes', sourceRowIndex: row?._sourceRowIndex || row?.lineListRowIndex || '', method: source, sourceField, value: finalValue, message: `${label}: final=${text(finalValue) || '(blank)'}; source=${source}${sourceField ? `; field=${sourceField}` : ''}; rowFound=${row?.lineMiss ? 'no' : 'yes'}${row?._sourceRowIndex ? `; sourceRow=${row._sourceRowIndex}` : ''}` };
  });
}

function applyPreviewRunParity(enriched, sourceXmlText, stagedJsonText, options = {}) {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return enriched;
  enriched.config = configWithRuntimeOptions(enriched.config, options);
  const document = new DOMParser().parseFromString(enriched.xmlText, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) return enriched;
  if (shouldDropGasketNodes(enriched.config, options)) dropGasketNodesFromDocument(document, enriched.stats, enriched.diagnostics, 'post-base-pre-parity');

  const rows = xmlCiiDryRunPreview(sourceXmlText, enriched.config, stagedJsonText).branchRows || [];
  if (!rows.length) {
    annotateInlineElementLengths(document, enriched);
    applyDtxrPosSifZero(document, enriched);
    applyCondenseRigidOption(enriched, document, options);
    enriched.xmlText = new XMLSerializer().serializeToString(document);
    enriched.diagnostics = Array.isArray(enriched.diagnostics) ? enriched.diagnostics : [];
    enriched.diagnostics.push({ type: 'preview-run-parity-skipped', reason: 'no-preview-branch-rows' });
    return enriched;
  }

  const byBranch = rowsByBranchName(rows);
  let branchCount = 0;
  let processCount = 0;
  let nodeFactCount = 0;
  const missedBranches = [];
  const provenanceRows = [];

  for (const branch of [...document.getElementsByTagName('Branch')]) {
    const branchName = childText(branch, 'Branchname');
    const row = rowForBranch(byBranch, branchName);
    if (!row) { if (branchName) missedBranches.push(branchName); continue; }
    branchCount += 1;
    processCount += setProcessBlock(document, branch, row);
    nodeFactCount += setBranchNodeFacts(document, branch, row);
    provenanceRows.push(...processProvenanceDiagnostics(row));
  }

  annotateInlineElementLengths(document, enriched);
  applyDtxrPosSifZero(document, enriched);
  applyCondenseRigidOption(enriched, document, options);
  enriched.xmlText = new XMLSerializer().serializeToString(document);
  enriched.stats = enriched.stats && typeof enriched.stats === 'object' ? enriched.stats : {};

  if (!branchCount) {
    enriched.diagnostics = Array.isArray(enriched.diagnostics) ? enriched.diagnostics : [];
    enriched.diagnostics.push({ type: 'preview-run-parity-skipped', reason: 'no-branch-name-match', previewRows: rows.length, missedBranches: missedBranches.slice(0, 20) });
    return enriched;
  }
  enriched.stats.previewRunParityBranches = branchCount;
  enriched.stats.previewRunParityProcessFields = processCount;
  enriched.stats.previewRunParityNodeFacts = nodeFactCount;
  enriched.stats.processAnnotations = Math.max(Number(enriched.stats.processAnnotations || 0), processCount);
  enriched.diagnostics = Array.isArray(enriched.diagnostics) ? enriched.diagnostics : [];
  enriched.diagnostics.push(...provenanceRows);
  enriched.diagnostics.push({ type: 'preview-run-parity-applied', branches: branchCount, processFields: processCount, nodeFacts: nodeFactCount, previewRows: rows.length, missedBranches: missedBranches.slice(0, 20), message: 'Run/enriched XML was synchronised from the same dry-run preview resolver used by phase 3, including mapped Hydro/Test pressure and process provenance diagnostics.' });
  return enriched;
}

export async function enrichXmlForCii2019(xmlTextVal, stagedJsonText, options = {}) {
  const preparedSource = dropGasketNodesFromXmlText(xmlTextVal, options);
  const enriched = await enrichXmlForCii2019Base(preparedSource.xmlText, stagedJsonText, options);
  enriched.stats = { ...(enriched.stats || {}), ...(preparedSource.stats || {}) };
  enriched.diagnostics = [...(preparedSource.diagnostics || []), ...(Array.isArray(enriched.diagnostics) ? enriched.diagnostics : [])];
  return applyPreviewRunParity(enriched, preparedSource.xmlText, stagedJsonText, options);
}
