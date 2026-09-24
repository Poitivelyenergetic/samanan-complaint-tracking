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

// They have no feet, so they hop. Every hop takes the same time and covers
// the same ground, and a trip is always a whole number of hops — so they
// land exactly where they stop instead of gliding the last bit, and the
// ground they cover always matches the hopping.
const HOP_MS = 400;
const WALK_PX_PER_S = 150;
// Hurrying over to pull a card's lever: quicker, flatter hops.
const RUN_HOP_MS = 280;
const RUN_PX_PER_S = 300;
// Gondola travel, in ms per 1% of combined horizontal + vertical distance.
const GONDOLA_MS_PER_PCT = 60;
const FIRST_JOB_MS = 1900;
const SECOND_JOB_MS = 2800;
const INSPECT_MS = 1000;
const STEP_MOP_MS = 1100;
const CHEER_MS = 2200;
const REST_BETWEEN_ROUNDS_MS = 4000;
// Odds of something going a bit wrong (or just a human moment) at any one
// dirty patch — "sometimes", not every time. Capped per worker per round.
const QUIRK_CHANCE_PER_PATCH = 0.22;
const MAX_QUIRKS_PER_WORKER = 2;
// About one round in three, whoever's on the stairs misses their footing
// on the way up (see addMishap).
const MISHAP_CHANCE = 1 / 3;
const FALL_DROP_MS = 520;
const DANGLE_MS = 1900;
const DANGLE_DROP_MS = 240;
const SCRAMBLE_MS = 520;
// The floor line everyone stands on, in px up from the bottom of the screen.
const FLOOR = 8;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// A trip across the floor from one spot to another (both in % of the screen
// width): how long it takes, rounded to a whole number of hops.
function hopTrip(fromPct: number, toPct: number, vw: number, run = false) {
  const hopMs = run ? RUN_HOP_MS : HOP_MS;
  const perHop = ((run ? RUN_PX_PER_S : WALK_PX_PER_S) * hopMs) / 1000;
  const hops = Math.max(1, Math.round((Math.abs(toPct - fromPct) / 100) * vw / perHop));
  return { ms: hops * hopMs, hopMs };
}

// ============================================================ cast

type Name = "purple" | "black" | "orange" | "yellow";
type Activity = "spray" | "wipe" | "polish" | "dunk" | "mopFloor" | "mopStep";
type Quirk =
  | "confused"
  | "sneeze"
  | "yawn"
  | "wave"
  | "dance"
  | "slip"
  | "backfire"
  // Only ever part of a fall on the stairs, never picked at random.
  | "teeter"
  | "dazed"
  | "phew";
type CheerStyle = "nod" | "wave" | "bow" | "jump";

interface Vec {
  x: number;
  y: number;
}

interface Character {
  name: Name;
  color: string;
  width: number;
  height: number;
  /**
   * "block": the login screen's own flat, square-shouldered shape and face.
   * "blob": a soft rounded one — flat-bottomed, not an egg.
   */
  shape: "block" | "blob";
  radius: string;
  stage1: Activity;
  stage2: Activity;
  blinkDelay: string;
}

