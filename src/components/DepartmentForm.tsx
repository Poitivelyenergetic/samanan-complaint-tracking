"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localizedName, type Administration, type DepartmentInput, type StaffUser } from "@/lib/types";
import SearchableSelect from "./SearchableSelect";

interface DepartmentFormProps {
  administrations: Administration[];
  staff: StaffUser[];
  initialValues?: Partial<DepartmentInput>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: DepartmentInput) => Promise<void>;
}

const DEFAULT_VALUES: DepartmentInput = { number: "", nameAr: "", nameEn: "", administrationId: "", managerId: null };

export default function DepartmentForm({
  administrations,
  staff,
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
}: DepartmentFormProps) {
  const t = useTranslations("departments.fields");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [values, setValues] = useState<DepartmentInput>({ ...DEFAULT_VALUES, ...initialValues });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof DepartmentInput>(key: K, value: DepartmentInput[K]) {
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
        <label htmlFor="administrationId" className="block text-sm font-medium text-foreground">
          {t("administration")}
        </label>
        <div className="mt-1 max-w-sm">
          <SearchableSelect
            id="administrationId"
            items={administrations}
            value={values.administrationId}
            onChange={(id) => update("administrationId", id)}
            getId={(a) => a.id}
            getLabel={(a) => localizedName(a, locale)}
            placeholder={t("selectAdministration")}
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
