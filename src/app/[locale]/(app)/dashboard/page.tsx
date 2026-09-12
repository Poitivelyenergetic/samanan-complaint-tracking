"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { subscribeToComplaints } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToComplaintSources } from "@/lib/complaintSources";
import { subscribeToComplaintTypes } from "@/lib/complaintTypes";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  localizedName,
  type Complaint,
  type ComplaintSource,
  type ComplaintStatus,
  type ComplaintType,
  type StaffUser,
} from "@/lib/types";
import { COMPLAINT_STATUSES } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import SearchableSelect from "@/components/SearchableSelect";
import { IconClipboardList, IconInbox, IconRefreshCw, IconShieldCheck } from "@/components/icons";

function StatCard({
  icon,
  color,
  label,
  value,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  // Hex color for the icon and its chip background — an alpha-blended
  // inline style rather than a light-mode Tailwind shade (bg-blue-50 etc.),
  // since those all render as near-identical pale chips against this app's
  // dark theme instead of reading as distinct colors.
  color: string;
  label: string;
  value: number;
  // Whether this card's filter is the one currently applied — highlighted
  // so a click that narrows the list below stays visibly "selected".
  active?: boolean;
  onClick?: () => void;
}) {
  const className =
    "block w-full text-start rounded-xl border bg-surface p-5 shadow-sm transition-all hover:shadow-md" +
    (onClick ? " hover:border-brand/40 hover:-translate-y-0.5" : "") +
    (active ? " border-brand" : " border-border");
  return (
    <button type="button" onClick={onClick} className={className}>
      <div className="inline-flex rounded-lg p-2" style={{ backgroundColor: `${color}1f`, color }}>
        {icon}
      </div>
      <p className="mt-4 text-sm font-medium text-foreground/60">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </button>
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
  const router = useRouter();

  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [complaintSources, setComplaintSources] = useState<ComplaintSource[]>([]);
  const [complaintTypes, setComplaintTypes] = useState<ComplaintType[]>([]);
  const [search, setSearch] = useState("");
  // Lets the home page's stat cards / chart bars — and this page's own stat
  // cards — link straight into a filtered view (e.g. /dashboard?status=Open).
  // Adjusted during render (the React-recommended way to sync state to a
  // changing external value) rather than in an effect, so it stays in sync
  // even when a link to this same page with different params doesn't remount
  // it.
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

  const paramAssignedTo = searchParams.get("assignedTo") ?? "";
  const [assigneeFilter, setAssigneeFilter] = useState(paramAssignedTo);
  const [syncedParamAssignedTo, setSyncedParamAssignedTo] = useState(paramAssignedTo);
  if (paramAssignedTo !== syncedParamAssignedTo) {
    setSyncedParamAssignedTo(paramAssignedTo);
    setAssigneeFilter(paramAssignedTo);
  }

  const paramType = searchParams.get("type") ?? "";
  const [typeFilter, setTypeFilter] = useState(paramType);
  const [syncedParamType, setSyncedParamType] = useState(paramType);
  if (paramType !== syncedParamType) {
    setSyncedParamType(paramType);
    setTypeFilter(paramType);
  }

  const paramSource = searchParams.get("source") ?? "";
  const [sourceFilter, setSourceFilter] = useState(paramSource);
  const [syncedParamSource, setSyncedParamSource] = useState(paramSource);
  if (paramSource !== syncedParamSource) {
    setSyncedParamSource(paramSource);
    setSourceFilter(paramSource);
  }

  // "YYYY-MM-DD", inclusive on both ends — lets a home page trend chart
  // point link straight to that single day's complaints. No dedicated UI
  // control for these (unlike the filters above); they're only ever set by
  // arriving via such a link, and clearing back to a normal view (e.g. the
  // Total stat card) drops them like any other param not in the URL.
  const paramFrom = searchParams.get("from") ?? "";
  const [fromFilter, setFromFilter] = useState(paramFrom);
  const [syncedParamFrom, setSyncedParamFrom] = useState(paramFrom);
  if (paramFrom !== syncedParamFrom) {
    setSyncedParamFrom(paramFrom);
    setFromFilter(paramFrom);
  }

  const paramTo = searchParams.get("to") ?? "";
  const [toFilter, setToFilter] = useState(paramTo);
  const [syncedParamTo, setSyncedParamTo] = useState(paramTo);
  if (paramTo !== syncedParamTo) {
    setSyncedParamTo(paramTo);
    setToFilter(paramTo);
  }

  useEffect(() => {
    if (!profile || !canView) return;
    return subscribeToComplaints(setComplaints, undefined, canViewAll ? undefined : profile.id);
  }, [profile, canView, canViewAll]);
  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToComplaintSources(setComplaintSources), []);
  useEffect(() => subscribeToComplaintTypes(setComplaintTypes), []);

  const staffById = useMemo(() => {
    const map = new Map<string, StaffUser>();
    staff.forEach((s) => map.set(s.id, s));
    return map;
  }, [staff]);
  const sourcesById = useMemo(() => new Map(complaintSources.map((s) => [s.id, s])), [complaintSources]);
  const typeFilterOptions = useMemo(
    () => [
      { id: "", label: `${t("typeFilter")}: ${tCommon("all")}` },
      ...complaintTypes.map((type) => ({ id: type.id, label: localizedName(type, locale) })),
    ],
    [complaintTypes, locale, t, tCommon]
  );
  const sourceFilterOptions = useMemo(
    () => [
      { id: "", label: `${t("sourceFilter")}: ${tCommon("all")}` },
      ...complaintSources.map((source) => ({ id: source.id, label: localizedName(source, locale) })),
    ],
    [complaintSources, locale, t, tCommon]
  );
  const statusFilterOptions = useMemo(
    () => [
      { id: "", label: `${t("statusFilter")}: ${tCommon("all")}` },
      ...COMPLAINT_STATUSES.map((status) => ({ id: status, label: tStatus(status) })),
    ],
    [t, tCommon, tStatus]
  );
  const assigneeFilterOptions = useMemo(
    () => [
      { id: "", label: `${t("assigneeFilter")}: ${tCommon("all")}` },
      ...staff.map((member) => ({ id: member.id, label: localizedName(member, locale) })),
    ],
    [staff, locale, t, tCommon]
  );

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
    const from = fromFilter ? new Date(`${fromFilter}T00:00:00`) : null;
    const to = toFilter ? new Date(`${toFilter}T23:59:59.999`) : null;
    return visibleComplaints.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (assigneeFilter && c.assignedTo !== assigneeFilter) return false;
      if (typeFilter && c.complaintTypeId !== typeFilter) return false;
      if (sourceFilter && c.complaintSourceId !== sourceFilter) return false;
      if (from || to) {
        const created = new Date(c.createdAt);
        if (from && created < from) return false;
        if (to && created > to) return false;
      }
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
  }, [visibleComplaints, search, statusFilter, assigneeFilter, typeFilter, sourceFilter, fromFilter, toFilter]);

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
            color="#385bc1"
            label={t("stats.total")}
            value={visibleComplaints.length}
            active={statusFilter === ""}
            onClick={() => router.push("/dashboard")}
          />
          <StatCard
            icon={<IconInbox />}
            color="#4f7fe0"
            label={t("stats.open")}
            value={statusCounts.Open}
            active={statusFilter === "Open"}
            onClick={() => router.push(statusFilter === "Open" ? "/dashboard" : "/dashboard?status=Open")}
          />
          <StatCard
            icon={<IconRefreshCw />}
            color="#d97706"
            label={t("stats.processing")}
            value={statusCounts.Processing}
            active={statusFilter === "Processing"}
            onClick={() => router.push(statusFilter === "Processing" ? "/dashboard" : "/dashboard?status=Processing")}
          />
          <StatCard
            icon={<IconShieldCheck />}
            color="#16a34a"
            label={t("stats.closed")}
            value={statusCounts.Closed}
            active={statusFilter === "Closed"}
            onClick={() => router.push(statusFilter === "Closed" ? "/dashboard" : "/dashboard?status=Closed")}
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
        <div className="w-[220px]">
          <SearchableSelect
            items={statusFilterOptions}
            value={statusFilter}
            onChange={(id) => setStatusFilter(id as ComplaintStatus | "")}
            getId={(option) => option.id}
            getLabel={(option) => option.label}
            allowClear={false}
            ariaLabel={t("statusFilter")}
          />
        </div>
        {canViewAll && (
          <div className="w-[220px]">
            <SearchableSelect
              items={assigneeFilterOptions}
              value={assigneeFilter}
              onChange={setAssigneeFilter}
              getId={(option) => option.id}
              getLabel={(option) => option.label}
              allowClear={false}
              ariaLabel={t("assigneeFilter")}
            />
          </div>
        )}
        <div className="w-[220px]">
          <SearchableSelect
            items={typeFilterOptions}
            value={typeFilter}
            onChange={setTypeFilter}
            getId={(option) => option.id}
            getLabel={(option) => option.label}
            allowClear={false}
            ariaLabel={t("typeFilter")}
          />
        </div>
        <div className="w-[220px]">
          <SearchableSelect
            items={sourceFilterOptions}
            value={sourceFilter}
            onChange={setSourceFilter}
            getId={(option) => option.id}
            getLabel={(option) => option.label}
            allowClear={false}
            ariaLabel={t("sourceFilter")}
          />
        </div>
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
