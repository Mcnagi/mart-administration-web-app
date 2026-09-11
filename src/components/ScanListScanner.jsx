// Full-screen scanner for building a scan list: unlike NavBar's scan-FAB
// flow (one scan -> close -> navigate to /add), this stays open across many
// scans, adding/incrementing a row each time without closing.
import { useRef, useState } from 'react';
import BarcodeScanner from './BarcodeScanner';
import Toast from './Toast';
import { useTranslation } from '../context/LanguageContext';
import { addScannedBarcode, resolveScannedItemInfo } from '../services/scanListService';

// Ignores a re-detection of the same still-in-frame barcode for this long —
// zxing's callback can refire on every frame while a code stays visible,
// which would otherwise increment quantity many times for one physical scan.
const RESCAN_COOLDOWN_MS = 1500;

export default function ScanListScanner({ items, onItemAdded, onClose }) {
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

    // A barcode with no match in our own imported data collection isn't
    // added — see resolveScannedItemInfo — so the row (and its toast) only
    // ever shows a real resolved name, never the barcode as a placeholder.
    const info = await resolveScannedItemInfo(barcode).catch(() => null);
    if (!info?.name) {
      setToast(t('scanLists.itemNotFound', { barcode }));
      return;
    }
    const nextItems = addScannedBarcode(itemsRef.current, barcode, info);
    itemsRef.current = nextItems;
    onItemAdded(nextItems);
    const added = nextItems.find((item) => item.barcode === barcode);
    setToast(t('scanLists.itemAdded', { name: added.name, qty: added.quantity }));
  }

  return (
    <>
      <BarcodeScanner
        onDetected={handleDetected}
        onClose={onClose}
        onManualEntry={onClose}
        manualEntryLabel={t('scanLists.backToList')}
      />
      {toast && (
        <Toast message={toast} duration={2000} onDismiss={() => setToast('')} className="toast-over-scanner" />
      )}
    </>
  );
}
