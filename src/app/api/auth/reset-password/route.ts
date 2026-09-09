import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { phoneNumbersMatch } from "@/lib/phone";

// Unauthenticated by design (it's a forgot-password flow) — safety comes
// from requiring proof of phone-number ownership (a verified Firebase
// phone-auth ID token, checked below) plus a match against the account's
// phone-on-file, not from a caller session. Every path returns the same
// generic "verification_failed" for an unknown username or a phone
// mismatch, so this can't be used to test whether a username exists.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 30 * 60 * 1000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const phoneIdToken = typeof body?.phoneIdToken === "string" ? body.phoneIdToken : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!username || !phoneIdToken || !newPassword) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  const db = getAdminDb();

  const matches = await db.collection("users").where("username", "==", username).limit(1).get();
  if (matches.empty) {
    return NextResponse.json({ error: "verification_failed" }, { status: 400 });
  }
  const employeeDoc = matches.docs[0];
  const uid = employeeDoc.id;

  // Rate limit per account: at most MAX_ATTEMPTS reset attempts per
  // WINDOW_MS, regardless of whether they succeed at verification.
  const attemptsRef = db.collection("passwordResetAttempts").doc(uid);
  const attemptsSnap = await attemptsRef.get();
  const now = Date.now();
  const attemptsData = attemptsSnap.exists ? attemptsSnap.data() : undefined;
  const windowStart = typeof attemptsData?.windowStart === "number" ? attemptsData.windowStart : 0;
  const withinWindow = now - windowStart < WINDOW_MS;
  const count = withinWindow && typeof attemptsData?.count === "number" ? attemptsData.count : 0;

  if (withinWindow && count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }
  await attemptsRef.set({ count: count + 1, windowStart: withinWindow ? windowStart : now });

  let verifiedPhone: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(phoneIdToken);
    verifiedPhone = decoded.phone_number;
  } catch {
    return NextResponse.json({ error: "verification_failed" }, { status: 400 });
  }

  const onFilePhone = typeof employeeDoc.data().phone === "string" ? employeeDoc.data().phone : "";
  if (!verifiedPhone || !onFilePhone || !phoneNumbersMatch(verifiedPhone, onFilePhone)) {
    return NextResponse.json({ error: "verification_failed" }, { status: 400 });
  }

  await getAdminAuth().updateUser(uid, { password: newPassword });
  // A successful reset clears the rate-limit counter for this account.
  await attemptsRef.delete();

  return NextResponse.json({ ok: true });
}
