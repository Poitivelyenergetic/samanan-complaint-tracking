import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
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
}

// Public — anyone can file a request. It holds no password; an admin turns
// an approved request into a real account via the Employees "New Employee"
// form, choosing the password themselves.
export async function createSignupRequest(input: SignupRequestInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...input,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  return ref.id;
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
