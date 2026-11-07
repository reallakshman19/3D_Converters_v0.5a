import { notify } from '../diagnostics/notification-center.js';
import {
  collectEffectivePipingClassRequirements,
  effectivePipingClassRequirementSignature,
  loadedPipingClassSet,
  matchPipingClassIndexRequirements,
} from '../converters/xml-cii2019-core/effective-piping-class-requirements.js';
import { normalizePipingClass } from '../converters/xml-cii2019-core/piping-class-resolver.js';

const FLAG = '__xmlCiiEffectiveClassShardHydrator_v1';
const INPUT_SELECTOR = '[data-option-key="supportConfigJson"]';
const PRIMARY_FILE_SELECTOR = '#model-converters-primary-input';
const REPO_NAME = '3D_Viewer';
const RAW_BASE = 'https://raw.githubusercontent.com/reallaksh19/3D_Viewer/main/';
const DEFAULT_INDEX = 'docs/Masters/SpecwisePipingClass/index.json';
const DEFAULT_FOLDER = 'docs/Masters/SpecwisePipingClass/';

function browserReady() {
  return typeof window !== 'undefined' && typeof document !== 'undefined' && typeof location !== 'undefined';
}

function text(value) { return value === undefined || value === null ? '' : String(value); }
function clean(value) { return text(value).replace(/\s+/g, ' ').trim(); }
function normalizeMasterPath(value) { return clean(value).replace(/^\/+/, '').replace(/^\.\//, ''); }
function numericText(value) { const hit = clean(value).match(/[-+]?\d*\.?\d+/); return hit ? hit[0] : ''; }
function rawValue(row, keys) { for (const key of keys || []) { const value = row?.[key] ?? row?._raw?.[key]; if (clean(value)) return clean(value); } return ''; }

function appRootPrefix() {
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.includes(REPO_NAME)) return `/${REPO_NAME}/`;
  if (/github\.io$/i.test(location.hostname)) return `/${REPO_NAME}/`;
  return parts[0] ? `/${parts[0]}/` : '/';
}

function candidateUrls(masterPath) {
  const path = normalizeMasterPath(masterPath);
  return [...new Set([
    `${RAW_BASE}${path.split('/').map(encodeURIComponent).join('/')}`,
    `${location.origin}${appRootPrefix()}${path}`,
    new URL(`../${path}`, import.meta.url).href,
  ])];
}

async function fetchTextByPath(masterPath) {
  const errors = [];
  for (const url of candidateUrls(masterPath)) {
    try {
      const response = await fetch(url, { cache: 'no-store', mode: 'cors' });
      if (!response.ok) { errors.push(`${url}: HTTP ${response.status}`); continue; }
      const rawText = await response.text();
      if (!clean(rawText)) { errors.push(`${url}: empty response`); continue; }
      return { rawText, url };
    } catch (error) {
      errors.push(`${url}: ${clean(error?.message || error)}`);
    }
  }
  throw new Error(`Failed to load ${masterPath}. Tried: ${errors.join(' | ')}`);
}

function parseJson(rawText, fallback) {
  const source = clean(rawText)
    .replace(/^export\s+default\s+/i, '')
    .replace(/^window\.[A-Za-z0-9_$]+\s*=\s*/i, '')
    .replace(/;\s*$/g, '');
  return source ? JSON.parse(source) : fallback;
}

function parseJsonRows(rawText) {
  const parsed = parseJson(rawText, []);
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  for (const key of ['rows', 'masterRows', 'data', 'items']) if (Array.isArray(parsed[key])) return parsed[key];
  return [];
}

function parseIndex(rawText) {
  const parsed = parseJson(rawText, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.classes) {
    throw new Error('Invalid specwise piping class index.');
  }
  return parsed;
}

function normalizePipingRow(row, index = 0) {
  return {
    ...row,
    _raw: row,
    _sourceRowIndex: row?._sourceRowIndex || row?._rowIndex || index + 1,
    pipingClass: rawValue(row, ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'Class', 'SPEC', 'Spec']),
    convertedBore: numericText(rawValue(row, ['convertedBore', 'Converted Bore', 'DN', 'NB', 'Bore', 'NPS', 'Size'])),
    componentType: rawValue(row, ['componentType', 'Component Type', 'COMPONENT_TYPE', 'Type', 'Item Type']),
    rating: rawValue(row, ['rating', 'Rating', 'RATING', 'Class Rating', 'Pressure Class']),
    materialName: rawValue(row, ['materialName', 'Material_Name', 'Material', 'MATERIAL', 'Material Name']),
    schedule: rawValue(row, ['schedule', 'Schedule', 'SCHEDULE', 'SCH']),
    wallThickness: rawValue(row, ['wallThickness', 'Wall Thickness', 'Wall thickness', 'WALL_THICKNESS', 'WT', 'WallThickness']),
    corrosion: rawValue(row, ['corrosion', 'Corrosion', 'Corrosion Allowance', 'CORROSION_ALLOWANCE', 'CA']),
    endCondition: rawValue(row, ['endCondition', 'End Condition', 'END_CONDITION', 'End Type']),
  };
}

