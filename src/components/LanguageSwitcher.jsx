import { useTranslation } from '../context/LanguageContext';

export default function LanguageSwitcher({ className = '' }) {
  const { language, languages, setLanguage, t } = useTranslation();

  return (
    <select
      className={`lang-select ${className}`.trim()}
      value={language}
      onChange={(e) => setLanguage(e.target.value)}
      aria-label={t('nav.language')}
    >
      {languages.map(({ code, label }) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </select>
  );
}
