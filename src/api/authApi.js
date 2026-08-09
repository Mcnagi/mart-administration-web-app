// Raw Firebase Auth calls only. No app-specific rules or Firestore lookups here —
// that belongs in services/authService.js.
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { auth, getSecondaryAuth } from './firebaseClient';
import { writeLog } from './logsApi';

export async function signIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  writeLog('write', { action: 'signIn', collectionName: 'auth', docId: credential.user.uid });
  return credential;
}

// Logged (and awaited) before signOut() rather than after: once signOut()
// resolves, the client's ID token is gone, so a log write attempted
// afterwards would be unauthenticated and rejected by Firestore rules.
export async function signOutCurrentUser() {
  const uid = auth.currentUser?.uid ?? null;
  await writeLog('write', { action: 'signOut', collectionName: 'auth', docId: uid, actorUid: uid });
  return signOut(auth);
}

export function subscribeToAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

// Creates a brand-new Auth account on the secondary app instance so the
// currently signed-in admin stays signed in on the primary instance.
export async function createUserOnSecondaryApp(email, password) {
  const secondaryAuth = getSecondaryAuth();
  const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const uid = credential.user.uid;
  await signOut(secondaryAuth);
  writeLog('write', { action: 'createUser', collectionName: 'auth', docId: uid });
  return uid;
}

// Firebase rejects updatePassword with auth/requires-recent-login unless the
// session was established recently, so callers must reauthenticate first.
export function reauthenticate(currentPassword) {
  if (!auth.currentUser) throw new Error('Not signed in');
  const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
  return reauthenticateWithCredential(auth.currentUser, credential);
}

export async function changeOwnPassword(newPassword) {
  if (!auth.currentUser) throw new Error('Not signed in');
  await updatePassword(auth.currentUser, newPassword);
  writeLog('write', { action: 'changePassword', collectionName: 'auth', docId: auth.currentUser.uid });
}