function rowIdentity(row) {
  return [
    normalizePipingClass(row?.pipingClass || row?.['Piping Class']),
    clean(row?.convertedBore || row?.['Converted Bore'] || row?.DN || row?.NB || row?.Size),
    clean(row?.componentType || row?.['Component Type']),
    clean(row?.rating || row?.Rating),
    clean(row?.schedule || row?.Schedule || row?.SCH),
    clean(row?.wallThickness || row?.['Wall Thickness'] || row?.['Wall thickness']),
    clean(row?.materialName || row?.Material || row?.['Material Name']),
    clean(row?.corrosion || row?.['Corrosion Allowance']),
    clean(row?.endCondition || row?.['End Condition']),
  ].join('\u0000');
}

function mergeRows(existingRows, incomingRows) {
  const merged = [];
  const seen = new Set();
  for (const row of [...(Array.isArray(existingRows) ? existingRows : []), ...(incomingRows || [])]) {
    if (row?._smartMasterPlaceholder === true || normalizePipingClass(row?.pipingClass) === 'ONDEMAND') continue;
    const key = rowIdentity(row);
    if (!key.replace(/\u0000/g, '') || seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

function extractBranchNames(xmlText) {
  const source = text(xmlText);
  const names = [];
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(source, 'application/xml');
      if (!doc.getElementsByTagName('parsererror').length) {
        for (const node of [...doc.getElementsByTagName('Branchname')]) {
          const value = clean(node.textContent);
          if (value) names.push(value);
        }
      }
    } catch {}
  }
  if (!names.length) {
    for (const match of source.matchAll(/<Branchname\b[^>]*>([\s\S]*?)<\/Branchname>/gi)) {
      const value = clean(match[1].replace(/<[^>]+>/g, ''));
      if (value) names.push(value);
    }
  }
  return [...new Set(names)];
}

function parseConfig(input) {
  try {
    const parsed = JSON.parse(input?.value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return null;
  }
}

function writeConfig(input, config) {
  const perf = typeof performance !== 'undefined' ? performance : null;
  perf?.mark?.('xml-cii:shard:config-serialize:start');
  const next = JSON.stringify(config, null, 2);
  perf?.mark?.('xml-cii:shard:config-serialize:end');
  perf?.measure?.('xml-cii:shard:config-serialize',
    'xml-cii:shard:config-serialize:start', 'xml-cii:shard:config-serialize:end');
  if (!input || input.value === next) return false;
  perf?.mark?.('xml-cii:shard:config-dispatch:start');
  input.value = next;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  perf?.mark?.('xml-cii:shard:config-dispatch:end');
  perf?.measure?.('xml-cii:shard:config-dispatch',
    'xml-cii:shard:config-dispatch:start', 'xml-cii:shard:config-dispatch:end');
  return true;
}

function joinPath(folder, file) {
  return `${normalizeMasterPath(folder).replace(/\/+$/, '')}/${clean(file).replace(/^\/+/, '')}`;
}

function hydrationAttemptSignature(requirements, indexPath, folderPath) {
  return JSON.stringify({
    missing: effectivePipingClassRequirementSignature(requirements),
    indexPath,
    folderPath,
  });
}

function notifyOnce(key, payload) {
  if (!browserReady()) return;
  if (window.__xmlCiiEffectiveClassHydratorNotice === key) return;
  window.__xmlCiiEffectiveClassHydratorNotice = key;
  notify(payload);
}

let busy = false;
let pending = false;

export async function hydrateXmlCiiEffectivePipingClassShards({ input, xmlText = '', force = false } = {}) {
  const configInput = input || document.querySelector(INPUT_SELECTOR);
  const config = parseConfig(configInput);
  if (!configInput || !config || config.disableDefaultMasterAutoload === true) return { changed: false, reason: 'disabled-or-missing-config' };

  const file = document.querySelector(PRIMARY_FILE_SELECTOR)?.files?.[0] || null;
  const sourceText = xmlText || (file ? await file.text() : '');
  const branchNames = extractBranchNames(sourceText);
  const requirements = collectEffectivePipingClassRequirements({ branchNames, config });
  const existingRows = Array.isArray(config?.pipingClass?.masterRows) ? config.pipingClass.masterRows : [];
  const loaded = loadedPipingClassSet(existingRows);
  const missingRequirements = requirements.filter((item) => !loaded.has(item.normalized));
  const requirementSignature = effectivePipingClassRequirementSignature(requirements);
  const paths = config?.masterPaths && typeof config.masterPaths === 'object' && !Array.isArray(config.masterPaths)
    ? config.masterPaths
    : {};
  const indexPath = paths.pipingClassIndexPath || DEFAULT_INDEX;
  const folderPath = paths.pipingClassShardFolder || DEFAULT_FOLDER;
  const signature = JSON.stringify({ requirementSignature, indexPath, folderPath });
  const attemptSignature = hydrationAttemptSignature(missingRequirements, indexPath, folderPath);

  if (!force && !missingRequirements.length && config?.pipingClass?._effectiveHydrationSignature === signature) {
    return { changed: false, reason: 'already-hydrated', requirements };
  }
  if (!force && missingRequirements.length && config?.pipingClass?._effectiveHydrationAttemptSignature === attemptSignature) {
    return {
      changed: false,
      reason: 'attempt-already-recorded',
      requirements,
      missingRequirements,
      unmatched: config?.pipingClass?._unmatchedEffectiveClasses || [],
    };
  }
  if (!missingRequirements.length) {
    config.pipingClass = config.pipingClass && typeof config.pipingClass === 'object' ? config.pipingClass : {};
    config.pipingClass._effectiveHydrationSignature = signature;
    config.pipingClass._effectiveHydrationAttemptSignature = '';
    config.pipingClass._requiredEffectiveClasses = requirements.map((item) => item.value);
    writeConfig(configInput, config);
    return { changed: true, reason: 'metadata-refreshed', requirements };
  }

  const indexLoad = await fetchTextByPath(indexPath);
  const index = parseIndex(indexLoad.rawText);
  const { matched, unmatched } = matchPipingClassIndexRequirements(index, missingRequirements);
  const incomingRows = [];
  const loadedFiles = [];
  const loadedClasses = [];

  for (const match of matched) {
    const fileName = clean(match.meta?.file || `${match.classKey}.json`);
    if (!fileName) continue;
    const shard = await fetchTextByPath(joinPath(folderPath || index.shardBase || DEFAULT_FOLDER, fileName));
    const rows = parseJsonRows(shard.rawText).map(normalizePipingRow).filter((row) => normalizePipingClass(row.pipingClass));
    if (!rows.length) continue;
    incomingRows.push(...rows);
    loadedFiles.push(fileName);
    loadedClasses.push(match.classKey);
  }

  config.pipingClass = config.pipingClass && typeof config.pipingClass === 'object' && !Array.isArray(config.pipingClass)
    ? config.pipingClass
    : {};
  const mergedRows = mergeRows(existingRows, incomingRows);
  config.pipingClass.masterRows = mergedRows.length ? mergedRows : existingRows;
  config.pipingClass.fieldMap = {
    ...(config.pipingClass.fieldMap || {}),
    pipingClass: 'pipingClass',
    convertedBore: 'convertedBore',
    componentType: 'componentType',
    rating: 'rating',
    materialName: 'materialName',
    schedule: 'schedule',
    wallThickness: 'wallThickness',
    corrosion: 'corrosion',
    endCondition: 'endCondition',
  };
  config.pipingClass._effectiveHydrationSignature = signature;
  config.pipingClass._effectiveHydrationAttemptSignature = unmatched.length
    ? hydrationAttemptSignature(unmatched, indexPath, folderPath)
    : '';
  config.pipingClass._effectiveHydrationAt = new Date().toISOString();
  config.pipingClass._requiredEffectiveClasses = requirements.map((item) => item.value);
  config.pipingClass._effectiveHydratedClasses = loadedClasses;
  config.pipingClass._effectiveHydratedShardFiles = loadedFiles;
  config.pipingClass._unmatchedEffectiveClasses = unmatched.map((item) => item.value || item.normalized || String(item));
  config.pipingClass._autoloadedRows = Array.isArray(config.pipingClass.masterRows) ? config.pipingClass.masterRows.length : 0;
  config.pipingClass._smartMode = 'specwise-shard-plus-effective-hydration';
  config.pipingClass.masterUrl = config.pipingClass.masterUrl || indexLoad.url;
  config.pipingClass.defaultUrl = config.pipingClass.defaultUrl || indexLoad.url;
  const changed = writeConfig(configInput, config);

  if (loadedClasses.length) {
    notifyOnce(`loaded:${loadedClasses.join('|')}`, {
      level: 'success',
      title: 'XML→CII Piping Class',
      message: `Loaded ${loadedFiles.length} missing effective-class shard(s): ${loadedClasses.join(', ')}. Rebuild Preview to recompute dependent fields.`,
    });
  }
  if (unmatched.length) {
    const values = unmatched.map((item) => item.value || item.normalized || String(item));
    notifyOnce(`unmatched:${values.join('|')}`, {
      level: 'warning',
      title: 'XML→CII Piping Class',
      message: `No exact specwise shard exists for effective class(es): ${values.join(', ')}. Dependent fields remain review-required.`,
    });
  }

  return {
    changed,
    requirements,
    missingRequirements,
    loadedClasses,
    loadedFiles,
    unmatched,
    rowCount: Array.isArray(config.pipingClass.masterRows) ? config.pipingClass.masterRows.length : 0,
  };
}

async function runScheduled() {
  if (busy) { pending = true; return; }
  busy = true;
  try {
    await hydrateXmlCiiEffectivePipingClassShards();
  } catch (error) {
    const message = clean(error?.message || error);
    notifyOnce(`error:${message}`, { level: 'error', title: 'XML→CII Piping Class', message: `Effective-class shard hydration failed: ${message}` });
  } finally {
    busy = false;
    if (pending) { pending = false; scheduleHydration(50); }
  }
}

let timer = null;
function scheduleHydration(delay = 0) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; runScheduled(); }, delay);
}

export function installXmlCiiEffectiveClassShardHydrator() {
  if (!browserReady() || window[FLAG]) return;
  window[FLAG] = true;
  document.addEventListener('change', (event) => {
    if (event.target?.matches?.(`${INPUT_SELECTOR}, ${PRIMARY_FILE_SELECTOR}`)) scheduleHydration(0);
  }, true);
  document.addEventListener('input', (event) => {
    if (event.target?.matches?.(INPUT_SELECTOR)) scheduleHydration(100);
  }, true);
  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-mc-preview-build], [data-xml-cii-phase], [data-sub-tab="pipingClass"]')) scheduleHydration(0);
  }, true);
  scheduleHydration(0);
}
