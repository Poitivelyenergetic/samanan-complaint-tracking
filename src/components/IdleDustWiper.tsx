"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { LOGIN_CHARACTER_COLORS } from "./LoginCharacters";

// How long the dashboard has to sit untouched before someone wanders across
// to wipe the dust off it — a small easter egg for a screen that's been
// left open, not a real "session idle" warning.
const IDLE_MS = 60_000;

// Most passes it's just purple; every so often the whole crew shows up
// together for a full clean instead.
const FULL_CREW_CHANCE = 1 / 3;

const CREW = [
  { color: LOGIN_CHARACTER_COLORS.orange, width: 90, height: 74, headTop: 14 },
  { color: LOGIN_CHARACTER_COLORS.yellow, width: 72, height: 92, headTop: 10 },
  { color: LOGIN_CHARACTER_COLORS.black, width: 66, height: 104, headTop: 8 },
  { color: LOGIN_CHARACTER_COLORS.purple, width: 88, height: 128, headTop: 6 },
];

// A face + body, sized differently per character but otherwise identical —
// same eyes-and-smile language as the main login characters, just simple
// enough to read at a glance while walking past.
function Walker({ color, width, height, headTop }: (typeof CREW)[number]) {
  return (
    <div className="relative" style={{ width, height }}>
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-2xl"
        style={{ width, height, backgroundColor: color }}
      />
      <div
        className="absolute flex"
        style={{ left: "50%", top: headTop, transform: "translateX(-50%)", gap: width * 0.12 }}
      >
        {[0, 1].map((i) => (
          <div
            key={i}
            className="animate-idle-blink flex items-center justify-center overflow-hidden rounded-full bg-white"
            style={{ width: width * 0.16, height: width * 0.16 }}
          >
            <div className="rounded-full" style={{ width: width * 0.07, height: width * 0.07, backgroundColor: "#2D2D2D" }} />
          </div>
        ))}
      </div>
      <div
        className="absolute"
        style={{
          left: "50%",
          top: headTop + width * 0.25,
          transform: "translateX(-50%)",
          width: width * 0.24,
          height: width * 0.12,
          borderRadius: "50%",
          border: "3px solid transparent",
          borderBottomColor: "#2D2D2D",
        }}
      />
    </div>
  );
}

export default function IdleDustWiper() {
  const isIdle = useIdleTimer(IDLE_MS);
  // Re-rolled once per idle *visit* rather than on every render, so the
  // cast doesn't change mid-walk — recomputes each time isIdle flips.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fullCrew = useMemo(() => Math.random() < FULL_CREW_CHANCE, [isIdle]);

  if (!isIdle || typeof document === "undefined") return null;

  const walkers = fullCrew ? CREW : [CREW[3]];

  // Portalled straight to <body> — PageTransition wraps every page's
  // content in a `transform`, which makes any `fixed` descendant of it
  // position relative to that wrapper instead of the viewport (a transformed
  // ancestor creates its own containing block for fixed elements). Nested
  // inside that, "bottom-0" landed at the bottom of the whole scrollable
  // page rather than the visible screen.
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {/* The actual "wipe down the whole screen" — a soft shine band
          sweeping the full width in lockstep with them, rather than the
          cleaning motion being just a small local gesture near an arm. */}
      <div
        className="animate-idle-wipe-streak absolute inset-y-0 w-80"
        style={{
          background: fullCrew
            ? "linear-gradient(100deg, transparent, rgba(255,255,255,0.28), transparent)"
            : "linear-gradient(100deg, transparent, rgba(255,255,255,0.16), transparent)",
        }}
      />

      {/* A burst of droplets right where they step in from the edge — the
          "splash" before getting to work. */}
      <div className="absolute bottom-24" style={{ left: -40 }}>
        {[
          { x: 22, y: -26, delay: "0ms", size: "text-base" },
          { x: -18, y: -30, delay: "120ms", size: "text-sm" },
          { x: 30, y: -6, delay: "200ms", size: "text-xs" },
          { x: -8, y: -40, delay: "60ms", size: "text-sm" },
        ].map((drop, i) => (
          <span
            key={i}
            className={`animate-idle-splash absolute ${drop.size}`}
            style={
              {
                "--splash-x": `${drop.x}px`,
                "--splash-y": `${drop.y}px`,
                animationDelay: drop.delay,
                color: "#c7d3ec",
              } as React.CSSProperties
            }
          >
            ✦
          </span>
        ))}
      </div>

      <div className="animate-idle-walk-across absolute bottom-0">
        <div className="flex items-end" style={{ gap: 14 }}>
          {walkers.map((walker, i) => {
            const isLead = i === walkers.length - 1;
            return (
              <div key={i} className="relative">
                <Walker {...walker} />
                {isLead && (
                  <>
                    {/* Wiping arm — a tapered forearm ending in a rag,
                        swinging back and forth across whatever it passes
                        over. Only the lead character carries it. */}
                    <div
                      className="animate-idle-wipe absolute"
                      style={{ left: walker.width - 10, top: walker.headTop + walker.width * 0.5, transformOrigin: "0% 50%" }}
                    >
                      <svg width="78" height="34" viewBox="0 0 78 34" aria-hidden="true">
                        <path
                          d="M0,10 C22,10 40,13 54,16 L54,24 C40,27 22,30 0,30 Z"
                          fill={walker.color}
                        />
                        <circle cx="60" cy="20" r="17" fill="#f4f6fa" stroke="#c7cede" strokeWidth="2" />
                        <path d="M50,20 L70,20 M60,10 L60,30" stroke="#c7cede" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div
                      className="animate-idle-sparkle absolute text-lg"
                      style={{ left: walker.width + 50, top: walker.headTop + walker.width * 0.3 }}
                    >
                      ✦
                    </div>
                    <div
                      className="animate-idle-sparkle absolute text-sm"
                      style={{ left: walker.width + 30, top: walker.headTop + walker.width * 0.55, animationDelay: "600ms" }}
                    >
                      ✦
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
