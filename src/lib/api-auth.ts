import { getAdminAuth, getAdminDb } from "./firebaseAdmin";

export class ApiAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Verifies the request's Firebase ID token (Authorization: Bearer <token>)
 * and checks that the caller's Firestore users/{uid}.role is "admin".
 * Throws ApiAuthError with an appropriate HTTP status otherwise.
 */
export async function requireAdmin(request: Request): Promise<string> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    throw new ApiAuthError(401, "Missing authorization token");
  }

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    throw new ApiAuthError(401, "Invalid or expired session");
  }

  const profileSnap = await getAdminDb().collection("users").doc(uid).get();
  const role = profileSnap.exists ? profileSnap.data()?.role : null;
  if (role !== "admin") {
    throw new ApiAuthError(403, "Admin access required");
  }

  return uid;
}
