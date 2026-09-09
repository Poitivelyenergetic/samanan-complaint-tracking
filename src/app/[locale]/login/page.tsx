"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "@/i18n/navigation";

// Complaints are now logged internally by staff only — there is no public
// complaint-filing or status-check flow anymore, so the root landing page
// is just a redirect straight into the staff login form.
export default function LandingRedirectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/login/staff");
  }, [loading, user, router]);

  return null;
}
