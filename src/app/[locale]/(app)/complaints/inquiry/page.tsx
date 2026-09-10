"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { subscribeToComplaints } from "@/lib/complaints";
import { subscribeToStaff } from "@/lib/users";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type Complaint, type StaffUser } from "@/lib/types";
import { phoneDigitsOnly, toLatinDigits } from "@/lib/phone";
import StatusBadge from "@/components/StatusBadge";

export default function ComplaintInquiryPage() {
  const t = useTranslations("complaintInquiry");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const { profile, loading } = useAuth();
  const canView = hasPermission(profile, "complaints", "viewAll");

  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!canView) return;
    return subscribeToComplaints(setComplaints);
  }, [canView]);
  useEffect(() => subscribeToStaff(setStaff), []);

  useEffect(() => {
    if (!loading && profile && !canView) {
      router.replace("/dashboard");
    }
  }, [loading, profile, canView, router]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const term = search.trim();
  const digitsTerm = phoneDigitsOnly(term);
  const results = useMemo(() => {
    if (!complaints || !term) return [];
    const lowerTerm = term.toLowerCase();
    return complaints.filter((c) => {
      const matchesPhone = digitsTerm && phoneDigitsOnly(c.customerPhone).includes(digitsTerm);
      const matchesName = c.customerName.toLowerCase().includes(lowerTerm);
      return matchesPhone || matchesName;
    });
  }, [complaints, term, digitsTerm]);

  if (loading || !profile || !canView) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>

      <input
        type="search"
        dir="ltr"
        value={search}
        onChange={(e) => setSearch(toLatinDigits(e.target.value))}
        placeholder={t("searchPlaceholder")}
        className="mt-6 w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[720px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.issueId")}</th>
              <th className="px-4 py-3 text-start">{t("table.subject")}</th>
              <th className="px-4 py-3 text-start">{t("table.customerName")}</th>
              <th className="px-4 py-3 text-start">{t("table.customerPhone")}</th>
              <th className="px-4 py-3 text-start">{t("table.assignedTo")}</th>
              <th className="px-4 py-3 text-start">{t("table.status")}</th>
              <th className="px-4 py-3 text-start">{t("table.createdAt")}</th>
            </tr>
          </thead>
          <tbody>
            {!term ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-foreground/50">
                  {t("prompt")}
                </td>
              </tr>
            ) : complaints === null ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              results.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
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
