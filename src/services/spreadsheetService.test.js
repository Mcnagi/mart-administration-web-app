import { describe, expect, it, vi } from 'vitest';
import { parseExcelFile } from './spreadsheetService';

vi.mock('./companyService', () => ({
  getCompanyNameMap: async () =>
    new Map([
      [1, 'Wrong Co'],
      [12, 'Twelve Co'],
      [37, 'Thirty Seven Co'],
    ]),
}));

function csvFile(text) {
  return { arrayBuffer: async () => new TextEncoder().encode(text).buffer };
}

describe('parseExcelFile IncoCode', () => {
  it('reads codes that look like dates as written', async () => {
    const { rows } = await parseExcelFile(csvFile('barcode,IncoCode\n111,1-0012\n222,1-0037\n'));
    expect(rows).toMatchObject([
      { barcode: '111', incoCode: '1-0012', companyName: 'Twelve Co' },
      { barcode: '222', incoCode: '1-0037', companyName: 'Thirty Seven Co' },
    ]);
  });

  it('stays on the right row when the file has blank lines', async () => {
    const { rows } = await parseExcelFile(csvFile('barcode,IncoCode\n111,1-0012\n,\n222,1-0037\n'));
    expect(rows.map((r) => [r.barcode, r.companyName])).toEqual([
      ['111', 'Twelve Co'],
      ['222', 'Thirty Seven Co'],
    ]);
  });
});
