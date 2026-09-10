"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToComplaintTypes, deleteComplaintType } from "@/lib/complaintTypes";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type ComplaintType } from "@/lib/types";

export default function ComplaintTypesPage() {
  const t = useTranslations("complaintTypes");
  const tCommon = useTranslations("common");
  const { profile } = useAuth();
  const canCreate = hasPermission(profile, "complaintTypes", "create");
  const canUpdate = hasPermission(profile, "complaintTypes", "update");
  const canDelete = hasPermission(profile, "complaintTypes", "delete");
  const showActions = canUpdate || canDelete;

  const [types, setTypes] = useState<ComplaintType[] | null>(null);

  useEffect(() => subscribeToComplaintTypes(setTypes), []);

  async function handleDelete(type: ComplaintType) {
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteComplaintType(type.id);
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
            href="/complaint-types/new"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {t("newButton")}
          </Link>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[420px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.name")}</th>
              {showActions && <th className="px-4 py-3 text-start">{tCommon("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {types === null ? (
              <tr>
                <td colSpan={showActions ? 2 : 1} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : types.length === 0 ? (
              <tr>
                <td colSpan={showActions ? 2 : 1} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              types.map((type) => (
                <tr key={type.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    {canUpdate ? (
                      <Link href={`/complaint-types/${type.id}`} className="font-medium text-foreground hover:text-brand">
                        {type.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{type.name}</span>
                    )}
                  </td>
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {canUpdate && (
                          <Link
                            href={`/complaint-types/${type.id}`}
                            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                          >
                            {tCommon("edit")}
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(type)}
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
