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
} from 'firebase/firestore';
import { db } from './firebaseClient';

const itemsCol = collection(db, 'items');

export async function listItems() {
  // Sorting (expiry ascending, empty dates last) is a display concern, not a
  // storage concern, so it's handled in services/itemService.js instead of
  // an orderBy() here — that also avoids needing a composite index.
  const snap = await getDocs(itemsCol);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function createItem(item, ownerId) {
  return addDoc(itemsCol, {
    ...item,
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateItem(itemId, partialItem) {
  return updateDoc(doc(itemsCol, itemId), {
    ...partialItem,
    updatedAt: serverTimestamp(),
  });
}

export function deleteItem(itemId) {
  return deleteDoc(doc(itemsCol, itemId));
}
