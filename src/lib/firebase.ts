// Client-side Firebase initialization.
// Values come from NEXT_PUBLIC_* environment variables — see .env.example
// and the README for how to obtain them from your Firebase project settings.
import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

// Staff sign in with a plain username. Firebase Auth requires an email, so
// usernames are mapped to a synthetic, non-routable address of the form
// "<username>@samnan.local" both here and in the seed script.
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@samnan.local`;
}
