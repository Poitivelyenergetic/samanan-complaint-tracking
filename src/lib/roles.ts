import { collection, doc, DocumentData, getDoc, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { emptyRolePermissions, type Role } from "./types";

const COLLECTION = "roles";

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function fromDoc(id: string, data: DocumentData): Role {
  return {
    id,
    name: data.name ?? "",
    permissions: { ...emptyRolePermissions(), ...data.permissions },
    updatedAt: toIso(data.updatedAt),
  };
}

export function subscribeToRoles(
  callback: (roles: Role[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function getRole(id: string): Promise<Role | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}
