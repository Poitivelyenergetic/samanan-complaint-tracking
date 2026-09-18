// Next.js file convention (auto-loaded) — Sentry's client-side init. The
// DSN is safe to expose publicly (it's a write-only ingest endpoint, not a
// secret), so it's a plain NEXT_PUBLIC_ var rather than a Secret Manager
// entry. This runs alongside, not instead of, the Google Cloud Error
// Reporting pipeline in ErrorReporter.tsx/global-error.tsx — Sentry's own
// SDK auto-captures uncaught errors/rejections/render errors on its own,
// so nothing here needs to call it manually.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
