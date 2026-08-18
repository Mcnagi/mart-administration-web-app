// Raw Firestore calls for the `items` collection. No business rules here —
// that belongs in services/itemService.js.
import {
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
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

// Live view of the items collection, for the main list page. Firestore
// pushes an initial snapshot from local cache (if any) immediately, then
// again whenever any client's write is acknowledged — so the shared
// inventory (README: any user can add/edit/delete any item) stays in sync
// across everyone's screens without manual reloads. Returns the unsubscribe
// function; callers must invoke it on unmount to stop the listener.
//
// Logged once, at subscribe time, not per update — logging on every
// snapshot would mean a 'logs' write from every open client on every
// change anywhere in the collection, multiplying write volume against the
// Spark plan's free quota.
export function subscribeItems(onData, onError) {
  writeLog('read', { action: 'subscribe', collectionName: 'items' });
  return onSnapshot(itemsCol, (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
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
