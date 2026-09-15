"use client";

import { usePathname } from "next/navigation";

// A brief fade + rise on every route change, driven entirely by CSS (see
// the .animate-page-enter keyframes in globals.css) rather than React
// state — remounting via `key={pathname}` restarts the animation on every
// navigation. The animation's own start delay (baked into the CSS) gives
// content a beat before it appears, since content that's already on screen
// the instant a page mounts would otherwise snap into place too fast to
// read as an animation at all.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-enter">
      {children}
    </div>
  );
}
