"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { crewCards, type CardJob } from "@/lib/crewCards";
import { LOGIN_CHARACTER_COLORS } from "./LoginCharacters";

// How long the dashboard has to sit untouched before the cleaning crew
// shows up — a small easter egg for a screen that's been left open, not a
// real "session idle" warning.
const IDLE_MS = 60_000;

// ============================================================ timing

// Walking pace, in ms per 1% of screen width — an unhurried stroll.
const WALK_MS_PER_PCT = 75;
// Gondola travel, in ms per 1% of combined horizontal + vertical distance.
const GONDOLA_MS_PER_PCT = 60;
const FIRST_JOB_MS = 1900;
const SECOND_JOB_MS = 2800;
const INSPECT_MS = 1000;
const CHEER_MS = 2200;
const REST_BETWEEN_ROUNDS_MS = 4000;
// Odds of something going a bit wrong (or just a human moment) at any one
// dirty patch — "sometimes", not every time. Capped per worker per round.
const QUIRK_CHANCE_PER_PATCH = 0.22;
const MAX_QUIRKS_PER_WORKER = 2;

const walkMs = (from: number, to: number) => Math.max(900, Math.abs(to - from) * WALK_MS_PER_PCT);

// ============================================================ cast

type Name = "purple" | "black" | "orange" | "yellow";
type Activity = "spray" | "wipe" | "polish" | "dunk" | "mopFloor";
type Quirk = "confused" | "sneeze" | "yawn" | "wave" | "dance" | "slip" | "backfire";
type CheerStyle = "nod" | "wave" | "bow" | "jump";

interface Character {
  name: Name;
  color: string;
  width: number;
  height: number;
  /** Two blob outlines (border-radius) the body slowly wobbles between. */
  blobA: string;
  blobB: string;
  stage1: Activity;
  stage2: Activity;
  blinkDelay: string;
}

// Soft jelly blobs in the login screen's palette — tall beans (purple,
// black) and squat puddles (orange, yellow) — each with their own job.
const CHARACTERS: Record<Name, Character> = {
  purple: {
    name: "purple",
    color: LOGIN_CHARACTER_COLORS.purple,
    width: 84,
    height: 124,
    blobA: "48% 52% 40% 42% / 36% 32% 22% 24%",
    blobB: "54% 46% 44% 38% / 32% 38% 24% 22%",
    stage1: "spray",
    stage2: "wipe",
    blinkDelay: "0ms",
  },
  black: {
    name: "black",
    color: LOGIN_CHARACTER_COLORS.black,
    width: 66,
    height: 104,
    blobA: "50% 50% 38% 40% / 34% 36% 20% 22%",
    blobB: "45% 55% 42% 36% / 38% 32% 22% 20%",
    stage1: "wipe",
    stage2: "polish",
    blinkDelay: "900ms",
  },
  orange: {
    name: "orange",
    color: LOGIN_CHARACTER_COLORS.orange,
    width: 110,
    height: 70,
    blobA: "52% 48% 34% 36% / 72% 68% 32% 32%",
    blobB: "46% 54% 36% 32% / 66% 74% 32% 32%",
    stage1: "dunk",
    stage2: "mopFloor",
    blinkDelay: "2600ms",
  },
  yellow: {
    name: "yellow",
    color: LOGIN_CHARACTER_COLORS.yellow,
    width: 86,
    height: 84,
    blobA: "50% 50% 38% 40% / 60% 58% 40% 40%",
    blobB: "56% 44% 40% 36% / 54% 64% 38% 42%",
    stage1: "spray",
    stage2: "polish",
    blinkDelay: "1700ms",
  },
};
const ALL_NAMES = Object.keys(CHARACTERS) as Name[];

const QUIRK_MS: Record<Quirk, number> = {
  confused: 2400,
  sneeze: 1600,
  yawn: 1900,
  wave: 1800,
  dance: 2000,
  slip: 2600,
  backfire: 1800,
};

// Feet poke out below the body — the body sits on top of them.
const FOOT = 10;

// ============================================================ scripts

// Each actor follows a script of timed steps worked out up front for the
// whole round — walk to a dirty patch, spray it, scrub it until it's gone,
// step back and check, move on — rather than everyone looping one motion.
type Step =
  | { kind: "walk"; at: number; ms: number; x: number; top?: string }
  | { kind: "work"; at: number; ms: number; activity: Activity }
  | { kind: "inspect"; at: number; ms: number }
  | { kind: "quirk"; at: number; ms: number; quirk: Quirk }
  | { kind: "wait"; at: number; ms: number }
  | { kind: "cheer"; at: number; ms: number }
  | { kind: "pull"; at: number; ms: number }
  | { kind: "gone"; at: number; ms: number };

interface DustSpeck {
  left: string;
  top?: string;
  bottom?: number;
  size: number;
  /** Floor grime (muddy footprints for the mop) vs. dust on the glass. */
  floor: boolean;
  wetAt: number | null;
  clearAt: number;
}

interface RiderQuirk {
  quirk: Quirk;
  at: number;
  ms: number;
}

function weightedPick<T extends string>(options: [T, number][]): T {
  let roll = Math.random() * options.reduce((sum, [, w]) => sum + w, 0);
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return options[0][0];
}

interface FloorActor {
  character: Character;
  entryX: number;
  steps: Step[];
  endAt: number;
}

function buildFloorScript(character: Character, startAt: number, stops: number[], specks: DustSpeck[]): FloorActor {
  const steps: Step[] = [];
  const entryX = -12;
  let t = startAt;
  let x = entryX;
  let quirks = 0;
  const maybeQuirk = (options: [Quirk, number][]): Quirk | null => {
    if (quirks >= MAX_QUIRKS_PER_WORKER || Math.random() > QUIRK_CHANCE_PER_PATCH) return null;
    quirks++;
    return weightedPick(options);
  };
  const sprays = character.stage1 === "spray";
  const mopper = character.stage2 === "mopFloor";

  stops.forEach((stop, stopIndex) => {
    const walk = walkMs(x, stop);
    steps.push({ kind: "walk", at: t, ms: walk, x: stop });
    t += walk;
    x = stop;

    // Arriving at a patch: sometimes they slip on the wet floor they just
    // left behind, sometimes they stand there puzzling over where to start.
    const arrival: [Quirk, number][] = [["confused", 30]];
    if (stopIndex > 0) arrival.push(["slip", 22]);
    if (sprays) arrival.push(["backfire", 18]);
    const q1 = maybeQuirk(arrival);
    if (q1 && q1 !== "backfire") {
      steps.push({ kind: "quirk", at: t, ms: QUIRK_MS[q1], quirk: q1 });
      t += QUIRK_MS[q1];
    }

    const count = 3;
    const patch: DustSpeck[] = Array.from({ length: count }, () => ({
      left: `${stop + (Math.random() * 2 - 1) * 5}%`,
      bottom: mopper ? 2 + Math.random() * 26 : 70 + Math.random() * 160,
      size: mopper ? 34 + Math.random() * 24 : 24 + Math.random() * 28,
      floor: mopper,
      wetAt: null,
      clearAt: 0,
    }));

    // Spraying themselves in the face by accident, then trying again.
    if (q1 === "backfire") {
      steps.push({ kind: "quirk", at: t, ms: QUIRK_MS.backfire, quirk: "backfire" });
      t += QUIRK_MS.backfire;
    }
    steps.push({ kind: "work", at: t, ms: FIRST_JOB_MS, activity: character.stage1 });
    if (sprays) patch.forEach((s, i) => (s.wetAt = t + 250 + i * 450));
    t += FIRST_JOB_MS;

    const q2 = maybeQuirk([
      ["sneeze", 30],
      ["yawn", 20],
      ["wave", 24],
      ["dance", 6],
    ]);
    if (q2) {
      steps.push({ kind: "quirk", at: t, ms: QUIRK_MS[q2], quirk: q2 });
      t += QUIRK_MS[q2];
    }

    steps.push({ kind: "work", at: t, ms: SECOND_JOB_MS, activity: character.stage2 });
    patch.forEach((s, i) => (s.clearAt = t + (i + 0.7) * (SECOND_JOB_MS / (count + 0.4))));
    t += SECOND_JOB_MS;
    specks.push(...patch);

    steps.push({ kind: "inspect", at: t, ms: INSPECT_MS });
    t += INSPECT_MS;
  });

  return { character, entryX, steps, endAt: t };
}

