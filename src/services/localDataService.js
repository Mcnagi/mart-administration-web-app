// Business logic for the local-data page (pages/LocalDataPage.jsx): admins
// publish a column-filtered snapshot of an imported spreadsheet as an array
// of long strings in Firestore, and any user downloads, decodes and keeps it
// in IndexedDB for on-device lookups. Views should call only this file,
// never api/localDataApi.js directly.
import * as localDataApi from '../api/localDataApi';
import { t } from '../i18n/i18n';
import { encodeRowsToChunks, decodeChunks, packStringsIntoDocs, utf8ByteLength } from '../utils/localDataEncoding';
import {
  saveLocalData,
  loadLocalData,
  clearLocalData as clearLocalDataStore,
  requestPersistentStorage,
} from '../utils/localDataStore';

// Parsing is identical to the admin data import — same header mapping,
// encoding fixes, barcode dedupe and IncoCode -> companyName lookup.
export { parseExcelFile } from './dataService';

// `columns` is the admin's selection ({ key, label } from parseExcelFile).
export function encodeRows(rows, columns, onProgress) {
  return encodeRowsToChunks(
    rows,
    columns.map((c) => c.key),
    { onProgress },
  );
}

function buildMeta(chunks, columns) {
  return {
    columns: columns.map(({ key, label }) => ({ key, label: String(label) })),
    rowCount: chunks.reduce((sum, c) => sum + c.rowCount, 0),
    stringCount: chunks.length,
    totalBytes: chunks.reduce((sum, c) => sum + c.bytes, 0),
    totalChars: chunks.reduce((sum, c) => sum + c.text.length, 0),
  };
}

// How the encoded strings will be laid out in Firestore and what they'll
// cost on a user's device, so the admin can see it before publishing. The
// decoded copy on a device holds the same values as the encoded strings, so
// their total size is a close estimate of it.
export function planPublish(chunks, columns) {
  const meta = buildMeta(chunks, columns);
  // Generous allowance for the non-string meta fields and their names.
  const firstDocOverheadBytes = utf8ByteLength(JSON.stringify(meta)) + 1024;
  const docs = packStringsIntoDocs(chunks, { firstDocOverheadBytes });
  return { meta, docs, docSizes: docs.map((strings) => strings.reduce((sum, s) => sum + utf8ByteLength(s) + 1, 0)) };
}

// Uploads the planned docs as a new version, then removes the previous
// version's overflow docs. A failed cleanup only leaves orphaned docs
// behind — the new snapshot is already live — so it's logged, not thrown.
export async function publishChunks(chunks, columns, onProgress) {
  const { meta, docs } = planPublish(chunks, columns);
  const previous = await localDataApi.getMeta();
  const version = Date.now();
  await localDataApi.publishDocs(version, docs, meta, onProgress);
  if (previous?.version && previous.version !== version) {
    try {
      await localDataApi.deleteOverflowDocs(previous.version, previous.docCount ?? 1);
    } catch (err) {
      console.error('[local data] failed to delete previous overflow docs', err);
    }
  }
  return { version, docCount: docs.length, stringCount: chunks.length, rowCount: meta.rowCount };
}

// Metadata only — the first doc's `strings` are dropped so the page doesn't
// hold up to ~1 MB of text in state just to display the status line.
export async function fetchRemoteMeta() {
  const meta = await localDataApi.getMeta();
  if (!meta) return null;
  const { strings: _strings, ...rest } = meta;
  return rest;
}

// Downloads every string of the current snapshot, decodes it back into rows
// and stores it in IndexedDB, replacing any earlier copy. `sizeBytes` is
// the encoded snapshot's size, kept for display — close to what the decoded
// copy takes on disk.
export async function downloadToLocal() {
  const meta = await localDataApi.getMeta();
  if (!meta) throw new Error(t('errors.localDataNotPublished'));
  const strings = await localDataApi.getAllStrings(meta);
  const data = {
    version: meta.version,
    columns: meta.columns,
    rows: decodeChunks(strings),
    sizeBytes: meta.totalBytes ?? 0,
    downloadedAt: Date.now(),
  };
  await requestPersistentStorage();
  try {
    await saveLocalData(data);
  } catch (err) {
    console.error('[local data] failed to save to IndexedDB', err);
    throw new Error(t('errors.localDataQuota'));
  }
  barcodeIndexPromise = null;
  return data;
}

export async function clearLocalData() {
  await clearLocalDataStore();
  barcodeIndexPromise = null;
}

export { loadLocalData };

// Barcode -> row lookup over the on-device copy, built once from IndexedDB
// and reused until the copy is re-downloaded or cleared (both reset it
// above). Resolves to null when there's no copy, or the copy was published
// without the barcode column — callers then fall back to Firestore (see
// services/productLookupService.js).
let barcodeIndexPromise = null;

async function buildBarcodeIndex() {
  const data = await loadLocalData();
  if (!data?.rows) return null;
  const keys = data.columns.map((c) => c.key);
  const barcodeIndex = keys.indexOf('barcode');
  if (barcodeIndex === -1) return null;
  const rowsByBarcode = new Map();
  data.rows.forEach((values) => rowsByBarcode.set(String(values[barcodeIndex]).trim(), values));
  return { keys, rowsByBarcode };
}

export function getLocalBarcodeIndex() {
  if (!barcodeIndexPromise) {
    barcodeIndexPromise = buildBarcodeIndex().catch((err) => {
      console.error('[local data] failed to build barcode index', err);
      barcodeIndexPromise = null;
      return null;
    });
  }
  return barcodeIndexPromise;
}

// The row for `barcode` as an object keyed like a `data` collection doc
// (product, product2, salePrice, ...), or null when it isn't in the copy.
export function findLocalRow(index, barcode) {
  const values = index.rowsByBarcode.get(barcode);
  return values ? Object.fromEntries(index.keys.map((key, i) => [key, values[i]])) : null;
}
