"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localizedName, type Administration, type Company, type Department, type Role } from "@/lib/types";
import Select from "./Select";

export interface EmployeeFieldsValues {
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

export const EMPTY_EMPLOYEE_FIELDS: EmployeeFieldsValues = {
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

interface EmployeeFieldsSectionProps {
  values: EmployeeFieldsValues;
  onChange: (values: EmployeeFieldsValues) => void;
  companies: Company[];
  administrations: Administration[];
  departments: Department[];
  roles: Role[];
  // "create": password required, hint says it's used to sign in.
  // "edit": password optional, hint says leave blank to keep it.
  passwordMode: "create" | "edit";
  // Whether the standard employee fields (name/username/org placement) are
  // HTML-required. The standalone Employee form always requires them; the
  // embedded copy in the User form does not, since a User's responsible
  // employee is optional — an incomplete fill is caught server-side instead.
  required?: boolean;
}

export default function EmployeeFieldsSection({
  values,
  onChange,
  companies,
  administrations,
  departments,
  roles,
  passwordMode,
  required = true,
}: EmployeeFieldsSectionProps) {
  const t = useTranslations("employees.fields");
  const locale = useLocale();

  const administrationsInCompany = useMemo(
    () => administrations.filter((a) => a.companyId === values.companyId),
    [administrations, values.companyId]
  );
  const departmentsInAdministration = useMemo(
    () => departments.filter((d) => d.administrationId === values.administrationId),
    [departments, values.administrationId]
  );

  function update<K extends keyof EmployeeFieldsValues>(key: K, value: EmployeeFieldsValues[K]) {
    onChange({ ...values, [key]: value });
  }

  function updateCompany(companyId: string) {
    const administrationStillValid = administrations.some(
      (a) => a.id === values.administrationId && a.companyId === companyId
    );
    const nextAdministrationId = administrationStillValid ? values.administrationId : "";
    const departmentStillValid =
      administrationStillValid &&
      departments.some((d) => d.id === values.departmentId && d.administrationId === nextAdministrationId);
    onChange({
      ...values,
      companyId,
      administrationId: nextAdministrationId,
      departmentId: departmentStillValid ? values.departmentId : "",
    });
  }

  function updateAdministration(administrationId: string) {
    const stillValid = departments.some(
      (d) => d.id === values.departmentId && d.administrationId === administrationId
    );
    onChange({ ...values, administrationId, departmentId: stillValid ? values.departmentId : "" });
  }

  function toggleRole(roleId: string) {
    onChange({
      ...values,
      roleIds: values.roleIds.includes(roleId)
        ? values.roleIds.filter((id) => id !== roleId)
        : [...values.roleIds, roleId],
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="nameAr" className="block text-sm font-medium text-foreground">
            {t("nameAr")}
          </label>
          <input
            id="nameAr"
            dir="rtl"
            required={required}
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
            required={required}
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
            required={required}
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
            required={required}
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
          <Select
            id="companyId"
            required={required}
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
          </Select>
        </div>

        <div>
          <label htmlFor="administrationId" className="block text-sm font-medium text-foreground">
            {t("administration")}
          </label>
          <Select
            id="administrationId"
            required={required}
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
          </Select>
        </div>

        <div>
          <label htmlFor="departmentId" className="block text-sm font-medium text-foreground">
            {t("department")}
          </label>
          <Select
            id="departmentId"
            required={required}
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
          </Select>
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
          required={required && passwordMode === "create"}
          minLength={6}
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => update("password", e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <p className="mt-1 text-xs text-foreground/50">
          {passwordMode === "create" ? t("passwordCreateHint") : t("passwordEditHint")}
        </p>
      </div>
    </div>
  );
}
