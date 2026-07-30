// Raw Firestore calls for the `users` collection. No business rules here —
// that belongs in services/userService.js.
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseClient';

const usersCol = collection(db, 'users');

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(usersCol, uid));
  return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
}

export async function listUserProfiles() {
  const snap = await getDocs(usersCol);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export function createUserProfile(uid, profile) {
  return setDoc(doc(usersCol, uid), {
    ...profile,
    createdAt: serverTimestamp(),
  });
}

export function updateUserProfile(uid, partialProfile) {
  return updateDoc(doc(usersCol, uid), partialProfile);
}

export function deleteUserProfile(uid) {
  return deleteDoc(doc(usersCol, uid));
}
