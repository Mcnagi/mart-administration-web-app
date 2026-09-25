// Packs parsed import rows into long strings for the local-data snapshot
// (see services/localDataService.js), and packs those strings into as few
// Firestore docs as possible — each doc holds a `strings` array — so the
// whole dataset is published and downloaded with a handful of reads instead
// of one doc per row.
//
// Each row is encoded as a JSON array of its values (column order is stored
// once, separately, rather than repeating every key on every row), and rows
// are joined with the ASCII record separator — same delimiter trick as
// utils/pendingImport.js: JSON.stringify always escapes control characters
// inside strings, so it can never appear inside an encoded row.
const ROW_DELIMITER = '\u001e';

// Firestore caps a whole document at 1 MiB (1,048,576 bytes), array fields
// included, measured in UTF-8 — not JS string length, so Korean text (3
// bytes per character) counts roughly triple. Docs are filled up to
// MAX_DOC_BYTES, leaving headroom for the doc name and field names.
export const MAX_DOC_BYTES = 1_000_000;

// Each string is kept well under a doc so several pack into one `strings`
// array, and the first doc (which also carries the column metadata) still
// has room for a few.
export const MAX_STRING_BYTES = 200_000;

// How many rows to encode between yields to the event loop, so a large file
// doesn't freeze the page and the progress display can actually repaint.
const YIELD_EVERY_ROWS = 2000;

// UTF-8 byte length without allocating an encoded copy of the string. A
// surrogate pair (one astral character, 4 bytes in UTF-8) is two UTF-16 code
// units here, each counted as 2 bytes, which adds up correctly.
export function utf8ByteLength(str) {
  let bytes = 0;
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800 || (code >= 0xd800 && code <= 0xdfff)) bytes += 2;
    else bytes += 3;
  }
  return bytes;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function encodeRow(row, columnKeys) {
  return JSON.stringify(columnKeys.map((key) => row[key] ?? ''));
}

// Encodes `rows` (objects, as returned by dataService.parseExcelFile) into
// strings of at most `maxBytes` UTF-8 bytes each, keeping only `columnKeys`.
// A row is never split across two strings. `onProgress` is called
// periodically with { rowsEncoded, totalRows, chunkCount, currentChunkBytes }
// so the caller can show the string array growing while encoding runs.
export async function encodeRowsToChunks(rows, columnKeys, { maxBytes = MAX_STRING_BYTES, onProgress } = {}) {
  const chunks = [];
  let parts = [];
  let partsBytes = 0;

  function flush() {
    if (parts.length === 0) return;
    chunks.push({ text: parts.join(ROW_DELIMITER), bytes: partsBytes, rowCount: parts.length });
    parts = [];
    partsBytes = 0;
  }

  for (let i = 0; i < rows.length; i += 1) {
    const encoded = encodeRow(rows[i], columnKeys);
    const encodedBytes = utf8ByteLength(encoded);
    if (encodedBytes > maxBytes) {
      throw new Error(`Row ${i + 1} is ${encodedBytes} bytes, larger than the ${maxBytes}-byte string limit.`);
    }
    const delimiterBytes = parts.length > 0 ? 1 : 0;
    if (partsBytes + delimiterBytes + encodedBytes > maxBytes) flush();
    partsBytes += (parts.length > 0 ? 1 : 0) + encodedBytes;
    parts.push(encoded);

    if (onProgress && (i + 1) % YIELD_EVERY_ROWS === 0) {
      onProgress({ rowsEncoded: i + 1, totalRows: rows.length, chunkCount: chunks.length + 1, currentChunkBytes: partsBytes });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  flush();
  onProgress?.({ rowsEncoded: rows.length, totalRows: rows.length, chunkCount: chunks.length, currentChunkBytes: 0 });
  return chunks;
}

// Firestore's stored size of a string: its UTF-8 bytes plus one.
function storedStringBytes(chunk) {
  return chunk.bytes + 1;
}

// Groups encoded strings, in order, into docs of at most `maxDocBytes` each.
// The first doc's budget is reduced by `firstDocOverheadBytes` for the
// metadata it carries alongside its strings. Returns an array of docs, each
// an array of strings.
export function packStringsIntoDocs(chunks, { maxDocBytes = MAX_DOC_BYTES, firstDocOverheadBytes = 0 } = {}) {
  const docs = [];
  let current = [];
  let currentBytes = firstDocOverheadBytes;
  chunks.forEach((chunk) => {
    const bytes = storedStringBytes(chunk);
    if (current.length > 0 && currentBytes + bytes > maxDocBytes) {
      docs.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(chunk.text);
    currentBytes += bytes;
  });
  if (current.length > 0 || docs.length === 0) docs.push(current);
  return docs;
}

// Reverses encodeRowsToChunks: every chunk's rows, in order, as arrays of
// values in the same column order the chunks were encoded with.
export function decodeChunks(texts) {
  const rows = [];
  texts.forEach((text) => {
    if (!text) return;
    text.split(ROW_DELIMITER).forEach((entry) => rows.push(JSON.parse(entry)));
  });
  return rows;
}
