"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, usernameToEmail } from "./firebase";
import type { StaffUser } from "./types";

interface AuthContextValue {
  user: User | null;
  profile: StaffUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [rawProfile, setRawProfile] = useState<StaffUser | null>(null);
  // The uid that `rawProfile` currently reflects. Comparing it against
  // `user.uid` lets us derive both the "reset on logout" and "still loading"
  // states below without an extra setState call inside the effect.
  const [profileUid, setProfileUid] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setRawProfile(snap.exists() ? (snap.data() as StaffUser) : null);
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
