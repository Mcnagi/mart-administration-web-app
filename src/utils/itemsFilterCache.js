// Session-scoped cache for the Items page's filter/sort selections, so
// navigating away (e.g. into an item's detail) and back — or switching
// between other tabs of the app — restores what was selected, without the
// choices surviving a real page reload or carrying over into a new tab.
//
// hasLoadedThisRuntime()/markLoadedThisRuntime() separate "the app just
// booted" (a hard reload, or a brand-new tab/session) from "the user
// navigated back to Items within the already-running app". ItemsPage uses
// this to decide whether the discount filter's one-time "no discount"
// default + hint toast should fire again, even though sessionStorage itself
// would otherwise still have last session's discount pick sitting in it
// after a reload.
//
// Split into a pure read and a separate mark step (rather than one
// mutate-and-return call) so the read is safe to call from a useState
// initializer under React StrictMode, which deliberately double-invokes
// those in development.

const STORAGE_KEY = 'emart.itemsFilters.v1';

export function readCachedFilters() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeCachedFilters(filters) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Storage full or unavailable (private browsing, etc.) — filters just
    // won't be remembered this time.
  }
}

let loadedThisRuntime = false;

export function hasLoadedThisRuntime() {
  return loadedThisRuntime;
}

export function markLoadedThisRuntime() {
  loadedThisRuntime = true;
}
