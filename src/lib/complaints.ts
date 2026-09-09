import {
  addDoc,
  arrayUnion,
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
import type { Complaint, ComplaintCategory, ComplaintHistoryEntry, ComplaintInput } from "./types";

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
    // Existing complaints predating the Source field default to "Website"
    // (matches the one-time migration for historical data).
    source: data.source ?? "Website",
    customerId: data.customerId ?? null,
    customerNumber: data.customerNumber ?? "",
    customerOrderNumber: data.customerOrderNumber ?? "",
    complainantName: data.complainantName ?? null,
    contactEmail: data.contactEmail ?? null,
    contactPhone: data.contactPhone ?? null,
    attachmentUrl: data.attachmentUrl ?? null,
    assignedTo: data.assignedTo ?? null,
    status: data.status ?? "Open",
    // Complaints predating history tracking have none — treat as empty
    // rather than throwing.
    history: Array.isArray(data.history) ? (data.history as ComplaintHistoryEntry[]) : [],
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
  };
}

// Pass `scopeToUid` for a caller who only has complaints.view (not viewAll)
// — firestore.rules requires the query itself to be constrained to that
// uid's own assigned complaints, since Firestore denies (rather than
// silently filters) a list query that could return a document the rule
// would reject.
export function subscribeToComplaints(
  callback: (complaints: Complaint[]) => void,
  onError?: (error: unknown) => void,
  scopeToUid?: string
) {
  const q = scopeToUid
    ? query(collection(db, COLLECTION), where("assignedTo", "==", scopeToUid), orderBy("createdAt", "desc"))
    : query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
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
  const initialHistory: ComplaintHistoryEntry[] = [
    { type: "status", status: input.status, at: new Date().toISOString(), byUid: input.createdBy },
  ];
  const ref = await addDoc(collection(db, COLLECTION), {
    ...input,
    history: initialHistory,
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
    // Every public submission comes in through the website — there's no
    // dropdown for it here, unlike the staff-side form.
    source: "Website",
    customerId: null,
    customerNumber: input.contactPhone ?? input.contactEmail ?? "",
    customerOrderNumber: input.customerOrderNumber,
    complainantName: input.complainantName,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    attachmentUrl: input.attachmentUrl,
    assignedTo: null,
    status: "Open",
    history: [{ type: "status", status: "Open", at: new Date().toISOString(), byUid: null }],
    createdBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// `previousStatus` is whatever the caller already has loaded (the complaint
// being edited) — passed in rather than re-fetched so a status change can be
// appended to `history`. Reassignment is handled separately by
// reassignComplaint(), not through this general update.
export async function updateComplaint(
  id: string,
  updates: Partial<ComplaintInput>,
  previousStatus: string | null,
  byUid: string | null
): Promise<void> {
  const historyAppend: ComplaintHistoryEntry[] =
    updates.status && updates.status !== previousStatus
      ? [{ type: "status", status: updates.status, at: new Date().toISOString(), byUid }]
      : [];

  await updateDoc(doc(db, COLLECTION, id), {
    ...updates,
    updatedAt: serverTimestamp(),
    ...(historyAppend.length ? { history: arrayUnion(...historyAppend) } : {}),
  });
}

// The dedicated Reassign action — separate from updateComplaint so that
// reassigning always logs a "reassigned" history entry, and so the
// complaints.reassign permission gate has one clear call site.
export async function reassignComplaint(
  id: string,
  assignedTo: string | null,
  byUid: string | null
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    assignedTo,
    updatedAt: serverTimestamp(),
    history: arrayUnion({ type: "reassigned", assignedTo, at: new Date().toISOString(), byUid }),
  });
}

export async function deleteComplaint(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
