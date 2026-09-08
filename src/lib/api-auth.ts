import { getAdminAuth, getAdminDb } from "./firebaseAdmin";
import { ROLE_DEFAULT_PERMISSIONS, type PermissionKey, type UserRole } from "./types";

export class ApiAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Verifies the request's Firebase ID token (Authorization: Bearer <token>)
 * and checks that the caller's Firestore users/{uid}.permissions grants the
 * given permission. Falls back to the caller's role's default permissions
 * if their profile predates the permissions field. Throws ApiAuthError with
 * an appropriate HTTP status otherwise.
 */
export async function requirePermission(
  request: Request,
  permission: PermissionKey
): Promise<string> {
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
  const data = profileSnap.exists ? profileSnap.data() : null;
  const role = (data?.role as UserRole) ?? "employee";
  const permissions = data?.permissions ?? ROLE_DEFAULT_PERMISSIONS[role];
  if (permissions?.[permission] !== true) {
    throw new ApiAuthError(403, "Permission required: " + permission);
  }

  return uid;
}
