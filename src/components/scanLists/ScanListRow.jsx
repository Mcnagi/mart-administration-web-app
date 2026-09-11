import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../context/LanguageContext';
import { exportScanListToExcel } from '../../services/scanListService';

export default function ScanListRow({ scanList, onDelete }) {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const itemCount = scanList.items?.length ?? 0;
  const savedAt = scanList.createdAt?.toDate?.() ?? null;

  return (
    <li className="user-row">
      <div className="user-row-info">
        <span className="user-email">{scanList.name}</span>
        {scanList.tagLabel && <span className="badge badge-none">{scanList.tagLabel}</span>}
        <span className="badge badge-none">{t('scanLists.itemCount', { count: itemCount })}</span>
        {savedAt && <span className="badge badge-none">{savedAt.toLocaleDateString(language)}</span>}
      </div>
      <div className="user-row-actions">
        <button type="button" className="btn-link" onClick={() => navigate(`/scan-lists/${scanList.id}/edit`)}>
          {t('scanLists.open')}
        </button>
        <button type="button" className="btn-link" onClick={() => exportScanListToExcel(scanList)}>
          {t('scanLists.export')}
        </button>
        <button type="button" className="btn-link btn-link-danger" onClick={() => onDelete(scanList)}>
          {t('scanLists.delete')}
        </button>
      </div>
    </li>
  );
}
