import { NextResponse } from "next/server";
import { Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ApiAuthError, requirePermission } from "@/lib/api-auth";
import { fullNameKey, fullPhoneKey, nameSpellings, phoneSpellings } from "@/lib/phoneLookup";

// Anyone who can see complaints can look one up by the customer's full
// phone number or full name — even one that isn't theirs — to read it
// (never change it), so the same complaint doesn't get filed again. Two
// ways in: { phone } (the number or the name) lists every complaint on it;
// { phone, id } gives back just that one, if it really is on it.
export async function POST(request: Request) {
  try {
    await requirePermission(request, "complaints", "view");
    const body = await request.json().catch(() => null);
    const term = typeof body?.phone === "string" ? body.phone.slice(0, 120) : "";
    const phone = fullPhoneKey(term);
    const name = phone ? null : fullNameKey(term);
    if (!phone && !name) return NextResponse.json({ error: "full_phone_or_name_required" }, { status: 400 });
    const key = phone ? { phone } : { name: name!, spellings: nameSpellings(term) };
    const db = getAdminDb();

    if (typeof body?.id === "string" && body.id) {
      const snap = await db.collection("complaints").doc(body.id.slice(0, 40)).get();
      const data = snap.data();
      if (!data || !matches(data, key)) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ complaint: serialize(snap.id, data) });
    }

    return NextResponse.json({ complaints: await find(db, key) });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

type Key = { phone: string } | { name: string; spellings: string[] };

// The customer's number (or name), or — for a complaint the customer sent
// in themselves — the phone they left to be contacted on (or their name).
function matches(data: DocumentData, key: Key) {
  if ("phone" in key) return [data.customerPhone, data.contactPhone].some((p) => typeof p === "string" && fullPhoneKey(p) === key.phone);
  return [data.customerName, data.complainantName].some((n) => typeof n === "string" && fullNameKey(n) === key.name);
}

async function find(db: Firestore, key: Key) {
  const spellings = "phone" in key ? phoneSpellings(key.phone) : key.spellings;
  const fields = "phone" in key ? ["customerPhone", "contactPhone"] : ["customerName", "complainantName"];
  const chunks: string[][] = [];
  for (let i = 0; i < spellings.length; i += 30) chunks.push(spellings.slice(i, i + 30));
  const snaps = await Promise.all(fields.flatMap((field) => chunks.map((c) => db.collection("complaints").where(field, "in", c).get())));
  const byId = new Map<string, ReturnType<typeof serialize>>();
  for (const snap of snaps) for (const d of snap.docs) byId.set(d.id, serialize(d.id, d.data()));
  return [...byId.values()].sort((a, b) => (String(a.createdAt) < String(b.createdAt) ? 1 : -1));
}

// Timestamps as ISO strings, the same as the browser's own complaint reads
// turn them into (see fromDoc() in lib/complaints.ts).
function serialize(id: string, data: DocumentData) {
  const out: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(data)) out[k] = v instanceof Timestamp ? v.toDate().toISOString() : v;
  return out;
}
