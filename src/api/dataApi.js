// Raw Firestore calls for the `data` collection: rows from admin Excel
// imports, kept separate from the curated, user-facing `items` inventory in
// api/itemsApi.js — see services/dataService.js for the import logic.
import { doc, getDoc, setDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

const dataCol = collection(db, 'data');

// Looks up a single imported row by its barcode (the doc ID in this
// collection — see upsertRowsByBarcode below), for the item form's barcode
// search. Returns null when no row matches.
export async function getDataByBarcode(barcode) {
  const snap = await getDoc(doc(dataCol, barcode));
  writeLog('read', { action: 'get', collectionName: 'data', docId: barcode });
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Caches the single photo an item was actually saved with, on the same doc,
// so the next item scanned with this barcode finds it already attached
// (see itemService.saveItem). Some older docs may also carry a `photos`
// field — search candidates cached by a since-removed photo-search feature
// — which itemService.searchProductByBarcode still reads if present, but
// nothing writes it anymore.
export async function savePhotoForBarcode(barcode, photoBase64) {
  await setDoc(doc(dataCol, barcode), { barcode, photo: photoBase64 }, { merge: true });
  writeLog('write', { action: 'set', collectionName: 'data', docId: barcode });
}

function fieldsUnchanged(existing, fields) {
  return existing != null && Object.keys(fields).every((key) => existing[key] === fields[key]);
}

// Each row is keyed by `barcode`, used as the doc ID instead of an auto ID
// so re-importing the same product updates it rather than creating a
// duplicate. Re-importing the same file repeatedly is the common case (a
// daily export re-uploaded to catch new products), so each row is read
// first and the write is skipped entirely when nothing actually changed —
// trading a read (Firestore's free-tier quota: 50,000/day) for a write
// (20,000/day, the one this import is chunked to protect — see
// UPLOAD_CHUNK_SIZE in services/dataService.js) on every row that's already
// up to date.
//
// If a row fails partway (e.g. the write quota is hit), the error is
// annotated with `uploadedCount`, the number of rows already handled
// (written or correctly skipped as unchanged), so the caller knows which
// rows still need to be saved for a retry.
export async function upsertRowsByBarcode(rows) {
  let processed = 0;
  let written = 0;
  const total = rows.length;
  for (const row of rows) {
    const { barcode, ...fields } = row;
    const ref = doc(dataCol, barcode);
    try {
      const snap = await getDoc(ref);
      if (!fieldsUnchanged(snap.exists() ? snap.data() : null, fields)) {
        await setDoc(ref, { ...fields, barcode, updatedAt: serverTimestamp() }, { merge: true });
        written += 1;
      }
      processed += 1;
      if (processed % 500 === 0 || processed === total) {
        console.log(`[data import] processed ${processed}/${total} rows (${written} written, ${processed - written} unchanged)`);
      }
    } catch (err) {
      err.uploadedCount = processed;
      console.error(
        `[data import] row ${barcode} failed after ${processed}/${total} rows — ${err.code ?? 'unknown'}: ${err.message}`,
        err,
      );
      throw err;
    }
  }
  writeLog('write', { action: 'bulkImport', collectionName: 'data', count: written, unchanged: processed - written });
}
