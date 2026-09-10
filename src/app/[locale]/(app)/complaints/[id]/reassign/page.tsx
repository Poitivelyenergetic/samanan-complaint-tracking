"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { requestReassignment, subscribeToComplaint } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type Complaint, type StaffUser } from "@/lib/types";
import SearchableSelect from "@/components/SearchableSelect";

export default function ReassignComplaintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("complaint.reassign");
  const tDetail = useTranslations("complaint.detail");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { profile, user, loading } = useAuth();

  const [complaint, setComplaint] = useState<Complaint | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canReassign = hasPermission(profile, "complaints", "reassign");

  useEffect(
    () => subscribeToComplaint(id, setComplaint, () => setComplaint(null)),
    [id]
  );
  useEffect(() => subscribeToStaff(setStaff), []);

  useEffect(() => {
    if (complaint) Promise.resolve().then(() => setAssignTo(complaint.assignedTo ?? ""));
  }, [complaint]);

  useEffect(() => {
    if (!loading && profile && !canReassign) {
      router.replace(`/complaints/${id}`);
    }
  }, [loading, profile, canReassign, router, id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError(t("reasonRequired"));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await requestReassignment(id, assignTo || null, complaint?.assignedTo ?? null, user?.uid ?? null, reason.trim());
      router.push(`/complaints/${id}`);
    } catch {
      setError(tCommon("somethingWentWrong"));
      setSubmitting(false);
    }
  }

  if (complaint === undefined || loading || !profile || !canReassign) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (complaint === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{tDetail("notFound")}</p>
        <Link href="/dashboard" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/complaints/${id}`} className="text-sm text-brand hover:underline">
        &larr; {tCommon("back")}
      </Link>
      <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-lg border border-border bg-surface p-6">
        <div>
          <label htmlFor="assignTo" className="block text-sm font-medium text-foreground">
            {t("assignToLabel")}
          </label>
          <div className="mt-1 max-w-xs">
            <SearchableSelect
              id="assignTo"
              items={staff}
              value={assignTo}
              onChange={setAssignTo}
              getId={(member) => member.id}
              getLabel={(member) => localizedName(member, locale)}
              placeholder={tCommon("unassigned")}
            />
          </div>
        </div>

        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-foreground">
            {t("reasonLabel")}
          </label>
          <textarea
            id="reason"
            required
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
          <Link href={`/complaints/${id}`} className="text-sm text-foreground/60 hover:text-foreground">
            {tCommon("cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
