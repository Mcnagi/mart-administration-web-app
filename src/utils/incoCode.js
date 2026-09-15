// Resolves the company name for an imported data row's IncoCode column (see
// services/dataService.parseExcelFile). An IncoCode looks like "1-0001":
// the part after the dash is the company code registered in the
// `companies` collection (see services/companyService) — the part before
// the dash isn't a company code and is ignored here. Returns null when
// there's no dash, since without one there's no code to extract (see
// companyNameFromIncoCode for how that case is still handled).
export function companyCodeFromIncoCode(incoCode) {
  const trimmed = String(incoCode ?? '').trim();
  if (!trimmed.includes('-')) return null;
  const code = Number(trimmed.split('-')[1]);
  return Number.isInteger(code) ? code : null;
}

// `companyNameByCode` is the Map produced by companyService.getCompanyNameMap
// (company code -> name). Returns '' when the IncoCode is malformed (no
// dash and not plain text either, e.g. a bare number) or its code isn't in
// the map, mirroring how a missing/unrecognized value is treated everywhere
// else in the import (skipped, not errored). Some source files put the
// company name directly in this column instead of a coded value — when
// there's no dash and the value isn't numeric, it's kept as-is rather than
// discarded.
export function companyNameFromIncoCode(incoCode, companyNameByCode) {
  const trimmed = String(incoCode ?? '').trim();
  if (!trimmed) return '';
  if (!trimmed.includes('-')) {
    return Number.isFinite(Number(trimmed)) ? '' : trimmed;
  }
  const code = companyCodeFromIncoCode(trimmed);
  return code === null ? '' : companyNameByCode.get(code) ?? '';
}
