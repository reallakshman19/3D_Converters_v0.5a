import {
  collectStagedBranchWallEvidence,
  collectXmlBranchWallEvidence,
  childText,
  children,
  findExactClassWall,
  nodeBoreMm,
  resolveBranchNominalBore,
  text,
} from './xml-cii-adapted-preview-wall-evidence.js';
import {
  resolveXmlCiiWallThicknessWithEvidence,
} from '../../../converters/xml-cii2019-core/dtxr-wall-evidence-ledger.js';

function norm(value) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

function classSizeKey(row, boreMm) {
  const pipingClass = norm(row?.pipingClass || row?.pipingClassDerived);
  return pipingClass && Number.isFinite(Number(boreMm))
    ? `PC:${pipingClass}|DN:${Math.round(Number(boreMm))}`
    : row?.wallThicknessKey;
}

function branchDtxrWallEvidence(branch, branchName, stagedJsonText, boreMm, config) {
  const evidence = [
    ...collectStagedBranchWallEvidence(stagedJsonText, branchName),
    ...collectXmlBranchWallEvidence(branch),
  ];
  return resolveXmlCiiWallThicknessWithEvidence({
    boreMm,
    dtxrValues: evidence,
    config,
  });
}

function correctedRow(row, branch, stagedJsonText, config) {
  const boreMm = resolveBranchNominalBore(row.branchName, row.sizeMm, config);
  const dtxr = branchDtxrWallEvidence(
    branch, row.branchName, stagedJsonText, boreMm, config,
  );
  const classWall = findExactClassWall(
    config, row.pipingClass || row.pipingClassDerived, boreMm,
  );
  const authority = dtxr?.evidenceKind === 'DIRECT_WALL'
    ? dtxr : (classWall || dtxr);
  const result = {
    ...row,
    sizeMm: boreMm,
    size: boreMm ? `${boreMm}mm` : row.size,
    wallThicknessKey: classSizeKey(row, boreMm),
  };
  if (authority) {
    result.wallThickness = Number(authority.wallThicknessMm.toPrecision(6)).toString();
    result.wallThicknessSource = authority.source;
  }
  result.dtxrWallThickness = dtxr?.wallThicknessMm || '';
  result.dtxrWallSchedule = dtxr?.schedule || '';
  result.dtxrWallSource = dtxr?.source || '';
  result.dtxrWallDtxr = dtxr?.dtxr || '';
  result.dtxrWallEvidenceKind = dtxr?.evidenceKind || '';
  result.dtxrWallComponentType = dtxr?.componentType || '';
  result.dtxrWallComponentRefNo = dtxr?.componentRefNo || '';
  result.dtxrWallEvidenceBoreMm = dtxr?.evidenceBoreMm || '';
  result.dtxrWallEvidenceSource = dtxr?.evidenceSource || '';
  result.dtxrWallNps = dtxr?.nps || '';
  result.dtxrWallProvenance = dtxr?.provenance || null;
  result.dtxrWallEvidenceSchema = dtxr?.evidenceSchema || '';
  result.dtxrWallSelectionPolicy = dtxr?.selectionPolicy || '';
  result.dtxrWallSelectedEvidence = dtxr?.selectedEvidence || null;
  result.dtxrWallEvidenceRecords = dtxr?.evidenceRecords || [];
  result.dtxrWallEvidenceCount = dtxr?.evidenceCount || 0;
  result.dtxrWallEligibleEvidenceCount = dtxr?.eligibleEvidenceCount || 0;
  result.dtxrWallRejectedEvidenceCount = dtxr?.rejectedEvidenceCount || 0;
  return result;
}

function parseXml(xmlText) {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const document = new DOMParser().parseFromString(text(xmlText), 'application/xml');
    return document.getElementsByTagName('parsererror').length ? null : document;
  } catch {
    return null;
  }
}

function branchMap(document) {
  return new Map([...document.getElementsByTagName('Branch')]
    .map((branch) => [childText(branch, 'Branchname'), branch]));
}

function nodeBoreIndex(document) {
  const index = new Map();
  for (const branch of document.getElementsByTagName('Branch')) {
    const branchName = childText(branch, 'Branchname');
    for (const node of children(branch, 'Node')) {
      const key = [
        branchName, childText(node, 'NodeNumber'),
        childText(node, 'ComponentRefNo').replace(/^=/, ''),
        childText(node, 'Endpoint'),
      ].join('::');
      index.set(key, nodeBoreMm(node));
    }
  }
  return index;
}

function correctNodeRows(nodeRows, document) {
  const bores = nodeBoreIndex(document);
  return (nodeRows || []).map((row) => {
    const key = [
      row.branchName, row.nodeNumber,
      text(row.componentRefNo).replace(/^=/, ''), row.endpoint,
    ].join('::');
    const boreMm = bores.get(key);
    return Number.isFinite(boreMm) ? { ...row, boreMm } : row;
  });
}

export function applyPreviewBoreWallAuthority({
  xmlText, stagedJsonText, config = {}, result,
}) {
  if (!result || !Array.isArray(result.branchRows)) return result;
  const document = parseXml(xmlText);
  if (!document) return result;
  const branches = branchMap(document);
  const branchRows = result.branchRows.map((row) => correctedRow(
    row, branches.get(row.branchName), stagedJsonText, config,
  ));
  return {
    ...result,
    branchRows,
    nodeRows: correctNodeRows(result.nodeRows, document),
  };
}
