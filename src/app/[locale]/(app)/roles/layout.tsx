"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/types";
import { useRouter } from "@/i18n/navigation";

export default function RolesLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const { profile, loading } = useAuth();
  const router = useRouter();
  const canView = hasPermission(profile, "roles", "view");

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
