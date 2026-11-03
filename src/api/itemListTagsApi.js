// Raw Firestore calls for the `scanListTags` collection (the admin-managed
// tag vocabulary offered when saving an item list). No business rules here —
// that belongs in services/itemListService.js.
import { doc, addDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

// Stored under the feature's original name, "scan lists" — renaming the
// collection would orphan existing data.
const itemListTagsCol = collection(db, 'scanListTags');

export async function listItemListTags() {
  const snap = await getDocs(itemListTagsCol);
  writeLog('read', { action: 'list', collectionName: 'scanListTags' });
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createItemListTag(label) {
  const ref = await addDoc(itemListTagsCol, { label, createdAt: serverTimestamp() });
  writeLog('write', { action: 'create', collectionName: 'scanListTags', docId: ref.id });
  return ref;
}

export async function deleteItemListTag(tagId) {
  await deleteDoc(doc(itemListTagsCol, tagId));
  writeLog('write', { action: 'delete', collectionName: 'scanListTags', docId: tagId });
}
