import { describe, expect, it } from 'vitest';
import { classFilterColumns, mergeClassColumns } from './classColumns';
import {
  BLANK_FILTER_OPTION,
  buildItemListFilterGroups,
  countItemListFilters,
  filterItemListItems,
} from './itemListFilters';

const item = (barcode, companyName, class1, class2) => ({ barcode, row: { companyName, class1, class2 } });
const items = [
  item('1', 'Acme', 'Food', 'Dairy'),
  item('2', 'Acme', 'Food', 'Snacks'),
  item('3', 'Birch', 'Home', ''),
];
const missingRow = { barcode: '4', row: null };
const noCompany = item('5', '', 'Food', 'Dairy');
const barcodes = (rows) => rows.map((r) => r.barcode);

const barcodeColumn = { key: 'barcode', label: 'Barcode' };
const company = { key: 'companyName', label: 'Company' };
const class1 = { key: 'class1', label: 'Main' };
const class2 = { key: 'class2', label: 'Sub' };
const class3 = { key: 'class3', label: 'Detail' };
const allColumns = [barcodeColumn, class1, class2, class3];

describe('classFilterColumns', () => {
  it('keeps each level separate when off', () => {
    expect(classFilterColumns(allColumns, [class1], false)).toEqual([class1, class2, class3]);
  });

  it('uses the combined column on display when on', () => {
    const display = mergeClassColumns([class1, class2]);
    expect(classFilterColumns(allColumns, display, true)).toEqual(display);
  });

  it('combines every level when on and none is displayed combined', () => {
    const [column, ...rest] = classFilterColumns(allColumns, [class1], true);
    expect(column.sourceKeys).toEqual(['class1', 'class2', 'class3']);
    expect(rest).toEqual([]);
  });
});

describe('buildItemListFilterGroups', () => {
  it('sorts distinct values and adds the blank chip last, only where a row is blank', () => {
    expect(buildItemListFilterGroups(items, [company, class1, class2])).toEqual([
      { ...company, options: ['Acme', 'Birch'] },
      { ...class1, options: ['Food', 'Home'] },
      { ...class2, options: ['Dairy', 'Snacks', BLANK_FILTER_OPTION] },
    ]);
  });

  it('offers combined values as a single group, blank if any field is', () => {
    const [group, ...rest] = buildItemListFilterGroups(items, mergeClassColumns([class1, class2]));
    expect(rest).toEqual([]);
    expect(group.label).toBe('Main Sub');
    expect(group.options).toEqual(['Food Dairy', 'Food Snacks', 'Home', BLANK_FILTER_OPTION]);
  });

  it('counts a row missing from the local copy as blank', () => {
    const [group] = buildItemListFilterGroups([missingRow], [company]);
    expect(group.options).toEqual([BLANK_FILTER_OPTION]);
  });

  it('leaves out every group for an empty list', () => {
    expect(buildItemListFilterGroups([], [company, class1])).toEqual([]);
  });
});

describe('filterItemListItems', () => {
  const groups = buildItemListFilterGroups(items, [company, class1, class2]);

  it('returns everything with no selection', () => {
    expect(filterItemListItems(items, { class1: new Set() }, groups)).toBe(items);
  });

  it('matches any selected value within a group', () => {
    expect(barcodes(filterItemListItems(items, { class2: new Set(['Dairy', 'Snacks']) }, groups))).toEqual(['1', '2']);
  });

  it('requires a match in every group', () => {
    const filters = { companyName: new Set(['Acme']), class2: new Set(['Dairy']) };
    expect(barcodes(filterItemListItems(items, filters, groups))).toEqual(['1']);
  });

  it('excludes rows missing from the local copy when filtering by a value', () => {
    const rows = [...items, missingRow];
    expect(barcodes(filterItemListItems(rows, { class1: new Set(['Home']) }, groups))).toEqual(['3']);
  });

  it('matches on the combined value', () => {
    const merged = buildItemListFilterGroups(items, mergeClassColumns([class1, class2]));
    expect(barcodes(filterItemListItems(items, { classes: new Set(['Food Dairy']) }, merged))).toEqual(['1']);
  });

  it('finds blank companies, including rows missing from the local copy', () => {
    const rows = [...items, noCompany, missingRow];
    const filters = { companyName: new Set([BLANK_FILTER_OPTION]) };
    expect(barcodes(filterItemListItems(rows, filters, groups))).toEqual(['5', '4']);
  });

  it('finds rows blank in any one combined field', () => {
    const rows = [
      item('a', 'Acme', 'Food', ''),
      item('b', 'Acme', '', 'Dairy'),
      item('c', 'Acme', 'Food', 'Dairy'),
    ];
    const merged = buildItemListFilterGroups(rows, mergeClassColumns([class1, class2]));
    const filters = { classes: new Set([BLANK_FILTER_OPTION]) };
    expect(barcodes(filterItemListItems(rows, filters, merged))).toEqual(['a', 'b']);
  });

  it('combines the blank chip with a value in the same group', () => {
    const filters = { class2: new Set([BLANK_FILTER_OPTION, 'Dairy']) };
    expect(barcodes(filterItemListItems(items, filters, groups))).toEqual(['1', '3']);
  });
});

describe('countItemListFilters', () => {
  it('adds up selected values across groups', () => {
    expect(countItemListFilters({ class1: new Set(['a', 'b']), class2: new Set(['c']) })).toBe(3);
  });
});
