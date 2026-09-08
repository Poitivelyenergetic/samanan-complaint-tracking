import { collection, doc, DocumentData, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { emptyRolePermissions, type StaffUser } from "./types";

const COLLECTION = "users";

// Falls back to empty permissions for any doc predating the denormalized
// `permissions` field (or a resource added after that doc was last
// recomputed), rather than throwing — the API layer is what keeps this
// field in sync with roleIds, this is just a defensive read-side default.
function fromDoc(id: string, data: DocumentData): StaffUser {
  return {
    id,
    nameAr: data.nameAr ?? "",
    nameEn: data.nameEn ?? "",
    username: data.username ?? "",
    number: data.number ?? "",
    phone: data.phone ?? "",
    jobTitle: data.jobTitle ?? "",
    companyId: data.companyId ?? "",
    administrationId: data.administrationId ?? "",
    departmentId: data.departmentId ?? "",
    roleIds: Array.isArray(data.roleIds) ? data.roleIds : [],
    permissions: { ...emptyRolePermissions(), ...data.permissions },
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
