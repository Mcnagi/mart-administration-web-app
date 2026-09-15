// Business logic for pantry items: validation, expiry-day math, sorting, and
// orchestrating the api + image services. Views should call only this file,
// never api/itemsApi.js or services/imageService.js directly.
import * as itemsApi from '../api/itemsApi';
import { getDataByBarcode, savePhotoForBarcode } from '../api/dataApi';
import { getExternalProductImageUrl, getExternalProductImage } from '../api/barcodeLookupApi';
import { fileToCompressedBase64, isImageFile } from './imageService';
import { t } from '../i18n/i18n';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Returns null when there's no expiry date to compare against.
export function daysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return null;
  return Math.round((expiry.getTime() - today.getTime()) / MS_PER_DAY);
}

// Buckets a discount percent into a severity tier for the discount badge on
// each item card, reusing the same color language as the expiry badges (mild
// green -> amber -> red) so bigger markdowns stand out more.
export function discountTier(percent) {
  if (percent === null || percent === undefined || percent === '') return 'none';
  if (percent <= 0) return 'none';
  if (percent < 25) return 'mild';
  if (percent < 50) return 'moderate';
  return 'steep';
}

// Buckets an item for the discount filter on the items list.
export function discountBucket(item) {
  return discountTier(item.discountPercent) !== 'none' ? 'has' : 'none';
}

// Fixed display order for the discount filter chips, mirroring EXPIRY_GROUPS.
export const DISCOUNT_GROUPS = [{ key: 'has' }, { key: 'none' }];

// Buckets an expiry date for both the ExpiryBadge on each item card and the
// filter/section groups on the items list, so the two stay in sync.
export function expiryBucket(expiryDate) {
  const days = daysUntilExpiry(expiryDate);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days < 7) return 'week';
  if (days < 30) return 'month';
  return 'longer';
}

// Fixed display order for the expiry groups used to both filter and section
// the items list. Labels are looked up at render time via
// t(`expiryGroups.${key}`) so they follow the active language.
export const EXPIRY_GROUPS = [
  { key: 'expired' },
  { key: 'week' },
  { key: 'month' },
  { key: 'longer' },
  { key: 'none' },
];

// Buckets items by expiryBucket() into EXPIRY_GROUPS order, dropping any
// group that ends up empty.
export function groupItemsByExpiry(items) {
  return EXPIRY_GROUPS.map(({ key }) => ({
    key,
    items: items.filter((item) => expiryBucket(item.expiryDate) === key),
  })).filter((group) => group.items.length > 0);
}

// Items with an expiry date come first, soonest-expiring first; items with no
// expiry date (all fields are optional) are pushed to the end.
export function sortByExpiry(items) {
  return [...items].sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return 0;
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return a.expiryDate.localeCompare(b.expiryDate);
  });
}

// Most recently uploaded first. `createdAt` is a Firestore server timestamp
// (not a plain string like expiryDate), so it's compared via toMillis();
// items missing it (e.g. an in-flight write not yet resolved) sort last.
export function sortByCreatedAt(items) {
  const millis = (item) => item.createdAt?.toMillis?.() ?? null;
  return [...items].sort((a, b) => {
    const aMs = millis(a);
    const bMs = millis(b);
    if (aMs === null && bMs === null) return 0;
    if (aMs === null) return 1;
    if (bMs === null) return -1;
    return bMs - aMs;
  });
}

export function fetchItems() {
  return itemsApi.listItems();
}

export async function fetchItemById(itemId) {
  const items = await itemsApi.listItems();
  return items.find((item) => item.id === itemId) ?? null;
}

// Drives the item form's barcode search button: checks our own imported
// `data` collection for a product match, and works out what (if anything)
// needs to happen next for the product photo — a cached candidate list
// (from a since-removed photo-search feature, see api/dataApi.js) or, when
// nothing is on file locally, a best-effort photo suggestion from Open Food
// Facts (name/brand/category are not looked up externally — only the
// photo). The caller (ItemFormPage) owns all UI/loading state; this just
// makes the found/not-found decision and hands back what to show.
export async function searchProductByBarcode(barcode) {
  const trimmed = (barcode ?? '').trim();
  if (!trimmed) return null;

  // A data/{barcode} doc can exist with only a legacy cached `photos` field
  // and no `product` name (left behind by the old photo-search feature), so
  // a real imported-row match requires `product` or `salePrice` — either
  // means this doc actually carries imported data, not just doc existence.
  const row = await getDataByBarcode(trimmed);
  if (row?.product || row?.salePrice) {
    return {
      status: 'found',
      searchResult: row,
      category: [row.class1, row.class2, row.class3].filter(Boolean).join('-'),
      cachedPhotos: row.photos?.length ? row.photos : null,
      canonicalPhoto: row.photo || null,
      externalImageUrl: null,
    };
  }

  // Not in our own Firestore data — no name/category to offer, but still
  // worth a best-effort photo suggestion from Open Food Facts. Failures here
  // (the service is down, network error, no photo on file) are all treated
  // the same as "no photo" rather than surfaced as a search error, since our
  // own lookup already succeeded (as a miss).
  const externalImageUrl = await getExternalProductImageUrl(trimmed).catch(() => null);
  return {
    status: 'notFound',
    cachedPhotos: row?.photos?.length ? row.photos : null,
    canonicalPhoto: row?.photo || null,
    // Caller only auto-fills this if the user hasn't already picked a photo —
    // never clobber a manually chosen or existing (edit-mode) photo.
    externalImageUrl,
  };
}

