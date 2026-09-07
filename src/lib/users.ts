import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import type { StaffUser } from "./types";

const COLLECTION = "users";

export function subscribeToStaff(
  callback: (staff: StaffUser[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) =>
      callback(
        snap.docs.map((d) => ({ ...(d.data() as Omit<StaffUser, "id">), id: d.id }))
      ),
    onError
  );
}

export async function getStaffMember(id: string): Promise<StaffUser | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? ({ ...(snap.data() as Omit<StaffUser, "id">), id: snap.id }) : null;
}
