// Next.js instrumentation hook (file-convention, auto-loaded) — reports
// every server-side rendering/route/action error to Google Cloud Error
// Reporting. See src/lib/errorReporting.ts for why this is safe to leave
// active in every environment (it only actually sends in production).
import { reportServerError } from "@/lib/errorReporting";

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string }
): Promise<void> {
  reportServerError(error, { method: request.method, url: request.path });
}
