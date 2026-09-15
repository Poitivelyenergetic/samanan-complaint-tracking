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
}

// A preset dropdown (All time / Today / Last 7 days / Last 30 days / This
// month / Custom range) plus, only when "Custom range" is picked, a from/to
// date-picker pair — the same UI pattern used on the Home page's per-chart
// date filters, generalized here for reuse on plain list pages (Complaints,
// My Complaints, Tickets, My Tickets).
//
// Picking dates doesn't apply immediately: the from/to fields are held as a
// local draft until Apply is pressed, at which point the control collapses
// from the dropdown into a single "From: ... To: ..." summary button —
// clicking that button reopens the picker to adjust the range again.
export default function DateRangeFilter({
  preset,
  onPresetChange,
  from,
  to,
  onFromChange,
  onToChange,
  fullWidth = true,
}: DateRangeFilterProps) {
  const t = useTranslations("home");
  const tCommon = useTranslations("common");
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [pickerOpen, setPickerOpen] = useState(preset === "custom" && !(from || to));

  const options = [
    { id: "all", label: t("dateFilterAll") },
    { id: "today", label: t("dateFilterToday") },
    { id: "7d", label: t("dateFilterLast7") },
    { id: "30d", label: t("dateFilterLast30") },
    { id: "month", label: t("dateFilterThisMonth") },
    { id: "custom", label: t("dateFilterCustom") },
  ];

  function handlePresetChange(id: string) {
    onPresetChange(id as DateFilter);
    if (id === "custom") {
      setDraftFrom(from);
      setDraftTo(to);
      setPickerOpen(true);
    }
  }

  function handleApply() {
    onFromChange(draftFrom);
    onToChange(draftTo);
    setPickerOpen(false);
  }

  function reopenPicker() {
    setDraftFrom(from);
    setDraftTo(to);
    setPickerOpen(true);
  }

  if (preset === "custom" && !pickerOpen) {
    return (
      <div className={fullWidth ? "w-[220px]" : ""}>
        <button
          type="button"
          onClick={reopenPicker}
          className="w-full truncate rounded-md border border-border bg-surface px-3 py-2 text-start text-sm text-foreground outline-none hover:border-brand/40 focus:border-brand focus:ring-1 focus:ring-brand"
        >
          {t("dateFrom")}: {from || "…"} {t("dateTo")}: {to || "…"}
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${fullWidth ? "w-[220px]" : ""}`}>
      <SearchableSelect
        items={options}
        value={preset}
        onChange={handlePresetChange}
        getId={(o) => o.id}
        getLabel={(o) => o.label}
        allowClear={false}
        ariaLabel={t("dateFilter")}
      />

      {preset === "custom" && pickerOpen && (
        <div className="absolute end-0 top-full z-10 mt-1 flex items-end gap-2 rounded-lg border border-border bg-surface p-3 shadow-lg">
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
          <button
            type="button"
            onClick={handleApply}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:opacity-90"
          >
            {tCommon("apply")}
          </button>
        </div>
      )}
    </div>
  );
}
