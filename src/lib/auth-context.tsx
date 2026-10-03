"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, usernameToEmail } from "./firebase";
import { staffUserFromDoc } from "./users";
import type { StaffUser } from "./types";

interface AuthContextValue {
  user: User | null;
  profile: StaffUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// A new mark each time someone actually signs in on this browser (a reload,
// still signed in, keeps it), gone again when they sign out — so anything
// kept "until the next login" can tell one login from the next (e.g. the
// sidebar's open groups).
export const LOGIN_MARK = "samnan.loginMark";

export function loginMark(): string {
  try {
    return localStorage.getItem(LOGIN_MARK) ?? "";
  } catch {
    return "";
  }
}

// Signed in with "Remember me" left unticked: still signed in in every tab
// (Firebase keeps the session in localStorage either way — its per-tab
// sessionStorage option made every new tab ask for the password again),
// but only until the browser is closed. A cookie with no expiry is shared by
// every tab and dies with the browser; signed in "for this session only"
// and no cookie any more means the browser was closed since.
const SESSION_ONLY = "samnan.sessionOnly";
const SESSION_COOKIE = "samnan_session";

/** Call just before signing in: whether to stay signed in after the browser closes. */
export function rememberSignIn(remember: boolean) {
  try {
    if (remember) {
      localStorage.removeItem(SESSION_ONLY);
    } else {
      localStorage.setItem(SESSION_ONLY, "1");
      document.cookie = `${SESSION_COOKIE}=1; path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    }
  } catch {}
}

function sessionEnded(): boolean {
  try {
    return localStorage.getItem(SESSION_ONLY) === "1" && !document.cookie.split("; ").includes(`${SESSION_COOKIE}=1`);
  } catch {
    return false;
  }
}

function hasTabOnlySession(): boolean {
  try {
    return Object.keys(sessionStorage).some((key) => key.startsWith("firebase:authUser:"));
  } catch {
    return false;
  }
}

function forgetSessionOnly() {
  try {
    localStorage.removeItem(SESSION_ONLY);
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [rawProfile, setRawProfile] = useState<StaffUser | null>(null);
  // The uid that `rawProfile` currently reflects. Comparing it against
  // `user.uid` lets us derive both the "reset on logout" and "still loading"
  // states below without an extra setState call inside the effect.
  const [profileUid, setProfileUid] = useState<string | null>(null);

  useEffect(() => {
    // The first call is the page loading (and finding whoever's still
    // signed in); any sign-in after that is a new login.
    let first = true;
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      // Signed in for that browser session only, and it's over: sign out
      // (this comes straight back round with no user).
      if (firebaseUser && sessionEnded()) {
        firebaseSignOut(auth);
        return;
      }
      if (!firebaseUser) forgetSessionOnly();
      // Still signed in the old way — "Remember me" unticked used to keep
      // the session in this one tab's sessionStorage: move it over, so it
      // reaches every tab, still only until the browser closes.
      else if (hasTabOnlySession()) {
        setPersistence(auth, browserLocalPersistence)
          .then(() => rememberSignIn(false))
          .catch(() => {});
      }
      try {
        if (!firebaseUser) localStorage.removeItem(LOGIN_MARK);
        else if (!first || !localStorage.getItem(LOGIN_MARK)) localStorage.setItem(LOGIN_MARK, String(Date.now()));
      } catch {}
      first = false;
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setRawProfile(snap.exists() ? staffUserFromDoc(snap.id, snap.data()) : null);
      setProfileUid(user.uid);
    });
    return unsubscribe;
  }, [user]);

  const profile = user && profileUid === user.uid ? rawProfile : null;
  const profileLoading = !!user && profileUid !== user.uid;

  async function signIn(username: string, password: string) {
    await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
  }

  async function signOut() {
    await firebaseSignOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading: authLoading || (!!user && profileLoading),
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
