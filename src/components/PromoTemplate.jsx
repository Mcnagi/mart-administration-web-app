// Presentational promo flyer template. Rendered identically at natural (mm)
// size for print and the full-size builder preview, and shrunk via a scale
// wrapper for library thumbnails — one source of truth for the layout, see
// PromoPrintPage/PromoLibraryPage/PromoBuilderPage.
import { useState } from 'react';
import { APP_NAME } from '../appConfig';

// Real paper dimensions (mm) per slot type — must match the .promo-slot--*
// rules in index.css.
export const PROMO_SLOT_SIZE_MM = {
  full: { width: 210, height: 297 }, // A4 portrait, whole sheet
  half: { width: 210, height: 148.5 }, // A4 portrait, top half of the sheet
  fullLandscape: { width: 297, height: 210 }, // A4 landscape, whole sheet
  pair: { width: 297, height: 105 }, // A4 landscape, top half (or one of two stacked halves)
  a5Landscape: { width: 210, height: 148 }, // A5 landscape, whole sheet
};

function formatPrice(value) {
  return `$${Number(value).toFixed(2)}`;
}

export default function PromoTemplate({ promo, slot = 'full', scale }) {
  const [logoFailed, setLogoFailed] = useState(false);

  // Drag offset and font scale are per-promo styling knobs (set in the
  // builder — see PromoBuilderPreview for the drag interaction itself,
  // which this component stays agnostic of since it's also used read-only
  // in print/library views), not layout props, so they travel on the promo
  // object like nameEn/photoBase64 do.
  const offsetX = promo.textOffsetX || 0;
  const offsetY = promo.textOffsetY || 0;
  const fontScale = promo.fontScale || 1;
  const nameWrapStyle = promo.nameNoWrap
    ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
    : undefined;

  const inner = (
    <div className={`promo-slot promo-slot--${slot}`} style={{ '--promo-font-scale': fontScale }}>
      <div className="promo-frame">
        {/* Sibling of promo-inner (not nested in it) so it isn't clipped by
            promo-inner's own overflow — it needs to render outside that box,
            overlapping the frame's red border. */}
        <div className="promo-logo">
          {logoFailed ? (
            <span className="promo-logo-text">{APP_NAME}</span>
          ) : (
            <img src="/promo-logo.png" alt={APP_NAME} onError={() => setLogoFailed(true)} />
          )}
        </div>
        <div className="promo-inner">
          <div className="promo-body">
            <div className="promo-text" style={{ transform: `translate(${offsetX}mm, ${offsetY}mm)` }}>
              <div className="promo-name-en" style={nameWrapStyle}>
                {promo.nameEn}
              </div>
              {promo.nameKo && (
                <div className="promo-name-ko" style={nameWrapStyle}>
                  {promo.nameKo}
                </div>
              )}
              {promo.originalPrice !== null && promo.originalPrice !== undefined && (
                <div className="promo-price-original">{formatPrice(promo.originalPrice)}</div>
              )}
              {(promo.discountPercent !== null && promo.discountPercent !== undefined) ||
              (promo.finalPrice !== null && promo.finalPrice !== undefined) ? (
                <div className="promo-price-highlight">
                  {promo.discountPercent !== null && promo.discountPercent !== undefined && (
                    <div className="promo-discount-percent">{promo.discountPercent}% OFF</div>
                  )}
                  {promo.finalPrice !== null && promo.finalPrice !== undefined && (
                    <div className="promo-price-final">{formatPrice(promo.finalPrice)}</div>
                  )}
                </div>
              ) : null}
            </div>
            <div className="promo-photo">
              {promo.photoBase64 ? (
                <img src={promo.photoBase64} alt={promo.nameEn} />
              ) : (
                <div className="promo-photo-placeholder" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!scale) return inner;

  const { width, height } = PROMO_SLOT_SIZE_MM[slot];
  return (
    <div className="promo-thumb" style={{ width: `${width * scale}mm`, height: `${height * scale}mm` }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{inner}</div>
    </div>
  );
}
