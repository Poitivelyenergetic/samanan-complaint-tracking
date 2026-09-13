import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!email || !code) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("emailVerificationCodes").doc(email);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : undefined;

  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 400 });
  }
  if (typeof data.expiresAt === "number" && Date.now() > data.expiresAt) {
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }
  const attempts = typeof data.attempts === "number" ? data.attempts : 0;
  if (attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  if (data.code !== code) {
    await ref.update({ attempts: attempts + 1 });
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  await ref.update({ verified: true, verifiedAt: Date.now() });
  return NextResponse.json({ ok: true });
}
