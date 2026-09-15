"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { subscribeToTickets } from "@/lib/tickets";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type StaffUser, type Ticket } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import Spinner from "@/components/Spinner";

export default function TicketInquiryPage() {
  const t = useTranslations("ticketInquiry");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const { profile, loading } = useAuth();
  const canView = hasPermission(profile, "tickets", "viewAll");

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!canView) return;
    return subscribeToTickets(setTickets);
  }, [canView]);
  useEffect(() => subscribeToStaff(setStaff), []);

  useEffect(() => {
    if (!loading && profile && !canView) {
      router.replace("/tickets");
    }
  }, [loading, profile, canView, router]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const term = search.trim().toLowerCase();
  const results = useMemo(() => {
    if (!tickets || !term) return [];
    return tickets.filter((tk) => tk.requesterName.toLowerCase().includes(term) || tk.id.toLowerCase().includes(term));
  }, [tickets, term]);

  if (loading || !profile || !canView) {
    return <Spinner />;
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="mt-6 w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[640px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.ticketId")}</th>
              <th className="px-4 py-3 text-start">{t("table.subject")}</th>
              <th className="px-4 py-3 text-start">{t("table.requester")}</th>
              <th className="px-4 py-3 text-start">{t("table.assignedTo")}</th>
              <th className="px-4 py-3 text-start">{t("table.status")}</th>
              <th className="px-4 py-3 text-start">{t("table.createdAt")}</th>
            </tr>
          </thead>
          <tbody>
            {!term ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground/50">
                  {t("prompt")}
                </td>
              </tr>
            ) : tickets === null ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              results.map((tk) => (
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
