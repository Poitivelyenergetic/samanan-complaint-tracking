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
import type { Department, DepartmentInput } from "./types";

const COLLECTION = "departments";

function fromDoc(id: string, data: DocumentData): Department {
  return {
    id,
    number: data.number ?? "",
    nameAr: data.nameAr ?? "",
    nameEn: data.nameEn ?? "",
    administrationId: data.administrationId ?? "",
    managerId: data.managerId ?? null,
  };
}

// Fetches every department (not scoped to one administration) — the
// Administrations/Departments screens filter client-side, same pattern as
// subscribeToStaff, which keeps this cheap without an extra composite index.
export function subscribeToDepartments(
  callback: (departments: Department[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function getDepartment(id: string): Promise<Department | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export async function createDepartment(input: DepartmentInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), input);
  return ref.id;
}

export async function updateDepartment(id: string, input: DepartmentInput): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { ...input });
}

export async function deleteDepartment(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
