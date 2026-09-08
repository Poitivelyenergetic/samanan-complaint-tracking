"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  PERMISSION_KEYS,
  ROLE_DEFAULT_PERMISSIONS,
  type Administration,
  type Company,
  type EmployeeInput,
  type Permissions,
  type Position,
  type UserRole,
} from "@/lib/types";
import { EmployeesApiError } from "@/lib/employees-api";

const ROLES: UserRole[] = ["admin", "employee", "user"];

interface EmployeeFormValues {
  name: string;
  username: string;
  number: string;
  companyId: string;
  administrationId: string;
  positionId: string;
  role: UserRole;
  permissions: Permissions;
  password: string;
}

const DEFAULT_VALUES: EmployeeFormValues = {
  name: "",
  username: "",
  number: "",
  companyId: "",
  administrationId: "",
  positionId: "",
  role: "employee",
  permissions: ROLE_DEFAULT_PERMISSIONS.employee,
  password: "",
};

interface EmployeeFormProps {
  mode: "create" | "edit";
  companies: Company[];
  administrations: Administration[];
  positions: Position[];
  initialValues?: Partial<EmployeeFormValues>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: EmployeeInput) => Promise<void>;
}

export default function EmployeeForm({
  mode,
  companies,
  administrations,
  positions,
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
}: EmployeeFormProps) {
  const t = useTranslations("employees.fields");
  const tRoles = useTranslations("roles");
  const tPermissions = useTranslations("employees.permissions");
  const tErrors = useTranslations("employees.errors");

  const [values, setValues] = useState<EmployeeFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);

  const administrationsInCompany = useMemo(
    () => administrations.filter((a) => a.companyId === values.companyId),
    [administrations, values.companyId]
  );
  const positionsInAdministration = useMemo(
    () => positions.filter((p) => p.administrationId === values.administrationId),
    [positions, values.administrationId]
  );

  function update<K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  // Switching company invalidates the current administration/position
  // unless they still belong to the newly selected company.
  function updateCompany(companyId: string) {
    setValues((prev) => {
      const administrationStillValid = administrations.some(
        (a) => a.id === prev.administrationId && a.companyId === companyId
      );
      const nextAdministrationId = administrationStillValid ? prev.administrationId : "";
      const positionStillValid =
        administrationStillValid &&
        positions.some((p) => p.id === prev.positionId && p.administrationId === nextAdministrationId);
      return {
        ...prev,
        companyId,
        administrationId: nextAdministrationId,
        positionId: positionStillValid ? prev.positionId : "",
      };
    });
  }

  // Switching administration invalidates the current position unless it
  // still belongs to the newly selected administration.
  function updateAdministration(administrationId: string) {
    setValues((prev) => {
      const stillValid = positions.some(
        (p) => p.id === prev.positionId && p.administrationId === administrationId
      );
      return { ...prev, administrationId, positionId: stillValid ? prev.positionId : "" };
    });
  }

  // Picking a role resets permissions to that role's defaults; an admin can
  // still hand-tune individual boxes afterward via "Manage permissions".
  function updateRole(role: UserRole) {
    setValues((prev) => ({ ...prev, role, permissions: ROLE_DEFAULT_PERMISSIONS[role] }));
  }

  function togglePermission(key: keyof Permissions) {
    setValues((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: !prev.permissions[key] },
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: values.name.trim(),
        username: values.username.trim(),
        number: values.number.trim(),
        companyId: values.companyId,
        administrationId: values.administrationId,
        positionId: values.positionId,
        role: values.role,
        permissions: values.permissions,
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
          <label htmlFor="name" className="block text-sm font-medium text-foreground">
            {t("name")}
          </label>
          <input
            id="name"
            required
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>

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
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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

        <div>
          <label htmlFor="role" className="block text-sm font-medium text-foreground">
            {t("role")}
          </label>
          <select
            id="role"
            value={values.role}
            onChange={(e) => updateRole(e.target.value as UserRole)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {tRoles(role)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowPermissions((s) => !s)}
            className="mt-1.5 text-sm text-brand hover:underline"
          >
            {showPermissions ? t("hidePermissions") : t("managePermissions")}
          </button>
        </div>
      </div>

      {showPermissions && (
        <div className="space-y-2 rounded-md border border-border bg-black/[0.02] p-3">
          {PERMISSION_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={values.permissions[key]}
                onChange={() => togglePermission(key)}
                className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
              />
              {tPermissions(key)}
            </label>
          ))}
        </div>
      )}

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
                {c.name}
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
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="positionId" className="block text-sm font-medium text-foreground">
            {t("position")}
          </label>
          <select
            id="positionId"
            required
            disabled={!values.administrationId}
            value={values.positionId}
            onChange={(e) => update("positionId", e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-60"
          >
            <option value="" disabled>
              {t("selectPosition")}
            </option>
            {positionsInAdministration.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
