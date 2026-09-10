"use client";

import { useTranslations } from "next-intl";
import { useTheme, type Theme } from "@/lib/theme-context";

const OPTIONS: { value: Theme; icon: React.ReactNode }[] = [
  {
    value: "light",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10 2v2M10 16v2M18 10h-2M4 10H2M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4M15.5 15.5l-1.4-1.4M5.9 5.9 4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: "dark",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
        <path
          d="M17 11.5A7 7 0 0 1 8.5 3 7 7 0 1 0 17 11.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    value: "system",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
        <rect x="2.5" y="4" width="15" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 17h6M10 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function ThemeToggle() {
  const t = useTranslations("theme");
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTheme(opt.value)}
          aria-label={t(opt.value)}
          aria-pressed={theme === opt.value}
          title={t(opt.value)}
          className={`rounded px-2 py-1.5 transition-colors ${
            theme === opt.value ? "bg-brand text-brand-foreground" : "text-foreground/50 hover:bg-black/5 hover:text-foreground"
          }`}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
