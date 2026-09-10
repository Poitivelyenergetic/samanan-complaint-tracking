"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToCompanies, deleteCompany } from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type Administration, type Company, type StaffUser } from "@/lib/types";

export default function CompaniesPage() {
  const t = useTranslations("companies");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { profile } = useAuth();
  const canCreate = hasPermission(profile, "companies", "create");
  const canUpdate = hasPermission(profile, "companies", "update");
  const canDelete = hasPermission(profile, "companies", "delete");
  // The View action is always available to anyone who can reach this list,
  // so the Actions column itself is always shown now (not just when the
  // viewer also holds update/delete).
  const showActions = true;

  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);

  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  const staffById = useMemo(() => {
    const map = new Map<string, StaffUser>();
    staff.forEach((s) => map.set(s.id, s));
    return map;
  }, [staff]);

  async function handleDelete(company: Company) {
    const hasAdministrations = administrations.some((a) => a.companyId === company.id);
    if (hasAdministrations) {
      window.alert(t("deleteBlocked"));
      return;
    }
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteCompany(company.id);
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
            href="/companies/new"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {t("newButton")}
          </Link>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[560px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.number")}</th>
              <th className="px-4 py-3 text-start">{t("table.nameAr")}</th>
              <th className="px-4 py-3 text-start">{t("table.nameEn")}</th>
              <th className="px-4 py-3 text-start">{t("table.manager")}</th>
              {showActions && <th className="px-4 py-3 text-start">{tCommon("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {companies === null ? (
              <tr>
                <td colSpan={showActions ? 5 : 4} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : companies.length === 0 ? (
              <tr>
                <td colSpan={showActions ? 5 : 4} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              companies.map((company) => (
                <tr key={company.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/companies/${company.id}`} className="font-medium text-foreground hover:text-brand">
                      {company.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{company.nameAr || "—"}</td>
                  <td className="px-4 py-3 text-foreground/70">{company.nameEn || "—"}</td>
                  <td className="px-4 py-3 text-foreground/70">
                    {company.managerId
                      ? localizedName(staffById.get(company.managerId), locale) || "—"
                      : t("managerNotAssigned")}
                  </td>
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/companies/${company.id}`}
                          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                        >
                          {tCommon("view")}
                        </Link>
                        {canUpdate && (
                          <Link
                            href={`/companies/${company.id}/edit`}
                            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                          >
                            {tCommon("edit")}
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(company)}
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
