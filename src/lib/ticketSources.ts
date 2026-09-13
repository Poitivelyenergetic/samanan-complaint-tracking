import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { TicketSource, TicketSourceInput } from "./types";

const COLLECTION = "ticketSources";

function fromDoc(id: string, data: DocumentData): TicketSource {
  return { id, nameAr: data.nameAr ?? "", nameEn: data.nameEn ?? "" };
}

export function subscribeToTicketSources(
  callback: (sources: TicketSource[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function getTicketSource(id: string): Promise<TicketSource | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export async function createTicketSource(input: TicketSourceInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), input);
  return ref.id;
}

export async function updateTicketSource(id: string, input: TicketSourceInput): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { ...input });
}

export async function deleteTicketSource(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
