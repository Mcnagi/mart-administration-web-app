// Business logic for pantry items: validation, expiry-day math, sorting, and
// orchestrating the api + image services. Views should call only this file,
// never api/itemsApi.js or services/imageService.js directly.
import * as itemsApi from '../api/itemsApi';
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

// `input` may include a raw File under `photoFile`; every field is optional.
export async function saveItem(
  { id, name, quantity, expiryDate, branch, category, note, photoFile, existingPhotoBase64 },
  ownerId
) {
  let photoBase64 = existingPhotoBase64 ?? '';
  if (photoFile) {
    if (!isImageFile(photoFile)) {
      throw new Error(t('errors.notAnImage'));
    }
    photoBase64 = await fileToCompressedBase64(photoFile);
  }

  const payload = {
    name: (name ?? '').trim(),
    quantity: quantity === '' || quantity === undefined || quantity === null ? '' : Number(quantity),
    expiryDate: expiryDate ?? '',
    branch: branch ?? '',
    category: (category ?? '').trim(),
    note: (note ?? '').trim(),
    photoBase64,
  };

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
