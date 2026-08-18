// Raw Firestore calls for the `data` collection: rows from admin Excel
// imports, kept separate from the curated, user-facing `items` inventory in
// api/itemsApi.js — see services/dataService.js for the import logic.
import { doc, collection, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

const dataCol = collection(db, 'data');

// Each row is keyed by `barcode`, used as the doc ID instead of an auto ID
// so re-importing the same product updates it rather than creating a
// duplicate. Writes go straight through with `merge: true` and no
// existence check first, so a large `data` collection doesn't cost a full
// read on every import — at the cost of not being able to tell new rows
// from updated ones, and `ownerId`/`updatedAt` reflecting the most recent
// importer rather than the original one. Chunked at 500 since Firestore
// batches cap there and a real product catalog can easily exceed a manual
// multi-select.
export async function upsertRowsByBarcode(rows, ownerId) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const batch = writeBatch(db);
    chunk.forEach(({ barcode, ...fields }) => {
      const ref = doc(dataCol, barcode);
      batch.set(ref, { ...fields, barcode, ownerId, updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  }
  writeLog('write', { action: 'bulkImport', collectionName: 'data', count: rows.length });
}
