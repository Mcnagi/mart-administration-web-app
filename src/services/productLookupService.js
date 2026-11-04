// The one barcode -> product-row lookup behind every barcode scan and
// manual barcode search (item form, item lists, promo prefill, items list
// name fill-in), so they all agree on what counts as a match.
//
// Only this device's downloaded local-data copy is searched (see
// services/localDataService.js) — never Firestore. Without a copy, every
// lookup reports `noLocalData` so callers can tell the user to download it.
import { getLocalBarcodeIndex, findLocalRow } from './localDataService';

// The codes to try, in order, for a scanned/typed barcode: as given, then
// zero-prefixed, since a common UPC-A (12-digit) / EAN-13 (13-digit,
// leading "0") mismatch means the code the camera reads and the code the
// import stored can differ by exactly that leading zero. Empty for a blank
// barcode.
export function barcodeCandidates(barcode) {
  const trimmed = String(barcode ?? '').trim();
  return trimmed ? [trimmed, `0${trimmed}`] : [];
}

// Returns { row, noLocalData } — `row` is the matched row (keyed like the
// published columns: product, product2, salePrice, ...) or null on a miss;
// `noLocalData` is true when this device has no copy to search at all.
export async function lookupBarcode(barcode) {
  const index = await getLocalBarcodeIndex();
  if (!index) return { row: null, noLocalData: true };
  for (const code of barcodeCandidates(barcode)) {
    const row = findLocalRow(index, code);
    if (row) return { row, noLocalData: false };
  }
  return { row: null, noLocalData: false };
}

// Convenience for callers that only need the matched row.
export async function lookupBarcodeRow(barcode) {
  return (await lookupBarcode(barcode)).row;
}
