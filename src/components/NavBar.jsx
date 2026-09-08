import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelection } from '../context/SelectionContext';
import { useTranslation } from '../context/LanguageContext';
import { logout } from '../services/authService';
import { APP_NAME } from '../appConfig';
import { ItemsIcon, AdminIcon, AccountIcon, LogoutIcon, PromoIcon, BarcodeIcon, MenuIcon } from './icons';
import LanguageSwitcher from './LanguageSwitcher';
import LoadingSpinner from './LoadingSpinner';
import { StickyTop, StickyBottom } from './StickyBar';
import { scheduleIdle } from '../utils/idleSchedule';

// Lazy-loaded for the same reason as in ItemFormPage: pulls in @zxing/browser,
// only needed by the minority of visits that tap the scan FAB.
const BarcodeScanner = lazy(() => import('./BarcodeScanner'));

export default function NavBar() {
  const { isAdmin } = useAuth();
  const { selecting } = useSelection();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // At the very top of the page the menu button renders inline in the
  // (non-sticky) header, same as a normal nav item. Past a few pixels of
  // scroll — once the header itself is on its way off-screen — it instead
  // renders as its own fixed StickyTop, so it keeps floating over the
  // content long after the header has scrolled away.
  const [detached, setDetached] = useState(false);

  useEffect(() => {
    function onScroll() {
      setDetached(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // NavBar mounts once for the whole authenticated app, so this is the one
  // place to warm the scanner chunk: fetch it at idle time (after the app's
  // own render/data work settles) so tapping "Scan" later resolves from the
  // module cache instead of waiting on a fresh network fetch.
  useEffect(() => scheduleIdle(() => { import('./BarcodeScanner'); }), []);

  // Escape closes the menu from the keyboard, same as clicking the backdrop.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  function handleBarcodeDetected(code) {
    setScanning(false);
    navigate('/add', { state: { barcode: code } });
  }

  function handleManualEntry() {
    setScanning(false);
    navigate('/add');
  }

  const navLinkClass = ({ isActive }) => `nav-menu-item${isActive ? ' active' : ''}`;

  const menuToggleButton = (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setMenuOpen((o) => !o)}
      aria-label={t('nav.menu')}
      aria-expanded={menuOpen}
    >
      <MenuIcon />
    </button>
  );

  return (
    <>
      <header className="top-bar">
        <div className="top-bar-left">
          {!detached && menuToggleButton}
          <span className="navbar-brand">{APP_NAME}</span>
        </div>
        <div className="top-bar-actions">
          <LanguageSwitcher />
          <button className="icon-btn" onClick={() => logout()} aria-label={t('nav.logout')}>
            <LogoutIcon />
          </button>
        </div>
      </header>

      {/* Rendered outside .top-bar once detached, so it's fixed to the
          viewport rather than to the header (which has backdrop-filter, and
          so would otherwise become the containing block for a fixed child)
          — see .menu-toggle-wrap. */}
      {detached && (
        <StickyTop align="left" className="menu-toggle-wrap">
          {menuToggleButton}
        </StickyTop>
      )}

      {menuOpen && (
        <>
          <button
            type="button"
            className="nav-menu-backdrop"
            onClick={() => setMenuOpen(false)}
            aria-label={t('nav.menu')}
          />
          <StickyTop align="left" className="nav-menu-panel">
            <div className="nav-menu-header">{t('nav.menu')}</div>
            <NavLink to="/" end className={navLinkClass} onClick={() => setMenuOpen(false)}>
              <ItemsIcon />
              <span>{t('nav.items')}</span>
            </NavLink>
            <NavLink to="/promos" className={navLinkClass} onClick={() => setMenuOpen(false)}>
              <PromoIcon />
              <span>{t('nav.promos')}</span>
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={navLinkClass} onClick={() => setMenuOpen(false)}>
                <AdminIcon />
                <span>{t('nav.admin')}</span>
              </NavLink>
            )}
            <NavLink to="/account" className={navLinkClass} onClick={() => setMenuOpen(false)}>
              <AccountIcon />
              <span>{t('nav.account')}</span>
            </NavLink>
          </StickyTop>
        </>
      )}

      {!selecting && (
        <StickyBottom align="right">
          <button
            type="button"
            className="scan-fab"
            onClick={() => setScanning(true)}
            aria-label={t('nav.scanItem')}
          >
            <BarcodeIcon />
          </button>
        </StickyBottom>
      )}

      {scanning && (
        <Suspense fallback={<LoadingSpinner />}>
          <BarcodeScanner
            onDetected={handleBarcodeDetected}
            onClose={() => setScanning(false)}
            onManualEntry={handleManualEntry}
          />
        </Suspense>
      )}
    </>
  );
}
