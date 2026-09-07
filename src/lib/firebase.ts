// Client-side Firebase initialization.
// Values come from NEXT_PUBLIC_* environment variables — see .env.example
// and the README for how to obtain them from your Firebase project settings.
import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const hasRealConfig = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);

if (!hasRealConfig && typeof window !== "undefined") {
  console.warn(
    "[Samnan] Firebase env vars are not set. Copy .env.example to .env.local " +
      "and fill in your Firebase project's config values."
  );
}

// A format-valid but non-functional placeholder is used when .env.local is
// missing so that Next's SSR/build module evaluation doesn't crash before
// the project is configured. Sign-in and data calls will simply fail until
// real values are provided.
const firebaseConfig: FirebaseOptions = hasRealConfig
  ? {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    }
  : {
      apiKey: "AIzaSyDEMO00000000000000000000000000000",
      authDomain: "demo-project.firebaseapp.com",
      projectId: "demo-project",
      storageBucket: "demo-project.appspot.com",
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:0000000000000000000000",
    };

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

export { usernameToEmail } from "./username";
