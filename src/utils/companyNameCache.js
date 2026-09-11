// Client-side cache of the `companies` code -> name map (see
// services/companyService.js), so resolving IncoCode -> company name during
// a data import (dataService.parseExcelFile) doesn't need its own Firestore
// read every time a file is selected. Refreshed as a side effect of
// companyService.fetchCompanies() — i.e. whenever the admin opens or edits
// the Companies list — so it stays reasonably current without a TTL.
const STORAGE_KEY = 'emart-company-name-map';

export function saveCompanyNameMap(companies) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(companies.map((c) => [c.code, c.name])));
  } catch (err) {
    console.error('Failed to cache company name map', err);
  }
}

// Returns null when nothing is cached yet (e.g. first use in a fresh
// browser), so the caller knows to fall back to a live fetch.
export function loadCompanyNameMap() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return new Map(JSON.parse(raw));
  } catch (err) {
    console.error('Failed to read cached company name map', err);
    return null;
  }
}
