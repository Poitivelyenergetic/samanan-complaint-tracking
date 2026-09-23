"use client";

import { createPortal } from "react-dom";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { LOGIN_CHARACTER_COLORS } from "./LoginCharacters";

// How long the dashboard has to sit untouched before someone wanders across
// to wipe the dust off it — a small easter egg for a screen that's been
// left open, not a real "session idle" warning.
const IDLE_MS = 60_000;

export default function IdleDustWiper() {
  const isIdle = useIdleTimer(IDLE_MS);

  if (!isIdle || typeof document === "undefined") return null;

  // Portalled straight to <body> — PageTransition wraps every page's
  // content in a `transform`, which makes any `fixed` descendant of it
  // position relative to that wrapper instead of the viewport (a transformed
  // ancestor creates its own containing block for fixed elements). Nested
  // inside that, "bottom-0" landed at the bottom of the whole scrollable
  // page rather than the visible screen.
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <div className="animate-idle-walk-across absolute bottom-0">
        <div className="relative" style={{ width: 140, height: 150 }}>
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-2xl"
            style={{ width: 88, height: 128, backgroundColor: LOGIN_CHARACTER_COLORS.purple }}
          />
          <div className="absolute flex gap-3" style={{ left: "50%", top: 28, transform: "translateX(-50%)" }}>
            <div className="h-4 w-4 rounded-full bg-white" />
            <div className="h-4 w-4 rounded-full bg-white" />
          </div>
          {/* Wiping arm — a short forearm ending in a rag, swinging back and
              forth across whatever it's passing over. */}
          <div
            className="animate-idle-wipe absolute"
            style={{ left: 92, top: 52, transformOrigin: "0% 50%" }}
          >
            <svg width="72" height="30" viewBox="0 0 72 30" aria-hidden="true">
              <rect x="0" y="9" width="46" height="12" rx="6" fill={LOGIN_CHARACTER_COLORS.purple} />
              <circle cx="56" cy="15" r="16" fill="#eef1f8" stroke="#c7cede" strokeWidth="2" />
            </svg>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
