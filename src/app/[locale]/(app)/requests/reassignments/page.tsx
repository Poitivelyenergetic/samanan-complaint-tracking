"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { acceptReassignment, rejectReassignment, subscribeToPendingReassignments } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type Complaint, type StaffUser } from "@/lib/types";

export default function ReassignmentRequestsPage() {
  const t = useTranslations("requests.reassignments");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const canReview = hasPermission(profile, "complaints", "acceptReassignment");

  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => subscribeToPendingReassignments(setComplaints), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  useEffect(() => {
    if (!loading && profile && !canReview) {
      router.replace("/requests");
    }
  }, [loading, profile, canReview, router]);

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const assigneeName = (uid: string | null | undefined) =>
    uid ? localizedName(staffById.get(uid), locale) || uid : tCommon("unassigned");

  async function handleAccept(complaint: Complaint) {
    if (!complaint.pendingReassignment) return;
    setResolvingId(complaint.id);
    try {
      await acceptReassignment(complaint.id, complaint.pendingReassignment, complaint.assignedTo, user?.uid ?? null);
    } finally {
      setResolvingId(null);
    }
  }

  async function handleReject(complaint: Complaint) {
    if (!complaint.pendingReassignment) return;
    setResolvingId(complaint.id);
    try {
      await rejectReassignment(complaint.id, complaint.pendingReassignment, complaint.assignedTo, user?.uid ?? null);
    } finally {
      setResolvingId(null);
    }
  }

  if (loading || !profile || !canReview) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div>
      <Link href="/requests" className="text-sm text-brand hover:underline">
        &larr; {tCommon("back")}
      </Link>
      <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>

      <div className="mt-6 space-y-3">
        {complaints === null ? (
          <p className="text-sm text-foreground/50">{tCommon("loading")}</p>
        ) : complaints.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-foreground/50">
            {t("noResults")}
          </p>
        ) : (
          complaints.map((complaint) => {
            const pending = complaint.pendingReassignment;
            if (!pending) return null;
            return (
              <div key={complaint.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="sm:flex sm:items-start sm:justify-between sm:gap-4">
                  <div>
                    <Link href={`/complaints/${complaint.id}`} className="font-medium text-foreground hover:text-brand">
                      {complaint.subject}
                    </Link>
                    <p className="mt-0.5 font-mono text-xs text-foreground/40">{complaint.id}</p>
                    <p className="mt-1.5 text-sm text-foreground/80">
                      {t("from")}: {assigneeName(complaint.assignedTo)} &rarr; {t("to")}: {assigneeName(pending.assignedTo)}
                    </p>
                    <p className="mt-0.5 text-sm text-foreground/60">
                      {t("reason")}: {pending.reason}
                    </p>
                    <p className="mt-1 text-xs text-foreground/40">
                      {t("requestedBy")} {assigneeName(pending.requestedBy)} ·{" "}
                      {format.dateTime(new Date(pending.requestedAt), { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <div className="mt-3 flex gap-2 sm:mt-0 sm:shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAccept(complaint)}
                      disabled={resolvingId === complaint.id || pending.assignedTo === user?.uid}
                      title={pending.assignedTo === user?.uid ? t("cannotResolveOwnTarget") : undefined}
                      className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {resolvingId === complaint.id ? t("accepting") : t("accept")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(complaint)}
                      disabled={resolvingId === complaint.id || pending.assignedTo === user?.uid}
                      title={pending.assignedTo === user?.uid ? t("cannotResolveOwnTarget") : undefined}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      {resolvingId === complaint.id ? t("rejecting") : t("reject")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
