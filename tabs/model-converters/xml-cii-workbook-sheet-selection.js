// Shared workbook sheet selection. Existing production field detectors are
// injected by the adapter; this module does not implement a second mapper.
export function selectXmlCiiMasterWorkbookSheet({
  masterKey, local, sheetName, config,
  detectLineListFieldMap, autoMapFields, headersFromRows, masterDef,
}) {
  if (!local || typeof local !== 'object') throw new TypeError('Master state required');
  const sheets = local.sheets && typeof local.sheets === 'object' ? local.sheets : {};
  if (!Object.hasOwn(sheets, sheetName) || !Array.isArray(sheets[sheetName]))
    throw new Error('Workbook sheet is unavailable: ' + String(sheetName));
  local.selectedSheet = sheetName;
  local.rawRows = sheets[sheetName];
  local.fieldMap = masterKey === 'linelist'
    ? detectLineListFieldMap(local.rawRows, local.fieldMap, config)
    : autoMapFields(headersFromRows(local.rawRows), masterDef, local.rawRows);
  return local;
}
