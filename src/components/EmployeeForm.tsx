"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { Administration, Company, Department, EmployeeInput, Role } from "@/lib/types";
import { EmployeesApiError } from "@/lib/employees-api";
import EmployeeFieldsSection, { EMPTY_EMPLOYEE_FIELDS, type EmployeeFieldsValues } from "./EmployeeFieldsSection";

interface EmployeeFormProps {
  mode: "create" | "edit";
  companies: Company[];
  administrations: Administration[];
  departments: Department[];
  roles: Role[];
  initialValues?: Partial<EmployeeFieldsValues>;
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
  const tErrors = useTranslations("employees.errors");

  const [values, setValues] = useState<EmployeeFieldsValues>({
    ...EMPTY_EMPLOYEE_FIELDS,
    ...initialValues,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <EmployeeFieldsSection
        values={values}
        onChange={setValues}
        companies={companies}
        administrations={administrations}
        departments={departments}
        roles={roles}
        passwordMode={mode}
      />

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
