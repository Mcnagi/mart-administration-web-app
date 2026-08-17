import { Link } from 'react-router-dom';
import PromoTemplate from '../PromoTemplate';

export default function PromoLibraryGrid({ promos, selectMode, selectedIds, onToggleSelect }) {
  return (
    <div className="promo-library-grid">
      {promos.map((promo) => {
        const selected = selectedIds.has(promo.id);
        const thumb = (
          <>
            <PromoTemplate promo={promo} slot="full" scale={0.18} />
            <div className="promo-library-card-name">{promo.nameEn}</div>
          </>
        );
        if (selectMode) {
          return (
            <button
              key={promo.id}
              type="button"
              className={`promo-library-card${selected ? ' selected' : ''}`}
              onClick={() => onToggleSelect(promo.id)}
              aria-pressed={selected}
            >
              {thumb}
            </button>
          );
        }
        return (
          <Link key={promo.id} to={`/promos/${promo.id}/edit`} className="promo-library-card">
            {thumb}
          </Link>
        );
      })}
    </div>
  );
}
