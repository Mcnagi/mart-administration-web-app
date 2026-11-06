// Filtering an item list's rows by company and by category. All of it reads
// the local-copy row, so it works whether or not those columns are among the
// admin's display columns.
import { columnValue } from './classColumns';

// Chip groups for the filter panel: company, then `categoryColumns` (see
// classFilterColumns), each as its column plus `options`, the distinct values
// on the list, sorted. Blank values aren't offered, and a group with no
// options is left out.
export function buildItemListFilterGroups(resolvedItems, categoryColumns, companyLabel) {
  return [{ key: 'companyName', label: companyLabel }, ...categoryColumns]
    .map((column) => ({
      ...column,
      options: [...new Set(resolvedItems.map((item) => columnValue(item.row, column)).filter(Boolean))].sort((a, b) =>
        String(a).localeCompare(String(b))
      ),
    }))
    .filter((group) => group.options.length > 0);
}

// `filters` maps a group key to its Set of selected values. A row must match
// one selected value in every group that has any; an empty group is ignored.
export function filterItemListItems(resolvedItems, filters, groups) {
  const active = groups.filter((group) => filters[group.key]?.size > 0);
  if (active.length === 0) return resolvedItems;
  return resolvedItems.filter((item) => active.every((group) => filters[group.key].has(columnValue(item.row, group))));
}

export function countItemListFilters(filters) {
  return Object.values(filters).reduce((sum, values) => sum + values.size, 0);
}
