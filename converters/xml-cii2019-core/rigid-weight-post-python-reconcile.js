import { auditXmlCiiRigidWeightsForExport } from './rigid-weight-export-audit.js';

const text = (value) => String(value ?? '').trim();
const ref = (value) => text(value).replace(/^=/, '').replace(/\s+/g, '').toUpperCase();
const almost = (a, b) => Number.isFinite(a) && Number.isFinite(b)
  && Math.abs(a - b) <= Math.max(1e-8, Math.abs(a) * 1e-9, Math.abs(b) * 1e-9);

function parsePoint(value) {
  if (Array.isArray(value)) {
    const values = value.slice(0, 3).map(Number);
    return values.length === 3 && values.every(Number.isFinite) ? values : null;
  }
  const values = text(value).split(/[\s,]+/).map(Number);
  return values.length === 3 && values.every(Number.isFinite) ? values : null;
}
function samePoint(left, right) {
  const a = parsePoint(left), b = parsePoint(right);
  return !!a && !!b && a.every((x, i) => almost(x, b[i]));
}
function xmlChild(node, name) {
  return [...(node?.childNodes || [])].find((child) =>
    child.nodeType === 1 && String(child.localName || child.nodeName).replace(/^.*:/, '') === name);
}
const childText = (node, name) => text(xmlChild(node, name)?.textContent);

function preparedOwners(preparedXmlText) {
  if (typeof DOMParser === 'undefined') throw new Error('DOMParser unavailable for final Python RIGID custody.');
  const document = new DOMParser().parseFromString(preparedXmlText, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) {
    throw new Error('Reviewed RIGID input XML is invalid.');
  }
  const rows = [];
  const branches = [...document.getElementsByTagName('Branch')];
  branches.forEach((branch, branchOrdinal) => {
    const branchName = childText(branch, 'Branchname');
    const nodes = [...(branch.childNodes || [])].filter((node) =>
      node.nodeType === 1 && String(node.localName || node.nodeName).replace(/^.*:/, '') === 'Node');
    nodes.forEach((node, nodeOrdinal) => {
      const raw = childText(node, 'Weight');
      const massKg = raw === '' ? null : Number(raw.replace(/,/g, ''));
      rows.push({
        branchName, branchOrdinal, nodeOrdinal,
        nodeNumber: childText(node, 'NodeNumber'),
        endpoint: childText(node, 'Endpoint'),
        componentType: childText(node, 'ComponentType').toUpperCase(),
        componentRefNo: ref(childText(node, 'ComponentRefNo')),
        position: childText(node, 'Position'),
        massKg: raw && Number.isFinite(massKg) ? massKg : null,
      });
    });
  });
  return rows;
}
async function sha256(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof TextEncoder === 'undefined') {
    throw new Error('SHA-256 unavailable; cannot verify final Python RIGID CII.');
  }
  const data = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(data)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function rigidSectionNumbers(ciiText) {
  const lines = ciiText.split(/\r?\n/);
  const marker = lines.indexOf('#$ RIGID');
  if (marker === -1) throw new Error('CII RIGID auxiliary section is missing.');
  const numbers = [];
  for (let i = marker + 1; i < lines.length && !lines[i].startsWith('#$ '); i++) {
    if (!lines[i].trim()) continue;
    const value = Number(lines[i].trim().split(/\s+/)[0]);
    if (!Number.isFinite(value)) throw new Error('Invalid CII RIGID auxiliary weight field.');
    numbers.push(value);
  }
  return numbers;
}

/**
 * Verify that every emitted RIGID auxiliary is byte-consistent and any
 * positive owner is uniquely traceable to the exact reviewed enriched XML.
 * No inferred owner, segment allocation or empirical estimate is accepted.
 */
