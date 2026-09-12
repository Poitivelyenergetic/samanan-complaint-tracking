"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
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
import {
  IconClipboardList,
  IconGear,
  IconInbox,
  IconShieldCheck,
  IconUsers,
  IconXCircle,
} from "@/components/icons";

// A cohesive palette anchored on the app's brand blue (#385bc1) — shades of
// blue/teal for the two blue-family statuses, plus two deliberate accent
// colors (amber for "in progress", green for "done") and a neutral gray for
// the non-outcome status, rather than a grab-bag of unrelated hues.
const STATUS_COLORS: Record<ComplaintStatus, string> = {
  Open: "#4f7fe0",
  Assigned: "#2d4a9e",
  Processing: "#d97706",
  Cancel: "#64748b",
  Closed: "#16a34a",
};

const STATUS_ICONS: Record<ComplaintStatus, React.ReactNode> = {
  Open: <IconInbox />,
  Assigned: <IconUsers />,
  Processing: <IconGear />,
  Cancel: <IconXCircle />,
  Closed: <IconShieldCheck />,
};

type DateFilter = "all" | "today" | "7d" | "30d" | "month";

// Recharts' <Tooltip> renders unstyled by default (a plain white box,
// regardless of the app's theme) — these give it the same surface/border/
// text tokens as the rest of the app so it doesn't look out of place in
// dark mode. var(--*) resolves against whichever theme is active, same as
// the stroke="var(--foreground)" pattern already used on the axes below.
const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--foreground)",
  fontSize: 12,
  padding: "8px 12px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.16)",
};
const TOOLTIP_LABEL_STYLE: React.CSSProperties = { color: "var(--foreground)", fontWeight: 600, marginBottom: 4 };
const TOOLTIP_ITEM_STYLE: React.CSSProperties = { color: "var(--foreground)" };
// The default hover cursor on bar charts is a harsh solid gray rectangle —
// tone it down to a faint themed highlight instead.
const BAR_CURSOR = { fill: "var(--border)", opacity: 0.4 };

const compactSelectClass =
  "w-auto rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand";

