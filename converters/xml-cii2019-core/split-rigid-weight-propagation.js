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

  const groups = new Map();
  for (const node of [...document.getElementsByTagName('Node')]) {
    const record = nodeRecord(node);
    if (!record.ref) continue;
    const key = `${record.branchName}::${record.ref}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  // SAFETY: Multiple geometrical nodes with one ComponentRefNo are not
  // multiple physical owners. A single known weight is not a licence to copy
  // it to every zero/missing sibling. Ownership is decided by a separate
  // component/edge ledger, never by this propagation compatibility hook.
  const diagnostics = [];
  const ownershipIssues = [];
  let candidateGroups = 0;
  let preservedLumpedCandidates = 0;

  for (const group of groups.values()) {
    if (!isSplitRigidWeightGroup(group)) continue;
    candidateGroups += 1;
    const weights = uniquePositiveWeights(group);
    const positiveNodes = group.filter((item) => item.weight !== null && item.weight > 0);
    const blankNodes = group.filter((item) => item.weight === null || item.weight === 0);
    const negativeOrInvalidNodes = group.filter((item) => item.weight !== null && item.weight < 0);
    const evidence = {
      branchName: group[0].branchName,
      componentRefNo: group[0].componentRefNo,
      nodes: group.map((item) => ({
        nodeNumber: item.nodeNumber,
        endpoint: item.endpoint,
        rigid: item.rigid,
        componentType: item.componentType,
        position: item.position,
        weightKg: item.weight,
      })),
      positiveNodes: positiveNodes.length,
      zeroOrMissingNodes: blankNodes.length,
      uniquePositiveWeights: weights,
    };
    if (negativeOrInvalidNodes.length || positiveNodes.length > 1) {
      const issue = {
        type: 'split-rigid-weight-ownership-unresolved',
        allocationType: 'UNKNOWN',
        reason: negativeOrInvalidNodes.length ? 'negative-node-weight' : 'multiple-positive-sibling-weights',
        ...evidence,
        message: 'Split FLAN/RIGID component has conflicting or invalid node weights. Establish physical ownership and an authorized allocation before export; no mass was copied or removed.',
      };
      ownershipIssues.push(issue);
      diagnostics.push(issue);
    } else if (positiveNodes.length === 1 && blankNodes.length > 0) {
      preservedLumpedCandidates += 1;
      diagnostics.push({
        type: 'split-rigid-weight-owner-candidate-preserved',
        allocationType: 'UNKNOWN',
        reason: 'one-positive-owner-candidate',
        ...evidence,
        message: 'Preserved the sole positive node weight and its zero/missing siblings without propagation. The owner candidate still requires ledger ownership validation.',
      });
    }
  }

  return {
    xmlText, // preserve the exact approved XML bytes
    appliedCount: 0,
    appliedRows: [],
    diagnostics,
    ownershipIssues,
    stats: {
      splitRigidWeightPropagationGroups: candidateGroups,
      splitRigidWeightPropagated: 0,
      splitRigidWeightPropagationSkipped: candidateGroups,
      splitRigidWeightOwnerCandidatesPreserved: preservedLumpedCandidates,
      splitRigidWeightOwnershipIssues: ownershipIssues.length,
    },
  };
}
