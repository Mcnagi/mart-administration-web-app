import { describe, expect, it } from 'vitest';
import { companyCodeFromIncoCode, companyNameFromIncoCode } from './incoCode';

describe('companyCodeFromIncoCode', () => {
  it('extracts the numeric code after the dash', () => {
    expect(companyCodeFromIncoCode('1-0001')).toBe(1);
  });

  it('trims surrounding whitespace', () => {
    expect(companyCodeFromIncoCode('  1-0002  ')).toBe(2);
  });

  it('trims surrounding whitespace', () => {
    expect(companyCodeFromIncoCode('  1-0013  ')).toBe(13);
  });

  it('trims surrounding whitespace', () => {
    expect(companyCodeFromIncoCode('  1-0030  ')).toBe(30);
  });


  it('returns null for a missing/blank value', () => {
    expect(companyCodeFromIncoCode('')).toBeNull();
    expect(companyCodeFromIncoCode(undefined)).toBeNull();
    expect(companyCodeFromIncoCode(null)).toBeNull();
  });

  it('returns null when there is no dash', () => {
    expect(companyCodeFromIncoCode('0001')).toBeNull();
  });

  it('returns null when the part after the dash is not numeric', () => {
    expect(companyCodeFromIncoCode('1-abcd')).toBeNull();
  });
});

describe('companyNameFromIncoCode', () => {
  const companyNameByCode = new Map([
    [1, 'Acme Foods'],
    [2, 'Global Snacks'],
  ]);

  it('resolves the mapped company name', () => {
    expect(companyNameFromIncoCode('9-0002', companyNameByCode)).toBe('Global Snacks');
  });

  it('ignores the part before the dash', () => {
    expect(companyNameFromIncoCode('1-0002', companyNameByCode)).toBe('Global Snacks');
    expect(companyNameFromIncoCode('7-0002', companyNameByCode)).toBe('Global Snacks');
  });

  it('returns "" for a code not in the map', () => {
    expect(companyNameFromIncoCode('9-0099', companyNameByCode)).toBe('');
  });

  it('returns "" for a malformed IncoCode', () => {
    expect(companyNameFromIncoCode('not-an-incocode', companyNameByCode)).toBe('');
  });

  it('keeps a dash-less, non-numeric value as the company name as-is', () => {
    expect(companyNameFromIncoCode('Local Distributor Co', companyNameByCode)).toBe('Local Distributor Co');
  });

  it('trims a dash-less text value', () => {
    expect(companyNameFromIncoCode('  Local Distributor Co  ', companyNameByCode)).toBe('Local Distributor Co');
  });

  it('returns "" for a dash-less bare number', () => {
    expect(companyNameFromIncoCode('12345', companyNameByCode)).toBe('');
  });

  it('returns "" for an empty value', () => {
    expect(companyNameFromIncoCode('', companyNameByCode)).toBe('');
    expect(companyNameFromIncoCode('   ', companyNameByCode)).toBe('');
  });
});
