// Business logic for promo flyers: price math, validation, and orchestrating
// the api + image services. Views should call only this file, never
// api/promosApi.js or services/imageService.js directly.
import * as promosApi from '../api/promosApi';
import { fileToCompressedBase64, isImageFile } from './imageService';
import { t } from '../i18n/i18n';

// Returns null when originalPrice or discountPercent is missing/invalid —
// callers should leave finalPrice untouched in that case, since it's a
// normal independently-editable field, not purely derived.
export function computeFinalPrice(originalPrice, discountPercent) {
  if (originalPrice === '' || originalPrice === null || originalPrice === undefined) return null;
  if (discountPercent === '' || discountPercent === null || discountPercent === undefined) return null;
  const price = Number(originalPrice);
  const percent = Number(discountPercent);
  if (Number.isNaN(price) || Number.isNaN(percent)) return null;
  return Math.round(price * (1 - percent / 100) * 100) / 100;
}

function parseOptionalNumber(value, { min, max, errorKey }) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  if (Number.isNaN(num) || num < min || (max !== undefined && num > max)) {
    throw new Error(t(errorKey));
  }
  return num;
}

export function fetchPromos() {
  return promosApi.listPromos();
}

// `input` may include a raw File under `photoFile`; every field but nameEn
// is optional.
export async function savePromo(
  { id, nameEn, nameKo, originalPrice, discountPercent, finalPrice, sourceItemId, photoFile, existingPhotoBase64 },
  ownerId
) {
  const trimmedName = (nameEn ?? '').trim();
  if (!trimmedName) {
    throw new Error(t('errors.promoNameRequired'));
  }

  let photoBase64 = existingPhotoBase64 ?? '';
  if (photoFile) {
    if (!isImageFile(photoFile)) {
      throw new Error(t('errors.notAnImage'));
    }
    photoBase64 = await fileToCompressedBase64(photoFile);
  }

  const payload = {
    nameEn: trimmedName,
    nameKo: (nameKo ?? '').trim(),
    originalPrice: parseOptionalNumber(originalPrice, { min: 0, errorKey: 'errors.priceRange' }),
    discountPercent: parseOptionalNumber(discountPercent, { min: 0, max: 100, errorKey: 'errors.discountRange' }),
    finalPrice: parseOptionalNumber(finalPrice, { min: 0, errorKey: 'errors.priceRange' }),
    sourceItemId: sourceItemId || null,
    photoBase64,
  };

  if (id) {
    await promosApi.updatePromo(id, payload);
    return id;
  }
  const ref = await promosApi.createPromo(payload, ownerId);
  return ref.id;
}

export function removePromo(promoId) {
  return promosApi.deletePromo(promoId);
}

export function removePromos(promoIds) {
  if (!promoIds || promoIds.length === 0) return Promise.resolve();
  return promosApi.batchDeletePromos(promoIds);
}
