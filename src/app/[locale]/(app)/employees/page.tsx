"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToStaff } from "@/lib/users";
import type { StaffUser } from "@/lib/types";

export default function EmployeesPage() {
  const t = useTranslations("employees");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("roles");

  const [staff, setStaff] = useState<StaffUser[] | null>(null);

  useEffect(() => subscribeToStaff(setStaff), []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        <Link
          href="/employees/new"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
        >
          {t("newButton")}
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[640px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.name")}</th>
              <th className="px-4 py-3 text-start">{t("table.username")}</th>
              <th className="px-4 py-3 text-start">{t("table.position")}</th>
              <th className="px-4 py-3 text-start">{t("table.administration")}</th>
              <th className="px-4 py-3 text-start">{t("table.role")}</th>
            </tr>
          </thead>
          <tbody>
            {staff === null ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : staff.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              staff.map((member) => (
                <tr
                  key={member.id}
                  className="border-b border-border last:border-0 hover:bg-black/[0.02]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/employees/${member.id}`}
                      className="font-medium text-foreground hover:text-brand"
                    >
                      {member.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{member.username}</td>
                  <td className="px-4 py-3 text-foreground/70">{member.position}</td>
                  <td className="px-4 py-3 text-foreground/70">{member.administration}</td>
                  <td className="px-4 py-3 text-foreground/70">{tRoles(member.role)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
