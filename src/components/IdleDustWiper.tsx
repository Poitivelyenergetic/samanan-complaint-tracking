"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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
// Stairs are taken slowly and carefully: a slow hop up (or down) each step,
// then a moment to steady themselves before the next.
const CLIMB_HOP_MS = 800;
const CLIMB_PAUSE_MS = 350;
// Coming down: one steady hop after another, no stopping.
const CLIMB_DOWN_HOP_MS = 620;
// Done spraying: bottle away, cloth out.
const SWAP_MS = 450;
// About half the time a sprayer on the floor waves a teammate over to wipe
// the patch they've just sprayed, instead of swapping to a cloth and doing
// it themselves — if there's a teammate on the floor to call.
const HANDOFF_CHANCE = 0.5;
const CALL_MS = 900;
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
// The construction crew who turn up when something breaks (see maintenance).
type BuilderName = "foreman" | "welder";
type Activity = "spray" | "wipe" | "polish" | "dunk" | "mopFloor" | "mopStep" | "weld" | "type" | "glue";
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
  | "phew"
  // Only when they're caught at it (see panic).
  | "startle"
  | "bonk"
  | "shove"
  // A stain that won't come off (see buildFloorScript).
  | "fume"
  | "fling"
  // The missile: the foreman calling for help; the party after.
  | "call"
  | "heave"
  | "tossed"
  // Done before the others: killing time (see wrapUp).
  | "tap"
  | "lookout"
  | "sit"
  // Fallen off the second floor, and not getting up.
  | "hurt";
type CheerStyle = "nod" | "wave" | "bow" | "jump";

interface Vec {
  x: number;
  y: number;
}

interface Character {
  name: Name | BuilderName | MedicName | CoderName;
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
  /** The construction crew's hi-vis vest colour (they get a hard hat too). */
  vest?: string;
  /** A paramedic: a white cap and a red cross. */
  medic?: boolean;
  /** A coder: a screen for a face. */
  coder?: boolean;
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
  startle: 650,
  bonk: 650,
  shove: 600,
  fume: 1100,
  fling: 900,
  call: 2200,
  heave: 1000,
  tossed: 1000,
  tap: 1600,
  lookout: 1800,
  sit: 2800,
  hurt: 1000,
};
// How often a spot just won't come off, and how long scrubbing it does.
const STUBBORN_CHANCE = 0.18;
const HARD_SCRUB_MS = 2200;

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
      /** Which way to face on arriving, if not the way they walked. */
      face?: 1 | -1;
      /** Coming down the stairs, watching their feet. */
      down?: boolean;
      /** Lying on a stretcher, being carried off. */
      carried?: boolean;
      /** Fleeing in terror, arms flying (see panic)... */
      panic?: boolean;
      /** ...or clutching the thing they went back for. */
      holding?: boolean;
    }
  | { kind: "fall"; at: number; ms: number; x: number; y: number; panic?: boolean }
  | { kind: "dangle"; at: number; ms: number; x: number; y: number }
  | {
      kind: "work";
      at: number;
      ms: number;
      activity: Activity;
      look: Vec;
      /** Scrubbing twice as hard at a stain that won't come off. */
      hard?: boolean;
    }
  | { kind: "inspect"; at: number; ms: number; look: Vec }
  | { kind: "quirk"; at: number; ms: number; quirk: Quirk }
  | {
      kind: "wait";
      at: number;
      ms: number;
      /** Steadying themselves on a step of the stairs — still facing into them if climbing. */
      steady?: { away: boolean };
      /** Running on the spot in terror (see panic). */
      panic?: boolean;
      /** Lying there hurt. */
      lying?: boolean;
    }
  | { kind: "cheer"; at: number; ms: number }
  | { kind: "pull"; at: number; ms: number }
  | { kind: "gone"; at: number; ms: number }
  /** Off the floor for a while — riding the crane's platform. */
  | { kind: "aboard"; at: number; ms: number };
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
  /** Mess the builders leave on the floor, instead of plain grime. */
  mess?: "rubble" | "mud" | "tyre" | "cement";
  /** Where it is (px from the left), for planning who cleans it up. */
  spot?: number;
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
  return { specks, look: lookToward(c, ahead, up), ahead, up };
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
// Lower on the way up to the second floor, so the rail along it runs under
// the stat cards' numbers rather than through them.
const DECK_RAIL_H = 36;
const railH = (s: Stairs) => (s.deck ? DECK_RAIL_H : RAIL_H);
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
  /** How far the landing at the top runs on, in step widths. */
  landing: number;
  /** Where along the top they stop (step positions). */
  stops: number[];
  /** Up to the second floor instead: a platform right across the page (px) in
   *  the gap under the stat cards, where they either clean the cards or just
   *  wander along it. */
  deck: {
    left: number;
    right: number;
    mode: "clean" | "wander";
    reachUp: number;
    /** Cleaning: the stat card over each stop. */
    cards?: Element[];
    /** A card hanging crooked (by `deg`), which whoever's at `stop` straightens before cleaning. */
    crooked?: { stop: number; deg: number };
  } | null;
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
    landing: LANDING_STEPS,
    stops: [n + 1, n + LANDING_STEPS - 0.1],
    deck: null,
  };
}

// The second floor: the gap between the row of stat cards and the charts
// below them, if both are on screen with room between them and the floor —
// its height above the floor, how far it runs (px), and the cards above it.
function findDeck(vw: number, vh: number) {
  const onScreen = (b: Box) => b.w > 0 && b.y >= 0 && b.y + b.h <= vh && b.x >= -2 && b.x + b.w <= vw + 2;
  const cardEls = [...document.querySelectorAll("[data-crew-card]")].filter((el) => onScreen(boxOf(el)));
  const cards = cardEls.map(boxOf);
  const charts = [...document.querySelectorAll("[data-crew-chart]")].map(boxOf).filter(onScreen);
  if (cards.length < 2 || charts.length === 0) return null;
  const cardsBottom = Math.max(...cards.map((b) => b.y + b.h));
  const below = charts.filter((b) => b.y >= cardsBottom - 2);
  if (below.length === 0) return null;
  const chartsTop = Math.min(...below.map((b) => b.y));
  if (chartsTop - cardsBottom < 16) return null;
  // Along the top of the charts, so its rail runs through the gap under the
  // cards rather than across their numbers.
  const surface = chartsTop - 2;
  const height = vh - FLOOR - surface;
  if (height < 260) return null;
  const all = [...cards, ...below];
  return {
    height,
    left: Math.max(4, Math.min(...all.map((b) => b.x)) - 8),
    right: Math.min(vw - 4, Math.max(...all.map((b) => b.x + b.w)) + 8),
    cards,
    cardEls,
    // How far up from the platform the bottom of the cards' dirt is.
    reachUp: surface - cardsBottom + 26,
  };
}

// A steeper flight up to the second floor, its top against one end of the
// platform, which runs back across the page over the top of it. Null if it
// won't fit.
function makeDeckStairs(vw: number, deck: NonNullable<ReturnType<typeof findDeck>>): Stairs | null {
  const side = Math.random() < 0.5 ? "left" : "right";
  const n = Math.round(clamp(deck.height / 64 - 1, 4, 11));
  const riseH = deck.height / (n + 1);
  const stepW = clamp(vw * 0.05, 60, 86);
  const landing = 0.6;
  const run = (n + 0.5 + landing) * stepW;
  const edge = side === "left" ? deck.left + 10 : deck.right - 10;
  const footPx = side === "left" ? edge + run : edge - run;
  if (footPx < 60 || footPx > vw - 60 || deck.right - deck.left < run + 160) return null;
  const dirUp: 1 | -1 = side === "left" ? -1 : 1;
  const s: Stairs = {
    side,
    dirUp,
    footPx,
    stepW,
    riseH,
    n,
    vw,
    inAt: 150,
    outAt: Number.POSITIVE_INFINITY,
    landing,
    stops: [],
    deck: { left: deck.left, right: deck.right, mode: Math.random() < 0.5 ? "clean" : "wander", reachUp: deck.reachUp },
  };
  // Where they stop along it, working away from the top of the stairs: under
  // two or three of the stat cards to clean them, or just a few spots to
  // look around from.
  const u = (px: number) => (px - footPx) / (dirUp * stepW);
  const top = u(edge);
  const far = u(side === "left" ? deck.right - 40 : deck.left + 40);
  if (s.deck!.mode === "clean") {
    const reach = 58;
    const picked = deck.cards
      .map((b, i) => ({ k: u(b.x + b.w / 2 + dirUp * reach), el: deck.cardEls[i] }))
      .filter(({ k }) => k < top - 0.3 && k > far)
      .sort((a, b) => b.k - a.k)
      .slice(0, 4);
    s.stops = picked.map((p) => p.k);
    s.deck!.cards = picked.map((p) => p.el);
    // Now and then one of them's hanging crooked.
    if (picked.length && Math.random() < 0.35) {
      s.deck!.crooked = { stop: Math.floor(Math.random() * picked.length), deg: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 2) };
    }
    if (s.stops.length === 0) s.deck!.mode = "wander";
  }
  if (s.deck!.mode === "wander") {
    const count = 2 + Math.floor(Math.random() * 2);
    s.stops = Array.from({ length: count }, (_, i) => top - ((top - far) * (i + 0.5 + (Math.random() - 0.5) * 0.4)) / count);
  }
  return s;
}

// Centre of step k (0 = the floor in front of the first step; in between
// for the gaps, and on along the landing past the last step), in px / %.
const stairPx = (s: Stairs, k: number) => s.footPx + s.dirUp * k * s.stepW;
const stairPct = (s: Stairs, k: number) => (stairPx(s, k) / s.vw) * 100;
// The landing is one step up from the last step — its level is also the bob
// anyone standing on it rides. Where it ends, and the two spots along it
// where they stop to work.
const landingLevel = (s: Stairs) => s.n + 1;
const landingEnd = (s: Stairs) => s.n + 0.5 + s.landing;
const landingStops = (s: Stairs) => s.stops;

// A handrail's centre line at step position u: `side` -1 for the near one,
// along the front edge of the steps, +1 for the far one along the back. It
// rises with the flight, then runs level along the landing. x from the
// left, y up from the bottom of the screen, in px.
function railPoint(s: Stairs, u: number, side: 1 | -1) {
  return {
    x: stairPx(s, u) - (side * s.dirUp * DEPTH_X) / 2,
    y: FLOOR + Math.min(u, landingLevel(s)) * s.riseH + (side * DEPTH_Y) / 2 + railH(s),
  };
}

// The same along the second floor, which is level all the way — even out
// over the stairs.
function deckRailPoint(s: Stairs, u: number, side: 1 | -1) {
  return { x: railPoint(s, u, side).x, y: FLOOR + landingLevel(s) * s.riseH + (side * DEPTH_Y) / 2 + DECK_RAIL_H };
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

// From step `from` to step `to` (either way; n + 1 is the landing): going
// up, one slow hop per step and a moment to steady themselves on each,
// facing into the stairs, away from us; coming down, a steady hop after
// hop, watching their feet. Calls `landed(k, at)` as they land on each one.
function climb(steps: Step[], s: Stairs, from: number, to: number, t: number, landed?: (k: number, at: number) => void) {
  const dir = Math.sign(to - from);
  if (dir === 0) return t;
  const up = dir > 0;
  const hop = up ? CLIMB_HOP_MS : CLIMB_DOWN_HOP_MS;
  for (let k = from + dir; up ? k <= to : k >= to; k += dir) {
    steps.push({
      kind: "walk",
      at: t,
      ms: hop,
      x: stairPct(s, k),
      y: k * s.riseH,
      hopMs: hop,
      tread: k || undefined,
      away: up,
      down: !up,
    });
    t += hop;
    landed?.(k, t);
    // Going up, a moment to steady themselves on each step.
    if (up) {
      steps.push({ kind: "wait", at: t, ms: CLIMB_PAUSE_MS, steady: { away: true } });
      t += CLIMB_PAUSE_MS;
    }
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
  /** Starting somewhere other than off the edge of the floor (see panic). */
  entryY?: number;
  entryTread?: number;
  entryFacing?: 1 | -1;
}

function hopTo(steps: Step[], from: number, to: number, t: number, vw: number, face?: 1 | -1) {
  const trip = hopTrip(from, to, vw);
  steps.push({ kind: "walk", at: t, ms: trip.ms, x: to, hopMs: trip.hopMs, face });
  return t + trip.ms;
}

// A patch of glass one of the floor crew has sprayed and called a
// teammate over to wipe.
interface Handoff {
  patch: DustSpeck[];
  /** Where the sprayer stood (% of screen width) and which way they faced. */
  x: number;
  facing: 1 | -1;
  /** How far ahead of and above the sprayer's feet the patch is, in px. */
  ahead: number;
  up: number;
  /** When the spraying's done. */
  readyAt: number;
}

// Going over to wipe patches a teammate has sprayed and called them over
// to — standing where the patch is in front of them, as it was for whoever
// sprayed it. Does the ones sprayed by `by`, or with no `by`, all of them,
// waiting for each as needed. Says where that leaves them, and when.
function wipeForTeammates(steps: Step[], c: Character, x: number, t: number, jobs: Handoff[], vw: number, by?: number) {
  while (jobs.length && (by === undefined || jobs[0].readyAt <= by)) {
    const h = jobs.shift()!;
    t = waitUntil(steps, t, h.readyAt);
    const ahead = c.width / 2 + 26;
    const stand = h.x + (h.facing * (h.ahead - ahead) * 100) / vw;
    t = hopTo(steps, x, stand, t, vw, h.facing);
    x = stand;
    const look = lookToward(c, ahead, h.up);
    steps.push({ kind: "work", at: t, ms: SECOND_JOB_MS, activity: "wipe", look });
    h.patch.forEach((s, i) => (s.clearAt = t + ((i + 0.85) / h.patch.length) * SECOND_JOB_MS));
    t += SECOND_JOB_MS;
    steps.push({ kind: "inspect", at: t, ms: INSPECT_MS, look });
    t += INSPECT_MS;
  }
  return { x, t };
}

// A spot that won't come off: stamping and fuming, the cloth thrown down,
// picked up again — and scrubbed at twice as hard until it finally goes.
function fightStain(steps: Step[], t: number, c: Character, look: Vec, speck: DustSpeck) {
  for (const quirk of ["fume", "fling"] as Quirk[]) {
    steps.push({ kind: "quirk", at: t, ms: QUIRK_MS[quirk], quirk });
    t += QUIRK_MS[quirk];
  }
  steps.push({ kind: "pull", at: t, ms: 450 });
  t += 450;
  steps.push({ kind: "work", at: t, ms: HARD_SCRUB_MS, activity: c.stage2, look, hard: true });
  speck.clearAt = t + HARD_SCRUB_MS * 0.85;
  t += HARD_SCRUB_MS;
  steps.push({ kind: "quirk", at: t, ms: QUIRK_MS.phew, quirk: "phew" });
  return t + QUIRK_MS.phew;
}

function waitUntil(steps: Step[], t: number, until: number) {
  if (until <= t) return t;
  steps.push({ kind: "wait", at: t, ms: until - t });
  return until;
}

// A floor worker doing the rounds of their own stretch of floor: at each
// stop, a patch of glass (or floor, for the mop) on the side they're facing.
// Sprayers spray, then put the bottle away and wipe it with a cloth — or,
// given someone to hand off to (`handoffs`, and `canHandOff` saying whether
// that someone will be free soon enough), sometimes wave them over to wipe
// it instead and move on. The one they wave over gets `helpWith`: the
// patches they've been called to, which they go and wipe between their own.
function buildFloorScript(
  character: Character,
  startAt: number,
  entryX: number,
  stops: number[],
  specks: DustSpeck[],
  vw: number,
  team: { handoffs?: Handoff[]; canHandOff?: (readyAt: number) => boolean; helpWith?: Handoff[]; patches?: DustSpeck[][] } = {}
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
  let stubbornDone = false;

  // Between their own stops, anything they've been called over to by now.
  const helpOut = (by?: number) => {
    if (!team.helpWith) return;
    ({ x, t } = wipeForTeammates(steps, character, x, t, team.helpWith, vw, by));
  };

  stops.forEach((stop, stopIndex) => {
    helpOut(t);
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

    // Dirt of their own at each stop — unless they've been sent to clean up
    // someone else's mess (`patches`), which is already there.
    const given = team.patches?.[stopIndex];
    const count = given?.length ?? 3;
    const glass = mopper ? null : glassPatch(character, stop, 0, facing, count);
    const made = glass ?? floorPatch(character, stop, facing, count);
    const { look } = made;
    const patch = given ?? made.specks;
    const keep = (p: DustSpeck[]) => {
      if (!given) specks.push(...p);
    };
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

    if (sprays && glass && team.handoffs && (team.canHandOff?.(t) ?? true) && Math.random() < HANDOFF_CHANCE) {
      // Waving a teammate over to wipe it, and on to the next one.
      steps.push({ kind: "quirk", at: t, ms: CALL_MS, quirk: "wave" });
      team.handoffs.push({ patch, x: stop, facing, ahead: glass.ahead, up: glass.up, readyAt: t });
      t += CALL_MS;
      keep(patch);
      return;
    }
    if (sprays) {
      steps.push({ kind: "wait", at: t, ms: SWAP_MS });
      t += SWAP_MS;
    }

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

    // Now and then one spot just won't come off.
    const stubborn = !mopper && !given && !stubbornDone && Math.random() < STUBBORN_CHANCE ? patch[patch.length - 1] : null;
    const wiped = stubborn ? patch.slice(0, -1) : patch;
    steps.push({ kind: "work", at: t, ms: SECOND_JOB_MS, activity: character.stage2, look });
    wiped.forEach((s, i) => (s.clearAt = t + ((i + 0.85) / wiped.length) * SECOND_JOB_MS));
    t += SECOND_JOB_MS;
    keep(patch);

    steps.push({ kind: "inspect", at: t, ms: INSPECT_MS, look });
    t += INSPECT_MS;

    if (stubborn) {
      stubbornDone = true;
      t = fightStain(steps, t, character, look, stubborn);
    }
  });

  // Anyone still waiting on them once their own stretch is done.
  helpOut();

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
  mishap: Mishap | null,
  // Up on the second floor: which of its stops they fall off at, if they
  // do; or, taking over from someone who did, just the stops left.
  deck: { fallAt?: number; stops?: number[]; half?: boolean } = {}
) {
  const steps: Step[] = [];
  const landedAt: number[] = [];
  const landed = (step: number, at: number) => (landedAt[step] ??= at);
  let t = hopTo(steps, entryX, stairPct(s, 0), startAt, vw);
  t = waitUntil(steps, t, stairsReadyAt(s));
  let stubbornDone = false;
  const clean = (u: number, y: number, facing: 1 | -1 = s.dirUp, scale = 1) => {
    const { specks: patch, look } = glassPatch(character, stairPct(s, u), y, facing, 3, scale);
    steps.push({ kind: "work", at: t, ms: FIRST_JOB_MS, activity: character.stage1, look });
    t += FIRST_JOB_MS;
    if (character.stage1 === "spray") {
      patch.forEach((p, i) => (p.wetAt = t - FIRST_JOB_MS + 250 + i * 450));
      steps.push({ kind: "wait", at: t, ms: SWAP_MS, steady: { away: false } });
      t += SWAP_MS;
    }
    // Now and then one spot just won't come off, up here too.
    const stubborn = !stubbornDone && Math.random() < STUBBORN_CHANCE ? patch[patch.length - 1] : null;
    const wiped = stubborn ? patch.slice(0, -1) : patch;
    steps.push({ kind: "work", at: t, ms: SECOND_JOB_MS, activity: character.stage2, look });
    wiped.forEach((p, i) => (p.clearAt = t + ((i + 0.85) / wiped.length) * SECOND_JOB_MS));
    t += SECOND_JOB_MS;
    specks.push(...patch);
    steps.push({ kind: "inspect", at: t, ms: INSPECT_MS, look });
    t += INSPECT_MS;
    if (stubborn) {
      stubbornDone = true;
      t = fightStain(steps, t, character, look, stubborn);
    }
  };
  const half = Math.ceil(s.n / 2);
  const level = landingLevel(s);
  const stops = deck.stops ?? landingStops(s);
  const stopAt: number[] = [];
  let fell: { x: number; landAt: number } | null = null;
  // When a crooked card got straightened.
  let straightenedAt: number | null = null;
  if (s.deck) {
    // All the way up to the second floor, then along it — cleaning the
    // stat card above each stop, or just stopping to look about — and back.
    t = climbUp(steps, s, character, 0, level, t, vw, mishap, landed);
    let at = level;
    const away = (-s.dirUp) as 1 | -1;
    for (const [i, u] of stops.entries()) {
      t = alongLanding(steps, s, at, u, t);
      at = u;
      stopAt.push(t);
      if (i === deck.fallAt) {
        // Too near the edge: a wobble, and all the way down.
        steps.push({ kind: "quirk", at: t, ms: QUIRK_MS.teeter, quirk: "teeter" });
        t += QUIRK_MS.teeter;
        steps.push({ kind: "fall", at: t, ms: DECK_FALL_MS, x: stairPct(s, u), y: 0 });
        t += DECK_FALL_MS;
        steps.push({ kind: "quirk", at: t, ms: QUIRK_MS.hurt, quirk: "hurt" });
        fell = { x: stairPx(s, u), landAt: t };
        break;
      }
      // A card hanging crooked: shoved straight first.
      const card = s.deck!.cards?.[landingStops(s).indexOf(u)];
      if (s.deck!.mode === "clean" && card && s.deck!.crooked && landingStops(s)[s.deck!.crooked.stop] === u) {
        steps.push({ kind: "quirk", at: t, ms: QUIRK_MS.shove, quirk: "shove" });
        straightenedAt = t + 250;
        t += QUIRK_MS.shove;
      }
      if (s.deck!.mode === "clean") {
        // Stretching up to the bottom of the card above.
        clean(u, level * s.riseH, away, Math.max(1, s.deck!.reachUp / (character.height * 0.55 + 24)));
      } else {
        const quirk = (["wave", "yawn", "confused", "dance"] as Quirk[])[(i + Math.floor(Math.random() * 4)) % 4];
        steps.push({ kind: "inspect", at: t, ms: INSPECT_MS * 1.6, look: lookToward(character, 60, character.height) });
        t += INSPECT_MS * 1.6;
        steps.push({ kind: "quirk", at: t, ms: QUIRK_MS[quirk], quirk });
        t += QUIRK_MS[quirk];
      }
    }
    if (fell) return { actor: { character, entryX, steps, endAt: t } as FloorActor, landedAt, stopAt, clearAt: t, fell, straightenedAt };
    t = alongLanding(steps, s, at, level, t);
  } else {
    // The glass halfway up on the way (unless someone else is doing that),
    // then each spot along the landing.
    if (deck.half !== false) {
      t = climbUp(steps, s, character, 0, half, t, vw, mishap, landed);
      clean(half, half * s.riseH);
      t = climbUp(steps, s, character, half, level, t, vw, mishap, landed);
    } else {
      t = climbUp(steps, s, character, 0, level, t, vw, mishap, landed);
    }
    let at = level;
    for (const u of stops) {
      if (u !== at) t = alongLanding(steps, s, at, u, t);
      at = u;
      stopAt.push(t);
      clean(u, level * s.riseH);
    }
    if (at !== level) t = alongLanding(steps, s, at, level, t);
  }
  t = climb(steps, s, level, 0, t);
  // Three hops out onto the open floor, clearing the way for the mop.
  const clearX = stairPct(s, 0) - s.dirUp * ((3 * WALK_PX_PER_S * HOP_MS) / 1000 / vw) * 100;
  t = hopTo(steps, stairPct(s, 0), clearX, t, vw);
  return { actor: { character, entryX, steps, endAt: t } as FloorActor, landedAt, stopAt, clearAt: t, fell, straightenedAt };
}

// The mop's last job of the round: every step, bottom to top, then the
// spots along the top where the climber stopped, then back down. Footprints go as the mop passes
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
  t = climb(steps, s, s.n, level, t);
  let at = level;
  landingStops(s).forEach((u, i) => {
    t = alongLanding(steps, s, at, u, t);
    at = u;
    mopHere(landingPrints[i]);
  });
  t = alongLanding(steps, s, at, level, t);
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
  riderQuirks: Partial<Record<string, RiderQuirk>>;
  riderLooks: Partial<Record<string, Vec>>;
  /** Starting partway down the glass rather than above the screen (see panic). */
  entryTop?: string;
  /** The profile picture, polished till it gleams — where (px), how big, and when. */
  shine?: { x: number; y: number; size: number; at: number };
}

const GONDOLA_WIDTH = 240;
const GONDOLA_OFFSCREEN = "-380px";
const GONDOLA_RIDER_SCALE = 0.85;
const GONDOLA_RIDER_GAP = 20;
const GONDOLA_PADDING = 16;

function buildGondolaScript(
  riders: Character[],
  startAt: number,
  specks: DustSpeck[],
  stairs: Stairs | null,
  // When the floor crew are done — they keep washing windows till about then.
  busyUntil = 0
): GondolaActor {
  // A window-washer's route down the glass: across the top, then down into
  // the middle on the side away from the stairs — three patches, so they
  // finish around when the floor crew do.
  const tallestRider = Math.max(...riders.map((r) => r.height));
  // With the second floor across the page, it keeps above it: along the
  // top only, clear of the end the stairs come up at.
  const deckTop = stairs?.deck ? window.innerHeight - FLOOR - landingLevel(stairs) * stairs.riseH : null;
  const aboveDeck = deckTop !== null ? ((deckTop - tallestRider - 50) / window.innerHeight) * 100 : null;
  const stops =
    aboveDeck !== null && stairs
      ? [
          { x: stairs.side === "left" ? 48 : 20, y: aboveDeck },
          { x: stairs.side === "left" ? 78 : 52, y: aboveDeck },
        ]
      : [
          { x: 22, y: 8 },
          { x: 76, y: 10 },
          { x: stairs?.side === "left" ? 66 : stairs ? 34 : 50, y: 34 },
        ];
  const steps: Step[] = [];
  const entryX = stops[0].x;
  let t = startAt;
  let prev: { x: number; y: number } | null = null;
  const workWindows: { at: number; ms: number }[] = [];

  // Each rider cleans the glass by their own hand, not some spot in between.
  const total = riders.reduce((sum, r) => sum + r.width, 0) + GONDOLA_RIDER_GAP * (riders.length - 1);
  const tallest = Math.max(...riders.map((r) => r.height));
  let cursor = -total / 2;
  const riderSpots = riders.map((r) => {
    const center = cursor + r.width / 2;
    cursor += r.width + GONDOLA_RIDER_GAP;
    return { rider: r, center };
  });
  const riderLooks: Partial<Record<string, Vec>> = {};
  let shine: GondolaActor["shine"];

  // First, if it's up there on screen: the profile picture in the corner,
  // dusted off and shined up by whoever's at that end of the platform.
  const pfpEl = document.querySelector("[data-crew-pfp]");
  const pfp = pfpEl ? boxOf(pfpEl) : null;
  if (pfp && pfp.w > 0 && pfp.y + pfp.h > 0 && pfp.y < 160) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const lead = riderSpots[riderSpots.length - 1];
    const leadAhead = (lead.rider.width / 2 + 26) * GONDOLA_RIDER_SCALE;
    const leadUp = (lead.rider.height * 0.55 + 24) * GONDOLA_RIDER_SCALE;
    const cx = pfp.x + pfp.w / 2;
    const cy = pfp.y + pfp.h / 2;
    const gx = cx - lead.center - leadAhead;
    const gTop = cy - tallest + leadUp;
    const at = { x: (gx / vw) * 100, y: (gTop / vh) * 100 };
    steps.push({ kind: "walk", at: t, ms: 2600, x: at.x, top: `${gTop.toFixed(1)}px` });
    t += 2600;
    prev = at;
    const own = new Map<Character, DustSpeck[]>();
    for (const { rider, center } of riderSpots) {
      riderLooks[rider.name] = lookToward(rider, rider.width / 2 + 26, rider.height * 0.55 + 24);
      const list: DustSpeck[] = [];
      for (let i = 0; i < 2; i++) {
        const onPfp = rider === lead.rider;
        const ahead = (rider.width / 2 + 26) * GONDOLA_RIDER_SCALE;
        const up = (rider.height * 0.55 + 24) * GONDOLA_RIDER_SCALE;
        const size = onPfp ? 12 + Math.random() * 6 : 24 + Math.random() * 20;
        list.push({
          left: `${(onPfp ? cx + (i ? 5 : -6) : gx + center + ahead + (Math.random() * 2 - 1) * 14).toFixed(1)}px`,
          top: `${(onPfp ? cy + (i ? 4 : -5) - size * 0.4 : gTop + tallest - up - size * 0.4 + (Math.random() * 2 - 1) * 14).toFixed(1)}px`,
          size,
          floor: false,
          appearAt: 0,
          wetAt: null,
          clearAt: 0,
        });
      }
      own.set(rider, list);
    }
    const sprayAt = t;
    steps.push({ kind: "work", at: t, ms: FIRST_JOB_MS, activity: "spray", look: { x: 1, y: 0 } });
    t += FIRST_JOB_MS;
    steps.push({ kind: "work", at: t, ms: SECOND_JOB_MS, activity: "wipe", look: { x: 1, y: 0 } });
    workWindows.push({ at: t, ms: SECOND_JOB_MS });
    for (const [rider, list] of own) {
      if (rider.stage1 === "spray") {
        list.forEach((d, i) => {
          d.wetAt = sprayAt + 250 + i * 450;
          d.clearAt = t + ((i + 0.85) / list.length) * SECOND_JOB_MS;
        });
      } else {
        list.forEach((d, i) => (d.clearAt = i === 0 ? sprayAt + FIRST_JOB_MS * 0.85 : t + SECOND_JOB_MS * 0.85));
      }
      specks.push(...list);
    }
    t += SECOND_JOB_MS;
    // A last rub till it gleams.
    shine = { x: cx, y: cy, size: Math.max(pfp.w, pfp.h), at: t };
    steps.push({ kind: "inspect", at: t, ms: 900, look: { x: 1, y: 0 } });
    t += 900;
  }

  // While the floor crew are still at it, a few more windows along the same
  // stretch rather than hanging about.
  const perStop = 1500 + FIRST_JOB_MS + SECOND_JOB_MS + 700;
  let more = Math.max(0, Math.floor((busyUntil - (t + stops.length * perStop)) / perStop));
  const route = [...stops];
  while (more-- > 0 && route.length < 12) {
    const base = stops[route.length % stops.length];
    route.push({ x: clamp(base.x + (Math.random() * 2 - 1) * 10, 12, 88), y: base.y + (aboveDeck !== null ? 0 : (Math.random() * 2 - 1) * 4) });
  }

  for (const stop of route) {
    // Lowered in from above the screen first, then along the ropes.
    const ms = prev ? Math.max(1300, (Math.abs(stop.x - prev.x) + Math.abs(stop.y - prev.y)) * GONDOLA_MS_PER_PCT) : 2800;
    steps.push({ kind: "walk", at: t, ms, x: stop.x, top: `${stop.y}%` });
    t += ms;
    prev = stop;

    const patch: DustSpeck[] = [];
    const mine = new Map<DustSpeck, Character>();
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
        mine.set(patch[patch.length - 1], rider);
      }
    }

    // The one with the bottle sprays their bit while the other gets a head
    // start wiping theirs (their first spot); then both wipe until their own
    // bit's clean.
    const sprayAt = t;
    steps.push({ kind: "work", at: t, ms: FIRST_JOB_MS, activity: "spray", look: { x: 1, y: 0 } });
    t += FIRST_JOB_MS;
    steps.push({ kind: "work", at: t, ms: SECOND_JOB_MS, activity: "wipe", look: { x: 1, y: 0 } });
    workWindows.push({ at: t, ms: SECOND_JOB_MS });
    for (const { rider } of riderSpots) {
      const own = patch.filter((d) => mine.get(d) === rider);
      if (rider.stage1 === "spray") {
        own.forEach((d, i) => {
          d.wetAt = sprayAt + 250 + i * 450;
          d.clearAt = t + ((i + 0.85) / own.length) * SECOND_JOB_MS;
        });
      } else {
        own.forEach((d, i) => (d.clearAt = i === 0 ? sprayAt + FIRST_JOB_MS * 0.85 : t + SECOND_JOB_MS * 0.85));
      }
    }
    t += SECOND_JOB_MS;
    specks.push(...patch);

    steps.push({ kind: "inspect", at: t, ms: 700, look: { x: 1, y: 0 } });
    t += 700;
  }

  // Up on the gondola one of them sometimes has a moment while the other
  // keeps working — nobody slips off a platform, though.
  const riderQuirks: Partial<Record<string, RiderQuirk>> = {};
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

  return { riders, entryX, steps, endAt: t, riderQuirks, riderLooks, shine };
}

// ------------------------------------------------------------ the rescue

// Now and then, up on the second floor, whoever's up there misses the edge
// and falls all the way down — and doesn't get up. An ambulance comes,
// lights flashing; two paramedics hop out with a stretcher, lift them on
// and carry them back to it, and it reverses away. Someone else from the
// crew comes in and finishes their job up there.

type MedicName = "medic1" | "medic2";

// The paramedics: the crew's flat style again, in teal and green scrubs,
// with a white cap and a red cross.
const MEDICS: Record<MedicName, Character> = {
  medic1: {
    name: "medic1",
    color: "#3fa7b5",
    width: 50,
    height: 104,
    shape: "block",
    radius: "8px 8px 2px 2px",
    stage1: "wipe",
    stage2: "wipe",
    blinkDelay: "500ms",
    medic: true,
  },
  medic2: {
    name: "medic2",
    color: "#4fb58a",
    width: 72,
    height: 78,
    shape: "blob",
    radius: "50% 50% 14px 14px / 70% 70% 14px 14px",
    stage1: "wipe",
    stage2: "wipe",
    blinkDelay: "1800ms",
    medic: true,
  },
};

