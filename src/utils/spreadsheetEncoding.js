// Format-detection and encoding fixes shared by the real Firestore import
// path (src/services/dataService.js) and the standalone Node scripts
// (scripts/lib/spreadsheetImport.mjs), so both decode a file identically —
// no dependency on @e965/xlsx or cptable here, so this stays free to import
// anywhere without pulling either into a bundle.

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
export function isBinarySpreadsheet(bytes) {
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
export function decodeTextFile(bytes) {
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

// Matches text in the Latin-1 Supplement block (U+0080-U+00FF), which never
// appears in correctly-decoded Korean or English text. It shows up when a
// file's own (wrong) CODEPAGE record tells the parser its strings are
// Windows-1252/Latin-1 while the underlying bytes are actually CP949
// (Korean) — turning every Korean character into Latin-accented-letter
// noise while leaving ASCII text untouched.
const MOJIBAKE_PATTERN = /[\u0080-\u00ff]/;

// Reverses that misdecoding: since each original CP949 byte was mapped
// through Latin-1 into the string we now have, re-encoding it as Latin-1
// recovers those original bytes, which decode correctly as CP949. `cptable`
// is the @e965/xlsx codepage module — callers already load it (usually
// lazily, to keep it out of bundles that don't need it) to register with
// XLSX.set_cptable, so it's passed in rather than imported here.
export function fixMojibake(value, cptable) {
  if (typeof value !== 'string' || !MOJIBAKE_PATTERN.test(value)) return value;
  try {
    return cptable.utils.decode(949, cptable.utils.encode(28591, value));
  } catch {
    return value;
  }
}

// Converts a spreadsheet column header into the camelCase field name used
// throughout this app (e.g. "Expiry Date" -> "expiryDate", "Barcode" ->
// "barcode"), so common headers land on the same keys other item fields use,
// while unrecognized headers still come through as fields.
export function headerToFieldKey(header) {
  return String(header)
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ''))
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
}
