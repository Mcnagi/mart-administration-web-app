// Raw Firestore calls for the `scanLists` collection. No business rules
// here — that belongs in services/itemListService.js.
import { doc, addDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

// Stored under the feature's original name, "scan lists" — renaming the
// collection would orphan existing data.
const itemListsCol = collection(db, 'scanLists');

export async function listItemLists() {
  const snap = await getDocs(itemListsCol);
  writeLog('read', { action: 'list', collectionName: 'scanLists' });
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createItemList(itemList, ownerId) {
  const ref = await addDoc(itemListsCol, {
    ...itemList,
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  writeLog('write', { action: 'create', collectionName: 'scanLists', docId: ref.id });
  return ref;
}

export async function updateItemList(itemListId, partialItemList) {
  await updateDoc(doc(itemListsCol, itemListId), {
    ...partialItemList,
    updatedAt: serverTimestamp(),
  });
  writeLog('write', { action: 'update', collectionName: 'scanLists', docId: itemListId });
}

export async function deleteItemList(itemListId) {
  await deleteDoc(doc(itemListsCol, itemListId));
  writeLog('write', { action: 'delete', collectionName: 'scanLists', docId: itemListId });
}
