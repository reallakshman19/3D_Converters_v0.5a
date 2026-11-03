/**
 * Read-only post-enrichment RIGID projection audit. The allRows edge census
 * includes zero, missing and invalid weights; rows retains the positive-only
 * empirical API contract. Actual post-Python edge identity is authoritative
 * only in xml_to_cii2019_rigid_ledger.py, not this pre-Python projection.
 * xml_to_cii2019.py. Never changes an assigned component mass.
 * Element lengths and component spans are diagnostic measurements only;
 * empirical A1/A2 ±50% deviation is the sole numeric review gate.
 */
function text(value) { return value == null ? '' : String(value).trim(); }
function weightState(value) {
  if (value == null || String(value).trim() === '') return 'MISSING';
  const number = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(number)) return 'INVALID';
  if (number < 0) return 'NEGATIVE';
  if (number === 0) return 'ZERO';
  return 'POSITIVE';
}
function positive(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function localName(node) { return text(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
function child(node, name) {
  return [...(node?.childNodes || [])].find((item) => item.nodeType === 1 && localName(item) === name);
}
function childText(node, name) { return text(child(node, name)?.textContent); }
function reference(value) { return text(value).replace(/^=/, '').replace(/\s+/g, '').toUpperCase(); }
function position(value) {
  if (Array.isArray(value) && value.length >= 3) {
    const parts = value.slice(0, 3).map(Number);
    return parts.every(Number.isFinite) ? parts : null;
  }
  const values = text(value).match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (values.length < 3) return null;
  return values.slice(0, 3);
}
function distance(left, right) {
  const a = position(left);
  const b = position(right);
  return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : null;
}
function componentSpan(nodes, ref) {
  if (!ref) return null;
  const source = nodes.filter((node) => reference(node.componentRefNo) === ref);
  const first = source.filter((node) => text(node.endpoint) === '1');
  const second = source.filter((node) => text(node.endpoint) === '2');
  const spans = first.flatMap((a) => second.map((b) => distance(a.position, b.position)))
    .filter((span) => span !== null && span > 0);
  if (!spans.length || spans.some((span) => Math.abs(span - spans[0]) > 0.001)) return null;
  return spans[0];
}
function sourceRows(xmlText) {
  if (typeof DOMParser === 'undefined' || !text(xmlText)) return [];
  const doc = new DOMParser().parseFromString(text(xmlText), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid enriched XML for rigid-weight audit');
  return [...doc.getElementsByTagName('Branch')].map((branch) => ({
    branchName: childText(branch, 'Branchname'),
    nodes: [...(branch.childNodes || [])].filter((node) => node.nodeType === 1 && localName(node) === 'Node').map((node) => ({
      nodeNumber: childText(node, 'NodeNumber'),
      componentType: childText(node, 'ComponentType'),
      nodeName: childText(node, 'NodeName'),
      componentRefNo: childText(node, 'ComponentRefNo'),
      endpoint: childText(node, 'Endpoint'),
      rigid: childText(node, 'Rigid'),
      position: childText(node, 'Position'),
      weight: childText(node, 'Weight'),
      boreMm: childText(node, 'BoreMm'),
      rating: childText(node, 'Rating'),
    })),
  }));
}
function propagatedSource(row, propagationRows) {
  return propagationRows.some((item) =>
    text(item.branchName) === row.branchName
    && text(item.nodeNumber) === row.toNode
    && reference(item.componentRefNo) === row.componentRefNo
    && text(item.endpoint) === row.endpoint);
}
function auditBranch(branch, propagationRows) {
  const results = [];
  const nodes = Array.isArray(branch.nodes) ? branch.nodes : [];
  for (let index = 1; index < nodes.length; index += 1) {
    const from = nodes[index - 1], to = nodes[index];
    if (!(Number(to.rigid) === 2 || (Number(from.rigid) === 2 && text(to.componentType).toUpperCase() === 'FLAN'))) continue;
    const ownerWeightState = weightState(to.weight);
    const massKg = ownerWeightState === 'ZERO' ? 0 : positive(to.weight);
    const componentRefNo = reference(to.componentRefNo);
    const elementLengthMm = distance(from.position, to.position);
    const wholeComponentSpanMm = componentSpan(nodes, componentRefNo);
    const lengthRatio = wholeComponentSpanMm && elementLengthMm !== null ? elementLengthMm / wholeComponentSpanMm : null;
    const row = {
      branchName: text(branch.branchName), fromNode: text(from.nodeNumber), toNode: text(to.nodeNumber),
      endpoint: text(to.endpoint), componentType: text(to.componentType), nodeName: text(to.nodeName),
      componentRefNo, boreMm: positive(to.boreMm), rating: text(to.rating),
      massKg, ownerWeightState, ownerWeightRaw: text(to.weight),
      elementLengthMm, wholeComponentSpanMm, lengthRatio,
      weightOrigin: 'existing-enriched-weight', reviewFlags: [],
    };
    if (propagatedSource(row, propagationRows)) {
      row.weightOrigin = 'post-review-split-propagation';
      row.reviewFlags.push('POST_REVIEW_WEIGHT_PROPAGATION');
    }
    if (!componentRefNo) row.reviewFlags.push('WEIGHT_COMPONENT_REFERENCE_UNKNOWN');
    if (ownerWeightState === 'MISSING') row.reviewFlags.push('RIGID_OWNER_WEIGHT_MISSING');
    if (ownerWeightState === 'INVALID') row.reviewFlags.push('RIGID_OWNER_WEIGHT_INVALID');
    if (ownerWeightState === 'NEGATIVE') row.reviewFlags.push('RIGID_OWNER_WEIGHT_NEGATIVE');
    results.push(row);
  }
  const grouped = new Map();
  for (const row of results) {
    if (!row.componentRefNo || row.ownerWeightState !== 'POSITIVE') continue;
    const list = grouped.get(row.componentRefNo) || [];
    list.push(row);
    grouped.set(row.componentRefNo, list);
  }
  for (const group of grouped.values()) {
    if (group.length < 2) continue;
    for (const row of group) row.reviewFlags.push('REPEATED_COMPONENT_MASS_ON_MULTIPLE_RIGID_ELEMENTS');
  }
  return results;
}
export function auditXmlCiiRigidWeightsFromBranches(branches, options = {}) {
  const propagated = Array.isArray(options.propagationRows) ? options.propagationRows : [];
  const weightScale = options.kgToNewton === false ? 1 : 10;
  const allRows = (Array.isArray(branches) ? branches : []).flatMap((branch) => auditBranch(branch, propagated))
    .map((row) => ({ ...row, exportedWeight: row.massKg === null ? null : row.massKg * weightScale,
      exportedUnit: weightScale === 10 ? 'N' : 'kg', status: row.reviewFlags.length ? 'REVIEW_REQUIRED' : 'AUDITED' }));
  // Preserve A1/A2's positive-only observed-mass validation input contract.
  const rows = allRows.filter((row) => row.ownerWeightState === 'POSITIVE');
  const flagged = rows.filter((row) => row.reviewFlags.length);
  return {
    schema: 'xml-cii-post-enrichment-rigid-weight-audit/v1',
    authority: 'READ_ONLY_PRE_PYTHON_EXPORT_PROJECTION',
    summary: { allRigidEdges: allRows.length, positiveRigidEdges: rows.length,
      zeroRigidEdges: allRows.filter((row) => row.ownerWeightState === 'ZERO').length,
      missingRigidEdges: allRows.filter((row) => row.ownerWeightState === 'MISSING').length,
      invalidRigidEdges: allRows.filter((row) => ['INVALID', 'NEGATIVE'].includes(row.ownerWeightState)).length,
      flaggedEdges: flagged.length,
      structurallyInvalidEdges: allRows.filter((row) => ['MISSING', 'INVALID', 'NEGATIVE'].includes(row.ownerWeightState)).length,
      postReviewPropagatedEdges: rows.filter((row) => row.weightOrigin === 'post-review-split-propagation').length,
      repeatedMassEdges: rows.filter((row) => row.reviewFlags.includes('REPEATED_COMPONENT_MASS_ON_MULTIPLE_RIGID_ELEMENTS')).length },
    rows, flagged, allRows,
  };
}
export function auditXmlCiiRigidWeightsForExport(xmlText, options = {}) {
  return auditXmlCiiRigidWeightsFromBranches(sourceRows(xmlText), options);
}
