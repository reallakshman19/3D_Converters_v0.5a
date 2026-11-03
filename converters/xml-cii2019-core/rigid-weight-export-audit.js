/**
 * Read-only post-enrichment audit of the positive RIGID weights emitted by
 * xml_to_cii2019.py. Never changes an assigned component mass.
 */
function text(value) { return value == null ? '' : String(value).trim(); }
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
    .filter((span) => span !== null && span > 6);
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
function auditBranch(branch, propagationRows, ratioThreshold) {
  const results = [];
  const nodes = Array.isArray(branch.nodes) ? branch.nodes : [];
  for (let index = 1; index < nodes.length; index += 1) {
    const from = nodes[index - 1], to = nodes[index];
    if (!(Number(to.rigid) === 2 || (Number(from.rigid) === 2 && text(to.componentType).toUpperCase() === 'FLAN'))) continue;
    const massKg = positive(to.weight);
    if (massKg === null) continue;
    const componentRefNo = reference(to.componentRefNo);
    const elementLengthMm = distance(from.position, to.position);
    const wholeComponentSpanMm = componentSpan(nodes, componentRefNo);
    const lengthRatio = wholeComponentSpanMm && elementLengthMm !== null ? elementLengthMm / wholeComponentSpanMm : null;
    const row = {
      branchName: text(branch.branchName), fromNode: text(from.nodeNumber), toNode: text(to.nodeNumber),
      endpoint: text(to.endpoint), componentType: text(to.componentType),
      componentRefNo, boreMm: positive(to.boreMm), rating: text(to.rating),
      massKg, elementLengthMm, wholeComponentSpanMm, lengthRatio,
      weightOrigin: 'existing-enriched-weight', reviewFlags: [],
    };
    if (propagatedSource(row, propagationRows)) {
      row.weightOrigin = 'post-review-split-propagation';
      row.reviewFlags.push('POST_REVIEW_WEIGHT_PROPAGATION');
    }
    if (lengthRatio !== null && lengthRatio < ratioThreshold) {
      row.reviewFlags.push('FULL_COMPONENT_WEIGHT_ON_SHORT_RIGID_ELEMENT');
    }
    // This is an explicit review trigger, never an automatic weight rejection:
    // even without paired component endpoints a very short, heavy rigid edge
    // must not silently escape the Weight Match and final review workflow.
    if (elementLengthMm !== null && elementLengthMm > 6 && elementLengthMm <= 40 && massKg >= 10) {
      row.reviewFlags.push('SHORT_HEAVY_RIGID_ELEMENT_REQUIRES_REVIEW');
    }
    if (!componentRefNo) row.reviewFlags.push('WEIGHT_COMPONENT_REFERENCE_UNKNOWN');
    results.push(row);
  }
  const grouped = new Map();
  for (const row of results) {
    if (!row.componentRefNo) continue;
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
  const ratioThreshold = Number.isFinite(options.ratioThreshold) ? options.ratioThreshold : 0.65;
  const weightScale = options.kgToNewton === false ? 1 : 10;
  const rows = (Array.isArray(branches) ? branches : []).flatMap((branch) => auditBranch(branch, propagated, ratioThreshold))
    .map((row) => ({ ...row, exportedWeight: row.massKg * weightScale, exportedUnit: weightScale === 10 ? 'N' : 'kg', status: row.reviewFlags.length ? 'REVIEW_REQUIRED' : 'AUDITED' }));
  const flagged = rows.filter((row) => row.reviewFlags.length);
  return {
    schema: 'xml-cii-post-enrichment-rigid-weight-audit/v1',
    authority: 'READ_ONLY_FINAL_EXPORT_RECONCILIATION',
    summary: { positiveRigidEdges: rows.length, flaggedEdges: flagged.length, postReviewPropagatedEdges: rows.filter((row) => row.weightOrigin === 'post-review-split-propagation').length, repeatedMassEdges: rows.filter((row) => row.reviewFlags.includes('REPEATED_COMPONENT_MASS_ON_MULTIPLE_RIGID_ELEMENTS')).length },
    rows, flagged,
  };
}
export function auditXmlCiiRigidWeightsForExport(xmlText, options = {}) {
  return auditXmlCiiRigidWeightsFromBranches(sourceRows(xmlText), options);
}
