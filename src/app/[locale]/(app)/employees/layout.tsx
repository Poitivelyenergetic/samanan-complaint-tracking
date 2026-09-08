"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/types";
import { useRouter } from "@/i18n/navigation";

// The Employees module manages staff accounts and is restricted to accounts
// with the employees.view permission. The (app) layout above already
// guarantees the user is signed in. Creating/editing/removing accounts
// additionally requires employees.create/update/delete, checked separately
// by the nested pages that do that (new/[id]/requests) — this layout only
// gates seeing the section.
export default function EmployeesLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const { profile, loading } = useAuth();
  const router = useRouter();
  const canView = hasPermission(profile, "employees", "view");

  useEffect(() => {
    if (!loading && profile && !canView) {
      router.replace("/dashboard");
    }
  }, [loading, profile, canView, router]);

  if (loading || !profile || !canView) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-foreground/50">{t("loading")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
