"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createEmployee, updateEmployee, EmployeesApiError } from "@/lib/employees-api";
import {
  localizedName,
  type Administration,
  type Company,
  type CustomerInput,
  type Department,
  type Role,
  type StaffUser,
} from "@/lib/types";
import EmployeeFieldsSection, { EMPTY_EMPLOYEE_FIELDS, type EmployeeFieldsValues } from "./EmployeeFieldsSection";

interface UserFormValues {
  number: string;
  nameAr: string;
  nameEn: string;
  phone: string;
}

const EMPTY_USER_VALUES: UserFormValues = { number: "", nameAr: "", nameEn: "", phone: "" };

function employeeFieldsFrom(employee: StaffUser): EmployeeFieldsValues {
  return {
    nameAr: employee.nameAr,
    nameEn: employee.nameEn,
    username: employee.username,
    number: employee.number,
    phone: employee.phone,
    jobTitle: employee.jobTitle,
    companyId: employee.companyId,
    administrationId: employee.administrationId,
    departmentId: employee.departmentId,
    roleIds: employee.roleIds,
    password: "",
  };
}

interface UserFormProps {
  staff: StaffUser[];
  companies: Company[];
  administrations: Administration[];
  departments: Department[];
  roles: Role[];
  initialValues?: Partial<UserFormValues>;
  // The User's currently-linked responsible employee, if any — loaded and
  // edited in place rather than just referenced.
  initialEmployee?: StaffUser | null;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: CustomerInput) => Promise<void>;
}

export default function UserForm({
  staff,
  companies,
  administrations,
  departments,
  roles,
  initialValues,
  initialEmployee,
  submitLabel,
  submittingLabel,
  onSubmit,
}: UserFormProps) {
  const t = useTranslations("users.fields");
  const tEmployees = useTranslations("employees.errors");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [values, setValues] = useState<UserFormValues>({ ...EMPTY_USER_VALUES, ...initialValues });
  const [linkedEmployeeId, setLinkedEmployeeId] = useState<string | null>(initialEmployee?.id ?? null);
  const [employeeValues, setEmployeeValues] = useState<EmployeeFieldsValues>(
    initialEmployee ? employeeFieldsFrom(initialEmployee) : EMPTY_EMPLOYEE_FIELDS
  );
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const employeeSearchResults = useMemo(() => {
    const term = employeeSearch.trim().toLowerCase();
    if (!term) return [];
    return staff
      .filter(
        (s) =>
          s.nameAr.toLowerCase().includes(term) ||
          s.nameEn.toLowerCase().includes(term) ||
          s.username.toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [staff, employeeSearch]);

  function update<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function pickEmployee(employee: StaffUser) {
    setLinkedEmployeeId(employee.id);
    setEmployeeValues(employeeFieldsFrom(employee));
    setEmployeeSearch("");
  }

  function unlinkEmployee() {
    setLinkedEmployeeId(null);
    setEmployeeValues(EMPTY_EMPLOYEE_FIELDS);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let employeeId = linkedEmployeeId;
      const employeeEngaged = employeeValues.username.trim() !== "";

      if (employeeEngaged) {
        const payload = {
          nameAr: employeeValues.nameAr.trim(),
          nameEn: employeeValues.nameEn.trim(),
          username: employeeValues.username.trim(),
          number: employeeValues.number.trim(),
          phone: employeeValues.phone.trim(),
          jobTitle: employeeValues.jobTitle.trim(),
          companyId: employeeValues.companyId,
          administrationId: employeeValues.administrationId,
          departmentId: employeeValues.departmentId,
          roleIds: employeeValues.roleIds,
        };
        if (employeeId) {
          await updateEmployee(employeeId, { ...payload, ...(employeeValues.password ? { password: employeeValues.password } : {}) });
        } else {
          const created = await createEmployee({ ...payload, password: employeeValues.password });
          employeeId = created.id;
        }
      } else {
        employeeId = null;
      }

      await onSubmit({
        number: values.number.trim(),
        nameAr: values.nameAr.trim(),
        nameEn: values.nameEn.trim(),
        phone: values.phone.trim(),
        employeeId,
      });
    } catch (err) {
      const code = err instanceof EmployeesApiError ? err.code : "request_failed";
      setError(tEmployees.has(code) ? tEmployees(code) : tCommon("somethingWentWrong"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-5">
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
          <label htmlFor="userPhone" className="block text-sm font-medium text-foreground">
            {t("phone")}
          </label>
          <input
            id="userPhone"
            dir="ltr"
            required
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="mt-1 w-full max-w-xs rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-foreground">{t("responsibleEmployee")}</h3>
        <p className="mt-0.5 text-xs text-foreground/50">{t("responsibleEmployeeHint")}</p>

        {linkedEmployeeId ? (
          <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-black/[0.02] px-3 py-2 text-sm">
            <span>
              <span className="font-medium text-foreground">{employeeValues.nameEn || employeeValues.nameAr}</span>
              <span className="ms-2 text-foreground/50">@{employeeValues.username}</span>
            </span>
            <button type="button" onClick={unlinkEmployee} className="text-brand hover:underline">
              {t("changeEmployee")}
            </button>
          </div>
        ) : (
          <div className="relative mt-3">
            <input
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              placeholder={t("searchEmployeePlaceholder")}
              className="w-full max-w-sm rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            {employeeSearch.trim() && (
              <div className="absolute z-10 mt-1 w-full max-w-sm rounded-md border border-border bg-surface shadow-sm">
                {employeeSearchResults.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-foreground/50">{t("noEmployeeResults")}</p>
                ) : (
                  employeeSearchResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pickEmployee(s)}
                      className="block w-full px-3 py-2 text-start text-sm hover:bg-black/5"
                    >
                      <span className="font-medium text-foreground">{localizedName(s, locale)}</span>
                      <span className="ms-2 text-foreground/50">@{s.username}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <EmployeeFieldsSection
            values={employeeValues}
            onChange={setEmployeeValues}
            companies={companies}
            administrations={administrations}
            departments={departments}
            roles={roles}
            passwordMode={linkedEmployeeId ? "edit" : "create"}
            required={false}
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
