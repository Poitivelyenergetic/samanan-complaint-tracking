"use client";

export const dynamic = "force-dynamic";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createPublicComplaint } from "@/lib/complaints";
import { COMPLAINT_CATEGORIES, type ComplaintCategory } from "@/lib/types";
import PublicShell, { BrandHeader } from "@/components/PublicShell";

interface FormValues {
  customerOrderNumber: string;
  complainantName: string;
  contactEmail: string;
  contactPhone: string;
  category: ComplaintCategory;
  description: string;
}

const DEFAULT_VALUES: FormValues = {
  customerOrderNumber: "",
  complainantName: "",
  contactEmail: "",
  contactPhone: "",
  category: "Other",
  description: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;

export default function PublicComplaintPage() {
  const t = useTranslations("publicComplaint");
  const tCategory = useTranslations("complaint.categories");
  const tCommon = useTranslations("common");

  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>(null);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormValues, string>> = {};

    if (!values.customerOrderNumber.trim()) {
      next.customerOrderNumber = t("errors.orderIdRequired");
    }
    if (!values.complainantName.trim()) {
      next.complainantName = t("errors.nameRequired");
    }

    const email = values.contactEmail.trim();
    const phone = values.contactPhone.trim();
    if (!email && !phone) {
      next.contactEmail = t("errors.contactRequired");
      next.contactPhone = t("errors.contactRequired");
    } else {
      if (email && !EMAIL_RE.test(email)) next.contactEmail = t("errors.emailInvalid");
      if (phone && !PHONE_RE.test(phone)) next.contactPhone = t("errors.phoneInvalid");
    }

    if (!values.description.trim() || values.description.trim().length < 10) {
      next.description = t("errors.descriptionTooShort");
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const id = await createPublicComplaint({
        customerOrderNumber: values.customerOrderNumber.trim(),
        complainantName: values.complainantName.trim(),
        contactEmail: values.contactEmail.trim() || null,
        contactPhone: values.contactPhone.trim() || null,
        category: values.category,
        description: values.description.trim(),
        attachmentUrl: null,
      });
      setReferenceId(id);
    } catch {
      setSubmitError(tCommon("somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  if (referenceId) {
    return (
      <PublicShell maxWidthClassName="max-w-md">
        <BrandHeader />
        <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
            ✓
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">{t("success.title")}</h2>
          <p className="mt-1 text-sm text-foreground/60">{t("success.subtitle")}</p>

          <div className="mt-4 rounded-md border border-border bg-black/[0.02] px-4 py-3">
            <p className="text-xs text-foreground/50">{t("success.referenceLabel")}</p>
            <p className="mt-1 select-all font-mono text-base font-semibold text-foreground" dir="ltr">
              {referenceId}
            </p>
          </div>
          <p className="mt-3 text-xs text-foreground/50">{t("success.saveHint")}</p>

          <Link
            href="/complaint/status"
            className="mt-5 inline-block w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {t("success.checkStatusCta")}
          </Link>
          <Link href="/login" className="mt-3 block text-sm text-brand hover:underline">
            {t("success.backHome")}
          </Link>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell maxWidthClassName="max-w-lg">
      <BrandHeader />

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <Link href="/login" className="text-sm text-brand hover:underline">
          &larr; {tCommon("back")}
        </Link>
        <h2 className="mt-2 text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <div>
            <label htmlFor="orderId" className="block text-sm font-medium text-foreground">
              {t("fields.orderId")}
            </label>
            <input
              id="orderId"
              value={values.customerOrderNumber}
              onChange={(e) => update("customerOrderNumber", e.target.value)}
              aria-invalid={Boolean(errors.customerOrderNumber)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            {errors.customerOrderNumber && (
              <p className="mt-1 text-xs text-red-600">{errors.customerOrderNumber}</p>
            )}
          </div>

          <div>
            <label htmlFor="complainantName" className="block text-sm font-medium text-foreground">
              {t("fields.name")}
            </label>
            <input
              id="complainantName"
              value={values.complainantName}
              onChange={(e) => update("complainantName", e.target.value)}
              aria-invalid={Boolean(errors.complainantName)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            {errors.complainantName && (
              <p className="mt-1 text-xs text-red-600">{errors.complainantName}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium text-foreground">
                {t("fields.email")}
              </label>
              <input
                id="contactEmail"
                type="email"
                value={values.contactEmail}
                onChange={(e) => update("contactEmail", e.target.value)}
                aria-invalid={Boolean(errors.contactEmail)}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              {errors.contactEmail && <p className="mt-1 text-xs text-red-600">{errors.contactEmail}</p>}
            </div>

            <div>
              <label htmlFor="contactPhone" className="block text-sm font-medium text-foreground">
                {t("fields.phone")}
              </label>
              <input
                id="contactPhone"
                type="tel"
                value={values.contactPhone}
                onChange={(e) => update("contactPhone", e.target.value)}
                aria-invalid={Boolean(errors.contactPhone)}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              {errors.contactPhone && <p className="mt-1 text-xs text-red-600">{errors.contactPhone}</p>}
            </div>
          </div>
          <p className="-mt-2 text-xs text-foreground/50">{t("fields.contactHint")}</p>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-foreground">
              {t("fields.category")}
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
            <label htmlFor="description" className="block text-sm font-medium text-foreground">
              {t("fields.description")}
            </label>
            <textarea
              id="description"
              rows={5}
              value={values.description}
              onChange={(e) => update("description", e.target.value)}
              aria-invalid={Boolean(errors.description)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
          </div>

          {submitError && (
            <p role="alert" className="text-sm text-red-600">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
        </form>
      </div>
    </PublicShell>
  );
}
