import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelection } from '../context/SelectionContext';
import { useTranslation } from '../context/LanguageContext';
import { logout } from '../services/authService';
import { defaultDisplayNameFromEmail } from '../services/userService';
import { APP_NAME } from '../appConfig';
import { ItemsIcon, AddIcon, AdminIcon, AccountIcon, LogoutIcon, PromoIcon } from './icons';
import LanguageSwitcher from './LanguageSwitcher';

export default function NavBar() {
  const { profile, isAdmin } = useAuth();
  const { selecting } = useSelection();
  const { t } = useTranslation();
  const displayName = profile && (profile.displayName || defaultDisplayNameFromEmail(profile.email));

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
    </>
  );
}
