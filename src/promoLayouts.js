// Paper-size/layout choices a single promo can be designed for and printed
// as — shared between the promo builder (where a promo picks its own
// default) and the library's print picker (which seeds itself from that
// default but can override it for one print run). 'pair' (two promos
// sharing one A4 landscape sheet) is a print-time-only combination of two
// promos, not a single promo's own attribute, so it isn't listed here — see
// PromoPrintPage's own LAYOUTS map.
export const PROMO_LAYOUT_OPTIONS = [
  { value: 'full', labelKey: 'promos.printFull' },
  { value: 'half', labelKey: 'promos.printHalf' },
  { value: 'fullLandscape', labelKey: 'promos.printFullLandscape' },
  { value: 'halfLandscape', labelKey: 'promos.printHalfLandscape' },
  { value: 'a5Landscape', labelKey: 'promos.printA5Landscape' },
];

export const PROMO_LAYOUT_VALUES = PROMO_LAYOUT_OPTIONS.map((option) => option.value);

export const DEFAULT_PROMO_LAYOUT = 'full';

// A promo's saved `layout` isn't always a valid PromoTemplate `slot` name —
// 'halfLandscape' shares its dimensions with the 'pair' (2-per-sheet) slot
// (see PROMO_SLOT_SIZE_MM in components/PromoTemplate.jsx, which has no
// 'halfLandscape' key of its own) rather than getting a distinct one, the
// same way PromoPrintPage's own LAYOUTS map translates it for print output.
// Anything rendering a promo by its own saved layout — the builder preview,
// library thumbnails — needs this same translation, not just PROMO_LAYOUT_VALUES.
export function promoLayoutToSlot(layout) {
  if (layout === 'halfLandscape') return 'pair';
  return PROMO_LAYOUT_VALUES.includes(layout) ? layout : DEFAULT_PROMO_LAYOUT;
}
