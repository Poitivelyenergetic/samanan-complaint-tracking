import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { phoneNumbersMatch } from "@/lib/phone";

// Unauthenticated by design — this runs before an applicant has any
// account. This is the ONLY path that may create a signupRequests doc (see
// firestore.rules, where direct client writes are rejected outright) so
// that contactVerified can never be a client-supplied boolean: it is only
// ever set true here, after this route has independently confirmed the
// contact was actually verified.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const contact = typeof body?.contact === "string" ? body.contact.trim() : "";
  const position = typeof body?.position === "string" ? body.position.trim() : "";
  const administration = typeof body?.administration === "string" ? body.administration.trim() : "";
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
  const phoneIdToken = typeof body?.phoneIdToken === "string" ? body.phoneIdToken : "";

  if (!name || !username || !contact || !position || !administration) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const db = getAdminDb();
  const isEmail = contact.includes("@");

  if (isEmail) {
    // The email path's proof of verification is the emailVerificationCodes
    // doc that /api/signup/verify-email-code marks verified:true — consume
    // it (delete) so it can't be replayed into a second signup request.
    const emailKey = contact.toLowerCase();
    const ref = db.collection("emailVerificationCodes").doc(emailKey);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.verified !== true) {
      return NextResponse.json({ error: "not_verified" }, { status: 400 });
    }
    await ref.delete().catch(() => undefined);
  } else {
    // The phone path's proof of verification is a real Firebase Auth ID
    // token minted by the confirmed phone sign-in on the client's throwaway
    // app — verify it server-side and check the phone number it attests to
    // actually matches what was submitted, rather than trusting the client.
    if (!phoneIdToken) {
      return NextResponse.json({ error: "not_verified" }, { status: 400 });
    }
    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(phoneIdToken);
    } catch {
      return NextResponse.json({ error: "not_verified" }, { status: 400 });
    }
    if (!decoded.phone_number || !phoneNumbersMatch(decoded.phone_number, contact)) {
      return NextResponse.json({ error: "not_verified" }, { status: 400 });
    }
    // This throwaway phone-auth user is never reused — the real employee
    // account is a separate email/password account created on approval —
    // so clean it up instead of leaving an orphaned Auth account behind.
    await getAdminAuth().deleteUser(decoded.uid).catch(() => undefined);
  }

  const ref = await db.collection("signupRequests").add({
    name,
    username,
    contact,
    contactVerified: true,
    position,
    administration,
    note,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: ref.id }, { status: 201 });
}
