// The one barcode -> imported-row lookup behind every barcode scan and
// manual barcode search (item form, scan lists, promo prefill, items list
// name fill-in), so they all agree on what counts as a match.
//
// When this device has downloaded the local-data snapshot (see
// services/localDataService.js), only that copy is searched — no Firestore
// reads at all, so a miss there is a miss. Without a usable copy it falls
// back to the Firestore `data` collection.
import { getDataByBarcode } from '../api/dataApi';
import { getLocalBarcodeIndex, findLocalRow } from './localDataService';

// A data/{barcode} doc can exist with only a legacy cached `photos` field
// and no imported fields (left behind by an old photo-search feature), so a
// real match needs `product` or `salePrice`, not just the row's existence.
function isImportedRow(row) {
  return !!(row?.product || row?.salePrice);
}

// Returns { row, source } — `source` is 'local' or 'firestore', whichever
// was searched; `row` is null on a miss. A miss retries once with a
// zero-prefixed barcode, since a common UPC-A (12-digit) / EAN-13 (13-digit,
// leading "0") mismatch means the code the camera reads and the code the
// import stored can differ by exactly that leading zero.
export async function lookupBarcode(barcode) {
  const trimmed = String(barcode ?? '').trim();
  if (!trimmed) return { row: null, source: null };
  const candidates = [trimmed, `0${trimmed}`];

  const localIndex = await getLocalBarcodeIndex();
  if (localIndex) {
    for (const code of candidates) {
      const row = findLocalRow(localIndex, code);
      if (isImportedRow(row)) return { row, source: 'local' };
    }
    return { row: null, source: 'local' };
  }

  let firstRow = null;
  for (const code of candidates) {
    const row = await getDataByBarcode(code);
    if (isImportedRow(row)) return { row, source: 'firestore' };
    firstRow ??= row;
  }
  // Not an imported match, but a legacy doc may still carry cached photos
  // for the barcode as typed — handed back so the item form can offer them.
  return { row: null, legacyRow: firstRow, source: 'firestore' };
}

// Convenience for callers that only need the matched row.
export async function lookupBarcodeRow(barcode) {
  return (await lookupBarcode(barcode)).row;
}
