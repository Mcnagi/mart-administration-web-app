// Finds candidate product photos for a barcode when neither lookup source
// (the imported `data` collection, or Open Food Facts — see
// api/barcodeLookupApi.js and api/dataApi.js) has a photo of its own.
// Results are cached as the `photos` field on the `data/{barcode}` doc (see
// api/dataApi.savePhotosForBarcode) so the same barcode only ever pays for
// a Google Custom Search once, shared across every item that carries it.
//
// Callers should check for an existing `photos` field themselves first —
// they've typically already read the data/{barcode} doc via
// dataApi.getDataByBarcode — rather than call this again, to avoid paying
// for a redundant Firestore read here.
import { savePhotosForBarcode } from '../api/dataApi';
import { searchProductImages } from '../api/googleImageSearchApi';
import { fetchImageAsThumbnailBase64 } from './imageService';

const RESULTS_COUNT = 6;

// Returns an array of { base64, query } candidates for `barcode`, searching
// Google Images with the single combined product-name query, and caches
// them onto data/{barcode}.photos for next time.
export async function findProductPhotos(barcode, query) {
  const trimmedBarcode = (barcode ?? '').trim();
  const trimmedQuery = (query ?? '').trim();
  if (!trimmedBarcode || !trimmedQuery) return [];

  const links = await searchProductImages(trimmedQuery, RESULTS_COUNT);
  const base64s = await Promise.all(links.map((link) => fetchImageAsThumbnailBase64(link)));

  // Drop candidates whose image couldn't actually be fetched (dead link,
  // host blocks cross-origin reads, etc.) rather than showing a broken tile.
  const images = links
    .map((link, i) => ({ query: trimmedQuery, base64: base64s[i] }))
    .filter((c) => c.base64);

  if (images.length > 0) {
    await savePhotosForBarcode(trimmedBarcode, images).catch(() => {});
  }
  return images;
}
