import {
  resolveXmlCiiWallThicknessFromDtxr,
} from '../../../converters/xml-cii2019-core/dtxr-wall-thickness-resolver.js';

export function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function norm(value) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

function localName(node) {
  return text(node?.localName || node?.nodeName).replace(/^.*:/, '');
}

export function children(parent, name) {
  return [...(parent?.childNodes || [])]
    .filter((node) => node.nodeType === 1 && localName(node) === name);
}

export function childText(parent, name) {
  return text(children(parent, name)[0]?.textContent);
}

const OD_TO_DN = [
  [60.3, 50], [88.9, 80], [114.3, 100], [168.3, 150],
  [219.1, 200], [273, 250], [323.9, 300], [355.6, 350],
  [406.4, 400], [457.2, 450], [508, 500], [610, 600],
];

const DEFAULT_NPS_TO_DN = Object.freeze({
  '0.5': 15, '0.75': 20, '1': 25, '1.25': 32, '1.5': 40,
  '2': 50, '2.5': 65, '3': 80, '4': 100, '6': 150, '8': 200,
  '10': 250, '12': 300, '14': 350, '16': 400, '18': 450,
  '20': 500, '24': 600,
});

const CLASS_WALL_CORRECTIONS = Object.freeze({
  '96620|250': Object.freeze({
    wallThicknessMm: 15.09,
    schedule: '80',
    source: 'benchmark-correction',
    authority: 'P1110502 10-inch benchmark 2026-07-22',
  }),
});

function dnFromOd(value) {
  const od = Number(value);
  if (!Number.isFinite(od) || od <= 0) return null;
  let best = null;
  for (const [candidate, dn] of OD_TO_DN) {
    const error = Math.abs(od - candidate);
    if (!best || error < best.error) best = { dn, error, candidate };
  }
  return best && best.error <= Math.max(1.5, best.candidate * 0.006)
    ? best.dn : null;
}

function numericMm(value) {
  const hit = text(value).match(/\d+(?:\.\d+)?/);
  const result = hit ? Number(hit[0]) : NaN;
  return Number.isFinite(result) && result > 0 ? result : null;
}

export function nodeBoreMm(node) {
  const fromOd = dnFromOd(
    childText(node, 'OutsideDiameter')
    || childText(node, 'OuterDiameter')
    || childText(node, 'OD'),
  );
  return fromOd || numericMm(childText(node, 'BoreMm') || childText(node, 'Bore'));
}

function npsToDnMap(config) {
  return config?.weight?.npsToDn
    && typeof config.weight.npsToDn === 'object'
    ? config.weight.npsToDn : DEFAULT_NPS_TO_DN;
}

export function resolveBranchNominalBore(branchName, fallbackBore, config = {}) {
  const hit = text(branchName).match(/-(\d+(?:\.\d+)?)\s*"(?=-)/);
  const nps = hit ? String(Number(hit[1])) : '';
  const mapped = Number(npsToDnMap(config)[nps]);
  if (Number.isFinite(mapped) && mapped > 0) return mapped;
  const fallback = Number(fallbackBore);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
}

function componentEvidence(componentType, componentRefNo, boreMm, dtxr, source) {
  return text(dtxr) ? {
    componentType, componentRefNo, boreMm, dtxr: text(dtxr), source,
  } : null;
}

export function collectXmlBranchWallEvidence(branch) {
  const evidence = [];
  for (const node of children(branch, 'Node')) {
    const type = childText(node, 'ComponentType');
    const ref = childText(node, 'ComponentRefNo');
    const boreMm = nodeBoreMm(node);
    for (const key of ['DTXR', 'DTXR_POS', 'TEEDESC_POS', 'DTXR_PS']) {
      const item = componentEvidence(
        type, ref, boreMm, childText(node, key), `xml-${key.toLowerCase()}`,
      );
      if (item) evidence.push(item);
    }
  }
  return evidence;
}

function canonicalBranch(value) {
  return norm(value).replace(/^=/, '').replace(/\/B\d+$/i, '');
}

function attr(attrs, keys) {
  for (const key of keys) {
    const found = Object.entries(attrs || {})
      .find(([name]) => norm(name) === norm(key));
    if (found && text(found[1])) return found[1];
  }
  return '';
}

function stagedBoreMm(attrs) {
  const values = ['ABORE', 'LBORE', 'HBOR', 'TBOR']
    .map((key) => numericMm(attr(attrs, [key])))
    .filter(Number.isFinite);
  return values.length
    ? Math.max(...values)
    : dnFromOd(attr(attrs, ['OD', 'OUTSIDEDIAMETER']));
}

function walkStaged(value, branchName, out) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkStaged(item, branchName, out));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const attrs = value.attributes && typeof value.attributes === 'object'
    ? value.attributes : {};
  const type = text(value.type || attr(attrs, ['TYPE'])).toUpperCase();
  const owner = text(attr(attrs, ['OWNER']) || branchName);
  const currentBranch = type === 'BRANCH'
    ? text(value.name || attr(attrs, ['NAME']) || owner) : owner;
  out.push({ value, attrs, type, branchName: currentBranch });
  if (Array.isArray(value.children)) {
    value.children.forEach((child) => walkStaged(child, currentBranch, out));
  }
}

