/**
 * Exact-input reuse restricted to ONE synchronous Step 4 Preview build.
 * No global cache: a subsequent build always re-evaluates changed masters,
 * ratings, overrides and evidence.
 */
import { buildPipingClassIndex } from '../../../converters/xml-cii2019-core/piping-class-resolver.js';
import { rankXmlCiiWeightCandidates } from '../../../converters/xml-cii2019-core/weight-valve-hints.js';

function primitiveSignature(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const parts = [];
  for (const [key, item] of Object.entries(value)) {
    const kind = item === null ? 'null' : typeof item;
    if (!['null', 'undefined', 'string', 'boolean', 'number'].includes(kind)) return null;
    const exact = kind === 'number'
      ? (Object.is(item, -0) ? '-0' : Number.isNaN(item) ? 'NaN'
        : item === Infinity ? '+Infinity' : item === -Infinity ? '-Infinity' : String(item))
      : kind === 'null' || kind === 'undefined' ? '' : item;
    parts.push([key, kind, exact]);
  }
  return JSON.stringify(parts);
}

export function createPreviewPerBuildCache() {
  const classByMasterRows = new WeakMap();
  const rankingsByConfig = new WeakMap();
  const stats = { classBuilds: 0, classHits: 0, rankComputes: 0, rankHits: 0 };

  function getPipingClassIndex(masterRows) {
    if (!Array.isArray(masterRows)) {
      stats.classBuilds += 1;
      return buildPipingClassIndex(masterRows || []);
    }
    if (classByMasterRows.has(masterRows)) {
      stats.classHits += 1;
      return classByMasterRows.get(masterRows);
    }
    const index = buildPipingClassIndex(masterRows);
    stats.classBuilds += 1;
    classByMasterRows.set(masterRows, index);
    return index;
  }

  function rankWeight(context, config, options = {}) {
    const canReuse = config && typeof config === 'object' && !Array.isArray(config)
      && typeof structuredClone === 'function';
    const contextSignature = canReuse ? primitiveSignature(context) : null;
    const optionsSignature = canReuse ? primitiveSignature(options) : null;
    if (contextSignature === null || optionsSignature === null) {
      stats.rankComputes += 1;
      return rankXmlCiiWeightCandidates(context, config, options);
    }
    const signature = JSON.stringify([contextSignature, optionsSignature]);
    let byInput = rankingsByConfig.get(config);
    if (byInput?.has(signature)) {
      const snapshot = byInput.get(signature);
      try {
        const result = structuredClone(snapshot);
        stats.rankHits += 1;
        return result;
      } catch {
        // Cannot clone safely: re-evaluate rather than share mutable ranking objects.
      }
    }
    stats.rankComputes += 1;
    const result = rankXmlCiiWeightCandidates(context, config, options);
    try {
      const snapshot = structuredClone(result);
      if (!byInput) {
        byInput = new Map();
        rankingsByConfig.set(config, byInput);
      }
      byInput.set(signature, snapshot);
    } catch {
      // Noncloneable future return values are deliberately not memoized.
    }
    return result;
  }

  return { getPipingClassIndex, rankWeight, stats };
}
