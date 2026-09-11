// Session-scoped cache of the Items page's scroll position, so navigating
// away (e.g. into an item's detail) and back restores where the user left
// off — same idea, and same sessionStorage-backed approach, as
// itemsFilterCache.js.
const STORAGE_KEY = 'emart.itemsScroll.v1';

export function readCachedScroll() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

export function writeCachedScroll(y) {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(y));
  } catch {
    // Storage full or unavailable (private browsing, etc.) — the scroll
    // position just won't be remembered this time.
  }
}
