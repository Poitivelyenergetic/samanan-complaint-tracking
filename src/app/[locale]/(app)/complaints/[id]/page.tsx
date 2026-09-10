"use client";

import { use, useEffect, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  acceptReassignment,
  deleteComplaint,
  rejectReassignment,
  subscribeToComplaint,
  updateComplaint,
  updateComplaintNotes,
} from "@/lib/complaints";
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
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [resolvingReassignment, setResolvingReassignment] = useState(false);

  // Without complaints.update, an account gets a read-only view. Default to
  // read-only (rather than editable) if the profile hasn't loaded yet,
  // since that's the safer failure mode.
  const canEdit = hasPermission(profile, "complaints", "update");
  const canDelete = hasPermission(profile, "complaints", "delete");
  const canReassign = hasPermission(profile, "complaints", "reassign");
  const canAcceptReassignment = hasPermission(profile, "complaints", "acceptReassignment");

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
  useEffect(() => {
    if (complaint) Promise.resolve().then(() => setNotes(complaint.notes));
  }, [complaint]);

  async function handleSubmit(values: ComplaintInput, statusNote?: string) {
    await updateComplaint(id, values, complaint?.status ?? null, user?.uid ?? null, statusNote);
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    setNotesSaved(false);
    try {
      await updateComplaintNotes(id, notes);
      setNotesSaved(true);
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleAcceptReassignment() {
    if (!complaint?.pendingReassignment) return;
    setResolvingReassignment(true);
    try {
      await acceptReassignment(id, complaint.pendingReassignment, complaint.assignedTo, user?.uid ?? null);
    } finally {
      setResolvingReassignment(false);
    }
  }

  async function handleRejectReassignment() {
    if (!complaint?.pendingReassignment) return;
    setResolvingReassignment(true);
    try {
      await rejectReassignment(id, complaint.pendingReassignment, complaint.assignedTo, user?.uid ?? null);
    } finally {
      setResolvingReassignment(false);
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
  const assigneeName = (uid: string | null | undefined) =>
    uid ? localizedName(staffById.get(uid), locale) || uid : tCommon("unassigned");

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

        {complaint.pendingReassignment && (
          <div className="mb-5 rounded-md border border-brand/30 bg-brand/5 px-3 py-2.5">
            <p className="text-sm font-semibold text-foreground">{t("pendingReassignment")}</p>
            <p className="mt-1 text-sm text-foreground/80">
              {t("pendingReassignmentTo", { to: assigneeName(complaint.pendingReassignment.assignedTo) })}
            </p>
            <p className="text-sm text-foreground/60">
              {t("historyReassignedReason", { reason: complaint.pendingReassignment.reason })}
            </p>
            <p className="mt-1 text-xs text-foreground/50">
              {t("pendingReassignmentBy", { by: assigneeName(complaint.pendingReassignment.requestedBy) })}
            </p>
            {canAcceptReassignment && (
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAcceptReassignment}
                  disabled={resolvingReassignment}
                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {resolvingReassignment ? t("accepting") : t("accept")}
                </button>
                <button
                  type="button"
                  onClick={handleRejectReassignment}
                  disabled={resolvingReassignment}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  {resolvingReassignment ? t("rejecting") : t("reject")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6">
        <ComplaintForm
          key={complaint.id + complaint.updatedAt}
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
            attachmentUrl: complaint.attachmentUrl,
          }}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
          readOnly={!canEdit}
          hideAssignedTo
        />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-foreground">{t("notes")}</h2>
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setNotesSaved(false);
          }}
          placeholder={t("notesPlaceholder")}
          className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveNotes}
            disabled={savingNotes || notes === complaint.notes}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
          >
            {savingNotes ? t("savingNote") : t("saveNote")}
          </button>
          {notesSaved && <span className="text-xs text-foreground/50">{t("noteSaved")}</span>}
        </div>
      </div>

      {complaint.history.length > 0 && (
        <div className="mt-6 rounded-lg border border-tint-history-border bg-tint-history-bg p-6">
          <h2 className="text-sm font-semibold text-foreground">{t("history")}</h2>
          <ol className="mt-3 space-y-3">
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
                    </p>
                    {isReassignEntry && entry.reason && (
                      <p className="text-foreground/60">{t("historyReassignedReason", { reason: entry.reason })}</p>
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
        </div>
      )}
    </div>
  );
}
