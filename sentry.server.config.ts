// Loaded by instrumentation.ts's register() for the Node.js runtime — see
// instrumentation-client.ts's comment for why this runs alongside (not
// instead of) Google Cloud Error Reporting.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
});
