# eMart

A mobile-friendly pantry/inventory tracker: log in, upload a photo of an item with
its name, quantity and expiry date, and see everything sorted by how soon it
expires. Admins manage who has an account and who else is an admin.

Built on Firebase's free **Spark** plan only — no Cloud Functions, no billing
account required.

## How it's organized

- `src/api/` — the only files that call the Firebase SDK directly (Auth, Firestore).
- `src/services/` — business logic: login rules, expiry-day math, sorting,
  image compression, admin rules. Calls `api/`, never touched by views.
- `src/pages/` + `src/components/` — views. Call `services/`, never `api/` directly.
- `src/context/AuthContext.jsx` — exposes the current user/profile/role app-wide.

## Design decisions worth knowing about

**No self sign-up.** There is intentionally no public registration page —
accounts only come from an admin, via Admin → Manage users → "Create account".
This satisfies "can log in, not sign in [up]".

**Spark plan means "delete user" is really "revoke access".** Actually deleting
someone else's Firebase Auth credential requires the Admin SDK, which only runs
in Cloud Functions — and Cloud Functions require the Blaze (pay-as-you-go)
plan even for free-tier usage. Since you chose to stay on Spark:
- Admin "Delete" removes the person's Firestore profile. The login flow
  (`services/authService.js`) checks for a profile on every login/session
  restore and force-signs-out anyone without one (or with `disabled: true`).
  So a deleted/disabled user is fully locked out of the app.
- Their raw Auth credential technically still exists in Firebase's system,
  just unusable. If you ever upgrade to Blaze, add one small Cloud Function
  wrapping `admin.auth().deleteUser(uid)` and call it from `userService.revokeUser`
  to clean that up too.

**Admin-created accounts don't kick the admin out.** Firebase's client SDK
normally signs you in as whatever account you just created. `api/authApi.js`
works around this with a second, throwaway Firebase App instance
(`getSecondaryAuth`) used only for that one call, so the admin's own session
is untouched.

**Photos are base64 in Firestore, not Cloud Storage.** Cloud Storage's free
tier is fine but is easy to accidentally exceed; you said to keep this fully
free, so photos are resized/compressed client-side (`services/imageService.js`)
to a JPEG under ~700KB and stored as a base64 string directly on the item
document (Firestore's per-document limit is 1MiB).

**Items are a shared inventory**, not per-user private lists — any logged-in,
non-disabled user can see, add, edit, and delete any item. Only account
management (creating/disabling/promoting/deleting users) is admin-only.

## One-time Firebase setup

1. Create a project at https://console.firebase.google.com (Spark/free plan
   is fine — do **not** upgrade to Blaze).
2. **Authentication** → Sign-in method → enable **Email/Password**.
3. **Firestore Database** → create database (start in production mode — the
   rules below replace the defaults).
4. **Project settings** → General → Your apps → Add app → Web. Copy the
   config values into a `.env` file (copy `.env.example` and fill it in —
   `.env` is gitignored so real credentials never get committed). Optionally
   set `VITE_APP_NAME` there too (defaults to `MartAdmin`).
5. Copy `.firebaserc.example` to `.firebaserc` and set your project ID (also
   gitignored), or run `firebase use --add` to generate it.
6. Deploy the security rules in `firestore.rules`:
   ```
   npm install -g firebase-tools   # if you don't have it
   firebase login
   firebase deploy --only firestore:rules
   ```
7. **Bootstrap the first admin** (one-time, done by hand — the app itself has
   no way to create the very first admin, since creating a profile requires
   already being an admin):
   - In **Authentication → Users**, click "Add user", enter your email and a
     password.
   - Copy the generated User UID.
   - In **Firestore Database**, create a collection named `users`, with a
     document whose ID is that UID, containing:
     ```
     email: "you@example.com"   (string)
     role: "admin"              (string)
     disabled: false            (boolean)
     ```
   - You can now log in to the app with that email/password as an admin, and
     create every other account from Admin → Manage users.

## Local development

```
npm install
npm run dev
```

## Deploy to Firebase Hosting

```
npm run build
firebase deploy --only hosting
```

This gives you a `https://<project-id>.web.app` URL that works on phones —
add it to your home screen for an app-like experience.
