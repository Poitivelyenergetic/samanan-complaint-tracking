"use client";

import { useEffect, useRef } from "react";

const SCRIPT_SRC = "/assets/samnan-spinner/samnan-spinner.js";
const FRAMES = "/assets/samnan-spinner/frames";

interface SpinnerApi {
  mount: (el: HTMLElement, opts: { frames: string }) => { destroy: () => void } | null;
}

declare global {
  interface Window {
    SamnanSpinner?: SpinnerApi;
  }
}

// Shared across mounts so navigating back to the login page doesn't inject
// the script tag a second time.
let scriptPromise: Promise<SpinnerApi> | null = null;

function loadSpinner(): Promise<SpinnerApi> {
  if (window.SamnanSpinner) return Promise.resolve(window.SamnanSpinner);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () =>
        window.SamnanSpinner ? resolve(window.SamnanSpinner) : reject(new Error("spinner missing"));
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("spinner failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

// The drag-to-rotate 360° Samnan pump — 240 pre-rendered transparent frames
// (30 fps at its 8s-per-turn idle spin) driven by a tiny canvas script, which
// reads the frame layout from frames/manifest.json. It has to be mounted/destroyed explicitly
// here (rather than relying on the script's own data-attribute auto-mount)
// since React renders the element after the script's DOMContentLoaded pass,
// and an un-destroyed instance would leak its requestAnimationFrame loop.
export default function SamnanPumpSpinner({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let instance: { destroy: () => void } | null = null;
    let cancelled = false;
    loadSpinner()
      .then((api) => {
        if (cancelled || !ref.current) return;
        instance = api.mount(ref.current, { frames: FRAMES });
      })
      .catch(() => {
        // Purely decorative — if it fails to load, the panel just stays as it was.
      });
    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, []);

  // select-none: dragging to spin it would otherwise start a text selection
  // and the browser paints its pale highlight box over the whole canvas.
  return <div ref={ref} className={`select-none outline-none ${className}`} />;
}
