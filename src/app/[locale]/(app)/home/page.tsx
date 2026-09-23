"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Dot,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { subscribeToComplaints } from "@/lib/complaints";
import { subscribeToTickets } from "@/lib/tickets";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToComplaintTypes } from "@/lib/complaintTypes";
import { subscribeToComplaintSources } from "@/lib/complaintSources";
import { subscribeToTicketTypes } from "@/lib/ticketTypes";
import { subscribeToCompanies } from "@/lib/companies";
import { subscribeToAdministrations } from "@/lib/administrations";
import { subscribeToDepartments } from "@/lib/departments";
import { useAuth } from "@/lib/auth-context";
import DateRangeFilter from "@/components/DateRangeFilter";
import IdleDustWiper from "@/components/IdleDustWiper";
import {
  COMPLAINT_STATUSES,
  TICKET_STATUSES,
  hasPermission,
  localizedName,
  type Administration,
  type Company,
  type Complaint,
  type ComplaintSource,
  type ComplaintStatus,
  type ComplaintType,
  type Department,
  type StaffUser,
  type Ticket,
  type TicketType,
} from "@/lib/types";
import { computeManagerScope, scopeStaff } from "@/lib/orgScope";
import SearchableSelect from "@/components/SearchableSelect";
import DatePicker from "@/components/DatePicker";
import {
  IconClipboardList,
  IconInbox,
  IconRefreshCw,
  IconShieldCheck,
  IconTicket,
  IconUsers,
  IconXCircle,
} from "@/components/icons";

// Each status gets its own distinct, intuitive hue — blue for "open",
// violet for "assigned to someone", amber for "in progress", red for
// "cancelled", green for "done". An earlier version kept Open/Assigned both
// in the blue family for a "cohesive" look, but that made them (and the
// Total stat card) read as the same color at a glance in the small stat-card
// icons — distinctness matters more there than a shared palette.
const STATUS_COLORS: Record<ComplaintStatus, string> = {
  Open: "#3b82f6",
  Assigned: "#7c3aed",
  Processing: "#d97706",
  Cancel: "#dc2626",
  Closed: "#16a34a",
};

// Recognized platform/channel names get their real brand color in the "By
// Source" chart instead of one flat color for every bar — matched by
// lowercase substring against whichever name is currently displayed
// (English or Arabic-typed-as-English, however the source was entered), so
// it works without needing a manual color field on each complaint source.
// Falls back to the app's default blue for anything unrecognized.
const SOURCE_BRAND_COLORS: [string, string][] = [
  ["whatsapp", "#25d366"],
  ["snapchat", "#f5c518"],
  ["snap chat", "#f5c518"],
  ["instagram", "#e1306c"],
  ["facebook", "#1877f2"],
  ["telegram", "#26a5e4"],
  ["tiktok", "#fe2c55"],
  ["twitter", "#1da1f2"],
  ["linkedin", "#0a66c2"],
  ["google", "#4285f4"],
  ["email", "#64748b"],
  ["phone", "#64748b"],
  ["call", "#64748b"],
];
const DEFAULT_SOURCE_COLOR = "#2d4a9e";

function colorForSource(label: string): string {
  const lower = label.toLowerCase();
  const match = SOURCE_BRAND_COLORS.find(([keyword]) => lower.includes(keyword));
  return match ? match[1] : DEFAULT_SOURCE_COLOR;
}

const STATUS_ICONS: Record<ComplaintStatus, React.ReactNode> = {
  Open: <IconInbox />,
  Assigned: <IconUsers />,
  Processing: <IconRefreshCw />,
  Cancel: <IconXCircle />,
  Closed: <IconShieldCheck />,
};

type DateFilter = "all" | "today" | "7d" | "30d" | "month" | "custom";

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
// A pie/donut's tooltip jumps straight to each newly-hovered slice's anchor
// point with no animation of its own (isAnimationActive only covers the
// arcs' entrance animation) — Recharts sets the wrapper's position via an
// inline transform: translate(x, y), so transitioning that one property is
// enough to turn the jump into a smooth glide between slices without
// touching Recharts' own active-slice detection, which is what caused this
// chart's tooltip to get stuck on custom `position` logic in the past.
const PIE_TOOLTIP_WRAPPER_STYLE: React.CSSProperties = { transition: "transform 150ms ease-out" };
// The default hover cursor on bar charts is a harsh solid gray rectangle —
// tone it down to a faint themed highlight instead.
const BAR_CURSOR = { fill: "var(--border)", opacity: 0.4 };
// Recharts' default pie legend renders each label in that slice's own
// (fully saturated) color at 16px — reads as garish and oversized next to
// the rest of the page's muted, small chart text. Keeping the colored dot
// but rendering the label itself in the same faint foreground tone as
// every axis/tooltip label keeps the legend from standing out.
const LEGEND_WRAPPER_STYLE: React.CSSProperties = { fontSize: 12 };
function renderLegendLabel(value: string) {
  return <span style={{ color: "var(--foreground)", opacity: 0.7 }}>{value}</span>;
}

// Recharts wraps a category-axis tick onto multiple lines once its text
// exceeds the axis width, and those wrapped lines then overflow into the
// bar rows above/below — the "By Category" chart's long labels ("Refund |
// Edit product | Assign technician | ...") were overlapping the bars next
// to them. Truncating to a single line (full text still available via the
// native <title> tooltip on hover) keeps every row self-contained.
function makeCategoryTick(fontSize: number, maxChars: number) {
  return function CategoryTick({ x, y, payload }: { x?: string | number; y?: string | number; payload?: { value?: unknown } }) {
    const value = String(payload?.value ?? "");
    const truncated = value.length > maxChars ? `${value.slice(0, maxChars - 1)}…` : value;
    return (
      <g transform={`translate(${x},${y})`}>
        <title>{value}</title>
        <text x={0} y={0} dy={4} textAnchor="end" fontSize={fontSize} fill="var(--foreground)" fillOpacity={0.7}>
          {truncated}
        </text>
      </g>
    );
  };
}
const renderCategoryTick90 = makeCategoryTick(11, 14);
const renderCategoryTick110 = makeCategoryTick(12, 16);

