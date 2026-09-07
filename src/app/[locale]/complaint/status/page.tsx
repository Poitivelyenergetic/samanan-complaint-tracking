"use client";

export const dynamic = "force-dynamic";

import { useState, type FormEvent } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getComplaint } from "@/lib/complaints";
import type { Complaint } from "@/lib/types";
import PublicShell, { BrandHeader } from "@/components/PublicShell";
import StatusBadge from "@/components/StatusBadge";

type LookupState = "idle" | "loading" | "found" | "not_found" | "error";

export default function ComplaintStatusPage() {
  const t = useTranslations("statusLookup");
  const tCategory = useTranslations("complaint.categories");
  const tCommon = useTranslations("common");
  const format = useFormatter();

  const [referenceId, setReferenceId] = useState("");
  const [state, setState] = useState<LookupState>("idle");
  const [complaint, setComplaint] = useState<Complaint | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = referenceId.trim();
    if (!id) return;

    setState("loading");
    setComplaint(null);
    try {
      const result = await getComplaint(id);
      // Only complaints submitted through the public form are readable
      // without staff sign-in (enforced server-side by firestore.rules);
      // treat anything else as not found rather than leaking its existence.
      if (result && result.channel === "public") {
        setComplaint(result);
        setState("found");
      } else {
        setState("not_found");
      }
    } catch (err) {
      // A non-public complaint denies the read outright (permission-denied)
      // rather than returning null — treat that the same as "not found" so
      // the lookup can't be used to confirm a staff-only complaint exists.
      const code = (err as { code?: string })?.code;
      setState(code === "permission-denied" ? "not_found" : "error");
    }
  }

  return (
    <PublicShell maxWidthClassName="max-w-md">
      <BrandHeader />

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <Link href="/login" className="text-sm text-brand hover:underline">
          &larr; {tCommon("back")}
        </Link>
        <h2 className="mt-2 text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-foreground/60">{t("subtitle")}</p>

        <form onSubmit={handleSubmit} className="mt-6 flex gap-2">
          <input
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            placeholder={t("placeholder")}
            dir="ltr"
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          <button
            type="submit"
            disabled={state === "loading"}
            className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
          >
            {state === "loading" ? tCommon("loading") : t("checkButton")}
          </button>
        </form>

        {state === "not_found" && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {t("notFound")}
          </p>
        )}
        {state === "error" && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {tCommon("somethingWentWrong")}
          </p>
        )}

        {state === "found" && complaint && (
          <div className="mt-5 rounded-md border border-border bg-black/[0.02] p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-foreground/50" dir="ltr">
                {complaint.id}
              </span>
              <StatusBadge status={complaint.status} />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">{tCategory(complaint.category)}</p>
            <p className="mt-1 text-xs text-foreground/50">
              {tCommon("createdAt")}: {format.dateTime(new Date(complaint.createdAt), { dateStyle: "medium" })}
            </p>
          </div>
        )}
      </div>
    </PublicShell>
  );
}
