"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LOCALE_LABELS: Record<string, string> = {
  ar: "العربية",
  en: "English",
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("common");

  return (
    <div className="flex items-center gap-1" aria-label={t("language")}>
      {routing.locales.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => router.replace(pathname, { locale: loc })}
          className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
            loc === locale
              ? "bg-brand text-brand-foreground"
              : "text-foreground/70 hover:bg-black/5"
          }`}
          aria-current={loc === locale}
        >
          {LOCALE_LABELS[loc]}
        </button>
      ))}
    </div>
  );
}
