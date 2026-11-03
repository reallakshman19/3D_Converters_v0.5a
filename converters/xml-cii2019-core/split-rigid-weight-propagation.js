const SPLIT_WEIGHT_COMPONENT_TYPES = new Set(['FLAN', 'RIGID']);

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

function numeric(value) {
  const cleaned = text(value).replace(/,/g, '');
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function normalizeRef(value) {
  return text(value).replace(/^=/, '').replace(/\s+/g, '').toUpperCase();
}

function branchNameForNode(node) {
  let current = node?.parentNode || null;
  while (current) {
    if (current.nodeType === 1 && localName(current) === 'Branch') return childText(current, 'Branchname');
    current = current.parentNode || null;
  }
  return '';
}

function nodeRecord(node) {
  return {
    node,
    branchName: branchNameForNode(node),
    nodeNumber: childText(node, 'NodeNumber'),
    endpoint: childText(node, 'Endpoint'),
    rigid: childText(node, 'Rigid'),
    componentType: childText(node, 'ComponentType').toUpperCase(),
    componentRefNo: childText(node, 'ComponentRefNo'),
    ref: normalizeRef(childText(node, 'ComponentRefNo')),
    position: childText(node, 'Position'),
    weight: numeric(childText(node, 'Weight')),
  };
}

function isSplitRigidWeightGroup(group) {
  if (!Array.isArray(group) || group.length < 2) return false;
  if (!group[0]?.ref) return false;
  const types = group.map((item) => item.componentType).filter(Boolean);
  if (!types.length) return false;
  if (!types.some((type) => SPLIT_WEIGHT_COMPONENT_TYPES.has(type))) return false;
  return types.every((type) => SPLIT_WEIGHT_COMPONENT_TYPES.has(type));
}

function uniquePositiveWeights(group) {
  const values = [];
  for (const item of group) {
    const weight = Number(item.weight);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (!values.some((existing) => Math.abs(existing - weight) <= 1e-9)) values.push(weight);
  }
  return values;
}

export function applyXmlCiiSplitRigidWeightPropagation(xmlText, options = {}) {
  const empty = {
    xmlText,
    appliedCount: 0,
    appliedRows: [],
    diagnostics: [],
    ownershipIssues: [],
    componentLedger: [],
    stats: {
      splitRigidWeightPropagationGroups: 0,
      splitRigidWeightPropagated: 0,
      splitRigidWeightPropagationSkipped: 0,
      splitRigidWeightOwnerCandidatesPreserved: 0,
      splitRigidWeightOwnershipIssues: 0,
    },
  };
  if (!text(xmlText) || typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return empty;

  let document = null;
  try {
    document = new DOMParser().parseFromString(text(xmlText), 'application/xml');
    if (document.getElementsByTagName('parsererror').length) return empty;
  } catch {
    return empty;
  }

  const diagnostics = [];
  const ownershipIssues = [];
  const componentLedger = [];
  const sourceId = text(options.sourceId || options.sourceFileId);
  const snapshotDigest = text(options.snapshotDigest);
  const allocations = options.ownershipAllocations || {};
  const configuredAllocation = (key) => allocations instanceof Map ? allocations.get(key) : allocations?.[key];
  let candidateGroups = 0;
  let preservedLumpedCandidates = 0;

  // Build an occurrence-level census. Two disconnected component occurrences
  // must not become one group because their Branchname or ComponentRefNo repeats.
  const branches = [...document.getElementsByTagName('Branch')];
  for (let branchOrdinal = 0; branchOrdinal < branches.length; branchOrdinal += 1) {
    const branch = branches[branchOrdinal];
    const branchName = childText(branch, 'Branchname');
    const nodes = childrenByName(branch, 'Node');
    let active = [];
    const flush = () => {
      if (active.length < 2 || !isSplitRigidWeightGroup(active)) { active = []; return; }
      candidateGroups += 1;
      const group = active;
      active = [];
      const ref = group[0].ref;
      const componentOccurrenceId =
        'rigid-split:' + encodeURIComponent(sourceId || 'UNSCOPED') +
        ':branch-' + branchOrdinal + ':node-' + group[0].nodeOrdinal +
        ':ref-' + encodeURIComponent(ref);
      const positives = group.filter((item) => item.weight !== null && item.weight > 0);
      const negatives = group.filter((item) => item.weight !== null && item.weight < 0);
      const invalids = group.filter((item) => item.weightRaw && item.weight === null);
      const blanks = group.filter((item) => item.weight === null || item.weight === 0);
      const masses = uniquePositiveWeights(group);
      const allocation = configuredAllocation(componentOccurrenceId);
      const componentMassKg = allocation ? Number(allocation.componentMassKg) : null;
      const evidence = {
        sourceId, snapshotDigest, branchName, branchOrdinal,
        componentOccurrenceId, componentRefNo: group[0].componentRefNo,
        nodes: group.map((item) => ({
          nodeOrdinal: item.nodeOrdinal,
          nodeNumber: item.nodeNumber, endpoint: item.endpoint, rigid: item.rigid,
          componentType: item.componentType, position: item.position,
          weightKg: item.weight, weightRaw: item.weightRaw,
        })),
        positiveNodes: positives.length, zeroOrMissingNodes: blanks.length,
        uniquePositiveWeights: masses,
      };
      let allocationType = 'UNKNOWN';
      let reason = '';
      if (negatives.length || invalids.length) {
        reason = 'negative-or-invalid-node-weight';
      } else if (allocation) {
        allocationType = text(allocation.allocationType);
        if (!snapshotDigest || text(allocation.snapshotDigest) !== snapshotDigest ||
            (sourceId && text(allocation.sourceId) !== sourceId)) {
          reason = 'allocation-snapshot-mismatch';
        } else if (!Number.isFinite(componentMassKg) || componentMassKg < 0) {
          reason = 'invalid-authorized-component-mass';
        } else if (allocationType === 'COMPONENT_LUMPED') {
          const owner = group.find((item) => item.nodeOrdinal === Number(allocation.ownerNodeOrdinal));
          const valid = owner && Math.abs(Number(owner.weight) - componentMassKg) <= 1e-8 &&
            group.every((item) => item === owner || item.weight === 0);
          if (!valid) reason = 'lumped-mass-owner-or-nonowner-mismatch';
        } else if (allocationType === 'SEGMENT_DISTRIBUTED') {
          const children = Array.isArray(allocation.childMassesKg) ? allocation.childMassesKg : [];
          const allocated = new Map(children.map((child) => [Number(child.nodeOrdinal), Number(child.massKg)]));
          const sum = [...allocated.values()].reduce((total, mass) => total + mass, 0);
          const valid = children.length === group.length && allocated.size === group.length &&
            [...allocated.values()].every((mass) => Number.isFinite(mass) && mass >= 0) &&
            group.every((item) => allocated.has(item.nodeOrdinal) &&
              item.weight !== null && Math.abs(item.weight - allocated.get(item.nodeOrdinal)) <= 1e-8) &&
            Math.abs(sum - componentMassKg) <= 1e-8;
          if (!valid) reason = 'distributed-mass-not-conserved-or-unauthorized';
        } else if (allocationType === 'ZERO_NONOWNER') {
          if (componentMassKg !== 0 || !group.every((item) => item.weight === 0))
            reason = 'zero-nonowner-has-positive-or-missing-mass';
        } else {
          reason = 'unknown-allocation-type';
        }
      } else if (positives.length > 1) {
        reason = 'multiple-positive-sibling-weights';
      } else if (positives.length === 1) {
        preservedLumpedCandidates += 1;
      }
      const status = reason ? 'BLOCKED' :
        allocation ? 'VALIDATED' : positives.length ? 'OWNERSHIP_UNVERIFIED' : 'NO_POSITIVE_MASS';
      const record = { ...evidence, allocationType, status,
        authorizedComponentMassKg: allocation ? componentMassKg : null,
        reason: reason || (status === 'OWNERSHIP_UNVERIFIED' ? 'explicit-physical-owner-not-established' : ''),
      };
      componentLedger.push(record);
      if (reason || (options.requireAllocation === true && status === 'OWNERSHIP_UNVERIFIED')) {
        const issue = {
          ...record, type: 'split-rigid-weight-ownership-unresolved',
          reason: reason || 'explicit-physical-owner-not-established',
          message: 'RIGID split has unresolved physical ownership/allocation. No sibling mass was copied, changed or silently approved.',
        };
        ownershipIssues.push(issue);
        diagnostics.push(issue);
      } else if (status === 'OWNERSHIP_UNVERIFIED') {
        diagnostics.push({
          ...record, type: 'split-rigid-weight-owner-candidate-preserved',
          message: 'A sole positive owner candidate was preserved unchanged; explicit ownership is not yet validated.',
        });
      }
    };
    for (let nodeOrdinal = 0; nodeOrdinal < nodes.length; nodeOrdinal += 1) {
      const node = nodes[nodeOrdinal];
      const record = nodeRecord(node);
      record.nodeOrdinal = nodeOrdinal;
      record.weightRaw = childText(node, 'Weight');
      const isCandidate = record.ref && SPLIT_WEIGHT_COMPONENT_TYPES.has(record.componentType);
      if (!isCandidate || (active.length && record.ref !== active[0].ref)) flush();
      if (isCandidate) active.push(record);
    }
    flush();
  }

  // No mutation is permitted by this compatibility hook. A future authorised
  // SEGMENT_DISTRIBUTED allocation must be written by the owner-ledger
  // transaction, not inferred from the presence of a single positive weight.

  return {
    xmlText, // preserve the exact approved XML bytes
    appliedCount: 0,
    appliedRows: [],
    diagnostics,
    ownershipIssues,
    componentLedger,
    stats: {
      splitRigidWeightPropagationGroups: candidateGroups,
      splitRigidWeightPropagated: 0,
      splitRigidWeightPropagationSkipped: candidateGroups,
      splitRigidWeightOwnerCandidatesPreserved: preservedLumpedCandidates,
      splitRigidWeightOwnershipIssues: ownershipIssues.length,
    },
  };
}
