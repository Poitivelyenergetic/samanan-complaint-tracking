"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToDepartments } from "@/lib/departments";
import { subscribeToPendingSignupRequests } from "@/lib/signupRequests";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  localizedName,
  type Administration,
  type Company,
  type Department,
  type StaffUser,
} from "@/lib/types";

export default function EmployeesPage() {
  const t = useTranslations("employees");
  const tRequests = useTranslations("employees.requests");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { profile } = useAuth();
  const canCreate = hasPermission(profile, "employees", "create");
  const canUpdate = hasPermission(profile, "employees", "update");

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

  const filtered = useMemo(() => {
    if (!staff) return [];
    const term = search.trim().toLowerCase();
    return staff.filter((s) => {
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
  }, [staff, search, companyFilter, administrationFilter, departmentFilter]);

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
        <select
          value={companyFilter}
          onChange={(e) => {
            setCompanyFilter(e.target.value);
            setAdministrationFilter("");
            setDepartmentFilter("");
          }}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        >
          <option value="">{t("filterAllCompanies")}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {localizedName(c, locale)}
            </option>
          ))}
        </select>
        <select
          value={administrationFilter}
          onChange={(e) => {
            setAdministrationFilter(e.target.value);
            setDepartmentFilter("");
          }}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        >
          <option value="">{t("filterAllAdministrations")}</option>
          {(companyFilter ? administrations.filter((a) => a.companyId === companyFilter) : administrations).map(
            (a) => (
              <option key={a.id} value={a.id}>
                {localizedName(a, locale)}
              </option>
            )
          )}
        </select>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        >
          <option value="">{t("filterAllDepartments")}</option>
          {(administrationFilter
            ? departments.filter((d) => d.administrationId === administrationFilter)
            : departments
          ).map((d) => (
            <option key={d.id} value={d.id}>
              {localizedName(d, locale)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[720px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.name")}</th>
              <th className="px-4 py-3 text-start">{t("table.username")}</th>
              <th className="px-4 py-3 text-start">{t("table.company")}</th>
              <th className="px-4 py-3 text-start">{t("table.administration")}</th>
              <th className="px-4 py-3 text-start">{t("table.department")}</th>
            </tr>
          </thead>
          <tbody>
            {staff === null ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              filtered.map((member) => (
                <tr key={member.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    {canUpdate ? (
                      <Link href={`/employees/${member.id}`} className="font-medium text-foreground hover:text-brand">
                        {localizedName(member, locale)}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{localizedName(member, locale)}</span>
                    )}
                  </td>
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
