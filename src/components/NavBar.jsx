import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { logout } from '../services/authService';
import { defaultDisplayNameFromEmail } from '../services/userService';
import { APP_NAME } from '../appConfig';
import { ItemsIcon, AddIcon, AdminIcon, AccountIcon, LogoutIcon } from './icons';

export default function NavBar() {
  const { profile, isAdmin } = useAuth();
  const displayName = profile && (profile.displayName || defaultDisplayNameFromEmail(profile.email));

  return (
    <>
      <header className="top-bar">
        <span className="navbar-brand">{APP_NAME}</span>
        <button className="icon-btn" onClick={() => logout()} aria-label="Log out">
          <LogoutIcon />
        </button>
      </header>

      <nav className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
          <ItemsIcon />
          <span>Items</span>
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin" className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
            <AdminIcon />
            <span>Admin</span>
          </NavLink>
        )}
        <NavLink
          to="/account"
          className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          title={displayName ?? 'Account'}
        >
          <AccountIcon />
          <span>{displayName ?? 'Account'}</span>
        </NavLink>
      </nav>

      <NavLink to="/add" className={({ isActive }) => `fab${isActive ? ' active' : ''}`} aria-label="Add item">
        <AddIcon />
      </NavLink>
    </>
  );
}
