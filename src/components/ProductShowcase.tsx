"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import SamnanPumpSpinner from "./SamnanPumpSpinner";

// Samnan's products as live 3D models (drawn in the browser from the Blender
// models, via src/lib/samnan-3d.js): drag to spin, drag up or down to flip
// it all the way over, double-click to pull it apart.
//
// `v` is a hash of each file's contents. The models get updated in place
// under the same name, so it's in the URL to make sure nobody keeps an old
// copy — change it whenever a model file changes.
const PRODUCTS = [
  { key: "pump", name: "Star-high pump", file: "pump.glb", v: "ccec16bf" },
  { key: "coway18", name: "Coway-18", file: "coway18.glb", v: "74548c04" },
  { key: "coway6330", name: "Coway-6330", file: "coway6330.glb", v: "2c272ea9" },
  { key: "filter7", name: "7-stage water filter", file: "filter7.glb", v: "6f61a9dc" },
] as const;

type ProductKey = (typeof PRODUCTS)[number]["key"];
const productFor = (key: ProductKey) => PRODUCTS.find((p) => p.key === key)!;
const modelUrl = (key: ProductKey) => {
  const p = productFor(key);
  return `/assets/samnan-3d/${p.file}?v=${p.v}`;
};

// The main product changes by itself this often — but never while someone's
// using it, and not until this long after they last touched it.
const SWITCH_MS = 30_000;

// The big one and its stack are for the login page's illustration panel,
// which only shows from Tailwind's md breakpoint up; phones get just the
// pump. Each only sets up its 3D viewers on screens where it can be seen —
// a hidden one would still hold a WebGL context.
const WIDE = "(min-width: 48rem)";
function useWide() {
  return useSyncExternalStore(
    (changed) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", changed);
      return () => query.removeEventListener("change", changed);
    },
    () => window.matchMedia(WIDE).matches,
    () => false
  );
}

// Notes the time something happened to the big one (it was touched, or it
// changed).
const stamp = (ref: { current: number }) => {
  ref.current = Date.now();
};

interface ViewerState {
  dragging?: boolean;
  exploded?: boolean;
  focus?: string | null;
  fallback?: boolean;
}

interface Viewer {
  state: () => ViewerState;
  destroy: () => void;
}

