import { collection, doc, DocumentData, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { ROLE_DEFAULT_PERMISSIONS, type StaffUser, type UserRole } from "./types";

const COLLECTION = "users";

// Falls back to the role's default permissions for any doc predating the
// permissions field (or a permission key added after that doc was written),
// so a not-yet-migrated account doesn't read as having every permission
// disabled.
function fromDoc(id: string, data: DocumentData): StaffUser {
  const role = (data.role as UserRole) ?? "employee";
  return {
    id,
    name: data.name ?? "",
    username: data.username ?? "",
    number: data.number ?? "",
    companyId: data.companyId ?? "",
    administrationId: data.administrationId ?? "",
    positionId: data.positionId ?? "",
    role,
    permissions: { ...ROLE_DEFAULT_PERMISSIONS[role], ...data.permissions },
  };
}

export function subscribeToStaff(
  callback: (staff: StaffUser[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => callback(snap.docs.map((d) => fromDoc(d.id, d.data()))),
    onError
  );
}

export async function getStaffMember(id: string): Promise<StaffUser | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

export function subscribeToStaffMember(
  id: string,
  callback: (staff: StaffUser | null) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    doc(db, COLLECTION, id),
    (snap) => callback(snap.exists() ? fromDoc(snap.id, snap.data()) : null),
    onError
  );
}
