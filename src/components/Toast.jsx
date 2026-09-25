import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../context/LanguageContext';
import { CloseIcon } from './icons';

// How far the visual viewport is panned down from the top of the layout
// viewport. When the on-screen keyboard opens (iOS Safari, Android Chrome),
// the browser scrolls the visual viewport to keep the focused input visible
// but leaves position:fixed elements anchored to the layout viewport — so a
// fixed toast ends up above the visible area. Adding this offset keeps it
// pinned to what the user can actually see.
function useVisualViewportOffset() {
  const [offset, setOffset] = useState(() => window.visualViewport?.offsetTop ?? 0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => setOffset(vv.offsetTop);
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return offset;
}

// Self-dismissing notification banner. Calls onDismiss once after `duration`
// ms, or immediately if the close button is clicked — the parent owns
// whether the toast is mounted at all, so either path just needs to call the
// same onDismiss. `className` lets a caller layer on a modifier (e.g. to sit
// above another fixed overlay) — see .toast-over-scanner in index.css, used
// by ScanListScanner so the toast isn't hidden behind the full-screen camera
// view (z-index: 100). Portaled to <body> so no transformed/overflow ancestor
// can re-anchor or clip the fixed positioning.
export default function Toast({ message, duration = 5000, onDismiss, className = '' }) {
  const { t } = useTranslation();
  const viewportOffset = useVisualViewportOffset();

  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return createPortal(
    <div
      className={`toast${className ? ` ${className}` : ''}`}
      role="status"
      style={{ '--vv-offset': `${viewportOffset}px` }}
    >
      <span className="toast-message">{message}</span>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label={t('common.close')}>
        <CloseIcon />
      </button>
    </div>,
    document.body,
  );
}
