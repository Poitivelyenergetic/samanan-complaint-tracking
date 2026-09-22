"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  TICKET_STATUSES,
  localizedName,
  type Department,
  type StaffUser,
  type TicketInput,
  type TicketSource,
  type TicketStatus,
  type TicketType,
} from "@/lib/types";
import { useAttachmentUpload } from "@/hooks/useAttachmentUpload";
import SearchableSelect from "./SearchableSelect";
import AttachmentUploader from "./AttachmentUploader";

export interface TicketFormValues {
  subject: string;
  description: string;
  ticketTypeId: string;
  ticketSourceId: string;
  departmentId: string; // "" means not yet chosen
  assignedTo: string; // "" means unassigned
  status: TicketStatus;
}

interface TicketFormProps {
  staff: StaffUser[];
  ticketTypes?: TicketType[];
  ticketSources?: TicketSource[];
  // Departments within the fixed administration tickets are always routed
  // to — the caller filters these (see TICKET_ADMINISTRATION_ID).
  departments?: Department[];
  administrationId: string;
  administrationLabel: string;
  // The filing employee's own name — always displayed as fixed text, never
  // an editable field (see Ticket.requesterName in lib/types.ts).
  requesterName: string;
  initialValues?: Partial<TicketFormValues>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: TicketInput, statusNote?: string, statusAttachmentUrls?: string[]) => Promise<void>;
  // Renders every field disabled and hides the submit button.
  readOnly?: boolean;
  // Independent of `readOnly` — the current assignee can move the status
  // even without tickets.update, so the status field's own disabled state
  // is computed separately from the rest of the form.
  canEditStatus?: boolean;
  // Hides the status field entirely — used on New Ticket, where a ticket
  // always starts "Open" without asking.
  hideStatus?: boolean;
  // Hides the department/employee assignment box — used on the ticket
  // detail page, where reassignment is a separate, permission-gated action.
  hideAssignedTo?: boolean;
  // Shows a Cancel button beside Save — used on the ticket detail page, so
  // opening a ticket to look at it never persists an edit unless Save is
  // explicitly clicked. Omitted on New Ticket, where there's nothing to
  // cancel out of yet.
  onCancel?: () => void;
}

const DEFAULT_VALUES: TicketFormValues = {
  subject: "",
  description: "",
  ticketTypeId: "",
  ticketSourceId: "",
  departmentId: "",
  assignedTo: "",
  status: "Open",
};

const textInputClass =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60";

