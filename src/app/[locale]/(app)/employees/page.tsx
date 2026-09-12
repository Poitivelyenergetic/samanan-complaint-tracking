"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToDepartments } from "@/lib/departments";
import { subscribeToPendingSignupRequests } from "@/lib/signupRequests";
import { deleteEmployee } from "@/lib/employees-api";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  localizedName,
  type Administration,
  type Company,
  type Department,
  type StaffUser,
} from "@/lib/types";
import { computeManagerScope, scopeStaff } from "@/lib/orgScope";
import SearchableSelect from "@/components/SearchableSelect";

export default function EmployeesPage() {
  const t = useTranslations("employees");
  const tRequests = useTranslations("employees.requests");
  const tEdit = useTranslations("employees.edit");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { user, profile } = useAuth();
  const canCreate = hasPermission(profile, "employees", "create");
  const canUpdate = hasPermission(profile, "employees", "update");
  const canDelete = hasPermission(profile, "employees", "delete");
  const showActions = true;

  const [staff, setStaff] = useState<StaffUser[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [administrationFilter, setAdministrationFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");

  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);
  useEffect(() => {
    if (!canUpdate) return;
    return subscribeToPendingSignupRequests((requests) => setPendingCount(requests.length));
  }, [canUpdate]);

  const companiesById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const administrationsById = useMemo(() => new Map(administrations.map((a) => [a.id, a])), [administrations]);
  const departmentsById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const companyFilterOptions = useMemo(
    () => [
      { id: "", label: t("filterAllCompanies") },
      ...companies.map((c) => ({ id: c.id, label: localizedName(c, locale) })),
    ],
    [companies, locale, t]
  );
  const administrationFilterOptions = useMemo(() => {
    const inCompany = companyFilter ? administrations.filter((a) => a.companyId === companyFilter) : administrations;
    return [
      { id: "", label: t("filterAllAdministrations") },
      ...inCompany.map((a) => ({ id: a.id, label: localizedName(a, locale) })),
    ];
  }, [administrations, companyFilter, locale, t]);
  const departmentFilterOptions = useMemo(() => {
    const inAdministration = administrationFilter
      ? departments.filter((d) => d.administrationId === administrationFilter)
      : departments;
    return [
      { id: "", label: t("filterAllDepartments") },
      ...inAdministration.map((d) => ({ id: d.id, label: localizedName(d, locale) })),
    ];
  }, [departments, administrationFilter, locale, t]);
  const hasBroaderAccess = hasPermission(profile, "complaints", "viewAll");
  const managerScope = useMemo(
    () => computeManagerScope(user?.uid, companies, administrations, departments, hasBroaderAccess),
    [user?.uid, companies, administrations, departments, hasBroaderAccess]
  );

  const filtered = useMemo(() => {
    if (!staff) return [];
    const inScope = scopeStaff(staff, managerScope);
    const term = search.trim().toLowerCase();
    return inScope.filter((s) => {
      if (companyFilter && s.companyId !== companyFilter) return false;
      if (administrationFilter && s.administrationId !== administrationFilter) return false;
      if (departmentFilter && s.departmentId !== departmentFilter) return false;
      if (
        term &&
        !s.nameAr.toLowerCase().includes(term) &&
        !s.nameEn.toLowerCase().includes(term) &&
        !s.username.toLowerCase().includes(term) &&
        !s.number.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [staff, search, companyFilter, administrationFilter, departmentFilter, managerScope]);

  async function handleDelete(member: StaffUser) {
    if (!window.confirm(tEdit("deleteConfirm"))) return;
    await deleteEmployee(member.id);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {canUpdate && (
            <Link
              href="/employees/requests"
              className="relative rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-black/5"
            >
              {tRequests("navLink")}
              {pendingCount > 0 && (
                <span className="ms-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-semibold text-brand-foreground">
                  {pendingCount}
                </span>
              )}
            </Link>
          )}
          {canCreate && (
            <Link
              href="/employees/new"
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
            >
              {t("newButton")}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          type="search"
          className="min-w-[220px] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <div className="w-[220px]">
          <SearchableSelect
            items={companyFilterOptions}
            value={companyFilter}
            onChange={(id) => {
              setCompanyFilter(id);
              setAdministrationFilter("");
              setDepartmentFilter("");
            }}
            getId={(option) => option.id}
            getLabel={(option) => option.label}
            allowClear={false}
          />
        </div>
        <div className="w-[220px]">
          <SearchableSelect
            items={administrationFilterOptions}
            value={administrationFilter}
            onChange={(id) => {
              setAdministrationFilter(id);
              setDepartmentFilter("");
            }}
            getId={(option) => option.id}
            getLabel={(option) => option.label}
            allowClear={false}
          />
        </div>
        <div className="w-[220px]">
          <SearchableSelect
            items={departmentFilterOptions}
            value={departmentFilter}
            onChange={setDepartmentFilter}
            getId={(option) => option.id}
            getLabel={(option) => option.label}
            allowClear={false}
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[720px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.name")}</th>
              <th className="px-4 py-3 text-start">{t("table.number")}</th>
              <th className="px-4 py-3 text-start">{t("table.username")}</th>
              <th className="px-4 py-3 text-start">{t("table.company")}</th>
              <th className="px-4 py-3 text-start">{t("table.administration")}</th>
              <th className="px-4 py-3 text-start">{t("table.department")}</th>
              {showActions && <th className="px-4 py-3 text-start">{tCommon("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {staff === null ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              filtered.map((member) => (
                <tr key={member.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/employees/${member.id}`} className="font-medium text-foreground hover:text-brand">
                      {localizedName(member, locale)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-foreground/70">{member.number}</td>
                  <td className="px-4 py-3 text-foreground/70">{member.username}</td>
                  <td className="px-4 py-3 text-foreground/70">
                    {localizedName(companiesById.get(member.companyId), locale) || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {localizedName(administrationsById.get(member.administrationId), locale) || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {localizedName(departmentsById.get(member.departmentId), locale) || "—"}
                  </td>
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/employees/${member.id}`}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                        >
                          {tCommon("view")}
                        </Link>
                        {canUpdate && (
                          <Link
                            href={`/employees/${member.id}/edit`}
                            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                          >
                            {tCommon("edit")}
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(member)}
                            disabled={user?.uid === member.id}
                            title={user?.uid === member.id ? tEdit("cannotDeleteSelf") : undefined}
                            className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
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
