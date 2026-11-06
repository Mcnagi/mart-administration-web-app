import { describe, expect, it } from 'vitest';
import { classCategory, columnValue, mergeClassColumns } from './classColumns';

const col = (key) => ({ key, label: key.toUpperCase() });

describe('classCategory', () => {
  const row = { class1: 'Food', class2: 'Dairy', class3: 'Milk' };

  it('joins with a space when on', () => {
    expect(classCategory(row, true)).toBe('Food Dairy Milk');
  });

  it('joins with a dash when off', () => {
    expect(classCategory(row, false)).toBe('Food-Dairy-Milk');
  });

  it('skips blank levels', () => {
    expect(classCategory({ class1: 'Food', class2: '', class3: 'Milk' }, true)).toBe('Food Milk');
  });
});

describe('mergeClassColumns', () => {
  it('combines class columns in the first one\'s position', () => {
    const merged = mergeClassColumns([col('product'), col('class1'), col('price'), col('class2'), col('class3')]);
    expect(merged.map((c) => c.key)).toEqual(['product', 'classes', 'price']);
    expect(merged[1].label).toBe('CLASS1 CLASS2 CLASS3');
  });

  it('only includes the class columns that were picked', () => {
    const [merged] = mergeClassColumns([col('class1'), col('class3')]);
    expect(merged.sourceKeys).toEqual(['class1', 'class3']);
  });

  it('leaves a lone class column alone', () => {
    const columns = [col('product'), col('class2')];
    expect(mergeClassColumns(columns)).toBe(columns);
  });
});

describe('columnValue', () => {
  it('reads a plain column', () => {
    expect(columnValue({ product: 'Milk' }, col('product'))).toBe('Milk');
  });

  it('reads a combined column, skipping blanks', () => {
    const [merged] = mergeClassColumns([col('class1'), col('class2'), col('class3')]);
    expect(columnValue({ class1: 'Food', class2: '', class3: 'Milk' }, merged)).toBe('Food Milk');
  });

  it('is blank when there is no row', () => {
    expect(columnValue(null, col('product'))).toBe('');
    const [merged] = mergeClassColumns([col('class1'), col('class2')]);
    expect(columnValue(null, merged)).toBe('');
  });
});
