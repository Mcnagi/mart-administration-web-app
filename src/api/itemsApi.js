// Raw Firestore calls for the `items` collection. No business rules here —
// that belongs in services/itemService.js.
import {
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

const itemsCol = collection(db, 'items');

export async function listItems() {
  // Sorting (expiry ascending, empty dates last) is a display concern, not a
  // storage concern, so it's handled in services/itemService.js instead of
  // an orderBy() here — that also avoids needing a composite index.
  const snap = await getDocs(itemsCol);
  writeLog('read', { action: 'list', collectionName: 'items' });
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createItem(item, ownerId) {
  const ref = await addDoc(itemsCol, {
    ...item,
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  writeLog('write', { action: 'create', collectionName: 'items', docId: ref.id });
  return ref;
}

export async function updateItem(itemId, partialItem) {
  await updateDoc(doc(itemsCol, itemId), {
    ...partialItem,
    updatedAt: serverTimestamp(),
  });
  writeLog('write', { action: 'update', collectionName: 'items', docId: itemId });
}

export async function deleteItem(itemId) {
  await deleteDoc(doc(itemsCol, itemId));
  writeLog('write', { action: 'delete', collectionName: 'items', docId: itemId });
}

// Firestore batches cap at 500 ops, well above what a manual multi-select
// in this UI would ever produce, so no chunking is needed.
export async function batchUpdateItems(itemIds, partialItem) {
  const batch = writeBatch(db);
  itemIds.forEach((id) => {
    batch.update(doc(itemsCol, id), { ...partialItem, updatedAt: serverTimestamp() });
  });
  await batch.commit();
  writeLog('write', { action: 'batchUpdate', collectionName: 'items', itemIds });
}

export async function batchDeleteItems(itemIds) {
  const batch = writeBatch(db);
  itemIds.forEach((id) => batch.delete(doc(itemsCol, id)));
  await batch.commit();
  writeLog('write', { action: 'batchDelete', collectionName: 'items', itemIds });
}
