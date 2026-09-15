"use client";

// This entire section is per-session (Firebase Auth) and reads client-only
// state, so it must never be statically prerendered at build time.
export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "@/i18n/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import PageTransition from "@/components/PageTransition";
import Spinner from "@/components/Spinner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // Anyone landing here was previously signed in as staff (this whole
      // route group requires it) — send them straight to the staff login
      // form rather than the public choice screen.
      router.replace("/login/staff");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