// How often it happens, on a round up to the second floor with someone
// spare to take over.
const DECK_FALL_CHANCE = 1 / 3;
const DECK_FALL_MS = 950;
const AMBULANCE_W = 210;
const AMBULANCE_H = 104;
// Where the side door is along it, from its back end.
const AMBULANCE_DOOR = 70;
const STRETCHER_L = 150;
const STRETCHER_Y = 30;
const CARRY_PX_PER_S = 120;

interface RescuePlan {
  /** px from the left of the ambulance when parked, and which way it faces. */
  left: number;
  dir: 1 | -1;
  frames: Frame[];
  door: Frame[];
  /** The stretcher: where it sits when it's by the door (px, its middle), and its moves from there. */
  stretcherX: number;
  stretcher: Frame[];
  medics: FloorActor[];
  endAt: number;
}

// The ambulance's visit, from the moment `x` (px) hits the floor at
// `landAt`: in from the nearer edge, the paramedics out with the stretcher,
// onto it and back, and away. Adds being carried off to `injured`.
function planRescue(injured: FloorActor, x: number, landAt: number, vw: number): RescuePlan {
  const pct = (px: number) => (px / vw) * 100;
  // In from the nearer edge, pulling up short of them with the door on
  // their side.
  const dir: 1 | -1 = x < vw / 2 ? 1 : -1;
  const doorX = x - dir * (STRETCHER_L / 2 + 110);
  const left = dir === 1 ? doorX - (AMBULANCE_W - AMBULANCE_DOOR) : doorX - AMBULANCE_DOOR;
  const off = dir === 1 ? -(left + AMBULANCE_W + 40) : vw - left + 40;
  const driveMs = Math.max(2200, (Math.abs(off) / 260) * 1000);
  const inAt = landAt + 1200;
  const parkedAt = inAt + driveMs;
  const doorOpen = parkedAt + 500;

  // The stretcher between the two of them, the way they're going: medic1
  // at the front going out, medic2 at the back.
  const reach = (c: Character) => STRETCHER_L / 2 + 8 + c.width / 2;
  const stretcherAtDoor = doorX;
  const outMs = Math.max(800, (Math.abs(x - doorX) / CARRY_PX_PER_S) * 1000);
  const outAt = doorOpen + 500;
  const atPatient = outAt + outMs;
  const liftAt = atPatient + 900;
  const backAt = liftAt + 700;
  const loadAt = backAt + outMs;
  const inside = loadAt + 700;
  const doorShut = inside + 300;
  const outDrive = Math.max(2200, (Math.abs(off) / 260) * 1000);
  const goneAt = doorShut + 400 + outDrive;

  const medicSteps = (c: Character, side: 1 | -1): FloorActor => {
    const hops = (ms: number) => ms / Math.max(1, Math.round(ms / HOP_MS));
    const at = (center: number) => pct(center + side * dir * reach(c));
    const steps: Step[] = [
      { kind: "aboard", at: 0, ms: outAt - 1 },
      // Hopping down out of the door.
      { kind: "walk", at: outAt - 1, ms: 1, x: at(stretcherAtDoor), hopMs: 1 },
      { kind: "walk", at: outAt, ms: outMs, x: at(x), hopMs: hops(outMs) },
      // Stooping to lift them on.
      { kind: "pull", at: atPatient, ms: liftAt + 600 - atPatient },
      { kind: "wait", at: liftAt + 600, ms: backAt - liftAt - 600 },
      { kind: "walk", at: backAt, ms: outMs, x: at(stretcherAtDoor), hopMs: hops(outMs) },
      { kind: "wait", at: loadAt, ms: inside - loadAt },
      { kind: "gone", at: inside, ms: 0 },
    ];
    return { character: c, entryX: at(stretcherAtDoor), steps, endAt: inside };
  };

  // Lying there until they're lifted on, then carried to the door, and in.
  const lie = injured.steps[injured.steps.length - 1];
  lie.ms = liftAt - lie.at;
  injured.steps.push(
    { kind: "walk", at: liftAt, ms: 600, x: pct(x), y: STRETCHER_Y, hopMs: 600, carried: true },
    { kind: "wait", at: liftAt + 600, ms: backAt - liftAt - 600, lying: true },
    { kind: "walk", at: backAt, ms: outMs, x: pct(stretcherAtDoor), y: STRETCHER_Y, hopMs: outMs, carried: true },
    { kind: "wait", at: loadAt, ms: 500, lying: true },
    { kind: "gone", at: loadAt + 500, ms: 0 }
  );
  injured.endAt = loadAt + 500;

  const bounce = (ms: number): Frame[] => [
    [ms, { transform: `translateX(${dir * 5}px)` }, "ease-in-out"],
    [ms + 260, { transform: `translateX(${-dir * 2}px)` }, "ease-in-out"],
    [ms + 520, { transform: "translateX(0px)" }],
  ];
  return {
    left,
    dir,
    frames: [
      [0, { transform: `translateX(${off}px)` }],
      [inAt, { transform: `translateX(${off}px)` }, "cubic-bezier(0.2, 0.6, 0.3, 1)"],
      ...bounce(parkedAt),
      [doorShut + 400, { transform: "translateX(0px)" }, "cubic-bezier(0.5, 0, 0.9, 0.6)"],
      [goneAt, { transform: `translateX(${off}px)` }],
    ],
    door: [
      [0, { transform: "translateX(0px)" }],
      [doorOpen - 300, { transform: "translateX(0px)" }, "ease-in-out"],
      [doorOpen, { transform: `translateX(${-44}px)` }],
      [inside, { transform: `translateX(${-44}px)` }, "ease-in-out"],
      [doorShut, { transform: "translateX(0px)" }],
    ],
    stretcherX: stretcherAtDoor,
    stretcher: [
      [0, { transform: "translateX(0px)", opacity: 0 }],
      [outAt - 2, { transform: "translateX(0px)", opacity: 0 }],
      [outAt - 1, { transform: "translateX(0px)", opacity: 1 }, "linear"],
      [atPatient, { transform: `translateX(${(x - stretcherAtDoor).toFixed(1)}px)`, opacity: 1 }],
      [backAt, { transform: `translateX(${(x - stretcherAtDoor).toFixed(1)}px)`, opacity: 1 }, "linear"],
      [loadAt, { transform: "translateX(0px)", opacity: 1 }],
      [loadAt + 500, { transform: "translateX(0px)", opacity: 1 }],
      [loadAt + 501, { transform: "translateX(0px)", opacity: 0 }],
    ],
    medics: [medicSteps(MEDICS.medic1, 1), medicSteps(MEDICS.medic2, -1)],
    endAt: goneAt,
  };
}

// The ambulance and its stretcher, playing their keyframes over the round.
function Ambulance({ plan, total }: { plan: RescuePlan; total: number }) {
  const root = useRef<HTMLDivElement>(null);
  const door = useRef<HTMLDivElement>(null);
  const stretcher = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anims = [
      root.current?.animate(track(plan.frames, total), { duration: total, fill: "both" }),
      door.current?.animate(track(plan.door, total), { duration: total, fill: "both" }),
      stretcher.current?.animate(track(plan.stretcher, total), { duration: total, fill: "both" }),
    ];
    return () => anims.forEach((a) => a?.cancel());
  }, [plan, total]);
  return (
    <>
      <div
        ref={root}
        className="absolute"
        data-crew-machine="ambulance"
        data-crew-dir={plan.dir}
        style={{ left: plan.left, bottom: FLOOR - 2, width: AMBULANCE_W, height: AMBULANCE_H, zIndex: 2 }}
      >
        <div className="absolute inset-0" style={{ transform: plan.dir === -1 ? "scaleX(-1)" : undefined }}>
          <svg width={AMBULANCE_W} height={AMBULANCE_H} viewBox={`0 0 ${AMBULANCE_W} ${AMBULANCE_H}`} className="absolute inset-0 overflow-visible" aria-hidden="true">
            {/* the box at the back, the cab at the front */}
            <rect x={4} y={16} width={148} height={70} rx={8} fill="#f7f8fb" stroke="#c9ced9" strokeWidth={2} />
            <path d="M150,86 L150,40 Q150,34 156,34 L184,34 Q192,34 196,42 L206,62 L206,86 Z" fill="#f7f8fb" stroke="#c9ced9" strokeWidth={2} />
            <path d="M158,40 L182,40 Q187,40 189,45 L196,60 L158,60 Z" fill="#bfe3f7" />
            <Driver x={168} y={43} color="#3fa7b5" size={13} />
            <rect x={4} y={62} width={202} height={9} fill="#e0564f" />
            {/* a red cross on the side */}
            <rect x={98} y={27} width={10} height={30} rx={1.5} fill="#e0564f" />
            <rect x={88} y={37} width={30} height={10} rx={1.5} fill="#e0564f" />
            {/* lights on the roof */}
            <rect className="crew-siren" x={20} y={9} width={14} height={8} rx={3} fill="#e0564f" />
            <rect className="crew-siren crew-siren-b" x={128} y={9} width={14} height={8} rx={3} fill="#3b82f6" />
            {[36, 176].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy={AMBULANCE_H - 16} r={15} fill="#2b2f36" />
                <circle cx={cx} cy={AMBULANCE_H - 16} r={6} fill="#9aa3b5" />
              </g>
            ))}
          </svg>
          {/* The side door, sliding open. */}
          <div
            className="absolute overflow-hidden"
            style={{ left: AMBULANCE_DOOR - 20, top: 20, width: 88, height: 62 }}
          >
            <div className="absolute inset-y-0" style={{ left: 20, width: 44, backgroundColor: "#2b2f36" }} />
            <div
              ref={door}
              className="absolute inset-y-0 rounded-sm"
              style={{ left: 20, width: 44, backgroundColor: "#eef0f5", border: "2px solid #c9ced9" }}
            />
          </div>
        </div>
      </div>
      {/* The stretcher. */}
      <div
        ref={stretcher}
        className="absolute"
        style={{ left: plan.stretcherX - STRETCHER_L / 2, bottom: FLOOR + STRETCHER_Y - 10, width: STRETCHER_L, height: 12, zIndex: 4, opacity: 0 }}
      >
        <div className="absolute inset-x-0 top-0 rounded-md" style={{ height: 8, backgroundColor: "#f7f8fb", border: "2px solid #c9ced9" }} />
        <div className="absolute rounded-full" style={{ left: 6, right: 6, top: 8, height: 3, backgroundColor: "#9aa3b5" }} />
      </div>
    </>
  );
}

// ------------------------------------------------------------ the round

interface RoundPlan {
  kind: "clean";
  floor: FloorActor[];
  gondola: GondolaActor | null;
  stairs: Stairs | null;
  /** Someone fell off the second floor: the ambulance come for them. */
  rescue?: RescuePlan | null;
  /** A stat card hanging crooked until it's straightened (at `fixAt`). */
  crooked?: { el: Element; deg: number; fixAt: number } | null;
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

  // Stairs, if there's room: half the time right up to the second floor, if
  // the page has one.
  const deck = vw >= STAIRS_MIN_VW && Math.random() < 0.5 ? findDeck(vw, vh) : null;
  const stairs = vw >= STAIRS_MIN_VW ? ((deck && makeDeckStairs(vw, deck)) ?? makeStairs(vw, vh)) : null;
  const riderNames =
    cast.length >= 3 ? (["yellow", "black", "purple"] as Name[]).filter((n) => cast.includes(n)).slice(0, 2) : [];
  const floorNames = cast.filter((n) => !riderNames.includes(n));

  const dust: DustSpeck[] = [];
  const climberName = stairs ? (floorNames.find((n) => n !== "orange") ?? null) : null;
  const mopperName: Name | null = floorNames.includes("orange") ? "orange" : null;
  // Sometimes a second one goes up too, and they share the stops up there.
  const secondName =
    stairs && climberName && Math.random() < 0.6 ? (floorNames.find((n) => n !== climberName && n !== "orange") ?? null) : null;
  const others = floorNames.filter((n) => n !== climberName && n !== mopperName && n !== secondName);

  // The open floor, away from the stairs — everyone comes on from that side.
  const footPct = stairs ? stairPct(stairs, 0) : 0;
  const [lo, hi] = !stairs ? [6, 94] : stairs.side === "left" ? [footPct + 5, 94] : [6, footPct - 5];
  const from: "left" | "right" = stairs?.side === "left" ? "right" : "left";
  const entryX = from === "left" ? -12 : 112;

  // Whether anyone on the stairs misses their footing this round, who, on
  // which step (never the bottom two — there'd be nowhere to fall), and
  // whether the rail saves them.
  // Up to the second floor, the climber might fall off it — if there's
  // someone spare to come and take over.
  const spare = ALL_NAMES.find((n) => !cast.includes(n) && !exclude.includes(n)) ?? null;
  const deckFall =
    stairs?.deck && climberName && spare && Math.random() < DECK_FALL_CHANCE ? Math.floor(Math.random() * stairs.stops.length) : null;
  // Who does which stops up top: with two of them, the first takes the
  // ones nearest the top of the stairs (and the glass halfway up), the
  // second the rest. (Not when someone's about to fall off.)
  const splitAt = stairs && secondName && deckFall === null ? Math.ceil(stairs.stops.length / 2) : null;
  const onStairs = [deckFall === null ? climberName : null, stairs ? mopperName : null].filter((n): n is Name => n !== null);
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
  let climberStopAt: number[] = [];
  let rescue: RescuePlan | null = null;
  let takingOver: FloorActor | null = null;
  let straightenAt: number | null = null;

  if (climberName && stairs) {
    const c = buildClimberScript(
      CHARACTERS[climberName],
      stairs,
      startAt,
      entryX,
      dust,
      vw,
      mishapFor === climberName ? mishap : null,
      deckFall !== null ? { fallAt: deckFall } : splitAt !== null ? { stops: stairs.stops.slice(0, splitAt) } : {}
    );
    floor.push(c.actor);
    climberClearAt = c.clearAt;
    landedAt = c.landedAt;
    climberStopAt = c.stopAt;
    straightenAt = c.straightenedAt;
    if (splitAt !== null && secondName) {
      // Right behind them up the stairs.
      const two = buildClimberScript(CHARACTERS[secondName], stairs, startAt + 2600, entryX, dust, vw, null, {
        stops: stairs.stops.slice(splitAt),
        half: false,
      });
      floor.push(two.actor);
      climberClearAt = Math.max(climberClearAt, two.clearAt);
      climberStopAt = [...climberStopAt, ...two.stopAt];
      straightenAt = straightenAt ?? two.straightenedAt;
      startAt += 700;
    }
    if (c.fell && spare && deckFall !== null) {
      // The ambulance for them, and the spare one in to finish up there.
      rescue = planRescue(c.actor, c.fell.x, c.fell.landAt, vw);
      floor.push(...rescue.medics);
      const rest = stairs.stops.slice(deckFall);
      const r = buildClimberScript(CHARACTERS[spare], stairs, c.fell.landAt + 1500, entryX, dust, vw, null, { stops: rest });
      floor.push(r.actor);
      takingOver = r.actor;
      climberClearAt = r.clearAt;
      climberStopAt = [...climberStopAt.slice(0, deckFall), ...r.stopAt];
      straightenAt = straightenAt ?? r.straightenedAt;
      cast.push(spare);
    }
    startAt += 700;
  }

