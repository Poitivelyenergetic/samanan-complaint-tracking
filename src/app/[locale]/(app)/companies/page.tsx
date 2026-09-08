"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  createCompany,
  deleteCompany,
  renameCompany,
  subscribeToCompanies,
} from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToPendingSignupRequests } from "@/lib/signupRequests";
import { useAuth } from "@/lib/auth-context";
import type { Administration, Company, StaffUser } from "@/lib/types";

export default function CompaniesPage() {
  const t = useTranslations("companies");
  const tCommon = useTranslations("common");
  const tRequests = useTranslations("employees.requests");
  const { profile } = useAuth();
  const canManageCompanies = profile?.permissions.manageCompanies === true;
  const canManageEmployees = profile?.permissions.manageEmployees === true;

  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => {
    if (!canManageEmployees) return;
    return subscribeToPendingSignupRequests((requests) => setPendingCount(requests.length));
  }, [canManageEmployees]);

  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return staff
      .filter(
        (s) => s.name.toLowerCase().includes(term) || s.username.toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [staff, search]);

  async function handleAdd() {
    const name = window.prompt(t("addPrompt"))?.trim();
    if (!name) return;
    await createCompany(name);
  }

  async function handleRename(company: Company) {
    const name = window.prompt(t("renamePrompt"), company.name)?.trim();
    if (!name || name === company.name) return;
    await renameCompany(company.id, name);
  }

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
        <div className="flex items-center gap-3">
          {canManageEmployees && (
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
          {canManageCompanies && (
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
            >
              {t("addButton")}
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-4 max-w-md">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search.placeholder")}
          type="search"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        {search.trim() && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface shadow-sm">
            {searchResults.length === 0 ? (
              <p className="px-3 py-2 text-sm text-foreground/50">{t("search.noResults")}</p>
            ) : (
              searchResults.map((s) => (
                <Link
                  key={s.id}
                  href={`/employees/${s.id}`}
                  className="block px-3 py-2 text-sm hover:bg-black/5"
                >
                  <span className="font-medium text-foreground">{s.name}</span>
                  <span className="ms-2 text-foreground/50">{s.username}</span>
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      <div className="mt-6 space-y-2">
        {companies === null ? (
          <p className="text-sm text-foreground/50">{tCommon("loading")}</p>
        ) : companies.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-foreground/50">
            {t("noResults")}
          </p>
        ) : (
          companies.map((company) => (
            <div
              key={company.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:bg-black/[0.02]"
            >
              <Link href={`/companies/${company.id}`} className="flex-1 font-medium text-foreground hover:text-brand">
                {company.name}
              </Link>
              {canManageCompanies && (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRename(company)}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                  >
                    {t("rename")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(company)}
                    className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    {tCommon("delete")}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
