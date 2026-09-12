"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToAdministrations, deleteAdministration } from "@/lib/administrations";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToDepartments } from "@/lib/departments";
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
import { computeManagerScope, scopeAdministrations } from "@/lib/orgScope";
import SearchableSelect from "@/components/SearchableSelect";

export default function AdministrationsPage() {
  const t = useTranslations("administrations");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { user, profile } = useAuth();
  const canCreate = hasPermission(profile, "administrations", "create");
  const canUpdate = hasPermission(profile, "administrations", "update");
  const canDelete = hasPermission(profile, "administrations", "delete");
  const showActions = true;

  const [administrations, setAdministrations] = useState<Administration[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [companyFilter, setCompanyFilter] = useState("");

  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  const companiesById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const companyFilterOptions = useMemo(
    () => [
      { id: "", label: t("filterAllCompanies") },
      ...companies.map((c) => ({ id: c.id, label: localizedName(c, locale) })),
    ],
    [companies, locale, t]
  );
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  // A General Manager (the designated manager of a company/administration/
  // department) only sees their own branch of the org tree — unless they
  // already hold complaints.viewAll, the app's "sees everything" flag.
  const hasBroaderAccess = hasPermission(profile, "complaints", "viewAll");
  const managerScope = useMemo(
    () => computeManagerScope(user?.uid, companies, administrations ?? [], departments, hasBroaderAccess),
    [user?.uid, companies, administrations, departments, hasBroaderAccess]
  );

  const filtered = useMemo(() => {
    if (!administrations) return [];
    const inScope = scopeAdministrations(administrations, managerScope);
    return companyFilter ? inScope.filter((a) => a.companyId === companyFilter) : inScope;
  }, [administrations, companyFilter, managerScope]);

  async function handleDelete(administration: Administration) {
    const hasDepartments = departments.some((d) => d.administrationId === administration.id);
    if (hasDepartments) {
      window.alert(t("deleteBlocked"));
      return;
    }
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteAdministration(administration.id);
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
            href="/administrations/new"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {t("newButton")}
          </Link>
        )}
      </div>

      <div className="mt-4 max-w-xs">
        <SearchableSelect
          items={companyFilterOptions}
          value={companyFilter}
          onChange={setCompanyFilter}
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
              <th className="px-4 py-3 text-start">{t("table.company")}</th>
              <th className="px-4 py-3 text-start">{t("table.manager")}</th>
              {showActions && <th className="px-4 py-3 text-start">{tCommon("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {administrations === null ? (
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
              filtered.map((administration) => (
                <tr key={administration.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3 font-mono text-foreground/70">{administration.number || "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/administrations/${administration.id}`}
                      className="font-medium text-foreground hover:text-brand"
                    >
                      {administration.nameAr || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{administration.nameEn || "—"}</td>
                  <td className="px-4 py-3 text-foreground/70">
                    {localizedName(companiesById.get(administration.companyId), locale) || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {administration.managerId
                      ? localizedName(staffById.get(administration.managerId), locale) || "—"
                      : t("managerNotAssigned")}
                  </td>
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/administrations/${administration.id}`}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                        >
                          {tCommon("view")}
                        </Link>
                        {canUpdate && (
                          <Link
                            href={`/administrations/${administration.id}/edit`}
                            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                          >
                            {tCommon("edit")}
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(administration)}
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
