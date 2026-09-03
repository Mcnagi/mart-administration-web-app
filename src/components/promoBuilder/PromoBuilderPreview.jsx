import { useEffect, useRef } from 'react';
import { useTranslation } from '../../context/LanguageContext';
import PromoTemplate from '../PromoTemplate';
import { promoLayoutToSlot } from '../../promoLayouts';

const PREVIEW_SCALE = 0.45;
// CSS mm-to-px at the standard 96dpi reference (1in = 25.4mm) — used to
// convert an on-screen pointer-drag distance (px, at PREVIEW_SCALE) back
// into the mm offset PromoTemplate expects.
const CSS_PX_PER_MM = 96 / 25.4;

// Drags the rendered .promo-text block around within the (already scaled)
// preview and reports the new offset in mm. Implemented by attaching
// pointer listeners directly to the live DOM node (found via a ref) rather
// than teaching PromoTemplate about dragging — it stays a plain
// presentational component shared with the read-only print/library views.
export default function PromoBuilderPreview({ promo, onTextOffsetChange, onResetPosition }) {
  const { t } = useTranslation();
  const frameRef = useRef(null);
  const promoRef = useRef(promo);
  promoRef.current = promo;
  const onTextOffsetChangeRef = useRef(onTextOffsetChange);
  onTextOffsetChangeRef.current = onTextOffsetChange;

  useEffect(() => {
    const frame = frameRef.current;
    const textEl = frame?.querySelector('.promo-text');
    if (!textEl) return;

    let dragging = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;
    const mmPerScreenPx = 1 / (PREVIEW_SCALE * CSS_PX_PER_MM);

    function onPointerDown(e) {
      dragging = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      baseX = promoRef.current.textOffsetX || 0;
      baseY = promoRef.current.textOffsetY || 0;
      textEl.setPointerCapture(pointerId);
      e.preventDefault();
    }
    function onPointerMove(e) {
      if (!dragging) return;
      const nextX = baseX + (e.clientX - startX) * mmPerScreenPx;
      const nextY = baseY + (e.clientY - startY) * mmPerScreenPx;
      onTextOffsetChangeRef.current(nextX, nextY);
    }
    function onPointerUp() {
      if (!dragging) return;
      dragging = false;
      try {
        textEl.releasePointerCapture(pointerId);
      } catch {
        // Capture may already be gone (e.g. pointercancel) — nothing to do.
      }
    }

    textEl.addEventListener('pointerdown', onPointerDown);
    textEl.addEventListener('pointermove', onPointerMove);
    textEl.addEventListener('pointerup', onPointerUp);
    textEl.addEventListener('pointercancel', onPointerUp);
    return () => {
      textEl.removeEventListener('pointerdown', onPointerDown);
      textEl.removeEventListener('pointermove', onPointerMove);
      textEl.removeEventListener('pointerup', onPointerUp);
      textEl.removeEventListener('pointercancel', onPointerUp);
    };
    // Runs once: the .promo-text DOM node stays the same element across
    // re-renders (same position in the tree), so listeners don't need to be
    // torn down and reattached on every drag-driven prop change — that
    // would drop the in-progress drag's local `dragging` state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slot = promoLayoutToSlot(promo.layout);
  const hasOffset = (promo.textOffsetX || 0) !== 0 || (promo.textOffsetY || 0) !== 0;

  return (
    <div className="promo-builder-preview">
      <div className="promo-builder-preview-frame" ref={frameRef}>
        <PromoTemplate promo={promo} slot={slot} scale={PREVIEW_SCALE} />
      </div>
      <div className="promo-builder-preview-actions">
        <span className="promo-builder-preview-hint">{t('promos.dragTextHint')}</span>
        {hasOffset && (
          <button type="button" className="btn-outline btn-small" onClick={onResetPosition}>
            {t('promos.resetTextPosition')}
          </button>
        )}
      </div>
    </div>
  );
}
