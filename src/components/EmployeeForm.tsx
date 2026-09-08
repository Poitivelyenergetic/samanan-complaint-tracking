"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  localizedName,
  type Administration,
  type Company,
  type Department,
  type EmployeeInput,
  type Role,
} from "@/lib/types";
import { EmployeesApiError } from "@/lib/employees-api";

interface EmployeeFormValues {
  nameAr: string;
  nameEn: string;
  username: string;
  number: string;
  phone: string;
  jobTitle: string;
  companyId: string;
  administrationId: string;
  departmentId: string;
  roleIds: string[];
  password: string;
}

const DEFAULT_VALUES: EmployeeFormValues = {
  nameAr: "",
  nameEn: "",
  username: "",
  number: "",
  phone: "",
  jobTitle: "",
  companyId: "",
  administrationId: "",
  departmentId: "",
  roleIds: [],
  password: "",
};

interface EmployeeFormProps {
  mode: "create" | "edit";
  companies: Company[];
  administrations: Administration[];
  departments: Department[];
  roles: Role[];
  initialValues?: Partial<EmployeeFormValues>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: EmployeeInput) => Promise<void>;
}

export default function EmployeeForm({
  mode,
  companies,
  administrations,
  departments,
  roles,
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
}: EmployeeFormProps) {
  const t = useTranslations("employees.fields");
  const tErrors = useTranslations("employees.errors");
  const locale = useLocale();

  const [values, setValues] = useState<EmployeeFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const administrationsInCompany = useMemo(
    () => administrations.filter((a) => a.companyId === values.companyId),
    [administrations, values.companyId]
  );
  const departmentsInAdministration = useMemo(
    () => departments.filter((d) => d.administrationId === values.administrationId),
    [departments, values.administrationId]
  );

  function update<K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function updateCompany(companyId: string) {
    setValues((prev) => {
      const administrationStillValid = administrations.some(
        (a) => a.id === prev.administrationId && a.companyId === companyId
      );
      const nextAdministrationId = administrationStillValid ? prev.administrationId : "";
      const departmentStillValid =
        administrationStillValid &&
        departments.some((d) => d.id === prev.departmentId && d.administrationId === nextAdministrationId);
      return {
        ...prev,
        companyId,
        administrationId: nextAdministrationId,
        departmentId: departmentStillValid ? prev.departmentId : "",
      };
    });
  }

  function updateAdministration(administrationId: string) {
    setValues((prev) => {
      const stillValid = departments.some(
        (d) => d.id === prev.departmentId && d.administrationId === administrationId
      );
      return { ...prev, administrationId, departmentId: stillValid ? prev.departmentId : "" };
    });
  }

  function toggleRole(roleId: string) {
    setValues((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((id) => id !== roleId)
        : [...prev.roleIds, roleId],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        nameAr: values.nameAr.trim(),
        nameEn: values.nameEn.trim(),
        username: values.username.trim(),
        number: values.number.trim(),
        phone: values.phone.trim(),
        jobTitle: values.jobTitle.trim(),
        companyId: values.companyId,
        administrationId: values.administrationId,
        departmentId: values.departmentId,
        roleIds: values.roleIds,
        ...(values.password ? { password: values.password } : {}),
      });
    } catch (err) {
      const code = err instanceof EmployeesApiError ? err.code : "request_failed";
      setError(tErrors.has(code) ? tErrors(code) : tErrors("request_failed"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-foreground">
            {t("username")}
          </label>
          <input
            id="username"
            required
            value={values.username}
            onChange={(e) => update("username", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="number" className="block text-sm font-medium text-foreground">
            {t("number")}
          </label>
          <input
            id="number"
            required
            value={values.number}
            onChange={(e) => update("number", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-foreground">
            {t("phone")}
          </label>
          <input
            id="phone"
            dir="ltr"
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="jobTitle" className="block text-sm font-medium text-foreground">
            {t("jobTitle")}
          </label>
          <input
            id="jobTitle"
            value={values.jobTitle}
            onChange={(e) => update("jobTitle", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          <label htmlFor="companyId" className="block text-sm font-medium text-foreground">
            {t("company")}
          </label>
          <select
            id="companyId"
            required
            value={values.companyId}
            onChange={(e) => updateCompany(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            <option value="" disabled>
              {t("selectCompany")}
            </option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {localizedName(c, locale)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="administrationId" className="block text-sm font-medium text-foreground">
            {t("administration")}
          </label>
          <select
            id="administrationId"
            required
            disabled={!values.companyId}
            value={values.administrationId}
            onChange={(e) => updateAdministration(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
          >
            <option value="" disabled>
              {t("selectAdministration")}
            </option>
            {administrationsInCompany.map((a) => (
              <option key={a.id} value={a.id}>
                {localizedName(a, locale)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="departmentId" className="block text-sm font-medium text-foreground">
            {t("department")}
          </label>
          <select
            id="departmentId"
            required
            disabled={!values.administrationId}
            value={values.departmentId}
            onChange={(e) => update("departmentId", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
          >
            <option value="" disabled>
              {t("selectDepartment")}
            </option>
            {departmentsInAdministration.map((d) => (
              <option key={d.id} value={d.id}>
                {localizedName(d, locale)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium text-foreground">{t("roles")}</span>
        <div className="mt-1 space-y-1.5 rounded-md border border-border bg-black/[0.02] p-3">
          {roles.length === 0 ? (
            <p className="text-sm text-foreground/50">{t("noRoles")}</p>
          ) : (
            roles.map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={values.roleIds.includes(role.id)}
                  onChange={() => toggleRole(role.id)}
                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                />
                {role.name}
              </label>
            ))
          )}
        </div>
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-foreground">
          {t("password")}
        </label>
        <input
          id="password"
          type="password"
          required={mode === "create"}
          minLength={6}
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => update("password", e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <p className="mt-1 text-xs text-foreground/50">
          {mode === "create" ? t("passwordCreateHint") : t("passwordEditHint")}
        </p>
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
