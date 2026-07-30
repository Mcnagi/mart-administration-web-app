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

export function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signOutCurrentUser() {
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
  return uid;
}

// Firebase rejects updatePassword with auth/requires-recent-login unless the
// session was established recently, so callers must reauthenticate first.
export function reauthenticate(currentPassword) {
  if (!auth.currentUser) throw new Error('Not signed in');
  const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
  return reauthenticateWithCredential(auth.currentUser, credential);
}

export function changeOwnPassword(newPassword) {
  if (!auth.currentUser) throw new Error('Not signed in');
  return updatePassword(auth.currentUser, newPassword);
}
