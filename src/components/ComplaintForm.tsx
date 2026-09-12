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
import { toLatinDigits } from "@/lib/phone";
import SearchableSelect from "./SearchableSelect";

export interface ComplaintFormValues {
  subject: string;
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
  channel: ComplaintChannel;
  complainantName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  attachmentUrl: string | null;
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
  onSubmit: (values: ComplaintInput, statusNote?: string) => Promise<void>;
  // Renders every field disabled and hides the submit button — used for
  // roles that can view but not edit/reassign/change the status of a
  // complaint.
  readOnly?: boolean;
  // Hides the "assigned to" box entirely and excludes it from the submit
  // payload. Used on the complaint detail page, where reassignment is a
  // separate, permission-gated action (see the Reassign control) rather
  // than part of the general edit form.
  hideAssignedTo?: boolean;
  // Saves automatically (debounced) as fields change instead of requiring a
  // submit click — hides the submit button, replaced by an inline
  // saving/saved indicator. Used on the complaint detail (edit) page only;
  // the New Complaint page still submits explicitly since there's nothing
  // to save until the first submit creates the document.
  autosave?: boolean;
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
  attachmentUrl: null,
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
  hideAssignedTo = false,
  autosave = false,
}: ComplaintFormProps) {
  const t = useTranslations("complaint.fields");
  const tStatus = useTranslations("status");
  const tCommon = useTranslations("common");
  const tDetail = useTranslations("complaint.detail");
  const tEmployeeFields = useTranslations("employees.fields");
  const locale = useLocale();

  const [values, setValues] = useState<ComplaintFormValues>({ ...DEFAULT_VALUES, ...initialValues });
  const [initialStatus] = useState<ComplaintStatus | null>(initialValues?.status ?? null);
  const [statusNote, setStatusNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAssignHint, setShowAssignHint] = useState(false);

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

  // Autosave only ever fires because of an actual edit — never merely
  // because the values/statusNote effect happened to re-run (e.g. React
  // Strict Mode's dev-only double-invoke of effects on mount, which would
  // otherwise autosave a no-op "change" of the freshly loaded data).
  const hasEditedRef = useRef(false);

  function update<K extends keyof ComplaintFormValues>(key: K, value: ComplaintFormValues[K]) {
    hasEditedRef.current = true;
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "assignedTo" && prev.assignedTo === "" && value !== "" && prev.status === "Open") {
        setShowAssignHint(true);
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
      attachmentUrl: values.attachmentUrl,
      createdBy: null,
    };
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
      await onSubmit(buildPayload(), statusChanged ? statusNote.trim() : undefined);
    } catch {
      setError(tCommon("somethingWentWrong"));
      setSubmitting(false);
    }
  }

  // Autosave: debounce every change and save automatically instead of
  // waiting for a submit click. Gated on hasEditedRef so it never fires
  // before the user has actually touched anything. If the status changed
  // but the required note hasn't been typed yet, it waits rather than
  // saving an invalid update — the note field's own onChange (which also
  // sets hasEditedRef) re-triggers this effect once it is.
  const autosaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (!autosave || readOnly) return;
    if (!hasEditedRef.current) return;
    if (statusChanged && !statusNote.trim()) return;

    if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
    autosaveTimeout.current = setTimeout(async () => {
      setAutosaveStatus("saving");
      setError(null);
      try {
        await onSubmit(buildPayload(), statusChanged ? statusNote.trim() : undefined);
        setAutosaveStatus("saved");
      } catch {
        setError(tCommon("somethingWentWrong"));
        setAutosaveStatus("idle");
      }
    }, 900);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, readOnly, values, statusNote]);

  useEffect(() => {
    return () => {
      if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
    };
  }, []);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {readOnly && (
        <div className="rounded-md border border-border bg-black/[0.02] px-3 py-2.5 text-sm text-foreground/70">
          {tDetail("readOnlyNotice")}
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
          {values.attachmentUrl && (
            <a
              href={values.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-brand hover:underline"
            >
              {tDetail("viewAttachment")}
            </a>
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
              onChange={(e) => update("customerPhone", toLatinDigits(e.target.value))}
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
              onChange={(e) => update("customerName", e.target.value)}
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
            required
            disabled={readOnly}
            value={values.customerOrderNumber}
            onChange={(e) => update("customerOrderNumber", e.target.value)}
            className={`${textInputClass} max-w-xs`}
          />
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

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-foreground">
          {t("status")}
        </label>
        <div className="mt-1 max-w-xs">
          <SearchableSelect
            id="status"
            disabled={readOnly}
            allowClear={false}
            items={COMPLAINT_STATUSES}
            value={values.status}
            onChange={(id) => update("status", id as ComplaintStatus)}
            getId={(status) => status}
            getLabel={(status) => tStatus(status)}
          />
        </div>
      </div>

      {statusChanged && !readOnly && (
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
              hasEditedRef.current = true;
              setStatusNote(e.target.value);
            }}
            placeholder={tDetail("statusNotePlaceholder")}
            className={textInputClass}
          />
        </div>
      )}

      {showAssignHint && !readOnly && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-brand/30 bg-brand/5 px-3 py-2.5 text-sm">
          <p className="text-foreground/80">{tDetail("assignHint")}</p>
          <button
            type="button"
            onClick={() => {
              update("status", "Assigned");
              setShowAssignHint(false);
            }}
            className="shrink-0 rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-brand-foreground hover:opacity-90"
          >
            {tStatus("Assigned")}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {!readOnly && !autosave && (
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? submittingLabel : submitLabel}
        </button>
      )}

      {!readOnly && autosave && autosaveStatus !== "idle" && (
        <p className="text-sm text-foreground/50">
          {autosaveStatus === "saving" ? tCommon("autosaving") : tCommon("autosaved")}
        </p>
      )}
    </form>
  );
}
