// Full-screen camera modal that decodes a barcode/QR code from the device's
// rear camera using @zxing/browser and reports the first successful read.
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library';
import { useTranslation } from '../context/LanguageContext';
import { BackIcon } from './icons';

// TRY_HARDER makes zxing's 1D readers also retry each frame rotated 90° —
// without it they only scan horizontal rows, so a barcode held vertically
// (bars running sideways) is never read. Narrowing POSSIBLE_FORMATS to what
// we actually scan offsets the extra per-frame cost of the rotated pass.
const HINTS = new Map([
  [DecodeHintType.TRY_HARDER, true],
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
      BarcodeFormat.QR_CODE,
    ],
  ],
]);

export default function BarcodeScanner({ onDetected, onClose, onManualEntry, manualEntryLabel }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserMultiFormatReader(HINTS);

    reader
      .decodeFromConstraints(
        // Higher resolution than the browser default (often 640x480) keeps thin
        // bars resolvable, which matters most for the rotated pass.
        { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
        videoRef.current,
        (result, err) => {
          if (cancelled || !result) return;
          // NotFoundException fires on every frame with no code in view — not
          // a real error, so it's silently ignored by the callback contract.
          if (err && !(err instanceof NotFoundException)) return;
          onDetected(result.getText());
        }
      )
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch(() => {
        if (!cancelled) setError(t('barcodeScanner.errorCamera'));
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
    // onDetected/t intentionally excluded: this effect starts the camera
    // exactly once per mount and must not be restarted by parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="barcode-scanner-overlay" role="dialog" aria-modal="true" aria-label={t('barcodeScanner.title')}>
      <div className="barcode-scanner-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('barcodeScanner.close')}>
          <BackIcon />
        </button>
        <span>{t('barcodeScanner.title')}</span>
      </div>
      {error ? (
        <div className="barcode-scanner-error">
          <p>{error}</p>
          {onManualEntry && (
            <button type="button" className="barcode-scanner-manual-link" onClick={onManualEntry}>
              {manualEntryLabel || t('barcodeScanner.manualEntry')}
            </button>
          )}
        </div>
      ) : (
        <div className="barcode-scanner-viewport">
          <video ref={videoRef} className="barcode-scanner-video" muted playsInline />
          <div className="barcode-scanner-frame" />
          {onManualEntry && (
            <button type="button" className="barcode-scanner-manual-link" onClick={onManualEntry}>
              {manualEntryLabel || t('barcodeScanner.manualEntry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
