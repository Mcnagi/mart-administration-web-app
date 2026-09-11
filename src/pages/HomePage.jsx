import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { ItemsIcon, PromoIcon, ScanListIcon, AdminIcon, AccountIcon } from '../components/icons';

export default function HomePage() {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();

  const tiles = [
    { to: '/items', label: t('nav.items'), Icon: ItemsIcon },
    { to: '/promos', label: t('nav.promos'), Icon: PromoIcon },
    { to: '/scan-lists', label: t('nav.scanLists'), Icon: ScanListIcon },
    ...(isAdmin ? [{ to: '/admin', label: t('nav.admin'), Icon: AdminIcon }] : []),
    { to: '/account', label: t('nav.account'), Icon: AccountIcon },
  ];

  return (
    <div className="page home-page">
      <div className="home-grid">
        {tiles.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="home-tile">
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