export default function TicketForm({
  staff,
  ticketTypes = [],
  ticketSources = [],
  departments = [],
  administrationId,
  administrationLabel,
  requesterName,
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
  readOnly = false,
  canEditStatus = true,
  hideStatus = false,
  hideAssignedTo = false,
  onCancel,
}: TicketFormProps) {
  const t = useTranslations("ticket.fields");
  const tStatus = useTranslations("status");
  const tCommon = useTranslations("common");
  const tDetail = useTranslations("ticket.detail");
  const tEmployeeFields = useTranslations("employees.fields");
  const locale = useLocale();

  const [values, setValues] = useState<TicketFormValues>({ ...DEFAULT_VALUES, ...initialValues });
  const [initialStatus, setInitialStatus] = useState<TicketStatus | null>(initialValues?.status ?? null);
  const [statusNote, setStatusNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Tracks real edits so clicking Cancel with nothing changed just leaves
  // immediately instead of asking the user to confirm discarding nothing.
  const isDirtyRef = useRef(false);
  // Attaches to whatever the status note says was done, not to the ticket
  // itself — lives on the "status" history entry (mirrors ComplaintForm).
  const statusAttachments = useAttachmentUpload({
    storagePathPrefix: "tickets",
    errorMessage: tDetail("attachmentUploadFailed"),
  });

  // This form stays mounted (keyed only on ticket id) across repeated status
  // changes on the same ticket. Without this, initialStatus froze at
  // whatever status the page first loaded with, so statusChanged stayed true
  // forever after the first edit — forcing every later save to demand a new
  // status note while silently resubmitting whatever attachments were left
  // over in statusAttachments from the previous status change.
  useEffect(() => {
    setInitialStatus(initialValues?.status ?? null);
    setStatusNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    statusAttachments.reset();
  }, [initialValues?.status]);

  const departmentOptions = useMemo(
    () => departments.filter((d) => d.administrationId === administrationId),
    [departments, administrationId]
  );
  const employeeOptions = useMemo(() => {
    if (values.departmentId) return staff.filter((s) => s.departmentId === values.departmentId);
    return staff.filter((s) => s.administrationId === administrationId);
  }, [staff, values.departmentId, administrationId]);

  const assignedEmployee = useMemo(
    () => staff.find((s) => s.id === values.assignedTo) ?? null,
    [staff, values.assignedTo]
  );

  const statusChanged = initialStatus !== null && values.status !== initialStatus;

  function update<K extends keyof TicketFormValues>(key: K, value: TicketFormValues[K]) {
    isDirtyRef.current = true;
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleDepartmentChange(id: string) {
    update("departmentId", id);
    const emp = staff.find((s) => s.id === values.assignedTo);
    if (!id || emp?.departmentId !== id) update("assignedTo", "");
  }

  function handleEmployeeChange(id: string) {
    update("assignedTo", id);
    const emp = staff.find((s) => s.id === id);
    if (emp && !values.departmentId) update("departmentId", emp.departmentId);
  }

  function buildPayload(): TicketInput {
    return {
      subject: values.subject.trim(),
      description: values.description.trim(),
      ticketTypeId: values.ticketTypeId,
      ticketSourceId: values.ticketSourceId,
      requesterName,
      administrationId,
      departmentId: values.departmentId || null,
      assignedTo: values.assignedTo || null,
      status: values.status,
      createdBy: null,
    };
  }

  function handleCancelClick() {
    if (isDirtyRef.current) {
      setShowDiscardConfirm(true);
    } else {
      onCancel?.();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (statusChanged && !statusNote.trim()) {
      setError(tDetail("statusNoteRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(
        buildPayload(),
        statusChanged ? statusNote.trim() : undefined,
        statusChanged ? statusAttachments.urls : undefined
      );
    } catch {
      setError(tCommon("somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  const statusDisabled = !canEditStatus;
  // A pure assignee (no tickets.update) gets readOnly=true but
  // canEditStatus=true — every other field is locked, but they must still
  // be able to save a status-only change. Gating the Save button on bare
  // readOnly would silently discard that edit.
  const canSaveAnything = !readOnly || canEditStatus;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {readOnly && (
        <div className="rounded-md border border-border bg-black/[0.02] px-3 py-2.5 text-sm text-foreground/70">
          {tDetail("readOnlyNotice")}
        </div>
      )}

      <div className="space-y-5 rounded-lg border border-tint-info-border bg-tint-info-bg p-5">
        <div>
          <span className="block text-sm font-medium text-foreground">{t("requester")}</span>
          <p className="mt-1 text-sm text-foreground/70">{requesterName}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="ticketTypeId" className="block text-sm font-medium text-foreground">
              {t("ticketType")}
            </label>
            <div className="mt-1">
              <SearchableSelect
                id="ticketTypeId"
                disabled={readOnly}
                items={ticketTypes}
                value={values.ticketTypeId}
                onChange={(id) => update("ticketTypeId", id)}
                getId={(type) => type.id}
                getLabel={(type) => localizedName(type, locale)}
                placeholder={t("selectTicketType")}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ticketSourceId" className="block text-sm font-medium text-foreground">
              {t("source")}
            </label>
            <div className="mt-1">
              <SearchableSelect
                id="ticketSourceId"
                disabled={readOnly}
                items={ticketSources}
                value={values.ticketSourceId}
                onChange={(id) => update("ticketSourceId", id)}
                getId={(source) => source.id}
                getLabel={(source) => localizedName(source, locale)}
                placeholder={t("selectTicketSource")}
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-foreground">
            {t("subject")}
          </label>
          <input
            id="subject"
            required
            disabled={readOnly}
            value={values.subject}
            onChange={(e) => update("subject", e.target.value)}
            className="mt-1 w-full border-0 border-b border-border bg-transparent px-1 py-2 text-sm text-foreground outline-none focus:border-brand disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-foreground">
            {t("description")}
          </label>
          <textarea
            id="description"
            required
            rows={5}
            disabled={readOnly}
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
            className={textInputClass}
          />
        </div>
      </div>

      {!hideAssignedTo && (
        <div className="space-y-3 rounded-lg border border-tint-assign-border bg-tint-assign-bg p-5">
          <span className="block text-sm font-medium text-foreground">{t("assignedTo")}</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="mb-1 text-xs text-foreground/50">{t("administration")}</p>
              <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground/70">
                {administrationLabel}
              </div>
            </div>
            <SearchableSelect
              items={departmentOptions}
              value={values.departmentId}
              onChange={handleDepartmentChange}
              getId={(d) => d.id}
              getLabel={(d) => localizedName(d, locale)}
              placeholder={t("selectDepartment")}
              disabled={readOnly}
              ariaLabel={t("department")}
            />
            <SearchableSelect
              items={employeeOptions}
              value={values.assignedTo}
              onChange={handleEmployeeChange}
              getId={(m) => m.id}
              getLabel={(m) => localizedName(m, locale)}
              placeholder={tCommon("unassigned")}
              disabled={readOnly}
              ariaLabel={t("assignedTo")}
            />
          </div>

          {assignedEmployee && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border bg-surface p-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-foreground/50">{tEmployeeFields("number")}</dt>
                <dd className="text-sm text-foreground">{assignedEmployee.number || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-foreground/50">{tEmployeeFields("phone")}</dt>
                <dd className="text-sm text-foreground" dir="ltr">{assignedEmployee.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-foreground/50">{tEmployeeFields("jobTitle")}</dt>
                <dd className="text-sm text-foreground">{assignedEmployee.jobTitle || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-foreground/50">{t("assignedTo")}</dt>
                <dd className="text-sm text-foreground">{localizedName(assignedEmployee, locale)}</dd>
              </div>
            </dl>
          )}
        </div>
      )}

      {!hideStatus && (
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-foreground">
            {t("status")}
          </label>
          <div className="mt-1 max-w-xs">
            <SearchableSelect
              id="status"
              disabled={statusDisabled}
              allowClear={false}
              items={TICKET_STATUSES}
              value={values.status}
              onChange={(id) => update("status", id as TicketStatus)}
              getId={(status) => status}
              getLabel={(status) => tStatus(status)}
            />
          </div>
        </div>
      )}

      {statusChanged && !statusDisabled && (
        <div>
          <label htmlFor="statusNote" className="block text-sm font-medium text-foreground">
            {tDetail("statusNoteLabel")}
          </label>
          <textarea
            id="statusNote"
            required
            rows={3}
            value={statusNote}
            onChange={(e) => {
              isDirtyRef.current = true;
              setStatusNote(e.target.value);
            }}
            placeholder={tDetail("statusNotePlaceholder")}
            className={textInputClass}
          />

          <div className="mt-3">
            <AttachmentUploader
              label={t("attachment")}
              urls={statusAttachments.urls}
              uploading={statusAttachments.uploading}
              error={statusAttachments.error}
              dragOver={statusAttachments.dragOver}
              inputRef={statusAttachments.inputRef}
              onDragOver={statusAttachments.handleDragOver}
              onDragLeave={statusAttachments.handleDragLeave}
              onDrop={statusAttachments.handleDrop}
              onInputChange={statusAttachments.handleInputChange}
              onOpenPicker={statusAttachments.openFilePicker}
              onRemove={statusAttachments.remove}
              viewAttachmentLabel={tDetail("viewAttachment")}
              removeLabel={t("removeAttachment")}
              addMoreLabel={t("addMoreFiles")}
              chooseFileLabel={t("chooseFile")}
              dropHintLabel={t("attachmentDropHint")}
              savingLabel={tCommon("saving")}
            />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {canSaveAnything && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? submittingLabel : submitLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={handleCancelClick}
              disabled={submitting}
              className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground/70 hover:bg-black/5 disabled:opacity-60"
            >
              {tCommon("cancel")}
            </button>
          )}
        </div>
      )}

      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">{tDetail("discardTitle")}</h3>
            <p className="mt-1.5 text-sm text-foreground/60">{tDetail("discardBody")}</p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-black/5"
              >
                {tDetail("continueEditing")}
              </button>
              <button
                type="button"
                onClick={() => onCancel?.()}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                {tDetail("discardChanges")}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
