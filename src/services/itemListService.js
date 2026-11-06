// Business logic for item lists: building a working list from repeated
// barcode scans, saving/loading it via Firestore, exporting it to Excel, the
// admin-managed tag vocabulary offered when saving, and the admin's choice
// of which local-data columns lists display. Views should call only this
// file, never api/itemListsApi.js, api/itemListTagsApi.js or
// api/settingsApi.js directly.
import * as itemListsApi from '../api/itemListsApi';
import * as itemListTagsApi from '../api/itemListTagsApi';
import * as settingsApi from '../api/settingsApi';
import { barcodeCandidates } from './productLookupService';
import { getLocalBarcodeIndex, findLocalRow, fetchRemoteMeta } from './localDataService';
import { classFilterColumns, columnValue, mergeClassColumns } from '../utils/classColumns';
import { copyTableToClipboard } from '../utils/tableClipboard';
import { t } from '../i18n/i18n';

// An item list in progress (name/tag/items) not yet saved — kept so a misclick
// to another page doesn't lose an in-progress scan session. Session-local
// (localStorage, not Firestore): this is a per-device safety net, not
// something that needs to sync or be visible to other users. Only the most
// recent unsaved draft is kept — see saveItemListDraft.
const DRAFT_STORAGE_KEY = 'emart-item-list-draft';

// `settings/{SETTINGS_DOC_ID}` holds `displayColumns`: the local-data
// column keys (in order) the admin chose to show on item lists, and
// `concatClassColumns`: whether class1/2/3 are combined (absent means on).
// Doc ID (like the scanLists/scanListTags collections) keeps the feature's
// original "scan list" name so existing data still loads.
const SETTINGS_DOC_ID = 'scanList';

// Shown until an admin picks columns — whichever of these the local copy has.
const DEFAULT_DISPLAY_COLUMNS = ['product', 'product2', 'companyName'];

function pad(n) {
  return String(n).padStart(2, '0');
}

