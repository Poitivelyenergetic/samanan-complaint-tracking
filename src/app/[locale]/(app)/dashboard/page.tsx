"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToComplaints } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToComplaintSources } from "@/lib/complaintSources";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  localizedName,
  type Complaint,
  type ComplaintSource,
  type ComplaintStatus,
  type StaffUser,
} from "@/lib/types";
import { COMPLAINT_STATUSES } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import Select from "@/components/Select";
import { IconClipboardList, IconGear, IconInbox, IconShieldCheck } from "@/components/icons";

function StatCard({
  icon,
  iconClassName,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconClassName: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className={`inline-flex rounded-lg p-2 ${iconClassName}`}>{icon}</div>
      <p className="mt-4 text-sm font-medium text-foreground/60">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const format = useFormatter();
  const locale = useLocale();
  const { profile } = useAuth();
  const canView = hasPermission(profile, "complaints", "view");
  const canCreate = hasPermission(profile, "complaints", "create");
  const canViewAll = hasPermission(profile, "complaints", "viewAll");
  const searchParams = useSearchParams();

  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [complaintSources, setComplaintSources] = useState<ComplaintSource[]>([]);
  const [search, setSearch] = useState("");
  // Lets the home page's stat cards link straight into a status-filtered
  // view (e.g. /dashboard?status=Open). Adjusted during render (the
  // React-recommended way to sync state to a changing external value)
  // rather than in an effect, so it stays in sync even when arriving here
  // again from a different stat card link doesn't remount the page.
  const paramStatus = searchParams.get("status");
  const validParamStatus = (
    paramStatus && (COMPLAINT_STATUSES as readonly string[]).includes(paramStatus) ? paramStatus : ""
  ) as ComplaintStatus | "";
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | "">(validParamStatus);
  const [syncedParamStatus, setSyncedParamStatus] = useState(validParamStatus);
  if (validParamStatus !== syncedParamStatus) {
    setSyncedParamStatus(validParamStatus);
    setStatusFilter(validParamStatus);
  }
  const [assigneeFilter, setAssigneeFilter] = useState("");

  useEffect(() => {
    if (!profile || !canView) return;
    return subscribeToComplaints(setComplaints, undefined, canViewAll ? undefined : profile.id);
  }, [profile, canView, canViewAll]);
  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToComplaintSources(setComplaintSources), []);

  const staffById = useMemo(() => {
    const map = new Map<string, StaffUser>();
    staff.forEach((s) => map.set(s.id, s));
    return map;
  }, [staff]);
  const sourcesById = useMemo(() => new Map(complaintSources.map((s) => [s.id, s])), [complaintSources]);

  const visibleComplaints = useMemo(() => (canView ? complaints : []), [canView, complaints]);

  const statusCounts = useMemo(() => {
    const counts: Record<ComplaintStatus, number> = { Open: 0, Assigned: 0, Processing: 0, Cancel: 0, Closed: 0 };
    (visibleComplaints ?? []).forEach((c) => {
      counts[c.status] += 1;
    });
    return counts;
  }, [visibleComplaints]);

  const filtered = useMemo(() => {
    if (!visibleComplaints) return [];
    const term = search.trim().toLowerCase();
    return visibleComplaints.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (assigneeFilter && c.assignedTo !== assigneeFilter) return false;
      if (
        term &&
        !c.subject.toLowerCase().includes(term) &&
        !c.customerName.toLowerCase().includes(term) &&
        !c.customerPhone.toLowerCase().includes(term) &&
        !c.id.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [visibleComplaints, search, statusFilter, assigneeFilter]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{canViewAll ? t("title") : t("tasksTitle")}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{canViewAll ? t("subtitle") : t("tasksSubtitle")}</p>
        </div>
        {canCreate && (
          <Link
            href="/complaints/new"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {t("newButton")}
          </Link>
        )}
      </div>

      {visibleComplaints !== null && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            icon={<IconClipboardList />}
            iconClassName="bg-blue-50 text-blue-600"
            label={t("stats.total")}
            value={visibleComplaints.length}
          />
          <StatCard
            icon={<IconInbox />}
            iconClassName="bg-indigo-50 text-indigo-600"
            label={t("stats.open")}
            value={statusCounts.Open}
          />
          <StatCard
            icon={<IconGear />}
            iconClassName="bg-amber-50 text-amber-600"
            label={t("stats.processing")}
            value={statusCounts.Processing}
          />
          <StatCard
            icon={<IconShieldCheck />}
            iconClassName="bg-green-50 text-green-600"
            label={t("stats.closed")}
            value={statusCounts.Closed}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-[220px] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <Select
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
        </Select>
        {canViewAll && (
          <Select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            aria-label={t("assigneeFilter")}
          >
            <option value="">{t("assigneeFilter")}: {tCommon("all")}</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {localizedName(member, locale)}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[940px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.issueId")}</th>
              <th className="px-4 py-3 text-start">{t("table.subject")}</th>
              <th className="px-4 py-3 text-start">{t("table.customer")}</th>
              <th className="px-4 py-3 text-start">{t("table.customerPhone")}</th>
              <th className="px-4 py-3 text-start">{t("table.source")}</th>
              <th className="px-4 py-3 text-start">{t("table.assignedTo")}</th>
              <th className="px-4 py-3 text-start">{t("table.status")}</th>
              <th className="px-4 py-3 text-start">{t("table.createdAt")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleComplaints === null ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-foreground/50">
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
                      {c.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/complaints/${c.id}`} className="font-medium text-foreground hover:text-brand">
                      {c.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {c.customerName || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground/70" dir="ltr">
                    {c.customerPhone || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {(() => {
                      const source = sourcesById.get(c.complaintSourceId);
                      return source ? localizedName(source, locale) : "—";
                    })()}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {c.assignedTo ? localizedName(staffById.get(c.assignedTo), locale) || c.assignedTo : tCommon("unassigned")}
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
