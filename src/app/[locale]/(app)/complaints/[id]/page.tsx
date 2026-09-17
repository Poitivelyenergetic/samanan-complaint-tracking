"use client";

import { use, useEffect, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteComplaint, subscribeToComplaint, updateComplaint } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToComplaintTypes } from "@/lib/complaintTypes";
import { subscribeToComplaintSources } from "@/lib/complaintSources";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  localizedName,
  type Company,
  type Complaint,
  type ComplaintInput,
  type ComplaintSource,
  type ComplaintType,
  type StaffUser,
} from "@/lib/types";
import Spinner from "@/components/Spinner";
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [complaintTypes, setComplaintTypes] = useState<ComplaintType[]>([]);
  const [complaintSources, setComplaintSources] = useState<ComplaintSource[]>([]);
  const [deleting, setDeleting] = useState(false);

  // complaints.update no longer means "can edit everything" — it (and
  // complaints.reassign) only ever let someone move status/assignedTo.
  // Editing the complaint's actual content (description, customer info,
  // type, source, company) requires complaints.editDetails specifically —
  // that's this app's definition of an Admin. Default to read-only (rather
  // than editable) if the profile hasn't loaded yet, since that's the safer
  // failure mode.
  const canEdit = hasPermission(profile, "complaints", "update");
  const canEditDetails = hasPermission(profile, "complaints", "editDetails");
  const canDelete = hasPermission(profile, "complaints", "delete");
  const canViewAllComplaints = hasPermission(profile, "complaints", "viewAll");
  const isAssignee = !!complaint && !!user && complaint.assignedTo === user.uid;
  // Without viewAll (a plain Employee, not Call center/Admin/Super Admin),
  // reassign only ever applies to a complaint currently assigned to you —
  // matches the same restriction in firestore.rules' isReassignWrite() check.
  const canReassign = hasPermission(profile, "complaints", "reassign") && (canViewAllComplaints || isAssignee);
  const canEditStatus = canEdit || isAssignee;

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
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToComplaintTypes(setComplaintTypes), []);
  useEffect(() => subscribeToComplaintSources(setComplaintSources), []);

  async function handleSubmit(values: ComplaintInput, statusNote?: string, statusAttachmentUrls?: string[]) {
    // ComplaintForm always sends createdBy: null (it's not an editable
    // field) — restore the complaint's actual creator rather than letting
    // it get wiped out on every save. Likewise assignedTo: this form is
    // mounted with hideAssignedTo, so its internal value is whatever the
    // complaint's assignedTo was when the form first mounted — if someone
    // else reassigns the complaint while this tab stays open, the form's
    // stale value must not overwrite that reassignment when Save is
    // clicked.
    await updateComplaint(
      id,
      { ...values, createdBy: complaint?.createdBy ?? null, assignedTo: complaint?.assignedTo ?? null },
      complaint?.status ?? null,
      user?.uid ?? null,
      statusNote,
      statusAttachmentUrls
    );
  }

  async function handleDelete() {
    if (!window.confirm(tCommon("confirmDelete"))) return;
    setDeleting(true);
    await deleteComplaint(id);
    router.push("/dashboard");
  }

  if (complaint === undefined) {
    return <Spinner />;
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
  const assigneeName = (uid: string | null | undefined) =>
    uid ? localizedName(staffById.get(uid), locale) || uid : tCommon("unassigned");

  // The real "created" history entry is written in a second, separate
  // request right after the complaint doc itself is created (see
  // createComplaint() — Firestore's serverTimestamp() can't go inside an
  // arrayUnion() element, so a real server timestamp has to be resolved
  // and appended after the fact). If that second request never completes
  // (the tab closed, a network hiccup, a permission edge case), the
  // complaint is left with no history at all forever, even though it very
  // much was created and possibly assigned. createdAt/createdBy/assignedTo
  // are set atomically in the original transaction, though, so they're
  // always trustworthy — fall back to them instead of leaving history
  // looking empty for these complaints.
  const hasCreatedEntry = complaint.history.some((h) => h.type === "created");
  const hasAssignmentRecord = complaint.history.some((h) => h.type === "created" || h.type === "reassigned");
  const showSyntheticCreated = !hasCreatedEntry;
  const showSyntheticAssigned = !hasAssignmentRecord && !!complaint.assignedTo;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-brand hover:underline"
          >
            &larr; {tCommon("back")}
          </button>
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

      <div className="mt-6 rounded-lg border border-tint-assign-border bg-tint-assign-bg p-6">
        <div className="mb-5 flex items-end justify-between gap-3 border-b border-tint-assign-border pb-5">
          <div>
            <p className="text-xs font-medium text-foreground/50">{t("assignedTo")}</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {complaint.assignedTo ? localizedName(staffById.get(complaint.assignedTo), locale) || complaint.assignedTo : tCommon("unassigned")}
            </p>
          </div>
          {canReassign && (
            <Link
              href={`/complaints/${id}/reassign`}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90"
            >
              {t("reassign")}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6">
        <ComplaintForm
          key={complaint.id}
          staff={staff}
          companies={companies}
          complaintTypes={complaintTypes}
          complaintSources={complaintSources}
          initialValues={{
            subject: complaint.subject,
            description: complaint.description,
            complaintTypeId: complaint.complaintTypeId,
            complaintSourceId: complaint.complaintSourceId,
            companyId: complaint.companyId ?? "",
            customerName: complaint.customerName,
            customerPhone: complaint.customerPhone,
            customerOrderNumber: complaint.customerOrderNumber,
            assignedTo: complaint.assignedTo ?? "",
            status: complaint.status,
            channel: complaint.channel,
            complainantName: complaint.complainantName,
            contactEmail: complaint.contactEmail,
            contactPhone: complaint.contactPhone,
            attachmentUrls: complaint.attachmentUrls,
          }}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
          readOnly={!canEditDetails}
          canEditStatus={canEditStatus}
          hideAssignedTo
          onCancel={() => router.push("/dashboard")}
        />
      </div>

      <div className="mt-6 rounded-lg border border-tint-history-border bg-tint-history-bg p-6">
        <h2 className="text-sm font-semibold text-foreground">{t("history")}</h2>
        {!showSyntheticCreated && !showSyntheticAssigned && complaint.history.length === 0 ? (
          <p className="mt-3 text-sm text-foreground/50">{t("noHistory")}</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {showSyntheticCreated && (
              <li className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <div>
                  <p className="text-foreground/80">{t("historyCreatedBy", { actor: assigneeName(complaint.createdBy) })}</p>
                  <p className="text-xs text-foreground/50">
                    {format.dateTime(new Date(complaint.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              </li>
            )}
            {showSyntheticAssigned && (
              <li className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <div>
                  <p className="text-foreground/80">
                    {t("historyAssignedTo", { assignee: assigneeName(complaint.assignedTo) })}
                  </p>
                  <p className="text-xs text-foreground/50">
                    {format.dateTime(new Date(complaint.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              </li>
            )}
            {[...complaint.history].reverse().map((entry, i) => {
              const actorName = entry.byUid
                ? localizedName(staffById.get(entry.byUid), locale) || entry.byUid
                : t("historyActorPublic");
              const isReassignEntry =
                entry.type === "reassigned" ||
                entry.type === "reassignRequested" ||
                entry.type === "reassignAccepted" ||
                entry.type === "reassignRejected";

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
                      {entry.type === "reassignRequested" &&
                        t("historyReassignRequested", {
                          from: assigneeName(entry.previousAssignedTo),
                          to: assigneeName(entry.assignedTo),
                        })}
                      {entry.type === "reassignAccepted" &&
                        t("historyReassignAccepted", {
                          from: assigneeName(entry.previousAssignedTo),
                          to: assigneeName(entry.assignedTo),
                        })}
                      {entry.type === "reassignRejected" &&
                        t("historyReassignRejected", {
                          from: assigneeName(entry.previousAssignedTo),
                          to: assigneeName(entry.assignedTo),
                        })}
                      {entry.type === "note" && t("historyNoteSaved")}
                    </p>
                    {isReassignEntry && entry.reason && (
                      <p className="text-foreground/60">{t("historyReassignedReason", { reason: entry.reason })}</p>
                    )}
                    {(isReassignEntry || entry.type === "status") && entry.attachmentUrls && entry.attachmentUrls.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {entry.attachmentUrls.map((url, i) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand hover:underline"
                          >
                            {entry.attachmentUrls!.length > 1 ? `${t("viewAttachment")} ${i + 1}` : t("viewAttachment")}
                          </a>
                        ))}
                      </div>
                    )}
                    {entry.type === "status" && entry.note && (
                      <p className="text-foreground/60">{t("historyStatusNote", { note: entry.note })}</p>
                    )}
                    <p className="text-xs text-foreground/50">
                      {actorName} ·{" "}
                      {format.dateTime(new Date(entry.at), { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
