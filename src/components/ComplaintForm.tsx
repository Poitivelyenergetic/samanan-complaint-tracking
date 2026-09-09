"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_SOURCES,
  COMPLAINT_STATUSES,
  localizedName,
  type ComplaintCategory,
  type ComplaintChannel,
  type ComplaintInput,
  type ComplaintSource,
  type ComplaintStatus,
  type StaffUser,
} from "@/lib/types";

export interface ComplaintFormValues {
  subject: string;
  description: string;
  category: ComplaintCategory;
  source: ComplaintSource;
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
  initialValues?: Partial<ComplaintFormValues>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: ComplaintInput) => Promise<void>;
  // Renders every field disabled and hides the submit button — used for
  // roles that can view but not edit/reassign/change the status of a
  // complaint.
  readOnly?: boolean;
  // Hides the "assigned to" field entirely and excludes it from the submit
  // payload. Used on the complaint detail page, where reassignment is a
  // separate, permission-gated action (see the Reassign control) rather
  // than part of the general edit form.
  hideAssignedTo?: boolean;
}

const DEFAULT_VALUES: ComplaintFormValues = {
  subject: "",
  description: "",
  category: "Other",
  source: "Website",
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

export default function ComplaintForm({
  staff,
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
  readOnly = false,
  hideAssignedTo = false,
}: ComplaintFormProps) {
  const t = useTranslations("complaint.fields");
  const tCategory = useTranslations("complaint.categories");
  const tSource = useTranslations("complaint.sources");
  const tStatus = useTranslations("status");
  const tCommon = useTranslations("common");
  const tDetail = useTranslations("complaint.detail");
  const locale = useLocale();

  const [values, setValues] = useState<ComplaintFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAssignHint, setShowAssignHint] = useState(false);

  function update<K extends keyof ComplaintFormValues>(key: K, value: ComplaintFormValues[K]) {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      if (
        key === "assignedTo" &&
        prev.assignedTo === "" &&
        value !== "" &&
        prev.status === "Open"
      ) {
        setShowAssignHint(true);
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        subject: values.subject.trim(),
        description: values.description.trim(),
        category: values.category,
        source: values.source,
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
      });
    } catch {
      setError(tCommon("somethingWentWrong"));
      setSubmitting(false);
    }
  }

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
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
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
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
          />
        </div>

        <div>
          <label htmlFor="customerPhone" className="block text-sm font-medium text-foreground">
            {t("customerPhone")}
          </label>
          <input
            id="customerPhone"
            dir="ltr"
            disabled={readOnly}
            value={values.customerPhone}
            onChange={(e) => update("customerPhone", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
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
          className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-foreground">
            {t("category")}
          </label>
          <select
            id="category"
            disabled={readOnly}
            value={values.category}
            onChange={(e) => update("category", e.target.value as ComplaintCategory)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
          >
            {COMPLAINT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {tCategory(category)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="source" className="block text-sm font-medium text-foreground">
            {t("source")}
          </label>
          <select
            id="source"
            disabled={readOnly}
            value={values.source}
            onChange={(e) => update("source", e.target.value as ComplaintSource)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
          >
            {COMPLAINT_SOURCES.map((source) => (
              <option key={source} value={source}>
                {tSource(source)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!hideAssignedTo && (
        <div>
          <label htmlFor="assignedTo" className="block text-sm font-medium text-foreground">
            {t("assignedTo")}
          </label>
          <select
            id="assignedTo"
            disabled={readOnly}
            value={values.assignedTo}
            onChange={(e) => update("assignedTo", e.target.value)}
            className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
          >
            <option value="">{tCommon("unassigned")}</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {localizedName(member, locale)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-foreground">
          {t("status")}
        </label>
        <select
          id="status"
          disabled={readOnly}
          value={values.status}
          onChange={(e) => update("status", e.target.value as ComplaintStatus)}
          className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
        >
          {COMPLAINT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {tStatus(status)}
            </option>
          ))}
        </select>
      </div>

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

      {!readOnly && (
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? submittingLabel : submitLabel}
        </button>
      )}
    </form>
  );
}
