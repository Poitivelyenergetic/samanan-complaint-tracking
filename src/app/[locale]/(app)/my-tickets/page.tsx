"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToMyTickets } from "@/lib/tickets";
import { subscribeToTicketTypes } from "@/lib/ticketTypes";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { localizedName, type Ticket, type TicketType, type StaffUser } from "@/lib/types";
import { dateRangeFor, type DateFilter } from "@/lib/dateRange";
import StatusBadge from "@/components/StatusBadge";
import DateRangeFilter from "@/components/DateRangeFilter";
import { IconClipboardList, IconInbox, IconRefreshCw, IconShieldCheck } from "@/components/icons";
import Spinner from "@/components/Spinner";

type Bucket = "" | "assigned" | "closed" | "reassignedTo" | "reassignedFrom";

function StatCard({
  icon,
  color,
  label,
  value,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: number;
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

export default function MyTicketsPage() {
  const t = useTranslations("myTickets");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const { user, profile, loading } = useAuth();

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [bucket, setBucket] = useState<Bucket>("");
  const [datePreset, setDatePreset] = useState<DateFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!user) return;
    return subscribeToMyTickets(user.uid, setTickets);
  }, [user]);
  useEffect(() => subscribeToTicketTypes(setTicketTypes), []);
  useEffect(() => subscribeToStaff(setStaff), []);

  const typesById = useMemo(() => new Map(ticketTypes.map((tt) => [tt.id, tt])), [ticketTypes]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const assigneeName = (uid: string | null) =>
    uid ? localizedName(staffById.get(uid), locale) || uid : tCommon("unassigned");

  // Date filter applies before the bucket split, so every stat card's count
  // — not just the table below — tracks whichever date range is active.
  const dateFiltered = useMemo(() => {
    const list = tickets ?? [];
    const { from, to } = dateRangeFor(datePreset, dateFrom, dateTo);
    if (!from && !to) return list;
    return list.filter((tk) => {
      const created = new Date(tk.createdAt);
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    });
  }, [tickets, datePreset, dateFrom, dateTo]);

  const assignedToMe = useMemo(
    () => dateFiltered.filter((tk) => tk.assignedTo === user?.uid),
    [dateFiltered, user]
  );
  const closedByMe = useMemo(() => dateFiltered.filter((tk) => tk.status === "Closed"), [dateFiltered]);
  const reassignedToMe = useMemo(
    () => dateFiltered.filter((tk) => tk.history.some((h) => h.type === "reassigned" && h.assignedTo === user?.uid)),
    [dateFiltered, user]
  );
  const reassignedFromMe = useMemo(
    () =>
      dateFiltered.filter((tk) =>
        tk.history.some((h) => h.type === "reassigned" && h.previousAssignedTo === user?.uid)
      ),
    [dateFiltered, user]
  );

  const filtered = useMemo(() => {
    const sorted = [...dateFiltered].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return sorted.filter((tk) => {
      if (bucket === "assigned") return tk.assignedTo === user?.uid;
      if (bucket === "closed") return tk.status === "Closed";
      if (bucket === "reassignedTo")
        return tk.history.some((h) => h.type === "reassigned" && h.assignedTo === user?.uid);
      if (bucket === "reassignedFrom")
        return tk.history.some((h) => h.type === "reassigned" && h.previousAssignedTo === user?.uid);
      return true;
    });
  }, [dateFiltered, bucket, user]);

  if (loading || !profile) {
    return <Spinner />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>
        </div>
        <Link
          href="/tickets/new"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
        >
          {t("newButton")}
        </Link>
      </div>

      {tickets !== null && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            icon={<IconClipboardList />}
            color="#6366f1"
            label={t("stats.total")}
            value={dateFiltered.length}
            active={bucket === ""}
            onClick={() => setBucket("")}
          />
          <StatCard
            icon={<IconInbox />}
            color="#0ea5e9"
            label={t("stats.assignedToMe")}
            value={assignedToMe.length}
            active={bucket === "assigned"}
            onClick={() => setBucket("assigned")}
          />
          <StatCard
            icon={<IconShieldCheck />}
            color="#22c55e"
            label={t("stats.closed")}
            value={closedByMe.length}
            active={bucket === "closed"}
            onClick={() => setBucket("closed")}
          />
          <StatCard
            icon={<IconRefreshCw />}
            color="#8b5cf6"
            label={t("stats.reassignedToMe")}
            value={reassignedToMe.length}
            active={bucket === "reassignedTo"}
            onClick={() => setBucket("reassignedTo")}
          />
          <StatCard
            icon={<IconRefreshCw />}
            color="#f59e0b"
            label={t("stats.reassignedFromMe")}
            value={reassignedFromMe.length}
            active={bucket === "reassignedFrom"}
            onClick={() => setBucket("reassignedFrom")}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <DateRangeFilter
          preset={datePreset}
          onPresetChange={setDatePreset}
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[720px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.ticketId")}</th>
              <th className="px-4 py-3 text-start">{t("table.subject")}</th>
              <th className="px-4 py-3 text-start">{t("table.type")}</th>
              <th className="px-4 py-3 text-start">{t("table.assignedTo")}</th>
              <th className="px-4 py-3 text-start">{t("table.role")}</th>
              <th className="px-4 py-3 text-start">{t("table.status")}</th>
              <th className="px-4 py-3 text-start">{t("table.createdAt")}</th>
            </tr>
          </thead>
          <tbody>
            {tickets === null ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-foreground/50">
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
                  <td className="px-4 py-3 text-foreground/70">
                    {localizedName(typesById.get(tk.ticketTypeId), locale) || "—"}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{assigneeName(tk.assignedTo)}</td>
                  <td className="px-4 py-3 text-foreground/70">
                    {tk.assignedTo === user?.uid ? t("roleAssignee") : t("roleFiler")}
                    {tk.assignedTo === user?.uid && tk.createdBy === user?.uid ? ` · ${t("roleFiler")}` : ""}
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
