// Client-side persistence for import rows that didn't fit in one upload
// chunk (see UPLOAD_CHUNK_SIZE in services/dataService.js), or that failed
// to upload partway through. localStorage only stores strings, so rows are
// joined into a single string with a delimiter instead of kept as an array
// — that way they survive a page reload and the admin can resume later.
const STORAGE_KEY = 'emart-pending-import-rows';
// ASCII record separator. JSON.stringify always escapes control characters
// inside string values, so this byte can never appear unescaped inside an
// encoded row and collide with the delimiter.
const ROW_DELIMITER = '';

export function encodePendingRows(rows) {
  return rows.map((row) => JSON.stringify(row)).join(ROW_DELIMITER);
}

export function decodePendingRows(str) {
  return str ? str.split(ROW_DELIMITER).map((entry) => JSON.parse(entry)) : [];
}

// Persists `rows` as the pending import, replacing whatever was saved
// before. Passing an empty array clears it.
export function savePendingRows(rows) {
  if (typeof localStorage === 'undefined') return;
  if (rows.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, encodePendingRows(rows));
}

export function loadPendingRows() {
  if (typeof localStorage === 'undefined') return [];
  return decodePendingRows(localStorage.getItem(STORAGE_KEY));
}

// Cheap row count that avoids JSON.parse-ing every row, for UI display.
export function getPendingRowCount() {
  if (typeof localStorage === 'undefined') return 0;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? raw.split(ROW_DELIMITER).length : 0;
}

export function clearPendingRows() {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
}
