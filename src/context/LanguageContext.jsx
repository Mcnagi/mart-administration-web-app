import { createContext, useContext, useEffect, useState } from 'react';
import { getLanguage, setLanguage, subscribe, t, LANGUAGES } from '../i18n/i18n';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getLanguage());

  useEffect(() => subscribe(setLanguageState), []);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = { language, languages: LANGUAGES, setLanguage, t };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useTranslation must be used within a LanguageProvider');
  return ctx;
}
