// Business logic for scan lists: building a working list from repeated
// barcode scans, saving/loading it via Firestore, exporting it to Excel, and
// the admin-managed tag vocabulary offered when saving. Views should call
// only this file, never api/scanListsApi.js or api/scanListTagsApi.js
// directly.
import * as scanListsApi from '../api/scanListsApi';
import * as scanListTagsApi from '../api/scanListTagsApi';
import { getDataByBarcode } from '../api/dataApi';
import { t } from '../i18n/i18n';

// A scan list in progress (name/tag/items) not yet saved — kept so a misclick
// to another page doesn't lose an in-progress scan session. Session-local
// (localStorage, not Firestore): this is a per-device safety net, not
// something that needs to sync or be visible to other users. Only the most
// recent unsaved draft is kept — see saveScanListDraft.
const DRAFT_STORAGE_KEY = 'emart-scanlist-draft';

function pad(n) {
  return String(n).padStart(2, '0');
}

// yyyymmdd-hhmm, e.g. "20260911-1432" — the default scan list name, applied
// at creation time and left editable from there.
export function defaultScanListName(date = new Date()) {
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${datePart}-${timePart}`;
}

// Every field a scan-list row can carry lives on the imported `data`
// collection row for this barcode — name/Korean name, category, maker, and
// sale price. Returns null when the row has no product name, since that's
// the "not actually a match" signal callers check for.
function scannedItemInfoFromRow(row) {
  if (!row?.product) return null;
  return {
    name: row.product,
    nameKo: row.product2 || '',
    category: [row.class1, row.class2, row.class3].filter(Boolean).join('-'),
    maker: row.maker || '',
    salePrice: row.salePrice || '',
    companyName: row.companyName || '',
  };
}

// Deliberately does NOT fall back to the external barcode API (unlike
// itemService.resolveProductName) — scan lists only care about names
// already on file in our own imported data, not a public lookup. A miss
// retries once with a zero-prefixed barcode, since a common UPC-A
// (12-digit) / EAN-13 (13-digit, leading "0") mismatch means the code the
// camera reads and the code the import stored can differ by exactly that
// leading zero.
export async function resolveScannedItemInfo(barcode) {
  const row = await getDataByBarcode(barcode).catch(() => null);
  const info = scannedItemInfoFromRow(row);
  if (info) return info;
  const zeroPrefixedRow = await getDataByBarcode(`0${barcode}`).catch(() => null);
  return (
    scannedItemInfoFromRow(zeroPrefixedRow) || {
      name: '',
      nameKo: '',
      category: '',
      maker: '',
      salePrice: '',
      companyName: '',
    }
  );
}

// Pure array transform, no Firestore call: increments quantity if `barcode`
// is already in the list (repeat scan of the same item), otherwise appends
// a new row built from `info` (see resolveScannedItemInfo). Callers only add
// a barcode after resolveScannedItemInfo found a real name (see
// ScanListScanner/ScanListBuilderPage) — an unmatched barcode is never added
// — but `info.name` still falls back to the barcode itself as a defensive
// default, in case that invariant doesn't hold for a future caller.
export function addScannedBarcode(items, barcode, info) {
  const index = items.findIndex((item) => item.barcode === barcode);
  if (index === -1) {
    return [
      ...items,
      {
        barcode,
        name: info.name || barcode,
        nameKo: info.nameKo || '',
        category: info.category || '',
        maker: info.maker || '',
        salePrice: info.salePrice || '',
        companyName: info.companyName || '',
        quantity: 1,
      },
    ];
  }
  return items.map((item, i) => (i === index ? { ...item, quantity: item.quantity + 1 } : item));
}

// Display-only: shortens a long barcode to its first 3 and last 6 digits
// (e.g. "8801234567890" -> "880...567890") so the items table stays
// scannable at a glance. The stored `item.barcode` is never touched — this
// only formats what's rendered.
export function formatScanListBarcode(barcode) {
  const value = String(barcode ?? '');
  return value.length <= 9 ? value : `${value.slice(0, 3)}...${value.slice(-6)}`;
}

export function updateItemQuantity(items, index, quantity) {
  const value = Math.max(1, Number(quantity) || 1);
  return items.map((item, i) => (i === index ? { ...item, quantity: value } : item));
}

// Batch reset for the builder's "set all quantities to 1" button — e.g. a
// scan session left several items over-counted from repeat scans and the
// admin wants a clean slate to re-verify counts, rather than fixing each
// row's number one at a time.
export function resetItemQuantities(items) {
  return items.map((item) => ({ ...item, quantity: 1 }));
}

export function removeItemAt(items, index) {
  return items.filter((_, i) => i !== index);
}

// Distinct, sorted company names actually present on the list — drives the
// company filter's chip options. Items without a company (older lists saved
// before companyName existed, or a barcode whose imported row had no inco
// code) are excluded from the options rather than shown as a blank chip.
export function uniqueScanListCompanies(items) {
  return [...new Set(items.map((item) => item.companyName).filter(Boolean))].sort();
}

// Default display/export order: name. Returns a new array — never mutates
// `items` — so callers can freely diff it against the unsorted list (e.g. to
// map a displayed row back to its real index; see ScanListBuilderPage).
export function sortScanListItems(items) {
  return [...items].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

// First run of digits in `name`, as a number — or null if it has none. Used
// to rank default (timestamp-named, e.g. "20260924-1432") lists by recency
// without parsing them as dates, since a custom-renamed list may not follow
// that format at all.
function leadingNumber(name) {
  const match = String(name || '').match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

// History page order: tagged lists before untagged, then by name — numeric
// lists (e.g. the default yyyymmdd-hhmm name) newest-number-first, untagged
// or non-numeric names falling back to plain alphabetical. Returns a new
// array — never mutates `scanLists`.
export function sortScanLists(scanLists) {
  return [...scanLists].sort((a, b) => {
    const aTagged = a.tagId ? 0 : 1;
    const bTagged = b.tagId ? 0 : 1;
    if (aTagged !== bTagged) return aTagged - bTagged;

    const aNum = leadingNumber(a.name);
    const bNum = leadingNumber(b.name);
    if (aNum !== null && bNum !== null && aNum !== bNum) return bNum - aNum;
    if (aNum !== null && bNum === null) return -1;
    if (aNum === null && bNum !== null) return 1;

    return (a.name || '').localeCompare(b.name || '');
  });
}

// Combines several scan lists' items into one array, summing quantities for
// any barcode that appears in more than one source list — the point of
// merging is to consolidate repeat items (e.g. two partial scans of the same
// order), not to list them twice. A merged row's other fields (name,
// category, companyName, ...) come from whichever source list it was first
// encountered in; later sources only contribute their quantity.
export function mergeScanListItems(itemLists) {
  const merged = [];
  const indexByBarcode = new Map();
  for (const items of itemLists) {
    for (const item of items) {
      const existingIndex = indexByBarcode.get(item.barcode);
      if (existingIndex === undefined) {
        indexByBarcode.set(item.barcode, merged.length);
        merged.push({ ...item });
      } else {
        merged[existingIndex] = { ...merged[existingIndex], quantity: merged[existingIndex].quantity + item.quantity };
      }
    }
  }
  return merged;
}

export function fetchScanLists() {
  return scanListsApi.listScanLists();
}

export function fetchScanListTags() {
  return scanListTagsApi.listScanListTags();
}

// `id` present -> update an existing list (reopened from history), absent
// -> create a new one owned by `ownerId`.
export async function saveScanList({ id, name, tagId, tagLabel, items }, ownerId) {
  const trimmedName = (name ?? '').trim();
  if (!trimmedName) {
    throw new Error(t('errors.scanListNameRequired'));
  }
  const payload = {
    name: trimmedName,
    tagId: tagId || null,
    tagLabel: tagId ? (tagLabel ?? '') : '',
    items: (items ?? []).filter((item) => item.quantity > 0),
  };
  if (id) {
    await scanListsApi.updateScanList(id, payload);
    return id;
  }
  const ref = await scanListsApi.createScanList(payload, ownerId);
  return ref.id;
}

export function removeScanList(scanListId) {
  return scanListsApi.deleteScanList(scanListId);
}

// Saves a new list that starts as a copy of `scanList` — same tag and
// items, name suffixed " (copy)" — for branching off an existing list (e.g.
// a similar restock run) without re-scanning everything from scratch.
export function duplicateScanList(scanList, ownerId) {
  return saveScanList(
    {
      name: `${scanList.name} (copy)`,
      tagId: scanList.tagId,
      tagLabel: scanList.tagLabel,
      items: scanList.items || [],
    },
    ownerId
  );
}

export async function createScanListTag(label) {
  const trimmed = (label ?? '').trim();
  if (!trimmed) {
    throw new Error(t('errors.tagLabelRequired'));
  }
  const ref = await scanListTagsApi.createScanListTag(trimmed);
  return ref.id;
}

export function removeScanListTag(tagId) {
  return scanListTagsApi.deleteScanListTag(tagId);
}

// `scanListId` is null for a new (unsaved) list, or the id of the list being
// edited — the draft is only ever offered back to the same context it was
// saved from (see loadScanListDraft), so editing a *different* saved list
// doesn't pick up an unrelated in-progress draft.
export function saveScanListDraft(scanListId, { name, tagId, tagLabel, items }) {
  try {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ scanListId: scanListId ?? null, name, tagId, tagLabel, items })
    );
  } catch {
    // Private browsing / storage quota — draft recovery just won't work this
    // session; not worth surfacing to the user over a best-effort safety net.
  }
}

export function loadScanListDraft(scanListId) {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return draft.scanListId === (scanListId ?? null) ? draft : null;
  } catch {
    return null;
  }
}

export function clearScanListDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// "barcode" -> "Barcode", "salePrice" -> "Sale Price".
function keyToColumnLabel(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

// Lazy-loads @e965/xlsx (same pattern as dataService.parseExcelFile) and
// triggers a browser download of the list as a single-sheet workbook. Works
// on an in-progress (not yet saved) list just as well as a saved one, since
// it only reads `name`/`items` off whatever object it's given. Columns are
// derived from whatever keys the items actually carry (rather than a fixed
// list here) so a new field added to addScannedBarcode shows up in the
// export automatically. The key set is taken across all items, not just the
// first, since an older saved list's items may be missing a field a newer
// one has (e.g. category/maker/salePrice, added after that list was saved).
export async function exportScanListToExcel(scanList) {
  const XLSX = await import('@e965/xlsx');
  const keys = [...new Set(scanList.items.flatMap((item) => Object.keys(item)))];
  const rows = scanList.items.map((item) =>
    Object.fromEntries(keys.map((key) => [keyToColumnLabel(key), item[key] ?? '']))
  );
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Items');
  XLSX.writeFile(book, `${scanList.name}.xlsx`);
}
