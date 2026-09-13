"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToTickets } from "@/lib/tickets";
import { subscribeToStaff } from "@/lib/users";
import { subscribeToTicketTypes } from "@/lib/ticketTypes";
import { subscribeToTicketSources } from "@/lib/ticketSources";
import { useAuth } from "@/lib/auth-context";
import {
  hasPermission,
  localizedName,
  TICKET_STATUSES,
  type StaffUser,
  type Ticket,
  type TicketSource,
  type TicketStatus,
  type TicketType,
} from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import SearchableSelect from "@/components/SearchableSelect";
import { IconClipboardList, IconInbox, IconRefreshCw, IconShieldCheck } from "@/components/icons";

function StatCard({
  icon,
  color,
  label,
  value,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="inline-flex rounded-lg p-2" style={{ backgroundColor: `${color}1f`, color }}>
        {icon}
      </div>
      <p className="mt-4 text-sm font-medium text-foreground/60">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

export default function TicketsPage() {
  const t = useTranslations("tickets");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const format = useFormatter();
  const locale = useLocale();
  const { profile } = useAuth();
  const canView = hasPermission(profile, "tickets", "viewAll");
  const canCreate = true; // filing a ticket is open to everyone — see New Ticket

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [ticketSources, setTicketSources] = useState<TicketSource[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  useEffect(() => {
    if (!canView) return;
    return subscribeToTickets(setTickets);
  }, [canView]);
  useEffect(() => subscribeToStaff(setStaff), []);
  useEffect(() => subscribeToTicketTypes(setTicketTypes), []);
  useEffect(() => subscribeToTicketSources(setTicketSources), []);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const typesById = useMemo(() => new Map(ticketTypes.map((tt) => [tt.id, tt])), [ticketTypes]);
  const sourcesById = useMemo(() => new Map(ticketSources.map((ts) => [ts.id, ts])), [ticketSources]);

  const statusFilterOptions = useMemo(
    () => [
      { id: "", label: `${t("statusFilter")}: ${tCommon("all")}` },
      ...TICKET_STATUSES.map((status) => ({ id: status, label: tStatus(status) })),
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
  const typeFilterOptions = useMemo(
    () => [
      { id: "", label: `${t("typeFilter")}: ${tCommon("all")}` },
      ...ticketTypes.map((type) => ({ id: type.id, label: localizedName(type, locale) })),
    ],
    [ticketTypes, locale, t, tCommon]
  );
  const sourceFilterOptions = useMemo(
    () => [
      { id: "", label: `${t("sourceFilter")}: ${tCommon("all")}` },
      ...ticketSources.map((source) => ({ id: source.id, label: localizedName(source, locale) })),
    ],
    [ticketSources, locale, t, tCommon]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<TicketStatus, number> = { Open: 0, Assigned: 0, Processing: 0, Cancel: 0, Closed: 0 };
    (tickets ?? []).forEach((tk) => {
      counts[tk.status] += 1;
    });
    return counts;
  }, [tickets]);

  const filtered = useMemo(() => {
    if (!tickets) return [];
    const term = search.trim().toLowerCase();
    return tickets.filter((tk) => {
      if (statusFilter && tk.status !== statusFilter) return false;
      if (assigneeFilter && tk.assignedTo !== assigneeFilter) return false;
      if (typeFilter && tk.ticketTypeId !== typeFilter) return false;
      if (sourceFilter && tk.ticketSourceId !== sourceFilter) return false;
      if (
        term &&
        !tk.subject.toLowerCase().includes(term) &&
        !tk.requesterName.toLowerCase().includes(term) &&
        !tk.id.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [tickets, search, statusFilter, assigneeFilter, typeFilter, sourceFilter]);

  if (!canView) {
    return (
      <div>
        <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-2 text-sm text-foreground/60">{t("noAccess")}</p>
        <Link href="/my-tickets" className="mt-3 inline-block text-sm text-brand hover:underline">
          {t("goToMyTickets")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        {canCreate && (
          <Link
            href="/tickets/new"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            {t("newButton")}
          </Link>
        )}
      </div>

      {tickets !== null && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={<IconClipboardList />} color="#475569" label={t("stats.total")} value={tickets.length} />
          <StatCard icon={<IconInbox />} color="#3b82f6" label={t("stats.open")} value={statusCounts.Open} />
          <StatCard icon={<IconRefreshCw />} color="#d97706" label={t("stats.processing")} value={statusCounts.Processing} />
          <StatCard icon={<IconShieldCheck />} color="#16a34a" label={t("stats.closed")} value={statusCounts.Closed} />
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
            onChange={(id) => setStatusFilter(id as TicketStatus | "")}
            getId={(option) => option.id}
            getLabel={(option) => option.label}
            allowClear={false}
            ariaLabel={t("statusFilter")}
          />
        </div>
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
        <table className="w-full min-w-[860px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.ticketId")}</th>
              <th className="px-4 py-3 text-start">{t("table.subject")}</th>
              <th className="px-4 py-3 text-start">{t("table.requester")}</th>
              <th className="px-4 py-3 text-start">{t("table.type")}</th>
              <th className="px-4 py-3 text-start">{t("table.source")}</th>
              <th className="px-4 py-3 text-start">{t("table.assignedTo")}</th>
              <th className="px-4 py-3 text-start">{t("table.status")}</th>
              <th className="px-4 py-3 text-start">{t("table.createdAt")}</th>
            </tr>
          </thead>
          <tbody>
            {tickets === null ? (
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
              filtered.map((tk) => (
                <tr key={tk.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/tickets/${tk.id}`} className="font-mono text-xs text-brand hover:underline">
                      {tk.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/tickets/${tk.id}`} className="font-medium text-foreground hover:text-brand">
                      {tk.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{tk.requesterName || "—"}</td>
                  <td className="px-4 py-3 text-foreground/70">
                    {localizedName(typesById.get(tk.ticketTypeId), locale) || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {localizedName(sourcesById.get(tk.ticketSourceId), locale) || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {tk.assignedTo ? localizedName(staffById.get(tk.assignedTo), locale) || tk.assignedTo : tCommon("unassigned")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={tk.status} />
                  </td>
                  <td className="px-4 py-3 text-foreground/60">
                    {format.dateTime(new Date(tk.createdAt), { dateStyle: "medium" })}
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
