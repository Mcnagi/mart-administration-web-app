// Raw Firestore calls for the `data` collection: rows from admin Excel
// imports, kept separate from the curated, user-facing `items` inventory in
// api/itemsApi.js — see services/dataService.js for the import logic.
import { doc, collection, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

const dataCol = collection(db, 'data');

// Only doc IDs (barcodes) are needed to tell new rows from existing ones;
// Firestore has no "IDs only" query, so a full read is the only option.
export async function listBarcodes() {
  const snap = await getDocs(dataCol);
  writeLog('read', { action: 'list', collectionName: 'data' });
  return snap.docs.map((d) => d.id);
}

// Each row is keyed by `barcode`, used as the doc ID instead of an auto ID
// so re-importing the same product updates it rather than creating a
// duplicate. Existing docs are updated via a merge (so createdAt/ownerId
// survive re-imports); new docs get full creation metadata. Chunked at 500
// since Firestore batches cap there and a real product catalog can easily
// exceed a manual multi-select.
export async function upsertRowsByBarcode(rows, existingBarcodes, ownerId) {
  let created = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const batch = writeBatch(db);
    chunk.forEach(({ barcode, ...fields }) => {
      const ref = doc(dataCol, barcode);
      if (existingBarcodes.has(barcode)) {
        batch.set(ref, { ...fields, barcode, updatedAt: serverTimestamp() }, { merge: true });
        updated += 1;
      } else {
        batch.set(ref, { ...fields, barcode, ownerId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        created += 1;
      }
    });
    await batch.commit();
  }
  writeLog('write', { action: 'bulkImport', collectionName: 'data', count: rows.length });
  return { created, updated };
}
