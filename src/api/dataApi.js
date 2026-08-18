// Raw Firestore calls for the `data` collection: rows from admin Excel
// imports, kept separate from the curated, user-facing `items` inventory in
// api/itemsApi.js — see services/dataService.js for the import logic.
import { doc, getDoc, collection, serverTimestamp, writeBatch } from 'firebase/firestore';
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

// Each row is keyed by `barcode`, used as the doc ID instead of an auto ID
// so re-importing the same product updates it rather than creating a
// duplicate. Writes go straight through with `merge: true` and no
// existence check first, so a large `data` collection doesn't cost a full
// read on every import — at the cost of not being able to tell new rows
// from updated ones. Chunked at 500 since Firestore batches cap there and a
// real product catalog can easily exceed a manual multi-select.
export async function upsertRowsByBarcode(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const batch = writeBatch(db);
    chunk.forEach(({ barcode, ...fields }) => {
      const ref = doc(dataCol, barcode);
      batch.set(ref, { ...fields, barcode, updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  }
  writeLog('write', { action: 'bulkImport', collectionName: 'data', count: rows.length });
}
