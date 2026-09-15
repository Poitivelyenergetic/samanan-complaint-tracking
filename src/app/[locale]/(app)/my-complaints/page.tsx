"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subscribeToComplaints } from "@/lib/complaints";
import { subscribeToComplaintSources } from "@/lib/complaintSources";
import { subscribeToComplaintTypes } from "@/lib/complaintTypes";
import { useAuth } from "@/lib/auth-context";
import { hasPermission, localizedName, type Complaint, type ComplaintSource, type ComplaintType } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

export default function MyComplaintsPage() {
  const t = useTranslations("myComplaints");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const { user, profile, loading } = useAuth();
  const canView = hasPermission(profile, "complaints", "view");

  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [complaintSources, setComplaintSources] = useState<ComplaintSource[]>([]);
  const [complaintTypes, setComplaintTypes] = useState<ComplaintType[]>([]);

  useEffect(() => {
    if (!user || !canView) return;
    return subscribeToComplaints(setComplaints, undefined, user.uid);
  }, [user, canView]);
  useEffect(() => subscribeToComplaintSources(setComplaintSources), []);
  useEffect(() => subscribeToComplaintTypes(setComplaintTypes), []);

  const sourcesById = useMemo(() => new Map(complaintSources.map((s) => [s.id, s])), [complaintSources]);
  const typesById = useMemo(() => new Map(complaintTypes.map((ct) => [ct.id, ct])), [complaintTypes]);

  if (loading || !profile) {
    return <p className="text-sm text-foreground/50">{tCommon("loading")}</p>;
  }

  if (!canView) {
    return (
      <div>
        <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-2 text-sm text-foreground/60">{t("noAccess")}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-0.5 text-sm text-foreground/60">{t("subtitle")}</p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[720px] text-start text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-start text-xs font-semibold uppercase tracking-wide text-foreground/50">
              <th className="px-4 py-3 text-start">{t("table.issueId")}</th>
              <th className="px-4 py-3 text-start">{t("table.type")}</th>
              <th className="px-4 py-3 text-start">{t("table.customer")}</th>
              <th className="px-4 py-3 text-start">{t("table.source")}</th>
              <th className="px-4 py-3 text-start">{t("table.status")}</th>
              <th className="px-4 py-3 text-start">{t("table.createdAt")}</th>
            </tr>
          </thead>
          <tbody>
            {complaints === null ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground/50">
                  {tCommon("loading")}
                </td>
              </tr>
            ) : complaints.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-foreground/50">
                  {t("noResults")}
                </td>
              </tr>
            ) : (
              complaints.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-black/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/complaints/${c.id}`} className="font-mono text-xs text-brand hover:underline">
                      {c.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/complaints/${c.id}`} className="font-medium text-foreground hover:text-brand">
                      {localizedName(typesById.get(c.complaintTypeId), locale) || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{c.customerName || "—"}</td>
                  <td className="px-4 py-3 text-foreground/70">
                    {localizedName(sourcesById.get(c.complaintSourceId), locale) || "—"}
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
