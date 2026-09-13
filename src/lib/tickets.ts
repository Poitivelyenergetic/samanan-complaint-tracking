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
import type { Ticket, TicketHistoryEntry, TicketInput } from "./types";

const COLLECTION = "tickets";
// Same scheme as complaints — see counters/complaints in lib/complaints.ts.
const COUNTER_REF = () => doc(db, "counters", "tickets");

// The single Administration every ticket is locked to — the existing "IT
// Administartion" record (Firestore ID, not a name match, so a later rename
// of that record doesn't silently break routing). To point tickets at a
// different administration, replace this ID.
export const TICKET_ADMINISTRATION_ID = "leMoMH7aViBh7tSM0UtH";

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function fromDoc(id: string, data: DocumentData): Ticket {
  return {
    id,
    subject: data.subject ?? "",
    description: data.description ?? "",
    ticketTypeId: data.ticketTypeId ?? "",
    ticketSourceId: data.ticketSourceId ?? "",
    requesterName: data.requesterName ?? "",
    administrationId: data.administrationId ?? TICKET_ADMINISTRATION_ID,
    departmentId: data.departmentId ?? null,
    assignedTo: data.assignedTo ?? null,
    status: data.status ?? "Open",
    history: Array.isArray(data.history) ? (data.history as TicketHistoryEntry[]) : [],
    notes: data.notes ?? "",
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
  };
}

// Pass `scopeToUid` for a caller who only has tickets.view (not viewAll) —
// mirrors subscribeToComplaints' scoping, same firestore.rules reasoning.
export function subscribeToTickets(
  callback: (tickets: Ticket[]) => void,
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

// "My Tickets" — tickets the given employee either filed themselves or is
// currently assigned to handle. Firestore can't OR across two different
// fields in one query, so this runs two subscriptions and merges/dedupes
// the results client-side.
export function subscribeToMyTickets(
  uid: string,
  callback: (tickets: Ticket[]) => void,
  onError?: (error: unknown) => void
) {
  const byMe = new Map<string, Ticket>();
  const assignedToMe = new Map<string, Ticket>();

  function emit() {
    const merged = new Map<string, Ticket>([...byMe, ...assignedToMe]);
    callback([...merged.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
  }

  const unsubCreated = onSnapshot(
    query(collection(db, COLLECTION), where("createdBy", "==", uid)),
    (snap) => {
      byMe.clear();
      snap.docs.forEach((d) => byMe.set(d.id, fromDoc(d.id, d.data())));
      emit();
    },
    onError
  );
  const unsubAssigned = onSnapshot(
    query(collection(db, COLLECTION), where("assignedTo", "==", uid)),
    (snap) => {
      assignedToMe.clear();
      snap.docs.forEach((d) => assignedToMe.set(d.id, fromDoc(d.id, d.data())));
      emit();
    },
    onError
  );

  return () => {
    unsubCreated();
    unsubAssigned();
  };
}

export function subscribeToTicket(
  id: string,
  callback: (ticket: Ticket | null) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    doc(db, COLLECTION, id),
    (snap) => callback(snap.exists() ? fromDoc(snap.id, snap.data()) : null),
    onError
  );
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export async function createTicket(input: TicketInput): Promise<string> {
  const initialHistory: TicketHistoryEntry[] = [
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

// `previousStatus` / `statusNote` — see updateComplaint's equivalent
// comment in lib/complaints.ts; the same reasoning applies here.
export async function updateTicket(
  id: string,
  updates: Partial<TicketInput>,
  previousStatus: string | null,
  byUid: string | null,
  statusNote?: string
): Promise<void> {
  const historyAppend: TicketHistoryEntry[] =
    updates.status && updates.status !== previousStatus
      ? [
          {
            type: "status",
            status: updates.status,
            ...(previousStatus ? { previousStatus: previousStatus as Ticket["status"] } : {}),
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

// Reassignment (department/employee — administrationId is never part of
// this since it's always TICKET_ADMINISTRATION_ID) is direct, same as
// complaints — see reassignComplaint's comment.
export async function reassignTicket(
  id: string,
  departmentId: string | null,
  assignedTo: string | null,
  previousAssignedTo: string | null,
  byUid: string | null,
  reason: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    departmentId,
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

// Same scratchpad-notes model as complaints — see updateComplaintNotes.
export async function updateTicketNotes(id: string, notes: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    notes,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTicket(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