export async function reconcileFinalPythonRigidWeights({
  reviewedXmlText, ciiText, rigidLedger, kgToNewton = true,
}) {
  if (!text(reviewedXmlText) || !text(ciiText)) {
    throw new Error('Approved XML and emitted CII are both required for RIGID reconciliation.');
  }
  if (rigidLedger?.schema !== 'xml-cii-rigid-python-emission-ledger/v1'
    || rigidLedger?.authority !== 'ACTUAL_PYTHON_MODEL_AND_EMITTED_CII'
    || !Array.isArray(rigidLedger?.rows)) {
    throw new Error('Actual Python RIGID emission ledger missing or untrusted; CII release blocked.');
  }
  const actualCiiSha = await sha256(ciiText);
  if (rigidLedger.ciiSha256 !== actualCiiSha) {
    throw new Error('Python RIGID ledger CII SHA-256 does not match the returned CII bytes.');
  }
  const scale = kgToNewton === false ? 1 : 10;
  if (!almost(Number(rigidLedger.weightScale), scale)) {
    throw new Error('Python RIGID ledger unit scale differs from reviewed export options.');
  }
  const records = rigidSectionNumbers(ciiText);
  if (records.length !== rigidLedger.rows.length) {
    throw new Error('CII RIGID auxiliary count does not match Python emission ledger.');
  }
  const owners = preparedOwners(reviewedXmlText);
  const preAudit = auditXmlCiiRigidWeightsForExport(reviewedXmlText, { kgToNewton });
  const positiveOwners = (preAudit.allRows || []).filter((row) => row.ownerWeightState === 'POSITIVE');
  const matchedPositives = new Set();
  let zeroEdges = 0;
  let positiveEdges = 0;
  for (const [index, row] of rigidLedger.rows.entries()) {
    if (row.rigidAuxIndex !== index + 1) {
      throw new Error('Python RIGID auxiliary indices are not one-to-one and sequential.');
    }
    const emitted = Number(row.emittedCiiMass);
    const mass = Number(row.massKg);
    if (!Number.isFinite(mass) || mass < 0 || !Number.isFinite(emitted)
      || !almost(emitted, records[index]) || !almost(emitted, mass * scale)) {
      throw new Error(`Python RIGID auxiliary ${index + 1} has an invalid or inconsistent mass.`);
    }
    if (mass === 0) { zeroEdges++; continue; }
    positiveEdges++;
    const matches = owners.filter((owner) =>
      owner.branchName === row.branchName
      && owner.nodeNumber === String(row.toNode)
      && owner.componentRefNo === ref(row.componentRefNo)
      && owner.componentType === text(row.toComponentType).toUpperCase()
      && (owner.endpoint || '') === (row.toEndpoint == null ? '' : String(row.toEndpoint))
      && samePoint(owner.position, row.toPosition));
    if (matches.length !== 1 || !almost(matches[0].massKg, mass)) {
      throw new Error(`Positive Python RIGID edge ${row.fromNode} → ${row.toNode} lacks one exact approved source owner/mass. ` +
        'Python may have changed the geometry, component assignment, node identity or weight.');
    }
    const owner = matches[0];
    const preMatch = positiveOwners.filter((entry) =>
      entry.branchName === row.branchName && entry.toNode === String(row.toNode)
      && ref(entry.componentRefNo) === ref(row.componentRefNo)
      && almost(entry.massKg, mass));
    if (preMatch.length !== 1) {
      throw new Error(`Positive RIGID mass ${row.fromNode} → ${row.toNode} has no unique pre-Python exported owner edge.`);
    }
    const key = `${owner.branchOrdinal}:${owner.nodeOrdinal}`;
    if (matchedPositives.has(key)) {
      throw new Error(`Physical RIGID owner ${key} was emitted more than once; CII duplicated component mass.`);
    }
    matchedPositives.add(key);
  }
  if (matchedPositives.size !== positiveOwners.length) {
    throw new Error(`RIGID mass lost between review and Python output: ${positiveOwners.length} positive reviewed edges, ${matchedPositives.size} emitted.`);
  }
  if (rigidLedger.summary?.rigidAuxCount !== rigidLedger.rows.length
      || rigidLedger.summary?.positiveCount !== positiveEdges
      || rigidLedger.summary?.zeroCount !== zeroEdges) {
    throw new Error('Python RIGID manifest summary does not agree with emitted edge census.');
  }
  return { ok: true, schema: 'rigid-custody-post-python-reconciliation/v1',
    ciiSha256: actualCiiSha, totalEdges: rigidLedger.rows.length,
    positiveEdges, zeroEdges, sourceOwnersReconciled: matchedPositives.size };
}
