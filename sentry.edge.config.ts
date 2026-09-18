// Loaded by instrumentation.ts's register() for the edge runtime (this
// app's i18n proxy/middleware runs there) — see instrumentation-client.ts's
// comment for why this runs alongside Google Cloud Error Reporting.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
});
