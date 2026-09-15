"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DateFilter } from "@/lib/dateRange";
import SearchableSelect from "./SearchableSelect";
import DatePicker from "./DatePicker";

interface DateRangeFilterProps {
  preset: DateFilter;
  onPresetChange: (preset: DateFilter) => void;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  // Matches the width of the other w-[220px] filter boxes it sits beside
  // in a page's filter row — pass false to size to content instead (e.g.
  // a chart card's own compact corner filter).
  fullWidth?: boolean;
  // Overrides the preset dropdown's styling — for compact/inline filter
  // spots (e.g. a chart card's corner control) that need a quieter look
  // than the standard full-size form field.
  selectClassName?: string;
}

// A preset dropdown (All time / Today / Last 7 days / Last 30 days / This
// month / Custom range) plus, only when "Custom range" is picked, a from/to
// date-picker pair — the same UI pattern used on the Home page's per-chart
// date filters, generalized here for reuse on plain list pages (Complaints,
// My Complaints, Tickets, My Tickets).
export default function DateRangeFilter({
  preset,
  onPresetChange,
  from,
  to,
  onFromChange,
  onToChange,
  fullWidth = true,
  selectClassName,
}: DateRangeFilterProps) {
  const t = useTranslations("home");

  // The From/To pickers edit this local draft, not the applied from/to
  // directly — otherwise picking just "From" would immediately (re-)filter
  // the page on a half-finished range. Committed to the parent only when
  // "Apply" is clicked, and re-synced from props whenever they change
  // externally (preset switched away and back, a link landed with its own
  // from/to, etc.) — adjusted during render, same pattern the Dashboard
  // page uses to sync its own filter state to changing URL params.
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [syncedFrom, setSyncedFrom] = useState(from);
  const [syncedTo, setSyncedTo] = useState(to);
  if (from !== syncedFrom || to !== syncedTo) {
    setSyncedFrom(from);
    setSyncedTo(to);
    setDraftFrom(from);
    setDraftTo(to);
  }

  const options = [
    { id: "all", label: t("dateFilterAll") },
    { id: "today", label: t("dateFilterToday") },
    { id: "7d", label: t("dateFilterLast7") },
    { id: "30d", label: t("dateFilterLast30") },
    { id: "month", label: t("dateFilterThisMonth") },
    { id: "custom", label: t("dateFilterCustom") },
  ];

  return (
    <div className={`relative ${fullWidth ? "w-[220px]" : ""}`}>
      <SearchableSelect
        items={options}
        value={preset}
        onChange={(id) => onPresetChange(id as DateFilter)}
        getId={(o) => o.id}
        getLabel={(o) => o.label}
        allowClear={false}
        ariaLabel={t("dateFilter")}
        className={selectClassName}
      />

      {preset === "custom" && (
        <div className="absolute end-0 top-full z-10 mt-1 flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-lg">
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="dateRangeFrom" className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                {t("dateFrom")}
              </label>
              <div className="w-[136px]">
                <DatePicker
                  id="dateRangeFrom"
                  value={draftFrom}
                  onChange={setDraftFrom}
                  ariaLabel={t("dateFrom")}
                  placeholder={t("dateFrom")}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-start text-xs text-foreground outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
            <span className="pb-2 text-foreground/30">→</span>
            <div className="flex flex-col gap-1">
              <label htmlFor="dateRangeTo" className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                {t("dateTo")}
              </label>
              <div className="w-[136px]">
                <DatePicker
                  id="dateRangeTo"
                  value={draftTo}
                  onChange={setDraftTo}
                  ariaLabel={t("dateTo")}
                  placeholder={t("dateTo")}
                  align="end"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-start text-xs text-foreground outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onFromChange(draftFrom);
              onToChange(draftTo);
            }}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:opacity-90"
          >
            {t("apply")}
          </button>
        </div>
      )}
    </div>
  );
}
