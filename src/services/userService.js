// Business logic for admin user management: creating accounts, revoking
// access ("delete"), and managing the admin group. Views should call only
// this file, never api/usersApi.js or api/authApi.js directly.
import * as authApi from '../api/authApi';
import * as usersApi from '../api/usersApi';
import { TEMP_PASSWORD, BRANCHES } from '../appConfig';
import { t } from '../i18n/i18n';

export function listUsers() {
  return usersApi.listUserProfiles();
}

// Used both as the initial value when an admin creates an account and as a
// display-time fallback for profiles that predate the displayName field
// (e.g. a first admin bootstrapped by hand per the README).
export function defaultDisplayNameFromEmail(email) {
  return (email || '').split('@')[0];
}

function randomTempPassword() {
  // Shown once to the admin to hand off to the new user; the user should
  // change it after first login (see authService.changePassword). A fixed
  // value can be set via VITE_TEMP_PASSWORD instead of a random one per user.
  if (TEMP_PASSWORD) return TEMP_PASSWORD;
  return Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
}

// Creates both the Auth account and the Firestore profile for a new user.
// Uses the secondary-app trick in authApi so the admin's own session is
// unaffected. Returns the temporary password so the admin can share it.
export async function createUser(email, { role = 'user' } = {}) {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) throw new Error(t('errors.emailRequired'));

  const tempPassword = randomTempPassword();
  const uid = await authApi.createUserOnSecondaryApp(trimmedEmail, tempPassword);
  await usersApi.createUserProfile(uid, {
    email: trimmedEmail,
    displayName: defaultDisplayNameFromEmail(trimmedEmail),
    role,
    disabled: false,
  });
  return { uid, tempPassword };
}

// Self-service: a user changing their own display name. Firestore rules
// restrict this to only the displayName field, so it can't be used to
// smuggle in a role/disabled change.
export function updateOwnDisplayName(uid, displayName) {
  const trimmed = (displayName ?? '').trim();
  if (!trimmed) throw new Error(t('errors.displayNameEmpty'));
  if (trimmed.length > 60) throw new Error(t('errors.displayNameTooLong'));
  return usersApi.updateUserProfile(uid, { displayName: trimmed });
}

// Self-service: a user picking their own branch from the VITE_BRANCHES list.
// Firestore rules restrict this to only the branch field, so it can't be
// used to smuggle in a role/disabled change.
export function updateOwnBranch(uid, branch) {
  if (!BRANCHES.includes(branch)) throw new Error(t('errors.selectValidBranch'));
  return usersApi.updateUserProfile(uid, { branch });
}

// Spark plan has no server-side Admin SDK, so we can't delete another user's
// actual Firebase Auth account from the client. "Delete" here means revoking
// their access: the Firestore profile is removed, and the login flow
// (authService.completeLogin) force-signs-out anyone without a profile.
export async function revokeUser(uid) {
  await usersApi.deleteUserProfile(uid);
}

export function setDisabled(uid, disabled) {
  return usersApi.updateUserProfile(uid, { disabled });
}

export async function setAdminRole(uid, isAdmin, allUsers) {
  if (!isAdmin) {
    const remainingAdmins = allUsers.filter((u) => u.role === 'admin' && u.uid !== uid);
    if (remainingAdmins.length === 0) {
      throw new Error(t('errors.cannotRemoveLastAdmin'));
    }
  }
  return usersApi.updateUserProfile(uid, { role: isAdmin ? 'admin' : 'user' });
}
