// Raw Firestore calls for the `data` collection: rows from admin Excel
// imports, kept separate from the curated, user-facing `items` inventory in
// api/itemsApi.js — see services/dataService.js for the import logic.
import { doc, getDoc, setDoc, collection, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

const dataCol = collection(db, 'data');

// Firestore batch writes are capped at 500 operations; stay under that for
// headroom (matches the pattern used for the `companies` collection import,
// see companiesApi.upsertCompaniesByCode).
const BATCH_SIZE = 450;

// Bounds each batch commit so a stuck one (e.g. a flaky connection) fails
// fast instead of stalling the whole upload indefinitely — its rows then
// fall back to the pending-import retry path (see
// dataService.uploadParsedRows) like any other batch failure.
const BATCH_TIMEOUT_MS = 30000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error(`Batch commit timed out after ${ms}ms`), { code: 'timeout' }));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

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

// Each row is keyed by `barcode`, used as the doc ID instead of an auto ID
// so re-importing the same product updates it rather than creating a
// duplicate. Since the doc ID is already known for every row, rows are
// written directly in batches (writeBatch) rather than read-then-compared
// first — unlike the `companies` collection, no lookup is needed to find
// which doc a row belongs to.
//
// If a batch fails partway (e.g. the write quota is hit, or a commit times
// out — see BATCH_TIMEOUT_MS), the error is annotated with `uploadedCount`,
// the number of rows already committed in prior batches, so the caller
// knows which rows still need to be saved for a retry.
export async function upsertRowsByBarcode(rows) {
  const total = rows.length;
  let processed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((row) => {
      const { barcode, ...fields } = row;
      batch.set(doc(dataCol, barcode), { ...fields, barcode, updatedAt: serverTimestamp() }, { merge: true });
    });
    try {
      await withTimeout(batch.commit(), BATCH_TIMEOUT_MS);
    } catch (err) {
      err.uploadedCount = processed;
      console.error(
        `[data import] batch failed after ${processed}/${total} rows — ${err.code ?? 'unknown'}: ${err.message}`,
        err,
      );
      throw err;
    }
    processed += chunk.length;
    console.log(`[data import] processed ${processed}/${total} rows`);
  }
  writeLog('write', { action: 'bulkImport', collectionName: 'data', count: processed });
}
