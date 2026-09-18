// Google Cloud Error Reporting — server-side errors are sent here from
// instrumentation.ts's onRequestError hook, and client-side errors are sent
// here (via /api/report-error) from the ErrorReporter component in the root
// layout. reportMode defaults to "production", so this silently no-ops in
// local dev instead of requiring Cloud credentials to be set up there. On
// Firebase App Hosting (Cloud Run) it authenticates via the backend's
// attached service account automatically — same as firebaseAdmin.ts's
// no-explicit-credentials fallback.
import { ErrorReporting } from "@google-cloud/error-reporting";

let client: ErrorReporting | undefined;

function getClient(): ErrorReporting {
  if (!client) {
    client = new ErrorReporting({
      // Without this, the library's own project-id auto-detection silently
      // fails on Cloud Run and every report gets sent to a literal,
      // unresolved "{{projectId}}" URL instead of the real project — every
      // event was rejected with "not a valid resource name" and nothing
      // ever showed up in the console. NEXT_PUBLIC_FIREBASE_PROJECT_ID is
      // already guaranteed present in every environment (see
      // apphosting.yaml/.env.local) and holds this exact same project ID.
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }
  return client;
}

// Matches @google-cloud/error-reporting's own (unexported) manual Request
// shape structurally, so it's accepted by report() without needing to reach
// into the package's internal module paths for the type.
interface RequestInfo {
  method?: string;
  url?: string;
  userAgent?: string;
}

export function reportServerError(error: unknown, request?: RequestInfo): void {
  const err = error instanceof Error ? error : new Error(String(error));
  getClient().report(err, request);
}
