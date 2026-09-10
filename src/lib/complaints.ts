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
import type { Complaint, ComplaintHistoryEntry, ComplaintInput, PendingReassignment } from "./types";

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
    pendingReassignment: (data.pendingReassignment as PendingReassignment | undefined) ?? null,
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

// Only meaningful for a caller with complaints.acceptReassignment (or
// viewAll) — matches the canReadComplaint() branch in firestore.rules that
// grants them read access regardless of a complaint's current assignedTo,
// since they need to review reassignment requests across the whole org.
export function subscribeToPendingReassignments(
  callback: (complaints: Complaint[]) => void,
  onError?: (error: unknown) => void
) {
  const q = query(collection(db, COLLECTION), where("pendingReassignment", "!=", null));
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
  const ref = await addDoc(collection(db, COLLECTION), {
    ...input,
    history: initialHistory,
    notes: "",
    pendingReassignment: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
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

// Reassignment is a two-step, permission-separated flow:
//  1. requestReassignment() (complaints.reassign) proposes a new assignee —
//     it only sets `pendingReassignment`, `assignedTo` is untouched.
//  2. acceptReassignment() or rejectReassignment() (complaints.acceptReassignment)
//     resolves it — accepting is the point `assignedTo` actually changes.
// Each step logs its own history entry so the full trail (who proposed it,
// why, and who approved/rejected it) is visible on the complaint.

export async function requestReassignment(
  id: string,
  assignedTo: string | null,
  previousAssignedTo: string | null,
  byUid: string | null,
  reason: string
): Promise<void> {
  const pending: PendingReassignment = {
    assignedTo,
    reason,
    requestedBy: byUid,
    requestedAt: new Date().toISOString(),
  };
  await updateDoc(doc(db, COLLECTION, id), {
    pendingReassignment: pending,
    updatedAt: serverTimestamp(),
    history: arrayUnion({
      type: "reassignRequested",
      assignedTo,
      previousAssignedTo,
      reason,
      at: new Date().toISOString(),
      byUid,
    }),
  });
}

export async function acceptReassignment(
  id: string,
  pending: PendingReassignment,
  currentAssignedTo: string | null,
  byUid: string | null
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    assignedTo: pending.assignedTo,
    pendingReassignment: null,
    updatedAt: serverTimestamp(),
    history: arrayUnion({
      type: "reassignAccepted",
      assignedTo: pending.assignedTo,
      previousAssignedTo: currentAssignedTo,
      reason: pending.reason,
      at: new Date().toISOString(),
      byUid,
    }),
  });
}

export async function rejectReassignment(
  id: string,
  pending: PendingReassignment,
  currentAssignedTo: string | null,
  byUid: string | null
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    pendingReassignment: null,
    updatedAt: serverTimestamp(),
    history: arrayUnion({
      type: "reassignRejected",
      assignedTo: pending.assignedTo,
      previousAssignedTo: currentAssignedTo,
      reason: pending.reason,
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
