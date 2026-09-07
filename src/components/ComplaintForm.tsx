"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_STATUSES,
  type ComplaintCategory,
  type ComplaintChannel,
  type ComplaintInput,
  type ComplaintStatus,
  type StaffUser,
} from "@/lib/types";

export interface ComplaintFormValues {
  subject: string;
  description: string;
  category: ComplaintCategory;
  customerNumber: string;
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
}

const DEFAULT_VALUES: ComplaintFormValues = {
  subject: "",
  description: "",
  category: "Other",
  customerNumber: "",
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
}: ComplaintFormProps) {
  const t = useTranslations("complaint.fields");
  const tCategory = useTranslations("complaint.categories");
  const tStatus = useTranslations("status");
  const tCommon = useTranslations("common");
  const tDetail = useTranslations("complaint.detail");

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
        customerNumber: values.customerNumber.trim(),
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
          value={values.subject}
          onChange={(e) => update("subject", e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
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
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="customerNumber" className="block text-sm font-medium text-foreground">
            {t("customerNumber")}
          </label>
          <input
            id="customerNumber"
            required
            value={values.customerNumber}
            onChange={(e) => update("customerNumber", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>

        <div>
          <label htmlFor="customerOrderNumber" className="block text-sm font-medium text-foreground">
            {t("customerOrderNumber")}
          </label>
          <input
            id="customerOrderNumber"
            required
            value={values.customerOrderNumber}
            onChange={(e) => update("customerOrderNumber", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-foreground">
            {t("category")}
          </label>
          <select
            id="category"
            value={values.category}
            onChange={(e) => update("category", e.target.value as ComplaintCategory)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            {COMPLAINT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {tCategory(category)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="assignedTo" className="block text-sm font-medium text-foreground">
            {t("assignedTo")}
          </label>
          <select
            id="assignedTo"
            value={values.assignedTo}
            onChange={(e) => update("assignedTo", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            <option value="">{tCommon("unassigned")}</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} — {member.position}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-foreground">
          {t("status")}
        </label>
        <select
          id="status"
          value={values.status}
          onChange={(e) => update("status", e.target.value as ComplaintStatus)}
          className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        >
          {COMPLAINT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {tStatus(status)}
            </option>
          ))}
        </select>
      </div>

      {showAssignHint && (
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

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
