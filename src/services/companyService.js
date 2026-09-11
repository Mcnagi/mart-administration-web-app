// Business logic for the admin-managed code -> company name map (see
// components/admin/CompaniesForm.jsx). Views should call only this file,
// never api/companiesApi.js directly.
import * as companiesApi from '../api/companiesApi';
import { t } from '../i18n/i18n';

export function fetchCompanies() {
  return companiesApi.listCompanies();
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
