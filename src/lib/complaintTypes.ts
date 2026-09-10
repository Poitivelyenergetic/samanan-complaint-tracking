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
import type { ComplaintType, ComplaintTypeInput } from "./types";

const COLLECTION = "complaintTypes";

function fromDoc(id: string, data: DocumentData): ComplaintType {
  return { id, name: data.name ?? "" };
}

export function subscribeToComplaintTypes(
  callback: (types: ComplaintType[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function getComplaintType(id: string): Promise<ComplaintType | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export async function createComplaintType(input: ComplaintTypeInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), input);
  return ref.id;
}

export async function updateComplaintType(id: string, input: ComplaintTypeInput): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { ...input });
}

export async function deleteComplaintType(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
