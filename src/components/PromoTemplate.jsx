// Presentational promo flyer template. Rendered identically at natural (mm)
// size for print and the full-size builder preview, and shrunk via a scale
// wrapper for library thumbnails — one source of truth for the layout, see
// PromoPrintPage/PromoLibraryPage/PromoBuilderPage.
import { useState } from 'react';
import { APP_NAME } from '../appConfig';

// Real paper dimensions (mm) per slot type — must match the .promo-slot--*
// rules in index.css.
export const PROMO_SLOT_SIZE_MM = {
  full: { width: 210, height: 297 },
  half: { width: 210, height: 148.5 },
  pair: { width: 297, height: 105 },
};

function formatPrice(value) {
  return `$${Number(value).toFixed(2)}`;
}

export default function PromoTemplate({ promo, slot = 'full', scale }) {
  const [logoFailed, setLogoFailed] = useState(false);

  const inner = (
    <div className={`promo-slot promo-slot--${slot}`}>
      <div className="promo-frame">
        <div className="promo-inner">
          <div className="promo-logo">
            {logoFailed ? (
              <span className="promo-logo-text">{APP_NAME}</span>
            ) : (
              <img src="/promo-logo.png" alt={APP_NAME} onError={() => setLogoFailed(true)} />
            )}
          </div>
          <div className="promo-body">
            <div className="promo-text">
              <div className="promo-name-en">{promo.nameEn}</div>
              {promo.nameKo && <div className="promo-name-ko">{promo.nameKo}</div>}
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
