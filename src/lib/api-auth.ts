import { getAdminAuth, getAdminDb } from "./firebaseAdmin";
import { emptyRolePermissions, type CrudAction, type PermissionResource } from "./types";

export class ApiAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function verifyToken(request: Request): Promise<string> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    throw new ApiAuthError(401, "Missing authorization token");
  }
  try {
    return (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    throw new ApiAuthError(401, "Invalid or expired session");
  }
}

/**
 * Verifies the request's Firebase ID token (Authorization: Bearer <token>)
 * and checks that the caller's Firestore users/{uid}.permissions — the
 * denormalized union of all their assigned roles' permissions, see
 * types.ts — grants the given resource/action. Throws ApiAuthError with an
 * appropriate HTTP status otherwise.
 */
export async function requirePermission(
  request: Request,
  resource: PermissionResource,
  action: CrudAction
): Promise<string> {
  const uid = await verifyToken(request);
  const profileSnap = await getAdminDb().collection("users").doc(uid).get();
  const permissions = profileSnap.exists ? profileSnap.data()?.permissions : null;
  const resourcePerms = permissions?.[resource] ?? emptyRolePermissions()[resource];
  if (resourcePerms?.[action] !== true) {
    throw new ApiAuthError(403, `Permission required: ${resource}.${action}`);
  }
  return uid;
}
