// Fallback product lookup for barcodes that aren't in Firestore's imported
// `data` collection (see api/dataApi.js). Backed by Open Food Facts — a
// free, public product database with no API key required. See
// https://world.openfoodfacts.org/data for the API.
const OFF_PRODUCT_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS = 'product_name,product_name_en,product_name_ko,brands,quantity,categories';

// Returns { name, koreanName, brand, quantity, category } from Open Food
// Facts, or null if the barcode isn't in their database (or has no name on
// file). Only the first listed brand is kept — Open Food Facts often lists
// several comma-separated owners/manufacturers for one product.
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
    koreanName: (product.product_name_ko || '').trim(),
    brand: (product.brands || '').split(',')[0].trim(),
    quantity: (product.quantity || '').trim(),
    category: (product.categories || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .join(', '),
  };
}
