"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";

export default function SalesOpportunitiesPage() {
  const t = useTranslations("salesOpportunities");
  const tCommon = useTranslations("common");
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-20 text-center">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-2 max-w-md text-sm text-foreground/60">{t("comingSoon")}</p>
    </div>
  );
}
