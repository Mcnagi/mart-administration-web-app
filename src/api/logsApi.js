// Raw Firestore calls for the `logs` collection: an append-only audit trail
// of every read/write against items and users, plus auth events (sign-in,
// sign-out, account creation, password change). Doc IDs are client-generated
// timestamps (yyyyMMdd-HHmmss-SSS) rather than auto IDs, so entries sort
// chronologically by ID alone and stay human-readable in the console.
import { doc, setDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebaseClient';

const logsCol = collection(db, 'logs');

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

// yyyyMMdd-HHmmss-SSS, e.g. "20260809-153045-123". Milliseconds are always
// included (rather than only "if a collision happens") since this app's
// operations are entirely async client calls that can easily land in the
// same second.
function generateLogId() {
  const now = new Date();
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}-${pad(now.getMilliseconds(), 3)}`;
}

// type: 'read' | 'write'. collectionName is the Firestore collection the
// action targeted ('items' | 'users'), or 'auth' for sign-in/out/account
// events that aren't a Firestore doc read/write. actorUid overrides the
// default (the currently signed-in user) for the one case where the actor
// is about to sign out and so won't be auth.currentUser by write time.
//
// Never throws: a logging failure (offline, rules denial) must not break
// the real operation it's describing, so failures are swallowed here and
// only surfaced to the console.
export function writeLog(type, { action, collectionName, docId = null, actorUid, ...extra }) {
  const uid = actorUid !== undefined ? actorUid : (auth.currentUser?.uid ?? null);
  return setDoc(doc(logsCol, generateLogId()), {
    type,
    action,
    collection: collectionName,
    docId,
    uid,
    ...extra,
    at: serverTimestamp(),
  }).catch((err) => {
    console.error('Failed to write log entry', err);
  });
}
