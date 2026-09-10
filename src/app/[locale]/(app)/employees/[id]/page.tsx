"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { subscribeToStaffMember } from "@/lib/users";
import { deleteEmployee } from "@/lib/employees-api";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToDepartments } from "@/lib/departments";
import { subscribeToRoles } from "@/lib/roles";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  localizedName,
  type Administration,
  type Company,
  type Department,
  type Role,
  type StaffUser,
} from "@/lib/types";

export default function ViewEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const tEdit = useTranslations("employees.edit");
  const tFields = useTranslations("employees.fields");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const canView = hasPermission(profile, "employees", "view");
  const canUpdate = hasPermission(profile, "employees", "update");
  const canDelete = hasPermission(profile, "employees", "delete");

  const [staff, setStaff] = useState<StaffUser | null | undefined>(undefined);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => subscribeToStaffMember(id, setStaff), [id]);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);
  useEffect(() => subscribeToRoles(setRoles), []);

  useEffect(() => {
    if (!loading && profile && !canView) {
      router.replace("/employees");
    }
  }, [loading, profile, canView, router]);

  const companiesById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const administrationsById = useMemo(() => new Map(administrations.map((a) => [a.id, a])), [administrations]);
  const departmentsById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const rolesById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const isSelf = user?.uid === id;

  async function handleDelete() {
    if (!window.confirm(tEdit("deleteConfirm"))) return;
    setDeleting(true);
    await deleteEmployee(id);
    router.push("/employees");
  }

  if (loading || !profile || !canView || staff === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (staff === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{tEdit("notFound")}</p>
        <Link href="/employees" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  const company = companiesById.get(staff.companyId);
  const administration = administrationsById.get(staff.administrationId);
  const department = departmentsById.get(staff.departmentId);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/employees" className="text-sm text-brand hover:underline">
            &larr; {tCommon("back")}
          </Link>
          <h1 className="mt-1 text-xl font-bold text-foreground">{localizedName(staff, locale)}</h1>
          <p className="mt-0.5 text-sm text-foreground/50">@{staff.username}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canUpdate && (
            <Link
              href={`/employees/${id}/edit`}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground/70 hover:bg-black/5"
            >
              {tCommon("edit")}
            </Link>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || isSelf}
              title={isSelf ? tEdit("cannotDeleteSelf") : undefined}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              {tCommon("delete")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-foreground/50">{tFields("number")}</dt>
            <dd className="mt-0.5 font-mono text-sm text-foreground">{staff.number || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground/50">{tFields("phone")}</dt>
            <dd className="mt-0.5 text-sm text-foreground" dir="ltr">{staff.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground/50">{tFields("jobTitle")}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{staff.jobTitle || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground/50">{tFields("company")}</dt>
            <dd className="mt-0.5 text-sm">
              {company ? (
                <Link href={`/companies/${company.id}`} className="text-brand hover:underline">
                  {localizedName(company, locale)}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground/50">{tFields("administration")}</dt>
            <dd className="mt-0.5 text-sm">
              {administration ? (
                <Link href={`/administrations/${administration.id}`} className="text-brand hover:underline">
                  {localizedName(administration, locale)}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground/50">{tFields("department")}</dt>
            <dd className="mt-0.5 text-sm">
              {department ? (
                <Link href={`/departments/${department.id}`} className="text-brand hover:underline">
                  {localizedName(department, locale)}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-foreground">{tFields("roles")}</h2>
        {staff.roleIds.length === 0 ? (
          <p className="mt-3 text-sm text-foreground/50">{tFields("noRoles")}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {staff.roleIds.map((roleId) => {
              const role = rolesById.get(roleId);
              return (
                <span
                  key={roleId}
                  className="rounded-full border border-border bg-black/[0.02] px-3 py-1 text-xs font-medium text-foreground/80"
                >
                  {role?.name ?? roleId}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
