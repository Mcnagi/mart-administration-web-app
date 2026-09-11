// Business logic for scan lists: building a working list from repeated
// barcode scans, saving/loading it via Firestore, exporting it to Excel, and
// the admin-managed tag vocabulary offered when saving. Views should call
// only this file, never api/scanListsApi.js or api/scanListTagsApi.js
// directly.
import * as scanListsApi from '../api/scanListsApi';
import * as scanListTagsApi from '../api/scanListTagsApi';
import { fetchDataRowForBarcode } from './itemService';
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

// A scan-list row needs an English display name and, when available, the
// Korean name (`product2`) — both live on the imported `data` collection row
// for this barcode (see itemService.fetchDataRowForBarcode, the same source
// PromoBuilderPage pulls nameKo from). Deliberately does NOT fall back to the
// external barcode API (unlike itemService.resolveProductName) — scan lists
// only care about names already on file in our own imported data, not a
// public lookup. A miss retries once with a zero-prefixed barcode, since a
// common UPC-A (12-digit) / EAN-13 (13-digit, leading "0") mismatch means the
// code the camera reads and the code the import stored can differ by exactly
// that leading zero.
export async function resolveScannedItemInfo(barcode) {
  const row = await fetchDataRowForBarcode(barcode).catch(() => null);
  if (row?.product) {
    return { name: row.product, nameKo: row.product2 || '' };
  }
  const zeroPrefixedRow = await fetchDataRowForBarcode(`0${barcode}`).catch(() => null);
  if (zeroPrefixedRow?.product) {
    return { name: zeroPrefixedRow.product, nameKo: zeroPrefixedRow.product2 || '' };
  }
  return { name: '', nameKo: '' };
}

// Pure array transform, no Firestore call: increments quantity if `barcode`
// is already in the list (repeat scan of the same item), otherwise appends
// a new row. Callers only add a barcode after resolveScannedItemInfo found a
// real name (see ScanListScanner/ScanListBuilderPage) — an unmatched barcode
// is never added — but `resolvedName` still falls back to the barcode itself
// as a defensive default, in case that invariant doesn't hold for a future
// caller.
export function addScannedBarcode(items, barcode, resolvedName, resolvedNameKo) {
  const index = items.findIndex((item) => item.barcode === barcode);
  if (index === -1) {
    return [...items, { barcode, name: resolvedName || barcode, nameKo: resolvedNameKo || '', quantity: 1 }];
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

export function removeItemAt(items, index) {
  return items.filter((_, i) => i !== index);
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

// Lazy-loads @e965/xlsx (same pattern as dataService.parseExcelFile) and
// triggers a browser download of the list as a single-sheet workbook. Works
// on an in-progress (not yet saved) list just as well as a saved one, since
// it only reads `name`/`items` off whatever object it's given.
export async function exportScanListToExcel(scanList) {
  const XLSX = await import('@e965/xlsx');
  const rows = scanList.items.map((item) => ({
    Barcode: item.barcode,
    Name: item.name,
    'Name (Korean)': item.nameKo || '',
    Quantity: item.quantity,
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Items');
  XLSX.writeFile(book, `${scanList.name}.xlsx`);
}
