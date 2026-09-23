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

type Shape = "tower" | "dome";

interface CrewMember {
  color: string;
  width: number;
  height: number;
  shape: Shape;
  bounceDelay: string;
  marginBottom: number;
}

// Two silhouettes, not one rectangle resized four ways — matches the
// login screen's own mix of tall rectangles (purple, black) and wide
// rounded domes (orange, yellow) instead of everyone reading as the same
// shape in different sizes.
const CREW: CrewMember[] = [
  { color: LOGIN_CHARACTER_COLORS.orange, width: 110, height: 66, shape: "dome", bounceDelay: "0ms", marginBottom: 0 },
  { color: LOGIN_CHARACTER_COLORS.yellow, width: 84, height: 84, shape: "dome", bounceDelay: "90ms", marginBottom: 4 },
  { color: LOGIN_CHARACTER_COLORS.black, width: 62, height: 108, shape: "tower", bounceDelay: "180ms", marginBottom: 0 },
  { color: LOGIN_CHARACTER_COLORS.purple, width: 84, height: 130, shape: "tower", bounceDelay: "270ms", marginBottom: 0 },
];

// A face + body — bouncing in place (a marching cartoon hop, not a flat
// glide), pupils that blink, and a big red singing/cheering mouth that
// keeps opening and closing rather than sitting in one fixed expression.
function Walker({ color, width, height, shape, bounceDelay, marginBottom }: CrewMember) {
  const domeTop = shape === "dome" ? height * 0.28 : 10;
  return (
    <div style={{ width, height, perspective: 400 }}>
      {/* The turn-around — rotating the whole body on the Y axis rather
          than just the flat face, with the eyes/mouth hidden via
          backface-visibility while they'd be looking the wrong way. Nested
          outside the bounce div so the two transforms don't fight over the
          same style property. */}
      <div className="animate-idle-turn h-full w-full" style={{ transformStyle: "preserve-3d" }}>
        <div
          className="animate-idle-bounce relative h-full w-full"
          style={{ animationDelay: bounceDelay, marginBottom }}
        >
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2"
            style={{
              width,
              height,
              backgroundColor: color,
              borderRadius: shape === "dome" ? "999px 999px 0 0" : "14px 14px 0 0",
            }}
          />
          <div style={{ backfaceVisibility: "hidden" }}>
            <div
              className="absolute flex"
              style={{ left: "50%", top: domeTop, transform: "translateX(-50%)", gap: width * 0.12 }}
            >
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="animate-idle-blink flex items-center justify-center overflow-hidden rounded-full bg-white"
                  style={{ width: width * 0.17, height: width * 0.17 }}
                >
                  <div
                    className="rounded-full"
                    style={{ width: width * 0.075, height: width * 0.075, backgroundColor: "#2D2D2D" }}
                  />
                </div>
              ))}
            </div>
            {/* The "Roblox grin" — a big red, filled smile instead of a
                thin outline, that keeps flapping open and shut like it's
                mid-"yeah!" */}
            <div
              className="animate-idle-sing absolute rounded-b-full bg-[#d1453b]"
              style={{
                left: "50%",
                top: domeTop + width * 0.26,
                transform: "translateX(-50%)",
                width: width * 0.26,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Mop({ color }: { color: string }) {
  return (
    <svg width="80" height="40" viewBox="0 0 80 40" aria-hidden="true">
      <path d="M0,12 C22,12 38,15 50,18 L50,24 C38,27 22,30 0,30 Z" fill={color} />
      <g stroke="#c7cede" strokeWidth="3.5" strokeLinecap="round">
        <path d="M52,14 L60,4" />
        <path d="M56,17 L66,9" />
        <path d="M58,21 L70,17" />
        <path d="M58,25 L70,29" />
        <path d="M56,29 L64,37" />
        <path d="M52,32 L58,40" />
      </g>
    </svg>
  );
}

function Bucket() {
  return (
    <svg width="48" height="44" viewBox="0 0 48 44" aria-hidden="true">
      <path d="M14,0 C14,-8 34,-8 34,0" fill="none" stroke="#c7cede" strokeWidth="3" />
      <path d="M6,8 L42,8 L36,40 L12,40 Z" fill="#8fa3cc" stroke="#c7cede" strokeWidth="2" />
    </svg>
  );
}

function SprayBottle() {
  return (
    <svg width="40" height="46" viewBox="0 0 40 46" aria-hidden="true">
      <rect x="10" y="16" width="20" height="28" rx="5" fill="#8fa3cc" />
      <rect x="14" y="6" width="7" height="12" rx="2" fill="#c7cede" />
      <rect
        x="17"
        y="-2"
        width="14"
        height="7"
        rx="2.5"
        fill="#c7cede"
        transform="rotate(30 17 -2)"
      />
    </svg>
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
          sweeping the full width in lockstep with them. */}
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
        {/* Overlapping, not lined up shoulder to shoulder — negative
            margins let each one tuck slightly behind/beside the last, the
            way the login screen's own cluster of characters overlaps
            instead of standing in a neat row. */}
        <div className="flex items-end">
          {walkers.map((walker, i) => {
            const isLead = i === walkers.length - 1;
            const carriesBucket = fullCrew && i === 0;
            const carriesSpray = fullCrew && i === 1;
            return (
              <div key={i} className="relative" style={{ marginInlineStart: i === 0 ? 0 : -18 }}>
                <Walker {...walker} />
                {carriesBucket && (
                  <div className="absolute" style={{ left: -30, bottom: 0 }}>
                    <Bucket />
                  </div>
                )}
                {carriesSpray && (
                  <div className="absolute" style={{ right: -20, bottom: 4 }}>
                    <SprayBottle />
                    {/* The actual spray — a little burst of mist puffing
                        out of the nozzle, not just a bottle being held. */}
                    <div
                      className="animate-idle-spray absolute text-xs"
                      style={{ left: 30, top: -6, color: "#cfe0f5" }}
                    >
                       °
                    </div>
                    <div
                      className="animate-idle-spray absolute text-sm"
                      style={{ left: 36, top: 2, color: "#cfe0f5", animationDelay: "150ms" }}
                    >
                      °
                    </div>
                    <div
                      className="animate-idle-spray absolute text-xs"
                      style={{ left: 32, top: 10, color: "#cfe0f5", animationDelay: "300ms" }}
                    >
                      °
                    </div>
                  </div>
                )}
                {isLead && (
                  <>
                    <div
                      className="animate-idle-wipe absolute"
                      style={{ left: walker.width - 14, top: walker.height * 0.32, transformOrigin: "0% 50%" }}
                    >
                      <Mop color={walker.color} />
                    </div>
                    <div
                      className="animate-idle-sparkle absolute text-lg"
                      style={{ left: walker.width + 52, top: walker.height * 0.18 }}
                    >
                      ✦
                    </div>
                    <div
                      className="animate-idle-sparkle absolute text-sm"
                      style={{ left: walker.width + 30, top: walker.height * 0.45, animationDelay: "600ms" }}
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
