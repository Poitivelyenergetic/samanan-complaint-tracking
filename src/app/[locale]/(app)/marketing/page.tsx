"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/types";
import { useRouter } from "@/i18n/navigation";

export default function MarketingPage() {
  const t = useTranslations("marketing");
  const tCommon = useTranslations("common");
  const { profile, loading } = useAuth();
  const router = useRouter();
  const canView = hasPermission(profile, "marketing", "view");

  useEffect(() => {
    if (!loading && profile && !canView) {
      router.replace("/dashboard");
    }
  }, [loading, profile, canView, router]);

  if (loading || !profile || !canView) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-20 text-center">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-2 max-w-md text-sm text-foreground/60">{t("comingSoon")}</p>
    </div>
  );
}
