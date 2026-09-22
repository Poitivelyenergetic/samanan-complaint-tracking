"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  COMPLAINT_STATUSES,
  localizedName,
  type Administration,
  type ComplaintChannel,
  type ComplaintInput,
  type ComplaintSource,
  type ComplaintStatus,
  type ComplaintType,
  type Company,
  type Department,
  type StaffUser,
} from "@/lib/types";
import { phoneDigitsOnly, toLatinDigits } from "@/lib/phone";
import { useAttachmentUpload } from "@/hooks/useAttachmentUpload";
import SearchableSelect from "./SearchableSelect";
import AttachmentUploader from "./AttachmentUploader";

export interface ComplaintFormValues {
  description: string;
  complaintTypeId: string;
  complaintSourceId: string;
  companyId: string; // "" means none chosen yet
  customerName: string;
  customerPhone: string;
  customerOrderNumber: string;
  assignedTo: string; // "" means unassigned
  status: ComplaintStatus;
  // Not edited by this form, but carried through unchanged on update so
  // editing a customer-submitted complaint doesn't wipe their contact info.
  // subject is a legacy field with no input of its own anymore (Complaint
  // Type replaced it in every list/table) — kept only so an existing
  // complaint's old subject text isn't wiped out by a later save.
  subject: string;
  channel: ComplaintChannel;
  complainantName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  attachmentUrls: string[];
}

interface ComplaintFormProps {
  staff: StaffUser[];
  complaintTypes?: ComplaintType[];
  complaintSources?: ComplaintSource[];
  // Only needed for the Company/Administration/Department/Employee pickers
  // below — irrelevant (and fine to omit) wherever hideAssignedTo is set.
  companies?: Company[];
  administrations?: Administration[];
  departments?: Department[];
  initialValues?: Partial<ComplaintFormValues>;
  submitLabel: string;
  submittingLabel: string;
  // statusNote is only passed when the status actually changed from what
  // this form started with — required by the caller (updateComplaint logs
  // it on the "status" history entry).
  onSubmit: (values: ComplaintInput, statusNote?: string, statusAttachmentUrls?: string[]) => Promise<void>;
  // Renders every field disabled and hides the submit button — used for
  // roles that can view but not edit/reassign/change the status of a
  // complaint.
  readOnly?: boolean;
  // Independent of `readOnly` — the current assignee can move the status
  // even without complaints.update, so the status field's own disabled
  // state is computed separately from the rest of the form.
  canEditStatus?: boolean;
  // Hides the "assigned to" box entirely and excludes it from the submit
  // payload. Used on the complaint detail page, where reassignment is a
  // separate, permission-gated action (see the Reassign control) rather
  // than part of the general edit form.
  hideAssignedTo?: boolean;
  // Shows a Cancel button beside Save — used on the complaint detail (edit)
  // page, where an employee opening a complaint to look at it should never
  // have any edit persisted unless they explicitly click Save. Omitted on
  // New Complaint, where there's nothing to cancel out of yet.
  onCancel?: () => void;
}

const DEFAULT_VALUES: ComplaintFormValues = {
  subject: "",
  description: "",
  complaintTypeId: "",
  complaintSourceId: "",
  companyId: "",
  customerName: "",
  customerPhone: "",
  customerOrderNumber: "",
  assignedTo: "",
  status: "Open",
  channel: "staff",
  complainantName: null,
  contactEmail: null,
  contactPhone: null,
  attachmentUrls: [],
};

const textInputClass =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60";

