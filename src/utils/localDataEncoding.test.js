import { describe, expect, it } from 'vitest';
import { utf8ByteLength, encodeRowsToChunks, decodeChunks, packStringsIntoDocs } from './localDataEncoding';

describe('utf8ByteLength', () => {
  it('matches TextEncoder for ASCII, Korean and astral characters', () => {
    ['barcode', '신라면 120g', 'emoji 😀 mix', ''].forEach((s) => {
      expect(utf8ByteLength(s)).toBe(new TextEncoder().encode(s).length);
    });
  });
});

describe('encodeRowsToChunks', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({
    barcode: `880${i}`,
    product: `상품 ${i}`,
    salePrice: i * 100,
    note: 'dropped',
  }));
  const keys = ['barcode', 'product', 'salePrice'];

  it('round-trips rows through decodeChunks, keeping only the chosen columns', async () => {
    const chunks = await encodeRowsToChunks(rows, keys);
    expect(chunks).toHaveLength(1);
    const decoded = decodeChunks(chunks.map((c) => c.text));
    expect(decoded).toEqual(rows.map((r) => [r.barcode, r.product, r.salePrice]));
  });

  it('splits into chunks that never exceed maxBytes, without splitting a row', async () => {
    const maxBytes = 120;
    const chunks = await encodeRowsToChunks(rows, keys, { maxBytes });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => {
      expect(c.bytes).toBe(new TextEncoder().encode(c.text).length);
      expect(c.bytes).toBeLessThanOrEqual(maxBytes);
    });
    expect(chunks.reduce((sum, c) => sum + c.rowCount, 0)).toBe(rows.length);
    expect(decodeChunks(chunks.map((c) => c.text))).toHaveLength(rows.length);
  });

  it('throws when a single row exceeds maxBytes', async () => {
    await expect(encodeRowsToChunks(rows, keys, { maxBytes: 10 })).rejects.toThrow();
  });

  it('survives values containing the delimiter-like characters and quotes', async () => {
    const tricky = [{ barcode: '1', product: 'a\u001eb "q" \\ ,' }];
    const chunks = await encodeRowsToChunks(tricky, ['barcode', 'product']);
    expect(decodeChunks(chunks.map((c) => c.text))).toEqual([['1', 'a\u001eb "q" \\ ,']]);
  });
});

describe('packStringsIntoDocs', () => {
  const chunk = (bytes) => ({ text: 'x'.repeat(bytes), bytes, rowCount: 1 });

  it('fills each doc up to maxDocBytes, keeping string order', () => {
    const chunks = [chunk(40), chunk(40), chunk(40), chunk(40), chunk(40)];
    const docs = packStringsIntoDocs(chunks, { maxDocBytes: 100 });
    expect(docs.map((d) => d.length)).toEqual([2, 2, 1]);
    expect(docs.flat()).toEqual(chunks.map((c) => c.text));
  });

  it('reserves room in the first doc for its metadata', () => {
    const docs = packStringsIntoDocs([chunk(40), chunk(40), chunk(40)], { maxDocBytes: 100, firstDocOverheadBytes: 50 });
    expect(docs.map((d) => d.length)).toEqual([1, 2]);
  });

  it('always returns at least one (possibly empty) doc', () => {
    expect(packStringsIntoDocs([])).toEqual([[]]);
  });
});
