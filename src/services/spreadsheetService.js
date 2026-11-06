// Parses an admin's uploaded spreadsheet into rows keyed by barcode — the
// input to the local-data publish (see services/localDataService.js and
// components/admin/LocalDataUploadForm.jsx).
import * as companyService from './companyService';
import { t } from '../i18n/i18n';
import { isBinarySpreadsheet, decodeTextFile, fixMojibake, headerToFieldKey } from '../utils/spreadsheetEncoding';
import { companyNameFromIncoCode } from '../utils/incoCode';

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

// Reads an .xlsx/.xls workbook or a CSV/TSV export (first sheet) and maps
// every column in its header row to a field (via headerToFieldKey), deduped
// by `barcode` (a barcode repeated in the file keeps only its last row).
// Rows missing a barcode, a product name, or a (non-zero) sale price are
// skipped and counted, not errored,
// since a stray blank/incomplete row in an exported sheet is the common
// case, not a mistake — but only when that column is actually present in
// the file, since not every export includes a product name or sale price
// column. Does not write anything, so the caller can show a preview and let
// the admin pick columns before publishing.
//
// An "IncoCode" column (values like "1-0001") is treated specially: the
// part after the dash is the company code from the `companies` collection
// (see companyService and utils/incoCode.js), and its name is added to each
// row as `companyName` — a convenience lookup on top of the raw incoCode
// field, not a replacement for it.
export async function parseExcelFile(file) {
  const XLSX = await import('@e965/xlsx');
  // Legacy .xls (BIFF) files store non-Unicode strings in a codepage-specific
  // encoding rather than UTF-16 — without registering the codepage table,
  // xlsx falls back to the wrong decoding and non-Latin text (e.g. Korean
  // product names) comes out as mojibake, which would then be published
  // as-is. .xlsx files are unaffected (already UTF-8 in
  // sharedStrings.xml), so this only matters for the legacy format. It's
  // also used by fixMojibake below, for files whose own CODEPAGE record is
  // simply wrong (declares Latin-1 while the bytes are actually CP949).
  const cptable = await import('@e965/xlsx/dist/cpexcel.full.mjs');
  XLSX.set_cptable(cptable);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const text = isBinarySpreadsheet(bytes) ? null : decodeTextFile(bytes);
  const workbook =
    text === null
      ? XLSX.read(buffer, { type: 'array', cellDates: true })
      : XLSX.read(text, { type: 'string', cellDates: true });
  const sheetRows = (book) => {
    const worksheet = book.Sheets[book.SheetNames[0]];
    return worksheet ? XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) : [];
  };
  const sheet = sheetRows(workbook);
  if (sheet.length < 2) {
    throw new Error(t('errors.importEmpty'));
  }

  const [headerRow, ...dataRows] = sheet;
  // Every non-blank header becomes a column, in file order — so the preview
  // table and the published fields always include everything the file has.
  // The IncoCode column is normalized to a canonical `incoCode` key
  // regardless of how it's cased in the source file ("incocode", "INCOCODE",
  // "Inco Code", …) — headerToFieldKey can only camelCase on separators, so
  // a header with none (e.g. "incocode") would otherwise pass through as a
  // different key than "IncoCode" does, splitting the same field in two
  // depending on which spelling a given file happens to use.
  const columns = headerRow
    .map((header, index) => ({ key: headerToFieldKey(header), index, label: header }))
    .filter(({ key }) => key)
    .map((c) => (c.key.toLowerCase() === 'incocode' ? { ...c, key: 'incoCode' } : c));
  if (!columns.some((c) => c.key === 'barcode')) {
    throw new Error(t('errors.importNoBarcodeColumn'));
  }
  const hasProductColumn = columns.some((c) => c.key === 'product');
  const hasSalePriceColumn = columns.some((c) => c.key === 'salePrice');
  const incoCodeColumn = columns.find((c) => c.key === 'incoCode');

  const companyNameByCode = incoCodeColumn ? await companyService.getCompanyNameMap() : null;

  // Reading a text file guesses at each value's type, which turns an IncoCode
  // like 1-0012 into the date January 12. Those cells are taken from a second
  // read that leaves every value as written. Rows line up, blank ones included.
  const rawRows = incoCodeColumn && text !== null ? sheetRows(XLSX.read(text, { type: 'string', raw: true })) : null;

  const rowsByBarcode = new Map();
  let skipped = 0;
  dataRows.forEach((row, rowIndex) => {
    const fields = {};
    columns.forEach(({ key, index }) => {
      const value = normalizeCellValue(row[index], cptable);
      fields[key] = key === 'salePrice' ? Number(value) || 0 : value;
    });
    const barcode = String(fields.barcode ?? '').trim();
    if (!barcode) {
      skipped += 1;
      return;
    }
    fields.barcode = barcode;
    if (hasProductColumn && !String(fields.product).trim()) {
      skipped += 1;
      return;
    }
    if (hasSalePriceColumn && !fields.salePrice) {
      skipped += 1;
      return;
    }
    if (rawRows) {
      fields.incoCode = normalizeCellValue(rawRows[rowIndex + 1]?.[incoCodeColumn.index], cptable);
    }
    if (companyNameByCode) {
      fields.companyName = companyNameFromIncoCode(fields.incoCode, companyNameByCode);
    }
    rowsByBarcode.set(barcode, fields);
  });

  const rows = [...rowsByBarcode.values()];
  if (rows.length === 0) {
    throw new Error(t('errors.importNoValidRows'));
  }

  // `companyName` is derived, not a real column in the file, so it's added
  // to the preview table separately, after the file's own columns.
  const previewColumns = incoCodeColumn ? [...columns, { key: 'companyName', label: t('admin.companyName') }] : columns;

  return { columns: previewColumns, rows, totalRows: dataRows.length, skipped };
}
