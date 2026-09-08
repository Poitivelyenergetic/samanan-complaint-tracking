import { getAdminDb } from "./firebaseAdmin";
import { emptyRolePermissions, unionRolePermissions, type RolePermissions } from "./types";

// Server-only (Admin SDK) — fetches each referenced role doc and ORs their
// permissions together. Used both when an employee's roleIds change and
// when a role's own permissions are edited (cascading to every employee
// holding it) — see /api/employees and /api/roles.
export async function computeUnionPermissions(roleIds: string[]): Promise<RolePermissions> {
  if (roleIds.length === 0) return emptyRolePermissions();
  const db = getAdminDb();
  const snaps = await Promise.all(roleIds.map((id) => db.collection("roles").doc(id).get()));
  const permissionsList = snaps
    .filter((snap) => snap.exists)
    .map((snap) => snap.data()?.permissions ?? {});
  return unionRolePermissions(permissionsList);
}
