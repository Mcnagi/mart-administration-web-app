// Business logic for login/logout and session state. Views should call only
// this file, never api/authApi.js or api/usersApi.js directly.
import * as authApi from '../api/authApi';
import * as usersApi from '../api/usersApi';

// There is no self-service sign-up in this app on purpose: accounts are only
// ever created by an admin (see userService.createUser). This function is
// the entire "log in" surface exposed to the UI.
export async function login(email, password) {
  const credential = await authApi.signIn(email.trim(), password);
  const uid = credential.user.uid;

  let profile;
  try {
    profile = await usersApi.getUserProfile(uid);
  } catch {
    profile = null;
  }

  if (!profile || profile.disabled) {
    await authApi.signOutCurrentUser();
    throw new Error('Your access has been revoked. Contact an admin.');
  }

  return profile;
}

export function logout() {
  return authApi.signOutCurrentUser();
}

export function changePassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  return authApi.changeOwnPassword(newPassword);
}

// Wires Firebase's auth-state stream together with the Firestore profile
// lookup so callers get one combined { user, profile } state.
export function subscribeToSession(onChange) {
  return authApi.subscribeToAuthState(async (firebaseUser) => {
    if (!firebaseUser) {
      onChange({ user: null, profile: null });
      return;
    }
    let profile = null;
    try {
      profile = await usersApi.getUserProfile(firebaseUser.uid);
    } catch {
      profile = null;
    }
    if (!profile || profile.disabled) {
      await authApi.signOutCurrentUser();
      onChange({ user: null, profile: null });
      return;
    }
    onChange({ user: firebaseUser, profile });
  });
}
