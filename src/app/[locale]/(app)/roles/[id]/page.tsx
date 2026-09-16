"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { getRole } from "@/lib/roles";
import { deleteRole, updateRole, bulkAssignRole, RolesApiError } from "@/lib/roles-api";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToDepartments } from "@/lib/departments";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  localizedName,
  type Administration,
  type Company,
  type Department,
  type Role,
  type RoleInput,
  type StaffUser,
} from "@/lib/types";
import RoleForm from "@/components/RoleForm";
import SearchableSelect from "@/components/SearchableSelect";
import Spinner from "@/components/Spinner";

export default function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("roles.edit");
  const tCommon = useTranslations("common");
  const tEmployeeFields = useTranslations("employees.fields");
  const locale = useLocale();
  const router = useRouter();
  const { profile, loading } = useAuth();
  const canUpdate = hasPermission(profile, "roles", "update");
  const canDelete = hasPermission(profile, "roles", "delete");
  const canAssign = hasPermission(profile, "employees", "update");

  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [scopeCompanyId, setScopeCompanyId] = useState("");
  const [scopeAdministrationId, setScopeAdministrationId] = useState("");
  const [scopeDepartmentId, setScopeDepartmentId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignResult, setAssignResult] = useState<{ matched: number; updated: number } | null>(null);

  useEffect(() => {
    getRole(id).then(setRole);
  }, [id]);
  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);

  const employeesWithRole = useMemo(
    () => staff.filter((s) => s.roleIds.includes(id)),
    [staff, id]
  );

  const companyOptions = useMemo(
    () => [{ id: "", label: tEmployeeFields("selectCompany") }, ...companies.map((c) => ({ id: c.id, label: localizedName(c, locale) }))],
    [companies, locale, tEmployeeFields]
  );
  const administrationOptions = useMemo(() => {
    const inCompany = scopeCompanyId ? administrations.filter((a) => a.companyId === scopeCompanyId) : administrations;
    return [
      { id: "", label: tEmployeeFields("selectAdministration") },
      ...inCompany.map((a) => ({ id: a.id, label: localizedName(a, locale) })),
    ];
  }, [administrations, scopeCompanyId, locale, tEmployeeFields]);
  const departmentOptions = useMemo(() => {
    const inAdministration = scopeAdministrationId
      ? departments.filter((d) => d.administrationId === scopeAdministrationId)
      : departments;
    return [
      { id: "", label: tEmployeeFields("selectDepartment") },
      ...inAdministration.map((d) => ({ id: d.id, label: localizedName(d, locale) })),
    ];
  }, [departments, scopeAdministrationId, locale, tEmployeeFields]);

  function handleScopeCompanyChange(companyId: string) {
    setScopeCompanyId(companyId);
    setScopeAdministrationId("");
    setScopeDepartmentId("");
    setAssignResult(null);
  }
  function handleScopeAdministrationChange(administrationId: string) {
    setScopeAdministrationId(administrationId);
    setScopeDepartmentId("");
    setAssignResult(null);
  }
  function handleScopeDepartmentChange(departmentId: string) {
    setScopeDepartmentId(departmentId);
    setAssignResult(null);
  }

  async function handleAssign() {
    setAssignError(null);
    setAssignResult(null);
    if (!scopeDepartmentId && !scopeAdministrationId && !scopeCompanyId) {
      setAssignError(t("assignNoScope"));
      return;
    }
    setAssigning(true);
    try {
      const result = await bulkAssignRole(id, {
        departmentId: scopeDepartmentId || undefined,
        administrationId: scopeAdministrationId || undefined,
        companyId: scopeCompanyId || undefined,
      });
      setAssignResult(result);
    } catch (err) {
      setAssignError(err instanceof RolesApiError ? err.code : "request_failed");
    } finally {
      setAssigning(false);
    }
  }

  async function handleSubmit(values: RoleInput) {
    await updateRole(id, values);
  }

  async function handleDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    await deleteRole(id);
    router.push("/roles");
  }

  if (loading || !profile || !canUpdate || role === undefined) {
    return <Spinner />;
  }

  if (role === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/roles" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/roles" className="text-sm text-brand hover:underline">
            &larr; {tCommon("back")}
          </Link>
          <h1 className="mt-1 text-xl font-bold text-foreground">{t("title")}</h1>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            {tCommon("delete")}
          </button>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <RoleForm
          key={role.id}
          initialValues={{ name: role.name, permissions: role.permissions }}
          submitLabel={t("submit")}
          submittingLabel={tCommon("saving")}
          onSubmit={handleSubmit}
        />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-foreground">
          {t("employeesWithRole")} {employeesWithRole.length > 0 && `(${employeesWithRole.length})`}
        </h2>
        {employeesWithRole.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/50">{t("noEmployeesWithRole")}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {employeesWithRole.map((member) => (
              <li key={member.id}>
                <Link
                  href={`/employees/${member.id}`}
                  className="inline-block rounded-full border border-border bg-black/[0.02] px-3 py-1 text-sm text-foreground/80 hover:border-brand/40 hover:text-brand"
                >
                  {localizedName(member, locale)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canAssign && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold text-foreground">{t("assignToScope")}</h2>
          <p className="mt-1 text-xs text-foreground/50">{t("assignToScopeHint")}</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SearchableSelect
              items={companyOptions}
              value={scopeCompanyId}
              onChange={handleScopeCompanyChange}
              getId={(o) => o.id}
              getLabel={(o) => o.label}
              allowClear={false}
            />
            <SearchableSelect
              items={administrationOptions}
              value={scopeAdministrationId}
              onChange={handleScopeAdministrationChange}
              getId={(o) => o.id}
              getLabel={(o) => o.label}
              allowClear={false}
            />
            <SearchableSelect
              items={departmentOptions}
              value={scopeDepartmentId}
              onChange={handleScopeDepartmentChange}
              getId={(o) => o.id}
              getLabel={(o) => o.label}
              allowClear={false}
            />
          </div>
          <button
            type="button"
            onClick={handleAssign}
            disabled={assigning}
            className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {assigning ? t("assigning") : t("assignButton")}
          </button>
          {assignError && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {assignError}
            </p>
          )}
          {assignResult && (
            <p className="mt-2 text-sm text-foreground/70">
              {t("assignResult", {
                updated: assignResult.updated,
                matched: assignResult.matched,
                already: assignResult.matched - assignResult.updated,
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
