import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  onSnapshot,
  or,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Complaint, ComplaintCategory, ComplaintInput } from "./types";

const COLLECTION = "complaints";

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function fromDoc(id: string, data: DocumentData): Complaint {
  return {
    id,
    subject: data.subject ?? "",
    description: data.description ?? "",
    // Older, pre-public-intake documents have neither field — treat them as
    // staff-logged with the "Other" category rather than leaving gaps.
    category: data.category ?? "Other",
    channel: data.channel ?? "staff",
    customerNumber: data.customerNumber ?? "",
    customerOrderNumber: data.customerOrderNumber ?? "",
    complainantName: data.complainantName ?? null,
    contactEmail: data.contactEmail ?? null,
    contactPhone: data.contactPhone ?? null,
    attachmentUrl: data.attachmentUrl ?? null,
    assignedTo: data.assignedTo ?? null,
    status: data.status ?? "Open",
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
  };
}

export function subscribeToComplaints(
  callback: (complaints: Complaint[]) => void,
  onError?: (error: unknown) => void
) {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

// For the restricted "user" role: only complaints assigned to them or that
// they created themselves (matches the isOwnComplaint() check in
// firestore.rules). Sorted client-side rather than via orderBy, since an
// or() query can't be combined with a sort across the disjunction without
// its own composite index.
export function subscribeToOwnComplaints(
  uid: string,
  callback: (complaints: Complaint[]) => void,
  onError?: (error: unknown) => void
) {
  const q = query(
    collection(db, COLLECTION),
    or(where("assignedTo", "==", uid), where("createdBy", "==", uid))
  );
  return onSnapshot(
    q,
    (snap) => {
      const complaints = snap.docs.map((d) => fromDoc(d.id, d.data()));
      complaints.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(complaints);
    },
    onError
  );
}

export function subscribeToComplaint(
  id: string,
  callback: (complaint: Complaint | null) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    doc(db, COLLECTION, id),
    (snap) => callback(snap.exists() ? fromDoc(snap.id, snap.data()) : null),
    onError
  );
}

export async function getComplaint(id: string): Promise<Complaint | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export async function createComplaint(input: ComplaintInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export interface PublicComplaintInput {
  customerOrderNumber: string;
  complainantName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  category: ComplaintCategory;
  description: string;
  attachmentUrl: string | null;
}

// Used by the unauthenticated complaint intake form. The shape here must
// match `isValidPublicComplaint()` in firestore.rules exactly, since that
// rule is what actually enforces these values server-side — this function
// merely assembles the same document.
export async function createPublicComplaint(
  input: PublicComplaintInput
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    subject: input.category,
    description: input.description,
    category: input.category,
    channel: "public",
    customerNumber: input.contactPhone ?? input.contactEmail ?? "",
    customerOrderNumber: input.customerOrderNumber,
    complainantName: input.complainantName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    attachmentUrl: input.attachmentUrl,
    assignedTo: null,
    status: "Open",
    createdBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateComplaint(
  id: string,
  updates: Partial<ComplaintInput>
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteComplaint(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
