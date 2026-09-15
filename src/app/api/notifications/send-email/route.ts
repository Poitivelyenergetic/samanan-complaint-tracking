import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAuth, ApiAuthError } from "@/lib/api-auth";
import { sendNotificationEmail } from "@/lib/resend";

// Called (best-effort, fire-and-forget) right after a complaint/ticket
// assignment or status change succeeds, to also email the affected
// employee if they have a real address on file. Any signed-in staff member
// may call this — the actual authorization already happened on the
// Firestore write that triggered it; this route only decides whether an
// email address exists to send to.
export async function POST(request: Request) {
  try {
    await requireAuth(request);
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = (await request.json()) as {
    targetUid?: string;
    subject?: string;
    heading?: string;
    text?: string;
    link?: string;
  };
  const { targetUid, subject, heading, text, link } = body;
  if (!targetUid || !subject || !heading || !text || !link) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const snap = await getAdminDb().collection("users").doc(targetUid).get();
  const email = snap.exists ? (snap.data()?.email as string | null | undefined) : null;
  if (!email) {
    // No address on file — not an error, just nothing to do.
    return NextResponse.json({ sent: false });
  }

  try {
    await sendNotificationEmail(email, subject, heading, text, link);
  } catch {
    // Best-effort — a failed email should never surface as a user-facing
    // error for what is otherwise a successful assignment/status change.
    return NextResponse.json({ sent: false });
  }

  return NextResponse.json({ sent: true });
}
