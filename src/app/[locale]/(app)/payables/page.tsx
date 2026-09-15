"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import Spinner from "@/components/Spinner";

export default function PayablesPage() {
  const t = useTranslations("payables");
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return <Spinner />;
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-20 text-center">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-2 max-w-md text-sm text-foreground/60">{t("comingSoon")}</p>
    </div>
  );
}
