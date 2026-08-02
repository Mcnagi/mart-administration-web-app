import { useTranslation } from '../context/LanguageContext';

export default function LoadingSpinner() {
  const { t } = useTranslation();
  return (
    <div className="loading-spinner" role="status" aria-label={t('common.loading')}>
      <div className="spinner" />
    </div>
  );
}
