"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getCompany } from "@/lib/companies";
import {
  createAdministration,
  deleteAdministration,
  renameAdministration,
  subscribeToAdministrations,
} from "@/lib/administrations";
import { subscribeToPositions } from "@/lib/positions";
import { useAuth } from "@/lib/auth-context";
import type { Administration, Company, Position } from "@/lib/types";

export default function AdministrationsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);
  const t = useTranslations("companies");
  const tAdministrations = useTranslations("companies.administrations");
  const tCommon = useTranslations("common");
  const { profile } = useAuth();
  const canManage =
    profile?.permissions.manageCompanies === true ||
    profile?.permissions.manageAdministrations === true;

  const [company, setCompany] = useState<Company | null | undefined>(undefined);
  const [administrations, setAdministrations] = useState<Administration[] | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    getCompany(companyId).then(setCompany);
  }, [companyId]);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToPositions(setPositions), []);

  const administrationsHere = (administrations ?? []).filter((a) => a.companyId === companyId);

  async function handleAdd() {
    const name = window.prompt(tAdministrations("addPrompt"))?.trim();
    if (!name) return;
    await createAdministration(name, companyId);
  }

  async function handleRename(administration: Administration) {
    const name = window.prompt(t("renamePrompt"), administration.name)?.trim();
    if (!name || name === administration.name) return;
    await renameAdministration(administration.id, name);
  }

  async function handleDelete(administration: Administration) {
    const hasPositions = positions.some((p) => p.administrationId === administration.id);
    if (hasPositions) {
      window.alert(tAdministrations("deleteBlocked"));
      return;
    }
    if (!window.confirm(tAdministrations("deleteConfirm"))) return;
    await deleteAdministration(administration.id);
  }

  if (company === undefined || administrations === null) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (company === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/companies" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <nav className="flex items-center gap-1.5 text-sm">
        <Link href="/companies" className="text-brand hover:underline">
          {t("title")}
        </Link>
        <span className="text-foreground/40">/</span>
        <span className="text-foreground/70">{company.name}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{company.name}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{tAdministrations("subtitle")}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {tAdministrations("addButton")}
          </button>
        )}
      </div>

      <div className="mt-6 space-y-2">
        {administrationsHere.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-foreground/50">
            {tAdministrations("noResults")}
          </p>
        ) : (
          administrationsHere.map((administration) => (
            <div
              key={administration.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:bg-black/[0.02]"
            >
              <Link
                href={`/companies/${companyId}/${administration.id}`}
                className="flex-1 font-medium text-foreground hover:text-brand"
              >
                {administration.name}
              </Link>
              {canManage && (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRename(administration)}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                  >
                    {t("rename")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(administration)}
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