// Deliberately quiet — no visible border/background until the user actually
// interacts with it, so five of these across the grid read as a small
// affordance in each card's corner rather than five loud controls fighting
// the titles for attention.
const compactSelectClass =
  "w-auto rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-foreground/50 outline-none " +
  "transition-colors hover:border-border hover:bg-surface hover:text-foreground focus:border-brand focus:bg-surface focus:text-foreground focus:ring-1 focus:ring-brand";

function ChartCard({
  title,
  filter,
  children,
}: {
  title: string;
  // Each card's own filter control, rendered top-right of its header —
  // independent of every other card's filter and of the page-level
  // employee filter.
  filter?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // flex + h-full so every card in a grid row fills the row's full
    // height (matching its tallest sibling) instead of just being as tall
    // as its own content — a card whose filter is a single control would
    // otherwise end up visibly shorter than one next to it whose filter
    // wraps onto two lines (e.g. PersonChartFilters' status + date pair).
    <div className="flex h-full flex-col rounded-xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <h2 className="pt-1 text-sm font-semibold text-foreground">{title}</h2>
        {filter}
      </div>
      {/* Recharts' SVG text inherits the page's dir="rtl" in the Arabic
          locale, which corrupts label positioning (bar/axis labels render
          overlapping the bars instead of beside them). Forcing dir="ltr"
          here keeps chart internals laid out consistently regardless of
          the app's locale — recharts has no RTL layout mode of its own. */}
      <div dir="ltr" className="mt-4 min-h-72 flex-1">
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
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // A card that's already on screen the instant the page mounts
          // (arriving via nav link rather than scrolling into view) would
          // otherwise fire this on the very first frame — too fast to read
          // as an animation at all. This beat makes it visible regardless
          // of whether the reveal was triggered by a scroll or a fresh
          // page load.
          showTimer = setTimeout(() => setVisible(true), 250);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (showTimer) clearTimeout(showTimer);
    };
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

// "custom" has no fixed cutoff of its own — the caller combines this with
// the two date inputs (see dateRangeFor) instead.
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
    case "custom":
    case "all":
    default:
      return null;
  }
}

// customFrom/customTo are "YYYY-MM-DD" strings from <input type="date">
// (empty string when unset). Only meaningful when filter === "custom" —
// every other filter still goes through cutoffFor's fixed lower bound with
// no upper bound.
function dateRangeFor(
  filter: DateFilter,
  customFrom: string,
  customTo: string
): { from: Date | null; to: Date | null } {
  if (filter === "custom") {
    const to = customTo ? new Date(customTo) : null;
    if (to) to.setHours(23, 59, 59, 999);
    return { from: customFrom ? new Date(customFrom) : null, to };
  }
  return { from: cutoffFor(filter), to: null };
}

// "YYYY-MM-DD" in the viewer's local timezone — deliberately not
// toISOString().slice(0, 10), which is UTC and can land on the wrong day for
// timestamps near local midnight.
function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Formats a bar's hover tooltip as "12 (35%)" — the percentage is of
// `total` (everything matching the chart's own current filter), not just
// the sum of the bars actually drawn, so it stays meaningful when a chart
// only plots its top N values.
function countWithPercent(value: number, total: number): string {
  if (!total) return String(value);
  return `${value} (${Math.round((value / total) * 100)}%)`;
}

