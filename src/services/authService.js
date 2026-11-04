// Business logic for login/logout and session state. Views should call only
// this file, never api/authApi.js or api/usersApi.js directly.
import * as authApi from '../api/authApi';
import * as usersApi from '../api/usersApi';
import { clearLocalData } from './localDataService';
import { clearItemListDraft } from './itemListService';
import { clearCompanyNameMap } from '../utils/companyNameCache';
import { clearCachedFilters } from '../utils/itemsFilterCache';
import { clearCachedScroll } from '../utils/itemsScrollCache';
import { t } from '../i18n/i18n';

// Signs out and wipes everything this app keeps on the device for the
// signed-in user, so the next person to sign in here starts clean: the
// downloaded local-data copy (IndexedDB), the unsaved item list draft, the
// company-name cache, and the Items page's remembered filters/scroll.
// Language is kept — it's a choice for the device, not for the user. Used
// for every sign-out, whether the user logged out or their account was
// disabled or removed. Clearing runs after signing out, and a failure is
// only logged — it must never block that.
//
// A profile read that *failed* (e.g. offline) is not proof the account was
// removed, so callers pass that case to authApi.signOutCurrentUser() alone
// — wiping a several-MB download over a dropped connection would be worse
// than a re-login.
async function signOutAndClearDevice() {
  await authApi.signOutCurrentUser();
  try {
    clearItemListDraft();
    clearCompanyNameMap();
    clearCachedFilters();
    clearCachedScroll();
    await clearLocalData();
  } catch (err) {
    console.error('[sign-out] failed to clear device data', err);
  }
}

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
    await authApi.signOutCurrentUser();
    throw new Error(t('errors.accessRevoked'));
  }

  if (!profile || profile.disabled) {
    await signOutAndClearDevice();
    throw new Error(t('errors.accessRevoked'));
  }

  return profile;
}

export function logout() {
  return signOutAndClearDevice();
}

// Re-fetches the current user's profile so a self-service edit (e.g. display
// name) shows up immediately without waiting for the next auth-state event.
export function fetchProfile(uid) {
  return usersApi.getUserProfile(uid);
}

// Firebase requires a "recent" login for sensitive operations like changing
// your own password, so the current password is used to reauthenticate
// immediately beforehand — otherwise this fails with auth/requires-recent-login.
export async function changePassword(currentPassword, newPassword) {
  if (!currentPassword) {
    throw new Error(t('errors.currentPasswordRequired'));
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error(t('errors.newPasswordTooShort'));
  }
  try {
    await authApi.reauthenticate(currentPassword);
  } catch {
    throw new Error(t('errors.currentPasswordIncorrect'));
  }
  return authApi.changeOwnPassword(newPassword);
}

// Wires Firebase's auth-state stream together with the Firestore profile
// lookup so callers get one combined { user, profile } state.
//
// Guarded with a `stopped` flag rather than relying on Firebase to stop
// calling back once unsubscribed: onAuthStateChanged's queued initial event
// can still land on an already-unsubscribed listener (observed under React
// StrictMode's dev-only double mount/cleanup/mount of effects), which would
// otherwise trigger a second profile fetch — and its log entry — for the
// same sign-in.
export function subscribeToSession(onChange) {
  let stopped = false;
  const unsubscribe = authApi.subscribeToAuthState(async (firebaseUser) => {
    if (stopped) return;
    if (!firebaseUser) {
      onChange({ user: null, profile: null });
      return;
    }
    let profile = null;
    let readFailed = false;
    try {
      profile = await usersApi.getUserProfile(firebaseUser.uid);
    } catch {
      readFailed = true;
    }
    if (stopped) return;
    if (readFailed || !profile || profile.disabled) {
      await (readFailed ? authApi.signOutCurrentUser() : signOutAndClearDevice());
      onChange({ user: null, profile: null });
      return;
    }
    onChange({ user: firebaseUser, profile });
  });
  return () => {
    stopped = true;
    unsubscribe();
  };
}
