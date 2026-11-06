import { describe, expect, it } from 'vitest';
import { formatTableForClipboard } from './tableClipboard';

describe('formatTableForClipboard', () => {
  it('separates cells with tabs and rows with line breaks', () => {
    const { text } = formatTableForClipboard([
      ['Barcode', 'Qty'],
      ['8801234567890', 2],
    ]);
    expect(text).toBe('Barcode\tQty\r\n8801234567890\t2');
  });

  it('quotes cells that would otherwise split', () => {
    const { text } = formatTableForClipboard([['a\tb', 'c\nd', '5" pipe']]);
    expect(text).toBe('"a\tb"\t"c\nd"\t"5"" pipe"');
  });

  it('shows missing values as blank cells', () => {
    const { text, html } = formatTableForClipboard([[null, undefined]]);
    expect(text).toBe('\t');
    expect(html).not.toMatch(/null|undefined/);
  });

  it('marks strings as Excel text and leaves numbers numeric', () => {
    const { html } = formatTableForClipboard([['0123', 2]]);
    expect(html).toBe(`<table><tr><td style='mso-number-format:"\\@"'>0123</td><td>2</td></tr></table>`);
  });

  it('escapes HTML in values', () => {
    const { html } = formatTableForClipboard([['<b>&"']]);
    expect(html).toContain('&lt;b&gt;&amp;&quot;');
  });
});