interface GondolaActor {
  riders: Character[];
  entryX: number;
  steps: Step[];
  endAt: number;
  riderQuirks: Partial<Record<Name, RiderQuirk>>;
}

const GONDOLA_WIDTH = 240;
const GONDOLA_OFFSCREEN = "-380px";
// A window-washer's route down the glass: across the top, then down into
// the middle — three patches, so they finish around when the floor crew do.
const GONDOLA_STOPS: { x: number; y: number }[] = [
  { x: 22, y: 8 },
  { x: 76, y: 10 },
  { x: 50, y: 34 },
];

function buildGondolaScript(riders: Character[], startAt: number, specks: DustSpeck[]): GondolaActor {
  const steps: Step[] = [];
  const entryX = GONDOLA_STOPS[0].x;
  let t = startAt;
  let prev: { x: number; y: number } | null = null;
  const workWindows: { at: number; ms: number }[] = [];
  const anySprays = riders.some((r) => r.stage1 === "spray");

  for (const stop of GONDOLA_STOPS) {
    // Lowered in from above the screen first, then along the ropes.
    const ms = prev ? Math.max(1300, (Math.abs(stop.x - prev.x) + Math.abs(stop.y - prev.y)) * GONDOLA_MS_PER_PCT) : 2800;
    steps.push({ kind: "walk", at: t, ms, x: stop.x, top: `${stop.y}%` });
    t += ms;
    prev = stop;

    const count = 4;
    const patch: DustSpeck[] = Array.from({ length: count }, () => ({
      left: `calc(${stop.x}% + ${Math.round((Math.random() * 2 - 1) * 110)}px)`,
      top: `calc(${stop.y}% + ${Math.round(10 + Math.random() * 100)}px)`,
      size: 24 + Math.random() * 28,
      floor: false,
      wetAt: null,
      clearAt: 0,
    }));

    steps.push({ kind: "work", at: t, ms: FIRST_JOB_MS, activity: "spray" });
    if (anySprays) patch.forEach((s, i) => (s.wetAt = t + 250 + i * 350));
    t += FIRST_JOB_MS;

    steps.push({ kind: "work", at: t, ms: SECOND_JOB_MS, activity: "wipe" });
    workWindows.push({ at: t, ms: SECOND_JOB_MS });
    patch.forEach((s, i) => (s.clearAt = t + (i + 0.7) * (SECOND_JOB_MS / (count + 0.4))));
    t += SECOND_JOB_MS;
    specks.push(...patch);

    steps.push({ kind: "inspect", at: t, ms: 700 });
    t += 700;
  }

  // Up on the gondola one of them sometimes has a moment while the other
  // keeps working — nobody slips off a platform, though.
  const riderQuirks: Partial<Record<Name, RiderQuirk>> = {};
  for (const r of riders) {
    if (Math.random() > 0.35) continue;
    const options: [Quirk, number][] = [
      ["confused", 30],
      ["sneeze", 24],
      ["yawn", 16],
      ["wave", 22],
      ["dance", 6],
    ];
    if (r.stage1 === "spray") options.push(["backfire", 14]);
    const quirk = weightedPick(options);
    const window = workWindows[Math.floor(Math.random() * workWindows.length)];
    const ms = Math.min(QUIRK_MS[quirk], window.ms - 200);
    riderQuirks[r.name] = { quirk, at: window.at + Math.random() * (window.ms - ms), ms };
  }

  return { riders, entryX, steps, endAt: t, riderQuirks };
}

interface RoundPlan {
  floor: FloorActor[];
  gondola: GondolaActor | null;
  dust: DustSpeck[];
  cheerStyle: CheerStyle;
  confetti: boolean;
  moonwalk: boolean;
  endAt: number;
  cast: Name[];
}

// Who turns up and what happens this round: one, two, three, or all four
// of them. With three or more, two take the gondola (never the one lugging
// the mop bucket) and the rest work the floor.
function planRound(exclude: Name[]): RoundPlan {
  const available = ALL_NAMES.filter((n) => !exclude.includes(n)).sort(() => Math.random() - 0.5);
  // The full crew is the less common case, so there's usually someone free
  // to run and pull a card's lever when a new complaint comes in.
  const size = Math.min(
    available.length,
    Number(
      weightedPick<"1" | "2" | "3" | "4">([
        ["1", 25],
        ["2", 30],
        ["3", 30],
        ["4", 15],
      ])
    )
  );
  const cast = available.slice(0, size);

  const riderNames =
    size >= 3 ? (["yellow", "black", "purple"] as Name[]).filter((n) => cast.includes(n)).slice(0, 2) : [];
  const floorNames = cast.filter((n) => !riderNames.includes(n));

  const dust: DustSpeck[] = [];
  const withGondola = riderNames.length > 0;
  // Splits the width of the screen between the floor workers.
  const stopsFor = (i: number): number[] => {
    if (floorNames.length === 1) return withGondola ? [18, 50, 82] : [20, 50, 80];
    return i === 0 ? [12, 30, 46] : [58, 74, 90];
  };
  const floor = floorNames.map((n, i) => buildFloorScript(CHARACTERS[n], 60 + i * 700, stopsFor(i), dust));
  const gondola = withGondola ? buildGondolaScript(riderNames.map((n) => CHARACTERS[n]), 60, dust) : null;

  // Everyone waits for the slowest to finish, celebrates together, then
  // they head off one by one.
  const actors: { steps: Step[]; endAt: number; isGondola: boolean; x: number }[] = [
    ...floor.map((a) => ({ steps: a.steps, endAt: a.endAt, isGondola: false, x: 0 })),
    ...(gondola ? [{ steps: gondola.steps, endAt: gondola.endAt, isGondola: true, x: 0 }] : []),
  ];
  const cheerAt = Math.max(...actors.map((a) => a.endAt)) + 300;
  let endAt = 0;
  actors.forEach((a, i) => {
    if (cheerAt > a.endAt) a.steps.push({ kind: "wait", at: a.endAt, ms: cheerAt - a.endAt });
    a.steps.push({ kind: "cheer", at: cheerAt, ms: CHEER_MS });
    const leaveAt = cheerAt + CHEER_MS + i * 450;
    const lastWalk = [...a.steps].reverse().find((s) => s.kind === "walk") as Extract<Step, { kind: "walk" }>;
    const leave: Extract<Step, { kind: "walk" }> = a.isGondola
      ? { kind: "walk", at: leaveAt, ms: 2600, x: lastWalk.x, top: GONDOLA_OFFSCREEN }
      : { kind: "walk", at: leaveAt, ms: walkMs(lastWalk.x, 112), x: 112 };
    a.steps.push(leave);
    a.steps.push({ kind: "gone", at: leave.at + leave.ms, ms: 0 });
    endAt = Math.max(endAt, leave.at + leave.ms);
  });

  return {
    floor,
    gondola,
    dust,
    cheerStyle: weightedPick<CheerStyle>([
      ["nod", 45],
      ["wave", 25],
      ["bow", 16],
      ["jump", 14],
    ]),
    confetti: Math.random() < 0.12,
    moonwalk: Math.random() < 0.1,
    endAt,
    cast,
  };
}

