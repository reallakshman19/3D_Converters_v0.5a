// Run safety for large XML->CII configurations stored without master rows.
// This only inspects persistence metadata; it never modifies calculations.
const MASTERS = Object.freeze({
  linelist: { key: 'masterRows', title: 'Line List' },
  pipingClass: { key: 'masterRows', title: 'Piping Class' },
  material: { key: 'mapRows', title: 'Material Map' },
  weight: { key: 'masterRows', title: 'Weights / Valve CA8' },
});
export function missingPersistedXmlCiiMasters(config) {
  if (config?._mastersStrippedForStorage !== true) return [];
  // R10 stored only the boolean, not section names. For those old records
  // fail closed on every absent master: exact omissions cannot be recovered.
  const specified = Array.isArray(config._mastersStrippedSectionsForStorage)
    && config._mastersStrippedSectionsForStorage.length
    ? config._mastersStrippedSectionsForStorage : Object.keys(MASTERS);
  return [...new Set(specified)].filter(section =>
    MASTERS[section] && !Array.isArray(config?.[section]?.[MASTERS[section].key])
    || MASTERS[section] && config[section][MASTERS[section].key].length === 0
  ).map(section => MASTERS[section].title);
}
export function missingPersistedXmlCiiMastersNotice(missing) {
  return missing.length
    ? 'Run blocked: imported master data missing after reload (' + missing.join(', ')
      + '). Re-import the missing master tables in 2 Import Masters, then retry Run.'
    : '';
}
