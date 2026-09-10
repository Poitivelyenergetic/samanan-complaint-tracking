"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { subscribeToComplaints } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToComplaintTypes } from "@/lib/complaintTypes";
import { subscribeToComplaintSources } from "@/lib/complaintSources";
import { useAuth } from "@/lib/auth-context";
import {
  COMPLAINT_STATUSES,
  hasPermission,
  localizedName,
  type Complaint,
  type ComplaintSource,
  type ComplaintStatus,
  type ComplaintType,
  type StaffUser,
} from "@/lib/types";
import Select from "@/components/Select";

const STATUS_COLORS: Record<ComplaintStatus, string> = {
  Open: "#3b82f6",
  Assigned: "#06b6d4",
  Processing: "#f59e0b",
  Cancel: "#64748b",
  Closed: "#22c55e",
};

type DateFilter = "all" | "today" | "7d" | "30d" | "month";

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-4 h-64">{children}</div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-xl border p-4 shadow-sm"
      style={{
        backgroundColor: `${color}1f`,
        borderColor: `${color}40`,
        borderInlineStartWidth: 4,
        borderInlineStartColor: color,
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">{label}</p>
      <p className="mt-1.5 text-3xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function cutoffFor(filter: DateFilter): Date | null {
  const now = new Date();
  switch (filter) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "all":
    default:
      return null;
  }
}

export default function HomePage() {
  const t = useTranslations("home");
  const tStatus = useTranslations("status");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const { profile } = useAuth();

  const canView = hasPermission(profile, "complaints", "view");
  const canViewAll = hasPermission(profile, "complaints", "viewAll");

  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [complaintTypes, setComplaintTypes] = useState<ComplaintType[]>([]);
  const [complaintSources, setComplaintSources] = useState<ComplaintSource[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [employeeFilter, setEmployeeFilter] = useState("");

  useEffect(() => {
    if (!profile || !canView) return;
    return subscribeToComplaints(setComplaints, undefined, canViewAll ? undefined : profile.id);
  }, [profile, canView, canViewAll]);
  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToComplaintTypes(setComplaintTypes), []);
  useEffect(() => subscribeToComplaintSources(setComplaintSources), []);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const typesById = useMemo(() => new Map(complaintTypes.map((ct) => [ct.id, ct])), [complaintTypes]);
  const sourcesById = useMemo(() => new Map(complaintSources.map((cs) => [cs.id, cs])), [complaintSources]);

  const list = useMemo(() => {
    const base = complaints ?? [];
    const cutoff = cutoffFor(dateFilter);
    return base.filter((c) => {
      if (cutoff && new Date(c.createdAt) < cutoff) return false;
      if (employeeFilter && c.assignedTo !== employeeFilter) return false;
      return true;
    });
  }, [complaints, dateFilter, employeeFilter]);

  const statusData = useMemo(
    () =>
      COMPLAINT_STATUSES.map((status) => ({
        status,
        label: tStatus(status),
        count: list.filter((c) => c.status === status).length,
      })),
    [list, tStatus]
  );
  // The pie only plots statuses that actually occur — an empty 0-count
  // slice has no visual width but still confuses the legend/tooltip.
  const statusPieData = useMemo(() => statusData.filter((row) => row.count > 0), [statusData]);

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    list.forEach((c) => {
      const label = typesById.get(c.complaintTypeId)?.name;
      if (!label) return;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));
  }, [list, typesById]);

  const sourceData = useMemo(() => {
    const counts = new Map<string, number>();
    list.forEach((c) => {
      const label = sourcesById.get(c.complaintSourceId)?.name;
      if (!label) return;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));
  }, [list, sourcesById]);

  const trendData = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({
        date: d.toISOString().slice(0, 10),
        label: format.dateTime(d, { month: "short", day: "numeric" }),
        count: 0,
      });
    }
    const byDay = new Map(days.map((d) => [d.date, d]));
    list.forEach((c) => {
      const bucket = byDay.get(c.createdAt.slice(0, 10));
      if (bucket) bucket.count += 1;
    });
    return days;
  }, [list, format]);

  const topAssignees = useMemo(() => {
    const counts = new Map<string, number>();
    list.forEach((c) => {
      if (!c.assignedTo) return;
      counts.set(c.assignedTo, (counts.get(c.assignedTo) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([uid, count]) => ({ name: localizedName(staffById.get(uid), locale) || uid, count }));
  }, [list, staffById, locale]);

  const name = profile ? localizedName(profile, locale) || profile.username : "";

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">{t("welcome", { name })}</h1>
      <p className="mt-0.5 text-sm text-foreground/60">{canViewAll ? t("subtitleAdmin") : t("subtitleEmployee")}</p>

      {!canView ? (
        <p className="mt-6 rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-foreground/50">
          {t("noData")}
        </p>
      ) : complaints === null ? (
        <p className="mt-6 text-sm text-foreground/50">{tCommon("loading")}</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              className="w-auto rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              aria-label={t("dateFilter")}
            >
              <option value="all">{t("dateFilterAll")}</option>
              <option value="today">{t("dateFilterToday")}</option>
              <option value="7d">{t("dateFilterLast7")}</option>
              <option value="30d">{t("dateFilterLast30")}</option>
              <option value="month">{t("dateFilterThisMonth")}</option>
            </Select>

            {canViewAll && (
              <Select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="w-auto rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                aria-label={t("employeeFilter")}
              >
                <option value="">{t("employeeFilterAll")}</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {localizedName(member, locale)}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label={t("totalTickets")} value={list.length} color="#385bc1" />
            {statusData.map((row) => (
              <StatCard key={row.status} label={row.label} value={row.count} color={STATUS_COLORS[row.status]} />
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title={t("statusBreakdown")}>
              {statusPieData.length === 0 ? (
                <EmptyChart text={t("noData")} />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      isAnimationActive={false}
                      label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                      labelLine={false}
                    >
                      {statusPieData.map((row) => (
                        <Cell key={row.status} fill={STATUS_COLORS[row.status]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title={t("categoryBreakdown")}>
              {categoryData.length === 0 ? (
                <EmptyChart text={t("noData")} />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                    <YAxis type="category" dataKey="label" width={110} stroke="var(--foreground)" opacity={0.7} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#385bc1" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title={t("sourceBreakdown")}>
              {sourceData.length === 0 ? (
                <EmptyChart text={t("noData")} />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceData} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                    <YAxis type="category" dataKey="label" width={110} stroke="var(--foreground)" opacity={0.7} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title={t("trend")}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--foreground)" opacity={0.5} fontSize={11} />
                  <YAxis allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#385bc1" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {canViewAll && (
              <ChartCard title={t("topAssignees")}>
                {topAssignees.length === 0 ? (
                  <EmptyChart text={t("noData")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topAssignees} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                      <YAxis type="category" dataKey="name" width={110} stroke="var(--foreground)" opacity={0.7} fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-foreground/40">{text}</div>;
}
