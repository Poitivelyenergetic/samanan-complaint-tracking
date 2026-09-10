"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteDepartment, subscribeToDepartments } from "@/lib/departments";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type Administration, type Department, type StaffUser } from "@/lib/types";

export default function ViewDepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("departments");
  const tEmployees = useTranslations("employees");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { profile, loading } = useAuth();
  const canView = hasPermission(profile, "departments", "view");
  const canUpdate = hasPermission(profile, "departments", "update");
  const canDelete = hasPermission(profile, "departments", "delete");
  const canViewEmployees = hasPermission(profile, "employees", "view");

  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);

  useEffect(() => subscribeToDepartments(setDepartments), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  useEffect(() => {
    if (!loading && profile && !canView) {
      router.replace("/departments");
    }
  }, [loading, profile, canView, router]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const administrationsById = useMemo(() => new Map(administrations.map((a) => [a.id, a])), [administrations]);
  const department = departments?.find((d) => d.id === id) ?? (departments ? null : undefined);
  const childEmployees = useMemo(() => staff.filter((s) => s.departmentId === id), [staff, id]);

  async function handleDelete() {
    if (childEmployees.length > 0) {
      window.alert(t("deleteBlocked"));
      return;
    }
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteDepartment(id);
    router.push("/departments");
  }

  if (loading || !profile || !canView || department === undefined) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (department === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/departments" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  const manager = department.managerId ? staffById.get(department.managerId) : undefined;
  const administration = administrationsById.get(department.administrationId);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/departments" className="text-sm text-brand hover:underline">
            &larr; {tCommon("back")}
          </Link>
          <h1 className="mt-1 text-xl font-bold text-foreground">{localizedName(department, locale)}</h1>
          <p className="mt-0.5 font-mono text-xs text-foreground/50">#{department.number}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canUpdate && (
            <Link
              href={`/departments/${id}/edit`}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground/70 hover:bg-black/5"
            >
              {tCommon("edit")}
            </Link>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              {tCommon("delete")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-foreground/50">{t("fields.nameAr")}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{department.nameAr || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground/50">{t("fields.nameEn")}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{department.nameEn || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-foreground/50">{t("fields.administration")}</dt>
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
            <dt className="text-xs font-medium text-foreground/50">{t("fields.manager")}</dt>
            <dd className="mt-0.5 text-sm">
              {manager ? (
                <Link href={`/employees/${manager.id}`} className="text-brand hover:underline">
                  {localizedName(manager, locale)}
                </Link>
              ) : (
                <span className="text-foreground/50">{t("managerNotAssigned")}</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-foreground">{tNav("employees")}</h2>
        {childEmployees.length === 0 ? (
          <p className="mt-3 text-sm text-foreground/50">{t("noEmployees")}</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {childEmployees.map((member) =>
              canViewEmployees ? (
                <li key={member.id}>
                  <Link
                    href={`/employees/${member.id}`}
                    className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-foreground hover:bg-black/[0.03] hover:text-brand"
                  >
                    <span>{localizedName(member, locale)}</span>
                    <span className="font-mono text-xs text-foreground/40">
                      {tEmployees("table.number")}: {member.number}
                    </span>
                  </Link>
                </li>
              ) : (
                <li key={member.id} className="flex items-center justify-between px-3 py-2 text-sm text-foreground">
                  <span>{localizedName(member, locale)}</span>
                  <span className="font-mono text-xs text-foreground/40">
                    {tEmployees("table.number")}: {member.number}
                  </span>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
