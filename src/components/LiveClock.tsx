"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
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

const REDUCED = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (changed) => {
      const query = window.matchMedia(REDUCED);
      query.addEventListener("change", changed);
      return () => query.removeEventListener("change", changed);
    },
    () => window.matchMedia(REDUCED).matches,
    () => true
  );
}

// The little crew member who comes to change the number over — only loaded
// when there's a number to change.
const ClockCrew = dynamic(() => import("./IdleDustWiper").then((m) => m.ClockCrew), { ssr: false });

interface Face {
  hour: string;
  period: string;
  day: string;
  date: string;
}

export default function LiveClock() {
  const locale = useLocale();
  const second = useSyncExternalStore(subscribe, getSecond, getServerSecond);
  const reduced = useReducedMotion();
  // What's up on the clock face. When the hour or the date turns over, the
  // old one stays up until someone comes and changes it (see ClockCrew).
  const [shown, setShown] = useState<Face | null>(null);
  const [visit, setVisit] = useState<{ kind: "hour" | "date"; peeled: boolean; to: Face } | null>(null);
  // Bumped each time a new number goes up, to replay its pop.
  const [swaps, setSwaps] = useState(0);

  if (second === null) return <div className="hidden lg:block" />;

  const now = new Date(second * 1000);
  const loc = intlLocale(locale);
  // en-US rather than en-GB for the time itself, for "PM" instead of "pm".
  const parts = new Intl.DateTimeFormat(locale === "ar" ? loc : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const current: Face = {
    hour: part("hour"),
    period: part("dayPeriod"),
    day: new Intl.DateTimeFormat(loc, { weekday: "long" }).format(now),
    date: new Intl.DateTimeFormat(loc, { day: "numeric", month: "long", year: "numeric" }).format(now),
  };
  const dateTurned = shown !== null && (shown.day !== current.day || shown.date !== current.date);
  const hourTurned = shown !== null && (shown.hour !== current.hour || shown.period !== current.period);
  if (shown === null) {
    setShown(current);
  } else if (!visit && (dateTurned || hourTurned)) {
    if (reduced) setShown(current);
    else setVisit({ kind: dateTurned ? "date" : "hour", peeled: false, to: current });
  }
  const face = shown ?? current;
  const peeledOff = (kind: "hour" | "date") => visit?.kind === kind && visit.peeled;
  const crew = (kind: "hour" | "date", oldText: string) =>
    visit?.kind === kind && (
      <ClockCrew
        oldText={oldText}
        onPeel={() => setVisit((v) => v && { ...v, peeled: true })}
        onSwap={() => {
          setShown(visit.to);
          setVisit((v) => v && { ...v, peeled: false });
          setSwaps((n) => n + 1);
        }}
        onDone={() => setVisit(null)}
      />
    );
  // The minutes and seconds, always ticking.
  const rest = parts
    .filter((p) => p.type !== "hour" && p.type !== "dayPeriod")
    .map((p) => p.value)
    .join("")
    .trim();

  // Plain text straight on the top bar — no box of its own. (Marked for the
  // idle cleaning crew, who fix it if it falls off.)
  return (
    <div data-crew-clock className="hidden items-center gap-3 lg:flex">
      <span className="font-mono text-base font-semibold tabular-nums text-foreground" dir="ltr">
        <span className="relative inline-block">
          <span key={swaps} className={`inline-block ${swaps ? "crew-pop" : ""}`} style={{ visibility: peeledOff("hour") ? "hidden" : undefined }}>
            {face.hour}
          </span>
          {crew("hour", face.hour)}
        </span>
        {rest}{" "}
        <span style={{ visibility: peeledOff("hour") ? "hidden" : undefined }}>{face.period}</span>
      </span>
      <span className="h-6 w-px bg-border" />
      <div className="relative flex flex-col leading-tight">
        <div key={swaps} className={`flex flex-col ${swaps ? "crew-pop" : ""}`} style={{ visibility: peeledOff("date") ? "hidden" : undefined }}>
          <span className="text-xs font-semibold text-foreground">{face.day}</span>
          <span className="text-[11px] text-foreground/60">{face.date}</span>
        </div>
        {crew("date", face.day)}
      </div>
    </div>
  );
}
