"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { Link, useRouter } from "@/i18n/navigation";
import PublicShell, { BrandHeader } from "@/components/PublicShell";

export default function LandingChoicePage() {
  const t = useTranslations("landing");
  const tCommon = useTranslations("common");
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  return (
    <PublicShell maxWidthClassName="max-w-2xl">
      <BrandHeader subtitle={tCommon("appSubtitle")} />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Link
          href="/complaint/new"
          className="group flex flex-col rounded-xl border border-border bg-surface p-6 shadow-sm transition-colors hover:border-brand"
        >
          <span className="text-lg font-semibold text-foreground">{t("complaintOption.title")}</span>
          <span className="mt-1 text-sm text-foreground/60">{t("complaintOption.subtitle")}</span>
          <span className="mt-4 inline-flex items-center text-sm font-semibold text-brand">
            {t("complaintOption.cta")}
            <span className="ms-1 inline-block transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5">
              &rarr;
            </span>
          </span>
        </Link>

        <Link
          href="/login/staff"
          className="group flex flex-col rounded-xl border border-border bg-surface p-6 shadow-sm transition-colors hover:border-brand"
        >
          <span className="text-lg font-semibold text-foreground">{t("staffOption.title")}</span>
          <span className="mt-1 text-sm text-foreground/60">{t("staffOption.subtitle")}</span>
          <span className="mt-4 inline-flex items-center text-sm font-semibold text-brand">
            {t("staffOption.cta")}
            <span className="ms-1 inline-block transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5">
              &rarr;
            </span>
          </span>
        </Link>
      </div>

      <p className="mt-6 text-center text-sm text-foreground/50">
        {t("statusPrompt")}{" "}
        <Link href="/complaint/status" className="text-brand hover:underline">
          {t("statusLink")}
        </Link>
      </p>
    </PublicShell>
  );
}
