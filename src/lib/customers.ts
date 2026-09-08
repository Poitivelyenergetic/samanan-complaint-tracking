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
import type { Customer, CustomerInput } from "./types";

// Collection stays `customers` internally — every UI-facing label is
// "Users" instead (nav item, screen titles, permission name), per spec.
const COLLECTION = "customers";

function fromDoc(id: string, data: DocumentData): Customer {
  return {
    id,
    number: data.number ?? "",
    nameAr: data.nameAr ?? "",
    nameEn: data.nameEn ?? "",
    phone: data.phone ?? "",
    employeeId: data.employeeId ?? null,
  };
}

// Customers are plain Firestore docs, not Firebase Auth accounts, so — unlike
// employees — they can be created/edited directly via the client SDK, gated
// by firestore.rules' customers.* permissions, with no Admin SDK detour.
export function subscribeToCustomers(
  callback: (customers: Customer[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export async function createCustomer(input: CustomerInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), input);
  return ref.id;
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { ...input });
}

export async function deleteCustomer(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
