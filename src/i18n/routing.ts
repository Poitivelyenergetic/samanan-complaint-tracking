import { defineRouting } from "next-intl/routing";

// Change DEFAULT_LOCALE to "en" to make English the default instead of Arabic.
export const DEFAULT_LOCALE = "ar" as const;

export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  // Always default to DEFAULT_LOCALE instead of sniffing the browser's
  // Accept-Language header. Staff can still switch languages explicitly
  // via the language switcher; that choice is remembered via the locale
  // cookie next-intl sets on navigation.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
