import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Complaint, ComplaintHistoryEntry, ComplaintInput } from "./types";

const COLLECTION = "complaints";
// Complaint IDs are sequential integers ("1", "2", "3", ...), not Firestore's
// default random doc IDs — see createComplaint(). counters/complaints holds
// the last-issued number; a transaction reads, increments, and uses it as
// the new doc's ID so concurrent creates never collide.
const COUNTER_REF = () => doc(db, "counters", "complaints");

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
    complaintTypeId: data.complaintTypeId ?? "",
    channel: data.channel ?? "staff",
    complaintSourceId: data.complaintSourceId ?? "",
    companyId: data.companyId ?? null,
    customerName: data.customerName ?? "",
    customerPhone: data.customerPhone ?? "",
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
    notes: data.notes ?? "",
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
    { type: "created", status: input.status, at: new Date().toISOString(), byUid: input.createdBy },
  ];
  const newId = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(COUNTER_REF());
    const next = (counterSnap.exists() ? (counterSnap.data().value as number) : 0) + 1;
    transaction.set(COUNTER_REF(), { value: next });
    transaction.set(doc(db, COLLECTION, String(next)), {
      ...input,
      history: initialHistory,
      notes: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return next;
  });
  return String(newId);
}

// `previousStatus` is whatever the caller already has loaded (the complaint
// being edited) — passed in rather than re-fetched so a status change can be
// appended to `history`. `statusNote` is required by the UI whenever the
// status actually changes (what the employee did) and is stored on that
// history entry. Reassignment is handled separately by reassignComplaint(),
// not through this general update.
export async function updateComplaint(
  id: string,
  updates: Partial<ComplaintInput>,
  previousStatus: string | null,
  byUid: string | null,
  statusNote?: string
): Promise<void> {
  const historyAppend: ComplaintHistoryEntry[] =
    updates.status && updates.status !== previousStatus
      ? [
          {
            type: "status",
            status: updates.status,
            ...(previousStatus ? { previousStatus: previousStatus as Complaint["status"] } : {}),
            ...(statusNote ? { note: statusNote } : {}),
            at: new Date().toISOString(),
            byUid,
          },
        ]
      : [];

  await updateDoc(doc(db, COLLECTION, id), {
    ...updates,
    updatedAt: serverTimestamp(),
    ...(historyAppend.length ? { history: arrayUnion(...historyAppend) } : {}),
  });
}

// Reassignment is direct — complaints.reassign moves the complaint
// immediately, logging one "reassigned" history entry with who did it and
// why. (There used to be a separate propose/approve flow; it's been
// removed — see the legacy history types in types.ts.)
export async function reassignComplaint(
  id: string,
  assignedTo: string | null,
  previousAssignedTo: string | null,
  byUid: string | null,
  reason: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    assignedTo,
    updatedAt: serverTimestamp(),
    history: arrayUnion({
      type: "reassigned",
      assignedTo,
      previousAssignedTo,
      reason,
      at: new Date().toISOString(),
      byUid,
    }),
  });
}

// A lightweight scratchpad field, separate from the formal edit form and
// history log — saving a note only requires complaints.view (or viewAll),
// not complaints.update, since it's meant to be usable by any staff member
// working a complaint even if they can't otherwise edit it. See
// isNotesOnlyWrite() in firestore.rules.
export async function updateComplaintNotes(id: string, notes: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    notes,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteComplaint(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
