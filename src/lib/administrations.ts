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
import type { Administration } from "./types";

const COLLECTION = "administrations";

function fromDoc(id: string, data: DocumentData): Administration {
  return { id, name: data.name ?? "", companyId: data.companyId ?? "" };
}

// Fetches every administration (not scoped to one company) — the
// Companies/Administrations screens filter client-side, same pattern as
// subscribeToStaff, which keeps this cheap without an extra composite index.
export function subscribeToAdministrations(
  callback: (administrations: Administration[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function getAdministration(id: string): Promise<Administration | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export async function createAdministration(name: string, companyId: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), { name, companyId });
  return ref.id;
}

export async function renameAdministration(id: string, name: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { name });
}

export async function deleteAdministration(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
