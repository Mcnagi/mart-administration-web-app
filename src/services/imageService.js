// Business logic for turning a user-picked photo into a base64 string small
// enough to store directly inside a Firestore document (1 MiB doc limit).
// We resize + re-encode as JPEG on a canvas rather than storing the raw file,
// since photos straight off a phone camera are far too large to fit.

import { t } from '../i18n/i18n';

const MAX_DIMENSION = 900; // px, longest side
const JPEG_QUALITY = 0.7;
// Firestore hard limit is 1,048,576 bytes per document; stay well under that
// to leave room for the other fields and metadata overhead.
const MAX_BASE64_BYTES = 700 * 1024;

export function isImageFile(file) {
  return !!file && file.type.startsWith('image/');
}

async function loadImageBitmap(file) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file);
  }
  // Fallback for browsers without createImageBitmap support.
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawToCanvas(image, maxDimension) {
  const width = image.width ?? image.naturalWidth;
  const height = image.height ?? image.naturalHeight;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBase64(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality);
}

async function compressBlobToBase64(blob, { maxDimension, quality, maxBytes }) {
  const image = await loadImageBitmap(blob);
  let dimension = maxDimension;
  let q = quality;
  let dataUrl = canvasToBase64(drawToCanvas(image, dimension), q);

  let attempts = 0;
  while (dataUrl.length > maxBytes && attempts < 5) {
    q = Math.max(0.4, q - 0.15);
    dimension = Math.round(dimension * 0.85);
    dataUrl = canvasToBase64(drawToCanvas(image, dimension), q);
    attempts += 1;
  }

  if (dataUrl.length > maxBytes) {
    throw new Error(t('errors.photoTooLarge'));
  }

  return dataUrl;
}

// Converts a File to a compressed base64 data URL, shrinking further if the
// first pass still doesn't fit under the size budget.
export async function fileToCompressedBase64(file) {
  return compressBlobToBase64(file, {
    maxDimension: MAX_DIMENSION,
    quality: JPEG_QUALITY,
    maxBytes: MAX_BASE64_BYTES,
  });
}

