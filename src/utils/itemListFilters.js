// Filtering an item list's rows by company and by category. All of it reads
// the local-copy row, so it works whether or not those columns are among the
// admin's display columns.
import { columnValue } from './classColumns';

// The chip value for rows with nothing in a group's field. Can't collide with
// a real value from the spreadsheet.
export const BLANK_FILTER_OPTION = '\u0000blank';

// A combined column counts as blank when any one of its fields is, even
// though the row still has a value from the others.
function isBlank(row, column) {
  return (column.sourceKeys ?? [column.key]).some((key) => !row?.[key]);
}

// Chip groups for the filter panel, one per column in `columns`: the column
// plus `options`, the distinct values on the list, sorted, then
// BLANK_FILTER_OPTION if any row is blank there. A row not in the local copy
// has no values, so it counts as blank. A group with no options is left out.
export function buildItemListFilterGroups(resolvedItems, columns) {
  return columns
    .map((column) => {
      const values = new Set(resolvedItems.map((item) => columnValue(item.row, column)).filter(Boolean));
      const options = [...values].sort((a, b) => String(a).localeCompare(String(b)));
      const hasBlank = resolvedItems.some((item) => isBlank(item.row, column));
      return { ...column, options: hasBlank ? [...options, BLANK_FILTER_OPTION] : options };
    })
    .filter((group) => group.options.length > 0);
}

function matchesGroup(row, group, selected) {
  return selected.has(columnValue(row, group)) || (selected.has(BLANK_FILTER_OPTION) && isBlank(row, group));
}

// `filters` maps a group key to its Set of selected values. A row must match
// one selected value in every group that has any; an empty group is ignored.
export function filterItemListItems(resolvedItems, filters, groups) {
  const active = groups.filter((group) => filters[group.key]?.size > 0);
  if (active.length === 0) return resolvedItems;
  return resolvedItems.filter((item) => active.every((group) => matchesGroup(item.row, group, filters[group.key])));
}

export function countItemListFilters(filters) {
  return Object.values(filters).reduce((sum, values) => sum + values.size, 0);
}
