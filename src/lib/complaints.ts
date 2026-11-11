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
import { auth, db } from "./firebase";
import { resolveServerNowIso } from "./serverTime";
import { notifyByEmail } from "./notify";
import type { Complaint, ComplaintHistoryEntry, ComplaintInput, OrderDuplicate } from "./types";

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
    attachmentUrls: Array.isArray(data.attachmentUrls) ? (data.attachmentUrls as string[]) : [],
    assignedTo: data.assignedTo ?? null,
    status: data.status ?? "Open",
    // Complaints predating history tracking have none — treat as empty
    // rather than throwing.
    history: Array.isArray(data.history) ? (data.history as ComplaintHistoryEntry[]) : [],
    notes: data.notes ?? "",
    everAssignedTo: Array.isArray(data.everAssignedTo) ? (data.everAssignedTo as string[]) : [],
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: data.createdBy ?? null,
  };
}

// Pass `scopeToUid` for a caller who only has complaints.view (not viewAll)
// — firestore.rules requires the query itself to be constrained to that
// uid's own assigned complaints, since Firestore denies (rather than
// silently filters) a list query that could return a document the rule
// would reject. That scoped query deliberately has no orderBy — combining
// it with the equality filter above made the whole list request fail with
// permission-denied (not a missing-index error) even though the rule
// itself allows exactly this query shape; sorting is done client-side
// below instead.
export function subscribeToComplaints(
  callback: (complaints: Complaint[]) => void,
  onError?: (error: unknown) => void,
  scopeToUid?: string
) {
  if (!scopeToUid) {
    return onSnapshot(
      query(collection(db, COLLECTION), orderBy("createdAt", "desc")),
      (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
      onError
    );
  }
  // Someone's own: assigned to them, and the ones they filed themselves —
  // two queries (Firestore can't "or" these under the read rule), merged.
  const parts: (Complaint[] | null)[] = [null, null];
  const send = () => {
    if (!parts[0] || !parts[1]) return;
    const byId = new Map<string, Complaint>();
    [...parts[0], ...parts[1]].forEach((c) => byId.set(c.id, c));
    callback([...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
  };
  const unsubs = (["assignedTo", "createdBy"] as const).map((field, i) =>
    onSnapshot(
      query(collection(db, COLLECTION), where(field, "==", scopeToUid)),
      (snap) => {
        parts[i] = snap.docs.map((d) => fromDoc(d.id, d.data()));
        send();
      },
      (error) => {
        // Never let the ones they filed hide the ones assigned to them.
        if (i === 1) {
          parts[1] = [];
          send();
        } else onError?.(error);
      }
    )
  );
  return () => unsubs.forEach((u) => u());
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

// Every complaint already filed against this customer order number, newest
// first — for warning someone about to log another one. Asked of the server
// (see /api/complaints/order-duplicates), so it works for anyone who can file
// a complaint, not only those who can read everyone's.
export async function findOrderDuplicates(orderNumber: string): Promise<OrderDuplicate[]> {
  const value = orderNumber.trim();
  if (!value) return [];
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("not_authenticated");
  const res = await fetch("/api/complaints/order-duplicates", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ orderNumber: value }),
  });
  if (!res.ok) throw new Error(`order_check_failed_${res.status}`);
  return ((await res.json()) as { complaints: OrderDuplicate[] }).complaints;
}

// Other people's complaints, found by the customer's full phone number or name (see
// /api/complaints/by-phone) — to read, never to change. The number each one
// was found by is remembered on this browser, so opening it can ask the
// server for it again (the browser itself isn't allowed to read it).
const PHONE_LOOKUPS = "samnan.phoneLookups";

async function askByPhone(body: { phone: string; id?: string }): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("not_authenticated");
  return fetch("/api/complaints/by-phone", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function readPhoneLookups(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PHONE_LOOKUPS) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export async function findComplaintsByPhone(phone: string): Promise<Complaint[]> {
  const res = await askByPhone({ phone });
  if (!res.ok) throw new Error(`phone_lookup_failed_${res.status}`);
  const found = ((await res.json()) as { complaints: (DocumentData & { id: string })[] }).complaints.map((c) => fromDoc(c.id, c));
  try {
    const lookups = readPhoneLookups();
    found.forEach((c) => (lookups[c.id] = phone));
    localStorage.setItem(PHONE_LOOKUPS, JSON.stringify(lookups));
  } catch {}
  return found;
}

// A complaint this browser found by phone number, fetched again — or null if
// it wasn't, or its number has since changed.
export async function getComplaintByPhone(id: string): Promise<Complaint | null> {
  const phone = readPhoneLookups()[id];
  if (!phone) return null;
  const res = await askByPhone({ phone, id });
  if (!res.ok) return null;
  const { complaint } = (await res.json()) as { complaint: DocumentData & { id: string } };
  return fromDoc(complaint.id, complaint);
}

export async function createComplaint(input: ComplaintInput): Promise<string> {
  const newId = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(COUNTER_REF());
    const next = (counterSnap.exists() ? (counterSnap.data().value as number) : 0) + 1;
    transaction.set(COUNTER_REF(), { value: next });
    transaction.set(doc(db, COLLECTION, String(next)), {
      ...input,
      history: [],
      notes: "",
      everAssignedTo: input.assignedTo ? [input.assignedTo] : [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return next;
  });
  const id = String(newId);
  // history can't hold serverTimestamp() directly (see serverTime.ts) —
  // resolve one now that the doc exists, then append the "created" entry.
  const at = await resolveServerNowIso(COLLECTION, id);
  await updateDoc(doc(db, COLLECTION, id), {
    history: arrayUnion({ type: "created", status: input.status, at, byUid: input.createdBy }),
  });

  if (input.assignedTo) {
    notifyByEmail(
      input.assignedTo,
      `You were assigned complaint #${id}`,
      "New complaint assigned to you",
      `A new complaint, #${id}, has been assigned to you.`,
      `/complaints/${id}`
    );
  }
  return id;
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
  statusNote?: string,
  statusAttachmentUrls?: string[]
): Promise<void> {
  const historyAppend: ComplaintHistoryEntry[] =
    updates.status && updates.status !== previousStatus
      ? [
          {
            type: "status",
            status: updates.status,
            ...(previousStatus ? { previousStatus: previousStatus as Complaint["status"] } : {}),
            ...(statusNote ? { note: statusNote } : {}),
            ...(statusAttachmentUrls && statusAttachmentUrls.length ? { attachmentUrls: statusAttachmentUrls } : {}),
            at: await resolveServerNowIso(COLLECTION, id),
            byUid,
          },
        ]
      : [];

  await updateDoc(doc(db, COLLECTION, id), {
    ...updates,
    updatedAt: serverTimestamp(),
    ...(historyAppend.length ? { history: arrayUnion(...historyAppend) } : {}),
  });

  if (historyAppend.length && updates.assignedTo) {
    notifyByEmail(
      updates.assignedTo,
      `Complaint #${id} is now ${updates.status}`,
      "Complaint status updated",
      `Complaint #${id} is now ${updates.status}.`,
      `/complaints/${id}`
    );
  }
}

// Reassignment is direct — complaints.reassign moves the complaint
// immediately, logging one "reassigned" history entry with who did it and
// why. (There used to be a separate propose/approve flow; it's been
// removed — see the legacy history types in types.ts.)
export async function reassignComplaint(
  id: string,
  assignedTo: string | null,
  previousAssignedTo: string | null,
  currentStatus: Complaint["status"] | null,
  byUid: string | null,
  reason: string,
  attachmentUrls?: string[]
): Promise<void> {
  const at = await resolveServerNowIso(COLLECTION, id);
  // Reassigning to someone while still Open moves it to Assigned — mirrors
  // ComplaintForm's identical rule for the initial assignment at creation.
  const bumpToAssigned = Boolean(assignedTo) && currentStatus === "Open";
  await updateDoc(doc(db, COLLECTION, id), {
    assignedTo,
    ...(bumpToAssigned ? { status: "Assigned" } : {}),
    updatedAt: serverTimestamp(),
    ...(assignedTo ? { everAssignedTo: arrayUnion(assignedTo) } : {}),
    history: arrayUnion({
      type: "reassigned",
      assignedTo,
      previousAssignedTo,
      reason,
      ...(attachmentUrls && attachmentUrls.length ? { attachmentUrls } : {}),
      at,
      byUid,
    }),
  });

  if (assignedTo && assignedTo !== previousAssignedTo) {
    notifyByEmail(
      assignedTo,
      `You were assigned complaint #${id}`,
      "New complaint assigned to you",
      `Complaint #${id} has been assigned to you. Reason: ${reason}`,
      `/complaints/${id}`
    );
  }
}

// "My Complaints" — every complaint the given employee has ever been
// assigned to (current assignee included), so it can show what's assigned
// to them now, what they've closed, and what's since been reassigned away
// from them. Relies on everAssignedTo (see its comment in lib/types.ts) and
// the matching canReadComplaint() clause in firestore.rules.
export function subscribeToMyComplaintsEver(
  uid: string,
  callback: (complaints: Complaint[]) => void,
  onError?: (error: unknown) => void
) {
  const q = query(collection(db, COLLECTION), where("everAssignedTo", "array-contains", uid));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function deleteComplaint(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
