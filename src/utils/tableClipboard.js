// Puts a table on the clipboard so it pastes into Excel as cells, one value
// per column.
const TEXT_CELL_STYLE = 'mso-number-format:"\\@"';

function plainTextCell(value) {
  const text = String(value ?? '');
  return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Non-numbers are marked as Excel text, or it would rewrite values that only
// look numeric: 8801234567890 to 8.80123E+12, 0123 to 123, 1-0001 to a date.
function htmlCell(value) {
  if (typeof value === 'number') return `<td>${value}</td>`;
  return `<td style='${TEXT_CELL_STYLE}'>${escapeHtml(value)}</td>`;
}

// `rows` is an array of arrays of cell values, header row included. `text`
// is tab-separated, with cells quoted the way Excel reads them back.
export function formatTableForClipboard(rows) {
  return {
    text: rows.map((row) => row.map(plainTextCell).join('\t')).join('\r\n'),
    html: `<table>${rows.map((row) => `<tr>${row.map(htmlCell).join('')}</tr>`).join('')}</table>`,
  };
}

// A copy event writes the HTML as given, where navigator.clipboard.write
// runs it through a sanitizer that can drop Excel's style property. Returns
// false when the browser didn't fire the event (Safari, with no selection).
function copyWithEvent({ text, html }) {
  let written = false;
  const onCopy = (e) => {
    e.clipboardData.setData('text/plain', text);
    e.clipboardData.setData('text/html', html);
    e.preventDefault();
    written = true;
  };
  document.addEventListener('copy', onCopy);
  try {
    document.execCommand('copy');
  } finally {
    document.removeEventListener('copy', onCopy);
  }
  return written;
}

// Must be called directly from a click handler, as browsers only allow
// clipboard writes during a user gesture. Rejects if neither route works.
export async function copyTableToClipboard(rows) {
  const formatted = formatTableForClipboard(rows);
  if (copyWithEvent(formatted)) return;
  await navigator.clipboard.writeText(formatted.text);
}
