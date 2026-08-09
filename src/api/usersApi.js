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
import { writeLog } from './logsApi';

const usersCol = collection(db, 'users');

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(usersCol, uid));
  writeLog('read', { action: 'get', collectionName: 'users', docId: uid });
  return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
}

export async function listUserProfiles() {
  const snap = await getDocs(usersCol);
  writeLog('read', { action: 'list', collectionName: 'users' });
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export async function createUserProfile(uid, profile) {
  await setDoc(doc(usersCol, uid), {
    ...profile,
    createdAt: serverTimestamp(),
  });
  writeLog('write', { action: 'create', collectionName: 'users', docId: uid });
}

export async function updateUserProfile(uid, partialProfile) {
  await updateDoc(doc(usersCol, uid), partialProfile);
  writeLog('write', { action: 'update', collectionName: 'users', docId: uid });
}

export async function deleteUserProfile(uid) {
  await deleteDoc(doc(usersCol, uid));
  writeLog('write', { action: 'delete', collectionName: 'users', docId: uid });
}
