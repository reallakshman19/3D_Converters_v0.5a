import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { detectLineListFieldMap } from '../converters/xml-cii2019-core/linelist-mapping.js';
import { selectXmlCiiMasterWorkbookSheet } from '../tabs/model-converters/xml-cii-workbook-sheet-selection.js';

function twoSheetWorkbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Project Report', 'Public synthetic fixture'], ['Instructions', 'Select Linelist'],
  ]), 'Coversheet');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 'Line Number': '1001', 'Piping Class': 'A1', 'Size (NPS)': '6', Rating: '150' },
    { 'Line Number': '1002', 'Piping Class': 'A1', 'Size (NPS)': '4', Rating: '300' },
  ]), 'Linelist');
  const raw = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const parsed = XLSX.read(raw, { type: 'buffer', raw: false, cellDates: false });
  const sheets = Object.fromEntries(parsed.SheetNames.map((name) => [name,
    XLSX.utils.sheet_to_json(parsed.Sheets[name], { defval: '', raw: false })
      .map((row, index) => ({ _rowIndex: index + 1, ...row }))]));
  return { sheetNames: parsed.SheetNames, selectedSheet: parsed.SheetNames[0],
    sheets, rawRows: sheets[parsed.SheetNames[0]], fieldMap: {} };
}

test('D2: Linelist re-reads the second sheet and runs production field detection', () => {
  const local = twoSheetWorkbook();
  assert.deepEqual(local.sheetNames, ['Coversheet', 'Linelist']);
  assert.equal(local.selectedSheet, 'Coversheet');
  assert.equal(local.rawRows.some((row) => row['Line Number']), false);
  selectXmlCiiMasterWorkbookSheet({
    masterKey: 'linelist', local, sheetName: 'Linelist', config: {},
    detectLineListFieldMap,
    autoMapFields: () => { throw Error('unexpected mapper'); },
  });
  assert.equal(local.selectedSheet, 'Linelist');
  assert.deepEqual(local.rawRows.map((row) => row['Line Number']), ['1001', '1002']);
  assert.equal(local.fieldMap.pipingClass, 'Piping Class');
  assert.ok(Object.values(local.fieldMap).includes('Line Number'));
  assert.ok(Object.values(local.fieldMap).includes('Size (NPS)'));
});

test('D2: unknown sheet never falls back to Coversheet', () => {
  const local = twoSheetWorkbook();
  assert.throws(() => selectXmlCiiMasterWorkbookSheet({
    masterKey: 'linelist', local, sheetName: 'missing', config: {}, detectLineListFieldMap,
  }), /Workbook sheet is unavailable/);
  assert.equal(local.selectedSheet, 'Coversheet');
});

test('D2: popup and shell share exactly the same binder and mapper', async () => {
  const src = await readFile(fileURLToPath(new URL('../tabs/model-converters/legacy-adapter.js', import.meta.url)), 'utf8');
  assert.match(src, /function xmlCiiSelectMasterSheet\(masterKey, sheetName\)/);
  const both = /querySelectorAll\('\[data-xml-cii-sheet\]'\)[\s\S]{0,450}xmlCiiSelectMasterSheet\(masterKey, select\.value\)/g;
  assert.equal([...src.matchAll(both)].length, 2);
  assert.match(src, /if \(target\.isConnected\) rerender\(\);/);
});
