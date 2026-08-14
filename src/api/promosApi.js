// Raw Firestore calls for the `promos` collection. No business rules here —
// that belongs in services/promoService.js.
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

const promosCol = collection(db, 'promos');

export async function listPromos() {
  const snap = await getDocs(promosCol);
  writeLog('read', { action: 'list', collectionName: 'promos' });
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createPromo(promo, ownerId) {
  const ref = await addDoc(promosCol, {
    ...promo,
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  writeLog('write', { action: 'create', collectionName: 'promos', docId: ref.id });
  return ref;
}

export async function updatePromo(promoId, partialPromo) {
  await updateDoc(doc(promosCol, promoId), {
    ...partialPromo,
    updatedAt: serverTimestamp(),
  });
  writeLog('write', { action: 'update', collectionName: 'promos', docId: promoId });
}

export async function deletePromo(promoId) {
  await deleteDoc(doc(promosCol, promoId));
  writeLog('write', { action: 'delete', collectionName: 'promos', docId: promoId });
}

export async function batchDeletePromos(promoIds) {
  const batch = writeBatch(db);
  promoIds.forEach((id) => batch.delete(doc(promosCol, id)));
  await batch.commit();
  writeLog('write', { action: 'batchDelete', collectionName: 'promos', promoIds });
}
