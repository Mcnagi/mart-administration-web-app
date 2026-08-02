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

export async function fetchSortedItems() {
  const items = await itemsApi.listItems();
  return sortByExpiry(items);
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