// Fetches the photo Open Food Facts has on file for a search result, ready
// to run through the same save path as a manually uploaded photo.
export function fetchExternalProductImage(imageUrl) {
  return getExternalProductImage(imageUrl);
}

// Looks up the imported `data` collection row for an item's barcode — the
// source of truth for its English/Korean names and sale price (none of
// which are stored on the item itself, see saveItem below). Used by the
// promo builder to prefill a new promo from an item. Returns null when the
// item has no barcode or no row is on file.
export function fetchDataRowForBarcode(barcode) {
  const trimmed = (barcode ?? '').trim();
  if (!trimmed) return Promise.resolve(null);
  return getDataByBarcode(trimmed);
}

// A barcode item doesn't store its own name (see saveItem below), so the
// items list resolves one for display from the imported `data` collection
// (same source ItemFormPage's search uses) — best-effort, since this backs a
// background display fill-in, not a user-initiated search, so a failure just
// means no name rather than a surfaced error.
export async function resolveProductName(barcode) {
  try {
    const row = await getDataByBarcode(barcode);
    if (row?.product) return row.product;
  } catch {
    // no local match
  }
  return null;
}

// Live view of the items list; see itemsApi.subscribeItems for why this
// replaces a poll/reload cycle. Returns the unsubscribe function.
export function subscribeItems(onData, onError) {
  return itemsApi.subscribeItems(onData, onError);
}

// `input` may include a raw File under `photoFile`; every field is optional.
export async function saveItem(
  { id, name, quantity, expiryDate, branch, category, note, barcode, photoFile, existingPhotoBase64 },
  ownerId
) {
  let photoBase64 = existingPhotoBase64 ?? '';
  if (photoFile) {
    if (!isImageFile(photoFile)) {
      throw new Error(t('errors.notAnImage'));
    }
    photoBase64 = await fileToCompressedBase64(photoFile);
  }

  const trimmedBarcode = (barcode ?? '').trim();

  // Every field is written onto the item itself — including name/category,
  // even when a barcode search filled them in — so the items list can
  // render a card straight off its own doc. The alternative (leaving them
  // off and re-resolving from the `data` collection at read time, the way
  // resolveProductName used to work) would trade one write here for one
  // extra Firestore read per barcode item on every list load/subscription,
  // which is far more expensive at read-heavy list-view scale.
  const payload = {
    name: (name ?? '').trim(),
    category: (category ?? '').trim(),
    quantity: quantity === '' || quantity === undefined || quantity === null ? '' : Number(quantity),
    expiryDate: expiryDate ?? '',
    branch: branch ?? '',
    note: (note ?? '').trim(),
    barcode: trimmedBarcode,
    photoBase64,
  };

  // Best-effort: also cache the photo onto the shared `data/{barcode}` doc,
  // so the next item scanned with this barcode already has it attached
  // (see ItemFormPage's "use a different photo" flow). Failure here doesn't
  // block saving the item itself.
  if (trimmedBarcode && photoBase64) {
    savePhotoForBarcode(trimmedBarcode, photoBase64).catch(() => {});
  }

  if (id) {
    await itemsApi.updateItem(id, payload);
    return id;
  }
  const ref = await itemsApi.createItem(payload, ownerId);
  return ref.id;
}

export function removeItem(itemId) {
  return itemsApi.deleteItem(itemId);
}

// Bulk actions for the admin multi-select tool on the items list.
// `percent` of null/'' clears the discount ("None"); otherwise must be 0-100.
export function applyDiscount(itemIds, percent) {
  if (!itemIds || itemIds.length === 0) return Promise.resolve();
  let value = null;
  if (percent !== null && percent !== undefined && percent !== '') {
    value = Number(percent);
    if (Number.isNaN(value) || value < 0 || value > 100) {
      throw new Error(t('errors.discountRange'));
    }
  }
  return itemsApi.batchUpdateItems(itemIds, { discountPercent: value });
}

export function removeItems(itemIds) {
  if (!itemIds || itemIds.length === 0) return Promise.resolve();
  return itemsApi.batchDeleteItems(itemIds);
}