// yyyymmdd-hhmm, e.g. "20260911-1432" — the default item list name, applied
// at creation time and left editable from there.
export function defaultItemListName(date = new Date()) {
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${datePart}-${timePart}`;
}

// A saved/draft item list item is only { barcode, quantity } — everything
// shown about it (name, category, price, ...) is looked up from this
// device's local-data copy each time the list is displayed or exported (see
// resolveItemListItems), so lists always reflect the latest published data.
// Also strips the extra fields lists saved before this change still carry.
export function normalizeItemListItems(items) {
  return (items ?? []).map((item) => ({ barcode: String(item.barcode), quantity: Number(item.quantity) || 1 }));
}

// The local-copy row for `barcode` (trying barcodeCandidates in order), as
// { barcode, row } where `barcode` is the code it's stored under in the
// copy — or null when it isn't there.
function findLocalMatch(index, barcode) {
  for (const code of barcodeCandidates(barcode)) {
    const row = findLocalRow(index, code);
    if (row) return { barcode: code, row };
  }
  return null;
}

// Every scan checks the local-data copy only (never Firestore). Resolves to
// { status: 'found', barcode, row } — `barcode` being the code as stored in
// the copy, so a UPC-A scan of an EAN-13 product lands on the same list row
// as a scan of the EAN-13 itself — or { status: 'notFound' }, or
// { status: 'noLocalData' } when this device hasn't downloaded a copy.
export async function resolveScannedBarcode(barcode) {
  const index = await getLocalBarcodeIndex();
  if (!index) return { status: 'noLocalData' };
  const match = findLocalMatch(index, barcode);
  return match ? { status: 'found', ...match } : { status: 'notFound' };
}

// Short label for a scanned item in toasts/aria-labels: its product name
// from the local copy, or the barcode itself when it has none.
export function itemListItemName(row, barcode) {
  return String(row?.product || row?.product2 || barcode);
}

// The list row matching a scanned/typed `barcode`, trying barcodeCandidates
// so delete mode finds a row saved under the zero-prefixed code.
export function findItemListItem(items, barcode) {
  const candidates = barcodeCandidates(barcode);
  return items.find((item) => candidates.includes(item.barcode)) ?? null;
}

// Pure array transform, no Firestore call: increments quantity if `barcode`
// is already in the list (repeat scan of the same item), otherwise appends
// a new { barcode, quantity: 1 } row. Callers pass the code returned by
// resolveScannedBarcode, and only once it was found.
export function addScannedBarcode(items, barcode) {
  const index = items.findIndex((item) => item.barcode === barcode);
  if (index === -1) return [...items, { barcode, quantity: 1 }];
  return items.map((item, i) => (i === index ? { ...item, quantity: item.quantity + 1 } : item));
}

// Display-only: shortens a long barcode to its first 3 and last 6 digits
// (e.g. "8801234567890" -> "880...567890") so the items table stays
// scannable at a glance. The stored `item.barcode` is never touched — this
// only formats what's rendered.
export function formatItemListBarcode(barcode) {
  const value = String(barcode ?? '');
  return value.length <= 9 ? value : `${value.slice(0, 3)}...${value.slice(-6)}`;
}

export function updateItemQuantity(items, barcode, quantity) {
  const value = Math.max(1, Number(quantity) || 1);
  return items.map((item) => (item.barcode === barcode ? { ...item, quantity: value } : item));
}

// Batch reset for the builder's "set all quantities to 1" button — e.g. a
// scan session left several items over-counted from repeat scans and the
// admin wants a clean slate to re-verify counts, rather than fixing each
// row's number one at a time.
export function resetItemQuantities(items) {
  return items.map((item) => ({ ...item, quantity: 1 }));
}

// Drops the whole row for `barcode`. Returns the same `items` array
// (identity unchanged) when the barcode isn't on the list, so callers can
// tell nothing was removed.
export function removeScannedBarcode(items, barcode) {
  const next = items.filter((item) => item.barcode !== barcode);
  return next.length === items.length ? items : next;
}

// The admin's item list settings doc. Read from Firestore once per session
// and cached, until an admin saves a change; a failed read falls back to the
// defaults rather than blocking the caller.
let settingsPromise = null;

function fetchItemListSettings() {
  if (!settingsPromise) {
    settingsPromise = settingsApi.getSetting(SETTINGS_DOC_ID).catch((err) => {
      console.error('[item lists] failed to load settings', err);
      settingsPromise = null;
      return null;
    });
  }
  return settingsPromise;
}

async function saveItemListSettings(fields) {
  await settingsApi.setSetting(SETTINGS_DOC_ID, fields);
  settingsPromise = null;
}

// Which local-data columns item lists show, as keys in the admin's order
// (see saveItemListDisplayColumns), or null when no choice was made yet.
export async function fetchItemListDisplayColumnKeys() {
  return (await fetchItemListSettings())?.displayColumns ?? null;
}

export function saveItemListDisplayColumns(keys) {
  return saveItemListSettings({ displayColumns: keys });
}

// Whether class1/2/3 are combined into one space-separated value.
export async function fetchConcatClassColumns() {
  return (await fetchItemListSettings())?.concatClassColumns ?? true;
}

export function saveConcatClassColumns(enabled) {
  return saveItemListSettings({ concatClassColumns: enabled });
}

// Columns the admin can pick from: the local-data columns other than
// barcode (always shown), from this device's copy when there is one,
// otherwise from the published snapshot's metadata.
export async function fetchItemListColumnOptions() {
  const index = await getLocalBarcodeIndex();
  const columns = index?.columns ?? (await fetchRemoteMeta())?.columns ?? [];
  return columns.filter((c) => c.key !== 'barcode');
}

// `keys` null means no admin choice yet -> DEFAULT_DISPLAY_COLUMNS. Keys
// the given columns don't have (e.g. dropped from a later publish) are
// skipped.
export function pickDisplayColumns(columns, keys) {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  return (keys ?? DEFAULT_DISPLAY_COLUMNS).map((key) => byKey.get(key)).filter(Boolean);
}

// Everything an item list view needs to show its items: the local-data
// barcode index (null when this device has no copy) and the display
// columns, as { key, label } — read their values with columnValue, since
// the class columns may be combined into one — plus the category columns to
// filter by (see classFilterColumns).
export async function loadItemListLookup() {
  const [index, keys, concat] = await Promise.all([
    getLocalBarcodeIndex(),
    fetchItemListDisplayColumnKeys(),
    fetchConcatClassColumns(),
  ]);
  if (!index) return { index, columns: [], filterColumns: [] };
  const picked = pickDisplayColumns(index.columns, keys);
  const columns = concat ? mergeClassColumns(picked) : picked;
  return { index, columns, filterColumns: classFilterColumns(index.columns, columns, concat) };
}

// Pure: each item plus its local-copy row as `row` (null when the barcode
// isn't in the copy, or there's no copy). The source `items` are untouched.
export function resolveItemListItems(items, index) {
  return items.map((item) => ({ ...item, row: index ? (findLocalMatch(index, item.barcode)?.row ?? null) : null }));
}

// Default display/export order: product name, barcode for items without
// one. Returns a new array — never mutates `resolvedItems`.
export function sortItemListItems(resolvedItems) {
  const key = (item) => itemListItemName(item.row, item.barcode);
  return [...resolvedItems].sort((a, b) => key(a).localeCompare(key(b)));
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
// array — never mutates `itemLists`.
export function sortItemLists(itemLists) {
  return [...itemLists].sort((a, b) => {
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

// Combines several item lists' items into one array, summing quantities for
// any barcode that appears in more than one source list — the point of
// merging is to consolidate repeat items (e.g. two partial scans of the same
// order), not to list them twice.
export function mergeItemListItems(itemLists) {
  const quantityByBarcode = new Map();
  for (const items of itemLists) {
    for (const item of normalizeItemListItems(items)) {
      quantityByBarcode.set(item.barcode, (quantityByBarcode.get(item.barcode) ?? 0) + item.quantity);
    }
  }
  return [...quantityByBarcode].map(([barcode, quantity]) => ({ barcode, quantity }));
}

export function fetchItemLists() {
  return itemListsApi.listItemLists();
}

export function fetchItemListTags() {
  return itemListTagsApi.listItemListTags();
}

// `id` present -> update an existing list (reopened from history), absent
// -> create a new one owned by `ownerId`.
export async function saveItemList({ id, name, tagId, tagLabel, items }, ownerId) {
  const trimmedName = (name ?? '').trim();
  if (!trimmedName) {
    throw new Error(t('errors.itemListNameRequired'));
  }
  const payload = {
    name: trimmedName,
    tagId: tagId || null,
    tagLabel: tagId ? (tagLabel ?? '') : '',
    items: normalizeItemListItems(items).filter((item) => item.quantity > 0),
  };
  if (id) {
    await itemListsApi.updateItemList(id, payload);
    return id;
  }
  const ref = await itemListsApi.createItemList(payload, ownerId);
  return ref.id;
}

export function removeItemList(itemListId) {
  return itemListsApi.deleteItemList(itemListId);
}

// Saves a new list that starts as a copy of `itemList` — same tag and
// items, name suffixed " (copy)" — for branching off an existing list (e.g.
// a similar restock run) without re-scanning everything from scratch.
export function duplicateItemList(itemList, ownerId) {
  return saveItemList(
    {
      name: `${itemList.name} (copy)`,
      tagId: itemList.tagId,
      tagLabel: itemList.tagLabel,
      items: normalizeItemListItems(itemList.items),
    },
    ownerId
  );
}

export async function createItemListTag(label) {
  const trimmed = (label ?? '').trim();
  if (!trimmed) {
    throw new Error(t('errors.tagLabelRequired'));
  }
  const ref = await itemListTagsApi.createItemListTag(trimmed);
  return ref.id;
}

export function removeItemListTag(tagId) {
  return itemListTagsApi.deleteItemListTag(tagId);
}

// `itemListId` is null for a new (unsaved) list, or the id of the list being
// edited — the draft is only ever offered back to the same context it was
// saved from (see loadItemListDraft), so editing a *different* saved list
// doesn't pick up an unrelated in-progress draft.
export function saveItemListDraft(itemListId, { name, tagId, tagLabel, items }) {
  try {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ itemListId: itemListId ?? null, name, tagId, tagLabel, items })
    );
  } catch {
    // Private browsing / storage quota — draft recovery just won't work this
    // session; not worth surfacing to the user over a best-effort safety net.
  }
}

export function loadItemListDraft(itemListId) {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (draft.itemListId !== (itemListId ?? null)) return null;
    return { ...draft, items: normalizeItemListItems(draft.items) };
  } catch {
    return null;
  }
}

export function clearItemListDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Header row plus one row per resolved item, shared by the Excel export and
// the clipboard copy so they always have the same layout.
function itemListTableRows(resolvedItems, columns) {
  return [
    [t('itemLists.barcodeCol'), ...columns.map((c) => c.label), t('itemLists.quantityCol')],
    ...resolvedItems.map((item) => [item.barcode, ...columns.map((c) => columnValue(item.row, c)), item.quantity]),
  ];
}

// Copies already-resolved items, in the order given, for pasting into Excel.
// Takes what the page already has rather than loading it, so the clipboard
// write stays within the click that triggered it.
export function copyItemListItems(resolvedItems, columns) {
  return copyTableToClipboard(itemListTableRows(resolvedItems, columns));
}

// Lazy-loads @e965/xlsx (same pattern as spreadsheetService.parseExcelFile) and
// triggers a browser download of the list as a single-sheet workbook:
// barcode, the admin's display columns (under their spreadsheet headers,
// looked up from this device's local copy), then quantity. Works on an
// in-progress (not yet saved) list just as well as a saved one, since it
// only reads `name`/`items` off whatever object it's given.
export async function exportItemListToExcel(itemList) {
  const [XLSX, { index, columns }] = await Promise.all([import('@e965/xlsx'), loadItemListLookup()]);
  const items = sortItemListItems(resolveItemListItems(normalizeItemListItems(itemList.items), index));
  const sheet = XLSX.utils.aoa_to_sheet(itemListTableRows(items, columns));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Items');
  XLSX.writeFile(book, `${itemList.name}.xlsx`);
}
