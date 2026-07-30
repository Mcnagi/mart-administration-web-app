// Business logic for admin user management: creating accounts, revoking
// access ("delete"), and managing the admin group. Views should call only
// this file, never api/usersApi.js or api/authApi.js directly.
import * as authApi from '../api/authApi';
import * as usersApi from '../api/usersApi';

export function listUsers() {
  return usersApi.listUserProfiles();
}

function randomTempPassword() {
  // Shown once to the admin to hand off to the new user; the user should
  // change it after first login (see authService.changePassword).
  return Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
}

// Creates both the Auth account and the Firestore profile for a new user.
// Uses the secondary-app trick in authApi so the admin's own session is
// unaffected. Returns the temporary password so the admin can share it.
export async function createUser(email, { role = 'user' } = {}) {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) throw new Error('Email is required.');

  const tempPassword = randomTempPassword();
  const uid = await authApi.createUserOnSecondaryApp(trimmedEmail, tempPassword);
  await usersApi.createUserProfile(uid, {
    email: trimmedEmail,
    role,
    disabled: false,
  });
  return { uid, tempPassword };
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
      throw new Error('Cannot remove the last admin.');
    }
  }
  return usersApi.updateUserProfile(uid, { role: isAdmin ? 'admin' : 'user' });
}
