// Fallback product lookup for barcodes that aren't in Firestore's imported
// `data` collection (see api/dataApi.js). Backed by Open Food Facts — a
// free, public product database with no API key required. See
// https://world.openfoodfacts.org/data for the API.
const OFF_PRODUCT_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS = 'product_name,product_name_en,product_name_ko,brands,quantity,categories,image_url';

// Returns { name, koreanName, brand, quantity, category, imageUrl } from
// Open Food Facts, or null if the barcode isn't in their database (or has
// no name on file). Only the first listed brand is kept — Open Food Facts
// often lists several comma-separated owners/manufacturers for one product.
export async function getExternalProductInfo(barcode) {
  const url = `${OFF_PRODUCT_ENDPOINT}/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1) return null;

  const product = data.product ?? {};
  const name = (product.product_name || product.product_name_en || '').trim();
  if (!name) return null;

  return {
    name,
    nameEn: (product.product_name_en || '').trim(),
    koreanName: (product.product_name_ko || '').trim(),
    brand: (product.brands || '').split(',')[0].trim(),
    quantity: (product.quantity || '').trim(),
    category: (product.categories || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .join(', '),
    imageUrl: (product.image_url || '').trim(),
  };
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
