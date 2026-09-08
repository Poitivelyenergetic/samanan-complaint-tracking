"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "@/i18n/navigation";

// The Employees module manages staff accounts and is restricted to accounts
// with the viewEmployees permission (admin by default; individually
// overridable per employee). The (app) layout above already guarantees the
// user is signed in. Creating/editing/removing accounts additionally
// requires manageEmployees, checked separately by the nested pages that do
// that (new/[id]/requests) — this layout only gates seeing the section.
export default function EmployeesLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile && !profile.permissions.viewEmployees) {
      router.replace("/dashboard");
    }
  }, [loading, profile, router]);

  if (loading || !profile || !profile.permissions.viewEmployees) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-foreground/50">{t("loading")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