// Plays a script: the index of the step currently under way (-1 before
// the first one starts).
function useStepIndex(steps: Step[]) {
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    const timers = steps.map((s, i) => setTimeout(() => setIndex(i), s.at));
    return () => timers.forEach(clearTimeout);
  }, [steps]);
  return index;
}

// Whether a one-off timed moment is currently playing.
function useActiveWindow(at: number | null, ms: number) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (at === null) return;
    const start = setTimeout(() => setActive(true), at);
    const stop = setTimeout(() => setActive(false), at + ms);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [at, ms]);
  return active;
}

// Where the actor is (or is heading) as of the current step.
function positionAt(steps: Step[], index: number, entry: { x: number; top?: string }) {
  let x = entry.x;
  let top = entry.top;
  let fromX = entry.x;
  for (let i = 0; i <= index && i < steps.length; i++) {
    const s = steps[i];
    if (s.kind === "walk") {
      fromX = x;
      x = s.x;
      top = s.top ?? top;
    }
  }
  return { x, top, dir: Math.sign(x - fromX) };
}

// ============================================================ gear

function SprayBottle() {
  return (
    <svg width="40" height="50" viewBox="0 -4 40 50" aria-hidden="true">
      <rect x="10" y="16" width="20" height="28" rx="5" fill="#5fb3e0" />
      <rect x="13" y="22" width="5" height="16" rx="2.5" fill="#ffffff" opacity="0.45" />
      <rect x="14" y="6" width="9" height="12" rx="2" fill="#e4e9f2" />
      <rect x="17" y="-2" width="16" height="7" rx="2.5" fill="#e4e9f2" transform="rotate(20 17 -2)" />
      <path d="M22,10 L16,20" stroke="#c3cad8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Cloth() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" aria-hidden="true">
      <path d="M3,4 Q18,-1 33,4 L31,24 Q18,29 5,24 Z" fill="#f5b942" />
      <path d="M8,10 Q18,7 28,10 M8,17 Q18,14 28,17" stroke="#ffffff" strokeWidth="2" fill="none" opacity="0.6" />
    </svg>
  );
}

function Mop() {
  return (
    <svg width="30" height="90" viewBox="0 0 30 90" aria-hidden="true">
      <path d="M15,0 L15,66" stroke="#b07d4f" strokeWidth="4" strokeLinecap="round" />
      <rect x="6" y="62" width="18" height="6" rx="2" fill="#8d97aa" />
      <g stroke="#e9edf5" strokeWidth="4.5" strokeLinecap="round">
        <path d="M8,68 L3,86" />
        <path d="M12,68 L10,88" />
        <path d="M15,68 L15,88" />
        <path d="M18,68 L20,88" />
        <path d="M22,68 L27,86" />
      </g>
    </svg>
  );
}

function Bucket() {
  return (
    <svg width="48" height="54" viewBox="0 -10 48 54" aria-hidden="true">
      <path d="M12,6 C12,-10 36,-10 36,6" fill="none" stroke="#9aa3b5" strokeWidth="3" />
      <path d="M6,8 L42,8 L36,42 L12,42 Z" fill="#e0564f" />
      <path d="M9,17 L39,17" stroke="#ffffff" strokeWidth="2" opacity="0.35" />
      <ellipse cx="24" cy="9" rx="17" ry="3.5" fill="#7cc7f0" />
    </svg>
  );
}

// A floating cartoon hand — no arms, Rayman-style, which keeps the blob
// silhouettes simple while still making it obvious who's holding what.
function Hand({ color, x, y }: { color: string; x: number; y: number }) {
  return (
    <div
      className="absolute rounded-full"
      style={{
        left: x - 7,
        top: y - 7,
        width: 14,
        height: 14,
        backgroundColor: color,
        boxShadow: "inset -2px -2px 0 rgba(0,0,0,0.18), 0 0 0 1.5px rgba(0,0,0,0.12)",
      }}
    />
  );
}

