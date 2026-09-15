import { auth } from "./firebase";

// Fire-and-forget email notification, called right after a complaint/ticket
// assignment or status change succeeds. Never throws — a failed or skipped
// email (no address on file, request error, not signed in) must never
// surface as an error for what is otherwise a successful Firestore write.
export async function notifyByEmail(
  targetUid: string | null,
  subject: string,
  heading: string,
  text: string,
  path: string
): Promise<void> {
  if (!targetUid) return;
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    const link = `${window.location.origin}/en${path}`;
    await fetch("/api/notifications/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetUid, subject, heading, text, link }),
    });
  } catch {
    // Best-effort — see comment above.
  }
}
