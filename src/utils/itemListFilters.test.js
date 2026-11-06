import { describe, expect, it } from 'vitest';
import { classFilterColumns, mergeClassColumns } from './classColumns';
import { buildItemListFilterGroups, countItemListFilters, filterItemListItems } from './itemListFilters';

const item = (barcode, companyName, class1, class2) => ({ barcode, row: { companyName, class1, class2 } });
const items = [
  item('1', 'Acme', 'Food', 'Dairy'),
  item('2', 'Acme', 'Food', 'Snacks'),
  item('3', 'Birch', 'Home', ''),
  { barcode: '4', row: null },
];
const barcodes = (rows) => rows.map((r) => r.barcode);

const barcodeColumn = { key: 'barcode', label: 'Barcode' };
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
  it('lists company then separate levels, with sorted distinct values', () => {
    expect(buildItemListFilterGroups(items, [class1, class2, class3], 'Company')).toEqual([
      { key: 'companyName', label: 'Company', options: ['Acme', 'Birch'] },
      { ...class1, options: ['Food', 'Home'] },
      { ...class2, options: ['Dairy', 'Snacks'] },
    ]);
  });

  it('offers combined values as a single group', () => {
    const groups = buildItemListFilterGroups(items, mergeClassColumns([class1, class2]), 'Company');
    expect(groups.map((g) => g.key)).toEqual(['companyName', 'classes']);
    expect(groups[1].label).toBe('Main Sub');
    expect(groups[1].options).toEqual(['Food Dairy', 'Food Snacks', 'Home']);
  });

  it('is empty when nothing on the list has a value', () => {
    expect(buildItemListFilterGroups([{ barcode: '4', row: null }], [class1], 'Company')).toEqual([]);
  });
});

describe('filterItemListItems', () => {
  const groups = buildItemListFilterGroups(items, [class1, class2], 'Company');

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

  it('excludes rows missing from the local copy once a filter is on', () => {
    expect(barcodes(filterItemListItems(items, { class1: new Set(['Home']) }, groups))).toEqual(['3']);
  });

  it('matches on the combined value', () => {
    const merged = buildItemListFilterGroups(items, mergeClassColumns([class1, class2]), 'Company');
    expect(barcodes(filterItemListItems(items, { classes: new Set(['Food Dairy']) }, merged))).toEqual(['1']);
  });
});

describe('countItemListFilters', () => {
  it('adds up selected values across groups', () => {
    expect(countItemListFilters({ class1: new Set(['a', 'b']), class2: new Set(['c']) })).toBe(3);
  });
});
