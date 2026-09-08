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
import type { Position } from "./types";

const COLLECTION = "positions";

function fromDoc(id: string, data: DocumentData): Position {
  return { id, name: data.name ?? "", administrationId: data.administrationId ?? "" };
}

// Fetches every position (not scoped to one administration) — the
// Administrations/Positions screens filter client-side, same pattern as
// subscribeToStaff, which keeps this cheap without an extra composite index.
export function subscribeToPositions(
  callback: (positions: Position[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function getPosition(id: string): Promise<Position | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export async function createPosition(name: string, administrationId: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), { name, administrationId });
  return ref.id;
}

export async function renamePosition(id: string, name: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { name });
}

export async function deletePosition(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
