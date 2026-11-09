"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { localizedName, type ComplaintType, type OrderDuplicate } from "@/lib/types";
import StatusBadge from "./StatusBadge";

// Shown on New Complaint when the order number typed in already has
// complaints against it: each one listed, and openable if the person's role
// can read it (view-only, in a new tab, so the half-filled new complaint
// isn't lost) — or just close it and carry on.
export default function OrderDuplicatesDialog({
  orderNumber,
  complaints,
  complaintTypes,
  onClose,
}: {
  orderNumber: string;
  complaints: OrderDuplicate[];
  complaintTypes: ComplaintType[];
  onClose: () => void;
}) {
  const t = useTranslations("complaint.duplicates");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const typesById = new Map(complaintTypes.map((ct) => [ct.id, ct]));

  // Straight onto <body>: inside the page, an ancestor with a transform would
  // pin this to the content area (half off-screen when scrolled, the sidebar
  // left uncovered) instead of the window.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-duplicates-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="order-duplicates-title" className="text-sm font-semibold text-foreground">
          {t("title", { count: complaints.length })}
        </h3>
        <p className="mt-1.5 text-sm text-foreground/60">
          {t.rich("body", {
            order: orderNumber,
            num: (chunks) => (
              <bdi dir="ltr" className="font-mono text-foreground/80">
                {chunks}
              </bdi>
            ),
          })}
        </p>

        <ul className="mt-4 -mx-1 space-y-2 overflow-y-auto px-1">
          {complaints.map((c) => {
            const type = typesById.get(c.complaintTypeId);
            return (
              <li key={c.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-foreground/50">#{c.id}</span>
                    <span className="truncate text-sm font-medium text-foreground">{type ? localizedName(type, locale) : "—"}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-1 text-xs text-foreground/60">
                    {c.assignee ? localizedName(c.assignee, locale) : tCommon("unassigned")}
                    {" · "}
                    {format.dateTime(new Date(c.createdAt), { dateStyle: "medium" })}
                  </p>
                </div>
                {c.canOpen && (
                  <Link
                    href={`/complaints/${c.id}?view=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90"
                  >
                    {t("open")}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-black/5"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
