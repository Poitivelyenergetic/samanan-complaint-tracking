"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { subscribeToPendingSignupRequests } from "@/lib/signupRequests";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/types";

function RequestTypeCard({
  href,
  title,
  description,
  count,
}: {
  href: string;
  title: string;
  description: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-5 hover:border-brand/40"
    >
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm text-foreground/60">{description}</p>
      </div>
      {count > 0 && (
        <span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-brand px-2 text-sm font-semibold text-brand-foreground">
          {count}
        </span>
      )}
    </Link>
  );
}

export default function RequestsHubPage() {
  const t = useTranslations("requests");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { profile, loading } = useAuth();

  const canReviewAccountRequests = hasPermission(profile, "employees", "update");

  const [pendingAccountRequests, setPendingAccountRequests] = useState(0);

  useEffect(() => {
    if (!canReviewAccountRequests) return;
    return subscribeToPendingSignupRequests((requests) => setPendingAccountRequests(requests.length));
  }, [canReviewAccountRequests]);

  useEffect(() => {
    if (!loading && profile && !canReviewAccountRequests) {
      router.replace("/dashboard");
    }
  }, [loading, profile, canReviewAccountRequests, router]);

  if (loading || !profile || !canReviewAccountRequests) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RequestTypeCard
          href="/employees/requests"
          title={t("accountRequests")}
          description={t("accountRequestsDescription")}
          count={pendingAccountRequests}
        />
      </div>
    </div>
  );
}
