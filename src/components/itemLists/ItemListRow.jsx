import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../context/LanguageContext';
import { exportItemListToExcel } from '../../services/itemListService';

export default function ItemListRow({ itemList, selecting, selected, onToggleSelect, onDuplicate, onDelete }) {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const itemCount = itemList.items?.length ?? 0;
  const savedAt = itemList.createdAt?.toDate?.() ?? null;

  return (
    <li className={`user-row${selected ? ' selected' : ''}`}>
      <div className="user-row-info">
        {selecting && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(itemList.id)}
            aria-label={t('itemLists.selectRow', { name: itemList.name })}
          />
        )}
        <span className="user-email">{itemList.name}</span>
        {itemList.tagLabel && <span className="badge badge-none">{itemList.tagLabel}</span>}
        <span className="badge badge-none">{t('itemLists.itemCount', { count: itemCount })}</span>
        {savedAt && <span className="badge badge-none">{savedAt.toLocaleDateString(language)}</span>}
      </div>
      <div className="user-row-actions">
        <button type="button" className="btn-link" onClick={() => navigate(`/item-lists/${itemList.id}/edit`)}>
          {t('itemLists.open')}
        </button>
        <button type="button" className="btn-link" onClick={() => exportItemListToExcel(itemList)}>
          {t('itemLists.export')}
        </button>
        <button type="button" className="btn-link" onClick={() => onDuplicate(itemList)}>
          {t('itemLists.duplicate')}
        </button>
        <button type="button" className="btn-link btn-link-danger" onClick={() => onDelete(itemList)}>
          {t('itemLists.delete')}
        </button>
      </div>
    </li>
  );
}
