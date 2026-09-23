"use client";

import { useEffect, useState } from "react";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

// True once the user hasn't touched the mouse/keyboard/scroll for `idleMs` —
// flips back to false immediately on the next bit of activity, restarting
// the countdown.
export function useIdleTimer(idleMs: number): boolean {
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function reset() {
      setIsIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIsIdle(true), idleMs);
    }
    reset();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset));
    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [idleMs]);

  return isIdle;
}
