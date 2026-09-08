"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "@/i18n/navigation";

// The Companies/Administrations/Positions/Employees hierarchy is restricted
// to accounts with the viewEmployees permission (admin by default;
// individually overridable per employee). The (app) layout above already
// guarantees the user is signed in. Managing the org structure or accounts
// requires manageCompanies/manageAdministrations/managePositions/
// manageEmployees, checked separately by the pages that do that — this
// layout only gates browsing.
export default function CompaniesLayout({ children }: { children: React.ReactNode }) {
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
