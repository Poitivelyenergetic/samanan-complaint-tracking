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
import type { Company, CompanyInput } from "./types";

const COLLECTION = "companies";

function fromDoc(id: string, data: DocumentData): Company {
  return {
    id,
    number: data.number ?? "",
    nameAr: data.nameAr ?? "",
    nameEn: data.nameEn ?? "",
    managerId: data.managerId ?? null,
  };
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

export async function createCompany(input: CompanyInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), input);
  return ref.id;
}

export async function updateCompany(id: string, input: CompanyInput): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { ...input });
}

export async function deleteCompany(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