export default function ComplaintForm({
  staff,
  complaintTypes = [],
  complaintSources = [],
  companies = [],
  administrations = [],
  departments = [],
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
  readOnly = false,
  canEditStatus = true,
  hideAssignedTo = false,
  onCancel,
}: ComplaintFormProps) {
  const t = useTranslations("complaint.fields");
  const tStatus = useTranslations("status");
  const tCommon = useTranslations("common");
  const tDetail = useTranslations("complaint.detail");
  const tEmployeeFields = useTranslations("employees.fields");
  const locale = useLocale();

  const [values, setValues] = useState<ComplaintFormValues>({ ...DEFAULT_VALUES, ...initialValues });
  const [initialStatus, setInitialStatus] = useState<ComplaintStatus | null>(initialValues?.status ?? null);
  const [statusNote, setStatusNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Tracks real edits so clicking Cancel with nothing changed just leaves
  // immediately instead of asking the user to confirm discarding nothing.
  const isDirtyRef = useRef(false);

  const attachments = useAttachmentUpload({
    storagePathPrefix: "complaints",
    errorMessage: tDetail("attachmentUploadFailed"),
    controlled: {
      urls: values.attachmentUrls,
      setUrls: (updater) => update("attachmentUrls", updater(values.attachmentUrls)),
    },
  });
  // Separate from the complaint's own attachments above — these attach to
  // whatever the status note says was done (e.g. proof the customer was
  // contacted before closing/cancelling), not to the complaint record
  // itself, so they live on the "status" history entry instead.
  const statusAttachments = useAttachmentUpload({
    storagePathPrefix: "complaints",
    errorMessage: tDetail("attachmentUploadFailed"),
  });

  // This form stays mounted (keyed only on complaint id) across repeated
  // status changes on the same complaint. Without this, initialStatus froze
  // at whatever status the page first loaded with, so statusChanged stayed
  // true forever after the first edit — forcing every later save to demand
  // a new status note while silently resubmitting whatever attachments were
  // left over in statusAttachments from the previous status change.
  useEffect(() => {
    setInitialStatus(initialValues?.status ?? null);
    setStatusNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    statusAttachments.reset();
  }, [initialValues?.status]);

  // Administration/department are transient UI filters that narrow the
  // employee picker — only companyId and assignedTo actually get submitted.
  const [administrationId, setAdministrationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const administrationOptions = useMemo(
    () => (values.companyId ? administrations.filter((a) => a.companyId === values.companyId) : administrations),
    [administrations, values.companyId]
  );
  const departmentOptions = useMemo(() => {
    if (administrationId) return departments.filter((d) => d.administrationId === administrationId);
    if (values.companyId) {
      const adminIds = new Set(administrations.filter((a) => a.companyId === values.companyId).map((a) => a.id));
      return departments.filter((d) => adminIds.has(d.administrationId));
    }
    return departments;
  }, [departments, administrations, administrationId, values.companyId]);
  const employeeOptions = useMemo(() => {
    if (departmentId) return staff.filter((s) => s.departmentId === departmentId);
    if (administrationId) return staff.filter((s) => s.administrationId === administrationId);
    if (values.companyId) return staff.filter((s) => s.companyId === values.companyId);
    return staff;
  }, [staff, departmentId, administrationId, values.companyId]);

  const assignedEmployee = useMemo(
    () => staff.find((s) => s.id === values.assignedTo) ?? null,
    [staff, values.assignedTo]
  );

  const statusChanged = initialStatus !== null && values.status !== initialStatus;
  const statusDisabled = !canEditStatus;
  // A pure assignee (no complaints.update) gets readOnly=true but
  // canEditStatus=true — every other field is locked, but they must still
  // be able to save a status-only change. Gating the Save button on bare
  // readOnly would silently discard that edit.
  const canSaveAnything = !readOnly || canEditStatus;

  function update<K extends keyof ComplaintFormValues>(key: K, value: ComplaintFormValues[K]) {
    isDirtyRef.current = true;
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Assigning someone to a still-Open complaint moves it to Assigned
      // automatically — this used to just show a hint suggesting the user
      // do this themselves, but there's no real reason to make them.
      if (key === "assignedTo" && prev.assignedTo === "" && value !== "" && prev.status === "Open") {
        next.status = "Assigned";
      }
      return next;
    });
  }

  function handleCompanyChange(id: string) {
    update("companyId", id);
    const admin = administrations.find((a) => a.id === administrationId);
    if (!id || admin?.companyId !== id) {
      setAdministrationId("");
      setDepartmentId("");
      update("assignedTo", "");
    }
  }

  function handleAdministrationChange(id: string) {
    setAdministrationId(id);
    const admin = administrations.find((a) => a.id === id);
    if (admin && !values.companyId) update("companyId", admin.companyId);
    const dept = departments.find((d) => d.id === departmentId);
    if (!id || dept?.administrationId !== id) {
      setDepartmentId("");
      update("assignedTo", "");
    }
  }

  function handleDepartmentChange(id: string) {
    setDepartmentId(id);
    const dept = departments.find((d) => d.id === id);
    if (dept) {
      if (!administrationId) setAdministrationId(dept.administrationId);
      if (!values.companyId) {
        const admin = administrations.find((a) => a.id === dept.administrationId);
        if (admin) update("companyId", admin.companyId);
      }
    }
    const emp = staff.find((s) => s.id === values.assignedTo);
    if (!id || emp?.departmentId !== id) update("assignedTo", "");
  }

  function handleEmployeeChange(id: string) {
    update("assignedTo", id);
    const emp = staff.find((s) => s.id === id);
    if (emp) {
      setDepartmentId(emp.departmentId);
      setAdministrationId(emp.administrationId);
      if (!values.companyId) update("companyId", emp.companyId);
    }
  }

  function buildPayload(): ComplaintInput {
    return {
      subject: values.subject.trim(),
      description: values.description.trim(),
      complaintTypeId: values.complaintTypeId,
      complaintSourceId: values.complaintSourceId,
      companyId: values.companyId || null,
      customerName: values.customerName.trim(),
      customerPhone: values.customerPhone.trim(),
      customerOrderNumber: values.customerOrderNumber.trim(),
      assignedTo: values.assignedTo || null,
      status: values.status,
      channel: values.channel,
      complainantName: values.complainantName,
      contactEmail: values.contactEmail,
      contactPhone: values.contactPhone,
      attachmentUrls: values.attachmentUrls,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {readOnly && !canEditStatus && (
        <div className="rounded-md border border-border bg-black/[0.02] px-3 py-2.5 text-sm text-foreground/70">
          {tDetail("readOnlyNotice")}
        </div>
      )}
      {readOnly && canEditStatus && (
        <div className="rounded-md border border-border bg-black/[0.02] px-3 py-2.5 text-sm text-foreground/70">
          {tDetail("statusOnlyNotice")}
        </div>
      )}

      {values.channel === "public" && (values.complainantName || values.contactEmail || values.contactPhone) && (
        <div className="rounded-md border border-border bg-black/[0.02] px-3 py-2.5 text-sm">
          <p className="font-medium text-foreground">{tDetail("submittedByCustomer")}</p>
          <p className="mt-1 text-foreground/70">
            {values.complainantName}
            {values.contactEmail ? ` · ${values.contactEmail}` : ""}
            {values.contactPhone ? ` · ${values.contactPhone}` : ""}
          </p>
          {values.attachmentUrls.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {values.attachmentUrls.map((url, i) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-brand hover:underline"
                >
                  {values.attachmentUrls.length > 1 ? `${tDetail("viewAttachment")} ${i + 1}` : tDetail("viewAttachment")}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Complaint info — its own tinted card, distinct from the assignment box below. */}
      <div className="space-y-5 rounded-lg border border-tint-info-border bg-tint-info-bg p-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <label htmlFor="complaintTypeId" className="block text-sm font-medium text-foreground">
              {t("complaintType")}
            </label>
            <div className="mt-1">
              <SearchableSelect
                id="complaintTypeId"
                disabled={readOnly}
                items={complaintTypes}
                value={values.complaintTypeId}
                onChange={(id) => update("complaintTypeId", id)}
                getId={(type) => type.id}
                getLabel={(type) => localizedName(type, locale)}
                placeholder={t("selectComplaintType")}
              />
            </div>
          </div>

          <div>
            <label htmlFor="complaintSourceId" className="block text-sm font-medium text-foreground">
              {t("source")}
            </label>
            <div className="mt-1">
              <SearchableSelect
                id="complaintSourceId"
                disabled={readOnly}
                items={complaintSources}
                value={values.complaintSourceId}
                onChange={(id) => update("complaintSourceId", id)}
                getId={(source) => source.id}
                getLabel={(source) => localizedName(source, locale)}
                placeholder={t("selectComplaintSource")}
              />
            </div>
          </div>

          <div>
            <label htmlFor="companyId" className="block text-sm font-medium text-foreground">
              {t("company")}
            </label>
            <div className="mt-1">
              <SearchableSelect
                id="companyId"
                items={companies}
                value={values.companyId}
                onChange={handleCompanyChange}
                getId={(c) => c.id}
                getLabel={(c) => localizedName(c, locale)}
                placeholder={t("selectCompany")}
                disabled={readOnly}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="customerPhone" className="block text-sm font-medium text-foreground">
              {t("customerPhone")}
            </label>
            <input
              id="customerPhone"
              dir="ltr"
              disabled={readOnly}
              value={values.customerPhone}
              onChange={(e) => update("customerPhone", phoneDigitsOnly(toLatinDigits(e.target.value)))}
              className={textInputClass}
            />
          </div>
          <div>
            <label htmlFor="customerName" className="block text-sm font-medium text-foreground">
              {t("customerName")}
            </label>
            <input
              id="customerName"
              required
              disabled={readOnly}
              value={values.customerName}
              onChange={(e) => update("customerName", e.target.value.replace(/[0-9٠-٩۰-۹]/g, ""))}
              className={textInputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="customerOrderNumber" className="block text-sm font-medium text-foreground">
            {t("customerOrderNumber")}
          </label>
          <input
            id="customerOrderNumber"
            disabled={readOnly}
            value={values.customerOrderNumber}
            onChange={(e) => update("customerOrderNumber", e.target.value)}
            className={`${textInputClass} max-w-xs`}
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

        <AttachmentUploader
          label={t("attachment")}
          readOnly={readOnly}
          urls={attachments.urls}
          uploading={attachments.uploading}
          error={attachments.error}
          dragOver={attachments.dragOver}
          inputRef={attachments.inputRef}
          onDragOver={attachments.handleDragOver}
          onDragLeave={attachments.handleDragLeave}
          onDrop={attachments.handleDrop}
          onInputChange={attachments.handleInputChange}
          onOpenPicker={attachments.openFilePicker}
          onRemove={attachments.remove}
          viewAttachmentLabel={tDetail("viewAttachment")}
          removeLabel={t("removeAttachment")}
          addMoreLabel={t("addMoreFiles")}
          chooseFileLabel={t("chooseFile")}
          dropHintLabel={t("attachmentDropHint")}
          savingLabel={tCommon("saving")}
        />
      </div>

      {!hideAssignedTo && (
        <div className="space-y-3 rounded-lg border border-tint-assign-border bg-tint-assign-bg p-5">
          <span className="block text-sm font-medium text-foreground">{t("assignedTo")}</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SearchableSelect
              items={administrationOptions}
              value={administrationId}
              onChange={handleAdministrationChange}
              getId={(a) => a.id}
              getLabel={(a) => localizedName(a, locale)}
              placeholder={tEmployeeFields("selectAdministration")}
              disabled={readOnly}
              ariaLabel={tEmployeeFields("administration")}
            />
            <SearchableSelect
              items={departmentOptions}
              value={departmentId}
              onChange={handleDepartmentChange}
              getId={(d) => d.id}
              getLabel={(d) => localizedName(d, locale)}
              placeholder={tEmployeeFields("selectDepartment")}
              disabled={readOnly}
              ariaLabel={tEmployeeFields("department")}
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

      <div className="rounded-lg border border-tint-status-border bg-tint-status-bg p-5">
        <label htmlFor="status" className="block text-sm font-medium text-foreground">
          {t("status")}
        </label>
        <div className="mt-1 max-w-xs">
          <SearchableSelect
            id="status"
            disabled={statusDisabled}
            allowClear={false}
            items={COMPLAINT_STATUSES}
            value={values.status}
            onChange={(id) => update("status", id as ComplaintStatus)}
            getId={(status) => status}
            getLabel={(status) => tStatus(status)}
          />
        </div>
      </div>

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