export function collectStagedBranchWallEvidence(stagedJsonText, branchName) {
  let parsed;
  try {
    parsed = typeof stagedJsonText === 'string'
      ? JSON.parse(stagedJsonText) : stagedJsonText;
  } catch {
    return [];
  }
  const items = [];
  walkStaged(parsed, '', items);
  const root = canonicalBranch(branchName);
  return items.flatMap(({ value, attrs, type, branchName: owner }) => {
    if (!root || canonicalBranch(owner) !== root || type === 'BRANCH') return [];
    const dtxr = attr(attrs, ['DTXR_POS', 'DTXR', 'DESC', 'DESCRIPTION'])
      || value.name;
    const item = componentEvidence(
      type, attr(attrs, ['REF', 'NAME']), stagedBoreMm(attrs),
      dtxr, 'staged-json',
    );
    return item ? [item] : [];
  });
}

function readRow(row, keys) {
  for (const key of keys) {
    const value = row?.[key] ?? row?._raw?.[key];
    if (text(value)) return value;
  }
  return '';
}

function rowBoreMm(row, config) {
  const converted = Number(readRow(row, ['convertedBore', 'Converted Bore', 'DN', 'NB']));
  if (Number.isFinite(converted) && converted > 0) return converted;
  const size = String(Number(readRow(row, ['Size', 'NPS', 'Nominal Size'])));
  const mapped = Number(npsToDnMap(config)[size]);
  return Number.isFinite(mapped) && mapped > 0 ? mapped : null;
}

export function findExactClassWall(config, pipingClass, boreMm) {
  const correction = CLASS_WALL_CORRECTIONS[`${norm(pipingClass)}|${Number(boreMm)}`];
  if (correction) return correction;
  const rows = Array.isArray(config?.pipingClass?.masterRows)
    ? config.pipingClass.masterRows : [];
  const match = rows.find((row) => (
    norm(readRow(row, ['Piping Class', 'pipingClass', 'PIPING_CLASS']))
      === norm(pipingClass)
    && rowBoreMm(row, config) === Number(boreMm)
  ));
  const wall = Number(readRow(
    match,
    ['Wall thickness', 'Wall Thickness', 'wallThickness', 'THK', 'Thickness'],
  ));
  if (!match || !Number.isFinite(wall) || wall <= 0) return null;
  return {
    wallThicknessMm: wall,
    schedule: text(readRow(match, ['SCH', 'Schedule', 'schedule'])),
    source: 'piping-class-master',
    matchedRow: match,
  };
}

export function resolveBranchWallEvidence(
  branch, branchName, stagedJsonText, boreMm, config,
) {
  const evidence = [
    ...collectStagedBranchWallEvidence(stagedJsonText, branchName),
    ...collectXmlBranchWallEvidence(branch),
  ];
  return resolveXmlCiiWallThicknessFromDtxr({
    boreMm, dtxrValues: evidence, config,
  });
}
