// The local data's three category levels (spreadsheet columns class1, class2
// and class3), which the admin can choose to treat as one space-separated
// value — see components/admin/ClassColumnsForm.jsx.
const CLASS_KEYS = ['class1', 'class2', 'class3'];
const CONCAT_DELIMITER = ' ';
const SEPARATE_DELIMITER = '-';

function joinValues(row, keys, delimiter) {
  return keys
    .map((key) => row?.[key])
    .filter(Boolean)
    .join(delimiter);
}

// A row's class values as a single category string.
export function classCategory(row, concat) {
  return joinValues(row, CLASS_KEYS, concat ? CONCAT_DELIMITER : SEPARATE_DELIMITER);
}

// Replaces two or more class columns with one combined column, in the
// first one's position. The result's `sourceKeys` is what columnValue reads.
// Columns the admin didn't pick stay out of it; a lone class column is
// returned unchanged, as there's nothing to combine it with.
export function mergeClassColumns(columns) {
  const classColumns = columns.filter((c) => CLASS_KEYS.includes(c.key));
  if (classColumns.length < 2) return columns;
  const merged = {
    key: 'classes',
    label: classColumns.map((c) => c.label).join(CONCAT_DELIMITER),
    sourceKeys: classColumns.map((c) => c.key),
  };
  return columns.flatMap((c) => {
    if (c === classColumns[0]) return [merged];
    return classColumns.includes(c) ? [] : [c];
  });
}

// The category columns to filter item lists by, given the copy's columns and
// the columns on display. Off: each class level separately. On: one combined
// column, the one on display when there is one, so its chips read the same as
// the table; otherwise all the class levels combined.
export function classFilterColumns(allColumns, displayColumns, concat) {
  const classColumns = allColumns.filter((c) => CLASS_KEYS.includes(c.key));
  if (!concat) return classColumns;
  const displayed = displayColumns.find((c) => c.sourceKeys);
  return displayed ? [displayed] : mergeClassColumns(classColumns);
}

// What `column` shows for `row`, for both plain and combined columns.
export function columnValue(row, column) {
  return column.sourceKeys ? joinValues(row, column.sourceKeys, CONCAT_DELIMITER) : (row?.[column.key] ?? '');
}
