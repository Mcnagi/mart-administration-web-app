import { useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { parseExcelFile, encodeRows, planPublish, publishChunks } from '../../services/localDataService';
import { MAX_STRING_BYTES, MAX_DOC_BYTES, formatBytes } from '../../utils/localDataEncoding';
import LoadingSpinner from '../LoadingSpinner';

const PREVIEW_ROW_COUNT = 5;

// Admin section of the local-data page: parse a spreadsheet the same way
// the data import does (incl. IncoCode -> company name), pick which columns
// to keep, encode the rows into an array of long strings packed into as few
// Firestore docs as fit under the 1 MiB limit, then publish them for every
// user to download.
export default function LocalDataUploadForm({ onPublished }) {
  const { t } = useTranslation();
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  // Live progress while encoding ({ rowsEncoded, totalRows, chunkCount,
  // currentChunkBytes }), then the finished string array.
  const [encodeProgress, setEncodeProgress] = useState(null);
  const [chunks, setChunks] = useState(null);
  const [encoding, setEncoding] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const busy = parsing || encoding || uploadProgress !== null;

  const selectedColumns = parsed ? parsed.columns.filter((c) => selectedKeys.has(c.key)) : [];

  function resetEncoded() {
    setChunks(null);
    setEncodeProgress(null);
  }

  function reset() {
    setParsed(null);
    setSelectedKeys(new Set());
    resetEncoded();
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setSummary(null);
    setParsed(null);
    resetEncoded();
    setParsing(true);
    try {
      const result = await parseExcelFile(file);
      setParsed(result);
      setSelectedKeys(new Set(result.columns.map((c) => c.key)));
    } catch (err) {
      setError(err.message || t('admin.errorImport'));
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setParsing(false);
    }
  }

  // Any change to the column selection invalidates already-encoded strings.
  function toggleColumn(key) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    resetEncoded();
  }

  function selectAll(all) {
    setSelectedKeys(all ? new Set(parsed.columns.map((c) => c.key)) : new Set());
    resetEncoded();
  }

  async function handleEncode() {
    setError('');
    setSummary(null);
    resetEncoded();
    setEncoding(true);
    try {
      const result = await encodeRows(parsed.rows, selectedColumns, setEncodeProgress);
      setChunks(result);
    } catch (err) {
      console.error('[local data] encode failed', err);
      setError(err.message || t('localData.errorEncode'));
    } finally {
      setEncoding(false);
    }
  }

  async function handlePublish() {
    setError('');
    setUploadProgress({ done: 0, total: plan.docs.length });
    try {
      const result = await publishChunks(chunks, selectedColumns, (done, total) => setUploadProgress({ done, total }));
      setSummary(result);
      reset();
      onPublished?.();
    } catch (err) {
      console.error('[local data] publish failed', err);
      setError(err.message || t('localData.errorPublish'));
    } finally {
      setUploadProgress(null);
    }
  }

  // Firestore doc layout and on-device size for the encoded strings.
  // `chunks` is reset whenever the column selection changes, so it alone
  // determines the plan.
  const plan = useMemo(() => (chunks ? planPublish(chunks, selectedColumns) : null), [chunks]);

  return (
    <div className="item-form">
      <h3>{t('localData.adminTitle')}</h3>
      <p className="import-hint">{t('localData.adminHint', { stringLimit: formatBytes(MAX_STRING_BYTES), docLimit: formatBytes(MAX_DOC_BYTES) })}</p>
      <label>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={handleFileChange} disabled={busy} />
      </label>
      {parsing && <LoadingSpinner />}

      {parsed && (
        <div className="import-preview">
          <h4>{t('localData.columnsTitle')}</h4>
          <p className="import-hint">
            {t('admin.totalRows', { total: parsed.totalRows })} · {t('localData.validRows', { count: parsed.rows.length })}
          </p>
          <div className="local-data-columns">
            {parsed.columns.map((c) => (
              <label key={c.key} className="checkbox-label">
                <input type="checkbox" checked={selectedKeys.has(c.key)} onChange={() => toggleColumn(c.key)} disabled={busy} />
                {c.label}
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="btn-link" onClick={() => selectAll(true)} disabled={busy}>
              {t('localData.selectAll')}
            </button>
            <button type="button" className="btn-link" onClick={() => selectAll(false)} disabled={busy}>
              {t('localData.selectNone')}
            </button>
          </div>

          {selectedColumns.length > 0 && (
            <div className="import-preview-table-wrap">
              <table className="import-preview-table">
                <thead>
                  <tr>
                    {selectedColumns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, PREVIEW_ROW_COUNT).map((row, i) => (
                    <tr key={i}>
                      {selectedColumns.map((c) => (
                        <td key={c.key}>{row[c.key] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {encoding && encodeProgress && (
            <p className="import-range-hint">
              {t('localData.encodingProgress', {
                rows: encodeProgress.rowsEncoded,
                total: encodeProgress.totalRows,
                count: encodeProgress.chunkCount,
                current: formatBytes(encodeProgress.currentChunkBytes),
              })}
            </p>
          )}

          {plan && (
            <div className="callout">
              <strong>
                {t('localData.encodedSummary', {
                  count: chunks.length,
                  size: formatBytes(plan.meta.totalBytes),
                  docs: plan.docs.length,
                })}
              </strong>
              <ol className="local-data-chunk-list">
                {plan.docs.map((strings, i) => (
                  <li key={i}>
                    {t('localData.docSize', { count: strings.length, size: formatBytes(plan.docSizes[i]) })}
                  </li>
                ))}
              </ol>
              <details>
                <summary>{t('localData.stringsDetail', { count: chunks.length })}</summary>
                <ol className="local-data-chunk-list">
                  {chunks.map((c, i) => (
                    <li key={i}>
                      {t('localData.chunkSize', {
                        length: c.text.length.toLocaleString(),
                        size: formatBytes(c.bytes),
                        rows: c.rowCount.toLocaleString(),
                      })}
                    </li>
                  ))}
                </ol>
              </details>
              <p className="import-range-hint">
                {t('localData.deviceSize', { size: formatBytes(plan.meta.totalBytes) })}
              </p>
            </div>
          )}

          {uploadProgress && (
            <p className="import-range-hint">
              {t('localData.uploadProgress', { done: uploadProgress.done, total: uploadProgress.total })}
            </p>
          )}

          <div className="form-actions">
            <button
              type="button"
              className={chunks ? 'btn-outline' : 'btn-primary'}
              onClick={handleEncode}
              disabled={busy || selectedColumns.length === 0}
            >
              {encoding ? t('localData.encoding') : t('localData.encodeButton')}
            </button>
            <button type="button" className="btn-primary" onClick={handlePublish} disabled={busy || !chunks}>
              {uploadProgress ? t('admin.importing') : t('localData.publishButton')}
            </button>
            <button type="button" className="btn-outline" onClick={reset} disabled={busy}>
              {t('admin.cancel')}
            </button>
          </div>
        </div>
      )}

      {summary && (
        <div className="callout">
          {t('localData.publishSummary', { rows: summary.rowCount, count: summary.stringCount, docs: summary.docCount })}
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
