"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "next-intl";

// One shared 1s ticker for every subscriber — the snapshot is the current
// whole second, so React only re-renders when the displayed time actually
// changes.
function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
const getSecond = () => Math.floor(Date.now() / 1000);
// Nothing on the server render — the real time only appears once mounted,
// so there's no hydration mismatch from server vs. browser clocks.
const getServerSecond = () => null;

// Gregorian calendar and Latin digits in Arabic too — matches how dates are
// shown everywhere else in the app (a bare "ar" locale can pick a different
// calendar/numbering depending on the browser).
function intlLocale(locale: string) {
  return locale === "ar" ? "ar-u-ca-gregory-nu-latn" : "en-GB";
}

export default function LiveClock() {
  const locale = useLocale();
  const second = useSyncExternalStore(subscribe, getSecond, getServerSecond);
  if (second === null) return <div className="hidden lg:block" />;

  const now = new Date(second * 1000);
  const loc = intlLocale(locale);
  // en-US rather than en-GB for the time itself, for "PM" instead of "pm".
  const time = new Intl.DateTimeFormat(locale === "ar" ? loc : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(now);
  const day = new Intl.DateTimeFormat(loc, { weekday: "long" }).format(now);
  const date = new Intl.DateTimeFormat(loc, { day: "numeric", month: "long", year: "numeric" }).format(now);

  // Plain text straight on the top bar — no box of its own.
  return (
    <div className="hidden items-center gap-3 lg:flex">
      <span className="font-mono text-base font-semibold tabular-nums text-foreground" dir="ltr">
        {time}
      </span>
      <span className="h-6 w-px bg-border" />
      <div className="flex flex-col leading-tight">
        <span className="text-xs font-semibold text-foreground">{day}</span>
        <span className="text-[11px] text-foreground/60">{date}</span>
      </div>
    </div>
  );
}