  // Lanes: the mop's is the one nearest the stairs, so it works its way
  // toward them.
  const laneNames: Name[] = [...others, ...(mopperName ? [mopperName] : [])];
  if (from === "right") laneNames.reverse();
  // Who the sprayers on the floor wave over to wipe for them now and then:
  // another of the glass crew on the floor — the one without a spray
  // bottle, if there is one — or failing that, whoever did the stairs, once
  // they're back down, as long as that's only a few seconds off. Everyone
  // else is scripted first, so the helper knows what they've been called
  // over for.
  const lanes = laneNames.map((name, i) => ({
    name,
    startAt: startAt + i * 700,
    stops: laneStops(lo, hi, laneNames.length, i, name === mopperName && stairs ? 2 : 3, from),
  }));
  startAt += laneNames.length * 700;
  const glassCrew = laneNames.filter((n) => n !== mopperName);
  const laneHelper =
    glassCrew.length >= 2 ? (glassCrew.find((n) => CHARACTERS[n].stage1 !== "spray") ?? glassCrew[0]) : null;
  const climber = climberName ? (rescue ? (takingOver ?? undefined) : floor.find((a) => a.character.name === climberName)) : undefined;
  const handoffs: Handoff[] = [];
  const team =
    laneHelper || climber
      ? { handoffs, canHandOff: laneHelper ? undefined : (readyAt: number) => climberClearAt <= readyAt + 6000 }
      : {};
  for (const lane of lanes.filter((l) => l.name !== laneHelper)) {
    floor.push(buildFloorScript(CHARACTERS[lane.name], lane.startAt, entryX, lane.stops, dust, vw, lane.name === mopperName ? {} : team));
  }
  const helpWith = [...handoffs].sort((a, b) => a.readyAt - b.readyAt);
  const helperLane = lanes.find((l) => l.name === laneHelper);
  if (helperLane) {
    floor.push(buildFloorScript(CHARACTERS[helperLane.name], helperLane.startAt, entryX, helperLane.stops, dust, vw, { helpWith }));
  } else if (climber && helpWith.length > 0) {
    const lastWalk = [...climber.steps].reverse().find((st): st is WalkStep => st.kind === "walk")!;
    climber.endAt = wipeForTeammates(climber.steps, climber.character, lastWalk.x, climber.endAt, helpWith, vw).t;
  }

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
      footprint(u, level, climberStopAt[i] ?? stepLandedAt(stairs, level) + 200)
    );
    const mop = floor.find((a) => a.character.name === mopperName)!;
    addStairMopping(mop, stairs, climberClearAt, treads, landingPrints, vw, mishapFor === mopperName ? mishap : null);
  }

  const floorDone = Math.max(0, ...floor.map((a) => a.endAt));
  const gondola = riderNames.length > 0 ? buildGondolaScript(riderNames.map((n) => CHARACTERS[n]), 60, dust, stairs, floorDone) : null;

  const endAt = Math.max(wrapUp(floor, gondola, stairs, entryX, vw), (rescue as RescuePlan | null)?.endAt ?? 0);

  return {
    kind: "clean",
    floor,
    gondola,
    stairs,
    rescue,
    crooked:
      stairs?.deck?.crooked && stairs.deck.cards && straightenAt !== null
        ? { el: stairs.deck.cards[stairs.deck.crooked.stop], deg: stairs.deck.crooked.deg, fixAt: straightenAt }
        : null,
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

// Everyone waits for the slowest to finish, celebrates together, then they
// head off one by one — off the open-floor side, away from the stairs,
// which lift away behind them. Says when the last of it's done.
function wrapUp(floor: FloorActor[], gondola: GondolaActor | null, stairs: Stairs | null, entryX: number, vw: number) {
  const actors: { steps: Step[]; endAt: number; isGondola: boolean }[] = [
    ...floor
      .filter((a) => a.steps[a.steps.length - 1]?.kind !== "gone")
      .map((a) => ({ steps: a.steps, endAt: a.endAt, isGondola: false })),
    ...(gondola ? [{ steps: gondola.steps, endAt: gondola.endAt, isGondola: true }] : []),
  ];
  const cheerAt = Math.max(...actors.map((a) => a.endAt)) + 300;
  let endAt = 0;
  actors.forEach((a, i) => {
    // Done before the others: not just standing there — a yawn, a foot
    // tapping, a look round for them, a sit down, a wander — till the rest
    // are finished.
    let t = a.endAt;
    if (!a.isGondola) {
      let x = [...a.steps].reverse().find((s): s is WalkStep => s.kind === "walk")?.x ?? entryX;
      let last: string | null = null;
      while (cheerAt - t > 3200) {
        const options: [string, number][] = [
          ["yawn", 2],
          ["tap", 3],
          ["lookout", 2],
          ["sit", 2],
          ["wander", 3],
        ];
        const pick = weightedPick(options.filter(([k]) => k !== last));
        last = pick;
        if (pick === "wander") {
          const to = clamp(x + (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 6), 4, 96);
          t = hopTo(a.steps, x, to, t, vw);
          x = to;
        } else {
          const quirk = pick as Quirk;
          a.steps.push({ kind: "quirk", at: t, ms: QUIRK_MS[quirk], quirk });
          t += QUIRK_MS[quirk];
        }
      }
    }
    if (cheerAt > t) a.steps.push({ kind: "wait", at: t, ms: cheerAt - t });
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
  return endAt;
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
function positionAt(
  steps: Step[],
  index: number,
  entry: { x: number; top?: string; y?: number; tread?: number; facing?: 1 | -1 }
) {
  let x = entry.x;
  let y = entry.y ?? 0;
  let top = entry.top;
  let facing: 1 | -1 = entry.facing ?? (entry.x > 50 ? -1 : 1);
  let tread: number | undefined = entry.tread || undefined;
  let lastTread = entry.tread ?? 0;
  for (let i = 0; i <= index && i < steps.length; i++) {
    const s = steps[i];
    if (s.kind === "walk") {
      if (s.x !== x) facing = s.x > x ? 1 : -1;
      if (s.face) facing = s.face;
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

// The welder's glue: a bucket of it from the cement mixer, and a trowel to
// spread it on with.
function CementBucket() {
  return (
    <svg width="28" height="30" viewBox="0 -6 28 30" aria-hidden="true">
      <path d="M7,5 C7,-6 21,-6 21,5" fill="none" stroke="#6b7280" strokeWidth="2.5" />
      <path d="M2,5 L26,5 L22,23 L6,23 Z" fill="#9aa3b5" stroke="#6b7280" strokeWidth="1.5" />
      <ellipse cx="14" cy="6" rx="11" ry="2.5" fill="#6f7580" />
    </svg>
  );
}

function Trowel() {
  return (
    <svg width="32" height="20" viewBox="0 0 32 20" aria-hidden="true">
      <rect x="0" y="8" width="11" height="4" rx="2" fill="#b07d4f" />
      <path d="M11,10 L15,10 M15,4 L31,10 L15,16 Z" fill="#c3cad8" stroke="#8d97aa" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M22,7 L30,10 L22,13 Z" fill="#8e949e" />
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
  | "shock"
  | "angry";

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
// Mouths in the same dark ink as the eyes, like the login characters':
// mostly a plain closed line. Really happy (celebrating), a big open grin —
// dark lips still, red only inside.
function Mouth({ width, expression, block }: { width: number; expression: Expression; block: boolean }) {
  if (expression === "yeah") {
    const w = width * 0.32;
    const h = w * 0.55;
    const mouth = `M1.5,1.5 L${w - 1.5},1.5 Q${w - 1.5},${h} ${w / 2},${h} Q1.5,${h} 1.5,1.5 Z`;
    return (
      <svg width={w} height={h} aria-hidden="true" className="overflow-visible">
        <defs>
          <clipPath id={`grin-${Math.round(w * 10)}`}>
            <path d={mouth} />
          </clipPath>
        </defs>
        <path d={mouth} fill="#c0392b" />
        <ellipse cx={w / 2} cy={h} rx={w * 0.26} ry={h * 0.34} fill="#f28b82" clipPath={`url(#grin-${Math.round(w * 10)})`} />
        <path d={mouth} fill="none" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      </svg>
    );
  }
  if (expression === "yawn") {
    return <div className="crew-yawn rounded-full" style={{ width: width * 0.2, height: width * 0.26, backgroundColor: INK }} />;
  }
  if (expression === "angry") {
    // A frown: the smile turned upside down.
    const w = width * 0.26;
    const h = w * 0.3;
    return (
      <svg width={w} height={h} aria-hidden="true" className="overflow-visible">
        <path d={`M1.5,${h} Q${w / 2},${-h + 2} ${w - 1.5},${h}`} stroke={INK} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      </svg>
    );
  }
  if (expression === "squeeze" || expression === "shock") {
    const o = expression === "shock" ? 13 : 10;
    return <div className="rounded-full" style={{ width: o, height: o, border: `3px solid ${INK}` }} />;
  }
  if (expression === "confused" || expression === "dizzy") {
    return (
      <svg width={width * 0.3} height="10" viewBox="0 0 30 10" aria-hidden="true">
        <path d="M2,5 Q6,1 10,5 T18,5 T26,5" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  // Pressed tight in concentration, or just the plain line.
  const w = width * (expression === "focus" ? (block ? 0.2 : 0.14) : 0.28);
  return <div className="rounded-full" style={{ width: w, height: block ? 3 : 3.5, backgroundColor: INK }} />;
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
      {/* Brows down, cross. */}
      {expression === "angry" &&
        [-1, 1].map((side) => (
          <div
            key={side}
            className="absolute rounded-full"
            style={{
              top: eyesTop - 7,
              left: width / 2 + side * (eyeSize * 0.5 + width * (block ? 0.08 : 0.06)) - eyeSize * 0.55,
              width: eyeSize * 1.1,
              height: 3,
              transform: `rotate(${side * -18}deg)`,
              backgroundColor: INK,
            }}
          />
        ))}
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
        <Mouth width={width} expression={expression} block={block} />
      </div>
    </div>
  );
}

// ============================================================ gear by mode

type Mode = Activity | "carry" | "raise" | "scratch" | "hi" | "brow" | "backfire" | "flail" | "hang" | "none";

function Gear({ character, mode, bucketDown, holding }: { character: Character; mode: Mode; bucketDown: boolean; holding?: Activity }) {
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
  if (mode === "type") return <Laptop character={character} />;
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
    // Spraying with the bottle, wiping and polishing with a cloth, mopping
    // with the mop; cheering with their last tool held up; otherwise
    // (carrying, waving, scratching their head...) whatever they last used —
    // not suddenly their spray bottle again as they step back to admire the
    // glass they've just wiped.
    const jobs: Mode[] = ["spray", "wipe", "polish", "dunk", "mopFloor", "mopStep", "weld", "glue"];
    const tool = mode === "raise" ? stage2 : jobs.includes(mode) ? mode : (holding ?? stage1);
    const isSpray = tool === "spray";
    const isMop = tool === "dunk" || tool === "mopFloor";
    const isTorch = tool === "weld";
    const isLaptop = tool === "type";
    const isGlue = tool === "glue";
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
    } else if (mode === "glue") {
      wrapperClass = "crew-wipe-arc";
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
          ) : isTorch ? (
            <Torch lit={mode === "weld"} />
          ) : isGlue ? (
            mode === "glue" ? (
              <div className="absolute" style={{ left: -4, top: -10 }}>
                <Trowel />
              </div>
            ) : (
              <div className="absolute" style={{ left: -14, top: -4 }}>
                <CementBucket />
              </div>
            )
          ) : isLaptop ? (
            <div className="absolute rounded-sm" style={{ left: -22, top: -6, width: 34, height: 6, background: "#9aa3b5", border: "1.5px solid #6b7280" }} />
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
  if (quirk === "fume" || quirk === "fling") {
    return (
      <>
        {/* A grumble cloud over their head. */}
        <div
          className="crew-grumble absolute flex items-center justify-center rounded-full bg-[#3a3f4a] font-black text-white shadow-md"
          style={{ left: width / 2 - 24, top: -48, width: 48, height: 30, fontSize: 13, letterSpacing: 1 }}
        >
          <span style={unmirror}>#@!</span>
        </div>
        {quirk === "fling" && (
          <div className="crew-fling absolute" style={{ left: width - 26, top: height * 0.45 - 14, "--drop": `${height * 0.55}px` } as React.CSSProperties}>
            <Cloth />
          </div>
        )}
      </>
    );
  }
  if (quirk === "call") {
    return (
      <div
        className="crew-pop absolute flex items-center justify-center rounded-full bg-white shadow-md"
        style={{ left: width * 0.62, top: -46, width: 40, height: 30, fontSize: 16 }}
      >
        <span style={unmirror}>💻?</span>
      </div>
    );
  }
  if (quirk === "startle") {
    return (
      <div
        className="crew-pop absolute flex items-center justify-center rounded-full bg-white text-lg font-black text-[#e0564f] shadow-md"
        style={{ left: width / 2 - 15, top: -46, width: 30, height: 30 }}
      >
        <span style={unmirror}>!</span>
      </div>
    );
  }
  if (quirk === "slip" || quirk === "dazed" || quirk === "bonk" || quirk === "hurt") {
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
  /** What's in their hand when they're not using it: whatever they last worked with. */
  holding?: Activity;
  /** Scrubbing hard (see HARD_SCRUB_MS). */
  hard?: boolean;
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
    // Caught at it: a jump, arms flying.
    case "startle":
      return { ...base, mode: "flail", expression: "shock", bodyClass: "crew-startle", bucketDown: false };
    // Knocked flat (by a tumble or a collision): up again fast, seeing stars.
    case "bonk":
      return { ...base, mode: "none", expression: "dizzy", bodyClass: "crew-bonk", bucketDown: false };
    // Heaving a broken piece back where it goes before running for it.
    case "shove":
      return { ...base, mode: "raise", expression: "squeeze", bodyClass: "crew-nod", bucketDown: false };
    // That spot's still there: stamping about, fuming.
    case "fume":
      return { ...base, expression: "angry", bodyClass: "crew-stomp", bucketDown: false };
    // On the phone to the coders.
    case "call":
      return { ...base, mode: "brow", expression: "look", bodyClass: "crew-nod", gaze: { x: 0.4, y: -0.4 } };
    // The party: heaving the coders up, and the coders flying.
    case "heave":
      return { ...base, mode: "raise", expression: "yeah", bodyClass: "crew-heave", bucketDown: false };
    case "tossed":
      return { ...base, mode: "raise", expression: "yeah", bodyClass: "crew-tossed", bucketDown: false };
    // Waiting on the others: tapping a foot, shading their eyes to look
    // out for them, or sitting down for a bit.
    case "tap":
      return { ...base, expression: "look", bodyClass: "crew-tap", gaze: { x: 0.3, y: 0.6 } };
    case "lookout":
      return { ...base, mode: "brow", expression: "look", bodyClass: "", gaze: { x: 1, y: -0.2 } };
    case "sit":
      return { ...base, expression: "content", bodyClass: "crew-sit", bucketDown: true };
    // Flat on their back, seeing stars.
    case "hurt":
      return { ...base, mode: "none", expression: "dizzy", bodyClass: "crew-lie", bucketDown: false };
    // ...and throwing the cloth down.
    case "fling":
      return { ...base, mode: "none", expression: "angry", bodyClass: "crew-stomp", bucketDown: false };
  }
}

function poseFor(step: Step | undefined, cheerStyle: CheerStyle, facing: 1 | -1, moonwalk: boolean): Pose {
  const base: Pose = { ...BASE_POSE, facing };
  if (!step) return { ...base, bucketDown: false };
  switch (step.kind) {
    case "walk":
      if (step.carried) {
        return { ...base, mode: "none", expression: "dizzy", bodyClass: "crew-lie", bucketDown: false, quirk: "hurt" };
      }
      if (step.panic) {
        return {
          ...base,
          mode: step.holding ? "carry" : "flail",
          expression: "shock",
          bodyClass: "",
          hopMs: step.hopMs ?? RUN_HOP_MS,
          run: true,
          lean: -10,
          bucketDown: false,
        };
      }
      return {
        ...base,
        expression: step.down ? "focus" : "walk",
        gaze: step.down ? { x: 0.25, y: 0.95 } : null,
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
      if (step.activity === "type") {
        return { ...base, mode: "type", expression: "focus", bodyClass: "crew-seated", gaze: step.look, bucketDown: false };
      }
      // Eyes on the patch, leaning in toward it a little.
      return {
        ...base,
        mode: step.activity,
        expression: step.hard ? "angry" : "focus",
        bodyClass: "crew-work",
        gaze: step.look,
        lean: -step.look.x * (step.hard ? 7 : 4),
        bucketDown: step.activity !== "mopStep",
        hard: step.hard,
      };
    case "inspect":
      // Step back, look over the spot just cleaned, a satisfied nod.
      return { ...base, expression: "look", bodyClass: "crew-nod", gaze: step.look, lean: -step.look.x * 2 };
    case "quirk":
      return quirkPose(step.quirk, facing);
    case "fall":
      // Tumbling off backwards, over and over, landing flat on their back —
      // having dropped everything, if they're running for it.
      return { ...base, mode: step.panic ? "flail" : base.mode, expression: "shock", bodyClass: "crew-tumble", bucketDown: false };
    case "dangle":
      // Swinging from their hands on the rail, then kicking to get back up.
      return { ...base, mode: "hang", expression: "squeeze", bodyClass: "crew-dangle", bucketDown: false, bodyOrigin: "50% -6px" };
    case "wait":
      // Steadying themselves on a step — bucket still in hand, and still
      // facing into the stairs if they're on the way up.
      if (step.steady) return { ...base, bucketDown: false, back: step.steady.away };
      if (step.panic) return { ...base, mode: "flail", expression: "shock", bodyClass: "", hopMs: PANIC_HOP_MS, run: true, bucketDown: false };
      if (step.lying) return { ...base, mode: "none", expression: "dizzy", bodyClass: "crew-lie", bucketDown: false, quirk: "hurt" };
      return base;
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
    <div className={`relative ${pose.hard ? "crew-hard" : ""}`} style={{ width, height }}>
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
                  {pose.back && <Gear character={character} mode={pose.mode} bucketDown={pose.bucketDown} holding={pose.holding} />}
                  <Body character={character} />
                  <Workwear character={character} />
                  {pose.back ? (
                    <Peek character={character} />
                  ) : character.coder ? (
                    <MonitorFace character={character} expression={pose.expression} />
                  ) : (
                    <Face character={character} expression={pose.expression} gaze={pose.gaze} />
                  )}
                  {!pose.back && <Gear character={character} mode={pose.mode} bucketDown={pose.bucketDown} holding={pose.holding} />}
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
  if (step?.kind === "gone" || step?.kind === "aboard") return null;
  if (index === -1 && actor.steps[0]?.kind === "aboard") return null;
  const { x, y, facing, tread, lastTread } = positionAt(actor.steps, index, {
    x: actor.entryX,
    y: actor.entryY,
    tread: actor.entryTread,
    facing: actor.entryFacing,
  });
  const isLeaving = step?.kind === "walk" && index === actor.steps.length - 2;
  const lastWork = actor.steps.slice(0, index + 1).findLast((st) => st.kind === "work");
  const holding = lastWork?.kind === "work" ? lastWork.activity : undefined;
  // Walking: linear, so the ground covered keeps pace with the hops.
  // Falling (or dropping onto the rail): gathering speed as they go down.
  const gravity = "cubic-bezier(0.55, 0, 0.9, 0.5)";
  let travel = "none";
  if (step?.kind === "walk") travel = `left ${step.ms}ms linear, bottom ${step.ms}ms linear`;
  else if (step?.kind === "fall") travel = `left ${step.ms}ms ease-out, bottom ${step.ms}ms ${gravity}`;
  else if (step?.kind === "dangle") travel = `left ${DANGLE_DROP_MS}ms ease-out, bottom ${DANGLE_DROP_MS}ms ${gravity}`;
  // On the stairs (or falling off, or hanging from the rail) they're between
  // the two rails. Back on the floor they're in front of the whole flight —
  // walking back round underneath it to have another go, the near rail and
  // its posts would otherwise cut right across them.
  const onFloor = !tread && step?.kind !== "fall" && step?.kind !== "dangle";
  return (
    <div
      className="absolute"
      data-crew-actor={actor.character.name}
      data-crew-tread={tread ?? 0}
      data-crew-facing={facing}
      style={{ left: `${x}%`, bottom: FLOOR + y, zIndex: onFloor ? 5 : 3, transition: travel }}
    >
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
        <Figure character={actor.character} pose={{ ...poseFor(step, cheerStyle, facing, moonwalk && isLeaving), holding }} />
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
  panic = false,
  holding,
}: {
  character: Character;
  step: Step | undefined;
  quirk: RiderQuirk | undefined;
  look: Vec;
  cheerStyle: CheerStyle;
  panic?: boolean;
  holding?: Activity;
}) {
  const quirkActive = useActiveWindow(quirk ? quirk.at : null, quirk ? quirk.ms : 0);
  let pose: Pose;
  if (panic) {
    // Caught at it, and being hauled away up the glass.
    pose = { ...BASE_POSE, mode: "flail", expression: "shock", bodyClass: "crew-startle" };
  } else if (quirkActive && quirk && step?.kind === "work") {
    pose = quirkPose(quirk.quirk, 1);
  } else if (step?.kind === "walk") {
    // Riding, not walking — just enjoying the view.
    pose = { ...poseFor(undefined, cheerStyle, 1, false), expression: "walk", bodyClass: "crew-idle", gaze: look };
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
    // Between jobs: eyes on the glass, not on whoever's watching.
    if (step?.kind !== "cheer") pose = { ...pose, gaze: pose.gaze ?? look };
  }
  return (
    <div style={{ transform: `scale(${GONDOLA_RIDER_SCALE})`, transformOrigin: "bottom center" }}>
      <Figure character={character} pose={{ ...pose, bucketDown: false, holding }} />
    </div>
  );
}

function Gondola({ actor, cheerStyle, panic = false }: { actor: GondolaActor; cheerStyle: CheerStyle; panic?: boolean }) {
  const index = useStepIndex(actor.steps);
  const step = actor.steps[index];
  if (step?.kind === "gone") return null;
  const { x, top } = positionAt(actor.steps, index, { x: actor.entryX, top: actor.entryTop ?? GONDOLA_OFFSCREEN });
  // Each rider's own part of the last job: the bottle, or the cloth.
  const lastWork = actor.steps.slice(0, index + 1).findLast((st) => st.kind === "work");
  const heldBy = (c: Character): Activity | undefined =>
    lastWork?.kind === "work" ? (lastWork.activity === "spray" ? c.stage1 : c.stage2) : undefined;
  // Yanked up and away when they're caught, rather than eased.
  const ease = panic ? "cubic-bezier(0.55, 0, 1, 0.45)" : "cubic-bezier(0.45, 0.05, 0.4, 1)";
  return (
    <div
      className="absolute"
      data-crew-gondola
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
              panic={panic}
              holding={heldBy(c)}
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
  // The second floor, if that's where it goes: a long platform right across
  // the page, from one end (step position) to the other, posts all along.
  const u = (px: number) => (px - s.footPx) / (dirUp * stepW);
  const deck = s.deck && { a: u(s.deck.left + DEPTH_X / 2 + 4), b: u(s.deck.right - DEPTH_X / 2 - 4) };
  const along = (a: number, b: number, every: number) => {
    const count = Math.max(1, Math.round((Math.abs(b - a) * stepW) / every));
    return Array.from({ length: count + 1 }, (_, i) => a + ((b - a) * i) / count);
  };
  const slabs = [
    ...Array.from({ length: n }, (_, i) => {
      const k = i + 1;
      const post = k - 0.5 + inset;
      return { k, mid: k, length: stepW - SLAB_GAP, near: [post], far: [post], flat: false };
    }),
    deck && s.deck
      ? {
          k: level,
          mid: u((s.deck.left + s.deck.right) / 2),
          length: s.deck.right - s.deck.left - DEPTH_X,
          near: along(deck.a, deck.b, 130),
          far: along(deck.a, deck.b, 260),
          flat: true,
        }
      : {
          k: level,
          mid: (n + 0.5 + start + landingEnd(s)) / 2,
          length: (landingEnd(s) - n - 0.5 - start) * stepW,
          near: [level, (level + lastPost) / 2, lastPost],
          far: [level],
          flat: false,
        },
  ];
  const railFrom = 0.5 + inset - 8 / stepW;
  const railTo = lastPost + 8 / stepW;
  return (
    <>
      {slabs.map(({ k, mid, length, near, far, flat }) => {
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
          const rail = flat ? deckRailPoint(s, u, side) : railPoint(s, u, side);
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
      {deck ? (
        <>
          {/* Along the second floor: behind them, and in front. */}
          <RailBar s={s} from={deckRailPoint(s, deck.a, 1)} to={deckRailPoint(s, deck.b, 1)} far />
          <RailBar s={s} from={deckRailPoint(s, deck.a, -1)} to={deckRailPoint(s, deck.b, -1)} />
        </>
      ) : (
        <RailBar s={s} from={railPoint(s, level, -1)} to={railPoint(s, railTo, -1)} />
      )}
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
        data-crew-actor={character.name}
        data-crew-tread={0}
        data-crew-facing={facing}
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
  // (Mess left for the next round to clean isn't cleared in this one.)
  if (Number.isFinite(speck.clearAt)) animations.push(`crew-dust-clear 500ms ease-in ${speck.clearAt}ms forwards`);
  const bob = speck.tread ? `, ${stepBob(speck.tread)}` : "";
  const place = { left: speck.left, top: speck.top, bottom: speck.bottom };
  const grime =
    speck.mess === "rubble"
      ? // Broken bits and plaster dust.
        "radial-gradient(circle at 22% 55%, #8b8478 0 9%, transparent 10%), radial-gradient(circle at 48% 40%, #6f685e 0 11%, transparent 12%), radial-gradient(circle at 74% 60%, #9a9286 0 8%, transparent 9%), radial-gradient(ellipse at 50% 60%, rgba(160,150,135,0.5), transparent 70%)"
      : speck.mess === "cement"
        ? // A grey puddle of cement.
          "radial-gradient(ellipse at 45% 55%, rgba(142,148,158,0.9), rgba(142,148,158,0.55) 55%, transparent 72%)"
        : speck.mess === "tyre"
        ? // A tyre mark: a dark smear with tread lines.
          "repeating-linear-gradient(90deg, rgba(40,40,44,0.5) 0 5px, rgba(40,40,44,0.25) 5px 9px)"
        : speck.floor
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
      {Number.isFinite(speck.clearAt) && (
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
      )}
    </>
  );
}

// A stat card hanging crooked off one corner until someone up on the second
// floor shoves it straight (`fixAt` ms into the round) — the real card,
// turned with the `rotate` property so nothing else about it is touched.
// Gives back how to put it right straight away.
function hangCrooked({ el, deg, fixAt }: { el: Element; deg: number; fixAt: number }): () => void {
  const origin = deg > 0 ? "0% 0%" : "100% 0%";
  const anim = el.animate(
    [
      { rotate: `${deg}deg`, transformOrigin: origin },
      { rotate: `${deg}deg`, transformOrigin: origin, offset: 0.999 },
      { rotate: "0deg", transformOrigin: origin },
    ],
    { duration: fixAt + 1, fill: "backwards" }
  );
  const jolt = setTimeout(
    () => el.animate([{ rotate: `${-deg * 0.3}deg` }, { rotate: "0deg" }], { duration: 280, easing: "ease-out" }),
    fixAt
  );
  return () => {
    anim.cancel();
    clearTimeout(jolt);
  };
}

// The profile picture polished till it gleams: a flash of light sweeping
// across it, and a sparkle.
function Shine({ x, y, size, at }: { x: number; y: number; size: number; at: number }) {
  return (
    <>
      <div className="absolute overflow-hidden rounded-full" style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, zIndex: 3 }}>
        <div
          className="crew-gleam absolute"
          style={{
            left: -size,
            top: -size / 2,
            width: size * 0.45,
            height: size * 2,
            background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.9), rgba(255,255,255,0))",
            animationDelay: `${at}ms`,
          }}
        />
      </div>
      <span
        className="absolute"
        style={{
          left: x + size * 0.28,
          top: y - size * 0.9,
          zIndex: 3,
          fontSize: 22,
          lineHeight: 1,
          color: "#f2b632",
          textShadow: "0 0 8px rgba(242,182,50,0.7)",
          animation: `crew-sparkle-pop 900ms ease-out ${at + 250}ms both`,
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

// ============================================================ maintenance

// Now and then — about one idle round in three — something on the dashboard
// breaks: a stat card falls off, the end of a bar snaps off a bar chart, a
// chart card cracks, or a slice pops out of the donut, either hit by an
// asteroid or just giving way. A construction crew turns up with a crane
// truck and puts it right, and as they drive off the cleaning crew comes in
// behind them to clean up the mess they've left. Nothing is really broken:
// while it plays out the real thing is only hidden (a stand-in does the
// falling) or nudged, and it's all put back the moment anyone moves the
// mouse.
const REPAIR_CHANCE = 1 / 3;
// Rolling in slow and heavy, and out a little quicker.
const DRIVE_IN_MS = 8000;
const DRIVE_OUT_MS = 6000;
const BOOM_MS = 1500;
const HOOK_MS = 1300;
const LIFT_MS = 2800;
const BOLT_MS = 1600;
const WELD_MS = 2600;
// The truck, drawn facing right: how big it is, where the crane's turret
// sits (from the back of the truck, and above the floor), and how long the
// boom is when it's folded down along it.
const TRUCK_W = 240;
const TRUCK_H = 90;
const PIVOT_X = 50;
const PIVOT_UP = 54;
const STOWED_BOOM = 170;
const STOWED_ANGLE = 3;
// The hook's catch hangs this far below the end of the cable, and the
// welder's platform this far below the catch.
const HOOK_DROP = 16;
const PLATFORM_HANG = 46;
const CABLE_STOWED = 22;

type BreakKind = "card" | "bar" | "crack" | "slice" | "top";

// The construction crew: two new faces in the same flat style, in hard hats
// and hi-vis vests (see Workwear).
const BUILDERS: Record<BuilderName, Character> = {
  foreman: {
    name: "foreman",
    color: "#3c7d6e",
    width: 54,
    height: 110,
    shape: "block",
    radius: "9px 9px 2px 2px",
    stage1: "weld",
    stage2: "weld",
    blinkDelay: "300ms",
    vest: "#d4f53c",
  },
  welder: {
    name: "welder",
    color: "#9a6b4f",
    width: 78,
    height: 72,
    shape: "blob",
    radius: "50% 50% 12px 12px / 78% 78% 12px 12px",
    stage1: "weld",
    stage2: "weld",
    blinkDelay: "1500ms",
    vest: "#ff8a1f",
  },
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

// A property's values at points through the round, as keyframes spanning
// the whole of it (`total` ms) — each with the easing into the next.
type Frame = [at: number, style: Keyframe, easing?: string];
function track(frames: Frame[], total: number): Keyframe[] {
  const out: Keyframe[] = [];
  let last = 0;
  frames.forEach(([at, style, easing], i) => {
    last = Math.max(at, last);
    const offset = clamp(last / total, 0, 1);
    if (i === 0 && offset > 0) out.push({ ...style, offset: 0 });
    out.push({ ...style, offset, ...(easing ? { easing } : {}) });
  });
  if ((out[out.length - 1].offset as number) < 1) out.push({ ...frames[frames.length - 1][1], offset: 1 });
  return out;
}

// Shown only between two moments.
const showBetween = (from: number, to: number, total: number) =>
  track(
    [
      [0, { opacity: 0 }],
      [from, { opacity: 0 }],
      [from + 1, { opacity: 1 }],
      [to, { opacity: 1 }],
      [to + 1, { opacity: 0 }],
    ],
    total
  );

// Faded in at `from`, and slowly back out from `to`, as it dries.
const fadeBetween = (from: number, to: number, total: number) =>
  track(
    [
      [0, { opacity: 0 }],
      [from, { opacity: 0 }],
      [from + 200, { opacity: 1 }],
      [to, { opacity: 1 }],
      [to + 900, { opacity: 0 }],
    ],
    total
  );

// A crack right across a piece `w` by `h`, for while it's the broken one.
const crackAcross = (w: number, h: number) =>
  [0, 1, 2, 3, 4, 5].map((i) => `${i ? "L" : "M"}${(w * (0.1 + i * 0.16)).toFixed(1)},${(h * (0.3 + i * 0.08) + (i % 2 ? -1 : 1) * h * 0.12).toFixed(1)}`).join(" ");

const GRAVITY = "cubic-bezier(0.5, 0, 0.9, 0.5)";
const SETTLE = "cubic-bezier(0.2, 0.7, 0.3, 1)";

// The stand-in that does the falling, in place of the real thing.
type StandIn =
  | { kind: "clone"; box: Box; origin: string }
  | { kind: "bar"; box: Box; color: string; round: "left" | "right" }
  | { kind: "slice"; box: Box; d: string; fill: string; origin: string };

interface RepairPlan {
  kind: "repair";
  target: Element;
  endAt: number;
  /** Always empty — the cleaning crew are all free for levers meanwhile. */
  cast: Name[];
  standIn: StandIn | null;
  standInMoves: Keyframe[];
  standInShows: Keyframe[];
  /** The crane truck, unless it's a job for the tower crane. */
  truck: { left: number; dir: 1 | -1; moves: Keyframe[]; wheels: Keyframe[] } | null;
  boom: { moves: Keyframe[]; counter: Keyframe[]; cable: Keyframe[] } | null;
  /** When the welder's riding the platform that hangs from the hook, if there is one. */
  rider: Keyframe[] | null;
  asteroid: { from: Vec; at: Vec; flight: Keyframe[] } | null;
  crack: { box: Box; d: string; length: number; draw: Keyframe[]; tilt: Keyframe[]; torchShows: Keyframe[]; torch: Keyframe[] } | null;
  sparks: { x: number; y: number; shows: Keyframe[] }[];
  puffs: { x: number; y: number; at: number; big: boolean }[];
  chunks: { from: Vec; to: Vec; at: number; ms: number }[];
  builders: FloorActor[];
  debris: DustSpeck[];
  /** The tower crane, digger, cement mixer and forklift that came along. */
  machines: MachinePlan[];
  /** Stairs up to the second floor, if they're fixing it from up there. */
  stairs?: Stairs | null;
  /** The heap of rubble that came down on the piece, for the digger (see planMachines). */
  heap?: { x: number; w: number; h: number; frames: Keyframe[] } | null;
  /** Filler sprayed into the holes, and the glue seam round the piece once it's back — both drying off. */
  patches?: { x: number; y: number; shows: Keyframe[] }[];
  seam?:
    | (({ kind: "box"; box: Box; radius: number } | { kind: "line"; x: number; y: number; h: number } | { kind: "path"; box: Box; d: string }) & {
        shows: Keyframe[];
      })
    | null;
  /** On the stand-in: a crack while it's the broken one, glue once it's been spread on. */
  marks?: { cracked: Keyframe[] | null; glued: Keyframe[] | null };
  /** Things done to the real element along the way... */
  effects: { at: number; run: () => void }[];
  realMoves: { keyframes: Keyframe[]; options: KeyframeAnimationOptions }[];
  /** ...and putting it all back. */
  restore: () => void;
}

interface Breakable {
  kind: BreakKind;
  el: Element;
  box: Box;
  chart?: Element;
}

// Everything on screen that could break: stat cards, chart cards, bars in
// bar charts, and slices of the donut — as long as it's fully in view, and
// clear of the very top of the screen and of the floor.
function findBreakables(vw: number, vh: number): Breakable[] {
  const fits = (b: Box) => b.w > 12 && b.h > 8 && b.x >= 8 && b.x + b.w <= vw - 8 && b.y >= 48 && b.y + b.h <= vh - 140;
  const found: Breakable[] = [];
  // Up in the top bar: the clock, the profile picture, the notifications bell.
  document.querySelectorAll("[data-crew-clock], [data-crew-pfp], [data-crew-bell]").forEach((el) => {
    const box = boxOf(el);
    if (box.w > 8 && box.h > 8 && box.y >= 0 && box.y + box.h <= 90 && box.x >= 8 && box.x + box.w <= vw - 8) found.push({ kind: "top", el, box });
  });
  document.querySelectorAll("[data-crew-card]").forEach((el) => {
    const box = boxOf(el);
    if (fits(box)) found.push({ kind: "card", el, box });
  });
  document.querySelectorAll("[data-crew-chart]").forEach((chart) => {
    const box = boxOf(chart);
    if (fits(box)) found.push({ kind: "crack", el: chart, box });
    chart.querySelectorAll(".recharts-bar-rectangle path").forEach((el) => {
      const b = boxOf(el);
      if (fits(b) && b.w >= 36) found.push({ kind: "bar", el, box: b, chart });
    });
    const slices = chart.querySelectorAll(".recharts-pie-sector path");
    if (slices.length >= 2) {
      slices.forEach((el) => {
        const b = boxOf(el);
        if (fits(b) && b.w >= 14 && b.h >= 14) found.push({ kind: "slice", el, box: b, chart });
      });
    }
  });
  return found;
}

// Plans a break-and-repair round, measured off the page as it is now — or
// null if there's nothing on screen to break.
function planRepair(): RepairPlan | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const floorY = vh - FLOOR;
  const pct = (px: number) => (px / vw) * 100;
  const all = findBreakables(vw, vh);
  const kinds = [...new Set(all.map((b) => b.kind))];
  if (kinds.length === 0) return null;
  const breakKind = kinds[Math.floor(Math.random() * kinds.length)];
  const options = all.filter((b) => b.kind === breakKind);
  const target = options[Math.floor(Math.random() * options.length)];
  // Up in the top bar: a job for the tower crane instead.
  if (breakKind === "top") return planTopRepair(target, vw, vh);
  // A stat card: sometimes they go up to it on the second floor instead.
  if (breakKind === "card" && Math.random() < DECK_REPAIR_CHANCE) {
    const fromDeck = planDeckCardRepair(target, vw, vh);
    if (fromDeck) return fromDeck;
  }
  const asteroid = Math.random() < 0.5;
  const { el, box } = target;
  const welder = BUILDERS.welder;
  const foreman = BUILDERS.foreman;

  const t0 = 400;
  // Hit by the asteroid, or creaking a while and then giving way.
  const breakAt = t0 + (asteroid ? 700 : 1300);
  const effects: RepairPlan["effects"] = [];
  const realMoves: RepairPlan["realMoves"] = [];
  const undo: (() => void)[] = [];
  const debris: DustSpeck[] = [];
  const puffs: RepairPlan["puffs"] = [];
  const chunks: RepairPlan["chunks"] = [];
  const boltSpots: Vec[] = [];

  // The real thing, hidden from `at` (or clipped short) until it's fixed.
  const hideReal = (at: number, clip?: string) => {
    const style = (el as HTMLElement).style;
    const before = clip ? style.clipPath : style.visibility;
    const set = (v: string) => (clip ? (style.clipPath = v) : (style.visibility = v));
    effects.push({ at, run: () => set(clip ?? "hidden") });
    undo.push(() => set(before));
  };
  // The real thing creaking, before it goes.
  const creak = (keyframes: Keyframe[]) => realMoves.push({ keyframes, options: { delay: t0, duration: breakAt - t0, easing: "ease-in-out" } });

  // The stand-in's movements, as a running position (translate px, rotate
  // deg) so each move carries on from the last.
  const pos = { x: 0, y: 0, r: 0 };
  const moves: Frame[] = [[0, { transform: "translate(0px, 0px) rotate(0deg)" }]];
  const moveTo = (at: number, x: number, y: number, r: number, easing?: string) => {
    Object.assign(pos, { x, y, r });
    moves.push([at, { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg)` }, easing]);
  };
  const wobble = (from: number, to: number, deg: number) => {
    for (let i = 0; i <= 7; i++) moveTo(from + ((to - from) * i) / 7, 0, 0, i === 7 ? 0 : (i % 2 ? -1 : 1) * deg * (0.4 + (0.6 * i) / 7), "ease-in-out");
  };

  // --- what breaks ----------------------------------------------------------
  let standIn: StandIn | null = null;
  let piece: Box = box; // the stand-in's own shape, where it sits unbroken
  let impact: Vec;
  let landAt: number;
  let hookX: number; // where the crane's hook has to come down, and go up
  let topShift = { x: 0, y: 0 }; // where the stand-in is when it's lifted back up
  const crackPts: Vec[] = [];
  let showFrom = breakAt;

  if (breakKind === "card") {
    const hingeLeft = Math.random() < 0.5;
    const s = hingeLeft ? 1 : -1;
    const origin = hingeLeft ? "0% 0%" : "100% 0%";
    standIn = { kind: "clone", box, origin };
    impact = { x: hingeLeft ? box.x + box.w - 12 : box.x + 12, y: box.y + 12 };
    if (!asteroid) creak([0, 1, -1, 1.4, -1.2, 1.8, 0].map((a) => ({ transform: `rotate(${a * s}deg)`, transformOrigin: origin })));
    hideReal(breakAt);
    // Swings down off one corner, hangs there a moment, then drops flat.
    const dy = floorY - box.y - box.h;
    moveTo(breakAt, 0, 0, 0, "cubic-bezier(0.3, 0, 0.3, 1)");
    moveTo(breakAt + 260, 0, 0, 30 * s, "ease-in-out");
    moveTo(breakAt + 520, 0, 0, 18 * s, "ease-in-out");
    moveTo(breakAt + 720, 0, 0, 25 * s, "ease-in-out");
    moveTo(breakAt + 900, 0, 0, 23 * s, GRAVITY);
    landAt = breakAt + 1550;
    moveTo(landAt, 0, dy, 0, "ease-out");
    moveTo(landAt + 130, 0, dy - 12, -1.5 * s, "ease-in");
    moveTo(landAt + 280, 0, dy, 0);
    hookX = box.x + box.w / 2;
    boltSpots.push(
      { x: box.x + 8, y: box.y + 8 },
      { x: box.x + box.w - 8, y: box.y + 8 },
      { x: box.x + 8, y: box.y + box.h - 8 },
      { x: box.x + box.w - 8, y: box.y + box.h - 8 }
    );
  } else if (breakKind === "bar") {
    const pw = Math.min(box.w * 0.45, 70);
    const bars = [...(target.chart?.querySelectorAll(".recharts-bar-rectangle path") ?? [])].map(boxOf);
    const growsRight = Math.abs(box.x - Math.min(...bars.map((b) => b.x))) < 2;
    piece = { x: growsRight ? box.x + box.w - pw : box.x, y: box.y, w: pw, h: box.h };
    standIn = { kind: "bar", box: piece, color: el.getAttribute("fill") || "#385bc1", round: growsRight ? "right" : "left" };
    impact = { x: piece.x + piece.w / 2, y: piece.y + piece.h / 2 };
    // Its end is swapped for the stand-in as soon as it starts to go.
    showFrom = asteroid ? breakAt : t0;
    hideReal(showFrom, growsRight ? `inset(0 ${pw}px 0 0)` : `inset(0 0 0 ${pw}px)`);
    if (!asteroid) wobble(t0, breakAt, 5);
    // Snaps off and tumbles down, landing flat.
    const dy = floorY - piece.y - piece.h;
    const spin = growsRight ? 180 : -180;
    moveTo(breakAt, 0, 0, 0, GRAVITY);
    landAt = breakAt + 750;
    moveTo(landAt, 0, dy, spin, "ease-out");
    moveTo(landAt + 120, 0, dy - 8, spin, "ease-in");
    moveTo(landAt + 240, 0, dy, spin);
    hookX = piece.x + piece.w / 2;
    boltSpots.push({ x: growsRight ? piece.x : piece.x + piece.w, y: piece.y + piece.h / 2 });
  } else if (breakKind === "slice") {
    const svgBox = boxOf((el as SVGGraphicsElement).ownerSVGElement!);
    const slices = [...(target.chart?.querySelectorAll(".recharts-pie-sector path") ?? [])].map(boxOf);
    const pie = {
      x: (Math.min(...slices.map((b) => b.x)) + Math.max(...slices.map((b) => b.x + b.w))) / 2,
      y: (Math.min(...slices.map((b) => b.y)) + Math.max(...slices.map((b) => b.y + b.h))) / 2,
    };
    const mid = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const len = Math.hypot(mid.x - pie.x, mid.y - pie.y) || 1;
    topShift = { x: ((mid.x - pie.x) / len) * 22, y: ((mid.y - pie.y) / len) * 22 };
    standIn = {
      kind: "slice",
      box: svgBox,
      d: el.getAttribute("d") || "",
      fill: el.getAttribute("fill") || "#385bc1",
      origin: `${(mid.x - svgBox.x).toFixed(1)}px ${(mid.y - svgBox.y).toFixed(1)}px`,
    };
    impact = mid;
    showFrom = asteroid ? breakAt : t0;
    hideReal(showFrom);
    if (!asteroid) wobble(t0, breakAt, 6);
    // Pops out, hangs there a moment, and drops (it rolls away once we know
    // which side the truck's coming from).
    moveTo(breakAt, 0, 0, 0, "cubic-bezier(0.2, 1.6, 0.4, 1)");
    moveTo(breakAt + 250, topShift.x, topShift.y, 0);
    moveTo(breakAt + 600, topShift.x, topShift.y, 0, GRAVITY);
    landAt = breakAt + 1300;
    moveTo(landAt, topShift.x, floorY - box.y - box.h, 0, "ease-out");
    hookX = mid.x + topShift.x;
    boltSpots.push(mid);
  } else {
    // A crack across a chart card, which sags a little on one side.
    const cw = Math.min(150, box.w * 0.42);
    const cx = box.x + box.w * (0.4 + Math.random() * 0.2);
    const cy = box.y + box.h * (0.35 + Math.random() * 0.25);
    for (let i = 0; i <= 6; i++) crackPts.push({ x: cx - cw / 2 + (cw * i) / 6, y: cy + (i % 2 ? -1 : 1) * (4 + Math.random() * 8) });
    impact = crackPts[0];
    hookX = cx;
    landAt = breakAt + 400;
    if (!asteroid) creak([0, 1.5, -1.5, 2, -2, 1, 0].map((x) => ({ transform: `translateX(${x}px)` })));
  }

  // --- the truck parks clear of the fallen piece, on whichever side has room
  const standBox: Box =
    breakKind === "crack"
      ? { x: hookX - 45, y: floorY - 20, w: 90, h: 20 }
      : { x: piece.x + (breakKind === "slice" ? topShift.x : 0), y: floorY - piece.h, w: piece.w, h: piece.h };
  const gap = 90; // room for the foreman between the truck and the piece
  const leftPivot = standBox.x - gap - TRUCK_W + PIVOT_X;
  const rightPivot = standBox.x + standBox.w + gap + TRUCK_W - PIVOT_X;
  const leftFits = leftPivot - PIVOT_X >= -40;
  const rightFits = rightPivot + PIVOT_X <= vw + 40;
  // (With room either side, the side that leaves the other machines the most
  // room to work on the far side of it.)
  const dir: 1 | -1 =
    leftFits && rightFits
      ? vw - (standBox.x + standBox.w) > standBox.x
        ? 1
        : -1
      : leftFits
        ? 1
        : rightFits
          ? -1
          : leftPivot > vw - rightPivot
            ? 1
            : -1;
  const pivot = { x: dir === 1 ? leftPivot : rightPivot, y: floorY - PIVOT_UP };
  const truckLeft = dir === 1 ? pivot.x - PIVOT_X : pivot.x - (TRUCK_W - PIVOT_X);

  // The slice rolls on away from where the truck will be.
  const rollDx = dir * 80;
  if (breakKind === "slice") {
    moveTo(landAt + 110, pos.x, pos.y - 10, dir * 20, "ease-in");
    moveTo(landAt + 220, pos.x + dir * 10, pos.y + 10, dir * 40, "ease-out");
    moveTo(landAt + 900, pos.x - dir * 10 + rollDx, pos.y, dir * 220);
    landAt += 900;
  }

  // --- the boom: long enough, and steep enough, to hang the hook right
  // over the piece and lift it all the way back up -------------------------
  const crackY = breakKind === "crack" ? impact.y : 0;
  // Where the hook's catch has to get to: the stand-in's top edge back in
  // place (or the welder's platform, with his torch at the crack)...
  const topCatch = breakKind === "crack" ? crackY + welder.height * 0.55 - PLATFORM_HANG : piece.y + topShift.y;
  const tip = { x: hookX, y: topCatch - HOOK_DROP - 40 };
  const boomLen = Math.hypot(tip.x - pivot.x, pivot.y - tip.y);
  const boomAngle = (Math.atan2(pivot.y - tip.y, Math.abs(tip.x - pivot.x)) * 180) / Math.PI;
  const cableTop = topCatch - HOOK_DROP - tip.y;

  // --- the schedule ----------------------------------------------------------
  const truckInAt = landAt + 600;
  const parkedAt = truckInAt + DRIVE_IN_MS;
  const boomUpAt = parkedAt + 300;
  const boomUpEnd = boomUpAt + BOOM_MS;
  const entryX = dir === 1 ? -8 : 108;
  const toward = (x: number, from: number): 1 | -1 => (x >= from ? 1 : -1);
  const lookUp = (c: Character) => lookToward(c, 10, 700);

  // --- the mess: rubble where it hit the floor (or plaster dust sifting down
  // under a crack), and bits knocked flying by an asteroid.
  const pieceRubble: DustSpeck[] = [];
  if (breakKind === "crack") debris.push(floorDebris(hookX - 22, breakAt + 1400, "rubble"), floorDebris(hookX + 28, breakAt + 1700, "mud"));
  else pieceRubble.push(floorDebris(hookX - piece.w * 0.3, landAt, "rubble"), floorDebris(hookX + piece.w * 0.3, landAt + 60, "rubble"));
  if (asteroid) {
    for (let i = 0; i < 3; i++) {
      const to = { x: clamp(impact.x + (Math.random() * 2 - 1) * 160, 20, vw - 20), y: floorY - 4 };
      const ms = 700 + Math.random() * 400;
      chunks.push({ from: impact, to, at: breakAt, ms });
      debris.push(floorDebris(to.x, breakAt + ms, "rubble"));
    }
  }

  // --- the machines, and what they do before the hook comes for it.
  const workZone: [number, number] = [
    standBox.x - 90 + Math.min(0, breakKind === "slice" ? rollDx : 0),
    standBox.x + standBox.w + 90 + Math.max(0, breakKind === "slice" ? rollDx : 0),
  ];
  const lying = { ...pos };
  const holes: Vec[] =
    breakKind === "card"
      ? boltSpots.slice(0, 3)
      : breakKind === "bar"
        ? [-0.3, 0, 0.3].map((f) => ({ x: boltSpots[0].x, y: boltSpots[0].y + f * piece.h }))
        : breakKind === "slice"
          ? [boltSpots[0], { x: boltSpots[0].x - 8, y: boltSpots[0].y + 6 }]
          : [crackPts[1], crackPts[3], crackPts[5]];
  const work = planMachines({
    vw,
    floorY,
    count: Number(weightedPick<"2" | "3">([
      ["2", 1],
      ["3", 1],
    ])),
    truckSpan: [truckLeft - 20, truckLeft + TRUCK_W + 20],
    workZone,
    side: dir,
    arriveFrom: truckInAt + 1500,
    piece:
      breakKind === "card" || breakKind === "bar"
        ? {
            left: piece.x,
            right: piece.x + piece.w,
            h: piece.h,
            at: landAt + 300,
            canShove: true,
            move: (at, dx, up, easing) => moveTo(at, lying.x + dx, lying.y - up, lying.r, easing),
          }
        : null,
    targetX: hookX,
    glue: breakKind !== "crack",
    holes,
    pieceRubble,
    debris,
  });
  // ...and down on the floor (or up on the forklift's forks, or a pallet).
  const floorCatch = breakKind === "crack" ? floorY - 2 - PLATFORM_HANG : floorY - piece.h - work.raisedBy;
  const cableFloor = floorCatch - HOOK_DROP - tip.y;

  // Both walk in behind the truck: the foreman to stand between it and the
  // piece, the welder round the far side of it (or in front, if there's a
  // forklift there) — fetching the glue first if the mixer's brought some,
  // and pushing the slice back first if it rolled off, or onto the platform
  // for a crack.
  const foremanSteps: Step[] = [];
  const welderSteps: Step[] = [];
  const foremanX = pct(dir === 1 ? standBox.x - 45 : standBox.x + standBox.w + 45);
  let ft = hopTo(foremanSteps, entryX, foremanX, parkedAt - 2600, vw, dir);
  let wt = parkedAt - 2000;
  const farSide = pct(dir === 1 ? standBox.x + standBox.w + 42 : standBox.x - 42);
  let welderFrom = entryX;
  let gluePickedAt: number | null = null;
  if (work.glue) {
    const g = work.glue;
    const pieceRight = hookX > g.x;
    const standX = pct(pieceRight ? g.x + 12 : g.x - 12 - welder.width);
    wt = hopTo(welderSteps, entryX, standX, Math.max(wt, g.at - hopTrip(entryX, standX, vw).ms - 400), vw, (pieceRight ? -1 : 1) as 1 | -1);
    wt = waitUntil(welderSteps, wt, g.at);
    welderSteps.push({ kind: "work", at: wt, ms: 700, activity: "glue", look: lookToward(welder, 24, 6) });
    gluePickedAt = wt + 350;
    wt += 700;
    welderFrom = standX;
  }
  if (breakKind === "slice") {
    const behind = farSide + pct(rollDx);
    wt = hopTo(welderSteps, welderFrom, behind, wt, vw, (-dir) as 1 | -1);
    const trip = hopTrip(behind, farSide, vw);
    wt = waitUntil(welderSteps, wt, landAt + 200);
    welderSteps.push({ kind: "walk", at: wt, ms: trip.ms, x: farSide, hopMs: trip.hopMs, face: (-dir) as 1 | -1 });
    // The slice goes back the way it rolled as the welder shoves it.
    moveTo(wt, pos.x, pos.y, pos.r, "linear");
    moveTo(wt + trip.ms, topShift.x, pos.y, 0);
    wt += trip.ms;
  } else if (breakKind === "crack") {
    wt = hopTo(welderSteps, welderFrom, pct(hookX) - dir * 6, wt, vw, dir);
  } else {
    const spot = work.crowded ? pct(hookX - welder.width / 2) : farSide;
    const trip = hopTrip(welderFrom, spot, vw).ms;
    wt = hopTo(welderSteps, welderFrom, spot, Math.max(wt, work.readyAt - trip - 300), vw, toward(pct(hookX), spot));
  }
  // The glue spread on, once the piece is ready for it.
  let glueOn: number | null = null;
  if (gluePickedAt !== null && breakKind !== "crack") {
    wt = waitUntil(welderSteps, wt, work.readyAt);
    glueOn = wt;
    welderSteps.push({ kind: "work", at: wt, ms: GLUE_MS, activity: "glue", look: lookToward(welder, 30, piece.h * 0.5 + work.raisedBy) });
    wt += GLUE_MS;
  }
  const hookDownAt = Math.max(boomUpEnd, ft, wt, work.readyAt);
  const hookDownEnd = hookDownAt + HOOK_MS;
  const cable: Frame[] = [
    [0, { height: `${CABLE_STOWED}px` }],
    [hookDownAt, { height: `${CABLE_STOWED}px` }, "ease-in-out"],
    [hookDownEnd, { height: `${cableFloor}px` }],
  ];

  // The foreman waves the hook down.
  ft = waitUntil(foremanSteps, ft, hookDownAt);
  foremanSteps.push({ kind: "quirk", at: ft, ms: HOOK_MS, quirk: "wave" });
  ft += HOOK_MS;

  let fixedAt: number;
  // When the rubble under the piece can be got at (it's been lifted clear).
  let clearOfPiece: number;
  let liftFrom: number;
  let placedAt: number | null = null;
  let hookUpAt: number;
  let hookUpFrom: number;
  let riding: [number, number] | null = null;
  let crackFrames: { box: Box; d: string; length: number; draw: Frame[]; tilt: Frame[]; torch: Frame[]; welding: [number, number] } | null = null;
  let bolting: [number, number] | null = null;
  const watch = (steps: Step[], c: Character, from: number, until: number) => {
    if (until <= from) return from;
    steps.push({ kind: "inspect", at: from, ms: until - from, look: lookUp(c) });
    return until;
  };

  if (breakKind === "crack") {
    // The welder steps onto the platform, rides up to the crack, welds it
    // shut as the card straightens, and rides back down.
    wt = waitUntil(welderSteps, wt, hookDownEnd + 100);
    welderSteps.push({ kind: "walk", at: wt, ms: 400, x: pct(hookX), hopMs: 400, face: dir });
    const boardAt = wt + 400;
    const liftStart = boardAt + 300;
    const rideEnd = liftStart + LIFT_MS;
    const weldEnd = rideEnd + WELD_MS;
    const downEnd = weldEnd + 300 + LIFT_MS;
    const alightAt = downEnd + 200;
    welderSteps.push({ kind: "aboard", at: boardAt, ms: alightAt - boardAt });
    wt = alightAt;
    cable.push(
      [liftStart, { height: `${cableFloor}px` }, "ease-in-out"],
      [rideEnd, { height: `${cableTop}px` }],
      [weldEnd + 300, { height: `${cableTop}px` }, "ease-in-out"],
      [downEnd, { height: `${cableFloor}px` }]
    );
    fixedAt = weldEnd;
    clearOfPiece = breakAt + 1700;
    liftFrom = clearOfPiece;
    hookUpAt = alightAt + 300;
    hookUpFrom = cableFloor;
    ft = watch(foremanSteps, foreman, ft, fixedAt);
    // The crack: drawn across the card, healing up behind the torch.
    const local = crackPts.map((p) => ({ x: p.x - box.x, y: p.y - box.y }));
    const length = local.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - local[i].x, p.y - local[i].y), 0);
    const tilt = 1.4;
    crackFrames = {
      box,
      d: local.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      length,
      draw: [
        [0, { strokeDashoffset: `${length}` }],
        [breakAt, { strokeDashoffset: `${length}` }, "ease-out"],
        [breakAt + 380, { strokeDashoffset: "0" }],
        [rideEnd, { strokeDashoffset: "0" }, "linear"],
        [weldEnd, { strokeDashoffset: `${-length}` }],
      ],
      tilt: [
        [0, { transform: "rotate(0deg)" }],
        [breakAt, { transform: "rotate(0deg)" }, SETTLE],
        [breakAt + 450, { transform: `rotate(${tilt}deg)` }],
        [weldEnd - 400, { transform: `rotate(${tilt}deg)` }, "ease-in-out"],
        [weldEnd + 200, { transform: "rotate(0deg)" }],
      ],
      // The sparks run along the crack, start to finish.
      torch: crackPts.map((p, i): Frame => [rideEnd + (WELD_MS * i) / (crackPts.length - 1), { transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)` }, "linear"]),
      welding: [rideEnd, weldEnd],
    };
    riding = [boardAt, alightAt];
    // The real card sags along with it, then straightens.
    const origin = "0% 100%";
    realMoves.push(
      {
        keyframes: [
          { transform: "rotate(0deg)", transformOrigin: origin },
          { transform: `rotate(${tilt}deg)`, transformOrigin: origin },
        ],
        options: { delay: breakAt, duration: 450, easing: SETTLE, fill: "forwards" },
      },
      {
        keyframes: [
          { transform: `rotate(${tilt}deg)`, transformOrigin: origin },
          { transform: "rotate(0deg)", transformOrigin: origin },
        ],
        options: { delay: weldEnd - 400, duration: 600, easing: "ease-in-out", fill: "forwards" },
      }
    );
  } else {
    // The welder hooks it on; it's lifted back into place, and bolted on in
    // a shower of sparks while they both watch (or the glue left to set).
    welderSteps.push({ kind: "wait", at: wt, ms: Math.max(0, hookDownAt - wt) });
    wt = Math.max(wt, hookDownAt);
    welderSteps.push({ kind: "quirk", at: wt, ms: HOOK_MS + 500, quirk: "wave" });
    wt += HOOK_MS + 500;
    const liftStart = hookDownEnd + 500;
    const liftEnd = liftStart + LIFT_MS;
    cable.push([liftStart, { height: `${cableFloor}px` }, "linear"], [liftEnd, { height: `${cableTop}px` }]);
    // Rising with the hook — its top edge stays right on the catch (so this
    // has to be linear, like the cable). A snapped-off bar end turns the
    // right way up on the way.
    const restY = pos.y;
    moveTo(liftStart, topShift.x, restY, pos.r, "linear");
    if (breakKind === "bar") moveTo(liftStart + LIFT_MS * 0.6, topShift.x, restY + (topShift.y - restY) * 0.6, 0, "linear");
    moveTo(liftEnd, topShift.x, topShift.y, 0);
    // A popped-out slice clicks back into the donut.
    if (breakKind === "slice") moveTo(liftEnd + 250, 0, 0, 0);
    fixedAt = liftEnd + BOLT_MS;
    clearOfPiece = liftEnd;
    liftFrom = liftStart;
    placedAt = liftEnd;
    hookUpAt = fixedAt + 200;
    hookUpFrom = cableTop;
    ft = watch(foremanSteps, foreman, ft, fixedAt);
    wt = watch(welderSteps, welder, wt, fixedAt);
    if (glueOn === null) bolting = [liftEnd + 200, fixedAt];
  }

  // Job done: a wipe of the brow, the hook back up, the boom folded away,
  // and they're off the way the truck's facing.
  foremanSteps.push({ kind: "quirk", at: ft, ms: QUIRK_MS.phew, quirk: "phew" });
  ft += QUIRK_MS.phew;
  const hookUpEnd = hookUpAt + HOOK_MS;
  cable.push([hookUpAt, { height: `${hookUpFrom}px` }, "ease-in-out"], [hookUpEnd, { height: `${CABLE_STOWED}px` }]);
  const boomDownAt = hookUpEnd + 200;
  const boomDownEnd = boomDownAt + BOOM_MS;
  const truckOutAt = boomDownEnd + 500;
  const leftAt = truckOutAt + DRIVE_OUT_MS;
  const exitX = dir === 1 ? 110 : -10;
  let endAt = leftAt;
  const leave = (steps: Step[], from: number, at: number) => {
    const lastWalk = [...steps].reverse().find((st): st is WalkStep => st.kind === "walk")!;
    const t = waitUntil(steps, from, at);
    const trip = hopTrip(lastWalk.x, exitX, vw);
    steps.push({ kind: "walk", at: t, ms: trip.ms, x: exitX, hopMs: trip.hopMs });
    steps.push({ kind: "gone", at: t + trip.ms, ms: 0 });
    endAt = Math.max(endAt, t + trip.ms);
    return t + trip.ms;
  };
  ft = leave(foremanSteps, ft, boomDownEnd - 300);
  wt = leave(welderSteps, wt, boomDownEnd);
  endAt += 200;

  // The mess they leave behind: tyre marks where the truck stood, and a
  // sooty smudge low on the glass from its exhaust.
  const wheelXs = [48, 196].map((x) => (dir === 1 ? truckLeft + x : truckLeft + TRUCK_W - x));
  wheelXs.forEach((x, i) => debris.push(floorDebris(x, leftAt - 600 + i * 150, "tyre")));
  debris.push(glassDebris(dir === 1 ? truckLeft - 30 : truckLeft + TRUCK_W + 30, parkedAt + 800));

  // --- asteroid and impact ------------------------------------------------------
  let asteroidPlan: RepairPlan["asteroid"] = null;
  if (asteroid) {
    const from = { x: impact.x < vw / 2 ? vw + 80 : -80, y: -80 };
    const off = `translate(${(from.x - impact.x).toFixed(1)}px, ${(from.y - impact.y).toFixed(1)}px)`;
    asteroidPlan = {
      from,
      at: impact,
      flight: track(
        [
          [0, { transform: off, opacity: 0 }],
          [t0, { transform: off, opacity: 1 }, "cubic-bezier(0.4, 0, 1, 1)"],
          [breakAt, { transform: "translate(0px, 0px)", opacity: 1 }],
          [breakAt + 1, { transform: "translate(0px, 0px)", opacity: 0 }],
        ],
        endAt
      ),
    };
  } else {
    puffs.push({ x: impact.x, y: impact.y, at: t0 + 300, big: false }, { x: impact.x, y: impact.y, at: t0 + 850, big: false });
  }
  puffs.push({ x: impact.x, y: impact.y, at: breakAt, big: true });
  if (work.heap) puffs.push({ x: work.heap.x, y: floorY - 20, at: landAt + 400, big: true });

  // Back to the real thing once it's fixed.
  effects.push({ at: fixedAt, run: () => undo.forEach((u) => u()) });

  // The machines' work after the lift: coming back for the pallet, off
  // again, and the digger back for the rest of the rubble.
  const machines = work.finish({ liftStart: liftFrom, clear: clearOfPiece, gluePickedAt });
  const machinesDone = Math.max(
    0,
    ...machines.flatMap((m) => [m.frames, ...Object.values(m.parts)].map((f) => (f && f.length ? f[f.length - 1][0] : 0)))
  );
  // (And time for the filler and the glue to dry off.)
  const dryAt = fixedAt + 2500;
  endAt = Math.max(endAt, machinesDone + 200, work.filler.length || glueOn !== null ? dryAt + 1100 : 0);
  let seam: RepairPlan["seam"] = null;
  if (glueOn !== null && placedAt !== null) {
    const shows = fadeBetween(placedAt, dryAt, endAt);
    if (standIn?.kind === "slice") seam = { kind: "path", box: standIn.box, d: standIn.d, shows };
    else if (standIn?.kind === "bar") seam = { kind: "line", x: boltSpots[0].x, y: piece.y, h: piece.h, shows };
    else seam = { kind: "box", box, radius: 12, shows };
  }

  // --- truck and crane --------------------------------------------------------
  const offIn = dir === 1 ? -(truckLeft + TRUCK_W + 40) : vw - truckLeft + 40;
  const offOut = dir === 1 ? vw - truckLeft + 40 : -(truckLeft + TRUCK_W + 40);
  const turns = (px: number) => (Math.abs(px) / (2 * Math.PI * 16)) * 360;
  const drive = "cubic-bezier(0.2, 0.6, 0.3, 1)";
  const pullAway = "cubic-bezier(0.6, 0, 0.9, 0.6)";
  const stowed = { transform: `rotate(${-STOWED_ANGLE}deg)`, width: `${STOWED_BOOM}px` };
  const raised = { transform: `rotate(${(-boomAngle).toFixed(2)}deg)`, width: `${boomLen.toFixed(1)}px` };
  const hangStowed = { transform: `rotate(${STOWED_ANGLE}deg)` };
  const hangRaised = { transform: `rotate(${boomAngle.toFixed(2)}deg)` };

  return {
    kind: "repair",
    target: el,
    endAt,
    cast: [],
    standIn,
    standInMoves: track(moves, endAt),
    standInShows: showBetween(showFrom, fixedAt, endAt),
    truck: {
      left: truckLeft,
      dir,
      // Easing to a stop, rocking forward on its springs and settling back.
      moves: track(
        [
          [0, { transform: `translateX(${offIn}px) rotate(0deg)` }],
          [truckInAt, { transform: `translateX(${offIn}px) rotate(0deg)` }, drive],
          [parkedAt, { transform: `translateX(${dir * 6}px) rotate(${dir * 1.2}deg)` }, "ease-in-out"],
          [parkedAt + 260, { transform: `translateX(${-dir * 2}px) rotate(${-dir * 0.5}deg)` }, "ease-in-out"],
          [parkedAt + 520, { transform: "translateX(0px) rotate(0deg)" }],
          [truckOutAt, { transform: "translateX(0px) rotate(0deg)" }, pullAway],
          [leftAt, { transform: `translateX(${offOut}px) rotate(0deg)` }],
        ],
        endAt
      ),
      wheels: track(
        [
          [0, { transform: "rotate(0deg)" }],
          [truckInAt, { transform: "rotate(0deg)" }, drive],
          [parkedAt, { transform: `rotate(${turns(offIn)}deg)` }],
          [truckOutAt, { transform: `rotate(${turns(offIn)}deg)` }, pullAway],
          [leftAt, { transform: `rotate(${turns(offIn) + turns(offOut)}deg)` }],
        ],
        endAt
      ),
    },
    boom: {
      moves: track(
        [
          [0, stowed],
          [boomUpAt, stowed, "ease-in-out"],
          [boomUpEnd, raised],
          [boomDownAt, raised, "ease-in-out"],
          [boomDownEnd, stowed],
        ],
        endAt
      ),
      // The hook's hanger turns the other way, so the cable always hangs
      // straight down whatever angle the boom's at.
      counter: track(
        [
          [0, hangStowed],
          [boomUpAt, hangStowed, "ease-in-out"],
          [boomUpEnd, hangRaised],
          [boomDownAt, hangRaised, "ease-in-out"],
          [boomDownEnd, hangStowed],
        ],
        endAt
      ),
      cable: track(cable, endAt),
    },
    rider: riding ? showBetween(riding[0], riding[1], endAt) : null,
    asteroid: asteroidPlan,
    crack: crackFrames
      ? {
          box: crackFrames.box,
          d: crackFrames.d,
          length: crackFrames.length,
          draw: track(crackFrames.draw, endAt),
          tilt: track(crackFrames.tilt, endAt),
          torch: track(crackFrames.torch, endAt),
          torchShows: showBetween(crackFrames.welding[0], crackFrames.welding[1], endAt),
        }
      : null,
    sparks: bolting ? boltSpots.map((p) => ({ ...p, shows: showBetween(bolting![0], bolting![1], endAt) })) : [],
    puffs,
    chunks,
    builders: [
      { character: foreman, entryX, steps: foremanSteps, endAt: ft },
      { character: welder, entryX, steps: welderSteps, endAt: wt },
    ],
    debris,
    machines,
    heap: work.heap && { x: work.heap.x, w: work.heap.w, h: work.heap.h, frames: track(work.heap.frames, endAt) },
    patches: work.filler.map((f) => ({ x: f.x, y: f.y, shows: fadeBetween(f.at, dryAt, endAt) })),
    seam,
    marks: {
      cracked: work.cracked && showBetween(breakAt, work.cracked[1], endAt),
      glued: glueOn !== null ? showBetween(glueOn + 300, endAt, endAt) : null,
    },
    effects,
    realMoves,
    restore: () => undo.forEach((u) => u()),
  };
}

// Something up in the top bar — the clock, the profile picture, the
// notifications bell — comes off and falls all the way to the floor. It's
// too high for the truck's crane, so the tower crane comes instead: it rises
// at the nearer edge, reaches its jib right over, and its hook goes all the
// way down for it; the builders hook it on, and it's lifted all the way back
// up and bolted into place.
const TOP_LIFT_MS = 4200;
// The tower crane's hook, a small clamp, and where its cable starts (px down
// from the top of the screen — the jib itself is just above it).
const TOP_HOOK_H = 12;
const TOP_CABLE_Y = 2;

function planTopRepair(target: Breakable, vw: number, vh: number): RepairPlan {
  const floorY = vh - FLOOR;
  const pct = (px: number) => (px / vw) * 100;
  const { el, box } = target;
  const asteroid = Math.random() < 0.5;
  const welder = BUILDERS.welder;
  const foreman = BUILDERS.foreman;
  const t0 = 400;
  const breakAt = t0 + (asteroid ? 700 : 1300);
  const effects: RepairPlan["effects"] = [];
  const realMoves: RepairPlan["realMoves"] = [];
  const undo: (() => void)[] = [];
  const debris: DustSpeck[] = [];
  const puffs: RepairPlan["puffs"] = [];
  const chunks: RepairPlan["chunks"] = [];

  // The real thing: hidden while its stand-in's away.
  const style = (el as HTMLElement).style;
  const shown = style.visibility;
  effects.push({ at: breakAt, run: () => (style.visibility = "hidden") });
  undo.push(() => (style.visibility = shown));
  if (!asteroid) {
    realMoves.push({
      keyframes: [0, 2, -2, 3, -3, 2, 0].map((a) => ({ transform: `rotate(${a}deg)` })),
      options: { delay: t0, duration: breakAt - t0, easing: "ease-in-out" },
    });
  }

  // It pops off, tumbling, and drops all the way down, landing with a bounce.
  const s = Math.random() < 0.5 ? 1 : -1;
  const dy = floorY - box.y - box.h;
  const cx = box.x + box.w / 2;
  const landAt = breakAt + 1200;
  const moves: Frame[] = [
    [0, { transform: "translate(0px, 0px) rotate(0deg)" }],
    [breakAt, { transform: "translate(0px, 0px) rotate(0deg)" }, "ease-out"],
    [breakAt + 220, { transform: `translate(${s * 10}px, -16px) rotate(${s * 30}deg)` }, GRAVITY],
    [landAt, { transform: `translate(${s * 24}px, ${dy.toFixed(1)}px) rotate(${s * 360}deg)` }, "ease-out"],
    [landAt + 140, { transform: `translate(${s * 26}px, ${(dy - 12).toFixed(1)}px) rotate(${s * 360}deg)` }, "ease-in"],
    [landAt + 300, { transform: `translate(${s * 26}px, ${dy.toFixed(1)}px) rotate(${s * 360}deg)` }],
  ];
  const lyingX = cx + s * 26;
  const impact = { x: cx, y: box.y + box.h / 2 };

  // The tower crane: at the nearer edge, jib long enough to get right over it.
  const edge = cx < vw / 2 ? 34 : vw - 34;
  const dir: 1 | -1 = edge < vw / 2 ? 1 : -1;
  const mastH = floorY - TOP_CABLE_Y;
  const over = (cx - edge) * dir;
  const jib = over + 70;
  const craneAt = landAt + 600;
  const swungIn = craneAt + 1800 + 1100;
  const across = swungIn + 1300;
  const trolleyOut = (lyingX - edge) * dir;
  const trolleyHome = (cx - edge) * dir;
  const cableTop = Math.max(2, box.y - TOP_HOOK_H - TOP_CABLE_Y);

  // The builders walk in from the nearer side: the foreman to wave the hook
  // down, the welder to hook it on. The other machines work from the far
  // side of it.
  const entryX = lyingX < vw / 2 ? -8 : 108;
  const side = entryX < 0 ? -1 : 1;
  const work = planMachines({
    vw,
    floorY,
    count: 1 + Math.floor(Math.random() * 2),
    truckSpan: [edge - 40, edge + 40],
    workZone: [lyingX - box.w / 2 - 110, lyingX + box.w / 2 + 110],
    side: (-side) as 1 | -1,
    arriveFrom: landAt + 1500,
    piece: {
      left: lyingX - box.w / 2,
      right: lyingX + box.w / 2,
      h: box.h,
      at: landAt + 300,
      canShove: false,
      move: (at, dx, up, easing) =>
        moves.push([at, { transform: `translate(${(s * 26 + dx).toFixed(1)}px, ${(dy - up).toFixed(1)}px) rotate(${s * 360}deg)` }, easing]),
    },
    targetX: cx,
    glue: true,
    holes: [
      { x: box.x + 3, y: box.y + box.h / 2 },
      { x: box.x + box.w - 3, y: box.y + box.h / 2 },
    ],
    pieceRubble: [floorDebris(lyingX - 24, landAt, "rubble"), floorDebris(lyingX + 26, landAt + 60, "rubble")],
    debris,
  });
  const cableFloor = floorY - box.h - work.raisedBy - TOP_HOOK_H - TOP_CABLE_Y;
  const foremanSteps: Step[] = [];
  const welderSteps: Step[] = [];
  const foremanX = pct(lyingX + side * (box.w / 2 + 70));
  const welderX = pct(lyingX + side * (box.w / 2 + 26));
  let ft = hopTo(foremanSteps, entryX, foremanX, landAt + 500, vw, (-side) as 1 | -1);
  let wt = landAt + 1100;
  let welderFrom = entryX;
  let gluePickedAt: number | null = null;
  if (work.glue) {
    const g = work.glue;
    const pieceRight = lyingX > g.x;
    const standX = pct(pieceRight ? g.x + 12 : g.x - 12 - welder.width);
    wt = hopTo(welderSteps, entryX, standX, Math.max(wt, g.at - hopTrip(entryX, standX, vw).ms - 400), vw, (pieceRight ? -1 : 1) as 1 | -1);
    wt = waitUntil(welderSteps, wt, g.at);
    welderSteps.push({ kind: "work", at: wt, ms: 700, activity: "glue", look: lookToward(welder, 24, 6) });
    gluePickedAt = wt + 350;
    wt += 700;
    welderFrom = standX;
  }
  wt = hopTo(welderSteps, welderFrom, welderX, wt, vw, (-side) as 1 | -1);
  let glueOn: number | null = null;
  if (gluePickedAt !== null) {
    wt = waitUntil(welderSteps, wt, work.readyAt);
    glueOn = wt;
    welderSteps.push({ kind: "work", at: wt, ms: GLUE_MS, activity: "glue", look: lookToward(welder, 30, box.h * 0.5 + work.raisedBy) });
    wt += GLUE_MS;
  }
  const hookDownAt = Math.max(across, wt, work.readyAt);
  const hookDownEnd = hookDownAt + 2400;
  ft = waitUntil(foremanSteps, ft, hookDownAt);
  foremanSteps.push({ kind: "quirk", at: ft, ms: hookDownEnd - hookDownAt, quirk: "wave" });
  ft = hookDownEnd;
  wt = waitUntil(welderSteps, wt, hookDownEnd);
  welderSteps.push({ kind: "quirk", at: wt, ms: HOOK_MS, quirk: "wave" });
  wt += HOOK_MS;
  const liftStart = wt + 200;
  const liftEnd = liftStart + TOP_LIFT_MS;
  const fixedAt = liftEnd + BOLT_MS;
  const lookUp = (c: Character) => lookToward(c, 10, 700);
  foremanSteps.push({ kind: "inspect", at: ft, ms: fixedAt - ft, look: lookUp(foreman) });
  ft = fixedAt;
  welderSteps.push({ kind: "inspect", at: wt, ms: fixedAt - wt, look: lookUp(welder) });
  wt = fixedAt;
  foremanSteps.push({ kind: "quirk", at: ft, ms: QUIRK_MS.phew, quirk: "phew" });
  ft += QUIRK_MS.phew;

  // Lifted straight back up, righting itself, in step with the cable.
  moves.push(
    [liftStart, { transform: `translate(${s * 26}px, ${(dy - work.raisedBy).toFixed(1)}px) rotate(${s * 360}deg)` }, "linear"],
    [liftEnd, { transform: `translate(0px, 0px) rotate(${s * 360}deg)` }]
  );

  // Then the crane lets go and packs away.
  const released = fixedAt + 600;
  const home = released + 1100;
  const swungAway = home + 900;
  const sunk = swungAway + 1500;
  const exitX = entryX;
  let endAt = sunk;
  for (const [steps, from] of [
    [foremanSteps, ft],
    [welderSteps, wt],
  ] as const) {
    const lastWalk = [...steps].reverse().find((st): st is WalkStep => st.kind === "walk")!;
    const t = waitUntil(steps, from, released);
    const trip = hopTrip(lastWalk.x, exitX, vw);
    steps.push({ kind: "walk", at: t, ms: trip.ms, x: exitX, hopMs: trip.hopMs });
    steps.push({ kind: "gone", at: t + trip.ms, ms: 0 });
    endAt = Math.max(endAt, t + trip.ms);
  }

  const tower: MachinePlan = {
    kind: "tower",
    left: edge,
    dir,
    from: (-dir) as 1 | -1,
    mastH,
    jib,
    frames: [
      [0, { transform: `translateY(${mastH + 120}px)` }],
      [craneAt, { transform: `translateY(${mastH + 120}px)` }, "cubic-bezier(0.2, 0.7, 0.3, 1)"],
      [craneAt + 1800, { transform: "translateY(0px)" }],
      [swungAway, { transform: "translateY(0px)" }, "ease-in"],
      [sunk, { transform: `translateY(${mastH + 120}px)` }],
    ],
    parts: {
      jib: [
        [0, { transform: "scaleX(0.04)" }],
        [craneAt + 1800, { transform: "scaleX(0.04)" }, "ease-in-out"],
        [swungIn, { transform: "scaleX(1)" }],
        [home, { transform: "scaleX(1)" }, "ease-in-out"],
        [swungAway, { transform: "scaleX(0.04)" }],
      ],
      trolley: [
        [0, { transform: "translateX(40px)" }],
        [swungIn, { transform: "translateX(40px)" }, "ease-in-out"],
        [across, { transform: `translateX(${trolleyOut.toFixed(1)}px)` }],
        [liftStart, { transform: `translateX(${trolleyOut.toFixed(1)}px)` }, "linear"],
        [liftEnd, { transform: `translateX(${trolleyHome.toFixed(1)}px)` }],
        [released, { transform: `translateX(${trolleyHome.toFixed(1)}px)` }, "ease-in-out"],
        [home, { transform: "translateX(40px)" }],
      ],
      cable: [
        [0, { height: "2px" }],
        [hookDownAt, { height: "2px" }, "ease-in-out"],
        [hookDownEnd, { height: `${cableFloor.toFixed(1)}px` }],
        [liftStart, { height: `${cableFloor.toFixed(1)}px` }, "linear"],
        [liftEnd, { height: `${cableTop.toFixed(1)}px` }],
        [fixedAt, { height: `${cableTop.toFixed(1)}px` }, "ease-in-out"],
        [released, { height: "2px" }],
      ],
    },
  };

  // An asteroid, if that's what did it.
  let asteroidPlan: RepairPlan["asteroid"] = null;
  if (asteroid) {
    const from = { x: impact.x < vw / 2 ? vw + 80 : -80, y: -80 };
    const off = `translate(${(from.x - impact.x).toFixed(1)}px, ${(from.y - impact.y).toFixed(1)}px)`;
    asteroidPlan = {
      from,
      at: impact,
      flight: track(
        [
          [0, { transform: off, opacity: 0 }],
          [t0, { transform: off, opacity: 1 }, "cubic-bezier(0.4, 0, 1, 1)"],
          [breakAt, { transform: "translate(0px, 0px)", opacity: 1 }],
          [breakAt + 1, { transform: "translate(0px, 0px)", opacity: 0 }],
        ],
        endAt
      ),
    };
  } else {
    puffs.push({ x: impact.x, y: impact.y, at: t0 + 300, big: false });
  }
  puffs.push({ x: impact.x, y: impact.y, at: breakAt, big: true }, { x: lyingX, y: floorY - 10, at: landAt, big: true });
  effects.push({ at: fixedAt, run: () => undo.forEach((u) => u()) });

  // The other machines' work after the lift.
  const machines = work.finish({ liftStart, clear: liftStart + 800, gluePickedAt });
  machines.unshift(tower);
  const machinesDone = Math.max(
    0,
    ...machines.flatMap((m) => [m.frames, ...Object.values(m.parts)].map((f) => (f && f.length ? f[f.length - 1][0] : 0)))
  );
  const dryAt = fixedAt + 2500;
  endAt = Math.max(endAt, machinesDone, work.filler.length || glueOn !== null ? dryAt + 1100 : 0) + 200;

  return {
    kind: "repair",
    target: el,
    endAt,
    cast: [],
    standIn: { kind: "clone", box, origin: "50% 50%" },
    standInMoves: track(moves, endAt),
    standInShows: showBetween(breakAt, fixedAt, endAt),
    truck: null,
    boom: null,
    rider: null,
    asteroid: asteroidPlan,
    crack: null,
    sparks:
      glueOn !== null
        ? []
        : [
            { x: box.x - 2, y: box.y + box.h / 2, shows: showBetween(liftEnd + 200, fixedAt, endAt) },
            { x: box.x + box.w + 2, y: box.y + box.h / 2, shows: showBetween(liftEnd + 200, fixedAt, endAt) },
          ],
    puffs,
    chunks,
    builders: [
      { character: foreman, entryX, steps: foremanSteps, endAt: ft },
      { character: welder, entryX, steps: welderSteps, endAt: wt },
    ],
    debris,
    machines,
    heap: work.heap && { x: work.heap.x, w: work.heap.w, h: work.heap.h, frames: track(work.heap.frames, endAt) },
    patches: work.filler.map((f) => ({ x: f.x, y: f.y, shows: fadeBetween(f.at, dryAt, endAt) })),
    seam: glueOn !== null ? { kind: "box", box, radius: Math.min(box.w, box.h) / 2, shows: fadeBetween(liftEnd, dryAt, endAt) } : null,
    marks: {
      cracked: work.cracked && showBetween(breakAt, work.cracked[1], endAt),
      glued: glueOn !== null ? showBetween(glueOn + 300, endAt, endAt) : null,
    },
    effects,
    realMoves,
    restore: () => undo.forEach((u) => u()),
  };
}

// A stat card comes loose and swings down, hanging off one corner — and
// instead of the crane, the builders go up to it: the stairs to the second
// floor drop in, they climb up and along to it, the welder heaves it back
// up and welds it in place while the foreman looks on, and they come back
// down. Null if there's no second floor to be had on this page.
const DECK_REPAIR_CHANCE = 0.5;

function planDeckCardRepair(target: Breakable, vw: number, vh: number): RepairPlan | null {
  const deck = findDeck(vw, vh);
  const stairs = deck && makeDeckStairs(vw, deck);
  if (!deck || !stairs) return null;
  const { el, box } = target;
  const welder = BUILDERS.welder;
  const foreman = BUILDERS.foreman;
  const asteroid = Math.random() < 0.5;
  const t0 = 400;
  const breakAt = t0 + (asteroid ? 700 : 1300);
  const effects: RepairPlan["effects"] = [];
  const realMoves: RepairPlan["realMoves"] = [];
  const undo: (() => void)[] = [];
  const puffs: RepairPlan["puffs"] = [];
  const debris: DustSpeck[] = [];

  const style = (el as HTMLElement).style;
  const shown = style.visibility;
  effects.push({ at: breakAt, run: () => (style.visibility = "hidden") });
  undo.push(() => (style.visibility = shown));

  // Swings down off one top corner and hangs there.
  const hingeLeft = Math.random() < 0.5;
  const sgn = hingeLeft ? 1 : -1;
  const origin = hingeLeft ? "0% 0%" : "100% 0%";
  const impact = { x: hingeLeft ? box.x + box.w - 12 : box.x + 12, y: box.y + 12 };
  if (!asteroid) {
    realMoves.push({
      keyframes: [0, 1, -1, 1.4, -1.2, 1.8, 0].map((a) => ({ transform: `rotate(${a * sgn}deg)`, transformOrigin: origin })),
      options: { delay: t0, duration: breakAt - t0, easing: "ease-in-out" },
    });
  }
  const hang = 78 * sgn;
  const moves: Frame[] = [
    [0, { transform: "rotate(0deg)" }],
    [breakAt, { transform: "rotate(0deg)" }, "cubic-bezier(0.3, 0, 0.3, 1)"],
    [breakAt + 380, { transform: `rotate(${hang + 14 * sgn}deg)` }, "ease-in-out"],
    [breakAt + 680, { transform: `rotate(${hang - 8 * sgn}deg)` }, "ease-in-out"],
    [breakAt + 920, { transform: `rotate(${hang + 4 * sgn}deg)` }, "ease-in-out"],
    [breakAt + 1100, { transform: `rotate(${hang}deg)` }],
  ];

  // The stairs up, and the builders up them — the welder first, the
  // foreman behind — to stand beside the card, on whichever side of it
  // there's room.
  stairs.inAt = breakAt + 600;
  const u = (px: number) => (px - stairs.footPx) / (stairs.dirUp * stairs.stepW);
  const level = landingLevel(stairs);
  const cardX = box.x + box.w / 2;
  const onDeck = (px: number) => clamp(px, deck.left + 30, deck.right - 30);
  const clearOf = box.w / 2 + welder.width / 2 + 12;
  const roomBy = (side: 1 | -1) => Math.abs(onDeck(cardX + side * clearOf) - (cardX + side * clearOf)) < 1;
  const side: 1 | -1 = roomBy(stairs.dirUp) ? stairs.dirUp : (-stairs.dirUp as 1 | -1);
  const welderPx = cardX + side * clearOf;
  const welderAt = u(welderPx);
  const foremanAt = u(onDeck(welderPx + side * 70));
  const entryX = stairs.side === "left" ? 108 : -8;
  const welderSteps: Step[] = [];
  const foremanSteps: Step[] = [];
  let wt = hopTo(welderSteps, entryX, stairPct(stairs, 0), breakAt + 900, vw);
  wt = waitUntil(welderSteps, wt, stairsReadyAt(stairs));
  wt = climb(welderSteps, stairs, 0, level, wt);
  wt = alongLanding(welderSteps, stairs, level, welderAt, wt);
  let ft = hopTo(foremanSteps, entryX, stairPct(stairs, 0), breakAt + 1900, vw);
  ft = waitUntil(foremanSteps, ft, stairsReadyAt(stairs) + 1600);
  ft = climb(foremanSteps, stairs, 0, level, ft);
  ft = alongLanding(foremanSteps, stairs, level, foremanAt, ft);
  const facing = (-side) as 1 | -1;
  // (Turned to face it.)
  welderSteps.push({ kind: "walk", at: wt, ms: 1, x: stairPct(stairs, welderAt), y: level * stairs.riseH, tread: level, face: facing, hopMs: 1 });
  wt += 1;
  foremanSteps.push({ kind: "walk", at: ft, ms: 1, x: stairPct(stairs, foremanAt), y: level * stairs.riseH, tread: level, face: facing, hopMs: 1 });
  ft += 1;

  // Heaved back up, and welded in with a shower of sparks.
  const ready = Math.max(wt, ft);
  wt = waitUntil(welderSteps, wt, ready);
  welderSteps.push({ kind: "quirk", at: wt, ms: QUIRK_MS.shove, quirk: "shove" });
  const upAt = wt + 150;
  moves.push([upAt, { transform: `rotate(${hang}deg)` }, "ease-in-out"], [upAt + 500, { transform: "rotate(0deg)" }]);
  wt += QUIRK_MS.shove;
  const look = lookToward(welder, welder.width / 2 + 20, welder.height + 20);
  welderSteps.push({ kind: "work", at: wt, ms: WELD_MS, activity: "weld", look });
  const weldFrom = wt;
  wt += WELD_MS;
  const fixedAt = wt;
  foremanSteps.push({ kind: "inspect", at: ft, ms: fixedAt - ft, look: lookToward(foreman, 60, foreman.height + 30) });
  ft = fixedAt;
  foremanSteps.push({ kind: "quirk", at: ft, ms: QUIRK_MS.phew, quirk: "phew" });
  ft += QUIRK_MS.phew;

  // Back along, down, and off.
  const down = (steps: Step[], at: number, from: number) => {
    let t = alongLanding(steps, stairs, at, level, from);
    t = climb(steps, stairs, level, 0, t);
    const trip = hopTrip(stairPct(stairs, 0), entryX, vw);
    steps.push({ kind: "walk", at: t, ms: trip.ms, x: entryX, hopMs: trip.hopMs });
    steps.push({ kind: "gone", at: t + trip.ms, ms: 0 });
    return { off: t, gone: t + trip.ms };
  };
  const wDown = down(welderSteps, welderAt, wt);
  const fDown = down(foremanSteps, foremanAt, Math.max(ft, wt + 900));
  stairs.outAt = Math.max(wDown.off, fDown.off) + 400;
  const endAt = Math.max(wDown.gone, fDown.gone, stepLiftAt(stairs, 1) + STAIR_LIFT_MS) + 200;
  effects.push({ at: fixedAt, run: () => undo.forEach((f) => f()) });

  let asteroidPlan: RepairPlan["asteroid"] = null;
  if (asteroid) {
    const from = { x: impact.x < vw / 2 ? vw + 80 : -80, y: -80 };
    const off = `translate(${(from.x - impact.x).toFixed(1)}px, ${(from.y - impact.y).toFixed(1)}px)`;
    asteroidPlan = {
      from,
      at: impact,
      flight: track(
        [
          [0, { transform: off, opacity: 0 }],
          [t0, { transform: off, opacity: 1 }, "cubic-bezier(0.4, 0, 1, 1)"],
          [breakAt, { transform: "translate(0px, 0px)", opacity: 1 }],
          [breakAt + 1, { transform: "translate(0px, 0px)", opacity: 0 }],
        ],
        endAt
      ),
    };
  } else {
    puffs.push({ x: impact.x, y: impact.y, at: t0 + 300, big: false });
  }
  puffs.push({ x: impact.x, y: impact.y, at: breakAt, big: true });
  // Plaster dust down on the floor below it.
  debris.push(floorDebris(cardX - 20, breakAt + 1500, "rubble"));

  const corner = (x: number, y: number) => ({ x, y, shows: showBetween(weldFrom + 200, fixedAt, endAt) });
  return {
    kind: "repair",
    target: el,
    endAt,
    cast: [],
    standIn: { kind: "clone", box, origin },
    standInMoves: track(moves, endAt),
    standInShows: showBetween(breakAt, fixedAt, endAt),
    truck: null,
    boom: null,
    rider: null,
    asteroid: asteroidPlan,
    crack: null,
    sparks: [corner(box.x + 4, box.y + 4), corner(box.x + box.w - 4, box.y + 4), corner(box.x + box.w / 2, box.y + box.h - 4)],
    puffs,
    chunks: [],
    builders: [
      { character: welder, entryX, steps: welderSteps, endAt: wDown.gone },
      { character: foreman, entryX, steps: foremanSteps, endAt: fDown.gone },
    ],
    debris,
    machines: [],
    stairs,
    effects,
    realMoves,
    restore: () => undo.forEach((f) => f()),
  };
}

// Mess on the floor: rubble, a muddy patch, or a tyre mark — which the
// cleaning crew mop up after the builders have gone. `spot` (px) is where
// it is, for planning who cleans it.
function floorDebris(x: number, appearAt: number, mess: "rubble" | "mud" | "tyre"): DustSpeck {
  return {
    left: `${x.toFixed(1)}px`,
    bottom: FLOOR - 4 + Math.random() * 4,
    size: mess === "tyre" ? 64 : 40 + Math.random() * 14,
    floor: true,
    mess,
    spot: x,
    appearAt,
    wetAt: null,
    clearAt: Number.POSITIVE_INFINITY,
  };
}

// A dirty smudge low on the glass, where the crew can reach it.
function glassDebris(x: number, appearAt: number): DustSpeck {
  return {
    left: `${x.toFixed(1)}px`,
    bottom: FLOOR + 70 + Math.random() * 20,
    size: 38 + Math.random() * 10,
    floor: false,
    spot: x,
    appearAt,
    wetAt: null,
    clearAt: Number.POSITIVE_INFINITY,
  };
}

// After the builders: the cleaning crew in to clean up their mess — the
// mop for anything on the floor, someone with a spray bottle or cloth for
// the glass. Null if there's nothing to clean or nobody free to do it.
function planCleanup(exclude: Name[], left: DustSpeck[]): RoundPlan | null {
  const vw = window.innerWidth;
  // (Not what the digger's already scooped up.)
  const mess = left.filter((d) => !Number.isFinite(d.clearAt));
  const available = ALL_NAMES.filter((n) => !exclude.includes(n));
  // Anything close together is one job.
  const jobs = (floor: boolean) => {
    const spots = mess.filter((d) => d.floor === floor).sort((a, b) => (a.spot ?? 0) - (b.spot ?? 0));
    const out: { x: number; specks: DustSpeck[] }[] = [];
    for (const d of spots) {
      const last = out[out.length - 1];
      if (last && (d.spot ?? 0) - last.x < 70) last.specks.push(d);
      else out.push({ x: d.spot ?? 0, specks: [d] });
    }
    return out;
  };
  const floorJobs = jobs(true);
  const glassJobs = jobs(false);
  const mopper: Name | null = floorJobs.length && available.includes("orange") ? "orange" : null;
  const wiper = glassJobs.length ? (available.find((n) => n !== "orange") ?? null) : null;
  if (!mopper && !wiper) return null;

  // In from whichever side is nearer the mess.
  const spots = [...floorJobs, ...glassJobs].map((j) => j.x);
  const from: "left" | "right" = spots.reduce((a, b) => a + b, 0) / spots.length < vw / 2 ? "left" : "right";
  const facing: 1 | -1 = from === "left" ? 1 : -1;
  const entryX = from === "left" ? -12 : 112;
  // Fresh copies: already there when the round starts, cleared as they're cleaned.
  const dust: DustSpeck[] = [];
  const copy = (d: DustSpeck) => {
    const c = { ...d, appearAt: -700, clearAt: 0 };
    dust.push(c);
    return c;
  };
  const floor: FloorActor[] = [];
  let startAt = 60;
  for (const [name, list, reach] of [
    [mopper, floorJobs, 22],
    [wiper, glassJobs, 26],
  ] as const) {
    if (!name) continue;
    const c = CHARACTERS[name];
    const ordered = facing === 1 ? list : [...list].reverse();
    const stops = ordered.map((j) => ((j.x - facing * (c.width / 2 + reach)) / vw) * 100);
    const patches = ordered.map((j) => j.specks.map(copy));
    floor.push(buildFloorScript(c, startAt, entryX, stops, dust, vw, { patches }));
    startAt += 700;
  }
  const endAt = wrapUp(floor, null, null, entryX, vw);
  return {
    kind: "clean",
    floor,
    gondola: null,
    stairs: null,
    dust,
    cheerStyle: "nod",
    confetti: false,
    moonwalk: false,
    endAt,
    cast: [mopper, wiper].filter((n): n is Name => n !== null),
  };
}

// --- drawing it ------------------------------------------------------------

// Construction gear: a hi-vis vest with reflective stripes, and a hard hat.
function Workwear({ character }: { character: Character }) {
  const { width, height, shape, radius, vest, medic } = character;
  if (medic) {
    const capW = width * (shape === "block" ? 0.86 : 0.6);
    return (
      <>
        {/* A white cap with a red cross, and a cross on the chest. */}
        <svg
          className="absolute"
          style={{ left: (width - capW) / 2, top: -capW * 0.3, width: capW, height: capW * 0.42 }}
          viewBox="0 0 100 42"
          aria-hidden="true"
        >
          <path d="M8,40 C8,4 92,4 92,40 Z" fill="#f7f8fb" stroke="#c9ced9" strokeWidth="3" />
          <rect x="45" y="12" width="10" height="24" rx="2" fill="#e0564f" />
          <rect x="38" y="19" width="24" height="10" rx="2" fill="#e0564f" />
        </svg>
        <svg
          className="absolute"
          style={{ left: width / 2 - 8, top: height * (shape === "block" ? 0.55 : 0.62), width: 16, height: 16 }}
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <rect x="0" y="0" width="16" height="16" rx="3" fill="#f7f8fb" />
          <rect x="6.5" y="3" width="3" height="10" rx="1" fill="#e0564f" />
          <rect x="3" y="6.5" width="10" height="3" rx="1" fill="#e0564f" />
        </svg>
      </>
    );
  }
  if (!vest) return null;
  const vestTop = height * (shape === "block" ? 0.46 : 0.6);
  const hatW = width * (shape === "block" ? 0.9 : 0.62);
  const hatH = hatW * 0.46;
  return (
    <>
      <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: radius }}>
        <div className="absolute inset-x-0 bottom-0" style={{ top: vestTop, backgroundColor: vest }}>
          {[0.3, 0.62].map((f) => (
            <div key={f} className="absolute inset-x-0" style={{ top: `${f * 100}%`, height: 5, backgroundColor: "rgba(236, 239, 245, 0.92)" }} />
          ))}
        </div>
      </div>
      <svg
        className="absolute"
        style={{ left: (width - hatW) / 2, top: -hatH * 0.62, width: hatW, height: hatH }}
        viewBox="0 0 100 46"
        aria-hidden="true"
      >
        <path d="M10,40 C10,6 90,6 90,40 Z" fill="#f5c518" />
        <rect x="0" y="37" width="100" height="9" rx="4.5" fill="#e0ab0b" />
        <rect x="46" y="10" width="8" height="28" rx="3" fill="#ffd84a" />
      </svg>
    </>
  );
}

// A welding torch: lit, with a blue flame and sparks, while welding.
function Torch({ lit }: { lit: boolean }) {
  return (
    <div className="relative">
      <svg width="34" height="20" viewBox="0 0 34 20" className="absolute" style={{ left: -6, top: -10 }} aria-hidden="true">
        <rect x="0" y="6" width="16" height="8" rx="3" fill="#4b5563" />
        <rect x="15" y="8" width="12" height="4" rx="2" fill="#9aa3b5" />
        {lit && <path className="crew-flame" d="M27,10 Q34,6 38,10 Q34,14 27,10 Z" fill="#7cc7f0" style={{ transformOrigin: "27px 10px" }} />}
      </svg>
      {lit && (
        <div className="absolute" style={{ left: 26, top: 0 }}>
          <SparkBurst />
        </div>
      )}
    </div>
  );
}

// A little shower of sparks, going off over and over.
function SparkBurst({ big = false }: { big?: boolean }) {
  const [bits] = useState(() =>
    Array.from({ length: big ? 12 : 7 }, (_, i) => ({
      sx: (Math.random() * 2 - 1) * (big ? 34 : 22),
      sy: -8 + Math.random() * (big ? 40 : 26),
      delay: Math.round(i * (big ? 55 : 70) + Math.random() * 60),
    }))
  );
  return (
    <>
      {bits.map((b, i) => (
        <span
          key={i}
          className="crew-spark-fly absolute rounded-full"
          style={
            {
              left: -2,
              top: -2,
              width: 4,
              height: 4,
              backgroundColor: i % 3 ? "#ffd84a" : "#fff5c2",
              boxShadow: "0 0 6px rgba(255, 200, 60, 0.9)",
              animationDelay: `${b.delay}ms`,
              "--sx": `${b.sx}px`,
              "--sy": `${b.sy}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

// The crane truck, drawn facing right.
function TruckBody({ wheels }: { wheels: (el: SVGGElement | null) => void }) {
  return (
    <svg width={TRUCK_W} height={TRUCK_H} viewBox={`0 0 ${TRUCK_W} ${TRUCK_H}`} className="absolute inset-0 overflow-visible" aria-hidden="true">
      {/* chassis and flatbed, with hazard stripes */}
      <rect x="6" y="54" width="176" height="16" rx="3" fill="#4b5563" />
      <rect x="10" y="46" width="166" height="10" rx="2" fill="#f2b632" />
      {Array.from({ length: 9 }, (_, i) => (
        <path key={i} d={`M${16 + i * 18},46 l8,0 l-6,10 l-8,0 Z`} fill="#2b2f36" opacity="0.85" />
      ))}
      {/* the crane's turret */}
      <rect x="30" y="30" width="42" height="18" rx="4" fill="#f2b632" stroke="#c7871a" strokeWidth="2" />
      <circle cx={PIVOT_X} cy={TRUCK_H - PIVOT_UP} r="6" fill="#4b5563" />
      {/* cab */}
      <path d="M178,70 L178,24 Q178,18 184,18 L214,18 Q222,18 226,26 L236,46 L236,70 Z" fill="#f2b632" stroke="#c7871a" strokeWidth="2" />
      <path d="M186,24 L212,24 Q217,24 219,29 L226,44 L186,44 Z" fill="#bfe3f7" />
      {/* The driver, and an elbow out of the window. */}
      <Driver x={200} y={26} color="#8c4fa3" size={14} />
      <rect x={204} y={42} width={20} height={7} rx={3.5} fill="#8c4fa3" />
      <circle cx={225} cy={45.5} r={4.5} fill="#8c4fa3" />
      <rect x="228" y="58" width="10" height="6" rx="2" fill="#fff4c2" />
      {/* beacon */}
      <rect className="crew-beacon" x="196" y="11" width="12" height="7" rx="3" fill="#ff8a1f" />
      {/* wheels */}
      {[48, 196].map((cx) => (
        <g key={cx} ref={wheels} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
          <circle cx={cx} cy={TRUCK_H - 16} r="16" fill="#2b2f36" />
          <circle cx={cx} cy={TRUCK_H - 16} r="7" fill="#9aa3b5" />
          <rect x={cx - 1.5} y={TRUCK_H - 29} width="3" height="9" rx="1.5" fill="#9aa3b5" />
        </g>
      ))}
    </svg>
  );
}

// ------------------------------------------------------------ the machines

// Besides the crane, each repair brings some of a digger, a cement mixer and
// a forklift, each with someone at the controls and a job to do:
// - The digger: a heap of rubble comes down on top of the fallen piece, and
//   the digger digs it out a bucketful at a time, taking each load off the
//   screen — then shoves the piece over under the hook, if nothing else is
//   going to move it. Once the piece is back up, it comes back for every bit
//   of rubble it can get at.
// - The forklift: forks under the piece and holds it partway up for the
//   hook — or takes the broken one away and brings a new one on a pallet.
// - The cement mixer: backs in and pours glue into a bucket for the welder
//   to stick the piece back on with, then swings its chute up and sprays
//   filler into the holes it broke out of.
// Each goes back out the way it came once its job's done. The tower crane
// only comes for something up in the top bar (see planTopRepair).

type MachineKind = "tower" | "digger" | "mixer" | "forklift";

interface MachinePlan {
  kind: MachineKind;
  /** px from the left of the screen to its left edge (for the tower crane: its mast's middle). */
  left: number;
  /** Which way it faces. */
  dir: 1 | -1;
  /** The side it came in from (-1: the left), to back out that way if they're caught. */
  from: 1 | -1;
  /** The machine as a whole, and its moving parts, as keyframe tracks (see track). */
  frames: Frame[];
  parts: Partial<Record<string, Frame[]>>;
  /** Tower crane only: how tall its mast is, and how far its jib reaches. */
  mastH?: number;
  jib?: number;
  /** Forklift: the pallet a new piece comes on — where it's set down (px), and how wide it is. */
  pallet?: { left: number; w: number };
  /** Mixer: where its jet of filler starts (px from its own top left, parked) and how far it can reach. */
  jet?: { x: number; y: number; len: number };
}

const DIGGER_W = 150;
const DIGGER_H = 86;
const MIXER_W = 210;
const MIXER_H = 92;
const FORKLIFT_W = 112;
const FORKLIFT_H = 96;
// How far a machine gets in a second: slow and heavy coming in, quicker once
// it's to-ing and fro-ing.
const MACHINE_PX_PER_S = 130;
const TRIP_PX_PER_S = 280;
// How far past its front the digger's bucket reaches.
const DIGGER_REACH = 66;
// How high the forklift holds the piece up for the hook; the pallet a new
// one comes on.
const FORK_RAISE = 60;
const PALLET_H = 8;
// How far off to one side the piece ends up when the digger has to shove it
// back under the hook.
const SHOVE_PX = 70;
// Spreading the glue on.
const GLUE_MS = 1800;

const machineDriveMs = (px: number, speed = MACHINE_PX_PER_S) => Math.max(700, (Math.abs(px) / speed) * 1000);
const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

// A machine's position through the round, drive by drive: how far (px) it
// is from where it's drawn.
function drivePath(x0: number) {
  const frames: Frame[] = [[0, { transform: `translateX(${x0.toFixed(1)}px)` }]];
  let x = x0;
  return {
    frames,
    at: () => x,
    /** Sits still until `from`, then drives to `to`; says when it gets there. */
    drive(from: number, to: number, ms: number, easing = "ease-in-out") {
      frames.push([from, { transform: `translateX(${x.toFixed(1)}px)` }, easing], [from + ms, { transform: `translateX(${to.toFixed(1)}px)` }]);
      x = to;
      return from + ms;
    },
  };
}

// A moving part, from one pose to the next.
function poseTrack(first: Keyframe) {
  const frames: Frame[] = [[0, first]];
  let now = first;
  return {
    frames,
    /** Holds until `from`, then moves to `to` over `ms`; says when it's there. */
    to(from: number, ms: number, to: Keyframe, easing = "ease-in-out") {
      frames.push([from, now, easing], [from + ms, to]);
      now = to;
      return from + ms;
    },
    /** Snaps to `to` (out of sight). */
    set(at: number, to: Keyframe) {
      frames.push([at, now], [at, to]);
      now = to;
    },
  };
}

// The digger's treads, rolling round as it drives.
function treadsFor(path: Frame[]): Frame[] {
  const xOf = (f: Frame) => parseFloat(String(f[1].transform).replace("translateX(", ""));
  const out: Frame[] = [[0, { transform: "translateX(0px)" }]];
  let roll = 0;
  for (let i = 1; i < path.length; i++) {
    const d = xOf(path[i]) - xOf(path[i - 1]);
    if (Math.abs(d) < 0.5) continue;
    const to = roll - d * 0.25;
    out.push([path[i - 1][0], { transform: `translateX(${roll.toFixed(1)}px)` }, path[i - 1][2]], [path[i][0], { transform: `translateX(${to.toFixed(1)}px)` }]);
    // (Every 24px looks the same, so it can jump back while it's still.)
    roll = ((to % 24) + 24) % 24;
    out.push([path[i][0], { transform: `translateX(${roll.toFixed(1)}px)` }]);
  }
  return out;
}

// Someone at the controls: a head in a hard hat, looking the way it's going.
function Driver({ x, y, color, size = 16 }: { x: number; y: number; color: string; size?: number }) {
  const s = size;
  return (
    <g>
      <rect x={x} y={y} width={s} height={s * 1.25} rx={s * 0.3} fill={color} />
      <path d={`M${x - 2},${y + s * 0.3} Q${x + s / 2},${y - s * 0.55} ${x + s + 2},${y + s * 0.3} Z`} fill="#f2b632" />
      <rect x={x - 3} y={y + s * 0.26} width={s + 6} height={s * 0.12} rx={1} fill="#d99a1c" />
      <circle cx={x + s * 0.5} cy={y + s * 0.62} r={s * 0.14} fill="#fff" />
      <circle cx={x + s * 0.82} cy={y + s * 0.62} r={s * 0.14} fill="#fff" />
      <circle cx={x + s * 0.56} cy={y + s * 0.64} r={s * 0.07} fill={INK} />
      <circle cx={x + s * 0.88} cy={y + s * 0.64} r={s * 0.07} fill={INK} />
    </g>
  );
}

// The fallen piece, lying on the floor under where the hook will come down.
interface FallenPiece {
  /** Its left and right edges (px), and how tall it is. */
  left: number;
  right: number;
  h: number;
  /** When it's down and still. */
  at: number;
  /** Whether it can be shoved along the floor to the hook (the truck's hook can't come to it). */
  canShove: boolean;
  /** Puts it `dx` px along and `up` px off the floor from where it's lying, at `at` (easing into its next move). */
  move: (at: number, dx: number, up: number, easing?: string) => void;
}

// What the machines do before the hook comes, and what they need from the
// builders' side of it.
interface MachineWork {
  /** When the piece is ready for the hook, and how high up it is by then. */
  readyAt: number;
  raisedBy: number;
  /** A machine's still right up against the piece then (so the welder stands in front of it). */
  crowded: boolean;
  /** The bucket of glue: where it is (px, its middle), and when it's full. */
  glue: { x: number; at: number } | null;
  /** The heap of rubble on the piece, if the digger has that to dig out. */
  heap: { x: number; w: number; h: number; frames: Frame[] } | null;
  /** While it's the broken piece (it's swapped for a new one after). */
  cracked: [number, number] | null;
  /** Filler sprayed into the holes: where, and when. */
  filler: { x: number; y: number; at: number }[];
  /** The rest, once the builders have their schedule: gives back the machines. */
  finish: (o: { liftStart: number; clear: number; gluePickedAt: number | null }) => MachinePlan[];
}

// Plans the machines for a repair, in the floor space left free by the
// crane and the builders. `side` is the side of the piece they work from.
// Keyframe times are ms into the round.
function planMachines(o: {
  vw: number;
  floorY: number;
  /** How many to bring (at most). */
  count: number;
  /** Where the crane is (px), and where the builders are working. */
  truckSpan: [number, number];
  workZone: [number, number];
  side: 1 | -1;
  arriveFrom: number;
  piece: FallenPiece | null;
  /** Where the break is (px), for the mixer to back up to. */
  targetX: number;
  /** Whether the piece can be glued back on, and the holes it left to fill. */
  glue: boolean;
  holes: Vec[];
  /** Rubble where the piece hit the floor — unless it all comes down on top of it. */
  pieceRubble: DustSpeck[];
  debris: DustSpeck[];
}): MachineWork {
  const { vw, floorY, side: s, piece, debris } = o;
  const options: MachineKind[] = ["digger"];
  if (o.glue || o.holes.length) options.push("mixer");
  if (piece) options.push("forklift");
  const chosen = new Set(options.sort(() => Math.random() - 0.5).slice(0, o.count));
  const taken: [number, number][] = [o.truckSpan, o.workZone];
  const work: MachineWork = { readyAt: 0, raisedBy: 0, crowded: false, glue: null, heap: null, cracked: null, filler: [], finish: () => [] };
  let arrival = o.arriveFrom;

  // --- the forklift, if the piece can be got at from this side.
  const forkDir = (-s) as 1 | -1;
  const under = piece ? Math.min(40, (piece.right - piece.left) * 0.45) : 0;
  // Its forks run from 99px to 149px along it (mirrored when it faces left).
  const forkLeft = piece ? (forkDir === 1 ? piece.left + under - 149 : piece.right - under + 37) : 0;
  const fork = piece && chosen.has("forklift") && forkLeft > -30 && forkLeft + FORKLIFT_W < vw + 30 ? { swap: Math.random() < 0.5 } : null;

  // --- the digger: digging the piece out, if there's room on this side.
  // Parked facing the piece, its bucket reaching `x`.
  const digDir = (-s) as 1 | -1;
  const digLeftFor = (x: number) => (digDir === -1 ? x + DIGGER_REACH : x - DIGGER_REACH - DIGGER_W);
  // (Somewhere it can get to without going through the crane.)
  const digFits = (left: number) =>
    left > -40 && left + DIGGER_W < vw + 40 && (s === 1 ? o.truckSpan[1] <= left : o.truckSpan[0] >= left + DIGGER_W);
  let heap: { x: number; w: number; h: number; reach: number[] } | null = null;
  let shove = false;
  if (piece && chosen.has("digger")) {
    for (const shoved of piece.canShove && !fork ? [true, false] : [false]) {
      const dx = shoved ? s * SHOVE_PX : 0;
      const w = piece.right - piece.left + 36;
      const x = (piece.left + piece.right) / 2 + dx;
      const reach = w > 110 ? [x + s * w * 0.28, x + s * w * 0.02] : [x + s * w * 0.15];
      const contact = (s === 1 ? piece.right : piece.left) + dx + s * 4;
      if (reach.every((r) => digFits(digLeftFor(r))) && (!shoved || digFits(digLeftFor(contact)))) {
        heap = { x, w, h: Math.min(piece.h * 0.85 + 8, 84), reach };
        shove = shoved;
        break;
      }
    }
  }
  if (!heap) debris.push(...o.pieceRubble);
  const rubble = () => debris.filter((d) => d.mess === "rubble" && !Number.isFinite(d.clearAt));
  const canReach = (d: DustSpeck) => digFits(digLeftFor(d.spot ?? 0));
  const digger = chosen.has("digger") && !!(heap || rubble().some(canReach));

  // Out of the way of whoever works the piece (the mixer parks elsewhere).
  if (piece && (heap || fork)) taken.push(s === 1 ? [piece.right, piece.right + 300] : [piece.left - 300, piece.left]);

  // --- the digger's trips: each bucketful off the screen and back.
  const dig = (() => {
    if (!digger) return null;
    const first = heap ? heap.reach[0] : (rubble().find(canReach)?.spot ?? 0);
    const left = digLeftFor(first);
    const offX = s === 1 ? vw + 30 - left : -(left + DIGGER_W + 30);
    const path = drivePath(offX);
    const carry = { boom: "rotate(-38deg)", stick: "rotate(96deg)", bucket: "rotate(30deg)" };
    const down = { boom: "rotate(2deg)", stick: "rotate(44deg)", bucket: "rotate(0deg)" };
    const curl = { boom: "rotate(4deg)", stick: "rotate(30deg)", bucket: "rotate(-85deg)" };
    const full = { boom: "rotate(-34deg)", stick: "rotate(80deg)", bucket: "rotate(-85deg)" };
    const arm = { boom: poseTrack({ transform: carry.boom }), stick: poseTrack({ transform: carry.stick }), bucket: poseTrack({ transform: carry.bucket }) };
    const pose = (from: number, ms: number, p: typeof carry) => {
      (["boom", "stick", "bucket"] as const).forEach((k) => arm[k].to(from, ms, { transform: p[k] }));
      return from + ms;
    };
    const load = poseTrack({ opacity: 0 });
    let t = o.arriveFrom;
    let trips = 0;
    // One bucketful from `x`: in, scoop, and back out to tip it somewhere
    // off the screen. Says when it's scooped up.
    const bite = (from: number, x: number) => {
      const parkX = digLeftFor(x) - left;
      t = path.drive(from, parkX, machineDriveMs(parkX - path.at(), trips ? TRIP_PX_PER_S : MACHINE_PX_PER_S), trips ? "ease-in-out" : "cubic-bezier(0.25, 0.6, 0.35, 1)");
      trips++;
      t = pose(t + 150, 750, down);
      t = pose(t, 550, curl);
      const scooped = t;
      load.to(scooped - 150, 150, { opacity: 1 });
      t = pose(t, 750, full);
      t = path.drive(t + 150, offX, machineDriveMs(offX - parkX, TRIP_PX_PER_S), "ease-in");
      load.set(t, { opacity: 0 });
      arm.boom.set(t, { transform: carry.boom });
      arm.stick.set(t, { transform: carry.stick });
      arm.bucket.set(t, { transform: carry.bucket });
      t += 500;
      return scooped;
    };
    return { left, path, arm, load, bite, pose, down, carry, get t() { return t; }, set t(v: number) { t = v; }, get trips() { return trips; } };
  })();

  // --- the heap, dug out; and the piece shoved over to the hook.
  let pieceFree = piece ? piece.at : 0;
  if (piece && heap && dig) {
    const heapAt = piece.at + (shove ? 520 : 100);
    if (shove) {
      piece.move(piece.at, 0, 0, "ease-out");
      piece.move(piece.at + 500, s * SHOVE_PX, 0);
    }
    const heapFrames: Frame[] = [
      [0, { transform: "scale(0)" }],
      [heapAt, { transform: "scale(0.2, 0)" }, "cubic-bezier(0.2, 0.9, 0.3, 1.2)"],
      [heapAt + 450, { transform: "scale(1)" }],
    ];
    dig.t = Math.max(o.arriveFrom, heapAt + 800);
    heap.reach.forEach((x, i) => {
      const scooped = dig.bite(dig.t, x);
      const left = 1 - (i + 1) / heap!.reach.length;
      heapFrames.push([scooped - 550, heapFrames[heapFrames.length - 1][1], "ease-in"], [scooped, { transform: left ? `scale(0.75, ${left})` : "scale(0.4, 0)" }]);
    });
    pieceFree = dig.t;
    if (shove) {
      // Bucket down against the side of it, and pushed along to the hook.
      const contact = (s === 1 ? piece.right : piece.left) + s * SHOVE_PX + s * 4;
      const parkX = digLeftFor(contact) - dig.left;
      dig.pose(dig.t, 900, dig.down);
      let t = dig.path.drive(dig.t, parkX, machineDriveMs(parkX - dig.path.at(), TRIP_PX_PER_S));
      const pushAt = t + 200;
      t = dig.path.drive(pushAt, parkX - s * SHOVE_PX, 1500);
      piece.move(pushAt, s * SHOVE_PX, 0, "ease-in-out");
      piece.move(t, 0, 0);
      pieceFree = t;
      dig.pose(t + 100, 700, dig.carry);
      const offX = s === 1 ? vw + 30 - dig.left : -(dig.left + DIGGER_W + 30);
      dig.t = dig.path.drive(t + 300, offX, machineDriveMs(offX - dig.path.at(), TRIP_PX_PER_S), "ease-in") + 400;
    }
    work.heap = { x: heap.x, w: heap.w, h: heap.h, frames: heapFrames };
    arrival += 1300;
  }
  work.readyAt = pieceFree;

  // --- the forklift: in once the piece is clear.
  let forkPlan: { path: ReturnType<typeof drivePath>; forks: ReturnType<typeof poseTrack>; pallet: ReturnType<typeof poseTrack> | null; offX: number } | null = null;
  if (piece && fork) {
    const offX = s === 1 ? vw - forkLeft + 70 : -(forkLeft + FORKLIFT_W + 70);
    const path = drivePath(offX);
    const forks = poseTrack({ transform: "translateY(0px)" });
    const up = (px: number) => ({ transform: `translateY(${-px}px)` });
    // (After the digger's out of the way, if it's been digging it out.)
    const start = Math.max(arrival, heap ? pieceFree : 0);
    let t = path.drive(start, 0, machineDriveMs(offX), "cubic-bezier(0.25, 0.6, 0.35, 1)");
    let pallet: ReturnType<typeof poseTrack> | null = null;
    if (!fork.swap) {
      // Forks under it, and up it goes, partway to where it belongs.
      const from = t + 300;
      t = forks.to(from, 1800, up(FORK_RAISE));
      piece.move(from, 0, 0, "ease-in-out");
      piece.move(t, 0, FORK_RAISE);
      work.raisedBy = FORK_RAISE;
      work.readyAt = t + 200;
    } else {
      // The broken one lifted and taken off the screen...
      const from = t + 300;
      t = forks.to(from, 600, up(20));
      piece.move(from, 0, 0, "ease-in-out");
      piece.move(t, 0, 20);
      const outX = s === 1 ? vw - piece.left + 40 : -(piece.right + 40);
      const goAt = t + 200;
      t = path.drive(goAt, outX, machineDriveMs(outX, TRIP_PX_PER_S), "ease-in");
      piece.move(goAt, 0, 20, "ease-in");
      piece.move(t, outX, 20);
      work.cracked = [0, t];
      // ...and, out of sight, a new one on a pallet brought back in and set
      // down under the hook.
      const place = (dx: number, lift: number) => ({ transform: `translate(${dx.toFixed(1)}px, ${-lift}px)`, opacity: 1 });
      pallet = poseTrack({ ...place(outX, 20), opacity: 0 });
      pallet.set(t + 1, place(outX, 20));
      piece.move(t + 1, outX, 20 + PALLET_H);
      const backAt = t + 900;
      piece.move(backAt, outX, 20 + PALLET_H, "ease-out");
      pallet.to(backAt, machineDriveMs(outX, TRIP_PX_PER_S), place(0, 20), "ease-out");
      t = path.drive(backAt, 0, machineDriveMs(outX, TRIP_PX_PER_S), "ease-out");
      piece.move(t, 0, 20 + PALLET_H);
      const downAt = t + 200;
      forks.to(downAt, 700, up(0));
      pallet.to(downAt, 700, place(0, 0));
      piece.move(downAt, 0, 20 + PALLET_H, "ease-in-out");
      t = downAt + 700;
      piece.move(t, 0, PALLET_H);
      // Backing off out of the welder's way.
      t = path.drive(t + 200, s * 90, 900);
      work.raisedBy = PALLET_H;
      work.readyAt = t;
    }
    work.crowded = true;
    forkPlan = { path, forks, pallet, offX };
    arrival += 1000;
  }

  // --- the mixer: backed up to the break, glue into a bucket, filler into
  // the holes.
  let mix: { body: number; dir: 1 | -1; from: 1 | -1; off: number; path: ReturnType<typeof drivePath>; chute: ReturnType<typeof poseTrack>; stream: ReturnType<typeof poseTrack>; fill: ReturnType<typeof poseTrack> | null; jet: ReturnType<typeof poseTrack> | null; jetAt: { x: number; y: number; len: number } | null; doneAt: number } | null = null;
  if (chosen.has("mixer")) {
    const room = MIXER_W + 40;
    // Anywhere there's room for it.
    const spots = Array.from({ length: Math.max(0, Math.floor((vw - room - 20) / 10)) }, (_, i) => 10 + i * 10).filter((a) =>
      taken.every((z) => !overlaps([a, a + room], z))
    );
    const spot = spots.length ? spots[Math.floor(Math.random() * spots.length)] : undefined;
    if (spot !== undefined) {
      taken.push([spot - 10, spot + room + 10]);
      // Backing up to it: its back (where the chute is) toward the break.
      const middle = spot + room / 2;
      const dir: 1 | -1 = o.targetX > middle ? -1 : 1;
      const body = dir === 1 ? spot + 40 : spot;
      const from: 1 | -1 = middle < vw / 2 ? -1 : 1;
      const off = from === -1 ? -(body + MIXER_W + 30) : vw - body + 30;
      const path = drivePath(off);
      let t = path.drive(arrival, 0, machineDriveMs(off), "cubic-bezier(0.25, 0.6, 0.35, 1)");
      const chute = poseTrack({ transform: "rotate(-60deg)" });
      const stream = poseTrack({ transform: "scaleY(0)", opacity: 1 });
      let fill: ReturnType<typeof poseTrack> | null = null;
      if (o.glue) {
        // Glue, poured into a bucket at the back.
        fill = poseTrack({ transform: "scaleY(0)" });
        const pourAt = chute.to(t + 600, 500, { transform: "rotate(0deg)" });
        stream.to(pourAt, 350, { transform: "scaleY(1)", opacity: 1 }, "ease-in");
        fill.to(pourAt + 300, 2000, { transform: "scaleY(1)" });
        const poured = pourAt + 2300;
        stream.to(poured, 300, { transform: "scaleY(1)", opacity: 0 }, "ease-out");
        stream.set(poured + 300, { transform: "scaleY(0)", opacity: 1 });
        t = chute.to(poured + 300, 500, { transform: "rotate(-60deg)" });
        work.glue = { x: dir === 1 ? body - 10 : body + MIXER_W + 10, at: poured + 300 };
      }
      // Filler: the chute up, and a jet of it into each hole in turn.
      let jet: ReturnType<typeof poseTrack> | null = null;
      let jetAt: { x: number; y: number; len: number } | null = null;
      if (o.holes.length) {
        const origin = { x: dir === 1 ? body - 6 : body + MIXER_W + 6, y: floorY - 56 };
        const aims = o.holes.map((h) => ({ h, a: (Math.atan2(h.y - origin.y, h.x - origin.x) * 180) / Math.PI, d: Math.hypot(h.x - origin.x, h.y - origin.y) }));
        const len = Math.max(...aims.map((a) => a.d));
        jetAt = { x: origin.x - body, y: origin.y - (floorY + 2 - MIXER_H), len };
        const aim = (a: number, k: number) => ({ transform: `rotate(${a.toFixed(1)}deg) scaleX(${k.toFixed(3)})` });
        jet = poseTrack(aim(aims[0].a, 0));
        t = chute.to(t + 300, 600, { transform: "rotate(50deg)" });
        for (const { h, a, d } of aims) {
          jet.set(t, aim(a, 0));
          const hit = jet.to(t, 350, aim(a, d / len), "ease-out");
          work.filler.push({ x: h.x, y: h.y, at: hit });
          t = jet.to(hit + 700, 250, aim(a, 0), "ease-in");
          t += 150;
        }
        t = chute.to(t, 600, { transform: "rotate(-60deg)" });
      }
      mix = { body, dir, from, off, path, chute, stream, fill, jet, jetAt, doneAt: t };
    }
  }

  work.finish = ({ liftStart, clear, gluePickedAt }) => {
    const plans: MachinePlan[] = [];
    let forkGone = 0;
    if (forkPlan && piece && fork) {
      const { path, forks, pallet, offX } = forkPlan;
      let t: number;
      if (!fork.swap) {
        // Forks down once the hook's taken it, and off.
        t = forks.to(liftStart + 700, 600, { transform: "translateY(0px)" });
        t = path.drive(t + 200, offX, machineDriveMs(offX, TRIP_PX_PER_S), "ease-in");
      } else {
        // Back for the empty pallet once the new piece is up off it.
        t = path.drive(Math.max(liftStart + 900, path.frames[path.frames.length - 1][0]), 0, 900);
        forks.to(t + 150, 600, { transform: "translateY(-20px)" });
        pallet!.to(t + 150, 600, { transform: "translate(0px, -20px)", opacity: 1 });
        const goAt = t + 950;
        const ms = machineDriveMs(offX, TRIP_PX_PER_S);
        pallet!.to(goAt, ms, { transform: `translate(${offX.toFixed(1)}px, -20px)`, opacity: 1 }, "ease-in");
        t = path.drive(goAt, offX, ms, "ease-in");
      }
      forkGone = t;
      plans.push({
        kind: "forklift",
        left: forkLeft,
        dir: forkDir,
        from: s,
        frames: path.frames,
        parts: { forks: forks.frames, ...(pallet ? { pallet: pallet.frames } : {}) },
        pallet: fork.swap ? { left: piece.left - 5, w: piece.right - piece.left + 10 } : undefined,
      });
    }
    let mixGone = 0;
    let mixSpan: [number, number] | null = null;
    if (mix) {
      const leaveAt = Math.max(mix.doneAt, gluePickedAt ?? 0) + 600;
      mixGone = mix.path.drive(leaveAt, mix.off, machineDriveMs(mix.off), "ease-in");
      mixSpan = [mix.body - 50, mix.body + MIXER_W + 50];
      plans.push({
        kind: "mixer",
        left: mix.body,
        dir: mix.dir,
        from: mix.from,
        frames: mix.path.frames,
        parts: {
          chute: mix.chute.frames,
          stream: mix.stream.frames,
          ...(mix.fill ? { fill: mix.fill.frames, bucket: gluePickedAt !== null ? [[0, { opacity: 1 }], [gluePickedAt, { opacity: 1 }], [gluePickedAt, { opacity: 0 }]] as Frame[] : [[0, { opacity: 1 }]] as Frame[] } : {}),
          ...(mix.jet ? { jet: mix.jet.frames } : {}),
        },
        jet: mix.jetAt ?? undefined,
      });
    }
    if (dig) {
      // Back for the rest of the rubble, now nothing else is in the way.
      dig.t = Math.max(dig.t, clear + 300, forkGone);
      const order = rubble()
        .filter(canReach)
        .sort((a, b) => s * ((b.spot ?? 0) - (a.spot ?? 0)));
      for (const d of order) {
        const x = d.spot ?? 0;
        const left = digLeftFor(x);
        let from = Math.max(dig.t, d.appearAt + 300);
        if (mixSpan && overlaps([left, left + DIGGER_W], mixSpan)) from = Math.max(from, mixGone);
        d.clearAt = dig.bite(from, x);
      }
      if (dig.trips) {
        plans.push({
          kind: "digger",
          left: dig.left,
          dir: digDir,
          from: s,
          frames: dig.path.frames,
          parts: { boom: dig.arm.boom.frames, stick: dig.arm.stick.frames, bucket: dig.arm.bucket.frames, load: dig.load.frames, treads: treadsFor(dig.path.frames) },
        });
      }
    }
    return plans;
  };
  return work;
}

// A machine, playing its keyframes over the round (`total` ms).
function Machine({ plan, total }: { plan: MachinePlan; total: number }) {
  const root = useRef<HTMLDivElement>(null);
  const pallet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anims: Animation[] = [];
    const play = (el: Element | null | undefined, frames: Frame[] | undefined) => {
      if (el && frames) anims.push(el.animate(track(frames, total), { duration: total, fill: "both" }));
    };
    play(root.current, plan.frames);
    // Its moving parts are marked with data-part (the forklift's pallet
    // sits outside it, so it can be left behind).
    for (const [name, frames] of Object.entries(plan.parts)) {
      play(name === "pallet" ? pallet.current : root.current?.querySelector(`[data-part="${name}"]`), frames);
    }
    return () => anims.forEach((a) => a.cancel());
  }, [plan, total]);
  const mirror = plan.dir === -1 ? "scaleX(-1)" : undefined;
  // (Which way to back it out, if they're caught: back the way it came.)
  const exit = plan.from === -1 ? 1 : -1;

  if (plan.kind === "tower") {
    const mastH = plan.mastH ?? 400;
    const jib = plan.jib ?? 400;
    return (
      <div
        ref={root}
        className="absolute"
        data-crew-machine="tower"
        data-crew-dir={plan.dir}
        style={{ left: plan.left - 13, bottom: FLOOR, width: 26, height: mastH, zIndex: 1 }}
      >
        <div className="absolute inset-0" style={{ transform: mirror }}>
          {/* The lattice mast. */}
          <svg className="absolute inset-0" width={26} height={mastH} aria-hidden="true">
            <rect x={2} y={0} width={4} height={mastH} fill="#f2b632" />
            <rect x={20} y={0} width={4} height={mastH} fill="#f2b632" />
            <path
              d={Array.from({ length: Math.ceil(mastH / 22) }, (_, i) => `M4,${i * 22} L22,${i * 22 + 11} L4,${i * 22 + 22}`).join(" ")}
              stroke="#d99a1c"
              strokeWidth={2.5}
              fill="none"
            />
            <rect x={-8} y={mastH - 10} width={42} height={10} rx={2} fill="#6b7280" />
          </svg>
          {/* The top: the cab and counter-jib, and the jib swinging in. */}
          <div className="absolute" style={{ left: 13, top: 0, width: 0, height: 0 }}>
            <div className="absolute rounded-sm" style={{ left: -70, top: -18, width: 64, height: 10, backgroundColor: "#f2b632" }} />
            <div className="absolute rounded-sm" style={{ left: -74, top: -8, width: 26, height: 22, backgroundColor: "#6b7280" }} />
            <svg className="absolute overflow-visible" style={{ left: -16, top: -44 }} width={40} height={40} aria-hidden="true">
              <rect x={0} y={8} width={34} height={28} rx={4} fill="#f2b632" stroke="#c7871a" strokeWidth={2} />
              <rect x={14} y={12} width={16} height={14} rx={2} fill="#bfe3f7" />
              <Driver x={17} y={13} color="#5b6fb8" size={10} />
            </svg>
            <div data-part="jib" className="absolute" style={{ left: 0, top: -20, width: jib, height: 14, transformOrigin: "0% 50%" }}>
              <svg className="absolute inset-0 overflow-visible" width={jib} height={14} aria-hidden="true">
                <rect x={0} y={0} width={jib} height={3} fill="#f2b632" />
                <rect x={0} y={11} width={jib} height={3} fill="#f2b632" />
                <path
                  d={Array.from({ length: Math.ceil(jib / 16) }, (_, i) => `M${i * 16},13 L${i * 16 + 8},1 L${i * 16 + 16},13`).join(" ")}
                  stroke="#d99a1c"
                  strokeWidth={2}
                  fill="none"
                />
              </svg>
              {/* The trolley, and its hook. */}
              <div data-part="trolley" className="absolute" style={{ left: 0, top: 12, width: 0, height: 0 }}>
                <div className="absolute rounded-sm" style={{ left: -9, top: 0, width: 18, height: 8, backgroundColor: "#4b5563" }} />
                <div data-part="cable" className="absolute" style={{ left: -1, top: 8, width: 2, height: 30, backgroundColor: "#3a3f4a" }}>
                  <svg className="absolute" width={18} height={TOP_HOOK_H} style={{ left: -8, top: "100%" }} aria-hidden="true">
                    <rect x="3" y="0" width="12" height="5" rx="1.5" fill="#6b7280" />
                    <path d="M9,5 L9,8 Q9,12 13,11" fill="none" stroke="#4b5563" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (plan.kind === "digger") {
    return (
      <div
        ref={root}
        className="absolute"
        data-crew-machine="digger"
        data-crew-dir={exit}
        style={{ left: plan.left, bottom: FLOOR - 2, width: DIGGER_W, height: DIGGER_H, zIndex: 2 }}
      >
        <div className="absolute inset-0" style={{ transform: mirror }}>
          <svg width={DIGGER_W} height={DIGGER_H} viewBox={`0 0 ${DIGGER_W} ${DIGGER_H}`} className="absolute inset-0 overflow-visible" aria-hidden="true">
            <defs>
              <clipPath id={`digger-track-${plan.left.toFixed(0)}`}>
                <rect x={6} y={64} width={112} height={20} rx={10} />
              </clipPath>
            </defs>
            <rect x={6} y={64} width={112} height={20} rx={10} fill="#2b2f36" />
            <g clipPath={`url(#digger-track-${plan.left.toFixed(0)})`}>
              <g data-part="treads">
                {Array.from({ length: 44 }, (_, i) => (
                  <rect key={i} x={-450 + i * 24} y={64} width={4} height={20} fill="#4b5563" />
                ))}
              </g>
            </g>
            {[20, 42, 64, 86, 106].map((x) => (
              <circle key={x} cx={x} cy={74} r={6} fill="#6b7280" />
            ))}
            <rect x={6} y={42} width={16} height={22} rx={4} fill="#d99a1c" />
            <rect x={14} y={38} width={96} height={28} rx={4} fill="#f2b632" stroke="#c7871a" strokeWidth={2} />
            <path d="M58,38 L58,10 Q58,6 62,6 L90,6 Q94,6 95,10 L100,38 Z" fill="#f2b632" stroke="#c7871a" strokeWidth={2} />
            <path d="M64,12 L88,12 L92,33 L64,33 Z" fill="#bfe3f7" />
            <Driver x={72} y={14} color="#b0563a" size={13} />
          </svg>
          {/* The arm: boom, stick and bucket, each turning on the last. */}
          <div className="absolute" style={{ left: 104, top: 44, width: 0, height: 0 }}>
            <div data-part="boom" className="absolute" style={{ left: 0, top: -5, width: 70, height: 10, transformOrigin: "0% 50%" }}>
              <div className="absolute inset-0 rounded" style={{ backgroundColor: "#f2b632", border: "2px solid #c7871a" }} />
              <div data-part="stick" className="absolute" style={{ left: 66, top: 1, width: 60, height: 8, transformOrigin: "0% 50%" }}>
                <div className="absolute inset-0 rounded" style={{ backgroundColor: "#e3a623", border: "2px solid #c7871a" }} />
                <div data-part="bucket" className="absolute" style={{ left: 56, top: 4, width: 0, height: 0, transformOrigin: "0% 0%" }}>
                  <svg className="absolute overflow-visible" style={{ left: -6, top: -4 }} width={28} height={24} aria-hidden="true">
                    <path d="M2,2 L24,2 Q28,16 16,22 L6,22 Q2,14 2,2 Z" fill="#6b7280" stroke="#4b5563" strokeWidth={1.5} />
                    <path d="M8,22 l2,4 l2,-4 M13,22 l2,4 l2,-4" stroke="#4b5563" strokeWidth={1.5} fill="none" />
                    <g data-part="load" style={{ opacity: 0 }}>
                      <circle cx={9} cy={2} r={4} fill="#8b8478" />
                      <circle cx={16} cy={0} r={4.5} fill="#6f685e" />
                      <circle cx={22} cy={3} r={3.5} fill="#9a9286" />
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (plan.kind === "mixer") {
    return (
      <div
        ref={root}
        className="absolute"
        data-crew-machine="mixer"
        data-crew-dir={exit}
        style={{ left: plan.left, bottom: FLOOR - 2, width: MIXER_W, height: MIXER_H, zIndex: 2 }}
      >
        <div className="absolute inset-0" style={{ transform: mirror }}>
          <svg width={MIXER_W} height={MIXER_H} viewBox={`0 0 ${MIXER_W} ${MIXER_H}`} className="absolute inset-0 overflow-visible" aria-hidden="true">
            <defs>
              <clipPath id={`mixer-drum-${plan.left.toFixed(0)}`}>
                <ellipse cx={86} cy={38} rx={62} ry={25} transform="rotate(-10 86 38)" />
              </clipPath>
            </defs>
            <rect x={6} y={62} width={176} height={12} rx={3} fill="#4b5563" />
            <ellipse cx={86} cy={38} rx={62} ry={25} transform="rotate(-10 86 38)" fill="#e8ecf2" stroke="#9aa3b5" strokeWidth={2} />
            {/* The drum's stripes, turning round and round. */}
            <g clipPath={`url(#mixer-drum-${plan.left.toFixed(0)})`}>
              <g className="crew-drum">
                {Array.from({ length: 12 }, (_, i) => (
                  <path key={i} d={`M${-40 + i * 22},70 L${-18 + i * 22},4`} stroke="#f2b632" strokeWidth={9} />
                ))}
              </g>
            </g>
            <path d="M150,72 L150,26 Q150,20 156,20 L186,20 Q194,20 198,28 L206,46 L206,72 Z" fill="#e0564f" stroke="#b9443e" strokeWidth={2} />
            <path d="M158,26 L184,26 Q189,26 191,31 L197,44 L158,44 Z" fill="#bfe3f7" />
            <Driver x={170} y={28} color="#3c7d6e" size={13} />
            {[36, 70, 176].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy={MIXER_H - 16} r={14} fill="#2b2f36" />
                <circle cx={cx} cy={MIXER_H - 16} r={6} fill="#9aa3b5" />
              </g>
            ))}
          </svg>
          {/* The chute at the back, and the glue pouring out of it. */}
          <div data-part="chute" className="absolute" style={{ left: 16, top: 52, width: 30, height: 7, transformOrigin: "100% 50%" }}>
            <div className="absolute inset-0 rounded-sm" style={{ backgroundColor: "#9aa3b5", transform: "translateX(-24px) rotate(18deg)" }} />
          </div>
          <div
            data-part="stream"
            className="absolute rounded-full"
            style={{ left: -12, top: 60, width: 7, height: MIXER_H - 60 - 14, backgroundColor: "#8e949e", transformOrigin: "50% 0%" }}
          />
          {/* The bucket the glue goes in, for the welder to come and get. */}
          {plan.parts.fill && (
            <div data-part="bucket" className="absolute" style={{ left: -23, top: MIXER_H - 26, width: 26, height: 24 }}>
              <svg className="absolute inset-0 overflow-visible" width={26} height={24} aria-hidden="true">
                <path d="M6,6 C6,-6 20,-6 20,6" fill="none" stroke="#6b7280" strokeWidth={2.5} />
                <path d="M1,5 L25,5 L21,24 L5,24 Z" fill="#9aa3b5" stroke="#6b7280" strokeWidth={1.5} />
              </svg>
              <div data-part="fill" className="absolute rounded-sm" style={{ left: 3, top: 6, width: 20, height: 6, backgroundColor: "#6f7580", transformOrigin: "50% 100%" }} />
            </div>
          )}
        </div>
        {/* A jet of filler from the chute, into the holes it broke out of. */}
        {plan.jet && (
          <div
            data-part="jet"
            className="absolute"
            style={{
              left: plan.jet.x,
              top: plan.jet.y - 3,
              width: plan.jet.len,
              height: 6,
              borderRadius: 3,
              transformOrigin: "0% 50%",
              background: "linear-gradient(90deg, rgba(142,148,158,0.95), rgba(142,148,158,0.8) 80%, rgba(142,148,158,0.35))",
            }}
          />
        )}
      </div>
    );
  }

  // Forklift — and the pallet it brings a new piece on, which it sets down
  // and comes back for.
  return (
    <>
      <div
        ref={root}
        className="absolute"
        data-crew-machine="forklift"
        data-crew-dir={exit}
        style={{ left: plan.left, bottom: FLOOR - 2, width: FORKLIFT_W, height: FORKLIFT_H, zIndex: 2 }}
      >
        <div className="absolute inset-0" style={{ transform: mirror, transformOrigin: `${FORKLIFT_W / 2}px 50%` }}>
          <svg width={FORKLIFT_W} height={FORKLIFT_H} viewBox={`0 0 ${FORKLIFT_W} ${FORKLIFT_H}`} className="absolute inset-0 overflow-visible" aria-hidden="true">
            <rect x={2} y={46} width={18} height={30} rx={4} fill="#d9731a" />
            <rect x={12} y={48} width={76} height={30} rx={5} fill="#ff8a1f" stroke="#d9731a" strokeWidth={2} />
            <path d="M26,48 L26,12 L70,12 L76,48" fill="none" stroke="#4b5563" strokeWidth={4} strokeLinejoin="round" />
            <rect x={36} y={38} width={14} height={10} rx={2} fill="#2b2f36" />
            <Driver x={38} y={20} color="#7a5ea8" size={15} />
            <rect x={92} y={8} width={7} height={80} rx={2} fill="#6b7280" />
            {[30, 72].map((cx, i) => (
              <g key={cx}>
                <circle cx={cx} cy={FORKLIFT_H - 14} r={i ? 14 : 12} fill="#2b2f36" />
                <circle cx={cx} cy={FORKLIFT_H - 14} r={5} fill="#9aa3b5" />
              </g>
            ))}
          </svg>
          <div data-part="forks" className="absolute" style={{ left: 99, top: 62, width: 50, height: 30 }}>
            <div className="absolute rounded-sm" style={{ left: 0, top: 0, width: 5, height: 30, backgroundColor: "#4b5563" }} />
            <div className="absolute rounded-sm" style={{ left: 0, top: 26, width: 50, height: 4, backgroundColor: "#4b5563" }} />
          </div>
        </div>
      </div>
      {plan.pallet && (
        <div
          ref={pallet}
          className="absolute"
          data-crew-machine="pallet"
          data-crew-dir={exit}
          style={{ left: plan.pallet.left, bottom: FLOOR, width: plan.pallet.w, height: PALLET_H, zIndex: 2, opacity: 0 }}
        >
          <div className="absolute inset-x-0 top-0 rounded-sm" style={{ height: 3, backgroundColor: "#b5854f" }} />
          {[0, 0.5, 1].map((f) => (
            <div key={f} className="absolute rounded-sm" style={{ left: `calc(${f * 100}% - ${f * 10}px)`, top: 3, width: 10, height: PALLET_H - 3, backgroundColor: "#8a5f33" }} />
          ))}
        </div>
      )}
    </>
  );
}

// A puff of dust — a small one as something creaks, a big one where it
// breaks.
function Puff({ x, y, at, big }: { x: number; y: number; at: number; big: boolean }) {
  const n = big ? 6 : 3;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const r = big ? 34 : 16;
        return (
          <span
            key={i}
            className="crew-repair-puff absolute rounded-full"
            style={
              {
                left: x - (big ? 14 : 8),
                top: y - (big ? 14 : 8),
                width: big ? 28 : 16,
                height: big ? 28 : 16,
                zIndex: 5,
                background: "radial-gradient(circle, rgba(180, 170, 150, 0.8), rgba(180, 170, 150, 0))",
                animationDelay: `${at + i * 25}ms`,
                "--px": `${(Math.cos(a) * r).toFixed(1)}px`,
                "--py": `${(Math.sin(a) * r - 6).toFixed(1)}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </>
  );
}

function RepairRound({ plan, onDone }: { plan: RepairPlan; onDone: () => void }) {
  const truck = useRef<HTMLDivElement>(null);
  const boom = useRef<HTMLDivElement>(null);
  const hanger = useRef<HTMLDivElement>(null);
  const cable = useRef<HTMLDivElement>(null);
  const standIn = useRef<HTMLDivElement>(null);
  const rider = useRef<HTMLDivElement>(null);
  const rock = useRef<HTMLDivElement>(null);
  const crackBox = useRef<HTMLDivElement>(null);
  const torch = useRef<HTMLDivElement>(null);
  const wheels = useRef<SVGGElement[]>([]);
  const sparkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const chunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const heap = useRef<HTMLDivElement>(null);
  const patchRefs = useRef<(HTMLDivElement | null)[]>([]);
  const seam = useRef<HTMLDivElement>(null);
  const cracked = useRef<HTMLDivElement>(null);
  const glued = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const total = plan.endAt;
    const done = setTimeout(onDone, total);
    const anims: Animation[] = [];
    const play = (el: Element | null | undefined, keyframes: Keyframe[] | null | undefined) => {
      if (el && keyframes) anims.push(el.animate(keyframes, { duration: total, fill: "both" }));
    };
    // The stand-in for a card is a copy of the card itself.
    let clone: HTMLElement | null = null;
    if (plan.standIn?.kind === "clone" && standIn.current) {
      clone = plan.target.cloneNode(true) as HTMLElement;
      clone.removeAttribute("data-crew-card");
      clone.removeAttribute("id");
      Object.assign(clone.style, { width: "100%", height: "100%", margin: "0", visibility: "visible", transform: "none" });
      standIn.current.appendChild(clone);
    }
    play(standIn.current, plan.standInMoves);
    play(standIn.current, plan.standInShows);
    play(truck.current, plan.truck?.moves);
    wheels.current.forEach((w) => play(w, plan.truck?.wheels));
    play(boom.current, plan.boom?.moves);
    play(hanger.current, plan.boom?.counter);
    play(cable.current, plan.boom?.cable);
    play(rider.current, plan.rider);
    play(rock.current, plan.asteroid?.flight);
    play(crackBox.current, plan.crack?.tilt);
    crackBox.current?.querySelectorAll(".crew-crack-line").forEach((line) => play(line, plan.crack?.draw));
    play(torch.current, plan.crack?.torch);
    play(torch.current, plan.crack?.torchShows);
    plan.sparks.forEach((sp, i) => play(sparkRefs.current[i], sp.shows));
    play(heap.current, plan.heap?.frames);
    plan.patches?.forEach((p, i) => play(patchRefs.current[i], p.shows));
    play(seam.current, plan.seam?.shows);
    play(cracked.current, plan.marks?.cracked);
    play(glued.current, plan.marks?.glued);
    plan.chunks.forEach((c, i) => {
      const el = chunkRefs.current[i];
      if (!el) return;
      const dx = c.to.x - c.from.x;
      const dy = c.to.y - c.from.y;
      anims.push(
        el.animate(
          [
            { transform: "translate(0px, 0px) rotate(0deg)", opacity: 1 },
            { transform: `translate(${dx * 0.5}px, ${Math.min(dy * 0.2, -40)}px) rotate(200deg)`, opacity: 1, offset: 0.35 },
            { transform: `translate(${dx}px, ${dy}px) rotate(420deg)`, opacity: 1, offset: 0.97 },
            { transform: `translate(${dx}px, ${dy}px) rotate(420deg)`, opacity: 0 },
          ],
          { delay: c.at, duration: c.ms, fill: "both", easing: "ease-in" }
        )
      );
    });
    // And the real thing: creaking, sagging, hidden while it's away.
    const real = plan.realMoves.map((m) => plan.target.animate(m.keyframes, m.options));
    const timers = plan.effects.map((e) => setTimeout(e.run, e.at));
    return () => {
      clearTimeout(done);
      timers.forEach(clearTimeout);
      anims.forEach((a) => a.cancel());
      real.forEach((a) => a.cancel());
      clone?.remove();
      plan.restore();
    };
  }, [plan, onDone]);

  const { truck: t, standIn: s } = plan;
  return (
    <>
      {plan.stairs && <StairFlight stairs={plan.stairs} />}
      {plan.debris.map((speck, i) => (
        <Dust key={i} speck={speck} />
      ))}
      {plan.crack && (
        <div
          ref={crackBox}
          className="absolute"
          style={{ left: plan.crack.box.x, top: plan.crack.box.y, width: plan.crack.box.w, height: plan.crack.box.h, zIndex: 1, transformOrigin: "0% 100%" }}
        >
          <svg className="absolute inset-0 overflow-visible" width={plan.crack.box.w} height={plan.crack.box.h} aria-hidden="true">
            {/* A pale broken edge under a dark split, so it shows up on a
                light card or a dark one. */}
            {[
              { stroke: "rgba(255, 255, 255, 0.45)", width: 6 },
              { stroke: "rgba(20, 24, 33, 0.85)", width: 3 },
            ].map((line) => (
              <path
                key={line.width}
                className="crew-crack-line"
                d={plan.crack!.d}
                fill="none"
                stroke={line.stroke}
                strokeWidth={line.width}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={`${plan.crack!.length} ${plan.crack!.length}`}
              />
            ))}
          </svg>
        </div>
      )}
      {s && (
        <div
          ref={standIn}
          className="absolute"
          data-crew-standin
          style={{
            left: s.box.x,
            top: s.box.y,
            width: s.box.w,
            height: s.box.h,
            zIndex: 2,
            transformOrigin: s.kind === "bar" ? "50% 50%" : s.origin,
            opacity: 0,
          }}
        >
          {s.kind === "bar" && (
            <div
              className="h-full w-full"
              style={{ backgroundColor: s.color, borderRadius: s.round === "right" ? "0 4px 4px 0" : "4px 0 0 4px" }}
            />
          )}
          {s.kind === "slice" && (
            <svg className="absolute inset-0 overflow-visible" width={s.box.w} height={s.box.h} aria-hidden="true">
              <path d={s.d} fill={s.fill} />
            </svg>
          )}
          {/* A crack across it while it's the broken one; glue spread round
              its edge once the welder's been at it. */}
          {plan.marks?.cracked && (
            <div ref={cracked} className="absolute inset-0" style={{ zIndex: 1, opacity: 0 }}>
              <svg className="absolute inset-0 overflow-visible" width={s.box.w} height={s.box.h} aria-hidden="true">
                {[
                  { stroke: "rgba(255, 255, 255, 0.45)", width: 5 },
                  { stroke: "rgba(20, 24, 33, 0.85)", width: 2.5 },
                ].map((line) => (
                  <path key={line.width} d={crackAcross(s.box.w, s.box.h)} fill="none" stroke={line.stroke} strokeWidth={line.width} strokeLinejoin="round" strokeLinecap="round" />
                ))}
              </svg>
            </div>
          )}
          {plan.marks?.glued && (
            <div ref={glued} className="absolute inset-0" style={{ zIndex: 1, opacity: 0 }}>
              {s.kind === "slice" ? (
                <svg className="absolute inset-0 overflow-visible" width={s.box.w} height={s.box.h} aria-hidden="true">
                  <path d={s.d} fill="none" stroke="rgba(142, 148, 158, 0.95)" strokeWidth={3} strokeLinejoin="round" />
                </svg>
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    borderRadius: s.kind === "bar" ? (s.round === "right" ? "0 4px 4px 0" : "4px 0 0 4px") : 12,
                    boxShadow: "inset 0 0 0 3px rgba(142, 148, 158, 0.95)",
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}
      {/* The heap of rubble that came down on it, for the digger to dig out. */}
      {plan.heap && (
        <div
          ref={heap}
          className="absolute"
          style={{
            left: plan.heap.x - plan.heap.w / 2,
            bottom: FLOOR - 4,
            width: plan.heap.w,
            height: plan.heap.h,
            zIndex: 2,
            transformOrigin: "50% 100%",
            transform: "scale(0)",
          }}
        >
          <svg className="absolute inset-0 overflow-visible" width={plan.heap.w} height={plan.heap.h} viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0,60 C6,40 14,26 26,22 C32,10 46,4 56,10 C66,6 78,12 82,24 C92,30 97,44 100,60 Z" fill="#8b8478" />
            <path d="M10,60 C16,46 24,38 34,36 C42,28 54,26 62,32 C72,32 80,40 86,60 Z" fill="#9a9286" />
            {[
              [20, 40, 5],
              [40, 24, 6],
              [58, 18, 5],
              [74, 34, 6],
              [48, 44, 4],
              [30, 52, 5],
              [66, 50, 5],
              [86, 48, 4],
            ].map(([x, y, r], i) => (
              <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.9} fill={i % 2 ? "#6f685e" : "#7d7466"} />
            ))}
          </svg>
        </div>
      )}
      {/* The glue round it once it's back, and the filler in the holes. */}
      {plan.seam && (
        <div ref={seam} className="absolute" style={{ left: 0, top: 0, zIndex: 3, opacity: 0 }}>
          {plan.seam.kind === "box" ? (
            <div
              className="absolute"
              style={{
                left: plan.seam.box.x - 2,
                top: plan.seam.box.y - 2,
                width: plan.seam.box.w + 4,
                height: plan.seam.box.h + 4,
                borderRadius: plan.seam.radius + 2,
                border: "3px solid rgba(142, 148, 158, 0.9)",
              }}
            />
          ) : plan.seam.kind === "line" ? (
            <div
              className="absolute rounded-full"
              style={{ left: plan.seam.x - 2, top: plan.seam.y - 2, width: 4, height: plan.seam.h + 4, backgroundColor: "rgba(142, 148, 158, 0.95)" }}
            />
          ) : (
            <svg className="absolute overflow-visible" style={{ left: plan.seam.box.x, top: plan.seam.box.y }} width={plan.seam.box.w} height={plan.seam.box.h} aria-hidden="true">
              <path d={plan.seam.d} fill="none" stroke="rgba(142, 148, 158, 0.95)" strokeWidth={3} strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}
      {plan.patches?.map((p, i) => (
        <div
          key={i}
          ref={(el) => {
            patchRefs.current[i] = el;
          }}
          className="absolute rounded-full"
          style={{
            left: p.x - 9,
            top: p.y - 7,
            width: 18,
            height: 14,
            zIndex: 4,
            opacity: 0,
            background: "radial-gradient(ellipse at 45% 40%, #b3b9c2, #8e949e 60%, rgba(142, 148, 158, 0) 76%)",
          }}
        />
      ))}
      {/* The truck, and its crane: boom, then a hanger that keeps the cable
          hanging straight down, the cable, the hook — and for a crack, the
          welder's platform. */}
      {t && (
      <div ref={truck} className="absolute" data-crew-truck style={{ left: t.left, bottom: FLOOR - 2, width: TRUCK_W, height: TRUCK_H, zIndex: 2 }}>
        <div className="absolute inset-0" style={{ transform: t.dir === -1 ? "scaleX(-1)" : undefined }}>
          <TruckBody wheels={(el) => el && !wheels.current.includes(el) && wheels.current.push(el)} />
          <div
            ref={boom}
            className="absolute"
            style={{
              left: PIVOT_X,
              top: TRUCK_H - PIVOT_UP - 6,
              width: STOWED_BOOM,
              height: 12,
              transformOrigin: "0% 50%",
              borderRadius: 3,
              border: "2px solid #c7871a",
              background: "repeating-linear-gradient(45deg, #f2b632 0 6px, #d99a1c 6px 9px)",
            }}
          >
            <div ref={hanger} className="absolute" style={{ left: "100%", top: "50%", width: 0, height: 0 }}>
              <div ref={cable} className="absolute" style={{ left: -1, top: 0, width: 2, height: CABLE_STOWED, backgroundColor: "#3a3f4a" }}>
                <svg className="absolute" width="18" height="20" viewBox="0 0 18 20" style={{ left: -8, top: "100%" }} aria-hidden="true">
                  <rect x="4" y="0" width="10" height="7" rx="2" fill="#6b7280" />
                  <path d="M9,7 L9,13 Q9,18 13,17 Q16,16 15,12" fill="none" stroke="#4b5563" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                {plan.rider && (
                  <div className="absolute" style={{ left: 0, top: `calc(100% + ${HOOK_DROP}px)` }}>
                    {/* chains, the platform, and the welder riding it */}
                    <svg className="absolute" width="92" height={PLATFORM_HANG + 6} style={{ left: -46, top: 0 }} aria-hidden="true">
                      <path d={`M46,0 L6,${PLATFORM_HANG} M46,0 L86,${PLATFORM_HANG}`} stroke="#6b7280" strokeWidth="2" />
                      <rect x="0" y={PLATFORM_HANG - 2} width="92" height="8" rx="2" fill="#6b7280" />
                    </svg>
                    <div
                      ref={rider}
                      className="absolute"
                      data-crew-rider={BUILDERS.welder.name}
                      style={{ left: -BUILDERS.welder.width / 2, top: PLATFORM_HANG - 2 - BUILDERS.welder.height, opacity: 0 }}
                    >
                      <Figure character={BUILDERS.welder} pose={{ ...BASE_POSE, mode: "weld", expression: "focus", bodyClass: "", bucketDown: false }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
      {plan.crack && (
        <div ref={torch} className="absolute" style={{ left: 0, top: 0, zIndex: 4, opacity: 0 }}>
          <SparkBurst big />
        </div>
      )}
      {plan.sparks.map((sp, i) => (
        <div
          key={i}
          ref={(el) => {
            sparkRefs.current[i] = el;
          }}
          className="absolute"
          style={{ left: sp.x, top: sp.y, zIndex: 4, opacity: 0 }}
        >
          <SparkBurst big />
        </div>
      ))}
      {plan.puffs.map((p, i) => (
        <Puff key={i} {...p} />
      ))}
      {plan.chunks.map((c, i) => (
        <div
          key={i}
          ref={(el) => {
            chunkRefs.current[i] = el;
          }}
          className="absolute rounded-sm"
          style={{ left: c.from.x - 5, top: c.from.y - 5, width: 10, height: 9, zIndex: 5, backgroundColor: "#7d7466", opacity: 0 }}
        />
      ))}
      {plan.asteroid && (
        <div ref={rock} className="absolute" style={{ left: plan.asteroid.at.x, top: plan.asteroid.at.y, zIndex: 5, opacity: 0 }}>
          {/* a rock trailing fire, pointing the way it's flying */}
          <div
            className="absolute"
            style={{
              left: 0,
              top: 0,
              transform: `rotate(${(Math.atan2(plan.asteroid.at.y - plan.asteroid.from.y, plan.asteroid.at.x - plan.asteroid.from.x) * 180) / Math.PI}deg)`,
            }}
          >
            <div
              className="absolute"
              style={{ left: -96, top: -9, width: 96, height: 18, borderRadius: 9, background: "linear-gradient(90deg, rgba(255,120,40,0), rgba(255,150,50,0.85) 70%, #ffe08a)" }}
            />
            <div
              className="absolute rounded-full"
              style={{
                left: -13,
                top: -13,
                width: 26,
                height: 26,
                background: "radial-gradient(circle at 35% 35%, #9a8f82, #5f574d 70%)",
                boxShadow: "0 0 12px rgba(255, 170, 60, 0.8)",
              }}
            />
          </div>
        </div>
      )}
      {plan.machines.map((m, i) => (
        <Machine key={i} plan={m} total={plan.endAt} />
      ))}
      {plan.builders.map((actor) => (
        <FloorWorker key={actor.character.name} actor={actor} cheerStyle="nod" moonwalk={false} />
      ))}
    </>
  );
}

// ============================================================ caught

// They're not supposed to be seen. Move the mouse while they're out and
// it's a stampede: everyone jumps out of their skin, anyone up the stairs
// or on the crane jumps down, a couple of them run smack into each other,
// the rest dash the wrong way first — and within six seconds they're all
// gone, the stairs yanked up, the gondola hauled away, the truck floored
// off the screen. A builder in the middle of a repair heaves the broken
// piece back where it goes before running for it.

const PANIC_MS = 6000;
const PANIC_HOP_MS = 180;
const PANIC_PX_PER_S = 560;
// Off the screen by then, with a moment to spare.
const PANIC_OUT_BY = PANIC_MS - 300;
const PANIC_LEFT = -14;
const PANIC_RIGHT = 114;
// When the broken piece flies back into place.
const SHOVE_AT = 750;
const SHOVE_MS = 420;

interface CaughtCrew {
  character: Character;
  /** px from the left, and up off the floor. */
  x: number;
  y: number;
  tread: number;
  facing: 1 | -1;
}

interface Caught {
  crew: CaughtCrew[];
  stairs: Stairs | null;
  gondola: { x: number; top: number; riders: Character[] } | null;
  truck: { left: number; dir: 1 | -1 } | null;
  /** A repair under way: the real thing, how it's tilted, and a copy of the piece if it's off being carried about. */
  shove: { target: HTMLElement | SVGElement; copy: HTMLElement | null; tilt: string } | null;
  /** The other machines, frozen as they were: to back out fast (the tower crane sinks away). */
  machines: { copy: HTMLElement; kind: string; dir: 1 | -1; left: number; right: number }[];
  dust: DustSpeck[];
}

const crewByName = (name: string): Character | undefined =>
  (CHARACTERS as Record<string, Character>)[name] ??
  (BUILDERS as Record<string, Character>)[name] ??
  (MEDICS as Record<string, Character>)[name] ??
  (CODERS as Record<string, Character>)[name];

// Where everything is the moment they're caught — read straight off the
// screen, since they're mid-hop, mid-swing, mid-drive. `elapsed` is how far
// into the round it is.
function catchThem(layer: HTMLElement, plan: AnyPlan | null, elapsed: number): Caught {
  const vw = layer.clientWidth;
  const vh = layer.clientHeight;
  const crew: CaughtCrew[] = [];
  layer.querySelectorAll<HTMLElement>("[data-crew-actor]").forEach((el) => {
    const character = crewByName(el.dataset.crewActor ?? "");
    if (!character) return;
    const style = getComputedStyle(el);
    crew.push({
      character,
      x: parseFloat(style.left),
      y: Math.max(0, parseFloat(style.bottom) - FLOOR),
      tread: Number(el.dataset.crewTread) || 0,
      facing: el.dataset.crewFacing === "-1" ? -1 : 1,
    });
  });
  // The welder, if they're up on the crane's platform.
  layer.querySelectorAll<HTMLElement>("[data-crew-rider]").forEach((el) => {
    const character = crewByName(el.dataset.crewRider ?? "");
    if (!character || Number(getComputedStyle(el).opacity) < 0.5) return;
    const r = el.getBoundingClientRect();
    crew.push({ character, x: r.left + r.width / 2, y: Math.max(0, vh - r.bottom - FLOOR), tread: 0, facing: 1 });
  });

  let gondola: Caught["gondola"] = null;
  const g = layer.querySelector<HTMLElement>("[data-crew-gondola]");
  if (g && plan?.kind === "clean" && plan.gondola) {
    const style = getComputedStyle(g);
    const top = parseFloat(style.top);
    if (top > parseFloat(GONDOLA_OFFSCREEN) + 60) gondola = { x: parseFloat(style.left), top, riders: plan.gondola.riders };
  }

  let truck: Caught["truck"] = null;
  const tr = layer.querySelector<HTMLElement>("[data-crew-truck]");
  if (tr && plan?.kind === "repair" && plan.truck) {
    const r = tr.getBoundingClientRect();
    if (r.right > 0 && r.left < vw) truck = { left: r.left, dir: plan.truck.dir };
  }

  let shove: Caught["shove"] = null;
  if (plan?.kind === "repair") {
    const standIn = layer.querySelector<HTMLElement>("[data-crew-standin]");
    let copy: HTMLElement | null = null;
    if (standIn && Number(getComputedStyle(standIn).opacity) > 0.1) {
      copy = standIn.cloneNode(true) as HTMLElement;
      copy.removeAttribute("data-crew-standin");
      copy.style.transform = getComputedStyle(standIn).transform;
      copy.style.opacity = "1";
    }
    const target = plan.target as HTMLElement | SVGElement;
    shove = { target, copy, tilt: getComputedStyle(target).transform };
  }

  const machines: Caught["machines"] = [];
  layer.querySelectorAll<HTMLElement>("[data-crew-machine]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right < 0 || r.left > vw) return;
    const copy = el.cloneNode(true) as HTMLElement;
    // Every moving part frozen where it is right now.
    const from = [el, ...el.querySelectorAll<HTMLElement | SVGElement>("*")];
    const to = [copy, ...copy.querySelectorAll<HTMLElement | SVGElement>("*")];
    from.forEach((f, i) => {
      const cs = getComputedStyle(f);
      if (cs.transform !== "none") to[i].style.transform = cs.transform;
      if (f.dataset.part) {
        to[i].style.opacity = cs.opacity;
        if (f instanceof HTMLElement) to[i].style.height = cs.height;
      }
    });
    machines.push({ copy, kind: el.dataset.crewMachine ?? "", dir: el.dataset.crewDir === "-1" ? -1 : 1, left: r.left, right: r.right });
  });

  const stairs = plan?.stairs && elapsed < plan.stairs.outAt ? plan.stairs : null;
  // The mess they were in the middle of: left where it is.
  const specks = plan?.kind === "clean" ? plan.dust : plan?.kind === "repair" ? plan.debris : [];
  const dust = specks
    .filter((d) => !d.tread && d.appearAt <= elapsed && !(d.clearAt <= elapsed))
    .map((d) => ({ ...d, appearAt: -1000, wetAt: null, clearAt: Number.POSITIVE_INFINITY }));

  return { crew, stairs, gondola, truck, shove, machines, dust };
}

// A mad dash of `distPct` % of the screen: short frantic hops, a whole
// number of them.
function dashMs(distPct: number, vw: number) {
  const px = (Math.abs(distPct) / 100) * vw;
  return Math.max(1, Math.round(((px / PANIC_PX_PER_S) * 1000) / PANIC_HOP_MS)) * PANIC_HOP_MS;
}

interface Stampede {
  floor: FloorActor[];
  gondola: GondolaActor | null;
  stairs: Stairs | null;
  /** What they dropped where (px), from when, and — for the one who comes back for it — until when. */
  drops: { character: Character; x: number; at: number; until: number | null }[];
}

function planStampede(caught: Caught, vw: number): Stampede {
  const pct = (px: number) => (px / vw) * 100;
  // Anyone still off the screen when they're caught just stays that way.
  const onScreen = caught.crew.filter((c) => c.x > -c.character.width / 2 && c.x < vw + c.character.width / 2);
  const runners = onScreen.map((c) => ({
    c,
    steps: [] as Step[],
    t: 0,
    x: pct(c.x),
    exit: null as number | null,
    bumped: false,
    drop: null as Stampede["drops"][number] | null,
  }));
  type Runner = (typeof runners)[number];
  const dash = (m: Runner, to: number, ms: number, holding = false) => {
    const hops = Math.max(1, Math.round(ms / PANIC_HOP_MS));
    m.steps.push({ kind: "walk", at: m.t, ms, x: to, hopMs: ms / hops, panic: true, holding });
    m.t += ms;
    m.x = to;
  };
  const waitTill = (m: Runner, at: number, panic = true) => {
    if (at > m.t) m.steps.push({ kind: "wait", at: m.t, ms: at - m.t, panic });
    m.t = Math.max(m.t, at);
  };
  const flat = (m: Runner, x: number) => {
    m.steps.push({ kind: "fall", at: m.t, ms: FALL_DROP_MS, x, y: 0, panic: true });
    m.t += FALL_DROP_MS;
    m.x = x;
    m.steps.push({ kind: "quirk", at: m.t, ms: QUIRK_MS.bonk, quirk: "bonk" });
    m.t += QUIRK_MS.bonk;
  };
  const nearestEdge = (x: number) => (x < 50 ? PANIC_LEFT : PANIC_RIGHT);

  // Everyone jumps out of their skin, not quite all at once — and the
  // cleaners on the floor drop whatever they're holding.
  for (const m of runners) {
    waitTill(m, Math.round(Math.random() * 160), false);
    if (m.c.y <= 4 && !m.c.character.vest) m.drop = { character: m.c.character, x: m.c.x, at: m.t + 120, until: null };
    m.steps.push({ kind: "quirk", at: m.t, ms: QUIRK_MS.startle, quirk: "startle" });
    m.t += QUIRK_MS.startle;
    // The foreman heaves the broken piece back into place.
    if (caught.shove && m.c.character.name === "foreman") {
      m.steps.push({ kind: "quirk", at: m.t, ms: QUIRK_MS.shove, quirk: "shove" });
      m.t += QUIRK_MS.shove;
    }
    // Anyone up the stairs or on the crane jumps for it, and lands in a heap.
    if (m.c.y > 4) flat(m, m.x);
  }

  // Neighbours running for it run smack into each other (mostly), bounce
  // off, and flee opposite ways.
  const byX = [...runners].sort((a, b) => a.x - b.x);
  for (let i = 0; i + 1 < byX.length; i += 2) {
    const [a, b] = [byX[i], byX[i + 1]];
    if (Math.random() < 0.25 || b.x - a.x > 40) continue;
    const meet = (a.x + b.x) / 2;
    const aStop = meet - pct(a.c.character.width / 2);
    const bStop = meet + pct(b.c.character.width / 2);
    const start = Math.max(a.t, b.t);
    const ms = Math.max(dashMs(aStop - a.x, vw), dashMs(b.x - bStop, vw));
    for (const [m, stop, back] of [
      [a, aStop, -1],
      [b, bStop, 1],
    ] as const) {
      waitTill(m, start);
      dash(m, stop, ms);
      flat(m, stop + back * 3);
      m.exit = back === -1 ? PANIC_LEFT : PANIC_RIGHT;
      m.bumped = true;
    }
  }

  // One of them gets clear away... then realises what they left behind,
  // and dashes back for it — the mop bucket, if it's here.
  const forgetful = runners
    .filter((m) => m.drop && !m.bumped)
    .sort((a, b) => Number(b.c.character.name === "orange") - Number(a.c.character.name === "orange"))[0];
  const left = forgetful?.drop;
  if (forgetful && left) {
    const m = forgetful;
    const exit = nearestEdge(m.x);
    const out = dashMs(exit - m.x, vw);
    const back = dashMs(exit - pct(left.x), vw);
    const total = out + 350 + back + 350 + back;
    if (m.t + total <= PANIC_OUT_BY) {
      dash(m, exit, out);
      waitTill(m, m.t + 350);
      dash(m, pct(left.x), back);
      m.steps.push({ kind: "pull", at: m.t, ms: 350 });
      m.t += 350;
      left.until = m.t - 150;
      dash(m, exit, back, true);
      m.exit = exit;
      m.steps.push({ kind: "gone", at: m.t, ms: 0 });
    }
  }

  for (const m of runners) {
    if (m.steps[m.steps.length - 1]?.kind === "gone") continue;
    const exit = m.exit ?? nearestEdge(m.x);
    // The rest run round in circles — this way, that way — for as long as
    // there's time, before finally bolting.
    if (!m.bumped) {
      let dir = exit === PANIC_LEFT ? 1 : -1;
      for (let leg = 0; leg < 3; leg++) {
        const to = clamp(m.x + dir * (8 + Math.random() * 12), 3, 97);
        const ms = dashMs(to - m.x, vw);
        if (m.t + ms + dashMs(exit - to, vw) > PANIC_OUT_BY - 400) break;
        dash(m, to, ms);
        dir = -dir;
      }
    }
    // And off the screen, as fast as it takes to be gone in time.
    dash(m, exit, clamp(dashMs(exit - m.x, vw), 400, Math.max(400, PANIC_OUT_BY - m.t)));
    m.steps.push({ kind: "gone", at: m.t, ms: 0 });
  }

  const floor: FloorActor[] = runners.map((m) => ({
    character: m.c.character,
    entryX: pct(m.c.x),
    entryY: m.c.y,
    entryTread: m.c.tread,
    entryFacing: m.c.facing,
    steps: m.steps,
    endAt: m.t,
  }));

  // The gondola gets hauled up the glass with them flailing on it.
  const g = caught.gondola;
  const gondola: GondolaActor | null = g && {
    riders: g.riders,
    entryX: pct(g.x),
    entryTop: `${g.top}px`,
    steps: [
      { kind: "wait", at: 0, ms: 500 },
      { kind: "walk", at: 500, ms: 1300, x: pct(g.x), top: GONDOLA_OFFSCREEN },
      { kind: "gone", at: 1800, ms: 0 },
    ],
    endAt: 1800,
    riderQuirks: {},
    riderLooks: {},
  };

  // The stairs, already standing, yanked up as soon as they're off them.
  const stairs = caught.stairs && { ...caught.stairs, inAt: -60_000, outAt: 1100 };
  const drops = runners.flatMap((m) => (m.drop ? [m.drop] : []));
  return { floor, gondola, stairs, drops };
}

// Whatever they dropped as they ran: a bucket on its side and the mop, or
// a spray bottle, or a cloth, lying on the floor.
function Dropped({ drop }: { drop: Stampede["drops"][number] }) {
  const tool = drop.character.stage1;
  const shows = [`crew-fade-in 120ms ease-out ${drop.at}ms both`];
  if (drop.until !== null) shows.push(`crew-fade-out 80ms linear ${drop.until}ms forwards`);
  return (
    <div className="absolute" style={{ left: drop.x, bottom: FLOOR - 2, zIndex: 4, animation: shows.join(", ") }}>
      {tool === "dunk" || tool === "mopFloor" ? (
        <>
          {/* The mop lying flat, its head up against the bucket. */}
          <div className="absolute" style={{ left: -88, bottom: -33, transform: "rotate(-90deg)" }}>
            <Mop />
          </div>
          <div className="absolute" style={{ left: 4, bottom: -4, transform: "rotate(92deg)", transformOrigin: "50% 50%" }}>
            <Bucket />
          </div>
          <div
            className="absolute rounded-full"
            style={{ left: 30, bottom: -3, width: 46, height: 8, background: "rgba(124, 199, 240, 0.55)" }}
          />
        </>
      ) : (
        <div className="absolute" style={{ left: -18, bottom: -8, transform: "rotate(-90deg)" }}>
          {tool === "spray" ? <SprayBottle /> : <Cloth />}
        </div>
      )}
    </div>
  );
}

// The crane truck, boom slammed down, floored off the screen the way it's
// pointing.
function RunawayTruck({ truck }: { truck: { left: number; dir: 1 | -1 } }) {
  const body = useRef<HTMLDivElement>(null);
  const wheels = useRef<SVGGElement[]>([]);
  useEffect(() => {
    const vw = window.innerWidth;
    const off = truck.dir === 1 ? vw - truck.left + 60 : -(truck.left + TRUCK_W + 60);
    const timing = { delay: 700, duration: 1700, fill: "both" as const };
    const anims = [
      body.current?.animate([{ transform: "translateX(0px)" }, { transform: `translateX(${off}px)` }], {
        ...timing,
        easing: "cubic-bezier(0.5, 0, 0.9, 0.6)",
      }),
      ...wheels.current.map((w) =>
        w.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(1800deg)" }], { ...timing, easing: "ease-in" })
      ),
    ];
    return () => anims.forEach((a) => a?.cancel());
  }, [truck]);
  return (
    <div ref={body} className="absolute" style={{ left: truck.left, bottom: FLOOR - 2, width: TRUCK_W, height: TRUCK_H, zIndex: 2 }}>
      <div className="absolute inset-0" style={{ transform: truck.dir === -1 ? "scaleX(-1)" : undefined }}>
        <TruckBody wheels={(el) => el && !wheels.current.includes(el) && wheels.current.push(el)} />
        <div
          className="absolute"
          style={{
            left: PIVOT_X,
            top: TRUCK_H - PIVOT_UP - 6,
            width: STOWED_BOOM,
            height: 12,
            transformOrigin: "0% 50%",
            transform: `rotate(${-STOWED_ANGLE}deg)`,
            borderRadius: 3,
            border: "2px solid #c7871a",
            background: "repeating-linear-gradient(45deg, #f2b632 0 6px, #d99a1c 6px 9px)",
          }}
        />
      </div>
    </div>
  );
}

// The machines: backed out fast the way they came in, the tower crane
// sunk out of sight, a pallet left where it was set down (fading with the
// rest of the mess). Gives back how to undo it all.
function clearOff(machines: Caught["machines"], holder: HTMLElement): () => void {
  const vw = window.innerWidth;
  const anims = machines.map((m) => {
    holder.appendChild(m.copy);
    if (m.kind === "tower") {
      return m.copy.animate([{ translate: "0 0" }, { translate: `0 ${window.innerHeight}px` }], {
        delay: 500,
        duration: 1400,
        easing: "ease-in",
        fill: "both",
      });
    }
    if (m.kind === "pallet") {
      return m.copy.animate([{ opacity: 1 }, { opacity: 0 }], { delay: PANIC_MS - 900, duration: 600, fill: "both" });
    }
    const off = m.dir === 1 ? -(m.right + 40) : vw - m.left + 40;
    return m.copy.animate([{ translate: "0 0" }, { translate: `${off}px 0` }], {
      delay: 600,
      duration: 1600,
      easing: "cubic-bezier(0.5, 0, 0.9, 0.6)",
      fill: "both",
    });
  });
  return () => {
    anims.forEach((a) => a.cancel());
    machines.forEach((m) => m.copy.remove());
  };
}

// The broken piece heaved back where it goes: if it's off being carried
// about, its copy flies back up into place and only then is the real thing
// there again; if it's still in place but sagging or tilted, it's shoved
// straight. Either way it lands with a jolt. Gives back how to undo it all.
function shoveBack(shove: NonNullable<Caught["shove"]>, holder: HTMLElement): () => void {
  const { target, copy, tilt } = shove;
  const jolt = () =>
    target.animate(
      [{ transform: "translateY(-7px)" }, { transform: "translateY(2px)", offset: 0.55 }, { transform: "none" }],
      { duration: 360, easing: "ease-out" }
    );
  if (copy) {
    holder.appendChild(copy);
    const shown = target.style.visibility;
    target.style.visibility = "hidden";
    const fly = copy.animate([{ transform: copy.style.transform }, { transform: "none" }], {
      delay: SHOVE_AT,
      duration: SHOVE_MS,
      easing: "cubic-bezier(0.55, 0, 0.8, 0.4)",
      fill: "both",
    });
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      copy.remove();
      target.style.visibility = shown;
      jolt();
    };
    fly.onfinish = land;
    return () => {
      fly.cancel();
      land();
    };
  }
  const back = target.animate(
    [{ transform: tilt }, { transform: tilt, offset: SHOVE_AT / (SHOVE_AT + SHOVE_MS) }, { transform: "none" }],
    { duration: SHOVE_AT + SHOVE_MS, easing: "ease-in", fill: "backwards" }
  );
  back.onfinish = () => jolt();
  return () => back.cancel();
}

function CaughtScene({ caught, onDone }: { caught: Caught; onDone: () => void }) {
  const [stampede] = useState(() => planStampede(caught, window.innerWidth));
  // Where the broken piece goes back to, for the thud of it landing.
  const [landing] = useState(() => (caught.shove ? boxOf(caught.shove.target) : null));
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const done = setTimeout(onDone, PANIC_MS);
    const undo: (() => void)[] = [];
    if (caught.shove && holder.current) undo.push(shoveBack(caught.shove, holder.current));
    if (holder.current) undo.push(clearOff(caught.machines, holder.current));
    return () => {
      clearTimeout(done);
      undo.forEach((u) => u());
    };
  }, [caught, onDone]);

  return (
    <>
      {stampede.stairs && <StairFlight stairs={stampede.stairs} />}
      {/* The mess they didn't get to, fading once they're gone. */}
      <div style={{ animation: `crew-fade-out 600ms ease-in ${PANIC_MS - 900}ms forwards` }}>
        {caught.dust.map((speck, i) => (
          <Dust key={i} speck={speck} />
        ))}
      </div>
      {caught.truck && <RunawayTruck truck={caught.truck} />}
      {stampede.gondola && <Gondola actor={stampede.gondola} cheerStyle="nod" panic />}
      <div ref={holder} className="absolute inset-0" style={{ zIndex: 2 }} />
      {stampede.drops.map((drop, i) => (
        <Dropped key={i} drop={drop} />
      ))}
      {landing && <Puff x={landing.x + landing.w / 2} y={landing.y + landing.h} at={SHOVE_AT + SHOVE_MS - 60} big />}
      {stampede.floor.map((actor) => (
        <FloorWorker key={actor.character.name} actor={actor} cheerStyle="nod" moonwalk={false} />
      ))}
    </>
  );
}

// ============================================================ the missile

// Once in a while — about one visit in three — a missile comes in and blows
// the whole page apart: the sidebar, the top bar, the cards and the charts
// all go flying off the screen. The builders turn up, try to put a piece
// back, and can't — it just falls off again — so they call in the coders:
// two or three of them, with screens for faces, who sit down with their
// laptops and type for a minute while the page flies back together piece by
// piece. Then there's a party: everyone throws the coders in the air.
// Caught at it (anyone moves the mouse while the page is in pieces), the
// coders type flat out, the rest of it flies back in five seconds, and
// then they all run for it.

type CoderName = "coder1" | "coder2" | "coder3";

// The coders: the crew's flat style again, with a screen for a face.
const CODERS: Record<CoderName, Character> = {
  coder1: {
    name: "coder1",
    color: "#6c63d9",
    width: 56,
    height: 108,
    shape: "block",
    radius: "8px 8px 2px 2px",
    stage1: "type",
    stage2: "type",
    blinkDelay: "300ms",
    coder: true,
  },
  coder2: {
    name: "coder2",
    color: "#2ea89a",
    width: 80,
    height: 76,
    shape: "blob",
    radius: "50% 50% 14px 14px / 70% 70% 14px 14px",
    stage1: "type",
    stage2: "type",
    blinkDelay: "1200ms",
    coder: true,
  },
  coder3: {
    name: "coder3",
    color: "#d9803b",
    width: 62,
    height: 92,
    shape: "block",
    radius: "10px 10px 2px 2px",
    stage1: "type",
    stage2: "type",
    blinkDelay: "2100ms",
    coder: true,
  },
};

const MISSILE_CHANCE = 1 / 3;
const CODING_MS = 60_000;
const RUSH_MS = 5000;
const BLOCK_BACK_MS = 900;

// A coder's face: a little monitor, green on black.
function MonitorFace({ character, expression }: { character: Character; expression: Expression }) {
  const { width, height, shape } = character;
  const w = width * (shape === "block" ? 0.84 : 0.66);
  const h = Math.min(height * 0.4, w * 0.72);
  const top = shape === "block" ? height * 0.08 : height * 0.2;
  const g = "#5dff9a";
  const eye = (cx: number) => {
    const cy = h * 0.4;
    if (expression === "yeah") return <path key={cx} d={`M${cx - 5},${cy + 2} L${cx},${cy - 3} L${cx + 5},${cy + 2}`} stroke={g} strokeWidth={2.5} fill="none" />;
    if (expression === "shock") return <circle key={cx} cx={cx} cy={cy} r={4} stroke={g} strokeWidth={2} fill="none" />;
    if (expression === "focus" || expression === "angry") return <rect key={cx} x={cx - 5} y={cy - 1} width={10} height={3} fill={g} />;
    return <rect key={cx} className="crew-cursor" x={cx - 3} y={cy - 4} width={6} height={8} fill={g} />;
  };
  const mouthY = h * 0.72;
  return (
    <div
      className="absolute rounded-md"
      style={{ left: (width - w) / 2, top, width: w, height: h, background: "#1f232b", border: "3px solid #9aa3b5", boxShadow: "inset 0 0 10px rgba(93,255,154,0.25)" }}
    >
      <svg className="absolute inset-0" width={w - 6} height={h - 6} viewBox={`0 0 ${w - 6} ${h - 6}`} aria-hidden="true">
        {[w * 0.3 - 3, w * 0.7 - 3].map(eye)}
        {expression === "yeah" ? (
          <path d={`M${w * 0.35},${mouthY - 2} Q${w / 2 - 3},${mouthY + 5} ${w * 0.65 - 6},${mouthY - 2}`} stroke={g} strokeWidth={2.5} fill="none" />
        ) : expression === "shock" ? (
          <rect x={w / 2 - 6} y={mouthY - 4} width={6} height={7} rx={2} stroke={g} strokeWidth={2} fill="none" />
        ) : (
          <rect x={w * 0.38} y={mouthY - 1} width={w * 0.24} height={2.5} fill={g} />
        )}
      </svg>
    </div>
  );
}

// A laptop open on the floor in front of them, code scrolling up its
// screen, both hands tapping away at the keys.
function Laptop({ character }: { character: Character }) {
  const { width, height, color } = character;
  return (
    <div className="absolute" style={{ left: width * 0.42, top: height - 30, width: 52, height: 32 }}>
      <div className="absolute overflow-hidden rounded-sm" style={{ left: 8, top: 0, width: 38, height: 24, background: "#1f232b", border: "2px solid #9aa3b5", transform: "skewX(-8deg)" }}>
        <div className="crew-code absolute inset-x-1" style={{ top: 0, height: 60 }}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="rounded-full" style={{ height: 2, marginTop: 4, width: `${40 + ((i * 37) % 55)}%`, background: i % 3 ? "#5dff9a" : "#7cc7f0" }} />
          ))}
        </div>
      </div>
      <div className="absolute rounded-sm" style={{ left: 0, top: 24, width: 52, height: 6, background: "#9aa3b5" }} />
      <div className="crew-type absolute" style={{ left: 6, top: 18 }}>
        <Hand color={color} x={0} y={0} />
      </div>
      <div className="crew-type crew-type-b absolute" style={{ left: 26, top: 18 }}>
        <Hand color={color} x={0} y={0} />
      </div>
    </div>
  );
}

interface MissileBlock {
  el: HTMLElement;
  box: Box;
  /** Where it's blown off to (translate, px), how it's spinning, and when it's put back. */
  off: Vec;
  spin: number;
  backAt: number;
}

interface MissilePlan {
  kind: "missile";
  blastAt: number;
  blast: Vec;
  missileFrom: Vec;
  blocks: MissileBlock[];
  /** The builders' go at putting one back, which just falls off again. */
  attempt: { block: number; at: number } | null;
  fires: { x: number; from: number; until: number }[];
  floor: FloorActor[];
  partyAt: number;
  endAt: number;
  cast: Name[];
  stairs?: null;
}

function planMissile(exclude: Name[]): MissilePlan | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pct = (px: number) => (px / vw) * 100;
  const onScreen = (b: Box) => b.w > 20 && b.h > 20 && b.x < vw && b.x + b.w > 0 && b.y < vh && b.y + b.h > 0;
  const els = [...document.querySelectorAll<HTMLElement>("[data-crew-block], [data-crew-card], [data-crew-chart]")].filter(
    (el) => onScreen(boxOf(el)) && !el.parentElement?.closest("[data-crew-card], [data-crew-chart]")
  );
  if (els.length < 3) return null;
  const blast = { x: vw * (0.45 + Math.random() * 0.1), y: vh * 0.45 };
  const blastAt = 1700;

  // The builders: in, a look at the damage, a go at putting a card back...
  const foreman = BUILDERS.foreman;
  const welder = BUILDERS.welder;
  const fromLeft = Math.random() < 0.5;
  const entryX = fromLeft ? -10 : 110;
  const inward = (fromLeft ? 1 : -1) as 1 | -1;
  const cx = vw / 2;
  const coders = (["coder1", "coder2", "coder3"] as CoderName[]).slice(0, Math.random() < 0.5 ? 2 : 3).map((n) => CODERS[n]);
  const gap = 118;
  const seats = coders.map((_, i) => cx + (i - (coders.length - 1) / 2) * gap);
  // The builders keep to one side of the coders' row (and of the crew who
  // come for the party, either side of it).
  const edge = ((coders.length - 1) / 2) * gap + gap / 2 + 50;
  const welderLeft = inward === 1 ? cx - edge - welder.width : cx + edge;
  const foremanLeft = inward === 1 ? welderLeft - 20 - foreman.width : welderLeft + welder.width + 20;
  const foremanSteps: Step[] = [];
  const welderSteps: Step[] = [];
  let ft = hopTo(foremanSteps, entryX, pct(foremanLeft), blastAt + 3800, vw, inward);
  let wt = hopTo(welderSteps, entryX, pct(welderLeft), blastAt + 4300, vw, inward);
  const look = (c: Character) => lookToward(c, 40, 600);
  const meet = Math.max(ft, wt);
  for (const [steps, from, c] of [
    [foremanSteps, ft, foreman],
    [welderSteps, wt, welder],
  ] as const) {
    let t = waitUntil(steps, from, meet);
    steps.push({ kind: "quirk", at: t, ms: QUIRK_MS.startle, quirk: "startle" });
    t += QUIRK_MS.startle;
    steps.push({ kind: "inspect", at: t, ms: 1600, look: look(c) });
    if (c === foreman) ft = t + 1600;
    else wt = t + 1600;
  }
  const cardIndex = els.findIndex((el) => el.hasAttribute("data-crew-card"));
  const attemptAt = wt;
  welderSteps.push({ kind: "work", at: wt, ms: WELD_MS, activity: "weld", look: look(welder) });
  wt += WELD_MS;
  // ...which comes straight off again. Scratching their heads; a call for help.
  const flopAt = attemptAt + 1700;
  ft = waitUntil(foremanSteps, ft, flopAt);
  wt = waitUntil(welderSteps, wt, flopAt);
  foremanSteps.push({ kind: "quirk", at: ft, ms: QUIRK_MS.confused, quirk: "confused" });
  ft += QUIRK_MS.confused;
  welderSteps.push({ kind: "quirk", at: wt, ms: QUIRK_MS.confused, quirk: "confused" });
  wt += QUIRK_MS.confused;
  foremanSteps.push({ kind: "quirk", at: ft, ms: QUIRK_MS.call, quirk: "call" });
  ft += QUIRK_MS.call;

  // The coders: in with their laptops, sat down in a row, typing.
  const codersIn = ft + 400;
  let typeAt = 0;
  const coderSteps = coders.map((c, i) => {
    const steps: Step[] = [];
    const t = hopTo(steps, entryX, pct(seats[i] - c.width * 0.3), codersIn + i * 500, vw, inward);
    typeAt = Math.max(typeAt, t + 300);
    return steps;
  });
  typeAt += 200;
  const coding = CODING_MS;
  const codedAt = typeAt + coding;
  coderSteps.forEach((steps) => {
    const lastWalk = [...steps].reverse().find((st): st is WalkStep => st.kind === "walk")!;
    const t = waitUntil(steps, lastWalk.at + lastWalk.ms, typeAt);
    steps.push({ kind: "work", at: t, ms: codedAt - t, activity: "type", look: { x: 0.6, y: 0.8 } });
  });
  // The builders stand back and watch them work.
  ft = waitUntil(foremanSteps, ft, codersIn + 1500);
  foremanSteps.push({ kind: "inspect", at: ft, ms: codedAt - ft, look: lookToward(foreman, 80, 20) });
  ft = codedAt;
  wt = waitUntil(welderSteps, wt, codersIn + 1500);
  welderSteps.push({ kind: "inspect", at: wt, ms: codedAt - wt, look: lookToward(welder, 80, 20) });
  wt = codedAt;

  // The page back together, piece by piece, over the minute they're typing,
  // in no particular order.
  const blocks: MissileBlock[] = els.map((el) => {
    const box = boxOf(el);
    const mid = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const dx = mid.x - blast.x || 1;
    const dy = mid.y - blast.y || -1;
    const len = Math.hypot(dx, dy);
    const reach = Math.max(vw, vh) * 1.1;
    return {
      el,
      box,
      off: { x: (dx / len) * reach, y: (dy / len) * reach - 120 },
      spin: (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 360),
      backAt: 0,
    };
  });
  [...blocks].sort(() => Math.random() - 0.5).forEach((b, i, all) => (b.backAt = typeAt + 2500 + ((coding - 5000) * i) / Math.max(1, all.length - 1)));

  // The party: the cleaning crew come in for it; everyone heaves the coders
  // up in the air, again and again, under the confetti.
  const partyAt = codedAt + 600;
  const crewNames = ALL_NAMES.filter((n) => !exclude.includes(n)).slice(0, 3);
  const slots = [...seats.map((x) => x - gap / 2), seats[seats.length - 1] + gap / 2];
  const crew: FloorActor[] = crewNames.map((n, i) => {
    const c = CHARACTERS[n];
    const steps: Step[] = [];
    const spot = slots[i % slots.length] - c.width / 2;
    const t = hopTo(steps, entryX, pct(spot), codedAt - 6000 + i * 600, vw, inward);
    const w = waitUntil(steps, t, partyAt);
    steps.push({ kind: "quirk", at: w, ms: 3 * QUIRK_MS.heave, quirk: "heave" });
    return { character: c, entryX, steps, endAt: w + 3 * QUIRK_MS.heave };
  });
  const partyEnd = partyAt + 3 * QUIRK_MS.heave;
  coderSteps.forEach((steps) => {
    steps.push({ kind: "quirk", at: partyAt, ms: 3 * QUIRK_MS.tossed, quirk: "tossed" });
  });
  for (const [steps, from] of [
    [foremanSteps, ft],
    [welderSteps, wt],
  ] as const) {
    const t = waitUntil(steps, from, partyAt);
    steps.push({ kind: "cheer", at: t, ms: 3 * QUIRK_MS.heave });
  }

  // And off they all go.
  const floor: FloorActor[] = [
    { character: foreman, entryX, steps: foremanSteps, endAt: partyEnd },
    { character: welder, entryX, steps: welderSteps, endAt: partyEnd },
    ...crew,
    ...coderSteps.map((steps, i) => ({ character: coders[i], entryX, steps, endAt: partyEnd })),
  ];
  let endAt = partyEnd;
  floor.forEach((a, i) => {
    const lastWalk = [...a.steps].reverse().find((st): st is WalkStep => st.kind === "walk")!;
    const t = waitUntil(a.steps, a.steps[a.steps.length - 1].at + a.steps[a.steps.length - 1].ms, partyEnd + 300 + i * 250);
    const trip = hopTrip(lastWalk.x, entryX, vw);
    a.steps.push({ kind: "walk", at: t, ms: trip.ms, x: entryX, hopMs: trip.hopMs });
    a.steps.push({ kind: "gone", at: t + trip.ms, ms: 0 });
    endAt = Math.max(endAt, t + trip.ms);
  });

  const fires = [0, 1, 2].map((i) => ({ x: blast.x + (i - 1) * 140 + (Math.random() * 2 - 1) * 30, from: blastAt + 300, until: Math.min(typeAt + 8000 + i * 4000, codedAt) }));
  return {
    kind: "missile",
    blastAt,
    blast,
    missileFrom: { x: blast.x < vw / 2 ? vw + 120 : -120, y: -140 },
    blocks,
    attempt: cardIndex >= 0 ? { block: blocks.findIndex((b) => b.el === els[cardIndex]), at: attemptAt } : null,
    fires,
    floor,
    partyAt,
    endAt: endAt + 200,
    cast: crewNames,
  };
}

// The page blown apart, and put back: stand-ins for every piece fly off at
// the blast, and fly back in as each is rebuilt, the real thing showing
// again once its stand-in's home. `rush`: caught at it — the rest back
// inside RUSH_MS.
function MissileRound({ plan, onDone, rush }: { plan: MissilePlan; onDone: () => void; rush: boolean }) {
  const layer = useRef<HTMLDivElement>(null);
  const missile = useRef<HTMLDivElement>(null);
  const pieces = useRef<{ back: (at: number) => void; home: boolean }[]>([]);
  const started = useRef(0);

  useEffect(() => {
    const done = setTimeout(onDone, plan.endAt + REST_BETWEEN_ROUNDS_MS);
    return () => clearTimeout(done);
  }, [plan, onDone]);

  useEffect(() => {
    const holder = layer.current;
    if (!holder) return;
    started.current = performance.now();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const anims: Animation[] = [];
    const cleanups: (() => void)[] = [];
    const flight = missile.current?.animate(
      [
        { transform: `translate(${plan.missileFrom.x - plan.blast.x}px, ${plan.missileFrom.y - plan.blast.y}px)`, opacity: 1 },
        { transform: "translate(0px, 0px)", opacity: 1, offset: 0.999 },
        { transform: "translate(0px, 0px)", opacity: 0 },
      ],
      { duration: plan.blastAt, easing: "cubic-bezier(0.5, 0, 1, 1)", fill: "both" }
    );
    if (flight) anims.push(flight);

    pieces.current = plan.blocks.map((b, i) => {
      const copy = b.el.cloneNode(true) as HTMLElement;
      copy.removeAttribute("data-crew-block");
      copy.removeAttribute("data-crew-card");
      copy.removeAttribute("data-crew-chart");
      Object.assign(copy.style, {
        position: "absolute",
        left: `${b.box.x}px`,
        top: `${b.box.y}px`,
        width: `${b.box.w}px`,
        height: `${b.box.h}px`,
        margin: "0",
        opacity: "0",
        pointerEvents: "none",
        visibility: "visible",
      });
      holder.appendChild(copy);
      const offT = `translate(${b.off.x.toFixed(0)}px, ${b.off.y.toFixed(0)}px) rotate(${b.spin.toFixed(0)}deg) scale(0.6)`;
      const shown = b.el.style.visibility;
      let home = false;
      // Blown away.
      anims.push(
        copy.animate(
          [
            { transform: "none", opacity: 1 },
            { transform: offT, opacity: 1 },
          ],
          { delay: plan.blastAt, duration: 1300, easing: "cubic-bezier(0.1, 0.7, 0.3, 1)", fill: "both" }
        )
      );
      timers.push(setTimeout(() => (b.el.style.visibility = "hidden"), plan.blastAt));
      // The builders' go at this one: it flies back, crooked — and falls off again.
      if (plan.attempt?.block === i) {
        anims.push(
          copy.animate(
            [
              { transform: offT, opacity: 1 },
              { transform: "rotate(7deg)", opacity: 1, offset: 0.35 },
              { transform: "rotate(7deg)", opacity: 1, offset: 0.55 },
              { transform: `translate(30px, ${window.innerHeight}px) rotate(80deg)`, opacity: 1, offset: 0.95 },
              { transform: offT, opacity: 1 },
            ],
            { delay: plan.attempt.at, duration: 3000, easing: "ease-in-out", composite: "replace" }
          )
        );
      }
      const piece = {
        home,
        back: (at: number) => {
          if (piece.home) return;
          piece.home = true;
          home = true;
          anims.push(
            copy.animate(
              [
                { transform: offT, opacity: 1 },
                { transform: "none", opacity: 1 },
              ],
              { delay: at, duration: BLOCK_BACK_MS, easing: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "both" }
            )
          );
          timers.push(
            setTimeout(() => {
              copy.style.display = "none";
              b.el.style.visibility = shown;
              b.el.animate([{ transform: "translateY(-6px)" }, { transform: "none" }], { duration: 260, easing: "ease-out" });
            }, at + BLOCK_BACK_MS)
          );
        },
      };
      cleanups.push(() => {
        copy.remove();
        b.el.style.visibility = shown;
      });
      return piece;
    });
    // Each back in its turn.
    plan.blocks.forEach((b, i) => {
      timers.push(setTimeout(() => pieces.current[i]?.back(0), b.backAt));
    });
    return () => {
      timers.forEach(clearTimeout);
      anims.forEach((a) => a.cancel());
      cleanups.forEach((c) => c());
      pieces.current = [];
    };
  }, [plan]);

  // Caught at it: whatever's still in pieces, back in a hurry.
  useEffect(() => {
    if (!rush) return;
    const left = pieces.current.filter((p) => !p.home);
    left.forEach((p, i) => p.back((RUSH_MS - BLOCK_BACK_MS - 200) * (i / Math.max(1, left.length))));
  }, [rush]);

  const partyConfetti = plan.partyAt;
  return (
    <div ref={layer} className={rush ? "crew-rush" : ""}>
      {/* The missile, trailing fire. */}
      <div ref={missile} className="absolute" style={{ left: plan.blast.x, top: plan.blast.y, zIndex: 6 }}>
        <div
          className="absolute"
          style={{ transform: `rotate(${(Math.atan2(plan.blast.y - plan.missileFrom.y, plan.blast.x - plan.missileFrom.x) * 180) / Math.PI}deg)` }}
        >
          <div className="absolute" style={{ left: -130, top: -8, width: 110, height: 16, borderRadius: 8, background: "linear-gradient(90deg, rgba(255,120,40,0), rgba(255,160,60,0.9) 80%, #ffe08a)" }} />
          <svg className="absolute" style={{ left: -34, top: -10 }} width="44" height="20" aria-hidden="true">
            <path d="M2,4 L30,4 Q42,10 30,16 L2,16 Z" fill="#9aa3b5" stroke="#6b7280" strokeWidth="1.5" />
            <path d="M2,4 L-4,-2 L8,4 Z M2,16 L-4,22 L8,16 Z" fill="#e0564f" />
            <rect x="12" y="4" width="4" height="12" fill="#e0564f" />
          </svg>
        </div>
      </div>
      {/* The flash, and the blast. */}
      <div className="crew-flash absolute inset-0" style={{ background: "#fff8e1", zIndex: 7, animationDelay: `${plan.blastAt}ms` }} />
      {Array.from({ length: 10 }, (_, i) => (
        <Puff key={i} x={plan.blast.x + Math.cos(i * 0.63) * 70 * (1 + (i % 3))} y={plan.blast.y + Math.sin(i * 0.63) * 60 * (1 + (i % 3))} at={plan.blastAt + i * 40} big />
      ))}
      {/* Scorched floor and a few small fires, burning down. */}
      <div
        className="absolute rounded-full"
        style={{
          left: plan.blast.x - 260,
          bottom: FLOOR - 10,
          width: 520,
          height: 24,
          background: "radial-gradient(ellipse at center, rgba(30,24,20,0.55), rgba(30,24,20,0) 70%)",
          animation: `crew-fade-in 400ms ease-out ${plan.blastAt}ms both, crew-fade-out 1500ms ease-in ${plan.partyAt}ms forwards`,
        }}
      />
      {plan.fires.map((f, i) => (
        <div
          key={i}
          className="absolute"
          style={{ left: f.x - 12, bottom: FLOOR - 2, width: 24, height: 34, animation: `crew-fade-in 300ms ease-out ${f.from}ms both, crew-fade-out 800ms ease-in ${f.until}ms forwards` }}
        >
          <div className="crew-flicker absolute inset-0 rounded-full" style={{ background: "radial-gradient(ellipse at 50% 80%, #ffd35c, #ff8a1f 45%, rgba(224,86,79,0) 72%)", borderRadius: "50% 50% 40% 40% / 70% 70% 30% 30%" }} />
        </div>
      ))}
      {plan.floor.map((actor) => (
        <FloorWorker key={actor.character.name} actor={actor} cheerStyle="jump" moonwalk={false} />
      ))}
      <Confetti at={partyConfetti} />
    </div>
  );
}

// ============================================================ scene

function CleaningRound({ plan, onDone }: { plan: RoundPlan; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, plan.endAt + REST_BETWEEN_ROUNDS_MS);
    return () => clearTimeout(timer);
  }, [plan, onDone]);
  useEffect(() => (plan.crooked ? hangCrooked(plan.crooked) : undefined), [plan]);
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
      {plan.gondola?.shine && <Shine {...plan.gondola.shine} />}
      {plan.rescue && <Ambulance plan={plan.rescue} total={plan.endAt} />}
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

type AnyPlan = RoundPlan | RepairPlan | MissilePlan;

interface SceneState {
  round: number;
  plan: AnyPlan;
  assignments: Assignment[];
  /** Their shift's done: no more rounds, just any errands to finish before they go. */
  over: boolean;
}

// The next round: usually an ordinary clean; now and then something breaks
// and the builders come to fix it; and straight after them, the cleaning
// crew clearing up their mess.
function nextPlan(exclude: Name[], after: AnyPlan | null): AnyPlan {
  // Once in a while, a visit starts with a bang.
  if (!after && Math.random() < MISSILE_CHANCE) {
    const missile = planMissile(exclude);
    if (missile) return missile;
  }
  if (after?.kind === "repair") {
    const cleanup = planCleanup(exclude, after.debris);
    if (cleanup) return cleanup;
  }
  if (Math.random() < REPAIR_CHANCE) {
    const repair = planRepair();
    if (repair) return repair;
  }
  return planRound(exclude);
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

// How long they stay each time they turn up — it varies: sometimes just
// the one job (a clean, or a repair and the clean-up after it), sometimes a
// couple of minutes' worth, sometimes five. Then they're off, and the next
// lot turn up a minute later if the screen's still left alone.
type Shift = { kind: "one" } | { kind: "timed"; ms: number };
const SHORT_SHIFT_MS = 120_000;
const LONG_SHIFT_MS = 300_000;
const BREAK_MS = 60_000;

function pickShift(): Shift {
  const pick = weightedPick<"one" | "short" | "long">([
    ["one", 1],
    ["short", 1],
    ["long", 1],
  ]);
  return pick === "one" ? { kind: "one" } : { kind: "timed", ms: pick === "short" ? SHORT_SHIFT_MS : LONG_SHIFT_MS };
}

function CleaningScene({
  shift,
  onShiftOver,
  onRound,
  rush,
}: {
  shift: Shift;
  onShiftOver: () => void;
  /** Each round as it starts (null once they're done), for if they get caught. */
  onRound: (plan: AnyPlan | null) => void;
  /** Caught while the page is in pieces: put it back in a hurry. */
  rush: boolean;
}) {
  const [state, setState] = useState<SceneState>(() => ({ round: 0, plan: nextPlan([], null), assignments: [], over: false }));
  const arrivedAt = useRef(0);
  useEffect(() => {
    arrivedAt.current = performance.now();
  }, []);
  useEffect(() => {
    onRound(state.over ? null : state.plan);
  }, [state.plan, state.over, onRound]);

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
    const shiftDone = shift.kind === "one" || performance.now() - arrivedAt.current >= shift.ms;
    setState((s) => {
      // Between rounds everyone's free, so waiting errands go first and the
      // next cleaning round is cast from whoever's left.
      const assignments = assignJobs(s.assignments, []);
      const exclude = assignments.map((a) => a.name);
      if (shiftDone) {
        // Time to go — though the builders' mess always gets cleaned up first.
        const cleanup = s.plan.kind === "repair" ? planCleanup(exclude, s.plan.debris) : null;
        if (!cleanup) return { ...s, assignments, over: true };
        return { round: s.round + 1, plan: cleanup, assignments, over: false };
      }
      return { round: s.round + 1, plan: nextPlan(exclude, s.plan), assignments, over: false };
    });
  }, [shift]);

  const finishJob = useCallback((id: number) => {
    setState((s) => ({ ...s, assignments: s.assignments.filter((a) => a.job.id !== id) }));
  }, []);

  // Gone once the last errand's done.
  useEffect(() => {
    if (state.over && state.assignments.length === 0) onShiftOver();
  }, [state.over, state.assignments.length, onShiftOver]);

  return (
    <>
      {!state.over &&
        (state.plan.kind === "repair" ? (
          <RepairRound key={state.round} plan={state.plan} onDone={nextRound} />
        ) : state.plan.kind === "missile" ? (
          <MissileRound key={state.round} plan={state.plan} onDone={nextRound} rush={rush} />
        ) : (
          <CleaningRound key={state.round} plan={state.plan} onDone={nextRound} />
        ))}
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

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

// ============================================================ the clock

// When the top bar's clock turns over to a new hour (or a new day): a little
// crew member hops over, climbs a ladder up to it, peels off the old number
// — which goes flying — and sticks the new one on, then climbs down and hops
// off. LiveClock puts this right next to the number, holds the old one till
// `onPeel`, and shows the new one at `onSwap`.
export const CLOCK_VISIT_MS = 5200;
const CLOCK_SCALE = 0.42;
const CLOCK_PEEL_AT = 1900;
const CLOCK_SWAP_AT = 2500;

type ClockPhase = "in" | "climb" | "peel" | "stick" | "down" | "out";

export function ClockCrew({ oldText, onPeel, onSwap, onDone }: { oldText: string; onPeel: () => void; onSwap: () => void; onDone: () => void }) {
  const [character] = useState(() => CHARACTERS[ALL_NAMES[Math.floor(Math.random() * ALL_NAMES.length)]]);
  // The number that was up when they came (it's the new one by the end).
  const [peeled] = useState(oldText);
  const [phase, setPhase] = useState<ClockPhase>("in");
  const walker = useRef<HTMLDivElement>(null);
  const ladder = useRef<HTMLDivElement>(null);
  const done = useRef({ onPeel, onSwap, onDone });
  useEffect(() => {
    done.current = { onPeel, onSwap, onDone };
  });
  useEffect(() => {
    const w = character.width * CLOCK_SCALE;
    const moves = walker.current?.animate(
      [
        { transform: `translate(${-96 - w}px, 0px)`, offset: 0 },
        { transform: `translate(${-14 - w}px, 0px)`, offset: 1300 / CLOCK_VISIT_MS },
        { transform: `translate(${-6 - w}px, -13px)`, offset: CLOCK_PEEL_AT / CLOCK_VISIT_MS },
        { transform: `translate(${-6 - w}px, -13px)`, offset: 3200 / CLOCK_VISIT_MS },
        { transform: `translate(${-14 - w}px, 0px)`, offset: 3700 / CLOCK_VISIT_MS },
        { transform: `translate(${-120 - w}px, 0px)`, offset: 1 },
      ],
      { duration: CLOCK_VISIT_MS, fill: "both" }
    );
    const up = ladder.current?.animate(
      [
        { transform: "translateY(44px)", opacity: 0, offset: 0 },
        { transform: "translateY(0px)", opacity: 1, offset: 300 / CLOCK_VISIT_MS },
        { transform: "translateY(0px)", opacity: 1, offset: 4400 / CLOCK_VISIT_MS },
        { transform: "translateY(44px)", opacity: 0, offset: 1 },
      ],
      { duration: CLOCK_VISIT_MS, fill: "both" }
    );
    const at = (ms: number, run: () => void) => setTimeout(run, ms);
    const timers = [
      at(1300, () => setPhase("climb")),
      at(CLOCK_PEEL_AT, () => {
        setPhase("peel");
        done.current.onPeel();
      }),
      at(CLOCK_SWAP_AT, () => {
        setPhase("stick");
        done.current.onSwap();
      }),
      at(3200, () => setPhase("down")),
      at(3700, () => setPhase("out")),
      at(CLOCK_VISIT_MS, () => done.current.onDone()),
    ];
    return () => {
      timers.forEach(clearTimeout);
      moves?.cancel();
      up?.cancel();
    };
  }, [character]);

  const walking = phase === "in" || phase === "out";
  const pose: Pose = {
    ...BASE_POSE,
    mode: phase === "peel" || phase === "stick" ? "raise" : "none",
    expression: phase === "stick" ? "content" : walking ? "walk" : "focus",
    bodyClass: phase === "peel" ? "crew-pull" : phase === "stick" ? "crew-nod" : "",
    hopMs: walking ? HOP_MS : phase === "climb" || phase === "down" ? 300 : null,
    facing: phase === "out" ? -1 : 1,
    gaze: walking ? null : { x: 0.6, y: -0.8 },
    bucketDown: false,
  };
  return (
    <span className="pointer-events-none absolute" style={{ left: 0, bottom: -14, width: 0, height: 0, zIndex: 50 }} aria-hidden="true">
      {/* The ladder, leaning up against it. */}
      <div ref={ladder} className="absolute" style={{ left: -12, bottom: 0, width: 14, height: 40, opacity: 0 }}>
        <svg width="14" height="40" viewBox="0 0 14 40">
          <rect x="1" y="0" width="2.5" height="40" rx="1" fill="#b07d4f" />
          <rect x="10.5" y="0" width="2.5" height="40" rx="1" fill="#b07d4f" />
          {[6, 15, 24, 33].map((y) => (
            <rect key={y} x="2" y={y} width="10" height="2.2" rx="1" fill="#c9955f" />
          ))}
        </svg>
      </div>
      <div ref={walker} className="absolute" style={{ left: 0, bottom: 0 }}>
        <div style={{ transform: `scale(${CLOCK_SCALE})`, transformOrigin: "0% 100%" }}>
          <Figure character={character} pose={pose} />
        </div>
      </div>
      {/* The old number, peeled off and flung away. */}
      {(phase === "peel" || phase === "stick" || phase === "down" || phase === "out") && (
        <span className="crew-toss absolute whitespace-nowrap font-mono text-base font-semibold text-foreground" style={{ left: 0, bottom: 14 }}>
          {peeled}
        </span>
      )}
    </span>
  );
}

// Nobody about; the crew out on a shift; between shifts; or caught, and
// running for it.
type Phase = "off" | "visit" | "break" | "caught";

export default function IdleDustWiper() {
  const reducedMotion = useSyncExternalStore(
    () => () => {},
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true
  );
  const [phase, setPhase] = useState<Phase>("off");
  const [visit, setVisit] = useState<{ n: number; shift: Shift }>({ n: 0, shift: { kind: "one" } });
  const [caught, setCaught] = useState<Caught | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  // The phase right now, and the round on screen, for the activity listener.
  const now = useRef<Phase>("off");
  const round = useRef<{ plan: AnyPlan | null; startedAt: number }>({ plan: null, startedAt: 0 });
  // Caught while the page is in pieces: it goes back together first, then
  // they run.
  const [rush, setRush] = useState(false);
  const rushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const breakTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const go = useCallback((next: Phase) => {
    now.current = next;
    setPhase(next);
  }, []);
  const startVisit = useCallback(() => {
    // Never on top of a visit already going, or of one running for it.
    if (now.current === "visit" || now.current === "caught") return;
    setVisit((v) => ({ n: v.n + 1, shift: pickShift() }));
    go("visit");
  }, [go]);

  // A minute without anyone touching anything and they turn up. Any
  // movement while they're out and they've been caught.
  useEffect(() => {
    if (reducedMotion) return;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(startVisit, IDLE_MS);
    };
    const catchNow = () => {
      if (now.current !== "visit" || !layer.current) return;
      setCaught(catchThem(layer.current, round.current.plan, performance.now() - round.current.startedAt));
      setRush(false);
      go("caught");
    };
    const onActivity = () => {
      // The page in pieces: put back in a hurry before they run for it.
      const plan = round.current.plan;
      const elapsed = performance.now() - round.current.startedAt;
      if (now.current === "visit" && plan?.kind === "missile" && elapsed > plan.blastAt && elapsed < plan.partyAt) {
        if (!rushTimer.current) {
          setRush(true);
          rushTimer.current = setTimeout(() => {
            rushTimer.current = undefined;
            catchNow();
          }, RUSH_MS);
        }
      } else if (now.current === "visit") {
        catchNow();
      } else if (now.current === "break") {
        clearTimeout(breakTimer.current);
        go("off");
      }
      arm();
    };
    arm();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      clearTimeout(idle);
      clearTimeout(breakTimer.current);
      clearTimeout(rushTimer.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [reducedMotion, startVisit, go]);

  const onShiftOver = useCallback(() => {
    go("break");
    clearTimeout(breakTimer.current);
    breakTimer.current = setTimeout(startVisit, BREAK_MS);
  }, [go, startVisit]);
  const onCaughtDone = useCallback(() => {
    setCaught(null);
    go("off");
  }, [go]);
  const onRound = useCallback((plan: AnyPlan | null) => {
    round.current = { plan, startedAt: performance.now() };
  }, []);

  // While the crew's on shift, stat cards hold their numbers for them to
  // deliver (see crewCards); otherwise updates go straight through.
  useEffect(() => {
    crewCards.setOnDuty(phase === "visit");
  }, [phase]);
  useEffect(() => () => crewCards.setOnDuty(false), []);

  if (phase === "off" || phase === "break") return null;

  // Portalled straight to <body> — PageTransition wraps every page's
  // content in a `transform`, which makes any `fixed` descendant of it
  // position relative to that wrapper instead of the viewport (a transformed
  // ancestor creates its own containing block for fixed elements).
  return createPortal(
    <div ref={layer} className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {phase === "visit" ? (
        <CleaningScene key={visit.n} shift={visit.shift} onShiftOver={onShiftOver} onRound={onRound} rush={rush} />
      ) : (
        caught && <CaughtScene caught={caught} onDone={onCaughtDone} />
      )}
    </div>,
    document.body
  );
}