// One live 3D model in a box. The viewer is loaded only on the client, only
// when it's needed, and waits until the box is on screen and has a size
// before downloading anything.
export function Product3D({
  product,
  interactive = true,
  maxPixelRatio,
  className = "",
  onViewer,
  onReady,
  onFallback,
}: {
  product: ProductKey;
  interactive?: boolean;
  maxPixelRatio?: number;
  className?: string;
  onViewer?: (viewer: Viewer | null) => void;
  onReady?: () => void;
  onFallback?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Kept current without making the viewer remount when they change.
  const callbacks = useRef({ onViewer, onReady, onFallback });
  useEffect(() => {
    callbacks.current = { onViewer, onReady, onFallback };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let viewer: Viewer | null = null;
    let cancelled = false;
    const ready = () => callbacks.current.onReady?.();
    const fallback = () => callbacks.current.onFallback?.();
    el.addEventListener("samnan-3d:ready", ready);
    el.addEventListener("samnan-3d:fallback", fallback);
    import("@/lib/samnan-3d.js")
      .then(({ mount }) => {
        if (cancelled) return;
        viewer = mount(el, { model: modelUrl(product), interactive, ...(maxPixelRatio ? { maxPixelRatio } : {}) }) as Viewer;
        callbacks.current.onViewer?.(viewer);
      })
      .catch(() => fallback());
    return () => {
      cancelled = true;
      el.removeEventListener("samnan-3d:ready", ready);
      el.removeEventListener("samnan-3d:fallback", fallback);
      // destroy() lets go of the WebGL context straight away — the main one
      // is swapped every 30 s, and leftover contexts would pile up.
      viewer?.destroy();
      callbacks.current.onViewer?.(null);
    };
  }, [product, interactive, maxPixelRatio]);

  // Only the one you can play with takes keyboard focus (the viewer's arrow
  // keys); a thumbnail is just a picture inside its button.
  return (
    <div
      ref={ref}
      aria-label={productFor(product).name}
      tabIndex={interactive ? 0 : -1}
      className={`select-none outline-none ${className}`}
    />
  );
}

// Just the pump, on its own — for phones, where there's no room for the
// rest (and no auto-switching). The photo spinner if there's no WebGL.
export function PumpOnly({ className }: { className: string }) {
  const wide = useWide();
  const [noWebGL, setNoWebGL] = useState(false);
  if (wide) return null;
  if (noWebGL) return <SamnanPumpSpinner className={className} />;
  return <Product3D product="pump" className={className} onFallback={() => setNoWebGL(true)} />;
}

// The login page's products: one big, which you can play with, and the
// other three small in a stack in the corner — tap one to make it the big
// one. Every 30 s the next one comes up by itself.
export default function ProductShowcase({ mainClassName, stackClassName }: { mainClassName: string; stackClassName: string }) {
  const wide = useWide();
  // The big one first, then the stack, top to bottom.
  const [order, setOrder] = useState<ProductKey[]>(() => PRODUCTS.map((p) => p.key));
  const [shown, setShown] = useState(false);
  const [noWebGL, setNoWebGL] = useState(false);
  const viewer = useRef<Viewer | null>(null);
  // When someone last touched the big one, or it last changed.
  const lastTouch = useRef(0);
  const main = order[0];

  useEffect(() => {
    if (!wide) return;
    stamp(lastTouch);
    const timer = setInterval(() => {
      // Never out from under someone: not while they're turning it, have it
      // pulled apart, or are looking at one of its parts — and the 30 s only
      // start once they've let go.
      const s = viewer.current?.state();
      if (s?.dragging || s?.exploded || s?.focus) {
        stamp(lastTouch);
        return;
      }
      if (Date.now() - lastTouch.current < SWITCH_MS) return;
      stamp(lastTouch);
      // The next one up comes down to be the big one; the old big one goes
      // to the bottom of the stack.
      setShown(false);
      setOrder((o) => [...o.slice(1), o[0]]);
    }, 1000);
    return () => clearInterval(timer);
  }, [wide]);

  // Tapping one in the stack swaps it with the big one.
  const choose = (key: ProductKey) => {
    stamp(lastTouch);
    setShown(false);
    setOrder((o) => {
      const next = [...o];
      const i = next.indexOf(key);
      [next[0], next[i]] = [next[i], next[0]];
      return next;
    });
  };
  const touched = () => stamp(lastTouch);

  if (!wide) return null;
  // No WebGL at all: the pump's photo spinner instead, on its own.
  if (noWebGL) return <SamnanPumpSpinner className={mainClassName} />;

  return (
    <>
      <div className={mainClassName} onPointerDown={touched} onPointerMove={touched} onKeyDown={touched}>
        {/* Fades in as each new one arrives, rather than popping in. */}
        <div className="h-full w-full transition-opacity duration-500 ease-out" style={{ opacity: shown ? 1 : 0 }}>
          <Product3D
            key={main}
            product={main}
            className="h-full w-full"
            onViewer={(v) => (viewer.current = v)}
            onReady={() => setShown(true)}
            onFallback={() => setNoWebGL(true)}
          />
        </div>
      </div>
      <div className={stackClassName}>
        {order.slice(1).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => choose(key)}
            title={productFor(key).name}
            aria-label={productFor(key).name}
            className="h-[72px] w-[72px] cursor-pointer rounded-full bg-white/70 shadow-sm ring-1 ring-[#d7dce6] transition-transform duration-200 ease-out hover:scale-110 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Product3D product={key} interactive={false} maxPixelRatio={1.5} className="pointer-events-none h-full w-full" />
          </button>
        ))}
      </div>
    </>
  );
}
