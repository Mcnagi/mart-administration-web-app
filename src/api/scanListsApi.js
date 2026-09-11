// Raw Firestore calls for the `scanLists` collection. No business rules
// here — that belongs in services/scanListService.js.
import { doc, addDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

const scanListsCol = collection(db, 'scanLists');

export async function listScanLists() {
  const snap = await getDocs(scanListsCol);
  writeLog('read', { action: 'list', collectionName: 'scanLists' });
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createScanList(scanList, ownerId) {
  const ref = await addDoc(scanListsCol, {
    ...scanList,
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  writeLog('write', { action: 'create', collectionName: 'scanLists', docId: ref.id });
  return ref;
}

export async function updateScanList(scanListId, partialScanList) {
  await updateDoc(doc(scanListsCol, scanListId), {
    ...partialScanList,
    updatedAt: serverTimestamp(),
  });
  writeLog('write', { action: 'update', collectionName: 'scanLists', docId: scanListId });
}

export async function deleteScanList(scanListId) {
  await deleteDoc(doc(scanListsCol, scanListId));
  writeLog('write', { action: 'delete', collectionName: 'scanLists', docId: scanListId });
}