// Builds a link into the Complaints list pre-filtered to match exactly what
// a clicked chart segment represents — same idea as the stat cards above,
// which already link to `/dashboard?status=X`.
function dashboardHref(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

// Turns a chart's own date filter into the from/to query params the
// Complaints list understands (see dashboard/page.tsx's paramFrom/paramTo) —
// "custom" passes the two picked dates straight through, a fixed preset
// (today/7d/30d/month) becomes its lower-bound day, and "all" contributes
// nothing.
function dateFilterToParams(filter: DateFilter, customFrom: string, customTo: string): { from?: string; to?: string } {
  if (filter === "custom") return { from: customFrom || undefined, to: customTo || undefined };
  const cutoff = cutoffFor(filter);
  return cutoff ? { from: toLocalISODate(cutoff) } : {};
}

// The Top Assignees / Top Recorders charts share this exact pair of
// filters — a status dropdown (all-statuses-or-one, same options every other
// per-card status filter already uses) stacked above a date-range dropdown
// (same preset set + custom-range popover as the Status Breakdown card's own
// date filter) — so the two charts don't each duplicate this JSX.
function PersonChartFilters({
  statusFilter,
  onStatusChange,
  statusOptions,
  dateFilter,
  onDateFilterChange,
  dateOptions,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  idPrefix,
  tCommon,
  t,
}: {
  statusFilter: ComplaintStatus | "";
  onStatusChange: (value: ComplaintStatus | "") => void;
  statusOptions: { id: string; label: string }[];
  dateFilter: DateFilter;
  onDateFilterChange: (value: DateFilter) => void;
  dateOptions: { id: string; label: string }[];
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  idPrefix: string;
  tCommon: (key: string) => string;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="w-[110px]">
        <SearchableSelect
          items={statusOptions}
          value={statusFilter}
          onChange={(id) => onStatusChange(id as ComplaintStatus | "")}
          getId={(option) => option.id}
          getLabel={(option) => option.label}
          allowClear={false}
          className={compactSelectClass}
          ariaLabel={tCommon("filter")}
        />
      </div>
      <div className="relative flex flex-col items-end">
        <div className="w-[110px]">
          <SearchableSelect
            items={dateOptions}
            value={dateFilter}
            onChange={(id) => onDateFilterChange(id as DateFilter)}
            getId={(option) => option.id}
            getLabel={(option) => option.label}
            allowClear={false}
            className={compactSelectClass}
            ariaLabel={t("dateFilter")}
          />
        </div>
        {dateFilter === "custom" && (
          <div className="absolute end-0 top-full z-10 mt-1 flex items-end gap-2 rounded-lg border border-border bg-surface p-3 shadow-lg">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${idPrefix}From`}
                className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40"
              >
                {t("dateFrom")}
              </label>
              <div className="w-[136px]">
                <DatePicker
                  id={`${idPrefix}From`}
                  value={dateFrom}
                  onChange={onDateFromChange}
                  ariaLabel={t("dateFrom")}
                  placeholder={t("dateFrom")}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-start text-xs text-foreground outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
            <span className="pb-2 text-foreground/30">→</span>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${idPrefix}To`}
                className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40"
              >
                {t("dateTo")}
              </label>
              <div className="w-[136px]">
                <DatePicker
                  id={`${idPrefix}To`}
                  value={dateTo}
                  onChange={onDateToChange}
                  ariaLabel={t("dateTo")}
                  placeholder={t("dateTo")}
                  align="end"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-start text-xs text-foreground outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Same idea as dashboardHref, but into the Tickets queue.
function ticketsHref(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `/tickets?${qs}` : "/tickets";
}

export default function HomePage() {
  const t = useTranslations("home");
  const tStatus = useTranslations("status");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const { user, profile } = useAuth();
  const router = useRouter();

  const canView = hasPermission(profile, "complaints", "view");
  const canViewAll = hasPermission(profile, "complaints", "viewAll");
  const canViewAllTickets = hasPermission(profile, "tickets", "viewAll");

  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [complaintTypes, setComplaintTypes] = useState<ComplaintType[]>([]);
  const [complaintSources, setComplaintSources] = useState<ComplaintSource[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  // "Who" stays a page-level filter (applies to every card and the top stat
  // row) — everything else is filtered per-card instead, by whichever
  // dimension makes sense for that specific chart. Status is already the
  // Status Breakdown chart's own axis, so it gets a date-range filter like
  // the page-level one used to be; the other charts get a status filter.
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [complaintsDatePreset, setComplaintsDatePreset] = useState<DateFilter>("all");
  const [complaintsDateFrom, setComplaintsDateFrom] = useState("");
  const [complaintsDateTo, setComplaintsDateTo] = useState("");
  const [statusBreakdownDateFilter, setStatusBreakdownDateFilter] = useState<DateFilter>("all");
  const [statusBreakdownFrom, setStatusBreakdownFrom] = useState("");
  const [statusBreakdownTo, setStatusBreakdownTo] = useState("");
  const [categoryStatusFilter, setCategoryStatusFilter] = useState<ComplaintStatus | "">("");
  const [sourceStatusFilter, setSourceStatusFilter] = useState<ComplaintStatus | "">("");
  const [trendStatusFilter, setTrendStatusFilter] = useState<ComplaintStatus | "">("");
  const [topAssigneesStatusFilter, setTopAssigneesStatusFilter] = useState<ComplaintStatus | "">("");
  const [topAssigneesDateFilter, setTopAssigneesDateFilter] = useState<DateFilter>("all");
  const [topAssigneesDateFrom, setTopAssigneesDateFrom] = useState("");
  const [topAssigneesDateTo, setTopAssigneesDateTo] = useState("");
  const [topRecordersStatusFilter, setTopRecordersStatusFilter] = useState<ComplaintStatus | "">("");
  const [topRecordersDateFilter, setTopRecordersDateFilter] = useState<DateFilter>("all");
  const [topRecordersDateFrom, setTopRecordersDateFrom] = useState("");
  const [topRecordersDateTo, setTopRecordersDateTo] = useState("");

  useEffect(() => {
    if (!profile || !canView) return;
    return subscribeToComplaints(setComplaints, undefined, canViewAll ? undefined : profile.id);
  }, [profile, canView, canViewAll]);
  useEffect(() => {
    if (!canViewAllTickets) return;
    return subscribeToTickets(setTickets);
  }, [canViewAllTickets]);
  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToComplaintTypes(setComplaintTypes), []);
  useEffect(() => subscribeToComplaintSources(setComplaintSources), []);
  useEffect(() => subscribeToTicketTypes(setTicketTypes), []);
  useEffect(() => subscribeToCompanies(setCompanies), []);
  useEffect(() => subscribeToAdministrations(setAdministrations), []);
  useEffect(() => subscribeToDepartments(setDepartments), []);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const typesById = useMemo(() => new Map(complaintTypes.map((ct) => [ct.id, ct])), [complaintTypes]);
  const sourcesById = useMemo(() => new Map(complaintSources.map((cs) => [cs.id, cs])), [complaintSources]);

  // A General Manager (the designated manager of a company/administration/
  // department) only sees stats for their own branch of the org tree — same
  // scoping as the Administrations/Departments/Employees list pages.
  const managerScope = useMemo(
    () => computeManagerScope(user?.uid, companies, administrations, departments, canViewAll),
    [user?.uid, companies, administrations, departments, canViewAll]
  );
  const scopedStaff = useMemo(() => scopeStaff(staff, managerScope), [staff, managerScope]);
  const scopedStaffIds = useMemo(() => new Set(scopedStaff.map((s) => s.id)), [scopedStaff]);
  const employeeFilterOptions = useMemo(
    () => [
      { id: "", label: t("employeeFilterAll") },
      ...scopedStaff.map((member) => ({ id: member.id, label: localizedName(member, locale) })),
    ],
    [scopedStaff, locale, t]
  );
  // Shared by every per-card status filter (Category/Source/Trend/Top
  // Assignees) — they all offer the same "All statuses" + one-per-status set.
  const statusFilterOptions = useMemo(
    () => [
      { id: "", label: tCommon("all") },
      ...COMPLAINT_STATUSES.map((status) => ({ id: status, label: tStatus(status) })),
    ],
    [tCommon, tStatus]
  );
  const dateFilterOptions = useMemo(
    () => [
      { id: "all", label: t("dateFilterAll") },
      { id: "today", label: t("dateFilterToday") },
      { id: "7d", label: t("dateFilterLast7") },
      { id: "30d", label: t("dateFilterLast30") },
      { id: "month", label: t("dateFilterThisMonth") },
      { id: "custom", label: t("dateFilterCustom") },
    ],
    [t]
  );
  // Top Assignees/Recorders sit next to a date filter that also starts with
  // "All" ("All time") — spelling this one out as "All Statuses" instead of
  // the shorter "All" the other per-card status filters use keeps the two
  // dropdowns from reading as duplicates of each other.
  const personStatusFilterOptions = useMemo(
    () => [
      { id: "", label: t("statusFilterAll") },
      ...COMPLAINT_STATUSES.map((status) => ({ id: status, label: tStatus(status) })),
    ],
    [t, tStatus]
  );

  // Scoped by "who" (the employee filter) and, for a General Manager, by
  // their org branch — the top stat row's basis, and the starting point
  // every card further narrows with its own filter.
  const list = useMemo(() => {
    const base = complaints ?? [];
    const { from, to } = dateRangeFor(complaintsDatePreset, complaintsDateFrom, complaintsDateTo);
    return base.filter((c) => {
      if (managerScope && (!c.assignedTo || !scopedStaffIds.has(c.assignedTo))) return false;
      if (employeeFilter && c.assignedTo !== employeeFilter) return false;
      if (from || to) {
        const created = new Date(c.createdAt);
        if (from && created < from) return false;
        if (to && created > to) return false;
      }
      return true;
    });
  }, [complaints, employeeFilter, managerScope, scopedStaffIds, complaintsDatePreset, complaintsDateFrom, complaintsDateTo]);

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
    const { from, to } = dateRangeFor(statusBreakdownDateFilter, statusBreakdownFrom, statusBreakdownTo);
    if (!from && !to) return list;
    return list.filter((c) => {
      const created = new Date(c.createdAt);
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    });
  }, [list, statusBreakdownDateFilter, statusBreakdownFrom, statusBreakdownTo]);
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
  // The chart only plots the top 8 types/sources, but the percentage shown
  // on hover is still out of every complaint matching the chart's own
  // status filter — not just the sum of the bars actually drawn — so it
  // stays meaningful even when there are more than 8 distinct values.
  const categoryTotal = useMemo(
    () => (categoryStatusFilter ? list.filter((c) => c.status === categoryStatusFilter) : list).length,
    [list, categoryStatusFilter]
  );
  const categoryData = useMemo(() => {
    const scoped = categoryStatusFilter ? list.filter((c) => c.status === categoryStatusFilter) : list;
    const counts = new Map<string, number>();
    scoped.forEach((c) => {
      if (!typesById.has(c.complaintTypeId)) return;
      counts.set(c.complaintTypeId, (counts.get(c.complaintTypeId) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => ({ id, label: localizedName(typesById.get(id), locale) || id, count }));
  }, [list, categoryStatusFilter, typesById, locale]);

  const sourceTotal = useMemo(
    () => (sourceStatusFilter ? list.filter((c) => c.status === sourceStatusFilter) : list).length,
    [list, sourceStatusFilter]
  );
  const sourceData = useMemo(() => {
    const scoped = sourceStatusFilter ? list.filter((c) => c.status === sourceStatusFilter) : list;
    const counts = new Map<string, number>();
    scoped.forEach((c) => {
      if (!sourcesById.has(c.complaintSourceId)) return;
      counts.set(c.complaintSourceId, (counts.get(c.complaintSourceId) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => {
        const label = localizedName(sourcesById.get(id), locale) || id;
        return { id, label, count, color: colorForSource(label) };
      });
  }, [list, sourceStatusFilter, sourcesById, locale]);

  const trendData = useMemo(() => {
    const scoped = trendStatusFilter ? list.filter((c) => c.status === trendStatusFilter) : list;
    const days: { date: string; label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({
        // Local calendar day, not toISOString's UTC day — otherwise a
        // complaint created late at night can bucket (and later, via the
        // dashboard link, filter) under the wrong day for anyone west of
        // UTC, or the right day only by accident for anyone east of it.
        date: toLocalISODate(d),
        label: format.dateTime(d, { month: "short", day: "numeric" }),
        count: 0,
      });
    }
    const byDay = new Map(days.map((d) => [d.date, d]));
    scoped.forEach((c) => {
      const bucket = byDay.get(toLocalISODate(new Date(c.createdAt)));
      if (bucket) bucket.count += 1;
    });
    return days;
  }, [list, trendStatusFilter, format]);

  const topAssigneesList = useMemo(() => {
    const { from, to } = dateRangeFor(topAssigneesDateFilter, topAssigneesDateFrom, topAssigneesDateTo);
    return list.filter((c) => {
      if (topAssigneesStatusFilter && c.status !== topAssigneesStatusFilter) return false;
      if (from || to) {
        const created = new Date(c.createdAt);
        if (from && created < from) return false;
        if (to && created > to) return false;
      }
      return true;
    });
  }, [list, topAssigneesStatusFilter, topAssigneesDateFilter, topAssigneesDateFrom, topAssigneesDateTo]);
  const topAssignees = useMemo(() => {
    const counts = new Map<string, number>();
    topAssigneesList.forEach((c) => {
      if (!c.assignedTo) return;
      counts.set(c.assignedTo, (counts.get(c.assignedTo) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([uid, count]) => ({ id: uid, name: localizedName(staffById.get(uid), locale) || uid, count }));
  }, [topAssigneesList, staffById, locale]);

  // Who logged the complaint (createdBy) rather than who's handling it
  // (assignedTo) — e.g. call-center staff who record complaints on a
  // customer's behalf but don't necessarily end up assigned to them.
  const topRecordersList = useMemo(() => {
    const { from, to } = dateRangeFor(topRecordersDateFilter, topRecordersDateFrom, topRecordersDateTo);
    return list.filter((c) => {
      if (topRecordersStatusFilter && c.status !== topRecordersStatusFilter) return false;
      if (from || to) {
        const created = new Date(c.createdAt);
        if (from && created < from) return false;
        if (to && created > to) return false;
      }
      return true;
    });
  }, [list, topRecordersStatusFilter, topRecordersDateFilter, topRecordersDateFrom, topRecordersDateTo]);
  const topRecorders = useMemo(() => {
    const counts = new Map<string, number>();
    topRecordersList.forEach((c) => {
      if (!c.createdBy) return;
      counts.set(c.createdBy, (counts.get(c.createdBy) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([uid, count]) => ({ id: uid, name: localizedName(staffById.get(uid), locale) || uid, count }));
  }, [topRecordersList, staffById, locale]);

  // Tickets get a smaller, unfiltered mirror of the Complaints analytics
  // above — same status palette/icons, same chart types — rather than a
  // full duplicate of every per-card filter, to keep this page from
  // doubling in size. Only rendered for whoever can see the full ticket
  // queue (tickets.viewAll); everyone else already gets "My Tickets" from
  // the sidebar instead.
  const ticketTypesById = useMemo(() => new Map(ticketTypes.map((tt) => [tt.id, tt])), [ticketTypes]);
  const ticketList = useMemo(() => tickets ?? [], [tickets]);

  const ticketStatusData = useMemo(
    () =>
      TICKET_STATUSES.map((status) => ({
        status,
        label: tStatus(status),
        count: ticketList.filter((tk) => tk.status === status).length,
      })),
    [ticketList, tStatus]
  );
  const ticketStatusPieData = useMemo(() => ticketStatusData.filter((row) => row.count > 0), [ticketStatusData]);

  const ticketTypeData = useMemo(() => {
    const counts = new Map<string, number>();
    ticketList.forEach((tk) => {
      if (!ticketTypesById.has(tk.ticketTypeId)) return;
      counts.set(tk.ticketTypeId, (counts.get(tk.ticketTypeId) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => ({ id, label: localizedName(ticketTypesById.get(id), locale) || id, count }));
  }, [ticketList, ticketTypesById, locale]);

  const ticketTopAssignees = useMemo(() => {
    const counts = new Map<string, number>();
    ticketList.forEach((tk) => {
      if (!tk.assignedTo) return;
      counts.set(tk.assignedTo, (counts.get(tk.assignedTo) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([uid, count]) => ({ id: uid, name: localizedName(staffById.get(uid), locale) || uid, count }));
  }, [ticketList, staffById, locale]);

  const name = profile ? localizedName(profile, locale) || profile.username : "";

  return (
    <div>
      <IdleDustWiper />
      <h1 className="text-xl font-bold text-foreground">{t("welcome", { name })}</h1>

      {!canView && !canViewAllTickets ? (
        <p className="mt-6 rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-foreground/50">
          {t("noData")}
        </p>
      ) : (
        <>
          {canView && (complaints === null ? (
            <p className="mt-6 text-sm text-foreground/50">{tCommon("loading")}</p>
          ) : (
            <>
          <div className="mt-8 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <IconClipboardList />
            </span>
            <h2 className="text-lg font-bold text-foreground">{t("complaintsSectionTitle")}</h2>
          </div>

          {canViewAll && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="w-[220px]">
                <SearchableSelect
                  items={employeeFilterOptions}
                  value={employeeFilter}
                  onChange={setEmployeeFilter}
                  getId={(option) => option.id}
                  getLabel={(option) => option.label}
                  allowClear={false}
                  ariaLabel={t("employeeFilter")}
                />
              </div>
              <DateRangeFilter
                preset={complaintsDatePreset}
                onPresetChange={setComplaintsDatePreset}
                from={complaintsDateFrom}
                to={complaintsDateTo}
                onFromChange={setComplaintsDateFrom}
                onToChange={setComplaintsDateTo}
              />
            </div>
          )}

          <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-foreground/40">{t("overview")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Reveal>
              <StatCard
                icon={<IconClipboardList />}
                label={t("totalComplaints")}
                value={list.length}
                color="#475569"
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

          <h2 className="mt-10 text-xs font-semibold uppercase tracking-wide text-foreground/40">{t("analytics")}</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Reveal>
              <ChartCard
                title={t("statusBreakdown")}
                filter={
                  <div className="relative flex flex-col items-end">
                    <div className="w-[150px]">
                      <SearchableSelect
                        items={dateFilterOptions}
                        value={statusBreakdownDateFilter}
                        onChange={(id) => setStatusBreakdownDateFilter(id as DateFilter)}
                        getId={(option) => option.id}
                        getLabel={(option) => option.label}
                        allowClear={false}
                        className={compactSelectClass}
                        ariaLabel={t("dateFilter")}
                      />
                    </div>
                    {statusBreakdownDateFilter === "custom" && (
                      <div className="absolute end-0 top-full z-10 mt-1 flex items-end gap-2 rounded-lg border border-border bg-surface p-3 shadow-lg">
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="statusBreakdownFrom"
                            className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40"
                          >
                            {t("dateFrom")}
                          </label>
                          <div className="w-[136px]">
                            <DatePicker
                              id="statusBreakdownFrom"
                              value={statusBreakdownFrom}
                              onChange={setStatusBreakdownFrom}
                              ariaLabel={t("dateFrom")}
                              placeholder={t("dateFrom")}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-start text-xs text-foreground outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            />
                          </div>
                        </div>
                        <span className="pb-2 text-foreground/30">→</span>
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="statusBreakdownTo"
                            className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40"
                          >
                            {t("dateTo")}
                          </label>
                          <div className="w-[136px]">
                            <DatePicker
                              id="statusBreakdownTo"
                              value={statusBreakdownTo}
                              onChange={setStatusBreakdownTo}
                              ariaLabel={t("dateTo")}
                              placeholder={t("dateTo")}
                              align="end"
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-start text-xs text-foreground outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                }
              >
                {statusPieData.length === 0 ? (
                  <EmptyChart text={t("noData")} />
                ) : (
                  <div className="relative h-full">
                    {/* debounce throttles ResponsiveContainer's ResizeObserver
                        callback — without it, a resize triggered mid-animation
                        (e.g. by the arc's own growing bounding box) can
                        retrigger another render before the browser settles,
                        spiraling into a hang. This was reproducible before
                        adding debounce. */}
                    <ResponsiveContainer width="100%" height="100%" debounce={200}>
                      <PieChart>
                        <Pie
                          data={statusPieData}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          // Tried a debounced ResponsiveContainer and a
                          // stable label callback (below) to fix this
                          // properly, but the pie's animation still gets
                          // permanently stuck mid-arc instead of completing
                          // — worse than no animation. Disabling it is the
                          // only reliable option found so far.
                          isAnimationActive={false}
                          // No outer percentage labels — in this card's
                          // (now-narrower, uniform-grid) width they clipped
                          // against the edge. The legend below plus the
                          // hover tooltip already cover the same info more
                          // cleanly.
                        >
                          {statusPieData.map((row) => (
                            <Cell
                              key={row.status}
                              fill={STATUS_COLORS[row.status]}
                              stroke="none"
                              cursor="pointer"
                              onClick={() => router.push(dashboardHref({ status: row.status }))}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          isAnimationActive={false}
                          wrapperStyle={PIE_TOOLTIP_WRAPPER_STYLE}
                          contentStyle={TOOLTIP_CONTENT_STYLE}
                          labelStyle={TOOLTIP_LABEL_STYLE}
                          itemStyle={TOOLTIP_ITEM_STYLE}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          wrapperStyle={LEGEND_WRAPPER_STYLE}
                          formatter={renderLegendLabel}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Centered in the donut's hole — the ring alone left
                        that space empty; a total count gives it a purpose
                        instead of just being a hole. Shifted up 18px to sit
                        above the legend row rendered below the chart. */}
                    <div className="pointer-events-none absolute inset-0 flex -translate-y-[18px] flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-foreground">{statusBreakdownList.length}</span>
                      <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/40">
                        {t("totalShort")}
                      </span>
                    </div>
                  </div>
                )}
              </ChartCard>
            </Reveal>

            <Reveal delay={60}>
              <ChartCard
                title={t("categoryBreakdown")}
                filter={
                  <div className="w-[130px]">
                    <SearchableSelect
                      items={statusFilterOptions}
                      value={categoryStatusFilter}
                      onChange={(id) => setCategoryStatusFilter(id as ComplaintStatus | "")}
                      getId={(option) => option.id}
                      getLabel={(option) => option.label}
                      allowClear={false}
                      className={compactSelectClass}
                      ariaLabel={tCommon("filter")}
                    />
                  </div>
                }
              >
                {categoryData.length === 0 ? (
                  <EmptyChart text={t("noData")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={90}
                        stroke="var(--foreground)"
                        opacity={0.7}
                        fontSize={11}
                        tick={renderCategoryTick90}
                      />
                      <Tooltip
                        animationDuration={100}
                        animationEasing="ease-out"
                        contentStyle={TOOLTIP_CONTENT_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        itemStyle={TOOLTIP_ITEM_STYLE}
                        cursor={BAR_CURSOR}
                        formatter={(value) => [countWithPercent(Number(value), categoryTotal), t("tooltipCount")]}
                      />
                      <Bar
                        dataKey="count"
                        fill="#385bc1"
                        radius={[0, 4, 4, 0]}
                        barSize={28}
                        cursor="pointer"
                        onClick={(data: { payload?: { id: string } }) => {
                          if (!data.payload) return;
                          router.push(dashboardHref({ type: data.payload.id, status: categoryStatusFilter || undefined }));
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </Reveal>

            <Reveal delay={120}>
              <ChartCard
                title={t("sourceBreakdown")}
                filter={
                  <div className="w-[130px]">
                    <SearchableSelect
                      items={statusFilterOptions}
                      value={sourceStatusFilter}
                      onChange={(id) => setSourceStatusFilter(id as ComplaintStatus | "")}
                      getId={(option) => option.id}
                      getLabel={(option) => option.label}
                      allowClear={false}
                      className={compactSelectClass}
                      ariaLabel={tCommon("filter")}
                    />
                  </div>
                }
              >
                {sourceData.length === 0 ? (
                  <EmptyChart text={t("noData")} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sourceData} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={90}
                        stroke="var(--foreground)"
                        opacity={0.7}
                        fontSize={11}
                        tick={renderCategoryTick90}
                      />
                      <Tooltip
                        animationDuration={100}
                        animationEasing="ease-out"
                        contentStyle={TOOLTIP_CONTENT_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        itemStyle={TOOLTIP_ITEM_STYLE}
                        cursor={BAR_CURSOR}
                        formatter={(value) => [countWithPercent(Number(value), sourceTotal), t("tooltipCount")]}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={28}>
                        {sourceData.map((row) => (
                          <Cell
                            key={row.id}
                            fill={row.color}
                            cursor="pointer"
                            onClick={() =>
                              router.push(dashboardHref({ source: row.id, status: sourceStatusFilter || undefined }))
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </Reveal>

            <Reveal delay={180}>
              <ChartCard
                title={t("trend")}
                filter={
                  <div className="w-[130px]">
                    <SearchableSelect
                      items={statusFilterOptions}
                      value={trendStatusFilter}
                      onChange={(id) => setTrendStatusFilter(id as ComplaintStatus | "")}
                      getId={(option) => option.id}
                      getLabel={(option) => option.label}
                      allowClear={false}
                      className={compactSelectClass}
                      ariaLabel={tCommon("filter")}
                    />
                  </div>
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ left: -16, right: 8 }}>
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#385bc1" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#385bc1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" stroke="var(--foreground)" opacity={0.5} fontSize={11} />
                    <YAxis
                      allowDecimals={false}
                      stroke="var(--foreground)"
                      opacity={0.5}
                      fontSize={12}
                      // Recharts' auto domain can round up to exactly match
                      // the peak value, which then sits flush against the
                      // top edge of the chart with no breathing room. Padding
                      // the domain a bit above the max keeps the peak dot
                      // clear of the top border.
                      domain={[0, (max: number) => Math.max(max + 1, Math.ceil(max * 1.15))]}
                    />
                    <Tooltip
                      animationDuration={100}
                      animationEasing="ease-out"
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      cursor={{ stroke: "var(--border)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#385bc1"
                      strokeWidth={2}
                      fill="url(#trendFill)"
                      dot={(props: { cx?: number; cy?: number; payload?: { date: string } }) => (
                        <Dot
                          key={props.payload?.date ?? `${props.cx}-${props.cy}`}
                          cx={props.cx ?? 0}
                          cy={props.cy ?? 0}
                          r={3}
                          fill="#385bc1"
                          strokeWidth={0}
                          cursor="pointer"
                          onClick={() => {
                            if (!props.payload) return;
                            router.push(
                              dashboardHref({
                                from: props.payload.date,
                                to: props.payload.date,
                                status: trendStatusFilter || undefined,
                              })
                            );
                          }}
                        />
                      )}
                      activeDot={(props: { cx?: number; cy?: number; payload?: { date: string } }) => (
                        <Dot
                          key={props.payload?.date ?? `${props.cx}-${props.cy}`}
                          cx={props.cx ?? 0}
                          cy={props.cy ?? 0}
                          r={5}
                          fill="#385bc1"
                          cursor="pointer"
                          onClick={() => {
                            if (!props.payload) return;
                            router.push(
                              dashboardHref({
                                from: props.payload.date,
                                to: props.payload.date,
                                status: trendStatusFilter || undefined,
                              })
                            );
                          }}
                        />
                      )}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </Reveal>

            {canViewAll && (
              <Reveal delay={240}>
                <ChartCard
                  title={t("topAssignees")}
                  filter={
                    <PersonChartFilters
                      statusFilter={topAssigneesStatusFilter}
                      onStatusChange={setTopAssigneesStatusFilter}
                      statusOptions={personStatusFilterOptions}
                      dateFilter={topAssigneesDateFilter}
                      onDateFilterChange={setTopAssigneesDateFilter}
                      dateOptions={dateFilterOptions}
                      dateFrom={topAssigneesDateFrom}
                      onDateFromChange={setTopAssigneesDateFrom}
                      dateTo={topAssigneesDateTo}
                      onDateToChange={setTopAssigneesDateTo}
                      idPrefix="topAssignees"
                      tCommon={tCommon}
                      t={t}
                    />
                  }
                >
                  {topAssignees.length === 0 ? (
                    <EmptyChart text={t("noData")} />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topAssignees} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={110}
                          stroke="var(--foreground)"
                          opacity={0.7}
                          fontSize={12}
                          tick={renderCategoryTick110}
                        />
                        <Tooltip
                          animationDuration={100}
                          animationEasing="ease-out"
                          contentStyle={TOOLTIP_CONTENT_STYLE}
                          labelStyle={TOOLTIP_LABEL_STYLE}
                          itemStyle={TOOLTIP_ITEM_STYLE}
                          cursor={BAR_CURSOR}
                          formatter={(value) => [countWithPercent(Number(value), topAssigneesList.length), t("tooltipCount")]}
                        />
                        <Bar
                          dataKey="count"
                          fill="#385bc1"
                          radius={[0, 4, 4, 0]}
                          barSize={28}
                          cursor="pointer"
                          onClick={(data: { payload?: { id: string } }) => {
                            if (!data.payload) return;
                            router.push(
                              dashboardHref({
                                assignedTo: data.payload.id,
                                status: topAssigneesStatusFilter || undefined,
                                ...dateFilterToParams(topAssigneesDateFilter, topAssigneesDateFrom, topAssigneesDateTo),
                              })
                            );
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </Reveal>
            )}

            {canViewAll && (
              <Reveal delay={300}>
                <ChartCard
                  title={t("topRecorders")}
                  filter={
                    <PersonChartFilters
                      statusFilter={topRecordersStatusFilter}
                      onStatusChange={setTopRecordersStatusFilter}
                      statusOptions={personStatusFilterOptions}
                      dateFilter={topRecordersDateFilter}
                      onDateFilterChange={setTopRecordersDateFilter}
                      dateOptions={dateFilterOptions}
                      dateFrom={topRecordersDateFrom}
                      onDateFromChange={setTopRecordersDateFrom}
                      dateTo={topRecordersDateTo}
                      onDateToChange={setTopRecordersDateTo}
                      idPrefix="topRecorders"
                      tCommon={tCommon}
                      t={t}
                    />
                  }
                >
                  {topRecorders.length === 0 ? (
                    <EmptyChart text={t("noData")} />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topRecorders} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={110}
                          stroke="var(--foreground)"
                          opacity={0.7}
                          fontSize={12}
                          tick={renderCategoryTick110}
                        />
                        <Tooltip
                          animationDuration={100}
                          animationEasing="ease-out"
                          contentStyle={TOOLTIP_CONTENT_STYLE}
                          labelStyle={TOOLTIP_LABEL_STYLE}
                          itemStyle={TOOLTIP_ITEM_STYLE}
                          cursor={BAR_CURSOR}
                          formatter={(value) => [countWithPercent(Number(value), topRecordersList.length), t("tooltipCount")]}
                        />
                        <Bar
                          dataKey="count"
                          fill="#385bc1"
                          radius={[0, 4, 4, 0]}
                          barSize={28}
                          cursor="pointer"
                          onClick={(data: { payload?: { id: string } }) => {
                            if (!data.payload) return;
                            router.push(
                              dashboardHref({
                                recordedBy: data.payload.id,
                                status: topRecordersStatusFilter || undefined,
                                ...dateFilterToParams(topRecordersDateFilter, topRecordersDateFrom, topRecordersDateTo),
                              })
                            );
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </Reveal>
            )}
          </div>
            </>
          ))}

          {canViewAllTickets && (
            <>
              <div className="mt-12 flex items-center gap-2.5 border-t border-border pt-8">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <IconTicket />
                </span>
                <h2 className="text-lg font-bold text-foreground">{t("ticketsSectionTitle")}</h2>
              </div>

              <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-foreground/40">
                {t("overview")}
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Reveal>
                  <StatCard
                    icon={<IconClipboardList />}
                    label={t("totalTicketsShort")}
                    value={ticketList.length}
                    color="#475569"
                    href="/tickets"
                  />
                </Reveal>
                {ticketStatusData.map((row, i) => (
                  <Reveal key={row.status} delay={(i + 1) * 60}>
                    <StatCard
                      icon={STATUS_ICONS[row.status]}
                      label={row.label}
                      value={row.count}
                      color={STATUS_COLORS[row.status]}
                      href={`/tickets?status=${row.status}`}
                    />
                  </Reveal>
                ))}
              </div>

              <h2 className="mt-10 text-xs font-semibold uppercase tracking-wide text-foreground/40">
                {t("analytics")}
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Reveal>
                  <ChartCard title={t("ticketStatusBreakdown")}>
                    {ticketStatusPieData.length === 0 ? (
                      <EmptyChart text={t("noData")} />
                    ) : (
                      <div className="relative h-full">
                        <ResponsiveContainer width="100%" height="100%" debounce={200}>
                          <PieChart>
                            <Pie
                              data={ticketStatusPieData}
                              dataKey="count"
                              nameKey="label"
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={85}
                              isAnimationActive={false}
                            >
                              {ticketStatusPieData.map((row) => (
                                <Cell
                                  key={row.status}
                                  fill={STATUS_COLORS[row.status]}
                                  stroke="none"
                                  cursor="pointer"
                                  onClick={() => router.push(ticketsHref({ status: row.status }))}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              isAnimationActive={false}
                              wrapperStyle={PIE_TOOLTIP_WRAPPER_STYLE}
                              contentStyle={TOOLTIP_CONTENT_STYLE}
                              labelStyle={TOOLTIP_LABEL_STYLE}
                              itemStyle={TOOLTIP_ITEM_STYLE}
                            />
                            <Legend
                              verticalAlign="bottom"
                              height={36}
                              wrapperStyle={LEGEND_WRAPPER_STYLE}
                              formatter={renderLegendLabel}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 flex -translate-y-[18px] flex-col items-center justify-center">
                          <span className="text-2xl font-bold text-foreground">{ticketList.length}</span>
                          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/40">
                            {t("totalShort")}
                          </span>
                        </div>
                      </div>
                    )}
                  </ChartCard>
                </Reveal>

                <Reveal delay={60}>
                  <ChartCard title={t("ticketTypeBreakdown")}>
                    {ticketTypeData.length === 0 ? (
                      <EmptyChart text={t("noData")} />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={ticketTypeData} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                          <YAxis
                        type="category"
                        dataKey="label"
                        width={90}
                        stroke="var(--foreground)"
                        opacity={0.7}
                        fontSize={11}
                        tick={renderCategoryTick90}
                      />
                          <Tooltip
                            animationDuration={100}
                            animationEasing="ease-out"
                            contentStyle={TOOLTIP_CONTENT_STYLE}
                            labelStyle={TOOLTIP_LABEL_STYLE}
                            itemStyle={TOOLTIP_ITEM_STYLE}
                            cursor={BAR_CURSOR}
                          />
                          <Bar
                            dataKey="count"
                            fill="#385bc1"
                            radius={[0, 4, 4, 0]}
                            barSize={28}
                            cursor="pointer"
                            onClick={(data: { payload?: { id: string } }) => {
                              if (!data.payload) return;
                              router.push(ticketsHref({ type: data.payload.id }));
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </Reveal>

                <Reveal delay={120}>
                  <ChartCard title={t("ticketTopAssignees")}>
                    {ticketTopAssignees.length === 0 ? (
                      <EmptyChart text={t("noData")} />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={ticketTopAssignees} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} stroke="var(--foreground)" opacity={0.5} fontSize={12} />
                          <YAxis
                          type="category"
                          dataKey="name"
                          width={110}
                          stroke="var(--foreground)"
                          opacity={0.7}
                          fontSize={12}
                          tick={renderCategoryTick110}
                        />
                          <Tooltip
                            animationDuration={100}
                            animationEasing="ease-out"
                            contentStyle={TOOLTIP_CONTENT_STYLE}
                            labelStyle={TOOLTIP_LABEL_STYLE}
                            itemStyle={TOOLTIP_ITEM_STYLE}
                            cursor={BAR_CURSOR}
                          />
                          <Bar
                            dataKey="count"
                            fill="#6366f1"
                            radius={[0, 4, 4, 0]}
                            barSize={28}
                            cursor="pointer"
                            onClick={(data: { payload?: { id: string } }) => {
                              if (!data.payload) return;
                              router.push(ticketsHref({ assignedTo: data.payload.id }));
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </Reveal>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-foreground/40">{text}</div>;
}
