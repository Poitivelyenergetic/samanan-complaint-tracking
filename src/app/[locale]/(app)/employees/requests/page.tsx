"use client";

import { useEffect, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { rejectSignupRequest, subscribeToPendingSignupRequests } from "@/lib/signupRequests";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type SignupRequest } from "@/lib/types";

export default function PendingRequestsPage() {
  const t = useTranslations("employees.requests");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const { profile, loading } = useAuth();
  // Reviewing signup requests leads to creating an employee account, so it
  // requires employees.update (matches firestore.rules for signupRequests),
  // not just employees.view (which is all the parent layout guarantees).
  const canReview = hasPermission(profile, "employees", "update");

  const [requests, setRequests] = useState<SignupRequest[] | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  useEffect(() => subscribeToPendingSignupRequests(setRequests), []);

  useEffect(() => {
    if (!loading && profile && !canReview) {
      router.replace("/employees");
    }
  }, [loading, profile, canReview, router]);

  async function handleReject(id: string) {
    if (!window.confirm(t("confirmReject"))) return;
    setRejectingId(id);
    await rejectSignupRequest(id);
    setRejectingId(null);
  }

  if (loading || !profile || !canReview) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/employees" className="text-sm text-brand hover:underline">
            &larr; {tCommon("back")}
          </Link>
          <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {requests === null ? (
          <p className="text-sm text-foreground/50">{tCommon("loading")}</p>
        ) : requests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-foreground/50">
            {t("noResults")}
          </p>
        ) : (
          requests.map((req) => (
            <div key={req.id} className="rounded-lg border border-border bg-surface p-4 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-foreground">{req.name}</p>
                <p className="mt-0.5 text-sm text-foreground/60">
                  {req.username} · {req.contact}
                </p>
                <p className="mt-0.5 text-sm text-foreground/60">
                  {req.position} — {req.administration}
                </p>
                {req.note && <p className="mt-1 text-sm text-foreground/50">{req.note}</p>}
                <p className="mt-1 text-xs text-foreground/40">
                  {format.dateTime(new Date(req.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
              <div className="mt-3 flex gap-2 sm:mt-0 sm:shrink-0">
                <Link
                  href={{ pathname: "/employees/new", query: { fromRequest: req.id } }}
                  className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90"
                >
                  {t("approve")}
                </Link>
                <button
                  type="button"
                  onClick={() => handleReject(req.id)}
                  disabled={rejectingId === req.id}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  {t("reject")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
