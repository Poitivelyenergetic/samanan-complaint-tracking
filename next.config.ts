import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  agentRules: false,
  // firebase-admin's auth module pulls in jwks-rsa -> jose, which trips
  // ERR_REQUIRE_ESM when Turbopack tries to bundle it for the serverless
  // function runtime. Keeping it external lets Node's own require handle it.
  serverExternalPackages: ["firebase-admin"],
};

export default withNextIntl(nextConfig);
