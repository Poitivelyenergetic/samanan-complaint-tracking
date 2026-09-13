import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Without an explicit timeZone, next-intl locks formatting to whatever
    // timezone the server happens to run in (Firebase App Hosting runs in
    // UTC) to keep server/client hydration consistent — so every date/time
    // in the app, including the complaint history log, was rendering hours
    // off from the actual local time. Gulf timezones don't observe DST, so
    // this is correct year-round.
    timeZone: "Asia/Riyadh",
  };
});
