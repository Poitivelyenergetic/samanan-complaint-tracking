"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getCompany } from "@/lib/companies";
import { getAdministration } from "@/lib/administrations";
import { getPosition } from "@/lib/positions";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import type { Administration, Company, Position, StaffUser } from "@/lib/types";

export default function EmployeesByPositionPage({
  params,
}: {
  params: Promise<{ companyId: string; administrationId: string; positionId: string }>;
}) {
  const { companyId, administrationId, positionId } = use(params);
  const t = useTranslations("companies");
  const tEmployees = useTranslations("companies.administrations.positions.employees");
  const tCommon = useTranslations("common");
  const tTable = useTranslations("employees.table");
  const tRoles = useTranslations("roles");
  const { profile } = useAuth();
  const canManageEmployees = profile?.permissions.manageEmployees === true;

  const [company, setCompany] = useState<Company | null | undefined>(undefined);
  const [administration, setAdministration] = useState<Administration | null | undefined>(
    undefined
  );
  const [position, setPosition] = useState<Position | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffUser[] | null>(null);

  useEffect(() => {
    getCompany(companyId).then(setCompany);
  }, [companyId]);
  useEffect(() => {
    getAdministration(administrationId).then(setAdministration);
  }, [administrationId]);
  useEffect(() => {
    getPosition(positionId).then(setPosition);
  }, [positionId]);
  useEffect(() => subscribeToStaff(setStaff), []);

  if (
    company === undefined ||
    administration === undefined ||
    position === undefined ||
    staff === null
  ) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (company === null || administration === null || position === null) {
    return (
      <div>
        <p className="text-sm text-foreground/60">{t("notFound")}</p>
        <Link href="/companies" className="mt-2 inline-block text-sm text-brand hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  const employeesHere = staff.filter((s) => s.positionId === positionId);

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
        <Link href={`/companies/${companyId}/${administrationId}`} className="text-brand hover:underline">
          {administration.name}
        </Link>
        <span className="text-foreground/40">/</span>
        <span className="text-foreground/70">{position.name}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{position.name}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{tEmployees("subtitle")}</p>
        </div>
        {canManageEmployees && (
          <Link
            href={{
              pathname: "/employees/new",
              query: { companyId, administrationId, positionId },
            }}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {tEmployees("addButton")}
          </Link>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[480px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{tTable("name")}</th>
              <th className="px-4 py-3 text-start">{tTable("username")}</th>
              <th className="px-4 py-3 text-start">{tTable("role")}</th>
            </tr>
          </thead>
          <tbody>
            {employeesHere.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-foreground/50">
                  {tEmployees("noResults")}
                </td>
              </tr>
            ) : (
              employeesHere.map((member) => (
                <tr key={member.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/employees/${member.id}`} className="font-medium text-foreground hover:text-brand">
                      {member.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{member.username}</td>
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
