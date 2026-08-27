import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelection } from '../context/SelectionContext';
import { useTranslation } from '../context/LanguageContext';
import { logout } from '../services/authService';
import { defaultDisplayNameFromEmail } from '../services/userService';
import { APP_NAME } from '../appConfig';
import { ItemsIcon, AddIcon, AdminIcon, AccountIcon, LogoutIcon, PromoIcon, BarcodeIcon } from './icons';
import LanguageSwitcher from './LanguageSwitcher';
import LoadingSpinner from './LoadingSpinner';
import { scheduleIdle } from '../utils/idleSchedule';

// Lazy-loaded for the same reason as in ItemFormPage: pulls in @zxing/browser,
// only needed by the minority of visits that tap the bottom-bar scan button.
const BarcodeScanner = lazy(() => import('./BarcodeScanner'));

export default function NavBar() {
  const { profile, isAdmin } = useAuth();
  const { selecting } = useSelection();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const displayName = profile && (profile.displayName || defaultDisplayNameFromEmail(profile.email));

  // NavBar mounts once for the whole authenticated app, so this is the one
  // place to warm the scanner chunk: fetch it at idle time (after the app's
  // own render/data work settles) so tapping "Scan" later resolves from the
  // module cache instead of waiting on a fresh network fetch.
  useEffect(() => scheduleIdle(() => { import('./BarcodeScanner'); }), []);

  function handleBarcodeDetected(code) {
    setScanning(false);
    navigate('/add', { state: { barcode: code } });
  }

  return (
    <>
      <header className="top-bar">
        <span className="navbar-brand">{APP_NAME}</span>
        <div className="top-bar-actions">
          <LanguageSwitcher />
          <button className="icon-btn" onClick={() => logout()} aria-label={t('nav.logout')}>
            <LogoutIcon />
          </button>
        </div>
      </header>

      {!selecting && (
        <>
          <nav className="bottom-nav">
            <NavLink to="/" end className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
              <ItemsIcon />
              <span>{t('nav.items')}</span>
            </NavLink>
            <NavLink to="/promos" className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
              <PromoIcon />
              <span>{t('nav.promos')}</span>
            </NavLink>

            <button
              type="button"
              className="bottom-nav-scan"
              onClick={() => setScanning(true)}
              aria-label={t('nav.scanItem')}
            >
              <BarcodeIcon />
            </button>

            {isAdmin && (
              <NavLink to="/admin" className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
                <AdminIcon />
                <span>{t('nav.admin')}</span>
              </NavLink>
            )}
            <NavLink
              to="/account"
              className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
              title={displayName ?? t('nav.account')}
            >
              <AccountIcon />
              <span>{displayName ?? t('nav.account')}</span>
            </NavLink>
          </nav>

          <NavLink to="/add" className={({ isActive }) => `fab${isActive ? ' active' : ''}`} aria-label={t('nav.addItem')}>
            <AddIcon />
          </NavLink>
        </>
      )}

      {scanning && (
        <Suspense fallback={<LoadingSpinner />}>
          <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setScanning(false)} />
        </Suspense>
      )}
    </>
  );
}
