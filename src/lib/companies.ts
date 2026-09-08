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
import type { Company } from "./types";

const COLLECTION = "companies";

function fromDoc(id: string, data: DocumentData): Company {
  return { id, name: data.name ?? "" };
}

export function subscribeToCompanies(
  callback: (companies: Company[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function getCompany(id: string): Promise<Company | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export async function createCompany(name: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), { name });
  return ref.id;
}

export async function renameCompany(id: string, name: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { name });
}

export async function deleteCompany(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
