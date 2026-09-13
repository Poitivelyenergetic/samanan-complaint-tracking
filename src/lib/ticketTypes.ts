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
import type { TicketType, TicketTypeInput } from "./types";

const COLLECTION = "ticketTypes";

function fromDoc(id: string, data: DocumentData): TicketType {
  return { id, nameAr: data.nameAr ?? "", nameEn: data.nameEn ?? "" };
}

export function subscribeToTicketTypes(
  callback: (types: TicketType[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function getTicketType(id: string): Promise<TicketType | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export async function createTicketType(input: TicketTypeInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), input);
  return ref.id;
}

export async function updateTicketType(id: string, input: TicketTypeInput): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { ...input });
}

export async function deleteTicketType(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
