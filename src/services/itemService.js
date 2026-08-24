// Business logic for pantry items: validation, expiry-day math, sorting, and
// orchestrating the api + image services. Views should call only this file,
// never api/itemsApi.js or services/imageService.js directly.
import * as itemsApi from '../api/itemsApi';
import { getDataByBarcode } from '../api/dataApi';
import { getExternalProductInfo, getExternalProductImage } from '../api/barcodeLookupApi';
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
// `data` collection first, falling back to Open Food Facts, and works out
// what (if anything) needs to happen next for the product photo — a cached
// candidate list, a fresh search, or an auto-fill from the external source's
// own photo. The caller (ItemFormPage) owns all UI/loading state; this just
// makes the found/not-found/source decision and hands back what to show.
export async function searchProductByBarcode(barcode) {
  const trimmed = (barcode ?? '').trim();
  if (!trimmed) return null;

  // A data/{barcode} doc can exist with only a cached `photos` field and no
  // `product` name (e.g. left behind by an earlier Open Food Facts search
  // below — see api/dataApi.savePhotosForBarcode), so a real imported-row
  // match requires `product`, not just doc existence.
  const row = await getDataByBarcode(trimmed);
  if (row?.product) {
    const combined = [row.product, row.product2 || row.maker].filter(Boolean).join(' ');
    return {
      status: 'found',
      searchResult: row,
      category: [row.class1, row.class2, row.class3].filter(Boolean).join('-'),
      photoQuery: combined,
      cachedPhotos: row.photos?.length ? row.photos : null,
      externalImageUrl: null,
    };
  }

  // Not in our own Firestore data — fall back to an external barcode
  // database. Failures here (the service is down, network error) are
  // treated the same as "not found" rather than surfaced as a search error,
  // since our own lookup already succeeded.
  const info = await getExternalProductInfo(trimmed).catch(() => null);
  if (!info) {
    return { status: 'notFound' };
  }

  const result = {
    status: 'foundExternal',
    searchResult: { product: info.name, quantity: info.quantity, brand: info.brand },
    category: info.category,
    photoQuery: null,
    cachedPhotos: null,
    externalImageUrl: null,
  };
  if (info.imageUrl) {
    // Caller only auto-fills this if the user hasn't already picked a photo —
    // never clobber a manually chosen or existing (edit-mode) photo.
    result.externalImageUrl = info.imageUrl;
  } else {
    // Open Food Facts has no photo on file — reuse a cached search (row may
    // be the bare photos-only stub described above), or let the caller run a
    // fresh image search using its English name.
    result.photoQuery = info.nameEn || info.name;
    result.cachedPhotos = row?.photos?.length ? row.photos : null;
  }
  return result;
}

// Fetches the photo Open Food Facts has on file for a search result, ready
// to run through the same save path as a manually uploaded photo.
export function fetchExternalProductImage(imageUrl) {
  return getExternalProductImage(imageUrl);
}

// A barcode item doesn't store its own name (see saveItem below), so the
// items list resolves one for display: the imported `data` collection first
// (same source ItemFormPage's search uses), falling back to the external
// Open Food Facts lookup. Both are best-effort — this backs a background
// display fill-in, not a user-initiated search, so failures just mean no
// name rather than a surfaced error.
export async function resolveProductName(barcode) {
  try {
    const row = await getDataByBarcode(barcode);
    if (row?.product) return row.product;
  } catch {
    // fall through to the external lookup
  }
  try {
    const info = await getExternalProductInfo(barcode);
    if (info?.name) return info.name;
  } catch {
    // no external match either
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
  { id, name, quantity, salePrice, expiryDate, branch, category, note, barcode, photoFile, existingPhotoBase64 },
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

  const payload = {
    quantity: quantity === '' || quantity === undefined || quantity === null ? '' : Number(quantity),
    salePrice: salePrice === '' || salePrice === undefined || salePrice === null ? '' : Number(salePrice),
    expiryDate: expiryDate ?? '',
    branch: branch ?? '',
    note: (note ?? '').trim(),
    barcode: trimmedBarcode,
    photoBase64,
  };

  // A barcode identifies the product via the `data` collection lookup, so
  // name/category (already shown from that lookup) aren't duplicated onto
  // the item itself.
  if (!trimmedBarcode) {
    payload.name = (name ?? '').trim();
    payload.category = (category ?? '').trim();
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
