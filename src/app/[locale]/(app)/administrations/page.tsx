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

export default function AdministrationsPage() {
  const t = useTranslations("administrations");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { profile } = useAuth();
  const canCreate = hasPermission(profile, "administrations", "create");
  const canDelete = hasPermission(profile, "administrations", "delete");

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
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const filtered = useMemo(() => {
    if (!administrations) return [];
    return companyFilter ? administrations.filter((a) => a.companyId === companyFilter) : administrations;
  }, [administrations, companyFilter]);

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

      <div className="mt-4">
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        >
          <option value="">{t("filterAllCompanies")}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {localizedName(c, locale)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[560px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.nameAr")}</th>
              <th className="px-4 py-3 text-start">{t("table.nameEn")}</th>
              <th className="px-4 py-3 text-start">{t("table.company")}</th>
              <th className="px-4 py-3 text-start">{t("table.manager")}</th>
              {canDelete && <th className="px-4 py-3 text-start">{tCommon("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {administrations === null ? (
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
              filtered.map((administration) => (
                <tr key={administration.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
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
                  {canDelete && (
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleDelete(administration)}
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        {tCommon("delete")}
                      </button>
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