// The two tall ones are the login screen's characters shrunk down; the two
// short ones are softer rounded blobs in the same palette.
const CHARACTERS: Record<Name, Character> = {
  purple: {
    name: "purple",
    color: LOGIN_CHARACTER_COLORS.purple,
    width: 58,
    height: 128,
    shape: "block",
    radius: "9px 9px 2px 2px",
    stage1: "spray",
    stage2: "wipe",
    blinkDelay: "0ms",
  },
  black: {
    name: "black",
    // Charcoal in dark mode (see --crew-black), where near-black would
    // vanish into the background.
    color: `var(--crew-black, ${LOGIN_CHARACTER_COLORS.black})`,
    width: 44,
    height: 106,
    shape: "block",
    radius: "7px 7px 2px 2px",
    stage1: "wipe",
    stage2: "polish",
    blinkDelay: "900ms",
  },
  orange: {
    name: "orange",
    color: LOGIN_CHARACTER_COLORS.orange,
    width: 92,
    height: 64,
    shape: "blob",
    radius: "50% 50% 12px 12px / 78% 78% 12px 12px",
    stage1: "dunk",
    stage2: "mopFloor",
    blinkDelay: "2600ms",
  },
  yellow: {
    name: "yellow",
    color: LOGIN_CHARACTER_COLORS.yellow,
    width: 74,
    height: 86,
    shape: "blob",
    radius: "50% 50% 16px 16px / 56% 56% 16px 16px",
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
  teeter: 900,
  dazed: 2100,
  phew: 1000,
};

// Face layout, shared by Face itself and by the scripts working out where
// someone's eyes are when they look at a patch.
const eyeSizeFor = (c: Character) =>
  c.shape === "block" ? Math.round(clamp(c.width * 0.2, 10, 13)) : Math.min(c.width * 0.17, 16);
const eyesTopFor = (c: Character) => c.height * (c.shape === "block" ? 0.12 : 0.3);

// Direction from someone's eyes to a point `ahead` px in front of them (the
// way they face) and `up` px above their feet — unit length, screen-down
// positive, in their own facing frame.
function lookToward(c: Character, ahead: number, up: number): Vec {
  const eyeUp = c.height - eyesTopFor(c) - eyeSizeFor(c) / 2;
  const dy = eyeUp - up;
  const len = Math.hypot(ahead, dy) || 1;
  return { x: ahead / len, y: dy / len };
}

// ============================================================ scripts

// Each actor follows a script of timed steps worked out up front for the
// whole round — hop to a dirty patch, spray it, scrub it until it's gone,
// check it, move on — rather than everyone looping one motion. `x` is in %
// of the screen width, `y` is how far above the floor they're standing (up
// the stairs), in px. `tread` is the step of the stairs they're heading
// for, if any. Falling off (or dropping to hang from the rail) moves them
// too, without turning them round.
type Step =
  | {
      kind: "walk";
      at: number;
      ms: number;
      x: number;
      y?: number;
      top?: string;
      hopMs?: number;
      tread?: number;
      /** Climbing, facing into the stairs — seen from behind. */
      away?: boolean;
    }
  | { kind: "fall"; at: number; ms: number; x: number; y: number }
  | { kind: "dangle"; at: number; ms: number; x: number; y: number }
  | { kind: "work"; at: number; ms: number; activity: Activity; look: Vec }
  | { kind: "inspect"; at: number; ms: number; look: Vec }
  | { kind: "quirk"; at: number; ms: number; quirk: Quirk }
  | { kind: "wait"; at: number; ms: number }
  | { kind: "cheer"; at: number; ms: number }
  | { kind: "pull"; at: number; ms: number }
  | { kind: "gone"; at: number; ms: number };
type WalkStep = Extract<Step, { kind: "walk" }>;

interface DustSpeck {
  left: string;
  top?: string;
  bottom?: number;
  size: number;
  /** Floor grime (muddy smears for the mop) vs. dust on the glass. */
  floor: boolean;
  /** When it shows up — footprints appear as someone treads on a step. */
  appearAt: number;
  /** Footprints on a floating step bob along with it. */
  tread?: number;
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

// Dirty glass within arm's reach of someone standing at `xPct` with their
// feet `y` px up, on the side they face — right where their cloth and spray
// actually go, so looking at the job means looking at the dirt.
function glassPatch(c: Character, xPct: number, y: number, facing: 1 | -1, count: number, scale = 1) {
  const ahead = (c.width / 2 + 26) * scale;
  const up = (c.height * 0.55 + 24) * scale;
  const specks: DustSpeck[] = Array.from({ length: count }, () => {
    const size = 22 + Math.random() * 20;
    return {
      left: `calc(${xPct}% + ${Math.round(facing * (ahead + (Math.random() * 2 - 1) * 18))}px)`,
      bottom: FLOOR + y + up + (Math.random() * 2 - 1) * 18 - size * 0.4,
      size,
      floor: false,
      appearAt: 0,
      wetAt: null,
      clearAt: 0,
    };
  });
  return { specks, look: lookToward(c, ahead, up) };
}

// Muddy smears on the floor just in front of them, where the mop head goes.
function floorPatch(c: Character, xPct: number, facing: 1 | -1, count: number) {
  const ahead = c.width / 2 + 22;
  const specks: DustSpeck[] = Array.from({ length: count }, () => ({
    left: `calc(${xPct}% + ${Math.round(facing * (ahead + (Math.random() * 2 - 1) * 20))}px)`,
    bottom: FLOOR - 4 + Math.random() * 10,
    size: 34 + Math.random() * 20,
    floor: true,
    appearAt: 0,
    wetAt: null,
    clearAt: 0,
  }));
  return { specks, look: lookToward(c, ahead, 0) };
}

// ------------------------------------------------------------ stairs

// A flight of thin floating steps up to a landing, railed up both sides,
// that drops in from above at the start of a round so the floor crew can
// get up to the glass higher up the screen — and gets mopped too,
// footprints and all. The landing is against one side of the screen; the
// foot of the flight faces the open floor.
const STAIR_STEPS = 5;
// The landing at the top, which they walk along to clean a wider stretch
// of glass up there, in step widths.
const LANDING_STEPS = 2.2;
// Each step drops in from above the screen in turn, bottom to top, then the
// landing, each pulling up short at its height; the rails come down onto
// the posts as the landing arrives. At the end it all lifts back up and
// away, rails first.
const STAIR_DROP_STAGGER_MS = 110;
const STAIR_DROP_MS = 700;
const RAIL_DROP_MS = 650;
const STAIR_LIFT_STAGGER_MS = 70;
const STAIR_LIFT_MS = 650;
// Hovering: every step bobs gently, each a little behind the one below, so
// a slow ripple runs up the flight. Whoever's standing on one rides it.
const STEP_BOB_MS = 2800;
const STEP_BOB_LAG_MS = 280;
const STEP_BOB_PX = 5;
const SLAB_THICKNESS = 10;
const SLAB_GAP = 12;
// The steps are drawn in 3D, at an angle: each one's top runs back into
// the screen toward the foot of the flight, so you see its top, its front
// and the end facing down the stairs. How far back the top goes as drawn,
// in px across and up. Everyone stands in the middle of it.
const DEPTH_X = 18;
const DEPTH_Y = 16;
// Handrail height above the steps, and how far in from a step's lower edge
// its posts stand.
const RAIL_H = 58;
const RAIL_THICKNESS = 7;
const POST_INSET = 10;
// Below this the flight and landing don't fit alongside room to work on
// the floor.
const STAIRS_MIN_VW = 900;

interface Stairs {
  /** Which edge of the screen the landing is against. */
  side: "left" | "right";
  /** +1 if going up the stairs means moving right. */
  dirUp: 1 | -1;
  /** px — centre of the floor spot just in front of the first step. */
  footPx: number;
  stepW: number;
  riseH: number;
  /** Steps, not counting the landing. */
  n: number;
  vw: number;
  inAt: number;
  outAt: number;
}

function makeStairs(vw: number, vh: number): Stairs {
  const side = Math.random() < 0.5 ? "left" : "right";
  const n = STAIR_STEPS;
  const stepW = clamp(vw * 0.06, 80, 100);
  const riseH = clamp(vh * 0.068, 42, 58);
  const edge = vw * 0.05;
  const run = (n + 0.5 + LANDING_STEPS) * stepW;
  return {
    side,
    dirUp: side === "left" ? -1 : 1,
    footPx: side === "left" ? edge + run : vw - edge - run,
    stepW,
    riseH,
    n,
    vw,
    inAt: 150,
    outAt: Number.POSITIVE_INFINITY,
  };
}

// Centre of step k (0 = the floor in front of the first step; in between
// for the gaps, and on along the landing past the last step), in px / %.
const stairPx = (s: Stairs, k: number) => s.footPx + s.dirUp * k * s.stepW;
const stairPct = (s: Stairs, k: number) => (stairPx(s, k) / s.vw) * 100;
// The landing is one step up from the last step — its level is also the bob
// anyone standing on it rides. Where it ends, and the two spots along it
// where they stop to work.
const landingLevel = (s: Stairs) => s.n + 1;
const landingEnd = (s: Stairs) => s.n + 0.5 + LANDING_STEPS;
const landingStops = (s: Stairs) => [s.n + 1, s.n + LANDING_STEPS - 0.1];

// A handrail's centre line at step position u: `side` -1 for the near one,
// along the front edge of the steps, +1 for the far one along the back. It
// rises with the flight, then runs level along the landing. x from the
// left, y up from the bottom of the screen, in px.
function railPoint(s: Stairs, u: number, side: 1 | -1) {
  return {
    x: stairPx(s, u) - (side * s.dirUp * DEPTH_X) / 2,
    y: FLOOR + Math.min(u, landingLevel(s)) * s.riseH + (side * DEPTH_Y) / 2 + RAIL_H,
  };
}

// Level k's drop (k = 1..n for the steps, n + 1 for the landing), the
// rails', and when it's all in place to climb.
const stepLandedAt = (s: Stairs, k: number) => s.inAt + (k - 1) * STAIR_DROP_STAGGER_MS + STAIR_DROP_MS;
const railsInAt = (s: Stairs) => stepLandedAt(s, landingLevel(s)) - STAIR_DROP_MS * 0.4;
const stairsReadyAt = (s: Stairs) => railsInAt(s) + RAIL_DROP_MS;
const stepLiftAt = (s: Stairs, k: number) => s.outAt + 150 + (landingLevel(s) - k) * STAIR_LIFT_STAGGER_MS;

// A step's gentle bob. Everything that rides one — the step, its posts,
// footprints on it, whoever's standing on it — runs this same animation
// from the moment the round begins, set to that step's point in the
// ripple, so they all move together.
const stepBob = (k: number) => `crew-step-bob ${STEP_BOB_MS}ms ease-in-out ${-k * STEP_BOB_LAG_MS}ms infinite`;

// One hop per step, from step `from` to step `to` (either way; n + 1 is
// the landing). Going up, they face into the stairs, away from us. Calls
// `landed(k, at)` as they land on each one.
function climb(steps: Step[], s: Stairs, from: number, to: number, t: number, landed?: (k: number, at: number) => void) {
  const dir = Math.sign(to - from);
  if (dir === 0) return t;
  for (let k = from + dir; dir > 0 ? k <= to : k >= to; k += dir) {
    steps.push({
      kind: "walk",
      at: t,
      ms: HOP_MS,
      x: stairPct(s, k),
      y: k * s.riseH,
      hopMs: HOP_MS,
      tread: k || undefined,
      away: dir > 0,
    });
    t += HOP_MS;
    landed?.(k, t);
  }
  return t;
}

// Along the landing, from one spot to another (as step positions).
function alongLanding(steps: Step[], s: Stairs, from: number, to: number, t: number) {
  const level = landingLevel(s);
  const hops = Math.max(1, Math.round((Math.abs(to - from) * s.stepW) / ((WALK_PX_PER_S * HOP_MS) / 1000)));
  steps.push({ kind: "walk", at: t, ms: hops * HOP_MS, x: stairPct(s, to), y: level * s.riseH, hopMs: HOP_MS, tread: level });
  return t + hops * HOP_MS;
}

interface Mishap {
  /** Which step they lose their footing on, on the way up. */
  tread: number;
  /** All the way to the floor, or saved by the rail. */
  fall: boolean;
}

// Missing their footing on step k: a wobble with arms going, then off the
// back of the step into the gap below it. Either they tumble all the way to
// the floor — flat on their back, seeing stars, then back round to the foot
// of the stairs and up again — or they grab the near rail on the way past
// and hang off it, kicking, until they scramble back up. Either way they
// finish back on step k.
function addMishap(steps: Step[], s: Stairs, c: Character, k: number, fall: boolean, t: number, vw: number) {
  steps.push({ kind: "quirk", at: t, ms: QUIRK_MS.teeter, quirk: "teeter" });
  t += QUIRK_MS.teeter;
  const gap = stairPct(s, k - 0.5);
  if (fall) {
    steps.push({ kind: "fall", at: t, ms: FALL_DROP_MS, x: gap, y: 0 });
    t += FALL_DROP_MS;
    steps.push({ kind: "quirk", at: t, ms: QUIRK_MS.dazed, quirk: "dazed" });
    t += QUIRK_MS.dazed;
    t = hopTo(steps, gap, stairPct(s, 0), t, vw);
    return climb(steps, s, 0, k, t);
  }
  // Hanging by their hands (just above their head) from the rail.
  const grip = railPoint(s, k - 0.5, -1);
  const hangY = Math.max(0, grip.y - 6 - c.height - FLOOR);
  steps.push({ kind: "dangle", at: t, ms: DANGLE_MS, x: (grip.x / s.vw) * 100, y: hangY });
  t += DANGLE_MS;
  steps.push({ kind: "walk", at: t, ms: SCRAMBLE_MS, x: stairPct(s, k), y: k * s.riseH, hopMs: SCRAMBLE_MS, tread: k });
  t += SCRAMBLE_MS;
  steps.push({ kind: "quirk", at: t, ms: QUIRK_MS.phew, quirk: "phew" });
  return t + QUIRK_MS.phew;
}

// Up from step `from` to step `to`, missing their footing on the way if
// that's what happens to them this round.
function climbUp(
  steps: Step[],
  s: Stairs,
  c: Character,
  from: number,
  to: number,
  t: number,
  vw: number,
  mishap: Mishap | null,
  landed?: (k: number, at: number) => void
) {
  if (mishap && mishap.tread > from && mishap.tread <= to) {
    t = climb(steps, s, from, mishap.tread, t, landed);
    t = addMishap(steps, s, c, mishap.tread, mishap.fall, t, vw);
    from = mishap.tread;
  }
  return climb(steps, s, from, to, t, landed);
}

// ------------------------------------------------------------ floor actors

interface FloorActor {
  character: Character;
  entryX: number;
  steps: Step[];
  endAt: number;
}

function hopTo(steps: Step[], from: number, to: number, t: number, vw: number) {
  const trip = hopTrip(from, to, vw);
  steps.push({ kind: "walk", at: t, ms: trip.ms, x: to, hopMs: trip.hopMs });
  return t + trip.ms;
}

function waitUntil(steps: Step[], t: number, until: number) {
  if (until <= t) return t;
  steps.push({ kind: "wait", at: t, ms: until - t });
  return until;
}

// A floor worker doing the rounds of their own stretch of floor: at each
// stop, a patch of glass (or floor, for the mop) on the side they're facing.
function buildFloorScript(
  character: Character,
  startAt: number,
  entryX: number,
  stops: number[],
  specks: DustSpeck[],
  vw: number
): FloorActor {
  const steps: Step[] = [];
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
    const facing: 1 | -1 = stop >= x ? 1 : -1;
    t = hopTo(steps, x, stop, t, vw);
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
    const { specks: patch, look } = mopper ? floorPatch(character, stop, facing, count) : glassPatch(character, stop, 0, facing, count);
    // The mop goes in the bucket first — eyes on the bucket, not the floor.
    const firstLook = character.stage1 === "dunk" ? lookToward(character, character.width / 2 + 24, 10) : look;

    // Spraying themselves in the face by accident, then trying again.
    if (q1 === "backfire") {
      steps.push({ kind: "quirk", at: t, ms: QUIRK_MS.backfire, quirk: "backfire" });
      t += QUIRK_MS.backfire;
    }
    steps.push({ kind: "work", at: t, ms: FIRST_JOB_MS, activity: character.stage1, look: firstLook });
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

    steps.push({ kind: "work", at: t, ms: SECOND_JOB_MS, activity: character.stage2, look });
    patch.forEach((s, i) => (s.clearAt = t + (i + 0.7) * (SECOND_JOB_MS / (count + 0.4))));
    t += SECOND_JOB_MS;
    specks.push(...patch);

    steps.push({ kind: "inspect", at: t, ms: INSPECT_MS, look });
    t += INSPECT_MS;
  });

  return { character, entryX, steps, endAt: t };
}

