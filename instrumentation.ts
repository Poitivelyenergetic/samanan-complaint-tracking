// Next.js instrumentation hook (file-convention, auto-loaded). register()
// loads Sentry's per-runtime config; onRequestError reports every
// server-side rendering/route/action error to both Google Cloud Error
// Reporting and Sentry. See src/lib/errorReporting.ts for why it's safe to
// leave the Cloud Error Reporting side active in every environment (it
// only actually sends in production).
import * as Sentry from "@sentry/nextjs";
import { reportServerError } from "@/lib/errorReporting";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: Parameters<typeof Sentry.captureRequestError>[2]
): Promise<void> {
  reportServerError(error, { method: request.method, url: request.path });
  Sentry.captureRequestError(error, request, context);
}
