// Fallback product photo lookup for barcodes that aren't in Firestore's
// imported `data` collection (see api/dataApi.js). Backed by Open Food
// Facts — a free, public product database with no API key required. See
// https://world.openfoodfacts.org/data for the API. Only the photo is used
// from this source — name/brand/category/quantity are not, since those are
// expected to come from our own imported data.
const OFF_PRODUCT_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product';

// Returns the product's image URL from Open Food Facts, or null if the
// barcode isn't in their database (or has no image on file).
export async function getExternalProductImageUrl(barcode) {
  const url = `${OFF_PRODUCT_ENDPOINT}/${encodeURIComponent(barcode)}.json?fields=image_url`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1) return null;
  return (data.product?.image_url || '').trim() || null;
}

// Fetches the product photo Open Food Facts has on file and returns it as a
// File, ready to run through the same compression pipeline as a manually
// uploaded photo (see services/imageService.fileToCompressedBase64). Returns
// null if there's no image or the fetch fails.
export async function getExternalProductImage(imageUrl) {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return new File([blob], 'openfoodfacts-photo.jpg', { type: blob.type });
  } catch {
    return null;
  }
}
