// Resolves the company name for a spreadsheet row's IncoCode column (see
// services/spreadsheetService.parseExcelFile). An IncoCode looks like "1-0037":
// the digits after the dash, leading zeros dropped, are the company code
// registered in the `companies` collection (see services/companyService) —
// the part before the dash isn't a company code and is ignored here. Returns
// null for anything else, such as a date ("2001-01-12") or a value with no
// dash (see companyNameFromIncoCode for how that case is still handled).
export function companyCodeFromIncoCode(incoCode) {
  const match = String(incoCode ?? '').trim().match(/^\d+-(\d+)$/);
  return match ? Number(match[1]) : null;
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
