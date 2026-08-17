import { useTranslation } from '../../context/LanguageContext';

export default function UserRow({ user, disableRevoke, onToggleAdmin, onToggleDisabled, onRevoke }) {
  const { t } = useTranslation();

  return (
    <li className="user-row">
      <div className="user-row-info">
        <span className="user-email">{user.email}</span>
        <span className={`badge ${user.role === 'admin' ? 'badge-ok' : 'badge-none'}`}>
          {user.role === 'admin' ? t('admin.adminBadge') : t('admin.userBadge')}
        </span>
        {user.branch && <span className="badge badge-none">{user.branch}</span>}
        {user.disabled && <span className="badge badge-expired">{t('admin.disabledBadge')}</span>}
      </div>
      <div className="user-row-actions">
        <button className="btn-link" onClick={() => onToggleAdmin(user)}>
          {user.role === 'admin' ? t('admin.demote') : t('admin.makeAdmin')}
        </button>
        <button className="btn-link" onClick={() => onToggleDisabled(user)}>
          {user.disabled ? t('admin.enable') : t('admin.disable')}
        </button>
        <button className="btn-link btn-link-danger" onClick={() => onRevoke(user)} disabled={disableRevoke}>
          {t('admin.delete')}
        </button>
      </div>
    </li>
  );
}
