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
import type { ComplaintSource, ComplaintSourceInput } from "./types";

const COLLECTION = "complaintSources";

function fromDoc(id: string, data: DocumentData): ComplaintSource {
  return { id, nameAr: data.nameAr ?? "", nameEn: data.nameEn ?? "" };
}

export function subscribeToComplaintSources(
  callback: (sources: ComplaintSource[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function getComplaintSource(id: string): Promise<ComplaintSource | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export async function createComplaintSource(input: ComplaintSourceInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), input);
  return ref.id;
}

export async function updateComplaintSource(id: string, input: ComplaintSourceInput): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { ...input });
}

export async function deleteComplaintSource(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