function ChartCard({
  title,
  large = false,
  filter,
  children,
}: {
  title: string;
  large?: boolean;
  // Each card's own filter control, rendered top-right of its header —
  // independent of every other card's filter and of the page-level
  // employee filter.
  filter?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {filter}
      </div>
      {/* Recharts' SVG text inherits the page's dir="rtl" in the Arabic
          locale, which corrupts label positioning (bar/axis labels render
          overlapping the bars instead of beside them). Forcing dir="ltr"
          here keeps chart internals laid out consistently regardless of
          the app's locale — recharts has no RTL layout mode of its own. */}
      <div dir="ltr" className={large ? "mt-4 h-80" : "mt-4 h-56"}>
        {children}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  // When set, the whole card links to the Complaints list — e.g. a status
  // card links to that status pre-filtered — so clicking a number takes you
  // straight to the underlying tickets instead of just showing the count.
  href?: string;
}) {
  const className =
    "block rounded-xl border border-border bg-surface p-4 text-start shadow-sm transition-all hover:shadow-md" +
    (href ? " hover:border-brand/40 hover:-translate-y-0.5" : "");
  const content = (
    <>
      <div className="inline-flex rounded-lg p-2" style={{ backgroundColor: `${color}1f`, color }}>
        {icon}
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-foreground/60">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

// Fades/slides a card in the first time it scrolls into view, rather than
// everything being visible immediately on load. Only triggers once (the
// observer disconnects after the first intersection) so scrolling back up
// and down doesn't re-animate it. This only ever transitions opacity/
// transform on the wrapping div — it never touches a chart's own size, so
// it can't retrigger the ResizeObserver-related issues the pie chart has.
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-500 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
    >
      {children}
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
  // "Who" stays a page-level filter (applies to every card and the top stat
  // row) — everything else is filtered per-card instead, by whichever
  // dimension makes sense for that specific chart. Status is already the
  // Status Breakdown chart's own axis, so it gets a date-range filter like
  // the page-level one used to be; the other charts get a status filter.
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [statusBreakdownDateFilter, setStatusBreakdownDateFilter] = useState<DateFilter>("all");
  const [categoryStatusFilter, setCategoryStatusFilter] = useState<ComplaintStatus | "">("");
  const [sourceStatusFilter, setSourceStatusFilter] = useState<ComplaintStatus | "">("");
  const [trendStatusFilter, setTrendStatusFilter] = useState<ComplaintStatus | "">("");
  const [topAssigneesStatusFilter, setTopAssigneesStatusFilter] = useState<ComplaintStatus | "">("");

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

  // Scoped by "who" only — the top stat row's basis, and the starting
  // point every card further narrows with its own filter.
  const list = useMemo(() => {
    const base = complaints ?? [];
    return base.filter((c) => !employeeFilter || c.assignedTo === employeeFilter);
  }, [complaints, employeeFilter]);

  // Drives the top stat row (Total + one card per status) — always
  // all-time, since date filtering now lives on the Status Breakdown card
  // specifically rather than the page as a whole.
  const statusData = useMemo(
    () =>
      COMPLAINT_STATUSES.map((status) => ({
        status,
        label: tStatus(status),
        count: list.filter((c) => c.status === status).length,
      })),
    [list, tStatus]
  );

  const statusBreakdownList = useMemo(() => {
    const cutoff = cutoffFor(statusBreakdownDateFilter);
    return cutoff ? list.filter((c) => new Date(c.createdAt) >= cutoff) : list;
  }, [list, statusBreakdownDateFilter]);
  const statusPieData = useMemo(
    () =>
      COMPLAINT_STATUSES.map((status) => ({
        status,
        label: tStatus(status),
        count: statusBreakdownList.filter((c) => c.status === status).length,
      }))
        // Only plot statuses that actually occur — an empty 0-count slice
        // has no visual width but still confuses the legend/tooltip.
        .filter((row) => row.count > 0),
    [statusBreakdownList, tStatus]
  );
  // A fresh inline function here would give <Pie label> a new reference on
  // every render, which is one of the suspected triggers of a Recharts
  // Pie-animation freeze in this layout (an unstable prop combined with
  // ResponsiveContainer's ResizeObserver can spiral into a render loop).
  const statusPieLabel = useCallback(
    ({ name, percent }: { name?: string; percent?: number }) => `${name} ${Math.round((percent ?? 0) * 100)}%`,
    []
  );

  const categoryData = useMemo(() => {
    const scoped = categoryStatusFilter ? list.filter((c) => c.status === categoryStatusFilter) : list;
    const counts = new Map<string, number>();
    scoped.forEach((c) => {
      const type = typesById.get(c.complaintTypeId);
      const label = type ? localizedName(type, locale) : undefined;
      if (!label) return;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));
  }, [list, categoryStatusFilter, typesById, locale]);

  const sourceData = useMemo(() => {
    const scoped = sourceStatusFilter ? list.filter((c) => c.status === sourceStatusFilter) : list;
    const counts = new Map<string, number>();
    scoped.forEach((c) => {
      const source = sourcesById.get(c.complaintSourceId);
      const label = source ? localizedName(source, locale) : undefined;
      if (!label) return;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));
  }, [list, sourceStatusFilter, sourcesById, locale]);

  const trendData = useMemo(() => {
    const scoped = trendStatusFilter ? list.filter((c) => c.status === trendStatusFilter) : list;
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
    scoped.forEach((c) => {
      const bucket = byDay.get(c.createdAt.slice(0, 10));
      if (bucket) bucket.count += 1;
    });
    return days;
  }, [list, trendStatusFilter, format]);

  const topAssignees = useMemo(() => {
    const scoped = topAssigneesStatusFilter ? list.filter((c) => c.status === topAssigneesStatusFilter) : list;
    const counts = new Map<string, number>();
    scoped.forEach((c) => {
      if (!c.assignedTo) return;
      counts.set(c.assignedTo, (counts.get(c.assignedTo) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([uid, count]) => ({ name: localizedName(staffById.get(uid), locale) || uid, count }));
  }, [list, topAssigneesStatusFilter, staffById, locale]);

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
          {canViewAll && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
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
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Reveal>
              <StatCard
                icon={<IconClipboardList />}
                label={t("totalTickets")}
                value={list.length}
                color="#385bc1"
                href="/dashboard"
              />
            </Reveal>
            {statusData.map((row, i) => (
              <Reveal key={row.status} delay={(i + 1) * 60}>
                <StatCard
                  icon={STATUS_ICONS[row.status]}
                  label={row.label}
                  value={row.count}
                  color={STATUS_COLORS[row.status]}
                  href={`/dashboard?status=${row.status}`}
                />
              </Reveal>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Reveal>
              <ChartCard
                title={t("statusBreakdown")}
                large
                filter={
                  <Select
                    value={statusBreakdownDateFilter}
                    onChange={(e) => setStatusBreakdownDateFilter(e.target.value as DateFilter)}
                    className={compactSelectClass}
                    aria-label={t("dateFilter")}
                  >
                    <option value="all">{t("dateFilterAll")}</option>
                    <option value="today">{t("dateFilterToday")}</option>
                    <option value="7d">{t("dateFilterLast7")}</option>
                    <option value="30d">{t("dateFilterLast30")}</option>
                    <option value="month">{t("dateFilterThisMonth")}</option>
                  </Select>
                }
              >
                {statusPieData.length === 0 ? (
                  <EmptyChart text={t("noData")} />
                ) : (
                  // debounce throttles ResponsiveContainer's ResizeObserver
                  // callback — without it, a resize triggered mid-animation
                  // (e.g. by the arc's own growing bounding box) can
                  // retrigger another render before the browser settles,
                  // spiraling into a hang. This was reproducible before
                  // adding debounce.
                  <ResponsiveContainer width="100%" height="100%" debounce={200}>
                    <PieChart>
                      <Pie
                        data={statusPieData}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        // Tried a debounced ResponsiveContainer and a
                        // stable label callback (below) to fix this
                        // properly, but the pie's animation still gets
                        // permanently stuck mid-arc instead of completing
                        // — worse than no animation. Disabling it is the
                        // only reliable option found so far.
                        isAnimationActive={false}
                        label={statusPieLabel}
                        labelLine={false}
                      >
                        {statusPieData.map((row) => (
                          <Cell key={row.status} fill={STATUS_COLORS[row.status]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_CONTENT_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        itemStyle={TOOLTIP_ITEM_STYLE}
                      />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
              </Reveal>
            </div>

            <div className="space-y-4">
              <Reveal delay={80}>
              <ChartCard
                title={t("categoryBreakdown")}
                filter={
                  <Select
                    value={categoryStatusFilter}
                    onChange={(e) => setCategoryStatusFilter(e.target.value as ComplaintStatus | "")}
                    className={compactSelectClass}
                    aria-label={tCommon("filter")}
                  >
                    <option value="">{tCommon("all")}</option>
                    {COMPLAINT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {tStatus(status)}
                      </option>
                    ))}
                  </Select>
                }
              >
                {categoryData.length === 0 ? (
                  <EmptyChart text={t("noData")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                      <YAxis type="category" dataKey="label" width={90} stroke="var(--foreground)" opacity={0.7} fontSize={11} />
                      <Tooltip
                        contentStyle={TOOLTIP_CONTENT_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        itemStyle={TOOLTIP_ITEM_STYLE}
                        cursor={BAR_CURSOR}
                      />
                      <Bar dataKey="count" fill="#385bc1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
              </Reveal>

              <Reveal delay={160}>
              <ChartCard
                title={t("sourceBreakdown")}
                filter={
                  <Select
                    value={sourceStatusFilter}
                    onChange={(e) => setSourceStatusFilter(e.target.value as ComplaintStatus | "")}
                    className={compactSelectClass}
                    aria-label={tCommon("filter")}
                  >
                    <option value="">{tCommon("all")}</option>
                    {COMPLAINT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {tStatus(status)}
                      </option>
                    ))}
                  </Select>
                }
              >
                {sourceData.length === 0 ? (
                  <EmptyChart text={t("noData")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sourceData} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                      <YAxis type="category" dataKey="label" width={90} stroke="var(--foreground)" opacity={0.7} fontSize={11} />
                      <Tooltip
                        contentStyle={TOOLTIP_CONTENT_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        itemStyle={TOOLTIP_ITEM_STYLE}
                        cursor={BAR_CURSOR}
                      />
                      <Bar dataKey="count" fill="#2d4a9e" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
              </Reveal>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Reveal>
            <ChartCard
              title={t("trend")}
              filter={
                <Select
                  value={trendStatusFilter}
                  onChange={(e) => setTrendStatusFilter(e.target.value as ComplaintStatus | "")}
                  className={compactSelectClass}
                  aria-label={tCommon("filter")}
                >
                  <option value="">{tCommon("all")}</option>
                  {COMPLAINT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {tStatus(status)}
                    </option>
                  ))}
                </Select>
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--foreground)" opacity={0.5} fontSize={11} />
                  <YAxis allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                  <Tooltip
                    contentStyle={TOOLTIP_CONTENT_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    cursor={{ stroke: "var(--border)" }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#385bc1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            </Reveal>

            {canViewAll && (
              <Reveal delay={80}>
              <ChartCard
                title={t("topAssignees")}
                filter={
                  <Select
                    value={topAssigneesStatusFilter}
                    onChange={(e) => setTopAssigneesStatusFilter(e.target.value as ComplaintStatus | "")}
                    className={compactSelectClass}
                    aria-label={tCommon("filter")}
                  >
                    <option value="">{tCommon("all")}</option>
                    {COMPLAINT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {tStatus(status)}
                      </option>
                    ))}
                  </Select>
                }
              >
                {topAssignees.length === 0 ? (
                  <EmptyChart text={t("noData")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topAssignees} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                      <YAxis type="category" dataKey="name" width={110} stroke="var(--foreground)" opacity={0.7} fontSize={12} />
                      <Tooltip
                        contentStyle={TOOLTIP_CONTENT_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        itemStyle={TOOLTIP_ITEM_STYLE}
                        cursor={BAR_CURSOR}
                      />
                      <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
              </Reveal>
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