// Up the stairs to clean the glass halfway up, on up to the landing to do
// two stretches along it, then back down and off to one side so the foot
// of the stairs is clear. No ordinary quirks up there — just the odd missed
// footing on the way up.
function buildClimberScript(
  character: Character,
  s: Stairs,
  startAt: number,
  entryX: number,
  specks: DustSpeck[],
  vw: number,
  mishap: Mishap | null
) {
  const steps: Step[] = [];
  const landedAt: number[] = [];
  const landed = (step: number, at: number) => (landedAt[step] ??= at);
  let t = hopTo(steps, entryX, stairPct(s, 0), startAt, vw);
  t = waitUntil(steps, t, stairsReadyAt(s));
  const clean = (u: number, y: number) => {
    const { specks: patch, look } = glassPatch(character, stairPct(s, u), y, s.dirUp, 3);
    steps.push({ kind: "work", at: t, ms: FIRST_JOB_MS, activity: character.stage1, look });
    if (character.stage1 === "spray") patch.forEach((p, i) => (p.wetAt = t + 250 + i * 450));
    t += FIRST_JOB_MS;
    steps.push({ kind: "work", at: t, ms: SECOND_JOB_MS, activity: character.stage2, look });
    patch.forEach((p, i) => (p.clearAt = t + (i + 0.7) * (SECOND_JOB_MS / 3.4)));
    t += SECOND_JOB_MS;
    specks.push(...patch);
    steps.push({ kind: "inspect", at: t, ms: INSPECT_MS, look });
    t += INSPECT_MS;
  };
  const half = Math.ceil(s.n / 2);
  const level = landingLevel(s);
  const [first, second] = landingStops(s);
  t = climbUp(steps, s, character, 0, half, t, vw, mishap, landed);
  clean(half, half * s.riseH);
  t = climbUp(steps, s, character, half, level, t, vw, mishap, landed);
  clean(first, level * s.riseH);
  t = alongLanding(steps, s, first, second, t);
  const secondAt = t;
  clean(second, level * s.riseH);
  t = alongLanding(steps, s, second, first, t);
  t = climb(steps, s, level, 0, t);
  // Three hops out onto the open floor, clearing the way for the mop.
  const clearX = stairPct(s, 0) - s.dirUp * ((3 * WALK_PX_PER_S * HOP_MS) / 1000 / vw) * 100;
  t = hopTo(steps, stairPct(s, 0), clearX, t, vw);
  return { actor: { character, entryX, steps, endAt: t } as FloorActor, landedAt, secondAt, clearAt: t };
}

// The mop's last job of the round: every step, bottom to top, then the two
// spots along the landing, then back down. Footprints go as the mop passes
// over them.
function addStairMopping(
  actor: FloorActor,
  s: Stairs,
  freeAt: number,
  treads: (DustSpeck | null)[],
  landingPrints: DustSpeck[],
  vw: number,
  mishap: Mishap | null
) {
  const { steps, character } = actor;
  const lastWalk = [...steps].reverse().find((st): st is WalkStep => st.kind === "walk");
  let t = hopTo(steps, lastWalk ? lastWalk.x : actor.entryX, stairPct(s, 0), actor.endAt, vw);
  steps.push({ kind: "work", at: t, ms: FIRST_JOB_MS, activity: "dunk", look: lookToward(character, character.width / 2 + 24, 10) });
  t += FIRST_JOB_MS;
  t = waitUntil(steps, t, Math.max(freeAt, stairsReadyAt(s)));
  const down = lookToward(character, 4, 0);
  const mopHere = (speck: DustSpeck | null | undefined) => {
    steps.push({ kind: "work", at: t, ms: STEP_MOP_MS, activity: "mopStep", look: down });
    if (speck) speck.clearAt = t + STEP_MOP_MS * 0.6;
    t += STEP_MOP_MS;
  };
  for (let k = 1; k <= s.n; k++) {
    t = climb(steps, s, k - 1, k, t);
    if (mishap?.tread === k) t = addMishap(steps, s, character, k, mishap.fall, t, vw);
    mopHere(treads[k]);
  }
  const level = landingLevel(s);
  const [first, second] = landingStops(s);
  t = climb(steps, s, s.n, level, t);
  mopHere(landingPrints[0]);
  t = alongLanding(steps, s, first, second, t);
  mopHere(landingPrints[1]);
  t = alongLanding(steps, s, second, first, t);
  t = climb(steps, s, level, 0, t);
  // One hop out onto the floor, next to whoever climbed before them.
  t = hopTo(steps, stairPct(s, 0), stairPct(s, 0) - s.dirUp * ((WALK_PX_PER_S * HOP_MS) / 1000 / vw) * 100, t, vw);
  actor.endAt = t;
}

// ------------------------------------------------------------ gondola

interface GondolaActor {
  riders: Character[];
  entryX: number;
  steps: Step[];
  endAt: number;
  riderQuirks: Partial<Record<Name, RiderQuirk>>;
  riderLooks: Partial<Record<Name, Vec>>;
}

const GONDOLA_WIDTH = 240;
const GONDOLA_OFFSCREEN = "-380px";
const GONDOLA_RIDER_SCALE = 0.85;
const GONDOLA_RIDER_GAP = 20;
const GONDOLA_PADDING = 16;

