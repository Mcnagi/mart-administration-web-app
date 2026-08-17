import PromoTemplate from '../PromoTemplate';

export default function PromoBuilderPreview({ promo }) {
  return (
    <div className="promo-builder-preview">
      <div className="promo-builder-preview-frame">
        <PromoTemplate promo={promo} slot="full" scale={0.45} />
      </div>
    </div>
  );
}
