import { NextResponse } from "next/server";
import { reportServerError } from "@/lib/errorReporting";

// Unauthenticated by design — a client-side crash can happen on any page,
// including the public login/signup flow, before there's any session to
// authenticate with. Called (fire-and-forget) by ErrorReporter and
// global-error.tsx whenever the browser catches an error React's own
// error boundaries didn't already handle.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.slice(0, 2000) : "Unknown client error";
  const stack = typeof body?.stack === "string" ? body.stack.slice(0, 8000) : undefined;
  const url = typeof body?.url === "string" ? body.url.slice(0, 500) : undefined;

  const error = new Error(message);
  if (stack) error.stack = stack;
  reportServerError(error, {
    url,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
