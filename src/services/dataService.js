// Business logic for admin bulk-imports: parses an uploaded Excel file into
// rows keyed by barcode and upserts them into the `data` collection — a raw
// staging store, decoupled from the curated `items` inventory (see
// itemService.js). Views should call only this file, never api/dataApi.js
// directly.
import * as dataApi from '../api/dataApi';
import { t } from '../i18n/i18n';

// Converts a spreadsheet column header into the camelCase field name used
// throughout this app (e.g. "Expiry Date" -> "expiryDate", "Barcode" ->
// "barcode"), so common headers land on the same keys other item fields use,
// while unrecognized headers still come through as fields.
function headerToFieldKey(header) {
  return String(header)
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ''))
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
}

// Spreadsheet libraries hand back date cells as JS Date objects built from
// UTC parts (no timezone in a date cell), so this must read UTC parts back
// out too or the date shifts by a day for users west of UTC.
function excelDateToIsoString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function normalizeCellValue(value) {
  if (value instanceof Date) return excelDateToIsoString(value);
  if (typeof value === 'string') return value.trim();
  return value ?? '';
}

// Reads an .xlsx file (first sheet), maps its header row to fields, and
// upserts each row into the `data` collection keyed by its `barcode` column
// so re-importing the same file updates existing rows rather than
// duplicating them. Rows without a barcode are skipped and counted, not
// errored, since a stray blank row in an exported sheet is the common case,
// not a mistake.
export async function importExcelData(file, ownerId) {
  const { readSheet } = await import('read-excel-file/browser');
  const sheet = await readSheet(file);
  if (!sheet || sheet.length < 2) {
    throw new Error(t('errors.importEmpty'));
  }

  const [headerRow, ...dataRows] = sheet;
  const keys = headerRow.map(headerToFieldKey);
  const barcodeIndex = keys.indexOf('barcode');
  if (barcodeIndex === -1) {
    throw new Error(t('errors.importNoBarcodeColumn'));
  }

  const rowsByBarcode = new Map();
  let skipped = 0;
  dataRows.forEach((row) => {
    const barcode = String(normalizeCellValue(row[barcodeIndex])).trim();
    if (!barcode) {
      skipped += 1;
      return;
    }
    const fields = { barcode };
    keys.forEach((key, i) => {
      if (!key || key === 'barcode') return;
      fields[key] = normalizeCellValue(row[i]);
    });
    rowsByBarcode.set(barcode, fields);
  });

  const rows = [...rowsByBarcode.values()];
  if (rows.length === 0) {
    throw new Error(t('errors.importNoValidRows'));
  }

  const existingBarcodes = new Set(await dataApi.listBarcodes());
  const { created, updated } = await dataApi.upsertRowsByBarcode(rows, existingBarcodes, ownerId);
  return { created, updated, skipped };
}
