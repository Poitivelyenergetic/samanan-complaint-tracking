"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { ComplaintTypeInput } from "@/lib/types";

interface ComplaintTypeFormProps {
  initialValues?: Partial<ComplaintTypeInput>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: ComplaintTypeInput) => Promise<void>;
}

export default function ComplaintTypeForm({
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
}: ComplaintTypeFormProps) {
  const t = useTranslations("complaintTypes.fields");
  const tCommon = useTranslations("common");

  const [name, setName] = useState(initialValues?.name ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim() });
    } catch {
      setError(tCommon("somethingWentWrong"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-foreground">
          {t("name")}
        </label>
        <input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
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
