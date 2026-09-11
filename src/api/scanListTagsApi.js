// Raw Firestore calls for the `scanListTags` collection (the admin-managed
// tag vocabulary offered when saving a scan list). No business rules here —
// that belongs in services/scanListService.js.
import { doc, addDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

const scanListTagsCol = collection(db, 'scanListTags');

export async function listScanListTags() {
  const snap = await getDocs(scanListTagsCol);
  writeLog('read', { action: 'list', collectionName: 'scanListTags' });
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createScanListTag(label) {
  const ref = await addDoc(scanListTagsCol, { label, createdAt: serverTimestamp() });
  writeLog('write', { action: 'create', collectionName: 'scanListTags', docId: ref.id });
  return ref;
}

export async function deleteScanListTag(tagId) {
  await deleteDoc(doc(scanListTagsCol, tagId));
  writeLog('write', { action: 'delete', collectionName: 'scanListTags', docId: tagId });
}
