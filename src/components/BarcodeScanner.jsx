// Full-screen camera modal that decodes a barcode/QR code from the device's
// rear camera using @zxing/browser and reports the first successful read.
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import { useTranslation } from '../context/LanguageContext';
import { BackIcon } from './icons';

export default function BarcodeScanner({ onDetected, onClose }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromConstraints(
        { video: { facingMode: 'environment' } },
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
        <div className="barcode-scanner-error">{error}</div>
      ) : (
        <div className="barcode-scanner-viewport">
          <video ref={videoRef} className="barcode-scanner-video" muted playsInline />
          <div className="barcode-scanner-frame" />
        </div>
      )}
    </div>
  );
}
