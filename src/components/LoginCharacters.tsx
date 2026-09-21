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
  const [pos, setPos] = useState<Point>({ x: 0, y: 0 });
  useEffect(() => {
    function onMove(e: MouseEvent) {
      setPos({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  return pos;
}

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

// A bare pupil dot with no surrounding eyeball — used for the two simpler
// characters whose eyes are just dark dots directly on their body color.
function Pupil({
  mouse,
  size,
  maxDistance,
  pupilColor,
  forceLook,
}: {
  mouse: Point;
  size: number;
  maxDistance: number;
  pupilColor: string;
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
      className="rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: pupilColor,
        transform: `translate(${look.x}px, ${look.y}px)`,
        transition: "transform 0.1s ease-out",
      }}
    />
  );
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
}

export default function LoginCharacters({ isTyping, showPassword, passwordLength }: LoginCharactersProps) {
  const mouse = useMousePosition();
  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);

  const purpleBlinking = useBlink();
  const blackBlinking = useBlink();

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

  return (
    <div className="relative" style={{ width: 550, height: 400 }}>
      {/* Purple — tallest character, stands up taller while a typed
          password is hidden, as if peering over to check. */}
      <div
        ref={purpleRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: 70,
          width: 180,
          height: isTyping || isHidingPassword ? 440 : 400,
          backgroundColor: "#6C3FF5",
          borderRadius: "10px 10px 0 0",
          zIndex: 1,
          transform: passwordVisible
            ? "skewX(0deg)"
            : isTyping || isHidingPassword
              ? `skewX(${purple.bodySkew - 12}deg) translateX(40px)`
              : `skewX(${purple.bodySkew}deg)`,
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
                passwordVisible
                  ? { x: purplePeeking ? 4 : -4, y: purplePeeking ? 5 : -4 }
                  : lookingAtEachOther
                    ? { x: 3, y: 4 }
                    : undefined
              }
            />
          ))}
        </div>
      </div>

      {/* Black — leans toward purple while the username is being typed, as
          if the two are looking at each other. */}
      <div
        ref={blackRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: 240,
          width: 120,
          height: 310,
          backgroundColor: "#2D2D2D",
          borderRadius: "8px 8px 0 0",
          zIndex: 2,
          transform: passwordVisible
            ? "skewX(0deg)"
            : lookingAtEachOther
              ? `skewX(${black.bodySkew * 1.5 + 10}deg) translateX(20px)`
              : isTyping || isHidingPassword
                ? `skewX(${black.bodySkew * 1.5}deg)`
                : `skewX(${black.bodySkew}deg)`,
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
              forceLook={passwordVisible ? { x: -4, y: -4 } : lookingAtEachOther ? { x: 0, y: -4 } : undefined}
            />
          ))}
        </div>
      </div>

      {/* Orange — short rounded dome in front, plain dot eyes. */}
      <div
        ref={orangeRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: 0,
          width: 240,
          height: 200,
          zIndex: 3,
          backgroundColor: "#FF9B6B",
          borderRadius: "120px 120px 0 0",
          transform: passwordVisible ? "skewX(0deg)" : `skewX(${orange.bodySkew}deg)`,
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
            <Pupil
              key={i}
              mouse={mouse}
              size={12}
              maxDistance={5}
              pupilColor="#2D2D2D"
              forceLook={passwordVisible ? { x: -5, y: -4 } : undefined}
            />
          ))}
        </div>
      </div>

      {/* Yellow — has a little closed-mouth line in addition to eyes. */}
      <div
        ref={yellowRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: 310,
          width: 140,
          height: 230,
          backgroundColor: "#E8D754",
          borderRadius: "70px 70px 0 0",
          zIndex: 4,
          transform: passwordVisible ? "skewX(0deg)" : `skewX(${yellow.bodySkew}deg)`,
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
            <Pupil
              key={i}
              mouse={mouse}
              size={12}
              maxDistance={5}
              pupilColor="#2D2D2D"
              forceLook={passwordVisible ? { x: -5, y: -4 } : undefined}
            />
          ))}
        </div>
        <div
          className="absolute h-1 w-20 rounded-full bg-[#2D2D2D] transition-all duration-200 ease-out"
          style={{
            left: passwordVisible ? 10 : 40 + yellow.faceX,
            top: passwordVisible ? 88 : 88 + yellow.faceY,
          }}
        />
      </div>
    </div>
  );
}
