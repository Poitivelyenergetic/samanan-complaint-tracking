"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToDepartments, deleteDepartment } from "@/lib/departments";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  localizedName,
  type Administration,
  type Company,
  type Department,
  type StaffUser,
} from "@/lib/types";
import { computeManagerScope, scopeDepartments } from "@/lib/orgScope";
import SearchableSelect from "@/components/SearchableSelect";

export default function DepartmentsPage() {
  const t = useTranslations("departments");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { user, profile } = useAuth();
  const canCreate = hasPermission(profile, "departments", "create");
  const canUpdate = hasPermission(profile, "departments", "update");
  const canDelete = hasPermission(profile, "departments", "delete");
  const showActions = true;

  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [administrationFilter, setAdministrationFilter] = useState("");

  useEffect(() => subscribeToDepartments(setDepartments), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  const administrationsById = useMemo(() => new Map(administrations.map((a) => [a.id, a])), [administrations]);
  const administrationFilterOptions = useMemo(
    () => [
      { id: "", label: t("filterAllAdministrations") },
      ...administrations.map((a) => ({ id: a.id, label: localizedName(a, locale) })),
    ],
    [administrations, locale, t]
  );
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const hasBroaderAccess = hasPermission(profile, "complaints", "viewAll");
  const managerScope = useMemo(
    () => computeManagerScope(user?.uid, companies, administrations, departments ?? [], hasBroaderAccess),
    [user?.uid, companies, administrations, departments, hasBroaderAccess]
  );

  const filtered = useMemo(() => {
    if (!departments) return [];
    const inScope = scopeDepartments(departments, administrations, managerScope);
    return administrationFilter ? inScope.filter((d) => d.administrationId === administrationFilter) : inScope;
  }, [departments, administrations, administrationFilter, managerScope]);

  async function handleDelete(department: Department) {
    const hasEmployees = staff.some((s) => s.departmentId === department.id);
    if (hasEmployees) {
      window.alert(t("deleteBlocked"));
      return;
    }
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteDepartment(department.id);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        {canCreate && (
          <Link
            href="/departments/new"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {t("newButton")}
          </Link>
        )}
      </div>

      <div className="mt-4 max-w-xs">
        <SearchableSelect
          items={administrationFilterOptions}
          value={administrationFilter}
          onChange={setAdministrationFilter}
          getId={(option) => option.id}
          getLabel={(option) => option.label}
          allowClear={false}
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[560px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.number")}</th>
              <th className="px-4 py-3 text-start">{t("table.nameAr")}</th>
              <th className="px-4 py-3 text-start">{t("table.nameEn")}</th>
              <th className="px-4 py-3 text-start">{t("table.administration")}</th>
              <th className="px-4 py-3 text-start">{t("table.manager")}</th>
              {showActions && <th className="px-4 py-3 text-start">{tCommon("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {departments === null ? (
              <tr>
                <td colSpan={showActions ? 6 : 5} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={showActions ? 6 : 5} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              filtered.map((department) => (
                <tr key={department.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3 font-mono text-foreground/70">{department.number || "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/departments/${department.id}`} className="font-medium text-foreground hover:text-brand">
                      {department.nameAr || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{department.nameEn || "—"}</td>
                  <td className="px-4 py-3 text-foreground/70">
                    {localizedName(administrationsById.get(department.administrationId), locale) || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {department.managerId
                      ? localizedName(staffById.get(department.managerId), locale) || "—"
                      : t("managerNotAssigned")}
                  </td>
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/departments/${department.id}`}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                        >
                          {tCommon("view")}
                        </Link>
                        {canUpdate && (
                          <Link
                            href={`/departments/${department.id}/edit`}
                            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                          >
                            {tCommon("edit")}
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(department)}
                            className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            {tCommon("delete")}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
