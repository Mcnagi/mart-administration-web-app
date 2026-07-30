// Business logic for pantry items: validation, expiry-day math, sorting, and
// orchestrating the api + image services. Views should call only this file,
// never api/itemsApi.js or services/imageService.js directly.
import * as itemsApi from '../api/itemsApi';
import { fileToCompressedBase64, isImageFile } from './imageService';

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

export function expiryStatus(expiryDate) {
  const days = daysUntilExpiry(expiryDate);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 3) return 'soon';
  return 'ok';
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
export async function saveItem({ id, name, quantity, expiryDate, photoFile, existingPhotoBase64 }, ownerId) {
  let photoBase64 = existingPhotoBase64 ?? '';
  if (photoFile) {
    if (!isImageFile(photoFile)) {
      throw new Error('Selected file is not an image.');
    }
    photoBase64 = await fileToCompressedBase64(photoFile);
  }

  const payload = {
    name: (name ?? '').trim(),
    quantity: quantity === '' || quantity === undefined || quantity === null ? '' : Number(quantity),
    expiryDate: expiryDate ?? '',
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
