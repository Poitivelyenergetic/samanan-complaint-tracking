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

// Purple's hand for the sign-in pull — drawn at a fixed size and never
// stretched (the arm itself is a separate bar that changes length), so the
// fist keeps its shape however far he reaches. Open while reaching out, then
// clenched on the edge of the login panel for the haul.
const HAND_SIZE = 40;

function OpenHand({ color }: { color: string }) {
  return (
    <svg width={HAND_SIZE} height={HAND_SIZE} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="18" y="7" width="19" height="6" rx="3" fill={color} />
      <rect x="20" y="14" width="19" height="6" rx="3" fill={color} />
      <rect x="20" y="21" width="18" height="6" rx="3" fill={color} />
      <rect x="18" y="28" width="15" height="6" rx="3" fill={color} />
      <ellipse cx="12" cy="7" rx="4" ry="7" fill={color} transform="rotate(-30 12 7)" />
      <circle cx="14" cy="20" r="12" fill={color} />
    </svg>
  );
}

function Fist({ color }: { color: string }) {
  return (
    <svg width={HAND_SIZE} height={HAND_SIZE} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="7" width="28" height="27" rx="12" fill={color} />
      {/* Curled knuckles wrapped round the panel's edge. */}
      <circle cx="30" cy="12" r="6" fill={color} />
      <circle cx="31" cy="20.5" r="6" fill={color} />
      <circle cx="30" cy="29" r="6" fill={color} />
      <path d="M27,16 L33,16 M27,25 L33,25" stroke="#000000" strokeOpacity="0.18" strokeWidth="1.5" strokeLinecap="round" />
      {/* Thumb clamped over the top. */}
      <ellipse cx="17" cy="9" rx="9" ry="5" fill={color} />
      <path d="M10,10 Q17,5 25,9" stroke="#000000" strokeOpacity="0.15" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function easeOutBack(t: number) {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// How long the reach out to the panel takes, and how far the fist closes
// over the panel's edge once it gets there.
const REACH_MS = 480;
const GRIP_OVERLAP = 12;

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
  const rootRef = useRef<HTMLDivElement>(null);
  const armRef = useRef<HTMLDivElement>(null);
  const armBarRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const openHandRef = useRef<HTMLDivElement>(null);
  const fistRef = useRef<HTMLDivElement>(null);
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

  // The sign-in pull, driven frame by frame rather than with a CSS
  // transition: the arm is re-measured every frame from purple's shoulder
  // to the login panel's actual current edge, so while the panel slides
  // across during the reveal his fist stays locked onto its edge and the
  // arm shortens with it — he's visibly hauling it in, not just posing
  // while it moves on its own. Before that, the reach: the arm shoots out
  // with a little overshoot, hand open, and clenches as it lands.
  useEffect(() => {
    const arm = armRef.current;
    const bar = armBarRef.current;
    const hand = handRef.current;
    const openHand = openHandRef.current;
    const fist = fistRef.current;
    if (!arm || !bar || !hand || !openHand || !fist) return;
    if (!reaching && !revealing) {
      arm.style.opacity = "0";
      return;
    }
    const dir = isRtl ? -1 : 1;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const root = rootRef.current;
      const body = purpleRef.current;
      const panel = document.querySelector(".login-pull-form");
      if (!root || !body) return;
      const rootRect = root.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const shoulder = isRtl ? bodyRect.left + 14 : bodyRect.right - 14;
      const panelRect = panel?.getBoundingClientRect();
      const edge = panelRect ? (isRtl ? panelRect.right : panelRect.left) : shoulder;
      const full = (edge - shoulder) * dir + GRIP_OVERLAP;

      let length: number;
      let gripping: boolean;
      if (revealing) {
        length = full;
        gripping = true;
      } else {
        const t = Math.min(1, (now - start) / REACH_MS);
        length = Math.max(0, full) * easeOutBack(t);
        gripping = t > 0.85;
      }
      // Once the panel has been pulled right over him the arm has nowhere
      // left to go — it's tucked away under the panel.
      arm.style.opacity = length > HAND_SIZE * 0.6 ? "1" : "0";
      arm.style.left = `${shoulder - rootRect.left}px`;
      arm.style.top = `${bodyRect.top - rootRect.top + 92}px`;
      arm.style.transform = `scaleX(${dir})`;
      bar.style.width = `${Math.max(0, length - HAND_SIZE / 2)}px`;
      hand.style.left = `${length - HAND_SIZE / 2}px`;
      openHand.style.opacity = gripping ? "0" : "1";
      fist.style.opacity = gripping ? "1" : "0";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reaching, revealing, isRtl]);

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
      ref={rootRef}
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
          transform: revealing
            ? // Heaving back on the panel — leaning away from it, squashed
              // down with the effort.
              `skewX(${isRtl ? -14 : 14}deg) translateX(${isRtl ? 16 : -16}px) scaleY(0.95) scaleX(1.04)`
            : `${
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
                reaching || revealing
                  ? { x: isRtl ? -5 : 5, y: 1 }
                  : sad
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

      {/* Purple's arm for the sign-in pull — positioned and sized every
          frame by the effect above. A sibling of the characters (not inside
          purple's own div) so it can sit in front of the other three, and
          high enough in z-order to curl its fist over the panel's edge. */}
      <div
        ref={armRef}
        className="pointer-events-none absolute"
        style={{ left: 0, top: 0, zIndex: 30, opacity: 0, transformOrigin: "0 0" }}
      >
        <div className={revealing ? "animate-arm-tug" : ""} style={{ transformOrigin: "0 0" }}>
          <div
            ref={armBarRef}
            className="absolute rounded-full"
            style={{
              left: 0,
              top: -11,
              width: 0,
              height: 22,
              background: `linear-gradient(${LOGIN_CHARACTER_COLORS.purple}, #2c4aa3)`,
              boxShadow: "inset 0 3px 0 rgba(255,255,255,0.18)",
            }}
          />
          <div
            ref={handRef}
            className="absolute"
            style={{ left: 0, top: -HAND_SIZE / 2, width: HAND_SIZE, height: HAND_SIZE }}
          >
            <div ref={openHandRef} className="absolute inset-0">
              <OpenHand color={LOGIN_CHARACTER_COLORS.purple} />
            </div>
            <div ref={fistRef} className="absolute inset-0" style={{ opacity: 0 }}>
              <Fist color={LOGIN_CHARACTER_COLORS.purple} />
            </div>
          </div>
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
