"use client";

import { useEffect, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToRoles } from "@/lib/roles";
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

  const [roles, setRoles] = useState<Role[] | null>(null);

  useEffect(() => subscribeToRoles(setRoles), []);

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
            </tr>
          </thead>
          <tbody>
            {roles === null ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : roles.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-foreground/50">
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
