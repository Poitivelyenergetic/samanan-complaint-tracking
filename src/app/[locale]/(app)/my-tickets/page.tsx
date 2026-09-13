"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToMyTickets } from "@/lib/tickets";
import { subscribeToTicketTypes } from "@/lib/ticketTypes";
import { useAuth } from "@/lib/auth-context";
import { localizedName, type Ticket, type TicketType } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

export default function MyTicketsPage() {
  const t = useTranslations("myTickets");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const { user, profile, loading } = useAuth();

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);

  useEffect(() => {
    if (!user) return;
    return subscribeToMyTickets(user.uid, setTickets);
  }, [user]);
  useEffect(() => subscribeToTicketTypes(setTicketTypes), []);

  const typesById = useMemo(() => new Map(ticketTypes.map((tt) => [tt.id, tt])), [ticketTypes]);

  if (loading || !profile) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
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

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[640px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.ticketId")}</th>
              <th className="px-4 py-3 text-start">{t("table.subject")}</th>
              <th className="px-4 py-3 text-start">{t("table.type")}</th>
              <th className="px-4 py-3 text-start">{t("table.role")}</th>
              <th className="px-4 py-3 text-start">{t("table.status")}</th>
              <th className="px-4 py-3 text-start">{t("table.createdAt")}</th>
            </tr>
          </thead>
          <tbody>
            {tickets === null ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              tickets.map((tk) => (
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
