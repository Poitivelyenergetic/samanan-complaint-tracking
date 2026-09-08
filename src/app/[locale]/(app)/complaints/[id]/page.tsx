"use client";

import { use, useEffect, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteComplaint, subscribeToComplaint, updateComplaint } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import type { Complaint, ComplaintInput, StaffUser } from "@/lib/types";
import ComplaintForm from "@/components/ComplaintForm";

export default function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("complaint.detail");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const { profile } = useAuth();

  const [complaint, setComplaint] = useState<Complaint | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [deleting, setDeleting] = useState(false);

  // The "user" role can only edit/reassign/change the status of nothing —
  // it gets a read-only view. Default to read-only (rather than editable)
  // if the profile hasn't loaded yet, since that's the safer failure mode.
  const canEdit = profile?.role === "admin" || profile?.role === "employee";

  useEffect(
    () =>
      // A "user"-role account whose own complaint's assignment changes out
      // from under them (or who somehow reaches an ID that isn't theirs)
      // gets a Firestore permission-denied here — treat that the same as
      // "not found" rather than surfacing a raw error.
      subscribeToComplaint(id, setComplaint, () => setComplaint(null)),
    [id]
  );
  useEffect(() => subscribeToStaff(setStaff), []);

  async function handleSubmit(values: ComplaintInput) {
    await updateComplaint(id, values);
  }

  async function handleDelete() {
    if (!window.confirm(tCommon("confirmDelete"))) return;
    setDeleting(true);
    await deleteComplaint(id);
    router.push("/dashboard");
  }

  if (complaint === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (complaint === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/dashboard" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-brand hover:underline">
            &larr; {tCommon("back")}
          </Link>
          <h1 className="mt-1 text-xl font-bold text-foreground">{t("editTitle")}</h1>
          <p className="mt-0.5 font-mono text-xs text-foreground/50">{complaint.id}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {tCommon("delete")}
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-4 text-xs text-foreground/50">
        <span>
          {tCommon("createdAt")}: {format.dateTime(new Date(complaint.createdAt), { dateStyle: "medium", timeStyle: "short" })}
        </span>
        <span>
          {tCommon("updatedAt")}: {format.dateTime(new Date(complaint.updatedAt), { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <ComplaintForm
          key={complaint.id + complaint.updatedAt}
          staff={staff}
          initialValues={{
            subject: complaint.subject,
            description: complaint.description,
            category: complaint.category,
            customerNumber: complaint.customerNumber,
            customerOrderNumber: complaint.customerOrderNumber,
            assignedTo: complaint.assignedTo ?? "",
            status: complaint.status,
            channel: complaint.channel,
            complainantName: complaint.complainantName,
            contactEmail: complaint.contactEmail,
            contactPhone: complaint.contactPhone,
            attachmentUrl: complaint.attachmentUrl,
          }}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
          readOnly={!canEdit}
        />
      </div>
    </div>
  );
}
