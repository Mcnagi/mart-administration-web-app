// Business logic for the admin-managed code -> company name map (see
// components/admin/CompaniesForm.jsx). Views should call only this file,
// never api/companiesApi.js directly.
import * as companiesApi from '../api/companiesApi';
import { t } from '../i18n/i18n';
import { isBinarySpreadsheet, decodeTextFile, fixMojibake, headerToFieldKey } from '../utils/spreadsheetEncoding';
import { saveCompanyNameMap, loadCompanyNameMap } from '../utils/companyNameCache';

export async function fetchCompanies() {
  const companies = await companiesApi.listCompanies();
  saveCompanyNameMap(companies);
  return companies;
}

// Code -> name lookup for the data import's IncoCode column (see
// dataService.parseExcelFile). Reads the local cache first (see
// utils/companyNameCache.js), which is refreshed on every fetchCompanies()
// call, so importing data doesn't need its own Firestore read just to
// resolve names. Falls back to a live fetch only when nothing's cached yet.
export async function getCompanyNameMap() {
  const cached = loadCompanyNameMap();
  if (cached) return cached;
  const companies = await fetchCompanies();
  return new Map(companies.map((c) => [c.code, c.name]));
}

// `id` present -> update an existing entry, absent -> create a new one.
export async function saveCompany({ id, code, name }) {
  const trimmedName = (name ?? '').trim();
  if (!trimmedName) {
    throw new Error(t('errors.companyNameRequired'));
  }
  const numericCode = Number(code);
  if (!Number.isInteger(numericCode) || numericCode <= 0) {
    throw new Error(t('errors.companyCodeInvalid'));
  }
  if (id) {
    await companiesApi.updateCompany(id, numericCode, trimmedName);
    return id;
  }
  const ref = await companiesApi.createCompany(numericCode, trimmedName);
  return ref.id;
}

export function removeCompany(id) {
  return companiesApi.deleteCompany(id);
}

// Reads a .csv/.xlsx/.xls file (first sheet) with "Code" and "Name" columns
// and returns validated, deduped rows for the admin to preview before
// uploadCompanies writes anything. Rows with a non-positive/non-integer code
// or a blank name are skipped and counted, not errored — mirrors
// dataService.parseExcelFile's approach for the same reason: a stray
// incomplete row in an exported sheet is the common case, not a mistake.
export async function parseCompaniesFile(file) {
  const XLSX = await import('@e965/xlsx');
  const cptable = await import('@e965/xlsx/dist/cpexcel.full.mjs');
  XLSX.set_cptable(cptable);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const workbook = isBinarySpreadsheet(bytes)
    ? XLSX.read(buffer, { type: 'array' })
    : XLSX.read(decodeTextFile(bytes), { type: 'string' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const sheet = worksheet ? XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) : [];
  if (sheet.length < 2) {
    throw new Error(t('errors.importEmpty'));
  }

  const [headerRow, ...dataRows] = sheet;
  const keys = headerRow.map(headerToFieldKey);
  const codeIndex = keys.indexOf('code');
  const nameIndex = keys.indexOf('name') !== -1 ? keys.indexOf('name') : keys.indexOf('companyName');
  if (codeIndex === -1 || nameIndex === -1) {
    throw new Error(t('errors.importCompaniesMissingColumns'));
  }

  const rowsByCode = new Map();
  let skipped = 0;
  dataRows.forEach((row) => {
    const code = Number(String(row[codeIndex]).trim());
    const name = fixMojibake(String(row[nameIndex] ?? '').trim(), cptable);
    if (!Number.isInteger(code) || code <= 0 || !name) {
      skipped += 1;
      return;
    }
    rowsByCode.set(code, { code, name });
  });

  const rows = [...rowsByCode.values()];
  if (rows.length === 0) {
    throw new Error(t('errors.importNoValidRows'));
  }

  return { rows, totalRows: dataRows.length, skipped };
}

// Writes previously parsed rows (see parseCompaniesFile) to the `companies`
// collection, matched by code. Codes already present with the same name are
// left untouched, so re-importing the same file repeatedly is a no-op write.
export async function uploadCompanies(rows) {
  const existing = await companiesApi.listCompanies();
  const { written } = await companiesApi.upsertCompaniesByCode(existing, rows);
  return { imported: written, unchanged: rows.length - written };
}
