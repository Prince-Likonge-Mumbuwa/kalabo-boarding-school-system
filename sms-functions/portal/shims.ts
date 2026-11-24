// sms-functions/portal/shims.ts
//
// Stand-ins for the browser-only modules the app's services import, used ONLY
// in the portal bundle (see vite.config.portal.ts):
//   • '@/lib/firebase'  → the Admin SDK database (no browser app, no sign-in)
//   • 'firebase/app'    → initializeApp is a no-op (the function initialises firebase-admin)
//   • 'firebase/auth'   → nobody is signed in on the portal: currentUser is null
import { getFirestore } from './adminFirestore';

export const app = {};
export const auth = { currentUser: null as null | { uid: string; getIdToken(): Promise<string> } };
export const db = getFirestore();

export const initializeApp = (_config?: unknown) => app;
export const getAuth = (_app?: unknown) => auth;
