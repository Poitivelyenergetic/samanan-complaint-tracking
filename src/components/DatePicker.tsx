"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";

interface DatePickerProps {
  value: string; // "YYYY-MM-DD", "" = none
  onChange: (value: string) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  // Overrides the trigger button's default styling.
  className?: string;
}

function parseISODate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DEFAULT_TRIGGER_CLASS =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-start text-sm text-foreground outline-none focus:border-brand focus:ring-1 focus:ring-brand";

// A calendar-grid popover replacing the native <input type="date"> — the
// browser's own calendar picker can't be restyled and looks jarringly
// unthemed against the rest of the app. Kept LTR internally regardless of
// locale (dates read left-to-right even in the Arabic UI, matching how
// charts are already forced dir="ltr" for the same reason).
export default function DatePicker({ value, onChange, id, ariaLabel, placeholder, className }: DatePickerProps) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseISODate(value), [value]);
  const [viewDate, setViewDate] = useState(() => selected ?? new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  function toggleOpen() {
    // Re-sync the visible month only at the moment of opening — not on every
    // `value` change while it's already open, which would fight the user
    // navigating to a different month before picking a day.
    if (!open) setViewDate(selected ?? new Date());
    setOpen(!open);
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(viewDate);
  const weekdayFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "narrow" }), [locale]);
  // Jan 1, 2023 was a Sunday — used purely to generate correctly localized
  // narrow weekday labels for a Sun-first week, independent of any real date.
  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekdayFormatter.format(new Date(2023, 0, i + 1))),
    [weekdayFormatter]
  );

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const displayLabel = selected
    ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(selected)
    : null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        onClick={toggleOpen}
        dir="ltr"
        className={className ?? DEFAULT_TRIGGER_CLASS}
      >
        {displayLabel ?? <span className="text-foreground/40">{placeholder}</span>}
      </button>

      {open && (
        <div
          dir="ltr"
          className="absolute z-30 mt-1 w-60 rounded-lg border border-border bg-surface p-3 shadow-lg"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              aria-label="Previous month"
              className="rounded-md p-1 text-foreground/60 hover:bg-black/5 hover:text-foreground"
            >
              ‹
            </button>
            <span className="text-xs font-semibold text-foreground">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              aria-label="Next month"
              className="rounded-md p-1 text-foreground/60 hover:bg-black/5 hover:text-foreground"
            >
              ›
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-y-1 text-center text-[10px] font-medium uppercase text-foreground/40">
            {weekdayLabels.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-y-1">
            {cells.map((day, i) => {
              if (day === null) return <span key={i} />;
              const cellDate = new Date(year, month, day);
              const iso = toISODate(cellDate);
              const isSelected = value === iso;
              const isToday = isSameDay(cellDate, today);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
                    isSelected
                      ? "bg-brand font-semibold text-brand-foreground"
                      : isToday
                        ? "border border-brand/50 text-foreground"
                        : "text-foreground/80 hover:bg-black/5"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
