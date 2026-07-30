export const APP_NAME = import.meta.env.VITE_APP_NAME || 'MartAdmin';

// Optional fixed temporary password for admin-created accounts. Leave unset
// to fall back to a random one per user (see userService.randomTempPassword).
export const TEMP_PASSWORD = import.meta.env.VITE_TEMP_PASSWORD || '';
