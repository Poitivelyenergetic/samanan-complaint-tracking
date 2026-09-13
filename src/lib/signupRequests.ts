import {
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { SignupRequest } from "./types";

const COLLECTION = "signupRequests";

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function fromDoc(id: string, data: DocumentData): SignupRequest {
  return {
    id,
    name: data.name ?? "",
    username: data.username ?? "",
    contact: data.contact ?? "",
    contactVerified: data.contactVerified ?? false,
    position: data.position ?? "",
    administration: data.administration ?? "",
    note: data.note ?? null,
    status: data.status ?? "pending",
    createdAt: toIso(data.createdAt),
  };
}

export interface SignupRequestInput {
  name: string;
  username: string;
  contact: string;
  position: string;
  administration: string;
  note: string | null;
  // Only for the phone verification path — the ID token from the just-
  // confirmed Firebase phone sign-in, checked server-side. Omitted for the
  // email path, which is checked server-side against
  // emailVerificationCodes instead.
  phoneIdToken?: string;
}

// Public — anyone can file a request. It holds no password; an admin turns
// an approved request into a real account via the Employees "New Employee"
// form, choosing the password themselves.
//
// Goes through /api/signup/create (Admin SDK) rather than a direct
// Firestore write — see the comment on the signupRequests match block in
// firestore.rules for why contactVerified can never be trusted from the
// client.
export async function createSignupRequest(input: SignupRequestInput): Promise<string> {
  const res = await fetch("/api/signup/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "request_failed");
  }
  return data.id as string;
}

export function subscribeToPendingSignupRequests(
  callback: (requests: SignupRequest[]) => void,
  onError?: (error: unknown) => void
) {
  const q = query(
    collection(db, COLLECTION),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function getSignupRequest(id: string): Promise<SignupRequest | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export async function markSignupRequestApproved(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { status: "approved" });
}

export async function rejectSignupRequest(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
