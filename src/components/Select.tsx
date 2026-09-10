"use client";

import { forwardRef, useState, type SelectHTMLAttributes } from "react";
import { IconChevronDown } from "./icons";

// A native <select> (kept for accessibility/mobile keyboard support) with a
// chevron that flips direction on open/close — used everywhere a plain
// dropdown appears across the app, matching the sidebar's collapsible groups.
const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = "", onFocus, onBlur, children, ...props },
  ref
) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block w-full">
      <select
        ref={ref}
        {...props}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          onBlur?.(e);
        }}
        className={`appearance-none pe-8 ${className}`}
      >
        {children}
      </select>
      <IconChevronDown
        className={`pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-foreground/50 transition-transform duration-200 ${
          open ? "rotate-180" : ""
        }`}
      />
    </div>
  );
});

export default Select;
