import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  agentRules: false,
  // firebase-admin's auth module pulls in jwks-rsa -> jose, which trips
  // ERR_REQUIRE_ESM when Turbopack tries to bundle it for the serverless
  // function runtime. Keeping it external lets Node's own require handle it.
  serverExternalPackages: ["firebase-admin"],
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: "benin-q7",
  project: "samnan-complaint-tracking",
  silent: true,
  // No auth token configured yet, so source map upload is skipped at build
  // time — stack traces in Sentry will show minified code until one's
  // added (SENTRY_AUTH_TOKEN env var) and this is set to false.
  sourcemaps: { disable: true },
});
