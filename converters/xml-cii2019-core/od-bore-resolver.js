// Nominal DN from explicit node OutsideDiameter. Matches the existing
// standalone converter OD_TO_DN and Preview/Weight Review dimensional tables.
// A recognized node OD takes precedence over branch nominal bore; missing or
// unrecognized OD retains the existing branch-bore fallback.
const OD_TO_DN = Object.freeze([
  [21.3, 15], [26.7, 20], [33.4, 25], [42.2, 32], [48.3, 40],
  [60.3, 50], [73.0, 65], [88.9, 80], [114.3, 100], [141.3, 125],
  [168.3, 150], [219.1, 200], [273.1, 250], [323.9, 300],
  [355.6, 350], [406.4, 400], [508.0, 500], [609.6, 600],
  [762.0, 750], [914.4, 900],
]);

export function resolveXmlCiiDnFromOutsideDiameter(odValue) {
  if (odValue === null || odValue === undefined || String(odValue).trim() === '') return null;
  const od = Number(odValue);
  if (!Number.isFinite(od) || od <= 0) return null;
  let best = null;
  for (const [knownOd, dn] of OD_TO_DN) {
    const error = Math.abs(od - knownOd);
    if (!best || error < best.error) best = { knownOd, dn, error };
  }
  return best && best.error <= Math.max(1.5, best.knownOd * 0.006)
    ? best.dn : null;
}

export function resolveXmlCiiNodeBoreFromOutsideDiameter(odValue, branchBore) {
  const nodeDn = resolveXmlCiiDnFromOutsideDiameter(odValue);
  if (nodeDn !== null) return nodeDn;
  const fallback = Number(branchBore);
  return branchBore !== null && branchBore !== undefined
    && branchBore !== '' && Number.isFinite(fallback) && fallback > 0
    ? fallback : null;
}
