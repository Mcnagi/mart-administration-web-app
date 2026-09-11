import { useEffect } from 'react';
import { useTranslation } from '../context/LanguageContext';
import { CloseIcon } from './icons';

// Self-dismissing notification banner. Calls onDismiss once after `duration`
// ms, or immediately if the close button is clicked — the parent owns
// whether the toast is mounted at all, so either path just needs to call the
// same onDismiss. `className` lets a caller layer on a modifier (e.g. to sit
// above another fixed overlay) — see .toast-over-scanner in index.css, used
// by ScanListScanner so the toast isn't hidden behind the full-screen camera
// view (z-index: 100).
export default function Toast({ message, duration = 5000, onDismiss, className = '' }) {
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div className={`toast${className ? ` ${className}` : ''}`} role="status">
      <span className="toast-message">{message}</span>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label={t('common.close')}>
        <CloseIcon />
      </button>
    </div>
  );
}
