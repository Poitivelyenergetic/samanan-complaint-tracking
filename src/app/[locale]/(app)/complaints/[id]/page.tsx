"use client";

import { use, useEffect, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteComplaint, reassignComplaint, subscribeToComplaint, updateComplaint } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToCustomers } from "@/lib/customers";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type Complaint, type ComplaintInput, type Customer, type StaffUser } from "@/lib/types";
import ComplaintForm from "@/components/ComplaintForm";

export default function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("complaint.detail");
  const tStatus = useTranslations("status");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const { user, profile } = useAuth();

  const [complaint, setComplaint] = useState<Complaint | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const [reassigning, setReassigning] = useState(false);

  // Without complaints.update, an account gets a read-only view. Default to
  // read-only (rather than editable) if the profile hasn't loaded yet,
  // since that's the safer failure mode.
  const canEdit = hasPermission(profile, "complaints", "update");
  const canDelete = hasPermission(profile, "complaints", "delete");
  const canReassign = hasPermission(profile, "complaints", "reassign");

  useEffect(
    () =>
      // An account whose own complaint's assignment changes out from under
      // it (or who somehow reaches an ID that isn't theirs) gets a
      // Firestore permission-denied here — treat that the same as "not
      // found" rather than surfacing a raw error.
      subscribeToComplaint(id, setComplaint, () => setComplaint(null)),
    [id]
  );
  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToCustomers(setCustomers), []);

  async function handleSubmit(values: ComplaintInput) {
    await updateComplaint(id, values, complaint?.status ?? null, user?.uid ?? null);
  }

  async function handleReassign() {
    setReassigning(true);
    try {
      await reassignComplaint(id, reassignTo || null, complaint?.assignedTo ?? null, user?.uid ?? null);
      setReassignTo("");
    } finally {
      setReassigning(false);
    }
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

  const staffById = new Map(staff.map((s) => [s.id, s]));

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
        {canDelete && (
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
        <div className="mb-5 flex items-end justify-between gap-3 border-b border-border pb-5">
          <div>
            <p className="text-xs font-medium text-foreground/50">{t("assignedTo")}</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {complaint.assignedTo ? localizedName(staffById.get(complaint.assignedTo), locale) || complaint.assignedTo : tCommon("unassigned")}
            </p>
          </div>
          {canReassign && (
            <div className="flex items-center gap-2">
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              >
                <option value="">{tCommon("unassigned")}</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {localizedName(member, locale)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleReassign}
                disabled={reassigning}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
              >
                {t("reassign")}
              </button>
            </div>
          )}
        </div>

        <ComplaintForm
          key={complaint.id + complaint.updatedAt}
          staff={staff}
          customers={customers}
          initialValues={{
            subject: complaint.subject,
            description: complaint.description,
            category: complaint.category,
            source: complaint.source,
            customerId: complaint.customerId,
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
          hideAssignedTo
        />
      </div>

      {complaint.history.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold text-foreground">{t("history")}</h2>
          <ol className="mt-3 space-y-3">
            {[...complaint.history].reverse().map((entry, i) => {
              const actorName = entry.byUid
                ? localizedName(staffById.get(entry.byUid), locale) || entry.byUid
                : t("historyActorPublic");
              const assigneeName = (uid: string | null | undefined) =>
                uid ? localizedName(staffById.get(uid), locale) || uid : tCommon("unassigned");

              return (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  <div>
                    <p className="text-foreground/80">
                      {entry.type === "created" &&
                        t("historyCreated", { status: entry.status ? tStatus(entry.status) : "" })}
                      {entry.type === "status" &&
                        t("historyStatus", {
                          previousStatus: entry.previousStatus ? tStatus(entry.previousStatus) : "—",
                          status: entry.status ? tStatus(entry.status) : "",
                        })}
                      {entry.type === "reassigned" &&
                        t("historyReassigned", {
                          from: assigneeName(entry.previousAssignedTo),
                          to: assigneeName(entry.assignedTo),
                        })}
                    </p>
                    <p className="text-xs text-foreground/50">
                      {actorName} ·{" "}
                      {format.dateTime(new Date(entry.at), { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
