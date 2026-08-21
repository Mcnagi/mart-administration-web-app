export const APP_NAME = import.meta.env.VITE_APP_NAME || 'MartAdmin';

// Optional fixed temporary password for admin-created accounts. Leave unset
// to fall back to a random one per user (see userService.randomTempPassword).
export const TEMP_PASSWORD = import.meta.env.VITE_TEMP_PASSWORD || '';

// Comma-separated list of selectable branches/locations, e.g.
// "Downtown,Uptown,Warehouse". Staff pick one of these for their own profile
// (see userService.updateOwnBranch) — there's no free-text option.
export const BRANCHES = (import.meta.env.VITE_BRANCHES || '')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

// Google Custom Search API credentials for product-photo lookup (see
// api/googleImageSearchApi.js). Both blank disables photo search entirely.
export const GOOGLE_CSE_API_KEY = import.meta.env.VITE_GOOGLE_CSE_API_KEY || '';
export const GOOGLE_CSE_CX = import.meta.env.VITE_GOOGLE_CSE_CX || '';
