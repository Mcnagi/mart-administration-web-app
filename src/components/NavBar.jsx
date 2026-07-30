import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { logout } from '../services/authService';

export default function NavBar() {
  const { profile, isAdmin } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-top">
        <span className="navbar-brand">eMart</span>
        <button className="btn-link" onClick={() => logout()}>
          Log out
        </button>
      </div>
      <div className="navbar-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Items
        </NavLink>
        <NavLink to="/add" className={({ isActive }) => (isActive ? 'active' : '')}>
          Add
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
            Admin
          </NavLink>
        )}
        <NavLink to="/account" className={({ isActive }) => (isActive ? 'active' : '')}>
          {profile?.email ?? 'Account'}
        </NavLink>
      </div>
    </nav>
  );
}
