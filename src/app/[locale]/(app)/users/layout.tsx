"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/types";
import { useRouter } from "@/i18n/navigation";

// Users (the customer-facing record, `customers` collection internally — see
// types.ts) is a standalone top-level section, not part of Settings, but
// still gated by its own resource permission like everything else.
export default function UsersLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const { profile, loading } = useAuth();
  const router = useRouter();
  const canView = hasPermission(profile, "customers", "view");

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
