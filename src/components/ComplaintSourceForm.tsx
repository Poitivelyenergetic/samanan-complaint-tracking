"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { ComplaintSourceInput } from "@/lib/types";

interface ComplaintSourceFormProps {
  initialValues?: Partial<ComplaintSourceInput>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: ComplaintSourceInput) => Promise<void>;
}

export default function ComplaintSourceForm({
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
}: ComplaintSourceFormProps) {
  const t = useTranslations("complaintSources.fields");
  const tCommon = useTranslations("common");

  const [nameAr, setNameAr] = useState(initialValues?.nameAr ?? "");
  const [nameEn, setNameEn] = useState(initialValues?.nameEn ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ nameAr: nameAr.trim(), nameEn: nameEn.trim() });
    } catch {
      setError(tCommon("somethingWentWrong"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="nameAr" className="block text-sm font-medium text-foreground">
          {t("nameAr")}
        </label>
        <input
          id="nameAr"
          dir="rtl"
          required
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
          className="mt-1 w-full max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label htmlFor="nameEn" className="block text-sm font-medium text-foreground">
          {t("nameEn")}
        </label>
        <input
          id="nameEn"
          dir="ltr"
          required
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          className="mt-1 w-full max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

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
