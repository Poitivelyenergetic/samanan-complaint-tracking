"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToComplaintSources, deleteComplaintSource } from "@/lib/complaintSources";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, type ComplaintSource } from "@/lib/types";

export default function ComplaintSourcesPage() {
  const t = useTranslations("complaintSources");
  const tCommon = useTranslations("common");
  const { profile } = useAuth();
  const canCreate = hasPermission(profile, "complaintSources", "create");
  const canUpdate = hasPermission(profile, "complaintSources", "update");
  const canDelete = hasPermission(profile, "complaintSources", "delete");
  const showActions = canUpdate || canDelete;

  const [sources, setSources] = useState<ComplaintSource[] | null>(null);

  useEffect(() => subscribeToComplaintSources(setSources), []);

  async function handleDelete(source: ComplaintSource) {
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteComplaintSource(source.id);
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
            href="/complaint-sources/new"
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
            {sources === null ? (
              <tr>
                <td colSpan={showActions ? 2 : 1} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : sources.length === 0 ? (
              <tr>
                <td colSpan={showActions ? 2 : 1} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              sources.map((source) => (
                <tr key={source.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    {canUpdate ? (
                      <Link href={`/complaint-sources/${source.id}`} className="font-medium text-foreground hover:text-brand">
                        {source.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{source.name}</span>
                    )}
                  </td>
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {canUpdate && (
                          <Link
                            href={`/complaint-sources/${source.id}`}
                            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                          >
                            {tCommon("edit")}
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(source)}
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
