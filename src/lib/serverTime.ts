import { doc, getDoc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

// History entries live inside an array field, where Firestore's
// serverTimestamp() sentinel isn't supported (a documented Firestore
// limitation — it silently resolves to null inside arrayUnion()). Every
// history entry's `at` used to fall back to the client device's own clock,
// which is untrustworthy — real production data showed entries stamped up
// to 15 hours into the future because of a wrong device clock, even though
// createdAt/updatedAt (plain top-level fields, which DO support
// serverTimestamp()) were correct. This resolves one real server-side
// Timestamp via a tiny write+read round trip against the same document, so
// every history entry can be stamped with a value Firestore itself vouches
// for instead of the caller's clock.
export async function resolveServerNowIso(collection: string, id: string): Promise<string> {
  const ref = doc(db, collection, id);
  await updateDoc(ref, { updatedAt: serverTimestamp() });
  const snap = await getDoc(ref);
  const value = snap.data()?.updatedAt;
  const ts = value instanceof Timestamp ? value : Timestamp.now();
  return ts.toDate().toISOString();
}
