"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getCompany } from "@/lib/companies";
import { getAdministration } from "@/lib/administrations";
import {
  createPosition,
  deletePosition,
  renamePosition,
  subscribeToPositions,
} from "@/lib/positions";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import type { Administration, Company, Position, StaffUser } from "@/lib/types";

export default function PositionsPage({
  params,
}: {
  params: Promise<{ companyId: string; administrationId: string }>;
}) {
  const { companyId, administrationId } = use(params);
  const t = useTranslations("companies");
  const tPositions = useTranslations("companies.administrations.positions");
  const tCommon = useTranslations("common");
  const { profile } = useAuth();
  const canManage =
    profile?.permissions.manageCompanies === true ||
    profile?.permissions.manageAdministrations === true ||
    profile?.permissions.managePositions === true;

  const [company, setCompany] = useState<Company | null | undefined>(undefined);
  const [administration, setAdministration] = useState<Administration | null | undefined>(
    undefined
  );
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);

  useEffect(() => {
    getCompany(companyId).then(setCompany);
  }, [companyId]);
  useEffect(() => {
    getAdministration(administrationId).then(setAdministration);
  }, [administrationId]);
  useEffect(() => subscribeToPositions(setPositions), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  const positionsHere = (positions ?? []).filter((p) => p.administrationId === administrationId);

  async function handleAdd() {
    const name = window.prompt(tPositions("addPrompt"))?.trim();
    if (!name) return;
    await createPosition(name, administrationId);
  }

  async function handleRename(position: Position) {
    const name = window.prompt(t("renamePrompt"), position.name)?.trim();
    if (!name || name === position.name) return;
    await renamePosition(position.id, name);
  }

  async function handleDelete(position: Position) {
    const hasEmployees = staff.some((s) => s.positionId === position.id);
    if (hasEmployees) {
      window.alert(tPositions("deleteBlocked"));
      return;
    }
    if (!window.confirm(tPositions("deleteConfirm"))) return;
    await deletePosition(position.id);
  }

  if (company === undefined || administration === undefined || positions === null) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (company === null || administration === null) {
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
      <nav className="flex flex-wrap items-center gap-1.5 text-sm">
        <Link href="/companies" className="text-brand hover:underline">
          {t("title")}
        </Link>
        <span className="text-foreground/40">/</span>
        <Link href={`/companies/${companyId}`} className="text-brand hover:underline">
          {company.name}
        </Link>
        <span className="text-foreground/40">/</span>
        <span className="text-foreground/70">{administration.name}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{administration.name}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{tPositions("subtitle")}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {tPositions("addButton")}
          </button>
        )}
      </div>

      <div className="mt-6 space-y-2">
        {positionsHere.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-foreground/50">
            {tPositions("noResults")}
          </p>
        ) : (
          positionsHere.map((position) => (
            <div
              key={position.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:bg-black/[0.02]"
            >
              <Link
                href={`/companies/${companyId}/${administrationId}/${position.id}`}
                className="flex-1 font-medium text-foreground hover:text-brand"
              >
                {position.name}
              </Link>
              {canManage && (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRename(position)}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                  >
                    {t("rename")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(position)}
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
