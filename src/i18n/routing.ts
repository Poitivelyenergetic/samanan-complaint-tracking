import { defineRouting } from "next-intl/routing";

// Change DEFAULT_LOCALE to "en" to make English the default instead of Arabic.
export const DEFAULT_LOCALE = "ar" as const;

export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
