"use client";

// Animated login-screen characters — ported to React from marker964's
// MIT-licensed "animated-characters-login-page"
// (https://github.com/marker964/animated-characters-login-page), itself a
// recreation of arsh342/careercompass's login screen. Behavior (mouse
// tracking, blinking, the "look at each other" typing reaction and the
// password peek) matches that source; the JSX/hooks are a fresh React
// implementation, not a line-for-line port of the original Vue.

import { useEffect, useRef, useState, type RefObject } from "react";

interface Point {
  x: number;
  y: number;
}

function useMousePosition(): Point {
  // Starting at (0, 0) — the top-left corner — made every character lean
  // sharply toward it until the cursor actually moved over the page, which
  // read as them all leaning "at nothing" on load. The center of the
  // viewport is a much more neutral resting point.
  const [pos, setPos] = useState<Point>(() =>
    typeof window === "undefined" ? { x: 0, y: 0 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  );
  useEffect(() => {
    function onMove(e: MouseEvent) {
      setPos({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  return pos;
}

// A family of Samnan-brand blues instead of the source's unrelated
// purple/black/orange/yellow palette — darkest (brand blue) at the back,
// lightening toward the front, so the four still read as distinct shapes
// without introducing colors that don't belong to the app.
export const LOGIN_CHARACTER_COLORS = {
  purple: "#385bc1",
  black: "#1f2430",
  orange: "#5b7fc7",
  yellow: "#9db8e8",
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lookOffset(rect: DOMRect, mouse: Point, maxDistance: number): Point {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = mouse.x - centerX;
  const dy = mouse.y - centerY;
  const distance = Math.min(Math.hypot(dx, dy), maxDistance);
  const angle = Math.atan2(dy, dx);
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
}

// A white eyeball whose dark pupil tracks the cursor (clamped to
// maxDistance), and can be forced to look a specific direction instead
// (used for the "peeking at the password" and "looking at each other"
// reactions). Blinking briefly collapses the eye to a sliver.
function EyeBall({
  mouse,
  size,
  pupilSize,
  maxDistance,
  eyeColor,
  pupilColor,
  isBlinking,
  forceLook,
}: {
  mouse: Point;
  size: number;
  pupilSize: number;
  maxDistance: number;
  eyeColor: string;
  pupilColor: string;
  isBlinking: boolean;
  forceLook?: Point;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [look, setLook] = useState<Point>({ x: 0, y: 0 });

  useEffect(() => {
    if (forceLook) {
      setLook(forceLook);
      return;
    }
    if (!ref.current) return;
    setLook(lookOffset(ref.current.getBoundingClientRect(), mouse, maxDistance));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mouse, maxDistance, forceLook?.x, forceLook?.y]);

  return (
    <div
      ref={ref}
      className="flex items-center justify-center overflow-hidden rounded-full transition-all duration-150"
      style={{ width: size, height: isBlinking ? 2 : size, backgroundColor: eyeColor }}
    >
      {!isBlinking && (
        <div
          className="rounded-full"
          style={{
            width: pupilSize,
            height: pupilSize,
            backgroundColor: pupilColor,
            transform: `translate(${look.x}px, ${look.y}px)`,
            transition: "transform 0.1s ease-out",
          }}
        />
      )}
    </div>
  );
}

// A closed-mouth line, shared by all four characters so their faces read as
// the same "style" rather than only one of them having a mouth at all. Turns
// into a downward-curving frown for the "sad" reaction to a rejected sign-in
// — the classic CSS trick of a colored bottom border on a circular box,
// flipped upside down.
function Mouth({ sad, width }: { sad: boolean; width: number }) {
  if (sad) {
    return (
      <div
        className="transition-all duration-200"
        style={{
          width,
          height: width / 2,
          borderRadius: "50%",
          border: "3px solid transparent",
          borderBottomColor: "#2D2D2D",
          transform: "rotate(180deg)",
        }}
      />
    );
  }
  return <div className="h-1 rounded-full bg-[#2D2D2D] transition-all duration-200" style={{ width }} />;
}

// Repeats `run` after a random delay in [minMs, minMs+spreadMs), forever,
// until the effect cleans up — used for both characters' independent blink
// loops.
function useRandomInterval(run: () => void, minMs: number, spreadMs: number, active = true) {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      timer = setTimeout(() => {
        if (cancelled) return;
        run();
        schedule();
      }, Math.random() * spreadMs + minMs);
    }
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

// A quick squish-and-recover on click — the only feedback these characters
// give to being clicked at all, so there's something to notice when you do.
function useSquish(): [boolean, () => void] {
  const [active, setActive] = useState(false);
  function trigger() {
    setActive(true);
    setTimeout(() => setActive(false), 260);
  }
  return [active, trigger];
}

function useBlink(): boolean {
  const [blinking, setBlinking] = useState(false);
  useRandomInterval(
    () => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 150);
    },
    3000,
    4000
  );
  return blinking;
}

// Purple's reaching arm during the sign-in reveal — a tapered forearm
// ending in a gripping fist (three curled knuckles on top, a thumb tucked
// underneath) rather than fanned-open fingers, which at this size read as
// a messy claw instead of a hand actually holding onto something. Scaled
// up (width/height bigger than the viewBox) rather than redrawn bigger,
// so the proportions — and the "not obese" fist — stay the same; it just
// needs the extra length to actually reach the illustration's own edge,
// which now sits a fixed distance from him (see the character group's
// justify-end below) instead of drifting with the viewport.
function Arm({ color }: { color: string }) {
  return (
    <svg width="397" height="106" viewBox="0 0 210 56" aria-hidden="true">
      <path d="M0,12 C60,12 110,16 150,20 L150,38 C110,42 60,46 0,46 Z" fill={color} />
      <path
        d="M148,10 C170,4 191,9 195,21 C197,29 192,37 181,41 C168,45 151,42 145,32 C141,24 142,15 148,10 Z"
        fill={color}
      />
      <circle cx="161" cy="12" r="7.5" fill={color} />
      <circle cx="176" cy="9" r="7.5" fill={color} />
      <circle cx="190" cy="14" r="7" fill={color} />
      <ellipse cx="151" cy="40" rx="10" ry="7.5" fill={color} transform="rotate(22 151 40)" />
    </svg>
  );
}

function useBodyTracking(ref: RefObject<HTMLDivElement | null>, mouse: Point) {
  const [state, setState] = useState({ faceX: 0, faceY: 0, bodySkew: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 3;
    const dx = mouse.x - centerX;
    const dy = mouse.y - centerY;
    setState({
      faceX: clamp(dx / 20, -15, 15),
      faceY: clamp(dy / 30, -10, 10),
      bodySkew: clamp(-dx / 120, -6, 6),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mouse]);
  return state;
}

export interface LoginCharactersProps {
  isTyping: boolean;
  showPassword: boolean;
  passwordLength: number;
  // Bumped (to any new value) each time sign-in is rejected — not a boolean,
  // since two failures in a row need to retrigger the reaction even though
  // the "value" driving it (wrong credentials) hasn't visibly changed.
  loginFailedSignal?: number;
  // Drives purple's reaching arm during the sign-in reveal — see the page
  // that renders this component for the full three-beat sequence. Both
  // false/undefined outside that flow, which keeps the arm invisible.
  reaching?: boolean;
  revealing?: boolean;
  // Only the arm mirrors for Arabic — the rest of the illustration is a
  // fixed piece of art regardless of locale, but the arm has to point
  // toward whichever physical side the illustration grows toward, which
  // flips with direction.
  isRtl?: boolean;
}

export default function LoginCharacters({
  isTyping,
  showPassword,
  passwordLength,
  loginFailedSignal,
  reaching,
  revealing,
  isRtl,
}: LoginCharactersProps) {
  const mouse = useMousePosition();
  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);

  const purpleBlinking = useBlink();
  const blackBlinking = useBlink();
  const orangeBlinking = useBlink();
  const yellowBlinking = useBlink();

  // Disappointed reaction to a rejected sign-in: every character looks down
  // for a beat and the whole group gives a brief headshake. Skips the very
  // first render (signal starts at 0/undefined with nothing to react to).
  const [sad, setSad] = useState(false);
  const previousSignal = useRef(loginFailedSignal);
  useEffect(() => {
    if (loginFailedSignal === undefined || loginFailedSignal === previousSignal.current) return;
    previousSignal.current = loginFailedSignal;
    setSad(true);
    const timer = setTimeout(() => setSad(false), 900);
    return () => clearTimeout(timer);
  }, [loginFailedSignal]);

  const [lookingAtEachOther, setLookingAtEachOther] = useState(false);
  useEffect(() => {
    if (!isTyping) {
      setLookingAtEachOther(false);
      return;
    }
    setLookingAtEachOther(true);
    const timer = setTimeout(() => setLookingAtEachOther(false), 800);
    return () => clearTimeout(timer);
  }, [isTyping]);

  const isHidingPassword = passwordLength > 0 && !showPassword;
  const passwordVisible = passwordLength > 0 && showPassword;

  const [purplePeeking, setPurplePeeking] = useState(false);
  useRandomInterval(
    () => {
      setPurplePeeking(true);
      setTimeout(() => setPurplePeeking(false), 800);
    },
    2000,
    3000,
    passwordVisible
  );
  useEffect(() => {
    if (!passwordVisible) setPurplePeeking(false);
  }, [passwordVisible]);

  const purple = useBodyTracking(purpleRef, mouse);
  const black = useBodyTracking(blackRef, mouse);
  const orange = useBodyTracking(orangeRef, mouse);
  const yellow = useBodyTracking(yellowRef, mouse);

  const [purpleSquish, squishPurple] = useSquish();
  const [blackSquish, squishBlack] = useSquish();
  const [orangeSquish, squishOrange] = useSquish();
  const [yellowSquish, squishYellow] = useSquish();

  // Every character shares the same downward "sad" gaze and the same frown
  // — the four differ in scale and stance, not in what a given expression
  // looks like on them.
  const sadLook = { x: 0, y: 6 };

  // On mount they drop in from above one after another — tumbling at a
  // tilt, landing squashed flat, then springing up to full height with a
  // wobble (see char-drop in globals.css), rather than just fading into
  // place. Orange lands first and purple, the tallest, last.
  function entranceStyle(delayMs: number, tiltDeg: number) {
    return {
      animationDelay: `${delayMs}ms`,
      "--drop-tilt": `${tiltDeg}deg`,
    } as React.CSSProperties;
  }
  const purpleEntrance = entranceStyle(480, -14);
  const blackEntrance = entranceStyle(320, 22);
  const orangeEntrance = entranceStyle(0, -10);
  const yellowEntrance = entranceStyle(160, 16);

  return (
    <div
      className={`relative ${sad ? "animate-sad-shake" : ""}`}
      style={{ width: 550, height: 400 }}
    >
      {/* Purple — tallest character, stands up taller while a typed
          password is hidden, as if peering over to check. */}
      <div
        ref={purpleRef}
        onClick={squishPurple}
        className="animate-char-drop absolute bottom-0 cursor-pointer transition-all duration-700 ease-in-out"
        style={{
          left: 70,
          width: 180,
          height: isTyping || isHidingPassword ? 440 : 400,
          backgroundColor: LOGIN_CHARACTER_COLORS.purple,
          borderRadius: "10px 10px 0 0",
          zIndex: 1,
          ...purpleEntrance,
          transform: `${
            passwordVisible
              ? "skewX(0deg)"
              : isTyping || isHidingPassword
                ? `skewX(${purple.bodySkew - 12}deg) translateX(40px)`
                : `skewX(${purple.bodySkew}deg)`
          } ${purpleSquish ? "scaleY(0.85) scaleX(1.06)" : "scaleY(1) scaleX(1)"}`,
          transformOrigin: "bottom center",
        }}
      >
        <div
          className="absolute flex gap-8 transition-all duration-700 ease-in-out"
          style={{
            left: passwordVisible ? 20 : lookingAtEachOther ? 55 : 45 + purple.faceX,
            top: passwordVisible ? 35 : lookingAtEachOther ? 65 : 40 + purple.faceY,
          }}
        >
          {[0, 1].map((i) => (
            <EyeBall
              key={i}
              mouse={mouse}
              size={18}
              pupilSize={7}
              maxDistance={5}
              eyeColor="white"
              pupilColor="#2D2D2D"
              isBlinking={purpleBlinking}
              forceLook={
                sad
                  ? sadLook
                  : passwordVisible
                    ? { x: purplePeeking ? 4 : -4, y: purplePeeking ? 5 : -4 }
                    : lookingAtEachOther
                      ? { x: 3, y: 4 }
                      : undefined
              }
            />
          ))}
        </div>
        <div
          className="absolute transition-all duration-700 ease-in-out"
          style={{
            left: passwordVisible ? 20 : lookingAtEachOther ? 55 : 45 + purple.faceX,
            top: passwordVisible ? 63 : lookingAtEachOther ? 95 : 68 + purple.faceY,
          }}
        >
          <Mouth sad={sad} width={30} />
        </div>
      </div>

      {/* Purple's reaching arm — anchored to his own actual right edge
          (left:70 + width:180) rather than a guessed pixel offset from the
          illustration panel, so it stays attached to his body regardless
          of how the panel around him is laid out. Sits as a sibling of the
          characters (not a child of purple's own div) purely so its
          z-index isn't capped by purple's own stacking context — purple is
          z-index 1, behind black/orange/yellow, but the arm still needs to
          render in front of all three as it reaches across them. */}
      <div
        className="pointer-events-none absolute transition-transform duration-500 ease-out"
        style={{
          left: 245,
          top: 70,
          zIndex: 10,
          transform: `scaleX(${(reaching || revealing ? 1 : 0) * (isRtl ? -1 : 1)})`,
          transformOrigin: "0% 50%",
        }}
      >
        {/* The actual tug — a repeated bend-and-release rotation timed to
            the same 1500ms as the panel's own width transition (see the
            login page), so the motion visibly drives the cover rather than
            the panel just growing on its own schedule while his arm sits
            frozen in the grabbed pose. */}
        <div
          className={revealing ? "animate-arm-tug" : ""}
          style={{ transform: "rotate(-4deg)", transformOrigin: "0% 50%" }}
        >
          <Arm color={LOGIN_CHARACTER_COLORS.purple} />
        </div>
      </div>

      {/* Black — leans toward purple while the username is being typed, as
          if the two are looking at each other. */}
      <div
        ref={blackRef}
        onClick={squishBlack}
        className="animate-char-drop absolute bottom-0 cursor-pointer transition-all duration-700 ease-in-out"
        style={{
          left: 240,
          width: 120,
          height: 310,
          backgroundColor: LOGIN_CHARACTER_COLORS.black,
          borderRadius: "8px 8px 0 0",
          zIndex: 2,
          ...blackEntrance,
          transform: `${
            passwordVisible
              ? "skewX(0deg)"
              : lookingAtEachOther
                ? `skewX(${black.bodySkew * 1.5 + 10}deg) translateX(20px)`
                : isTyping || isHidingPassword
                  ? `skewX(${black.bodySkew * 1.5}deg)`
                  : `skewX(${black.bodySkew}deg)`
          } ${blackSquish ? "scaleY(0.85) scaleX(1.06)" : "scaleY(1) scaleX(1)"}`,
          transformOrigin: "bottom center",
        }}
      >
        <div
          className="absolute flex gap-6 transition-all duration-700 ease-in-out"
          style={{
            left: passwordVisible ? 10 : lookingAtEachOther ? 32 : 26 + black.faceX,
            top: passwordVisible ? 28 : lookingAtEachOther ? 12 : 32 + black.faceY,
          }}
        >
          {[0, 1].map((i) => (
            <EyeBall
              key={i}
              mouse={mouse}
              size={16}
              pupilSize={6}
              maxDistance={4}
              eyeColor="white"
              pupilColor="#2D2D2D"
              isBlinking={blackBlinking}
              forceLook={
                sad ? sadLook : passwordVisible ? { x: -4, y: -4 } : lookingAtEachOther ? { x: 0, y: -4 } : undefined
              }
            />
          ))}
        </div>
        <div
          className="absolute transition-all duration-700 ease-in-out"
          style={{ left: passwordVisible ? 10 : 26 + black.faceX, top: passwordVisible ? 60 : 58 + black.faceY }}
        >
          <Mouth sad={sad} width={26} />
        </div>
      </div>

      {/* Orange — short rounded dome in front. */}
      <div
        ref={orangeRef}
        onClick={squishOrange}
        className="animate-char-drop absolute bottom-0 cursor-pointer transition-all duration-700 ease-in-out"
        style={{
          left: 0,
          width: 240,
          height: 200,
          zIndex: 3,
          backgroundColor: LOGIN_CHARACTER_COLORS.orange,
          borderRadius: "120px 120px 0 0",
          ...orangeEntrance,
          transform: `${passwordVisible ? "skewX(0deg)" : `skewX(${orange.bodySkew}deg)`} ${
            orangeSquish ? "scaleY(0.85) scaleX(1.06)" : "scaleY(1) scaleX(1)"
          }`,
          transformOrigin: "bottom center",
        }}
      >
        <div
          className="absolute flex gap-8 transition-all duration-200 ease-out"
          style={{
            left: passwordVisible ? 50 : 82 + orange.faceX,
            top: passwordVisible ? 85 : 90 + orange.faceY,
          }}
        >
          {[0, 1].map((i) => (
            <EyeBall
              key={i}
              mouse={mouse}
              size={16}
              pupilSize={6}
              maxDistance={5}
              eyeColor="white"
              pupilColor="#2D2D2D"
              isBlinking={orangeBlinking}
              forceLook={sad ? sadLook : passwordVisible ? { x: -5, y: -4 } : undefined}
            />
          ))}
        </div>
        <div
          className="absolute transition-all duration-200 ease-out"
          style={{ left: passwordVisible ? 50 : 76 + orange.faceX, top: passwordVisible ? 120 : 125 + orange.faceY }}
        >
          <Mouth sad={sad} width={40} />
        </div>
      </div>

      {/* Yellow. */}
      <div
        ref={yellowRef}
        onClick={squishYellow}
        className="animate-char-drop absolute bottom-0 cursor-pointer transition-all duration-700 ease-in-out"
        style={{
          left: 310,
          width: 140,
          height: 230,
          backgroundColor: LOGIN_CHARACTER_COLORS.yellow,
          borderRadius: "70px 70px 0 0",
          zIndex: 4,
          ...yellowEntrance,
          transform: `${passwordVisible ? "skewX(0deg)" : `skewX(${yellow.bodySkew}deg)`} ${
            yellowSquish ? "scaleY(0.85) scaleX(1.06)" : "scaleY(1) scaleX(1)"
          }`,
          transformOrigin: "bottom center",
        }}
      >
        <div
          className="absolute flex gap-6 transition-all duration-200 ease-out"
          style={{
            left: passwordVisible ? 20 : 52 + yellow.faceX,
            top: passwordVisible ? 35 : 40 + yellow.faceY,
          }}
        >
          {[0, 1].map((i) => (
            <EyeBall
              key={i}
              mouse={mouse}
              size={16}
              pupilSize={6}
              maxDistance={5}
              eyeColor="white"
              pupilColor="#2D2D2D"
              isBlinking={yellowBlinking}
              forceLook={sad ? sadLook : passwordVisible ? { x: -5, y: -4 } : undefined}
            />
          ))}
        </div>
        <div
          className="absolute transition-all duration-200 ease-out"
          style={{
            left: passwordVisible ? 10 : 40 + yellow.faceX,
            top: passwordVisible ? 88 : 88 + yellow.faceY,
          }}
        >
          <Mouth sad={sad} width={20} />
        </div>
      </div>
    </div>
  );
}
