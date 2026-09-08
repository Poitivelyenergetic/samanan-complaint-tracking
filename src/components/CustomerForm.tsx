"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localizedName, type CustomerInput, type StaffUser } from "@/lib/types";

interface CustomerFormProps {
  staff: StaffUser[];
  initialValues?: Partial<CustomerInput>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: CustomerInput) => Promise<void>;
}

const DEFAULT_VALUES: CustomerInput = { number: "", nameAr: "", nameEn: "", phone: "", employeeId: null };

export default function CustomerForm({ staff, initialValues, submitLabel, submittingLabel, onSubmit }: CustomerFormProps) {
  const t = useTranslations("users.fields");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [values, setValues] = useState<CustomerInput>({ ...DEFAULT_VALUES, ...initialValues });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        ...values,
        number: values.number.trim(),
        nameAr: values.nameAr.trim(),
        nameEn: values.nameEn.trim(),
        phone: values.phone.trim(),
      });
    } catch {
      setError(tCommon("somethingWentWrong"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="number" className="block text-sm font-medium text-foreground">
          {t("number")}
        </label>
        <input
          id="number"
          required
          value={values.number}
          onChange={(e) => update("number", e.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="nameAr" className="block text-sm font-medium text-foreground">
            {t("nameAr")}
          </label>
          <input
            id="nameAr"
            dir="rtl"
            required
            value={values.nameAr}
            onChange={(e) => update("nameAr", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
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
            value={values.nameEn}
            onChange={(e) => update("nameEn", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-foreground">
          {t("phone")}
        </label>
        <input
          id="phone"
          dir="ltr"
          required
          value={values.phone}
          onChange={(e) => update("phone", e.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label htmlFor="employeeId" className="block text-sm font-medium text-foreground">
          {t("assignedEmployee")}
        </label>
        <select
          id="employeeId"
          value={values.employeeId ?? ""}
          onChange={(e) => update("employeeId", e.target.value || null)}
          className="mt-1 w-full max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        >
          <option value="">{t("employeeNotAssigned")}</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {localizedName(member, locale)}
            </option>
          ))}
        </select>
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
