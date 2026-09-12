"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localizedName, type AdministrationInput, type Company, type StaffUser } from "@/lib/types";
import SearchableSelect from "./SearchableSelect";

interface AdministrationFormProps {
  companies: Company[];
  staff: StaffUser[];
  initialValues?: Partial<AdministrationInput>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: AdministrationInput) => Promise<void>;
}

const DEFAULT_VALUES: AdministrationInput = { number: "", nameAr: "", nameEn: "", companyId: "", managerId: null };

export default function AdministrationForm({
  companies,
  staff,
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
}: AdministrationFormProps) {
  const t = useTranslations("administrations.fields");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [values, setValues] = useState<AdministrationInput>({ ...DEFAULT_VALUES, ...initialValues });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof AdministrationInput>(key: K, value: AdministrationInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ ...values, number: values.number.trim(), nameAr: values.nameAr.trim(), nameEn: values.nameEn.trim() });
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

      <div>
        <label htmlFor="companyId" className="block text-sm font-medium text-foreground">
          {t("company")}
        </label>
        <div className="mt-1 max-w-sm">
          <SearchableSelect
            id="companyId"
            items={companies}
            value={values.companyId}
            onChange={(id) => update("companyId", id)}
            getId={(c) => c.id}
            getLabel={(c) => localizedName(c, locale)}
            placeholder={t("selectCompany")}
          />
        </div>
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
        <label htmlFor="managerId" className="block text-sm font-medium text-foreground">
          {t("manager")}
        </label>
        <div className="mt-1 max-w-sm">
          <SearchableSelect
            id="managerId"
            items={staff}
            value={values.managerId ?? ""}
            onChange={(id) => update("managerId", id || null)}
            getId={(member) => member.id}
            getLabel={(member) => localizedName(member, locale)}
            placeholder={t("managerNotAssigned")}
          />
        </div>
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
