import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { sendSignupVerificationEmail } from "@/lib/resend";

// Unauthenticated by design — this runs before an applicant has any account.
// Rate-limited per email address rather than per caller/IP, since that's the
// resource actually being protected (Resend's send quota, and the
// applicant's inbox).
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 45 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("emailVerificationCodes").doc(email);
  const snap = await ref.get();
  const now = Date.now();

  if (snap.exists) {
    const createdAt = snap.data()?.createdAt;
    if (typeof createdAt === "number" && now - createdAt < RESEND_COOLDOWN_MS) {
      return NextResponse.json({ error: "too_soon" }, { status: 429 });
    }
  }

  const code = generateCode();

  // Send before persisting: a failed send must not start the resend
  // cooldown (the applicant never received anything to wait out).
  try {
    await sendSignupVerificationEmail(email, code);
  } catch {
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  await ref.set({ code, createdAt: now, expiresAt: now + CODE_TTL_MS, attempts: 0, verified: false });

  return NextResponse.json({ ok: true });
}
