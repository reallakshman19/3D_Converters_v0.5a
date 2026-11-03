// Standalone XML→CII run parity
// -----------------------------
// The parent Model Converters workflow enriches the XML in the browser
// (process data, staged-support restraints with CMPSUPGAP gaps, DTXR
// annotations, weight master matches, valve/flange split renumbering) BEFORE
// the Python conversion runs. This module reuses that enrichment authority and
// now emits deterministic evidence proving that the exact XML sent to Python
// contains the Preview and Weight Match facts that were selected.

import { enrichStandaloneDtxrAnnotations } from './xml-cii-standalone-dtxr-enrichment.js';
import { createStandaloneRunParityEvidence } from './xml-cii-run-parity-evidence.js';
import { qualifiedXmlCiiRigidAutoWeightCandidate } from '../../converters/xml-cii2019-core/rigid-weight-auto-apply.js';

const PARITY_MODULE_URL = new URL(
  '../model-converters/converters/xmltocii2019_helper/enrichment-run-parity.js',
  import.meta.url,
);

function text(value) { return value === undefined || value === null ? '' : String(value); }

function parseConfig(raw) {
  try {
    const value = JSON.parse(text(raw) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function localName(node) { return text(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
function elementChildren(parent) {
  return [...(parent?.childNodes || parent?.children || [])]
    .filter((node) => node?.nodeType === undefined || node.nodeType === 1);
}
function childrenByName(parent, name) { return elementChildren(parent).filter((node) => localName(node) === name); }
function firstChild(parent, name) { return childrenByName(parent, name)[0] || null; }
function childText(parent, name) { return text(firstChild(parent, name)?.textContent).trim(); }

function ensureChild(document, parent, name) {
  let element = firstChild(parent, name);
  if (element) return element;
  element = parent?.namespaceURI && typeof document.createElementNS === 'function'
    ? document.createElementNS(parent.namespaceURI, name)
    : document.createElement(name);
  parent.appendChild(element);
  return element;
}

function setChildText(document, parent, name, value) {
  const clean = text(value).trim();
  if (!clean) return false;
  ensureChild(document, parent, name).textContent = clean;
  return true;
}

function numeric(value) {
  const n = Number(text(value).replace(/[^0-9.+-eE]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function recordExpected(entries, {
  scope,
  branchName,
  nodeNumber = '',
  path,
  field,
  value,
  kind = 'text',
  source = 'preview',
}) {
  const expected = text(value).trim();
  if (!expected) return;
  entries.push({ scope, branchName, nodeNumber, path, field, expected, kind, source });
}

const WEIGHT_BEARING_TYPES = new Set(['FLAN', 'VALV', 'RIGID', 'INST']);

function mappedNodeWeights(nodeRows, config) {
  const weights = new Map();
  const reviewProposals = [];
  for (const nr of nodeRows || []) {
    if (!WEIGHT_BEARING_TYPES.has(text(nr.componentType).toUpperCase())) continue;
    const override = Number(config?.overrides?.rigidWeight?.[nr.key]);
    const proposed = nr.weightMatch && !nr.weightMatch.zeroFallback ? Number(nr.weightMatch.weight) : NaN;
    const hasOverride = Number.isFinite(override) && override > 0;
    const best = nr.weightCandidates?.[0] || nr.weightMatch || null;
    const qualified = qualifiedXmlCiiRigidAutoWeightCandidate({ ...nr, ranking: { best } });
    const shortHeavy = Number(nr.lengthMm) > 6 && Number(nr.lengthMm) <= 40 && proposed >= 10;
    // No ranked, inferred or extrapolated proposal is permitted to become a
    // physical node mass merely because Preview selected a "best" candidate.
    const isDirectApproved = qualified
      && Math.abs(qualified.weightKg - proposed) < 1e-9
      && !shortHeavy;
    if (hasOverride || (Number.isFinite(proposed) && proposed > 0 && isDirectApproved)) {
      weights.set(`${text(nr.branchName)}|${text(nr.nodeNumber)}`, hasOverride ? override : proposed);
    } else if (Number.isFinite(proposed) && proposed > 0) {
      reviewProposals.push({
        key: text(nr.key), branchName: text(nr.branchName),
        toNode: text(nr.nodeNumber), componentType: text(nr.componentType),
        componentRefNo: text(nr.componentRefNo), endpoint: text(nr.endpoint),
        elementLengthMm: Number(nr.lengthMm) || null, proposedWeightKg: proposed,
        currentWeightKg: 0, candidate: best,
        weightOrigin: 'unreviewed-preview-weight-proposal',
        reviewFlags: [shortHeavy ? 'SHORT_HEAVY_WEIGHT_CANDIDATE' : 'UNQUALIFIED_AUTO_WEIGHT_PROPOSAL'],
      });
    }
  }
  return { weights, reviewProposals };
}

async function applyStandaloneProcessParity(xmlText, config, stagedJsonText, diagnostics) {
  const result = { xmlText, branchRows: [], nodeRows: [], expectedEntries: [], reviewProposals: [], appliedFields: 0 };
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new Error('DOMParser/XMLSerializer is unavailable for standalone run parity enrichment.');
  }
  const { xmlCiiDryRunPreview } = await import('./ui-adapted/xml-cii-adapted-preview-dryrun.js');
  const preview = xmlCiiDryRunPreview(xmlText, config, stagedJsonText || '');
  result.branchRows = Array.isArray(preview?.branchRows) ? preview.branchRows : [];
  result.nodeRows = Array.isArray(preview?.nodeRows) ? preview.nodeRows : [];
  if (!result.branchRows.length) return result;

  const { weights: nodeWeights, reviewProposals } = mappedNodeWeights(result.nodeRows, config);
  result.reviewProposals = reviewProposals;
  const byBranch = new Map(result.branchRows.map((row) => [text(row.branchName), row]));
  const document = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('Standalone run parity could not parse the enriched XML.');

  for (const branch of [...document.getElementsByTagName('Branch')]) {
    const branchName = childText(branch, 'Branchname');
    const row = byBranch.get(branchName);
    if (!row) continue;
    const pressure = ensureChild(document, branch, 'Pressure');
    const temperature = ensureChild(document, branch, 'Temperature');

    const branchWrites = [
      { owner: pressure, name: 'Pressure1', path: ['Pressure', 'Pressure1'], field: 'p1', value: row.p1, kind: 'number' },
      { owner: pressure, name: 'HydroPressure', path: ['Pressure', 'HydroPressure'], field: 'hydroPressure', value: row.hydroPressure, kind: 'number' },
      { owner: temperature, name: 'Temperature1', path: ['Temperature', 'Temperature1'], field: 't1', value: row.t1, kind: 'number' },
      { owner: temperature, name: 'Temperature2', path: ['Temperature', 'Temperature2'], field: 't2', value: row.t2, kind: 'number' },
      { owner: temperature, name: 'Temperature3', path: ['Temperature', 'Temperature3'], field: 't3', value: row.t3, kind: 'number' },
      { owner: branch, name: 'FluidDensity', path: ['FluidDensity'], field: 'density', value: row.density, kind: 'number' },
      { owner: branch, name: 'MaterialNumber', path: ['MaterialNumber'], field: 'materialCode', value: row.materialCode, kind: 'text' },
    ];

    for (const write of branchWrites) {
      const valid = write.kind === 'number' ? numeric(write.value) !== null : text(write.value).trim() !== '';
      if (!valid || !setChildText(document, write.owner, write.name, write.value)) continue;
      result.appliedFields += 1;
      recordExpected(result.expectedEntries, {
        scope: 'branch', branchName, path: write.path, field: write.field,
        value: write.value, kind: write.kind, source: 'standalone-preview',
      });
    }

    for (const node of childrenByName(branch, 'Node')) {
      const nodeNumber = childText(node, 'NodeNumber');
      const nodeWrites = [
        { name: 'PipingClass', field: 'pipingClass', value: row.pipingClass, kind: 'text' },
        { name: 'Rating', field: 'rating', value: row.rating, kind: 'text' },
        { name: 'MaterialName', field: 'material', value: row.material, kind: 'text' },
        { name: 'MaterialCode', field: 'materialCode', value: row.materialCode, kind: 'text' },
        { name: 'WallThickness', field: 'wallThickness', value: row.wallThickness, kind: 'number' },
        { name: 'CorrosionAllowance', field: 'corrosion', value: row.corrosion, kind: 'number' },
      ];
      for (const write of nodeWrites) {
        const valid = write.kind === 'number' ? numeric(write.value) !== null : text(write.value).trim() !== '';
        if (!valid || !setChildText(document, node, write.name, write.value)) continue;
        result.appliedFields += 1;
        recordExpected(result.expectedEntries, {
          scope: 'node', branchName, nodeNumber, path: [write.name], field: write.field,
          value: write.value, kind: write.kind, source: 'standalone-preview',
        });
      }

      const mapped = nodeWeights.get(`${branchName}|${nodeNumber}`);
      const existingWeight = numeric(childText(node, 'Weight'));
      if (mapped !== undefined && (existingWeight === null || existingWeight === 0) && setChildText(document, node, 'Weight', mapped)) {
        result.appliedFields += 1;
        recordExpected(result.expectedEntries, {
          scope: 'node', branchName, nodeNumber, path: ['Weight'], field: 'weight',
          value: mapped, kind: 'number', source: 'weight-match',
        });
      }
    }
  }

  if (!result.appliedFields) return result;
  diagnostics.push({
    type: 'standalone-process-parity-applied',
    fields: result.appliedFields,
    message: 'Branch process and node facts were synchronised from the standalone Preview and Weight Match authorities.',
  });
  result.xmlText = new XMLSerializer().serializeToString(document);
  return result;
}

const WEIGHT_MATCH_MODULE_URL = new URL(
  '../model-converters/converters/xmltocii2019_helper/weight-match-renderer.js',
  import.meta.url,
);

export async function loadParentWeightMatchModules() {
  const [renderer, parity] = await Promise.all([
    import(WEIGHT_MATCH_MODULE_URL.href),
    import(PARITY_MODULE_URL.href),
  ]);
  return { bindXmlCiiWeightMatchPhase: renderer.bindXmlCiiWeightMatchPhase, enrichXmlForCii2019: parity.enrichXmlForCii2019 };
}

export function standaloneParityOptions(supportConfigJson, options = {}) {
  const config = parseConfig(supportConfigJson);
  const split = options.splitCondensedValveFlange !== undefined
    ? options.splitCondensedValveFlange !== false
    : (config.splitCondensedValveFlange !== false);
  return {
    supportConfigJson: text(supportConfigJson) || '{}',
    splitCondensedValveFlange: split,
    split_condensed_valve_flange: split,
    condenseRigidXsd: config.condenseRigidXsd === true || config.condense_rigid_xsd === true,
  };
}

export async function enrichStandaloneXmlForRun(job, extraOptions = {}) {
  const sourceText = text(job?.sourceText);
  const out = {
    xmlText: sourceText,
    applied: false,
    diagnostics: [],
    stats: {},
    logs: [],
    error: null,
    evidence: null,
    branchRows: [],
    nodeRows: [],
    expectedEntries: [],
    reviewProposals: [],
  };
  if (!sourceText.trim()) {
    out.error = 'Standalone run parity requires non-empty XML source text.';
    out.logs.push(`Standalone run parity blocked: ${out.error}`);
    return out;
  }
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    out.error = 'DOMParser/XMLSerializer is unavailable for standalone run parity.';
    out.logs.push(`Standalone run parity blocked: ${out.error}`);
    return out;
  }

  try {
    const parity = await import(PARITY_MODULE_URL.href);
    const options = { ...standaloneParityOptions(job.supportConfigJson, job.options || {}), ...extraOptions };
    const enriched = await parity.enrichXmlForCii2019(sourceText, text(job.stagedJsonText), options);
    const config = parseConfig(options.supportConfigJson);
    const dtxr = enrichStandaloneDtxrAnnotations(enriched.xmlText || sourceText, text(job.stagedJsonText), config);
    out.diagnostics = [
      ...(Array.isArray(enriched.diagnostics) ? enriched.diagnostics : []),
      ...(Array.isArray(dtxr.diagnostics) ? dtxr.diagnostics : []),
    ];
    out.stats = {
      ...(enriched.stats && typeof enriched.stats === 'object' ? enriched.stats : {}),
      ...(dtxr.stats && typeof dtxr.stats === 'object' ? dtxr.stats : {}),
    };

    const process = await applyStandaloneProcessParity(
      dtxr.text || enriched.xmlText || sourceText,
      config,
      text(job.stagedJsonText),
      out.diagnostics,
    );
    out.xmlText = process.xmlText;
    out.branchRows = process.branchRows;
    out.nodeRows = process.nodeRows;
    out.expectedEntries = process.expectedEntries;
    out.reviewProposals = process.reviewProposals;
    out.evidence = createStandaloneRunParityEvidence({
      xmlText: out.xmlText,
      expectedEntries: out.expectedEntries,
      branchRows: out.branchRows,
      nodeRows: out.nodeRows,
    });
    out.stats.parityComparisons = out.evidence.comparisons;
    out.stats.parityMismatches = out.evidence.mismatchCount;

    if (!out.evidence.ok) {
      out.error = `Standalone run parity blocked ${out.evidence.mismatchCount} authority mismatch(es).`;
      out.logs.push(`${out.error} Engine input was not released.`);
      return out;
    }

    out.applied = true;
    out.logs.push(
      `Standalone run parity PASS (${out.evidence.status}): ${out.evidence.comparisons} comparison(s), input ${out.evidence.engineInputDigest}.`,
    );
    out.logs.push(`Standalone run parity applied: ${out.stats.weightAnnotations || 0} weight annotation(s), ${out.stats.processAnnotations || 0} process annotation(s), ${out.stats.stagedSupportsMapped || 0} staged support(s), ${out.stats.dtxrPosAnnotations || 0} DTXR_POS annotation(s), ${out.stats.dtxrPsAnnotations || 0} DTXR_PS annotation(s), ${out.stats.splitCondensedRigidNodes || 0} renumbered node(s).`);
  } catch (error) {
    out.error = text(error?.message || error);
    out.applied = false;
    out.logs.push(`Standalone run parity blocked: ${out.error}`);
  }
  return out;
}
