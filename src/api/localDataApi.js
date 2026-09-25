// Raw Firestore calls for the `localData` collection: a published snapshot
// of imported rows, encoded as an array of long strings (see
// utils/localDataEncoding.js) that any user can download and keep on-device
// — see services/localDataService.js for the publish/download logic.
//
// Layout: the `meta` doc holds the snapshot's metadata plus the first
// `strings` array. When the strings don't all fit under Firestore's 1 MiB
// doc limit, the rest spill into overflow docs named `v{version}-{index}`
// (index from 1), each with its own `strings` array. Overflow docs are
// versioned and written before `meta`, so a new publish never changes the
// docs a concurrent download is still reading; the previous version's
// overflow docs are deleted only after `meta` flips to the new one.
import { doc, getDoc, setDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseClient';
import { writeLog } from './logsApi';

const localDataCol = collection(db, 'localData');
const metaRef = doc(localDataCol, 'meta');

function overflowRef(version, index) {
  return doc(localDataCol, `v${version}-${String(index).padStart(4, '0')}`);
}

export async function getMeta() {
  const snap = await getDoc(metaRef);
  writeLog('read', { action: 'get', collectionName: 'localData', docId: 'meta' });
  return snap.exists() ? snap.data() : null;
}

// Every string of the snapshot `meta` describes, in order: meta's own
// array followed by each overflow doc's, read in parallel.
export async function getAllStrings(meta) {
  const overflowCount = Math.max(0, (meta.docCount ?? 1) - 1);
  const snaps = await Promise.all(Array.from({ length: overflowCount }, (_, i) => getDoc(overflowRef(meta.version, i + 1))));
  if (overflowCount > 0) writeLog('read', { action: 'getOverflow', collectionName: 'localData', count: overflowCount });
  const strings = [...(meta.strings ?? [])];
  snaps.forEach((snap, i) => {
    if (!snap.exists()) throw new Error(`Local data doc ${i + 2}/${meta.docCount} is missing.`);
    strings.push(...snap.data().strings);
  });
  return strings;
}

// `docs` is an array of string arrays (see packStringsIntoDocs): docs[0]
// goes on `meta`, the rest into overflow docs, written one at a time (each
// is up to ~1 MiB). `onProgress(done, total)` fires after each doc.
export async function publishDocs(version, docs, meta, onProgress) {
  for (let i = 1; i < docs.length; i += 1) {
    await setDoc(overflowRef(version, i), { strings: docs[i] });
    onProgress?.(i, docs.length);
  }
  await setDoc(metaRef, { ...meta, version, docCount: docs.length, strings: docs[0], updatedAt: serverTimestamp() });
  onProgress?.(docs.length, docs.length);
  writeLog('write', { action: 'publish', collectionName: 'localData', count: docs.length });
}

export async function deleteOverflowDocs(version, docCount) {
  const overflowCount = Math.max(0, docCount - 1);
  if (overflowCount === 0) return;
  await Promise.all(Array.from({ length: overflowCount }, (_, i) => deleteDoc(overflowRef(version, i + 1))));
  writeLog('write', { action: 'deleteOverflow', collectionName: 'localData', count: overflowCount });
}
