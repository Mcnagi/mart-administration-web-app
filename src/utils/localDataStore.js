// On-device copy of the published local-data snapshot (see
// services/localDataService.js): the decoded rows plus the column list and
// version they came from, so the page can tell whether a newer snapshot has
// been published since this device last downloaded.
//
// Kept in IndexedDB rather than localStorage: localStorage is capped at
// roughly 5M characters (about half that on iOS Safari) and only stores
// strings, while the full snapshot is several MB. IndexedDB's quota is a
// share of free disk space, and it stores the row arrays as-is (structured
// clone), with no JSON.stringify/parse on every save and load.
const DB_NAME = 'emart-local-data';
const DB_VERSION = 1;
const STORE_NAME = 'snapshot';
const RECORD_KEY = 'current';

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((err) => {
      // Let a later call retry instead of caching the failure forever.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// Runs one request against the store and resolves once its transaction has
// committed (for writes, that's when the data is actually on disk).
async function run(mode, makeRequest) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = makeRequest(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Rejects on failure (e.g. QuotaExceededError when the device is out of
// space) so the caller can report it.
export function saveLocalData(data) {
  return run('readwrite', (store) => store.put(data, RECORD_KEY));
}

// Resolves to null when nothing has been downloaded yet, or when IndexedDB
// is unavailable (e.g. some private-browsing modes).
export async function loadLocalData() {
  if (typeof indexedDB === 'undefined') return null;
  try {
    return (await run('readonly', (store) => store.get(RECORD_KEY))) ?? null;
  } catch (err) {
    console.error('Failed to read local data', err);
    return null;
  }
}

export function clearLocalData() {
  return run('readwrite', (store) => store.delete(RECORD_KEY));
}

// Asks the browser not to evict this site's storage under disk pressure.
// Best-effort: browsers may decline or ignore it, and that's fine.
export async function requestPersistentStorage() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
