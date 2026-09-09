"use client";

import { useEffect, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToRoles } from "@/lib/roles";
import { deleteRole } from "@/lib/roles-api";
import { useAuth } from "@/lib/auth-context";
import { CRUD_ACTIONS, hasPermission, PERMISSION_RESOURCES, type Role } from "@/lib/types";

function countGranted(role: Role): number {
  let count = 0;
  for (const resource of PERMISSION_RESOURCES) {
    for (const action of CRUD_ACTIONS) {
      if (role.permissions[resource][action]) count++;
    }
  }
  if (role.permissions.marketing.view) count++;
  return count;
}

export default function RolesPage() {
  const t = useTranslations("roles");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const { profile } = useAuth();
  const canCreate = hasPermission(profile, "roles", "create");
  const canUpdate = hasPermission(profile, "roles", "update");
  const canDelete = hasPermission(profile, "roles", "delete");
  const showActions = canUpdate || canDelete;

  const [roles, setRoles] = useState<Role[] | null>(null);

  useEffect(() => subscribeToRoles(setRoles), []);

  async function handleDelete(role: Role) {
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteRole(role.id);
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
            href="/roles/new"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {t("newButton")}
          </Link>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[480px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.name")}</th>
              <th className="px-4 py-3 text-start">{t("table.permissionCount")}</th>
              <th className="px-4 py-3 text-start">{t("table.updatedAt")}</th>
              {showActions && <th className="px-4 py-3 text-start">{tCommon("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {roles === null ? (
              <tr>
                <td colSpan={showActions ? 4 : 3} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : roles.length === 0 ? (
              <tr>
                <td colSpan={showActions ? 4 : 3} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr key={role.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/roles/${role.id}`} className="font-medium text-foreground hover:text-brand">
                      {role.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{countGranted(role)}</td>
                  <td className="px-4 py-3 text-foreground/60">
                    {format.dateTime(new Date(role.updatedAt), { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {canUpdate && (
                          <Link
                            href={`/roles/${role.id}`}
                            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-black/5"
                          >
                            {tCommon("edit")}
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(role)}
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
