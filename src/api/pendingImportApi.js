// Raw Firestore calls for the pending-import mirror: a single doc holding
// the same delimited string that utils/pendingImport.js keeps in
// localStorage (see services/dataService.js for how the two are combined).
// A single fixed doc ID is enough since only one admin import is ever
// in flight app-wide — see firestore.rules for the admin-only access rule.
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

const pendingImportRef = doc(db, 'imports', 'pendingImport');

export async function getPendingImportString() {
  const snap = await getDoc(pendingImportRef);
  writeLog('read', { action: 'get', collectionName: 'imports', docId: 'pendingImport' });
  return snap.exists() ? snap.data().rows : '';
}

// A Firestore doc caps out at 1MiB, so a very large remainder can fail to
// write here — callers treat that as best-effort and fall back to the
// localStorage copy, so let the error propagate rather than swallowing it.
export async function savePendingImportString(rows) {
  await setDoc(pendingImportRef, { rows, updatedAt: serverTimestamp() });
  writeLog('write', { action: 'set', collectionName: 'imports', docId: 'pendingImport' });
}

export async function deletePendingImportString() {
  await deleteDoc(pendingImportRef);
  writeLog('write', { action: 'delete', collectionName: 'imports', docId: 'pendingImport' });
}