// Mist from the nozzle — puffs timed to the three squeezes in each
// crew-squeeze cycle, then a pause, like someone actually aiming and
// spraying rather than a continuous jet.
function Mist({ toward = 1 }: { toward?: 1 | -1 }) {
  const puffs = [
    { mx: 54, my: -52, delay: "0ms", size: 16 },
    { mx: 64, my: -38, delay: "300ms", size: 13 },
    { mx: 46, my: -64, delay: "600ms", size: 14 },
  ];
  return (
    <>
      {puffs.map((p, i) => (
        <span
          key={i}
          className="crew-mist absolute rounded-full"
          style={
            {
              left: toward === 1 ? 26 : -8,
              top: -8,
              width: p.size,
              height: p.size,
              background: "radial-gradient(circle, rgba(150,210,255,0.95), rgba(150,210,255,0))",
              animationDelay: p.delay,
              "--mx": `${p.mx * toward}px`,
              "--my": `${p.my}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

// Droplets flicking up off the mop as it comes out of the bucket.
function Drips() {
  return (
    <>
      {["-14px", "10px", "-4px", "16px"].map((dx, i) => (
        <span
          key={i}
          className="crew-drip absolute rounded-full"
          style={
            {
              left: 18,
              top: 4,
              width: 7,
              height: 9,
              backgroundColor: "#7cc7f0",
              animationDelay: `${i * 70}ms`,
              "--dx": dx,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

// ============================================================ face

type Expression = "walk" | "focus" | "look" | "content" | "yeah" | "confused" | "squeeze" | "yawn" | "dizzy";

function Eye({
  size,
  expression,
  color,
  blinkDelay,
  flip,
}: {
  size: number;
  expression: Expression;
  color: string;
  blinkDelay: string;
  flip: boolean;
}) {
  // Happy "^" arches for celebrating.
  if (expression === "yeah") {
    return (
      <div
        style={{
          width: size,
          height: size / 2,
          marginTop: size * 0.3,
          border: "3px solid #2D2D2D",
          borderBottom: "none",
          borderRadius: `${size}px ${size}px 0 0`,
        }}
      />
    );
  }
  // Closed "‿" eyes mid-yawn.
  if (expression === "yawn") {
    return (
      <div
        style={{
          width: size,
          height: size / 2,
          border: "3px solid #2D2D2D",
          borderTop: "none",
          borderRadius: `0 0 ${size}px ${size}px`,
        }}
      />
    );
  }
  // Scrunched ">" "<" eyes (sneeze, spray in the face), "×" seeing stars.
  if (expression === "squeeze" || expression === "dizzy") {
    return (
      <div
        className="flex items-center justify-center font-black text-[#2D2D2D]"
        style={{ width: size, height: size, fontSize: size * 1.25, lineHeight: 1 }}
      >
        {expression === "dizzy" ? "×" : flip ? "<" : ">"}
      </div>
    );
  }
  const pupil = size * 0.46;
  // Working: eyes down on the job. Inspecting: at the patch they just
  // cleaned. Confused: rolled up, thinking. Walking: ahead, with the odd
  // glance round at whoever's watching (crew-glance).
  const look =
    expression === "focus"
      ? { x: size * 0.18, y: size * 0.16 }
      : expression === "look"
        ? { x: size * 0.2, y: -size * 0.1 }
        : expression === "confused"
          ? { x: -size * 0.12, y: -size * 0.2 }
          : { x: 0, y: 0 };
  return (
    <div
      className="animate-idle-blink relative flex items-center justify-center overflow-hidden rounded-full bg-white"
      style={{ width: size, height: size, animationDelay: blinkDelay }}
    >
      <div
        className={`rounded-full ${expression === "walk" ? "crew-glance" : ""}`}
        style={{
          width: pupil,
          height: pupil,
          backgroundColor: "#2D2D2D",
          transform: expression === "walk" ? undefined : `translate(${look.x}px, ${look.y}px)`,
          transition: "transform 300ms ease-out",
        }}
      />
      {/* Concentrating: heavy upper lids, half-shut. */}
      {expression === "focus" && (
        <div className="absolute inset-x-0 top-0" style={{ height: "40%", backgroundColor: color }} />
      )}
    </div>
  );
}

function Mouth({ width, expression }: { width: number; expression: Expression }) {
  if (expression === "yeah") {
    const w = width * 0.4;
    const h = width * 0.22;
    return (
      <div
        className="relative overflow-hidden"
        style={{ width: w, height: h, backgroundColor: "#8e1f1a", borderRadius: `4px 4px ${w}px ${w}px` }}
      >
        <div className="absolute inset-x-0 top-0 bg-white" style={{ height: h * 0.24 }} />
        <div
          className="absolute rounded-full"
          style={{ left: w * 0.2, right: w * 0.2, bottom: -h * 0.2, height: h * 0.6, backgroundColor: "#ff7a7a" }}
        />
      </div>
    );
  }
  if (expression === "yawn") {
    return <div className="crew-yawn rounded-full" style={{ width: width * 0.2, height: width * 0.26, backgroundColor: "#8e1f1a" }} />;
  }
  if (expression === "squeeze") {
    return <div className="rounded-full" style={{ width: 10, height: 10, border: "3px solid #d1453b" }} />;
  }
  if (expression === "confused" || expression === "dizzy") {
    return (
      <svg width={width * 0.3} height="10" viewBox="0 0 30 10" aria-hidden="true">
        <path d="M2,5 Q6,1 10,5 T18,5 T26,5" stroke="#d1453b" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (expression === "focus") {
    // Lips pressed together in concentration.
    return <div className="rounded-full bg-[#d1453b]" style={{ width: width * 0.14, height: 4 }} />;
  }
  // The classic thin red smile arc — wider when pleased with their work.
  const w = width * (expression === "content" ? 0.34 : 0.26);
  return <div style={{ width: w, height: w * 0.42, borderBottom: "4px solid #d1453b", borderRadius: `0 0 ${w}px ${w}px` }} />;
}

function Face({ character, expression }: { character: Character; expression: Expression }) {
  const { width, height, color, blinkDelay } = character;
  const eyeSize = Math.min(width * 0.17, 16);
  const eyesTop = height * (height > width ? 0.2 : 0.3);
  return (
    // backface-visibility hides the face while the body is spun round to
    // its back during a (rare) celebration spin.
    <div className="absolute inset-x-0 top-0 flex flex-col items-center" style={{ paddingTop: eyesTop, backfaceVisibility: "hidden" }}>
      {expression === "confused" && (
        <div
          className="absolute rounded-full bg-[#2D2D2D]"
          style={{ top: eyesTop - 8, left: width / 2 + width * 0.06, width: eyeSize, height: 3, transform: "rotate(-14deg)" }}
        />
      )}
      <div className="flex items-start" style={{ gap: width * 0.12, height: eyeSize }}>
        <Eye size={eyeSize} expression={expression} color={color} blinkDelay={blinkDelay} flip={false} />
        <Eye size={eyeSize} expression={expression} color={color} blinkDelay={blinkDelay} flip />
      </div>
      <div className="relative" style={{ marginTop: width * 0.07 }}>
        {(expression === "yeah" || expression === "content") && (
          <>
            {/* Rosy cheeks when they're pleased. */}
            <div className="absolute rounded-full bg-[#ff8fa3]/50" style={{ width: 10, height: 6, top: 0, right: width * 0.26 }} />
            <div className="absolute rounded-full bg-[#ff8fa3]/50" style={{ width: 10, height: 6, top: 0, left: width * 0.26 }} />
          </>
        )}
        <Mouth width={width} expression={expression} />
      </div>
    </div>
  );
}

// ============================================================ gear by mode

type Mode = Activity | "carry" | "raise" | "scratch" | "hi" | "brow" | "backfire" | "none";

function Gear({ character, mode, bucketDown }: { character: Character; mode: Mode; bucketDown: boolean }) {
  const { width, height, color, stage1, stage2 } = character;
  if (mode === "none") return null;
  const rootHeight = height + FOOT;
  const handX = width - 8;
  const handY = height * 0.45;
  const hasBucket = stage1 === "dunk" || stage2 === "dunk";

  let held: React.ReactNode = null;
  if (mode === "dunk") {
    // Mop plunged into the bucket, wrung, lifted — flicking water out.
    held = (
      <div className="absolute" style={{ left: width + 15, top: rootHeight - 114 }}>
        <div className="crew-mop-dunk relative">
          <Mop />
          <Hand color={color} x={15} y={40} />
        </div>
      </div>
    );
  } else if (mode === "mopFloor") {
    // Mop head on the floor, pushed side to side from the grip.
    held = (
      <div className="absolute" style={{ left: width - 6, top: rootHeight - 88 }}>
        <div className="crew-mop-swing relative" style={{ transformOrigin: "15px 26px" }}>
          <Mop />
          <Hand color={color} x={15} y={26} />
        </div>
      </div>
    );
  } else if (mode === "backfire") {
    // Nozzle turned the wrong way round — straight in their own face.
    held = (
      <div className="absolute" style={{ left: width * 0.78, top: height * 0.12 }}>
        <div className="crew-squeeze relative" style={{ transform: "scaleX(-1)", transformOrigin: "0px 0px" }}>
          <div className="absolute" style={{ left: -18, top: -22 }}>
            <SprayBottle />
          </div>
          <div className="absolute" style={{ left: 0, top: -22 }}>
            <Mist />
          </div>
          <Hand color={color} x={0} y={0} />
        </div>
      </div>
    );
  } else {
    const tool = mode === "raise" ? stage2 : stage1;
    const isSpray = tool === "spray";
    const isMop = tool === "dunk" || tool === "mopFloor";
    let wrapperClass = "";
    let wrapperStyle: React.CSSProperties = {};
    if (mode === "spray") {
      wrapperClass = "crew-squeeze";
      wrapperStyle = { transformOrigin: "0px 0px" };
    } else if (mode === "wipe") {
      wrapperClass = "crew-wipe-arc";
    } else if (mode === "polish") {
      wrapperClass = "crew-polish";
    } else if (mode === "raise") {
      wrapperClass = "crew-raise";
    } else {
      // Carrying (or busy with something else): held low at their side.
      wrapperStyle = { transform: isSpray ? "rotate(12deg)" : "rotate(24deg) translateY(4px)" };
    }
    held = (
      <div className="absolute" style={{ left: handX, top: handY }}>
        <div className={`relative ${wrapperClass}`} style={wrapperStyle}>
          {isSpray ? (
            <div className="absolute" style={{ left: -18, top: -22 }}>
              <SprayBottle />
            </div>
          ) : isMop ? (
            <div className="absolute" style={{ left: -15, top: -30 }}>
              <Mop />
            </div>
          ) : (
            <div className="absolute" style={{ left: -18, top: -14 }}>
              <Cloth />
            </div>
          )}
          {mode === "spray" && (
            <div className="absolute" style={{ left: 0, top: -22 }}>
              <Mist />
            </div>
          )}
          <Hand color={color} x={0} y={0} />
        </div>
      </div>
    );
  }

  return (
    <>
      {hasBucket &&
        (bucketDown ? (
          <div className="absolute" style={{ left: width + 6, bottom: -2 }}>
            <Bucket />
            {mode === "dunk" && (
              <div className="absolute" style={{ left: 0, top: 0 }}>
                <Drips />
              </div>
            )}
          </div>
        ) : (
          <div className="absolute" style={{ left: -34, top: height * 0.4 }}>
            <div style={{ transform: "rotate(-6deg)" }}>
              <Bucket />
            </div>
            <Hand color={color} x={24} y={-4} />
          </div>
        ))}
      {held}
      {/* The free hand: scratching their head, waving hello, or wiping
          their brow after a job well done. */}
      {mode === "scratch" && (
        <div className="crew-scratch absolute" style={{ left: width * 0.3, top: -2 }}>
          <Hand color={color} x={0} y={0} />
        </div>
      )}
      {mode === "hi" && (
        <div className="crew-hi absolute" style={{ left: -10, top: height * 0.25, transformOrigin: "0px 24px" }}>
          <Hand color={color} x={0} y={0} />
        </div>
      )}
      {mode === "brow" && (
        <div className="crew-brow absolute" style={{ left: width * 0.28, top: height * 0.14 }}>
          <Hand color={color} x={0} y={0} />
        </div>
      )}
    </>
  );
}

function QuirkOverlay({ character, quirk }: { character: Character; quirk: Quirk }) {
  const { width, height } = character;
  if (quirk === "confused") {
    return (
      <div
        className="crew-pop absolute flex items-center justify-center rounded-full bg-white text-xl font-black text-[#385bc1] shadow-md"
        style={{ left: width * 0.62, top: -44, width: 32, height: 32 }}
      >
        ?
      </div>
    );
  }
  if (quirk === "sneeze") {
    return (
      <>
        {[
          { x: 18, y: -6, s: 22 },
          { x: 34, y: 4, s: 16 },
          { x: 26, y: 16, s: 18 },
        ].map((p, i) => (
          <span
            key={i}
            className="crew-puff absolute rounded-full"
            style={{
              left: width * 0.62 + p.x,
              top: height * 0.35 + p.y,
              width: p.s,
              height: p.s,
              background: "radial-gradient(circle, rgba(150,138,118,0.7), rgba(150,138,118,0))",
              animationDelay: `${650 + i * 60}ms`,
            }}
          />
        ))}
      </>
    );
  }
  if (quirk === "backfire") {
    // Water dripping down their face.
    return (
      <>
        {[0.34, 0.5, 0.64].map((x, i) => (
          <span
            key={i}
            className="crew-face-drip absolute rounded-full bg-[#7cc7f0]"
            style={{ left: width * x, top: height * 0.3, width: 6, height: 8, animationDelay: `${500 + i * 180}ms` }}
          />
        ))}
      </>
    );
  }
  if (quirk === "dance") {
    return (
      <>
        {["♪", "♫", "♪"].map((note, i) => (
          <span
            key={i}
            className="crew-note absolute font-bold text-[#385bc1]"
            style={{ left: width * (0.2 + i * 0.3), top: -18, fontSize: 18, animationDelay: `${i * 350}ms` }}
          >
            {note}
          </span>
        ))}
      </>
    );
  }
  if (quirk === "slip") {
    return (
      <div className="absolute" style={{ left: width / 2 - 22, top: -26, width: 44, height: 20 }}>
        <div className="crew-orbit relative h-full w-full">
          {[0, 1, 2].map((i) => (
            <span key={i} className="absolute text-sm text-[#f2b632]" style={{ left: [0, 18, 34][i], top: [8, -2, 8][i] }}>
              ✦
            </span>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

// ============================================================ figure

interface Pose {
  mode: Mode;
  expression: Expression;
  bodyClass: string;
  spin: boolean;
  walking: boolean;
  facing: number;
  bucketDown: boolean;
  quirk: Quirk | null;
}

function quirkPose(quirk: Quirk): Pose {
  const base: Pose = {
    mode: "carry",
    expression: "content",
    bodyClass: "",
    spin: false,
    walking: false,
    facing: 0,
    bucketDown: true,
    quirk,
  };
  switch (quirk) {
    case "confused":
      return { ...base, mode: "scratch", expression: "confused", bodyClass: "crew-tilt" };
    case "sneeze":
      return { ...base, expression: "squeeze", bodyClass: "crew-sneeze" };
    case "yawn":
      return { ...base, expression: "yawn", bodyClass: "crew-stretch" };
    case "wave":
      return { ...base, mode: "hi", expression: "content" };
    case "dance":
      return { ...base, expression: "yeah", bodyClass: "crew-dance" };
    case "slip":
      return { ...base, expression: "dizzy", bodyClass: "crew-slip" };
    case "backfire":
      return { ...base, mode: "backfire", expression: "squeeze", bodyClass: "crew-sneeze" };
  }
}

function poseFor(step: Step | undefined, cheerStyle: CheerStyle, dir: number, moonwalk: boolean): Pose {
  const base: Pose = {
    mode: "carry",
    expression: "content",
    bodyClass: "crew-idle",
    spin: false,
    walking: false,
    facing: 0,
    bucketDown: true,
    quirk: null,
  };
  if (!step) return { ...base, bucketDown: false };
  switch (step.kind) {
    case "walk":
      return {
        ...base,
        expression: "walk",
        bodyClass: "crew-waddle",
        walking: true,
        // Turned three-quarters toward where they're heading — or, on a
        // rare moonwalk exit, gliding forward while facing backward.
        facing: (dir >= 0 ? -30 : 30) * (moonwalk ? -1 : 1),
        bucketDown: false,
      };
    case "work":
      return { ...base, mode: step.activity, expression: "focus", bodyClass: "crew-work" };
    case "inspect":
      // Step back, look over the spot just cleaned, a satisfied nod.
      return { ...base, expression: "look", bodyClass: "crew-nod" };
    case "quirk":
      return quirkPose(step.quirk);
    case "pull":
      return { ...base, mode: "none", expression: "focus", bodyClass: "crew-pull" };
    case "cheer":
      if (cheerStyle === "jump") return { ...base, mode: "raise", expression: "yeah", bodyClass: "crew-jump", spin: true };
      if (cheerStyle === "bow") return { ...base, expression: "content", bodyClass: "crew-bow" };
      if (cheerStyle === "wave") return { ...base, mode: "hi", expression: "yeah", bodyClass: "" };
      return { ...base, mode: "brow", expression: "content", bodyClass: "crew-nod" };
    default:
      return base;
  }
}

function Figure({ character, pose }: { character: Character; pose: Pose }) {
  const { color, width, height } = character;
  return (
    <div className="relative" style={{ width }}>
      {/* Ground shadow — shrinks while they're up in the air. */}
      <div
        className={`absolute rounded-full bg-black/15 ${pose.spin ? "crew-shadow-jump" : ""}`}
        style={{ left: width * 0.05, bottom: -5, width: width * 0.9, height: 10 }}
      />
      <div style={{ perspective: 700 }}>
        <div
          className={pose.spin ? "crew-spin" : ""}
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateY(${pose.walking ? pose.facing : 0}deg)`,
            transition: "transform 450ms ease-out",
          }}
        >
          <div className={`relative ${pose.bodyClass}`} style={{ width, height: height + FOOT, transformOrigin: "bottom center" }}>
            {[0.2, 0.56].map((x, i) => (
              <div
                key={i}
                className={`absolute rounded-full ${pose.walking ? "crew-step" : ""}`}
                style={{
                  left: width * x,
                  bottom: 0,
                  width: width * 0.24,
                  height: FOOT + 5,
                  backgroundColor: color,
                  filter: "brightness(0.72)",
                  animationDelay: i === 0 ? "0ms" : "450ms",
                }}
              />
            ))}
            {/* The blob itself: glossy highlight top-left, shading
                bottom-right, and a slow jelly wobble between two
                outlines so it never sits perfectly still. */}
            <div
              className="crew-jelly absolute inset-x-0 top-0"
              style={
                {
                  height,
                  background: `radial-gradient(circle at 32% 24%, rgba(255,255,255,0.4), rgba(255,255,255,0) 40%), radial-gradient(circle at 72% 88%, rgba(0,0,0,0.24), rgba(0,0,0,0) 55%), ${color}`,
                  borderRadius: character.blobA,
                  "--blob-a": character.blobA,
                  "--blob-b": character.blobB,
                } as React.CSSProperties
              }
            />
            <Face character={character} expression={pose.expression} />
            <Gear character={character} mode={pose.mode} bucketDown={pose.bucketDown} />
            {pose.quirk && <QuirkOverlay character={character} quirk={pose.quirk} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================ actors

function FloorWorker({ actor, cheerStyle, moonwalk }: { actor: FloorActor; cheerStyle: CheerStyle; moonwalk: boolean }) {
  const index = useStepIndex(actor.steps);
  const step = actor.steps[index];
  if (step?.kind === "gone") return null;
  const { x, dir } = positionAt(actor.steps, index, { x: actor.entryX });
  const isLeaving = step?.kind === "walk" && index === actor.steps.length - 2;
  return (
    <div
      className="absolute"
      style={{
        left: `${x}%`,
        bottom: 8,
        zIndex: 3,
        transition: step?.kind === "walk" ? `left ${step.ms}ms cubic-bezier(0.4, 0.1, 0.4, 0.95)` : "none",
      }}
    >
      <div style={{ marginLeft: -actor.character.width / 2 }}>
        <Figure character={actor.character} pose={poseFor(step, cheerStyle, dir, moonwalk && isLeaving)} />
      </div>
    </div>
  );
}

function GondolaRider({
  character,
  step,
  quirk,
  cheerStyle,
}: {
  character: Character;
  step: Step | undefined;
  quirk: RiderQuirk | undefined;
  cheerStyle: CheerStyle;
}) {
  const quirkActive = useActiveWindow(quirk ? quirk.at : null, quirk ? quirk.ms : 0);
  let pose: Pose;
  if (quirkActive && quirk && step?.kind === "work") {
    pose = quirkPose(quirk.quirk);
  } else if (step?.kind === "walk") {
    // Riding, not walking — just enjoying the view.
    pose = { ...poseFor(undefined, cheerStyle, 0, false), expression: "walk", bodyClass: "crew-idle" };
  } else if (step?.kind === "work") {
    // Each rider does their own part of the job: the one with the bottle
    // sprays first while the other gets a head start wiping.
    pose = poseFor(
      { ...step, activity: step.activity === "spray" ? character.stage1 : character.stage2 },
      cheerStyle,
      0,
      false
    );
  } else {
    pose = poseFor(step, cheerStyle, 0, false);
  }
  return (
    <div style={{ transform: "scale(0.85)", transformOrigin: "bottom center" }}>
      <Figure character={character} pose={{ ...pose, bucketDown: false }} />
    </div>
  );
}

function Gondola({ actor, cheerStyle }: { actor: GondolaActor; cheerStyle: CheerStyle }) {
  const index = useStepIndex(actor.steps);
  const step = actor.steps[index];
  if (step?.kind === "gone") return null;
  const { x, top } = positionAt(actor.steps, index, { x: actor.entryX, top: GONDOLA_OFFSCREEN });
  const ease = "cubic-bezier(0.45, 0.05, 0.4, 1)";
  return (
    <div
      className="absolute"
      style={{
        left: `${x}%`,
        top,
        width: GONDOLA_WIDTH,
        marginLeft: -GONDOLA_WIDTH / 2,
        zIndex: 2,
        transition: step?.kind === "walk" ? `left ${step.ms}ms ${ease}, top ${step.ms}ms ${ease}` : "none",
      }}
    >
      {/* A gentle swing on the ropes, pivoting from way up at the anchors. */}
      <div className="crew-sway relative" style={{ transformOrigin: "50% -600px" }}>
        {[10, GONDOLA_WIDTH - 12].map((rx) => (
          <div key={rx} className="absolute bg-[#8a93a6]" style={{ left: rx, bottom: 52, width: 2, height: 3000 }} />
        ))}
        <div className="flex items-end justify-center gap-5" style={{ paddingBottom: 16 }}>
          {actor.riders.map((c) => (
            <GondolaRider key={c.name} character={c} step={step} quirk={actor.riderQuirks[c.name]} cheerStyle={cheerStyle} />
          ))}
        </div>
        {/* Safety rail in front of their feet, then the platform. */}
        <div
          className="absolute inset-x-0"
          style={{ bottom: 16, height: 38, border: "4px solid #9aa3b5", borderBottom: "none", borderRadius: "4px 4px 0 0" }}
        >
          <div className="absolute inset-x-0 bg-[#9aa3b5]" style={{ top: 15, height: 3 }} />
        </div>
        <div
          className="absolute rounded-md"
          style={{
            left: -6,
            right: -6,
            bottom: 0,
            height: 18,
            background: "linear-gradient(#cfd5df, #8e97a8)",
            boxShadow: "0 6px 14px rgba(0,0,0,0.18)",
          }}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ lever jobs

// When a stat card's number changes while they're on screen, one of the
// crew walks over underneath it, a lever pops up out of the floor wired to
// the card, they haul on it, a spark runs up the cable, and the card flips
// over to the new number.
const LEVER_PULL_MS = 1900;

function LeverJob({ job, character, onGone }: { job: CardJob; character: Character; onGone: () => void }) {
  // Measured once when they set off — where the card is on screen.
  const [target] = useState(() => {
    const el = document.querySelector(`[data-crew-card="${job.key}"]`);
    const rect = el?.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!rect) return null;
    const cardX = ((rect.left + rect.width / 2) / vw) * 100;
    const entryX = cardX < 50 ? -12 : 112;
    // They stand just to the side of the lever, on the side they came from.
    const standOffsetPx = (character.width / 2 + 34) * (entryX < 0 ? -1 : 1);
    const standX = cardX + (standOffsetPx / vw) * 100;
    const leverHeight = Math.max(42, character.height * 0.5);
    const cableBottom = 8 + leverHeight;
    const cableHeight = Math.max(0, vh - rect.bottom - cableBottom);
    return { cardX, entryX, standX, side: entryX < 0 ? 1 : -1, leverHeight, cableBottom, cableHeight };
  });
  const [steps] = useState<Step[]>(() => {
    if (!target) return [{ kind: "gone", at: 0, ms: 0 }];
    const inMs = walkMs(target.entryX, target.standX);
    const pullAt = 60 + inMs;
    const cheerAt = pullAt + LEVER_PULL_MS;
    const outAt = cheerAt + 1400;
    const outMs = walkMs(target.standX, target.entryX);
    return [
      { kind: "walk", at: 60, ms: inMs, x: target.standX },
      { kind: "pull", at: pullAt, ms: LEVER_PULL_MS },
      { kind: "cheer", at: cheerAt, ms: 1400 },
      { kind: "walk", at: outAt, ms: outMs, x: target.entryX },
      { kind: "gone", at: outAt + outMs, ms: 0 },
    ];
  });
  const index = useStepIndex(steps);
  const step = steps[index];

  useEffect(() => {
    const pull = steps.find((s) => s.kind === "pull");
    const gone = steps.find((s) => s.kind === "gone");
    // The number flips the moment the spark reaches the card.
    const deliver = setTimeout(() => crewCards.complete(job.id), pull ? pull.at + 1500 : 0);
    const done = setTimeout(onGone, gone ? gone.at + 50 : 0);
    return () => {
      clearTimeout(deliver);
      clearTimeout(done);
    };
  }, [steps, job.id, onGone]);

  if (!target || step?.kind === "gone") return null;
  const { x, dir } = positionAt(steps, index, { x: target.entryX });
  const pulling = step?.kind === "pull";
  const showLever = step?.kind === "pull" || step?.kind === "cheer";
  // The lever leans away from them, and they haul it back toward themselves.
  const handleFrom = 35 * target.side;
  const handleTo = -35 * target.side;

  return (
    <>
      {showLever && (
        <div className="absolute" style={{ left: `${target.cardX}%`, bottom: 8, zIndex: 2 }}>
          <div className="crew-lever-rise relative" style={{ marginLeft: -9, width: 18, height: target.leverHeight }}>
            {/* Cable from the lever up to the card, with the spark. */}
            <div className="absolute bg-[#8a93a6]" style={{ left: 8, bottom: target.leverHeight, width: 2, height: target.cableHeight }}>
              {pulling && (
                <span
                  className="crew-spark absolute rounded-full bg-[#f2b632]"
                  style={{ left: -4, width: 10, height: 10, boxShadow: "0 0 10px 3px rgba(242,182,50,0.8)" }}
                />
              )}
            </div>
            <div
              className="absolute inset-0 rounded-t-md"
              style={{ background: "linear-gradient(90deg, #aab2c2, #7d879a)", boxShadow: "0 3px 8px rgba(0,0,0,0.2)" }}
            />
            <div
              className={pulling ? "crew-lever-pull absolute" : "absolute"}
              style={
                {
                  left: 7,
                  bottom: target.leverHeight - 4,
                  width: 4,
                  height: 40,
                  backgroundColor: "#5c6578",
                  borderRadius: 2,
                  transformOrigin: "50% 100%",
                  transform: `rotate(${pulling ? handleFrom : handleTo}deg)`,
                  "--lever-from": `${handleFrom}deg`,
                  "--lever-to": `${handleTo}deg`,
                } as React.CSSProperties
              }
            >
              <span className="absolute rounded-full bg-[#e0564f]" style={{ left: -5, top: -8, width: 14, height: 14 }} />
              {/* Both hands on the knob while hauling on it. */}
              {pulling && (
                <>
                  <Hand color={character.color} x={2} y={0} />
                  <Hand color={character.color} x={2} y={10} />
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <div
        className="absolute"
        style={{
          left: `${x}%`,
          bottom: 8,
          zIndex: 3,
          transition: step?.kind === "walk" ? `left ${step.ms}ms cubic-bezier(0.4, 0.1, 0.4, 0.95)` : "none",
        }}
      >
        {/* The "!" as they spot the new number and hurry over. */}
        {index === 0 && (
          <div
            className="crew-pop absolute flex items-center justify-center rounded-full bg-white text-lg font-black text-[#e0564f] shadow-md"
            style={{ left: -15, bottom: character.height + 30, width: 30, height: 30 }}
          >
            !
          </div>
        )}
        <div style={{ marginLeft: -character.width / 2, transform: target.side < 0 ? "scaleX(-1)" : undefined }}>
          <Figure
            character={character}
            pose={{
              ...poseFor(step, "wave", target.side < 0 ? -dir : dir, false),
              // No mop bucket or tools for this errand.
              mode: step?.kind === "cheer" ? "hi" : "none",
              bucketDown: false,
            }}
          />
        </div>
      </div>
    </>
  );
}

// ============================================================ dust

function Dust({ speck }: { speck: DustSpeck }) {
  const animations = ["crew-dust-appear 700ms ease-out both"];
  if (speck.wetAt !== null) animations.push(`crew-dust-wet 500ms ease-out ${speck.wetAt}ms forwards`);
  animations.push(`crew-dust-clear 500ms ease-in ${speck.clearAt}ms forwards`);
  const place = { left: speck.left, top: speck.top, bottom: speck.bottom };
  const grime = speck.floor
    ? // A muddy smear on the floor.
      "radial-gradient(ellipse at 40% 50%, rgba(110,92,70,0.45), rgba(110,92,70,0.18) 55%, transparent 72%)"
    : "radial-gradient(circle at 30% 35%, rgba(120,104,84,0.5) 0 12%, transparent 13%), radial-gradient(circle at 70% 60%, rgba(120,104,84,0.45) 0 9%, transparent 10%), radial-gradient(ellipse at center, rgba(128,112,90,0.38), rgba(128,112,90,0.12) 55%, transparent 72%)";
  return (
    <>
      <div
        className="absolute"
        style={{
          ...place,
          width: speck.size,
          height: speck.size * (speck.floor ? 0.4 : 0.8),
          marginLeft: -speck.size / 2,
          background: grime,
          animation: animations.join(", "),
        }}
      />
      <span
        className="absolute"
        style={{
          ...place,
          marginLeft: -9,
          fontSize: 20,
          lineHeight: 1,
          color: "#f2b632",
          textShadow: "0 0 6px rgba(242,182,50,0.6)",
          animation: `crew-sparkle-pop 800ms ease-out ${speck.clearAt + 200}ms both`,
        }}
      >
        ✦
      </span>
    </>
  );
}

// A rare burst of confetti during the celebration.
function Confetti({ at }: { at: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: 40 }, () => ({
      left: Math.random() * 100,
      delay: at + Math.random() * 700,
      ms: 1800 + Math.random() * 1000,
      color: ["#385bc1", "#f2b632", "#e0564f", "#5fb3e0", "#9db8e8"][Math.floor(Math.random() * 5)],
      spin: Math.random() < 0.5 ? -1 : 1,
    }))
  );
  return (
    <>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute"
          style={
            {
              left: `${p.left}%`,
              top: -20,
              width: 8,
              height: 12,
              backgroundColor: p.color,
              borderRadius: 2,
              animation: `crew-confetti ${p.ms}ms ease-in ${p.delay}ms both`,
              "--spin": p.spin,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

// ============================================================ scene

function CleaningRound({ plan, onDone }: { plan: RoundPlan; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, plan.endAt + REST_BETWEEN_ROUNDS_MS);
    return () => clearTimeout(timer);
  }, [plan, onDone]);
  const cheerAt = Math.max(
    ...plan.floor.map((a) => a.steps.find((s) => s.kind === "cheer")?.at ?? 0),
    plan.gondola?.steps.find((s) => s.kind === "cheer")?.at ?? 0
  );
  return (
    <>
      {plan.dust.map((speck, i) => (
        <Dust key={i} speck={speck} />
      ))}
      {plan.gondola && <Gondola actor={plan.gondola} cheerStyle={plan.cheerStyle} />}
      {plan.floor.map((actor) => (
        <FloorWorker key={actor.character.name} actor={actor} cheerStyle={plan.cheerStyle} moonwalk={plan.moonwalk} />
      ))}
      {plan.confetti && <Confetti at={cheerAt} />}
    </>
  );
}

interface Assignment {
  job: CardJob;
  name: Name;
}

interface SceneState {
  round: number;
  plan: RoundPlan;
  assignments: Assignment[];
}

// Hands any unassigned card updates to crew members who aren't busy —
// not in the current cleaning round and not already on another errand.
function assignJobs(assignments: Assignment[], cast: Name[]): Assignment[] {
  const jobs = crewCards.getJobs();
  const taken = new Set<Name>([...cast, ...assignments.map((a) => a.name)]);
  const assigned = new Set(assignments.map((a) => a.job.id));
  let next = assignments;
  for (const job of jobs) {
    if (assigned.has(job.id)) continue;
    const free = ALL_NAMES.find((n) => !taken.has(n));
    if (!free) break;
    taken.add(free);
    next = [...next, { job, name: free }];
  }
  return next;
}

function CleaningScene() {
  const [state, setState] = useState<SceneState>(() => ({ round: 0, plan: planRound([]), assignments: [] }));

  // New card update while they're here -> send someone for the lever.
  useEffect(
    () =>
      crewCards.subscribe(() => {
        setState((s) => {
          const assignments = assignJobs(s.assignments, s.plan.cast);
          return assignments === s.assignments ? s : { ...s, assignments };
        });
      }),
    []
  );

  const nextRound = useCallback(() => {
    setState((s) => {
      // Between rounds everyone's free, so waiting errands go first and the
      // next cleaning round is cast from whoever's left.
      const assignments = assignJobs(s.assignments, []);
      return { round: s.round + 1, plan: planRound(assignments.map((a) => a.name)), assignments };
    });
  }, []);

  const finishJob = useCallback((id: number) => {
    setState((s) => ({ ...s, assignments: s.assignments.filter((a) => a.job.id !== id) }));
  }, []);

  return (
    <>
      <CleaningRound key={state.round} plan={state.plan} onDone={nextRound} />
      {state.assignments.map((a) => (
        <LeverJobSlot key={a.job.id} assignment={a} onFinish={finishJob} />
      ))}
    </>
  );
}

function LeverJobSlot({ assignment, onFinish }: { assignment: Assignment; onFinish: (id: number) => void }) {
  const onGone = useCallback(() => onFinish(assignment.job.id), [onFinish, assignment.job.id]);
  return <LeverJob job={assignment.job} character={CHARACTERS[assignment.name]} onGone={onGone} />;
}

export default function IdleDustWiper() {
  const isIdle = useIdleTimer(IDLE_MS);
  const reducedMotion = useSyncExternalStore(
    () => () => {},
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true
  );
  const onDuty = isIdle && !reducedMotion;

  // While the crew's on screen, stat cards hold their numbers for them to
  // deliver (see crewCards); the moment someone's back, updates go straight
  // through again.
  useEffect(() => {
    crewCards.setOnDuty(onDuty);
  }, [onDuty]);
  useEffect(() => () => crewCards.setOnDuty(false), []);

  if (!onDuty) return null;

  // Portalled straight to <body> — PageTransition wraps every page's
  // content in a `transform`, which makes any `fixed` descendant of it
  // position relative to that wrapper instead of the viewport (a transformed
  // ancestor creates its own containing block for fixed elements).
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <CleaningScene />
    </div>,
    document.body
  );
}
