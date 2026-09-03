// Business logic for promo flyers: price math, validation, and orchestrating
// the api + image services. Views should call only this file, never
// api/promosApi.js or services/imageService.js directly.
import * as promosApi from '../api/promosApi';
import { fileToCompressedBase64, isImageFile } from './imageService';
import { t } from '../i18n/i18n';
import { PROMO_LAYOUT_VALUES, DEFAULT_PROMO_LAYOUT } from '../promoLayouts';

const MAX_TEXT_OFFSET_MM = 200;
const MIN_FONT_SCALE = 0.5;
const MAX_FONT_SCALE = 2;

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

// These knobs (paper size, drag offset, font scale) all come from
// controlled inputs in the builder — a <select>, a pointer drag, a
// <input type="range"> — rather than free-typed text, so an out-of-range
// value here means stale/tampered client state, not a mistake worth
// bothering the user about. Clamp/fall back silently instead of throwing.
function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function fetchPromos() {
  return promosApi.listPromos();
}

// `input` may include a raw File under `photoFile`; every field but nameEn
// is optional.
export async function savePromo(
  {
    id,
    nameEn,
    nameKo,
    originalPrice,
    discountPercent,
    finalPrice,
    sourceItemId,
    photoFile,
    existingPhotoBase64,
    layout,
    textOffsetX,
    textOffsetY,
    fontScale,
    nameNoWrap,
  },
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
    layout: PROMO_LAYOUT_VALUES.includes(layout) ? layout : DEFAULT_PROMO_LAYOUT,
    textOffsetX: clampNumber(textOffsetX, 0, -MAX_TEXT_OFFSET_MM, MAX_TEXT_OFFSET_MM),
    textOffsetY: clampNumber(textOffsetY, 0, -MAX_TEXT_OFFSET_MM, MAX_TEXT_OFFSET_MM),
    fontScale: clampNumber(fontScale, 1, MIN_FONT_SCALE, MAX_FONT_SCALE),
    nameNoWrap: !!nameNoWrap,
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
