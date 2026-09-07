"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToComplaints } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import type { Complaint, ComplaintStatus, StaffUser } from "@/lib/types";
import { COMPLAINT_STATUSES } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const format = useFormatter();

  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  useEffect(() => {
    const unsubComplaints = subscribeToComplaints(setComplaints);
    const unsubStaff = subscribeToStaff(setStaff);
    return () => {
      unsubComplaints();
      unsubStaff();
    };
  }, []);

  const staffById = useMemo(() => {
    const map = new Map<string, StaffUser>();
    staff.forEach((s) => map.set(s.id, s));
    return map;
  }, [staff]);

  const filtered = useMemo(() => {
    if (!complaints) return [];
    const term = search.trim().toLowerCase();
    return complaints.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (assigneeFilter && c.assignedTo !== assigneeFilter) return false;
      if (
        term &&
        !c.subject.toLowerCase().includes(term) &&
        !c.customerNumber.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [complaints, search, statusFilter, assigneeFilter]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        <Link
          href="/complaints/new"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
        >
          {t("newButton")}
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-[220px] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ComplaintStatus | "")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          aria-label={t("statusFilter")}
        >
          <option value="">{t("statusFilter")}: {tCommon("all")}</option>
          {COMPLAINT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {tStatus(status)}
            </option>
          ))}
        </select>
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          aria-label={t("assigneeFilter")}
        >
          <option value="">{t("assigneeFilter")}: {tCommon("all")}</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[720px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.issueId")}</th>
              <th className="px-4 py-3 text-start">{t("table.subject")}</th>
              <th className="px-4 py-3 text-start">{t("table.customerNumber")}</th>
              <th className="px-4 py-3 text-start">{t("table.assignedTo")}</th>
              <th className="px-4 py-3 text-start">{t("table.status")}</th>
              <th className="px-4 py-3 text-start">{t("table.createdAt")}</th>
            </tr>
          </thead>
          <tbody>
            {complaints === null ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-0 hover:bg-black/[0.02]"
                >
                  <td className="px-4 py-3">
                    <Link href={`/complaints/${c.id}`} className="font-mono text-xs text-brand hover:underline">
                      {c.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/complaints/${c.id}`} className="font-medium text-foreground hover:text-brand">
                      {c.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{c.customerNumber}</td>
                  <td className="px-4 py-3 text-foreground/70">
                    {c.assignedTo ? staffById.get(c.assignedTo)?.name ?? c.assignedTo : tCommon("unassigned")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-foreground/60">
                    {format.dateTime(new Date(c.createdAt), { dateStyle: "medium" })}
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
