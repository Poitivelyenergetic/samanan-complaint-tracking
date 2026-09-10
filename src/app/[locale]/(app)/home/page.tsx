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
import { useAuth } from "@/lib/auth-context";
import {
  bilingualValue,
  COMPLAINT_STATUSES,
  hasPermission,
  localizedName,
  type Complaint,
  type ComplaintStatus,
  type StaffUser,
} from "@/lib/types";

const STATUS_COLORS: Record<ComplaintStatus, string> = {
  Open: "#3b82f6",
  Assigned: "#6366f1",
  Processing: "#f59e0b",
  Cancel: "#9ca3af",
  Closed: "#22c55e",
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-4 h-64">{children}</div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-foreground/50">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  );
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

  useEffect(() => {
    if (!profile || !canView) return;
    return subscribeToComplaints(setComplaints, undefined, canViewAll ? undefined : profile.id);
  }, [profile, canView, canViewAll]);
  useEffect(() => subscribeToStaff(setStaff), []);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const list = useMemo(() => complaints ?? [], [complaints]);

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

  // Category/source are handwritten free text (Arabic + English) — group by
  // whichever language the current locale prefers.
  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    list.forEach((c) => {
      const label = bilingualValue(c.categoryAr, c.categoryEn, locale);
      if (!label) return;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));
  }, [list, locale]);

  const sourceData = useMemo(() => {
    const counts = new Map<string, number>();
    list.forEach((c) => {
      const label = bilingualValue(c.sourceAr, c.sourceEn, locale);
      if (!label) return;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));
  }, [list, locale]);

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
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label={t("totalTickets")} value={list.length} />
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
                      paddingAngle={2}
                      isAnimationActive={false}
                      label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                      labelLine={false}
                    >
                      {statusPieData.map((row) => (
                        <Cell key={row.status} fill={STATUS_COLORS[row.status]} />
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
                    <Bar dataKey="count" fill="#385bc1" radius={[0, 4, 4, 0]} />
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
                    <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} />
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
                  <Line type="monotone" dataKey="count" stroke="#385bc1" strokeWidth={2} dot={false} />
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
                      <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
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
