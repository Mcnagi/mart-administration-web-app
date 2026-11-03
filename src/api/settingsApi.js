// Raw Firestore calls for the `settings` collection: one doc per
// admin-managed app setting. No business rules here — callers' services
// decide what each doc holds (e.g. services/itemListService.js owns
// `settings/scanList`).
import { doc, getDoc, setDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

const settingsCol = collection(db, 'settings');

export async function getSetting(docId) {
  const snap = await getDoc(doc(settingsCol, docId));
  writeLog('read', { action: 'get', collectionName: 'settings', docId });
  return snap.exists() ? snap.data() : null;
}

export async function setSetting(docId, data) {
  await setDoc(doc(settingsCol, docId), { ...data, updatedAt: serverTimestamp() });
  writeLog('write', { action: 'set', collectionName: 'settings', docId });
}
