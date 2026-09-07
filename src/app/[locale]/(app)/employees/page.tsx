"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToPendingSignupRequests } from "@/lib/signupRequests";
import type { StaffUser } from "@/lib/types";

export default function EmployeesPage() {
  const t = useTranslations("employees");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("roles");

  const [staff, setStaff] = useState<StaffUser[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToPendingSignupRequests((requests) => setPendingCount(requests.length)), []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/employees/requests"
            className="relative rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-black/5"
          >
            {t("requests.navLink")}
            {pendingCount > 0 && (
              <span className="ms-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-semibold text-brand-foreground">
                {pendingCount}
              </span>
            )}
          </Link>
          <Link
            href="/employees/new"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {t("newButton")}
          </Link>
        </div>
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
