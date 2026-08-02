import { daysUntilExpiry, expiryBucket } from '../services/itemService';
import { useTranslation } from '../context/LanguageContext';

export default function ExpiryBadge({ expiryDate }) {
  const { t } = useTranslation();
  const bucket = expiryBucket(expiryDate);
  const days = daysUntilExpiry(expiryDate);

  if (bucket === 'none') {
    return <span className="badge badge-none">{t('expiryBadge.noExpirySet')}</span>;
  }
  if (bucket === 'expired') {
    return <span className="badge badge-expired">{t('expiryBadge.expiredAgo', { days: Math.abs(days) })}</span>;
  }
  if (days === 0) {
    return <span className="badge badge-week">{t('expiryBadge.expiresToday')}</span>;
  }
  if (bucket === 'week') {
    return <span className="badge badge-week">{t('expiryBadge.daysLeft', { days })}</span>;
  }
  if (bucket === 'month') {
    return <span className="badge badge-month">{t('expiryBadge.daysLeft', { days })}</span>;
  }
  return <span className="badge badge-longer">{t('expiryBadge.daysLeft', { days })}</span>;
}
