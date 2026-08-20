// Business logic for admin bulk-imports: parses an uploaded Excel file into
// rows keyed by barcode and upserts them into the `data` collection — a raw
// staging store, decoupled from the curated `items` inventory (see
// itemService.js). Views should call only this file, never api/dataApi.js
// directly.
import * as dataApi from '../api/dataApi';
import * as pendingImportApi from '../api/pendingImportApi';
import { t } from '../i18n/i18n';
import { isBinarySpreadsheet, decodeTextFile, fixMojibake, headerToFieldKey } from '../utils/spreadsheetEncoding';
import {
  encodePendingRows,
  decodePendingRows,
  savePendingRows as saveLocalPendingRows,
  loadPendingRows as loadLocalPendingRows,
  getPendingRowCount as getLocalPendingRowCount,
  clearPendingRows as clearLocalPendingRows,
} from '../utils/pendingImport';

// Firestore's free-tier (Spark plan) daily write quota is 20,000 writes.
// Uploading no more than this many rows per call keeps a large import from
// burning through the whole day's quota in one shot, leaving headroom for
// the writeLog call and any other admin writes that day. (The read side —
// 1 getDoc per row via upsertRowsByBarcode's change check — is nowhere
// close to the 50,000/day read quota at this size; see firestore.rules'
// data/{docId} write rule for why writes don't also tax the read quota.)
const UPLOAD_CHUNK_SIZE = 19500;

// The pending import (rows saved by uploadParsedRows past the chunk size,
// or left over after a failed upload) is saved to Firestore
// (api/pendingImportApi.js) so it can be resumed from another device.
// localStorage is only a fallback for when that Firestore write itself
// fails — e.g. offline, or a very large remainder exceeding Firestore's
// 1MiB document cap — so the rows aren't lost even then. A successful
// Firestore write clears any such leftover local fallback, so a later load
// can't mistakenly prefer stale local data over a good Firestore save.
async function savePendingRows(rows) {
  try {
    if (rows.length === 0) {
      await pendingImportApi.deletePendingImportString();
    } else {
      await pendingImportApi.savePendingImportString(encodePendingRows(rows));
    }
    clearLocalPendingRows();
  } catch (err) {
    console.error('Failed to save pending import to Firestore, falling back to localStorage', err);
    saveLocalPendingRows(rows);
  }
}

// localStorage is checked first: its presence means a previous save() fell
// back to it after a Firestore write failure, so it holds the freshest data
// and Firestore may be stale. Otherwise the rows live in Firestore as normal.
async function loadPendingRows() {
  const local = loadLocalPendingRows();
  if (local.length > 0) return local;
  try {
    const remote = await pendingImportApi.getPendingImportString();
    return remote ? decodePendingRows(remote) : [];
  } catch (err) {
    console.error('Failed to load pending import from Firestore', err);
    return [];
  }
}

async function clearPendingRows() {
  clearLocalPendingRows();
  try {
    await pendingImportApi.deletePendingImportString();
  } catch (err) {
    console.error('Failed to clear pending import from Firestore', err);
  }
}

// Row count for UI display — local first, falling back to a Firestore read
// only when there's nothing local to show (see loadPendingRows above).
export async function getPendingRowCount() {
  const local = getLocalPendingRowCount();
  if (local > 0) return local;
  try {
    const remote = await pendingImportApi.getPendingImportString();
    return remote ? decodePendingRows(remote).length : 0;
  } catch (err) {
    console.error('Failed to read pending import count from Firestore', err);
    return 0;
  }
}

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
const ALLOWED_FIELD_KEYS = ['barcode', 'product', 'product2', 'class1', 'class2', 'class3', 'maker', 'salePrice'];

// Reads an .xlsx/.xls workbook or a CSV/TSV export (first sheet) and maps
// its header row to fields, deduped by `barcode` (re-importing the same
// file will update existing rows rather than duplicate them once uploaded).
// Rows missing a barcode, a product name, or a (non-zero) sale price are
// skipped and counted, not errored, since a stray blank/incomplete row in
// an exported sheet is the common case, not a mistake — but only when that
// column is actually present in the file, since not every export includes
// a product name or sale price column. Does not write anything — see
// uploadParsedRows for that, so the caller can show a preview and let the
// admin confirm before anything is written.
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
  const hasProductColumn = columns.some((c) => c.key === 'product');
  const hasSalePriceColumn = columns.some((c) => c.key === 'salePrice');
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
      const value = normalizeCellValue(row[index], cptable);
      fields[key] = key === 'salePrice' ? Number(value) || 0 : value;
    });
    if (hasProductColumn && !String(fields.product).trim()) {
      skipped += 1;
      return;
    }
    if (hasSalePriceColumn && !fields.salePrice) {
      skipped += 1;
      return;
    }
    rowsByBarcode.set(barcode, fields);
  });

  const rows = [...rowsByBarcode.values()];
  if (rows.length === 0) {
    throw new Error(t('errors.importNoValidRows'));
  }

  return { columns, rows, totalRows: dataRows.length, skipped };
}

// Writes previously parsed rows (see parseExcelFile) to the `data`
// collection, keyed by barcode. Only the first UPLOAD_CHUNK_SIZE rows are
// uploaded — anything beyond that is saved as a pending import (see
// utils/pendingImport.js) rather than uploaded now, so the caller should
// check the returned `remaining` count and offer continuePendingImport().
//
// If the upload itself fails partway (e.g. the daily write quota is hit),
// whatever wasn't confirmed as written is saved as the pending import too,
// so a failed attempt doesn't lose parsed data — it just needs a retry via
// continuePendingImport() once the error clears.
export async function uploadParsedRows(rows) {
  const chunk = rows.slice(0, UPLOAD_CHUNK_SIZE);
  const overflow = rows.slice(UPLOAD_CHUNK_SIZE);
  console.log(`[data import] uploading ${chunk.length} row(s), ${overflow.length} row(s) queued for later`);
  try {
    await dataApi.upsertRowsByBarcode(chunk);
  } catch (err) {
    const notUploaded = chunk.slice(err.uploadedCount ?? 0);
    console.error(
      `[data import] upload failed; saving ${notUploaded.length + overflow.length} row(s) as pending`,
      err,
    );
    await savePendingRows([...notUploaded, ...overflow]);
    throw err;
  }
  console.log(`[data import] upload finished: ${chunk.length} row(s) uploaded, ${overflow.length} row(s) remaining`);
  await savePendingRows(overflow);
  return { imported: chunk.length, remaining: overflow.length };
}

// Resumes an import left pending by uploadParsedRows — either because the
// file had more rows than one chunk, or because a previous attempt failed
// partway through. Parses the saved string back into rows (local copy first,
// falling back to the Firestore mirror) and re-runs the same chunked upload.
export async function continuePendingImport() {
  const rows = await loadPendingRows();
  if (rows.length === 0) {
    console.log('[data import] no pending import to continue');
    return { imported: 0, remaining: 0 };
  }
  console.log(`[data import] continuing pending import: ${rows.length} row(s) loaded`);
  return uploadParsedRows(rows);
}

export { clearPendingRows };
