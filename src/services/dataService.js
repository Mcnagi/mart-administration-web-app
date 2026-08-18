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

// BIFF "BOF" (Beginning Of File) record IDs across versions — 0x0009 (BIFF2),
// 0x0209 (BIFF3), 0x0409 (BIFF4), 0x0809 (BIFF5/BIFF7, and raw BIFF8). Some
// export tools (common from older DB/SQL "export to Excel" features) write
// this record directly as the first bytes of the file, skipping the OLE2
// container that Excel 97+ normally wraps .xls files in.
const BIFF_BOF_RECORD_IDS = new Set([0x0009, 0x0209, 0x0409, 0x0809]);

// True for the binary spreadsheet formats (.xlsx is a zip, "PK\x03\x04...";
// legacy .xls is an OLE compound file, or a raw BIFF stream without that
// wrapper), identified by magic bytes rather than the file's extension/name,
// which can't be trusted — e.g. a CSV exported from a SQL tool and saved
// with an ".xls" extension is still just text underneath.
function isBinarySpreadsheet(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return true; // xlsx (zip)
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return true; // legacy xls (OLE compound file)
  }
  if (bytes.length >= 2 && BIFF_BOF_RECORD_IDS.has(bytes[0] | (bytes[1] << 8))) {
    return true; // raw BIFF stream (pre-OLE2 export)
  }
  return false;
}

// Decodes a plain-text export (CSV/TSV) to a JS string, honoring a BOM when
// present. Many SQL client "export results" features default to UTF-16 —
// without sniffing the BOM, that text gets misread as UTF-8/ASCII and every
// non-Latin character (and often the byte pairs around plain ASCII headers
// too) turns into replacement characters before parsing ever sees it.
function decodeTextFile(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// Reads an .xlsx/.xls workbook or a CSV/TSV export (first sheet), maps its
// header row to fields, and upserts each row into the `data` collection
// keyed by its `barcode` column so re-importing the same file updates
// existing rows rather than duplicating them. Rows without a barcode are
// skipped and counted, not errored, since a stray blank row in an exported
// sheet is the common case, not a mistake.
export async function importExcelData(file) {
  const XLSX = await import('@e965/xlsx');
  // Legacy .xls (BIFF) files store non-Unicode strings in a codepage-specific
  // encoding rather than UTF-16 — without registering the codepage table,
  // xlsx falls back to the wrong decoding and non-Latin text (e.g. Korean
  // product names) comes out as mojibake, which then gets written to
  // Firestore as-is. .xlsx files are unaffected (already UTF-8 in
  // sharedStrings.xml), so this only matters for the legacy format.
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

  await dataApi.upsertRowsByBarcode(rows);
  return { imported: rows.length, skipped };
}
