"use client";

import { use, useEffect, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteTicket, subscribeToTicket, updateTicket, updateTicketNotes, TICKET_ADMINISTRATION_ID } from "@/lib/tickets";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToDepartments } from "@/lib/departments";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToTicketTypes } from "@/lib/ticketTypes";
import { subscribeToTicketSources } from "@/lib/ticketSources";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  localizedName,
  type Administration,
  type Department,
  type StaffUser,
  type Ticket,
  type TicketInput,
  type TicketSource,
  type TicketType,
} from "@/lib/types";
import TicketForm from "@/components/TicketForm";

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("ticket.detail");
  const tStatus = useTranslations("status");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const { user, profile } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [ticketSources, setTicketSources] = useState<TicketSource[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const canEdit = hasPermission(profile, "tickets", "update");
  const canDelete = hasPermission(profile, "tickets", "delete");
  const canReassign = hasPermission(profile, "tickets", "reassign");
  const isAssignee = !!ticket && !!user && ticket.assignedTo === user.uid;
  const canEditStatus = canEdit || isAssignee;

  useEffect(() => subscribeToTicket(id, setTicket, () => setTicket(null)), [id]);
  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToTicketTypes(setTicketTypes), []);
  useEffect(() => subscribeToTicketSources(setTicketSources), []);
  useEffect(() => {
    if (ticket) Promise.resolve().then(() => setNotes(ticket.notes));
  }, [ticket]);

  const administration = administrations.find((a) => a.id === TICKET_ADMINISTRATION_ID);
  const administrationLabel = administration ? localizedName(administration, locale) : "";

  async function handleSubmit(values: TicketInput, statusNote?: string) {
    // TicketForm is mounted with hideAssignedTo, so its internal
    // assignedTo/departmentId are whatever the ticket's were when the form
    // first mounted — if someone else reassigns the ticket while this tab
    // stays open, the form's stale values must not overwrite that
    // reassignment when Save is clicked (mirrors the createdBy/requesterName
    // restores below).
    await updateTicket(
      id,
      {
        ...values,
        requesterName: ticket?.requesterName ?? values.requesterName,
        createdBy: ticket?.createdBy ?? null,
        assignedTo: ticket?.assignedTo ?? null,
        departmentId: ticket?.departmentId ?? null,
      },
      ticket?.status ?? null,
      user?.uid ?? null,
      statusNote
    );
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    setNotesSaved(false);
    try {
      await updateTicketNotes(id, notes, user?.uid ?? null);
      setNotesSaved(true);
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(tCommon("confirmDelete"))) return;
    setDeleting(true);
    await deleteTicket(id);
    router.push("/tickets");
  }

  if (ticket === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (ticket === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/tickets" className="mt-2 inline-block text-sm text-brand hover:underline">
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
          <Link href="/tickets" className="text-sm text-brand hover:underline">
            &larr; {tCommon("back")}
          </Link>
          <h1 className="mt-1 text-xl font-bold text-foreground">{t("editTitle")}</h1>
          <p className="mt-0.5 font-mono text-xs text-foreground/50">{ticket.id}</p>
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
          {tCommon("createdAt")}: {format.dateTime(new Date(ticket.createdAt), { dateStyle: "medium", timeStyle: "short" })}
        </span>
        <span>
          {tCommon("updatedAt")}: {format.dateTime(new Date(ticket.updatedAt), { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>

      <div className="mt-6 rounded-lg border border-tint-assign-border bg-tint-assign-bg p-6">
        <div className="mb-5 flex items-end justify-between gap-3 border-b border-tint-assign-border pb-5">
          <div>
            <p className="text-xs font-medium text-foreground/50">{t("assignedTo")}</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{assigneeName(ticket.assignedTo)}</p>
          </div>
          {canReassign && (
            <Link
              href={`/tickets/${id}/reassign`}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90"
            >
              {t("reassign")}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6">
        <TicketForm
          key={ticket.id}
          staff={staff}
          departments={departments}
          administrationId={TICKET_ADMINISTRATION_ID}
          administrationLabel={administrationLabel}
          requesterName={ticket.requesterName}
          ticketTypes={ticketTypes}
          ticketSources={ticketSources}
          initialValues={{
            subject: ticket.subject,
            description: ticket.description,
            ticketTypeId: ticket.ticketTypeId,
            ticketSourceId: ticket.ticketSourceId,
            departmentId: ticket.departmentId ?? "",
            assignedTo: ticket.assignedTo ?? "",
            status: ticket.status,
          }}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
          readOnly={!canEdit}
          canEditStatus={canEditStatus}
          hideAssignedTo
          onCancel={() => router.push("/tickets")}
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
            disabled={savingNotes || notes === ticket.notes}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
          >
            {savingNotes ? t("savingNote") : t("saveNote")}
          </button>
          {notesSaved && <span className="text-xs text-foreground/50">{t("noteSaved")}</span>}
        </div>
      </div>

      {ticket.history.length > 0 && (
        <div className="mt-6 rounded-lg border border-tint-history-border bg-tint-history-bg p-6">
          <h2 className="text-sm font-semibold text-foreground">{t("history")}</h2>
          <ol className="mt-3 space-y-3">
            {[...ticket.history].reverse().map((entry, i) => {
              const actorName = entry.byUid ? localizedName(staffById.get(entry.byUid), locale) || entry.byUid : "—";

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
                      {entry.type === "note" && t("historyNoteSaved")}
                    </p>
                    {entry.type === "reassigned" && entry.reason && (
                      <p className="text-foreground/60">{t("historyReassignedReason", { reason: entry.reason })}</p>
                    )}
                    {entry.type === "status" && entry.note && (
                      <p className="text-foreground/60">{t("historyStatusNote", { note: entry.note })}</p>
                    )}
                    {entry.type === "note" && entry.note && (
                      <p className="whitespace-pre-wrap text-foreground/60">{entry.note}</p>
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
