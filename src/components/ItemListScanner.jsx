// Full-screen scanner for building an item list: unlike NavBar's scan-FAB
// flow (one scan -> close -> navigate to /add), this stays open across many
// scans, adding/incrementing a row each time without closing.
import { useRef, useState } from 'react';
import BarcodeScanner from './BarcodeScanner';
import Toast from './Toast';
import { useTranslation } from '../context/LanguageContext';
import {
  addScannedBarcode,
  removeScannedBarcode,
  resolveScannedBarcode,
  findItemListItem,
  itemListItemName,
} from '../services/itemListService';

// Ignores a re-detection of the same still-in-frame barcode for this long —
// zxing's callback can refire on every frame while a code stays visible,
// which would otherwise increment quantity many times for one physical scan.
const RESCAN_COOLDOWN_MS = 1500;

export default function ItemListScanner({ items, deleteMode = false, onItemAdded, onClose }) {
  const { t } = useTranslation();
  const [toast, setToast] = useState('');
  // Mirrors the `items` prop so the scanner's onDetected callback (captured
  // once by BarcodeScanner's mount-only effect) always reads the latest
  // list, even though its own closure is never refreshed after mount.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const lastScan = useRef({ barcode: null, at: 0 });

  async function handleDetected(barcode) {
    const now = Date.now();
    if (lastScan.current.barcode === barcode && now - lastScan.current.at < RESCAN_COOLDOWN_MS) {
      return;
    }
    lastScan.current = { barcode, at: now };

    // Every scan is checked against the local-data copy — for the name in
    // the toast, and (when adding) to only ever add a barcode it has.
    const match = await resolveScannedBarcode(barcode).catch(() => ({ status: 'notFound' }));
    const name = match.status === 'found' ? itemListItemName(match.row, barcode) : barcode;

    // Delete mode: drop the barcode's row if it's on the list, otherwise do
    // nothing.
    if (deleteMode) {
      const removed = findItemListItem(itemsRef.current, barcode);
      if (!removed) return;
      const nextItems = removeScannedBarcode(itemsRef.current, removed.barcode);
      itemsRef.current = nextItems;
      onItemAdded(nextItems);
      setToast(t('itemLists.itemRemoved', { name }));
      return;
    }

    if (match.status === 'noLocalData') {
      setToast(t('itemLists.noLocalData'));
      return;
    }
    if (match.status !== 'found') {
      setToast(t('itemLists.itemNotFound', { barcode }));
      return;
    }
    const nextItems = addScannedBarcode(itemsRef.current, match.barcode);
    itemsRef.current = nextItems;
    onItemAdded(nextItems);
    const added = nextItems.find((item) => item.barcode === match.barcode);
    setToast(t('itemLists.itemAdded', { name, qty: added.quantity }));
  }

  return (
    <>
      <BarcodeScanner
        onDetected={handleDetected}
        onClose={onClose}
        onManualEntry={onClose}
        manualEntryLabel={t('itemLists.backToList')}
        title={deleteMode ? t('itemLists.deleteModeScannerTitle') : undefined}
        className={deleteMode ? 'delete-mode' : ''}
      />
      {toast && (
        <Toast
          message={toast}
          duration={2000}
          onDismiss={() => setToast('')}
          className={`toast-over-scanner${deleteMode ? ' toast-danger' : ''}`}
        />
      )}
    </>
  );
}
