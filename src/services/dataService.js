// Business logic for admin bulk-imports: parses an uploaded Excel file into
// rows keyed by barcode and upserts them into the `data` collection — a raw
// staging store, decoupled from the curated `items` inventory (see
// itemService.js). Views should call only this file, never api/dataApi.js
// directly.
import * as dataApi from '../api/dataApi';
import { t } from '../i18n/i18n';
import { isBinarySpreadsheet, decodeTextFile, fixMojibake, headerToFieldKey } from '../utils/spreadsheetEncoding';

// Spreadsheet libraries hand back date cells as JS Date objects built from
// UTC parts (no timezone in a date cell), so this must read UTC parts back
// out too or the date shifts by a day for users west of UTC.
function excelDateToIsoString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function normalizeCellValue(value, cptable) {
  if (value instanceof Date) return excelDateToIsoString(value);
  if (typeof value === 'string') return fixMojibake(value.trim(), cptable);
  return value ?? '';
}

// Only these columns are pulled from the source file into the `data`
// collection — anything else present in the sheet (extra columns some
// exports include) is ignored. Order here is also the display order for
// the import preview table.
const ALLOWED_FIELD_KEYS = ['barcode', 'product', 'product2', 'class1', 'class2', 'class3', 'maker'];

// Reads an .xlsx/.xls workbook or a CSV/TSV export (first sheet) and maps
// its header row to fields, deduped by `barcode` (re-importing the same
// file will update existing rows rather than duplicate them once uploaded).
// Rows without a barcode are skipped and counted, not errored, since a
// stray blank row in an exported sheet is the common case, not a mistake.
// Does not write anything — see uploadParsedRows for that, so the caller
// can show a preview and let the admin confirm before anything is written.
export async function parseExcelFile(file) {
  const XLSX = await import('@e965/xlsx');
  // Legacy .xls (BIFF) files store non-Unicode strings in a codepage-specific
  // encoding rather than UTF-16 — without registering the codepage table,
  // xlsx falls back to the wrong decoding and non-Latin text (e.g. Korean
  // product names) comes out as mojibake, which then gets written to
  // Firestore as-is. .xlsx files are unaffected (already UTF-8 in
  // sharedStrings.xml), so this only matters for the legacy format. It's
  // also used by fixMojibake below, for files whose own CODEPAGE record is
  // simply wrong (declares Latin-1 while the bytes are actually CP949).
  const cptable = await import('@e965/xlsx/dist/cpexcel.full.mjs');
  XLSX.set_cptable(cptable);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const workbook = isBinarySpreadsheet(bytes)
    ? XLSX.read(buffer, { type: 'array', cellDates: true })
    : XLSX.read(decodeTextFile(bytes), { type: 'string', cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const sheet = worksheet ? XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) : [];
  if (sheet.length < 2) {
    throw new Error(t('errors.importEmpty'));
  }

  const [headerRow, ...dataRows] = sheet;
  const keys = headerRow.map(headerToFieldKey);
  const barcodeIndex = keys.indexOf('barcode');
  if (barcodeIndex === -1) {
    throw new Error(t('errors.importNoBarcodeColumn'));
  }

  // Only the columns in ALLOWED_FIELD_KEYS that are actually present in this
  // file, in that fixed order — so the preview table and the uploaded
  // fields always match regardless of what other columns the file has.
  const columns = ALLOWED_FIELD_KEYS.map((key) => ({ key, index: keys.indexOf(key) }))
    .filter(({ index }) => index !== -1)
    .map(({ key, index }) => ({ key, index, label: headerRow[index] }));
  const rowsByBarcode = new Map();
  let skipped = 0;
  dataRows.forEach((row) => {
    const barcode = String(normalizeCellValue(row[barcodeIndex], cptable)).trim();
    if (!barcode) {
      skipped += 1;
      return;
    }
    const fields = { barcode };
    columns.forEach(({ key, index }) => {
      if (key === 'barcode') return;
      fields[key] = normalizeCellValue(row[index], cptable);
    });
    rowsByBarcode.set(barcode, fields);
  });

  const rows = [...rowsByBarcode.values()];
  if (rows.length === 0) {
    throw new Error(t('errors.importNoValidRows'));
  }

  return { columns, rows, totalRows: dataRows.length, skipped };
}

// Writes previously parsed rows (see parseExcelFile) to the `data`
// collection, keyed by barcode.
export async function uploadParsedRows(rows) {
  await dataApi.upsertRowsByBarcode(rows);
  return { imported: rows.length };
}
