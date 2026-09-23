"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// Flags are real SVGs from the MIT-licensed flag-icons set
// (https://github.com/lipis/flag-icons) — flag emoji don't render as flags
// on Windows, only as the two letters "SA" / "GB".
const LOCALES: Record<string, { label: string; flag: string }> = {
  ar: { label: "العربية", flag: "/flags/sa.svg" },
  en: { label: "English", flag: "/flags/gb.svg" },
};

/**
 * Each language is its flag with the name underneath. `onLight` is for
 * pages whose panel is always white regardless of theme (the staff login) —
 * the theme's own text color turns near-white in dark mode, which left the
 * unselected language invisible there.
 */
export default function LanguageSwitcher({ compact = false, onLight = false }: { compact?: boolean; onLight?: boolean }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("common");

  return (
    <div
      className={`flex items-center ${compact ? "gap-0.5 rounded-md border border-border bg-background p-0.5" : "gap-1.5"}`}
      aria-label={t("language")}
    >
      {routing.locales.map((loc) => {
        const active = loc === locale;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => router.replace(pathname, { locale: loc })}
            className={`flex flex-col items-center font-medium leading-none transition-colors ${
              compact ? "gap-0.5 rounded px-1.5 py-1 text-[10px]" : "gap-1 rounded-lg px-2.5 py-1.5 text-xs"
            } ${
              active
                ? "bg-brand/10 text-brand ring-1 ring-brand"
                : onLight
                  ? "text-[#4b5563] hover:bg-black/5"
                  : "text-foreground/70 hover:bg-foreground/10"
            }`}
            aria-current={active}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOCALES[loc].flag}
              alt=""
              className={`${compact ? "h-3 w-4" : "h-4 w-[22px]"} rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.12)]`}
            />
            {LOCALES[loc].label}
          </button>
        );
      })}
    </div>
  );
}
