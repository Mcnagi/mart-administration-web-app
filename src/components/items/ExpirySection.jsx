import { useSelection } from '../../context/SelectionContext';
import { useTranslation } from '../../context/LanguageContext';
import ItemCard from './ItemCard';

export default function ExpirySection({ section, showHeading, selectedIds, onToggleSelect }) {
  const { selecting } = useSelection();
  const { t } = useTranslation();

  return (
    <div className="expiry-section">
      {showHeading && (
        <h3 className={`expiry-section-heading expiry-heading-${section.key}`}>
          {t(`expiryGroups.${section.key}`)} <span className="expiry-section-count">{section.items.length}</span>
        </h3>
      )}
      <div className="item-grid">
        {section.items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            selectable={selecting}
            selected={selectedIds.has(item.id)}
            onToggleSelect={() => onToggleSelect(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