function buildGondolaScript(riders: Character[], startAt: number, specks: DustSpeck[], stairs: Stairs | null): GondolaActor {
  // A window-washer's route down the glass: across the top, then down into
  // the middle on the side away from the stairs — three patches, so they
  // finish around when the floor crew do.
  const stops = [
    { x: 22, y: 8 },
    { x: 76, y: 10 },
    { x: stairs?.side === "left" ? 66 : stairs ? 34 : 50, y: 34 },
  ];
  const steps: Step[] = [];
  const entryX = stops[0].x;
  let t = startAt;
  let prev: { x: number; y: number } | null = null;
  const workWindows: { at: number; ms: number }[] = [];
  const anySprays = riders.some((r) => r.stage1 === "spray");

  // Each rider cleans the glass by their own hand, not some spot in between.
  const total = riders.reduce((sum, r) => sum + r.width, 0) + GONDOLA_RIDER_GAP * (riders.length - 1);
  const tallest = Math.max(...riders.map((r) => r.height));
  let cursor = -total / 2;
  const riderSpots = riders.map((r) => {
    const center = cursor + r.width / 2;
    cursor += r.width + GONDOLA_RIDER_GAP;
    return { rider: r, center };
  });
  const riderLooks: Partial<Record<Name, Vec>> = {};

  for (const stop of stops) {
    // Lowered in from above the screen first, then along the ropes.
    const ms = prev ? Math.max(1300, (Math.abs(stop.x - prev.x) + Math.abs(stop.y - prev.y)) * GONDOLA_MS_PER_PCT) : 2800;
    steps.push({ kind: "walk", at: t, ms, x: stop.x, top: `${stop.y}%` });
    t += ms;
    prev = stop;

    const patch: DustSpeck[] = [];
    for (const { rider, center } of riderSpots) {
      const ahead = (rider.width / 2 + 26) * GONDOLA_RIDER_SCALE;
      const up = (rider.height * 0.55 + 24) * GONDOLA_RIDER_SCALE;
      riderLooks[rider.name] = lookToward(rider, rider.width / 2 + 26, rider.height * 0.55 + 24);
      for (let i = 0; i < 2; i++) {
        const size = 24 + Math.random() * 24;
        patch.push({
          left: `calc(${stop.x}% + ${Math.round(center + ahead + (Math.random() * 2 - 1) * 16)}px)`,
          top: `calc(${stop.y}% + ${Math.round(tallest - up - size * 0.4 + (Math.random() * 2 - 1) * 16)}px)`,
          size,
          floor: false,
          appearAt: 0,
          wetAt: null,
          clearAt: 0,
        });
      }
    }

    steps.push({ kind: "work", at: t, ms: FIRST_JOB_MS, activity: "spray", look: { x: 1, y: 0 } });
    if (anySprays) patch.forEach((s, i) => (s.wetAt = t + 250 + i * 350));
    t += FIRST_JOB_MS;

    steps.push({ kind: "work", at: t, ms: SECOND_JOB_MS, activity: "wipe", look: { x: 1, y: 0 } });
    workWindows.push({ at: t, ms: SECOND_JOB_MS });
    patch.forEach((s, i) => (s.clearAt = t + (i + 0.7) * (SECOND_JOB_MS / (patch.length + 0.4))));
    t += SECOND_JOB_MS;
    specks.push(...patch);

    steps.push({ kind: "inspect", at: t, ms: 700, look: { x: 1, y: 0 } });
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

  return { riders, entryX, steps, endAt: t, riderQuirks, riderLooks };
}

// ------------------------------------------------------------ the round

interface RoundPlan {
  floor: FloorActor[];
  gondola: GondolaActor | null;
  stairs: Stairs | null;
  dust: DustSpeck[];
  cheerStyle: CheerStyle;
  confetti: boolean;
  moonwalk: boolean;
  endAt: number;
  cast: Name[];
}

// Splits a stretch of floor (in %) into `count` lanes, and gives back
// evenly spaced stops within lane `i`, in the order someone coming from the
// `from` side would reach them.
function laneStops(lo: number, hi: number, count: number, i: number, stops: number, from: "left" | "right") {
  const width = (hi - lo) / count;
  const start = lo + i * width;
  const xs = Array.from({ length: stops }, (_, j) => start + (width * (j + 0.5)) / stops);
  return from === "left" ? xs : xs.reverse();
}

// Who turns up and what happens this round: one, two, three, or all four
// of them. With three or more, two take the gondola (never the one lugging
// the mop bucket). Of the floor crew, one climbs the stairs to the glass up
// high, the mop does the floor and then the stairs, and anyone else works
// their own stretch of floor.
function planRound(exclude: Name[]): RoundPlan {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
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
    cast.length >= 3 ?(["yellow", "black", "purple"] as Name[]).filter((n) => cast.includes(n)).slice(0, 2) : [];
  const floorNames = cast.filter((n) => !riderNames.includes(n));

  const stairs = vw >= STAIRS_MIN_VW ? makeStairs(vw, vh) : null;
  const dust: DustSpeck[] = [];
  const climberName = stairs ? (floorNames.find((n) => n !== "orange") ?? null) : null;
  const mopperName: Name | null = floorNames.includes("orange") ? "orange" : null;
  const others = floorNames.filter((n) => n !== climberName && n !== mopperName);

  // The open floor, away from the stairs — everyone comes on from that side.
  const footPct = stairs ? stairPct(stairs, 0) : 0;
  const [lo, hi] = !stairs ? [6, 94] : stairs.side === "left" ? [footPct + 5, 94] : [6, footPct - 5];
  const from: "left" | "right" = stairs?.side === "left" ? "right" : "left";
  const entryX = from === "left" ? -12 : 112;

  // Whether anyone on the stairs misses their footing this round, who, on
  // which step (never the bottom two — there'd be nowhere to fall), and
  // whether the rail saves them.
  const onStairs = [climberName, stairs ? mopperName : null].filter((n): n is Name => n !== null);
  const mishapFor =
    stairs && onStairs.length > 0 && Math.random() < MISHAP_CHANCE
      ? onStairs[Math.floor(Math.random() * onStairs.length)]
      : null;
  const mishap: Mishap | null =
    stairs && mishapFor
      ? { tread: 3 + Math.floor(Math.random() * (stairs.n - 2)), fall: Math.random() < 0.5 }
      : null;

  const floor: FloorActor[] = [];
  let startAt = 60;
  let climberClearAt = 0;
  let landedAt: number[] = [];
  let climberSecondAt: number | undefined;

  if (climberName && stairs) {
    const c = buildClimberScript(
      CHARACTERS[climberName],
      stairs,
      startAt,
      entryX,
      dust,
      vw,
      mishapFor === climberName ? mishap : null
    );
    floor.push(c.actor);
    climberClearAt = c.clearAt;
    landedAt = c.landedAt;
    climberSecondAt = c.secondAt;
    startAt += 700;
  }

  // Lanes: the mop's is the one nearest the stairs, so it works its way
  // toward them.
  const laneNames: Name[] = [...others, ...(mopperName ? [mopperName] : [])];
  if (from === "right") laneNames.reverse();
  laneNames.forEach((name, i) => {
    const isMop = name === mopperName;
    const stops = laneStops(lo, hi, laneNames.length, i, isMop && stairs ? 2 : 3, from);
    floor.push(buildFloorScript(CHARACTERS[name], startAt, entryX, stops, dust, vw));
    startAt += 700;
  });

  // Footprints on every step, and on the landing where they stopped, for
  // the mop to deal with — left by whoever climbed, or just there if
  // nobody did.
  if (stairs && mopperName) {
    const footprint = (u: number, level: number, appearAt: number): DustSpeck => {
      const speck: DustSpeck = {
        left: `calc(${stairPct(stairs, u)}% + ${Math.round((Math.random() * 2 - 1) * 10)}px)`,
        bottom: FLOOR + level * stairs.riseH - 6,
        size: 34 + Math.random() * 12,
        floor: true,
        appearAt,
        tread: level,
        wetAt: null,
        clearAt: 0,
      };
      dust.push(speck);
      return speck;
    };
    const treads: (DustSpeck | null)[] = [null];
    for (let k = 1; k <= stairs.n; k++) treads.push(footprint(k, k, landedAt[k] ?? stepLandedAt(stairs, k) + 200));
    const level = landingLevel(stairs);
    const landingPrints = landingStops(stairs).map((u, i) =>
      footprint(u, level, (i === 0 ? landedAt[level] : climberSecondAt) ?? stepLandedAt(stairs, level) + 200)
    );
    const mop = floor.find((a) => a.character.name === mopperName)!;
    addStairMopping(mop, stairs, climberClearAt, treads, landingPrints, vw, mishapFor === mopperName ? mishap : null);
  }

  const gondola = riderNames.length > 0 ? buildGondolaScript(riderNames.map((n) => CHARACTERS[n]), 60, dust, stairs) : null;

  // Everyone waits for the slowest to finish, celebrates together, then
  // they head off one by one — off the open-floor side, away from the
  // stairs, which lift away behind them.
  const actors: { steps: Step[]; endAt: number; isGondola: boolean }[] = [
    ...floor.map((a) => ({ steps: a.steps, endAt: a.endAt, isGondola: false })),
    ...(gondola ? [{ steps: gondola.steps, endAt: gondola.endAt, isGondola: true }] : []),
  ];
  const cheerAt = Math.max(...actors.map((a) => a.endAt)) + 300;
  let endAt = 0;
  actors.forEach((a, i) => {
    if (cheerAt > a.endAt) a.steps.push({ kind: "wait", at: a.endAt, ms: cheerAt - a.endAt });
    a.steps.push({ kind: "cheer", at: cheerAt, ms: CHEER_MS });
    const leaveAt = cheerAt + CHEER_MS + i * 450;
    const lastWalk = [...a.steps].reverse().find((s): s is WalkStep => s.kind === "walk")!;
    let leave: WalkStep;
    if (a.isGondola) {
      leave = { kind: "walk", at: leaveAt, ms: 2600, x: lastWalk.x, top: GONDOLA_OFFSCREEN };
    } else {
      const trip = hopTrip(lastWalk.x, entryX, vw);
      leave = { kind: "walk", at: leaveAt, ms: trip.ms, x: entryX, hopMs: trip.hopMs };
    }
    a.steps.push(leave);
    a.steps.push({ kind: "gone", at: leave.at + leave.ms, ms: 0 });
    endAt = Math.max(endAt, leave.at + leave.ms);
  });
  if (stairs) {
    stairs.outAt = cheerAt + CHEER_MS;
    endAt = Math.max(endAt, stepLiftAt(stairs, 1) + STAIR_LIFT_MS);
  }

  return {
    floor,
    gondola,
    stairs,
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

// Where the actor is (or is heading) as of the current step, which way
// they're facing — the way they last walked — and which step of the
// stairs, if any, they're standing on (`tread`, and the last one they
// stood on, `lastTread`).
function positionAt(steps: Step[], index: number, entry: { x: number; top?: string }) {
  let x = entry.x;
  let y = 0;
  let top = entry.top;
  let facing: 1 | -1 = entry.x > 50 ? -1 : 1;
  let tread: number | undefined;
  let lastTread = 0;
  for (let i = 0; i <= index && i < steps.length; i++) {
    const s = steps[i];
    if (s.kind === "walk") {
      if (s.x !== x) facing = s.x > x ? 1 : -1;
      x = s.x;
      y = s.y ?? 0;
      top = s.top ?? top;
      tread = s.tread;
      lastTread = s.tread ?? lastTread;
    } else if (s.kind === "fall" || s.kind === "dangle") {
      x = s.x;
      y = s.y;
      tread = undefined;
    }
  }
  return { x, y, top, facing, tread, lastTread };
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

// The bucket can be drawn in two halves, so the mop can go down into it:
// the handle behind the mop, and the bucket and water in front of it.
function Bucket({ part = "whole" }: { part?: "whole" | "back" | "front" }) {
  return (
    <svg width="48" height="54" viewBox="0 -10 48 54" aria-hidden="true">
      {part !== "front" && <path d="M12,6 C12,-10 36,-10 36,6" fill="none" stroke="#9aa3b5" strokeWidth="3" />}
      {part !== "back" && (
        <>
          <path d="M6,8 L42,8 L36,42 L12,42 Z" fill="#e0564f" />
          <path d="M9,17 L39,17" stroke="#ffffff" strokeWidth="2" opacity="0.35" />
          <ellipse cx="24" cy="9" rx="17" ry="3.5" fill="#7cc7f0" />
        </>
      )}
    </svg>
  );
}

// A floating cartoon hand — no arms, Rayman-style, which keeps the
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

type Expression =
  | "walk"
  | "focus"
  | "look"
  | "content"
  | "yeah"
  | "confused"
  | "squeeze"
  | "yawn"
  | "dizzy"
  | "shock";

const INK = "#2D2D2D";

function Eye({
  size,
  expression,
  color,
  blinkDelay,
  flip,
  pupilRatio,
  gaze,
}: {
  size: number;
  expression: Expression;
  color: string;
  blinkDelay: string;
  flip: boolean;
  pupilRatio: number;
  gaze: Vec | null;
}) {
  // Happy "^" arches for celebrating.
  if (expression === "yeah") {
    return (
      <div
        style={{
          width: size,
          height: size / 2,
          marginTop: size * 0.3,
          border: `3px solid ${INK}`,
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
          border: `3px solid ${INK}`,
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
        className="flex items-center justify-center font-black"
        style={{ width: size, height: size, fontSize: size * 1.25, lineHeight: 1, color: INK }}
      >
        {expression === "dizzy" ? "×" : flip ? "<" : ">"}
      </div>
    );
  }
  // Wide-eyed alarm: pinprick pupils.
  const pupil = size * pupilRatio * (expression === "shock" ? 0.55 : 1);
  // Working and checking their work: eyes on the actual patch they're
  // cleaning (see lookToward). Confused: rolled up, thinking. Hopping
  // along: ahead, with the odd glance round at whoever's watching.
  const reach = size * 0.24;
  const look =
    expression === "confused"
      ? { x: -size * 0.12, y: -size * 0.2 }
      : gaze && (expression === "focus" || expression === "look" || expression === "content")
        ? { x: gaze.x * reach, y: gaze.y * reach }
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
          backgroundColor: INK,
          transform: expression === "walk" ? undefined : `translate(${look.x}px, ${look.y}px)`,
          transition: "transform 300ms ease-out",
        }}
      />
      {/* Concentrating: heavy upper lids, half-shut. */}
      {expression === "focus" && (
        <div className="absolute inset-x-0 top-0" style={{ height: "36%", backgroundColor: color }} />
      )}
    </div>
  );
}

// Blocks get the login screen's plain dark line of a mouth; the blobs keep
// their red cartoon smile.
function Mouth({ width, expression, block }: { width: number; expression: Expression; block: boolean }) {
  const ink = block ? INK : "#d1453b";
  if (expression === "yeah") {
    if (block) {
      const w = width * 0.36;
      return <div style={{ width: w, height: w * 0.45, backgroundColor: INK, borderRadius: `2px 2px ${w}px ${w}px` }} />;
    }
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
    return (
      <div
        className="crew-yawn rounded-full"
        style={{ width: width * 0.2, height: width * 0.26, backgroundColor: block ? INK : "#8e1f1a" }}
      />
    );
  }
  if (expression === "squeeze" || expression === "shock") {
    const o = expression === "shock" ? 13 : 10;
    return <div className="rounded-full" style={{ width: o, height: o, border: `3px solid ${ink}` }} />;
  }
  if (expression === "confused" || expression === "dizzy") {
    return (
      <svg width={width * 0.3} height="10" viewBox="0 0 30 10" aria-hidden="true">
        <path d="M2,5 Q6,1 10,5 T18,5 T26,5" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (expression === "focus") {
    // Lips pressed together in concentration.
    return <div className="rounded-full" style={{ width: width * (block ? 0.2 : 0.14), height: block ? 3 : 4, backgroundColor: ink }} />;
  }
  if (block && expression !== "content") {
    return <div className="rounded-full" style={{ width: width * 0.3, height: 3, backgroundColor: INK }} />;
  }
  // A smile arc — wider when pleased with their work.
  const w = width * (expression === "content" ? 0.34 : 0.26);
  return (
    <div style={{ width: w, height: w * 0.42, borderBottom: `${block ? 3 : 4}px solid ${ink}`, borderRadius: `0 0 ${w}px ${w}px` }} />
  );
}

function Face({ character, expression, gaze }: { character: Character; expression: Expression; gaze: Vec | null }) {
  const { width, color, blinkDelay, shape } = character;
  const block = shape === "block";
  const eyeSize = eyeSizeFor(character);
  const eyesTop = eyesTopFor(character);
  // The whole face turns a touch toward what they're looking at, like the
  // login characters' faces following the cursor.
  const turned = gaze && expression !== "walk" ? `translate(${(gaze.x * 3).toFixed(1)}px, ${(gaze.y * 2).toFixed(1)}px)` : "none";
  return (
    // backface-visibility hides the face while the body is spun round to
    // its back during a (rare) celebration spin.
    <div
      className="absolute inset-x-0 top-0 flex flex-col items-center"
      style={{ paddingTop: eyesTop, backfaceVisibility: "hidden", transform: turned, transition: "transform 300ms ease-out" }}
    >
      {expression === "confused" && (
        <div
          className="absolute rounded-full"
          style={{
            top: eyesTop - 8,
            left: width / 2 + width * 0.06,
            width: eyeSize,
            height: 3,
            transform: "rotate(-14deg)",
            backgroundColor: INK,
          }}
        />
      )}
      <div className="flex items-start" style={{ gap: width * (block ? 0.16 : 0.12), height: eyeSize }}>
        {[false, true].map((flip) => (
          <Eye
            key={String(flip)}
            size={eyeSize}
            expression={expression}
            color={color}
            blinkDelay={blinkDelay}
            flip={flip}
            pupilRatio={block ? 0.42 : 0.46}
            gaze={gaze}
          />
        ))}
      </div>
      <div className="relative" style={{ marginTop: block ? eyeSize * 0.7 : width * 0.07 }}>
        {!block && (expression === "yeah" || expression === "content") && (
          <>
            {/* Rosy cheeks when they're pleased. */}
            <div className="absolute rounded-full bg-[#ff8fa3]/50" style={{ width: 10, height: 6, top: 0, right: width * 0.26 }} />
            <div className="absolute rounded-full bg-[#ff8fa3]/50" style={{ width: 10, height: 6, top: 0, left: width * 0.26 }} />
          </>
        )}
        <Mouth width={width} expression={expression} block={block} />
      </div>
    </div>
  );
}

// ============================================================ gear by mode

type Mode = Activity | "carry" | "raise" | "scratch" | "hi" | "brow" | "backfire" | "flail" | "hang" | "none";

function Gear({ character, mode, bucketDown }: { character: Character; mode: Mode; bucketDown: boolean }) {
  const { width, height, color, stage1, stage2 } = character;
  if (mode === "none") return null;
  // Losing their balance: both hands out and windmilling. Hanging off the
  // rail: both hands up on it, just above their head.
  if (mode === "flail" || mode === "hang") {
    const hands =
      mode === "flail"
        ? [
            { x: -10, y: height * 0.3, delay: "0ms" },
            { x: width + 10, y: height * 0.3, delay: "-150ms" },
          ]
        : [
            { x: width * 0.3, y: -6, delay: "0ms" },
            { x: width * 0.7, y: -6, delay: "0ms" },
          ];
    return (
      <>
        {hands.map((h, i) => (
          <div key={i} className={`absolute ${mode === "flail" ? "crew-flail" : ""}`} style={{ left: 0, top: 0, animationDelay: h.delay }}>
            <Hand color={color} x={h.x} y={h.y} />
          </div>
        ))}
      </>
    );
  }
  const handX = width - 8;
  const handY = height * 0.45;
  const hasBucket = stage1 === "dunk" || stage2 === "dunk";

  let held: React.ReactNode = null;
  if (mode === "dunk") {
    // Mop plunged into the bucket, wrung, lifted — flicking water out.
    held = (
      <div className="absolute" style={{ left: width + 15, top: height - 114 }}>
        <div className="crew-mop-dunk relative">
          <Mop />
          <Hand color={color} x={15} y={40} />
        </div>
      </div>
    );
  } else if (mode === "mopFloor") {
    // Mop head on the floor, pushed side to side from the grip.
    held = (
      <div className="absolute" style={{ left: width - 6, top: height - 88 }}>
        <div className="crew-mop-swing relative" style={{ transformOrigin: "15px 26px" }}>
          <Mop />
          <Hand color={color} x={15} y={26} />
        </div>
      </div>
    );
  } else if (mode === "mopStep") {
    // Mopping the step they're standing on: held out in front of them, the
    // head swept to and fro along the step under their feet.
    held = (
      <div className="absolute" style={{ left: width / 2 - 15, top: height - 86, zIndex: 1 }}>
        <div className="crew-mop-step relative" style={{ transformOrigin: "15px 20px" }}>
          <Mop />
          <Hand color={color} x={15} y={20} />
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

  // Dunking: the mop goes in between the bucket's handle and its front, so
  // it disappears into the water instead of being drawn over the bucket.
  const dunking = hasBucket && bucketDown && mode === "dunk";
  return (
    <>
      {hasBucket &&
        (bucketDown ? (
          <div className="absolute" style={{ left: width + 6, bottom: -2 }}>
            <Bucket part={dunking ? "back" : "whole"} />
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
      {dunking && (
        <div className="absolute" style={{ left: width + 6, bottom: -2 }}>
          <Bucket part="front" />
          <div className="absolute" style={{ left: 0, top: 0 }}>
            <Drips />
          </div>
        </div>
      )}
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

function QuirkOverlay({ character, quirk, facing }: { character: Character; quirk: Quirk; facing: 1 | -1 }) {
  const { width, height } = character;
  // The figure is mirrored when facing left, which would print these
  // glyphs back to front — so each one is flipped back the right way round.
  const unmirror: React.CSSProperties = { display: "inline-block", transform: facing === -1 ? "scaleX(-1)" : undefined };
  if (quirk === "confused") {
    return (
      <div
        className="crew-pop absolute flex items-center justify-center rounded-full bg-white text-xl font-black text-[#385bc1] shadow-md"
        style={{ left: width * 0.62, top: -44, width: 32, height: 32 }}
      >
        <span style={unmirror}>?</span>
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
            <span style={unmirror}>{note}</span>
          </span>
        ))}
      </>
    );
  }
  if (quirk === "slip" || quirk === "dazed") {
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
  /** Hopping along: how long one hop takes. null when not moving. */
  hopMs: number | null;
  /** Flatter hops when they're in a hurry. */
  run: boolean;
  /** Which way they face; the whole figure is mirrored for -1. */
  facing: 1 | -1;
  /** Where they're looking, in their own facing frame. */
  gaze: Vec | null;
  /** Lean in degrees — negative leans forward, the way they face. */
  lean: number;
  bucketDown: boolean;
  quirk: Quirk | null;
  /** What the body pivots round; their feet unless they're hanging by their hands. */
  bodyOrigin?: string;
  /** Climbing into the stairs: seen from behind. */
  back?: boolean;
}

const BASE_POSE: Pose = {
  mode: "carry",
  expression: "content",
  bodyClass: "crew-idle",
  spin: false,
  hopMs: null,
  run: false,
  facing: 1,
  gaze: null,
  lean: 0,
  bucketDown: true,
  quirk: null,
};

function quirkPose(quirk: Quirk, facing: 1 | -1): Pose {
  const base: Pose = { ...BASE_POSE, bodyClass: "", facing, quirk };
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
    // On the stairs, so nothing gets put down on a step.
    case "teeter":
      return { ...base, mode: "flail", expression: "shock", bodyClass: "crew-teeter", bucketDown: false };
    case "dazed":
      return { ...base, expression: "dizzy", bodyClass: "crew-dazed", bucketDown: false };
    case "phew":
      return { ...base, mode: "brow", expression: "content", bodyClass: "crew-nod", bucketDown: false };
  }
}

function poseFor(step: Step | undefined, cheerStyle: CheerStyle, facing: 1 | -1, moonwalk: boolean): Pose {
  const base: Pose = { ...BASE_POSE, facing };
  if (!step) return { ...base, bucketDown: false };
  switch (step.kind) {
    case "walk":
      return {
        ...base,
        expression: "walk",
        bodyClass: "",
        hopMs: step.hopMs ?? HOP_MS,
        run: (step.hopMs ?? HOP_MS) < HOP_MS,
        // Leaning into the hop — or, on a rare moonwalk exit, facing back
        // the way they came while they hop off backwards.
        facing: moonwalk ? ((-facing) as 1 | -1) : facing,
        lean: moonwalk ? 4 : -5,
        bucketDown: false,
        back: step.away,
      };
    case "work":
      // Eyes on the patch, leaning in toward it a little.
      return {
        ...base,
        mode: step.activity,
        expression: "focus",
        bodyClass: "crew-work",
        gaze: step.look,
        lean: -step.look.x * 4,
        bucketDown: step.activity !== "mopStep",
      };
    case "inspect":
      // Step back, look over the spot just cleaned, a satisfied nod.
      return { ...base, expression: "look", bodyClass: "crew-nod", gaze: step.look, lean: -step.look.x * 2 };
    case "quirk":
      return quirkPose(step.quirk, facing);
    case "fall":
      // Tumbling off backwards, over and over, landing flat on their back.
      return { ...base, expression: "shock", bodyClass: "crew-tumble", bucketDown: false };
    case "dangle":
      // Swinging from their hands on the rail, then kicking to get back up.
      return { ...base, mode: "hang", expression: "squeeze", bodyClass: "crew-dangle", bucketDown: false, bodyOrigin: "50% -6px" };
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

function Body({ character }: { character: Character }) {
  const { color, radius, shape } = character;
  // Blocks are flat colour, exactly like the login screen's; the blobs get
  // a soft highlight and shading so they read as rounded.
  const background =
    shape === "blob"
      ? `radial-gradient(circle at 32% 22%, rgba(255,255,255,0.34), rgba(255,255,255,0) 42%), radial-gradient(circle at 72% 96%, rgba(0,0,0,0.16), rgba(0,0,0,0) 55%), ${color}`
      : color;
  return <div className="absolute inset-0" style={{ background, borderRadius: radius }} />;
}

// Climbing away from us, face to the stairs: no face to see, just the odd
// glance back over their shoulder — one eye peeking round the edge of
// them.
function Peek({ character }: { character: Character }) {
  const size = eyeSizeFor(character);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: character.radius }}>
      <div
        className="crew-peek absolute flex items-center justify-center rounded-full bg-white"
        style={{ right: -size * 0.45, top: eyesTopFor(character), width: size, height: size }}
      >
        <div
          className="rounded-full"
          style={{ width: size * 0.46, height: size * 0.46, backgroundColor: INK, transform: `translate(${-size * 0.14}px, ${size * 0.06}px)` }}
        />
      </div>
    </div>
  );
}

function Figure({ character, pose }: { character: Character; pose: Pose }) {
  const { width, height } = character;
  const hopping = pose.hopMs !== null;
  const hopTiming = hopping ? { animationDuration: `${pose.hopMs}ms` } : undefined;
  return (
    <div className="relative" style={{ width, height }}>
      {/* Ground shadow — tightens while they're up in the air. */}
      <div
        className={`absolute rounded-full bg-black/15 ${pose.spin ? "crew-shadow-jump" : hopping ? "crew-hop-shadow" : ""}`}
        style={{ left: width * 0.08, bottom: -4, width: width * 0.84, height: 9, ...hopTiming }}
      />
      {/* Turning round: a quick squeeze through edge-on rather than a snap. */}
      <div className="absolute inset-0" style={{ transform: `scaleX(${pose.facing})`, transition: "transform 200ms ease-in-out" }}>
        <div
          className={`absolute inset-0 ${hopping ? "crew-hop" : ""}`}
          style={{ transformOrigin: "bottom center", ...hopTiming, ...(pose.run ? ({ "--hop-h": "-9px" } as React.CSSProperties) : null) }}
        >
          <div className="absolute inset-0" style={{ perspective: 700 }}>
            <div className={`absolute inset-0 ${pose.spin ? "crew-spin" : ""}`} style={{ transformStyle: "preserve-3d" }}>
              <div
                className="absolute inset-0"
                style={{ transform: `skewX(${pose.lean.toFixed(1)}deg)`, transformOrigin: "bottom center", transition: "transform 280ms ease-out" }}
              >
                {/* Their size, for tumbling round their middle and
                    landing flat (see crew-tumble). */}
                <div
                  className={`absolute inset-0 ${pose.bodyClass}`}
                  style={
                    {
                      transformOrigin: pose.bodyOrigin ?? "bottom center",
                      "--w": `${width}px`,
                      "--h": `${height}px`,
                    } as React.CSSProperties
                  }
                >
                  {/* From behind, whatever they're carrying is on the far
                      side of them — only what pokes out past them shows. */}
                  {pose.back && <Gear character={character} mode={pose.mode} bucketDown={pose.bucketDown} />}
                  <Body character={character} />
                  {pose.back ? (
                    <Peek character={character} />
                  ) : (
                    <Face character={character} expression={pose.expression} gaze={pose.gaze} />
                  )}
                  {!pose.back && <Gear character={character} mode={pose.mode} bucketDown={pose.bucketDown} />}
                  {pose.quirk && <QuirkOverlay character={character} quirk={pose.quirk} facing={pose.facing} />}
                </div>
              </div>
            </div>
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
  const { x, y, facing, tread, lastTread } = positionAt(actor.steps, index, { x: actor.entryX });
  const isLeaving = step?.kind === "walk" && index === actor.steps.length - 2;
  // Walking: linear, so the ground covered keeps pace with the hops.
  // Falling (or dropping onto the rail): gathering speed as they go down.
  const gravity = "cubic-bezier(0.55, 0, 0.9, 0.5)";
  let travel = "none";
  if (step?.kind === "walk") travel = `left ${step.ms}ms linear, bottom ${step.ms}ms linear`;
  else if (step?.kind === "fall") travel = `left ${step.ms}ms ease-out, bottom ${step.ms}ms ${gravity}`;
  else if (step?.kind === "dangle") travel = `left ${DANGLE_DROP_MS}ms ease-out, bottom ${DANGLE_DROP_MS}ms ${gravity}`;
  return (
    <div className="absolute" style={{ left: `${x}%`, bottom: FLOOR + y, zIndex: 3, transition: travel }}>
      {/* Riding the bob of the step they're on. The bob runs from the start
          of the round, like the steps' own, so it only ever gets switched to
          the right step's timing and faded in or out — never restarted. */}
      <div
        style={
          {
            marginLeft: -actor.character.width / 2,
            animation: stepBob(lastTread),
            "--bob-amp": tread ? `${STEP_BOB_PX}px` : "0px",
            transition: "--bob-amp 250ms ease-out",
          } as React.CSSProperties
        }
      >
        <Figure character={actor.character} pose={poseFor(step, cheerStyle, facing, moonwalk && isLeaving)} />
      </div>
    </div>
  );
}

function GondolaRider({
  character,
  step,
  quirk,
  look,
  cheerStyle,
}: {
  character: Character;
  step: Step | undefined;
  quirk: RiderQuirk | undefined;
  look: Vec;
  cheerStyle: CheerStyle;
}) {
  const quirkActive = useActiveWindow(quirk ? quirk.at : null, quirk ? quirk.ms : 0);
  let pose: Pose;
  if (quirkActive && quirk && step?.kind === "work") {
    pose = quirkPose(quirk.quirk, 1);
  } else if (step?.kind === "walk") {
    // Riding, not walking — just enjoying the view.
    pose = { ...poseFor(undefined, cheerStyle, 1, false), expression: "walk", bodyClass: "crew-idle" };
  } else if (step?.kind === "work") {
    // Each rider does their own part of the job: the one with the bottle
    // sprays first while the other gets a head start wiping.
    pose = poseFor(
      { ...step, activity: step.activity === "spray" ? character.stage1 : character.stage2, look },
      cheerStyle,
      1,
      false
    );
  } else if (step?.kind === "inspect") {
    pose = poseFor({ ...step, look }, cheerStyle, 1, false);
  } else {
    pose = poseFor(step, cheerStyle, 1, false);
  }
  return (
    <div style={{ transform: `scale(${GONDOLA_RIDER_SCALE})`, transformOrigin: "bottom center" }}>
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
        <div className="flex items-end justify-center" style={{ gap: GONDOLA_RIDER_GAP, paddingBottom: GONDOLA_PADDING }}>
          {actor.riders.map((c) => (
            <GondolaRider
              key={c.name}
              character={c}
              step={step}
              quirk={actor.riderQuirks[c.name]}
              look={actor.riderLooks[c.name] ?? { x: 1, y: 0 }}
              cheerStyle={cheerStyle}
            />
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

const STEP_TOP = "#7f9cf0";
const STEP_FRONT = "#385bc1";
const STEP_END = "#2c4aa6";
const NEAR_METAL = "#8791a5";
const FAR_METAL = "#b3bbca";

// Dropping in from above at `inAt`, lifting away again at `outAt`.
const dropInLiftOut = (inAt: number, dropMs: number, outAt: number) =>
  `crew-stair-drop ${dropMs}ms linear ${inAt}ms both, crew-stair-lift ${STAIR_LIFT_MS}ms linear ${outAt}ms forwards`;

// A thin slab in 3D, seen at an angle: its front, its top running back into
// the screen, and the end facing down the stairs. Drawn for a flight going
// up to the right, and mirrored for one going up to the left.
function Slab({ width, dirUp }: { width: number; dirUp: 1 | -1 }) {
  const t = SLAB_THICKNESS;
  return (
    <svg
      width={width + DEPTH_X}
      height={t + DEPTH_Y}
      className="absolute inset-0 overflow-visible"
      style={{
        transform: dirUp === -1 ? "scaleX(-1)" : undefined,
        filter: "drop-shadow(0 6px 8px rgba(30, 50, 110, 0.22))",
      }}
      aria-hidden="true"
    >
      <polygon points={`${DEPTH_X},${DEPTH_Y} ${DEPTH_X + width},${DEPTH_Y} ${width},0 0,0`} fill={STEP_TOP} />
      <polygon points={`${DEPTH_X},${DEPTH_Y} 0,0 0,${t} ${DEPTH_X},${DEPTH_Y + t}`} fill={STEP_END} />
      <rect x={DEPTH_X} y={DEPTH_Y} width={width} height={t} fill={STEP_FRONT} />
    </svg>
  );
}

// The floating stairs: a thin 3D slab for each step and a longer one for
// the landing, hovering in a line up the screen with a gap between each,
// and a handrail up both sides on posts standing on the steps — the far one
// behind the crew, the near one in front of them, carrying on along the
// front of the landing. The steps drop in bottom to top and settle, then
// the landing, then the rails come down onto the posts. At the end the
// rails lift off first, then the landing and the steps, top first.
function StairFlight({ stairs: s }: { stairs: Stairs }) {
  const { n, stepW, riseH, dirUp } = s;
  const level = landingLevel(s);
  const inset = POST_INSET / stepW;
  const start = SLAB_GAP / 2 / stepW;
  const lastPost = landingEnd(s) - inset;
  // Each slab: which level it's at, where its middle is along the flight,
  // how long it is, and the posts on it (as step positions) holding up the
  // near rail and the far one.
  const slabs = [
    ...Array.from({ length: n }, (_, i) => {
      const k = i + 1;
      const post = k - 0.5 + inset;
      return { k, mid: k, length: stepW - SLAB_GAP, near: [post], far: [post] };
    }),
    {
      k: level,
      mid: (n + 0.5 + start + landingEnd(s)) / 2,
      length: (landingEnd(s) - n - 0.5 - start) * stepW,
      near: [level, (level + lastPost) / 2, lastPost],
      far: [level],
    },
  ];
  const railFrom = 0.5 + inset - 8 / stepW;
  const railTo = lastPost + 8 / stepW;
  return (
    <>
      {slabs.map(({ k, mid, length, near, far }) => {
        const left = stairPx(s, mid) - (length + DEPTH_X) / 2;
        const bottom = FLOOR + k * riseH - DEPTH_Y / 2 - SLAB_THICKNESS;
        const layer = (z: number): React.CSSProperties => ({
          left,
          bottom,
          width: length + DEPTH_X,
          height: SLAB_THICKNESS + DEPTH_Y,
          zIndex: z,
          animation: `${dropInLiftOut(s.inAt + (k - 1) * STAIR_DROP_STAGGER_MS, STAIR_DROP_MS, stepLiftAt(s, k))}, ${stepBob(k)}`,
        });
        // A post from the top of the slab — its front edge or its back
        // edge — up to just short of the rail's centre line, so it stays
        // tucked behind the rail however the step bobs.
        const post = (u: number, side: 1 | -1) => {
          const rail = railPoint(s, u, side);
          const foot = FLOOR + k * riseH + (side * DEPTH_Y) / 2;
          return (
            <div
              key={`${side}${u}`}
              className="absolute rounded-full"
              style={{
                left: rail.x - left - 1.5,
                bottom: foot - bottom,
                width: 3,
                height: rail.y - foot - 2,
                backgroundColor: side === 1 ? FAR_METAL : NEAR_METAL,
              }}
            />
          );
        };
        return (
          <div key={k}>
            {/* Its shadow on the floor far below — fainter the higher it hovers. */}
            <div
              className="absolute rounded-full"
              style={{
                left: stairPx(s, mid) - length * 0.4,
                bottom: FLOOR - 4,
                width: length * 0.8,
                height: 8,
                zIndex: 0,
                background: `rgba(30, 50, 110, ${Math.max(0.05, 0.16 - k * 0.015).toFixed(3)})`,
                filter: "blur(3px)",
                animation: `crew-fade-in 400ms ease-out ${stepLandedAt(s, k) - 300}ms both, crew-fade-out 300ms ease-in ${stepLiftAt(s, k)}ms forwards`,
              }}
            />
            <div className="absolute" style={layer(1)}>
              {far.map((u) => post(u, 1))}
              <Slab width={length} dirUp={dirUp} />
            </div>
            <div className="absolute" style={layer(4)}>
              {near.map((u) => post(u, -1))}
            </div>
          </div>
        );
      })}
      <RailBar s={s} from={railPoint(s, railFrom, 1)} to={railPoint(s, level, 1)} far />
      <RailBar s={s} from={railPoint(s, railFrom, -1)} to={railPoint(s, level, -1)} />
      <RailBar s={s} from={railPoint(s, level, -1)} to={railPoint(s, railTo, -1)} />
    </>
  );
}

// A straight length of handrail between two points on its centre line (x
// from the left, y up from the bottom, in px) — the far one behind the
// crew, or the near one in front of them.
function RailBar({ s, from, to, far = false }: { s: Stairs; from: Vec; to: Vec; far?: boolean }) {
  const [left, right] = from.x < to.x ? [from, to] : [to, from];
  const length = Math.hypot(right.x - left.x, right.y - left.y);
  const angle = (-Math.atan2(right.y - left.y, right.x - left.x) * 180) / Math.PI;
  return (
    <div
      className="absolute"
      style={{
        left: left.x,
        bottom: left.y - RAIL_THICKNESS / 2,
        zIndex: far ? 1 : 4,
        animation: dropInLiftOut(railsInAt(s), RAIL_DROP_MS, s.outAt),
      }}
    >
      <div
        style={{
          width: length,
          height: RAIL_THICKNESS,
          borderRadius: RAIL_THICKNESS,
          background: `linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0) 60%), ${far ? FAR_METAL : NEAR_METAL}`,
          transformOrigin: "0 50%",
          transform: `rotate(${angle.toFixed(2)}deg)`,
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------ lever jobs

// When a stat card's number changes while they're on screen, one of the
// crew hurries over underneath it, a lever pops up out of the floor wired
// to the card, they haul on it, a spark runs up the cable, and the card
// flips over to the new number.
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
    const cableBottom = FLOOR + leverHeight;
    const cableHeight = Math.max(0, vh - rect.bottom - cableBottom);
    return { cardX, entryX, standX, side: entryX < 0 ? 1 : -1, leverHeight, cableHeight, vw };
  });
  const [steps] = useState<Step[]>(() => {
    if (!target) return [{ kind: "gone", at: 0, ms: 0 }];
    const inTrip = hopTrip(target.entryX, target.standX, target.vw, true);
    const pullAt = 60 + inTrip.ms;
    const cheerAt = pullAt + LEVER_PULL_MS;
    const outAt = cheerAt + 1400;
    const outTrip = hopTrip(target.standX, target.entryX, target.vw, true);
    return [
      { kind: "walk", at: 60, ms: inTrip.ms, x: target.standX, hopMs: inTrip.hopMs },
      { kind: "pull", at: pullAt, ms: LEVER_PULL_MS },
      { kind: "cheer", at: cheerAt, ms: 1400 },
      { kind: "walk", at: outAt, ms: outTrip.ms, x: target.entryX, hopMs: outTrip.hopMs },
      { kind: "gone", at: outAt + outTrip.ms, ms: 0 },
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
  const { x, facing } = positionAt(steps, index, { x: target.entryX });
  const pulling = step?.kind === "pull";
  const showLever = step?.kind === "pull" || step?.kind === "cheer";
  // The lever leans away from them, and they haul it back toward themselves.
  const handleFrom = 35 * target.side;
  const handleTo = -35 * target.side;

  return (
    <>
      {showLever && (
        <div className="absolute" style={{ left: `${target.cardX}%`, bottom: FLOOR, zIndex: 2 }}>
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
          bottom: FLOOR,
          zIndex: 3,
          transition: step?.kind === "walk" ? `left ${step.ms}ms linear` : "none",
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
        <div style={{ marginLeft: -character.width / 2 }}>
          <Figure
            character={character}
            pose={{
              ...poseFor(step, "wave", facing, false),
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
  const animations = [`crew-dust-appear 700ms ease-out ${speck.appearAt}ms both`];
  if (speck.wetAt !== null) animations.push(`crew-dust-wet 500ms ease-out ${speck.wetAt}ms forwards`);
  animations.push(`crew-dust-clear 500ms ease-in ${speck.clearAt}ms forwards`);
  const bob = speck.tread ? `, ${stepBob(speck.tread)}` : "";
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
          zIndex: 2,
          width: speck.size,
          height: speck.size * (speck.floor ? 0.4 : 0.8),
          marginLeft: -speck.size / 2,
          background: grime,
          animation: animations.join(", ") + bob,
        }}
      />
      <span
        className="absolute"
        style={{
          ...place,
          zIndex: 2,
          marginLeft: -9,
          fontSize: 20,
          lineHeight: 1,
          color: "#f2b632",
          textShadow: "0 0 6px rgba(242,182,50,0.6)",
          animation: `crew-sparkle-pop 800ms ease-out ${speck.clearAt + 200}ms both${bob}`,
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
      {plan.stairs && <StairFlight stairs={plan.stairs} />}
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
