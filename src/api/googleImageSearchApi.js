// Google Custom Search JSON API (image search), used as a fallback when
// neither the imported `data` collection nor Open Food Facts has a product
// photo on file — see services/photoSearchService.js. Requires a search
// engine configured for image search (see .env.example for setup).
import { GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX } from '../appConfig';

const ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
// Restrict to images labeled for reuse, since these get copied into our own
// Firestore rather than just linked to.
const REUSABLE_RIGHTS = 'cc_publicdomain,cc_attribute,cc_sharealike,cc_noncommercial,cc_nonderived';

// Returns up to `num` image URLs for `query`, or [] if photo search isn't
// configured, the request fails, or there are no results.
export async function searchProductImages(query, num = 2) {
  const trimmed = (query ?? '').trim();
  if (!trimmed || !GOOGLE_CSE_API_KEY || !GOOGLE_CSE_CX) return [];

  const params = new URLSearchParams({
    key: GOOGLE_CSE_API_KEY,
    cx: GOOGLE_CSE_CX,
    q: trimmed,
    searchType: 'image',
    rights: REUSABLE_RIGHTS,
    safe: 'active',
    num: String(num),
  });

  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((item) => item.link).filter(Boolean);
  } catch {
    return [];
  }
}
