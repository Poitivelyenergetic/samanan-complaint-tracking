import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requirePermission, ApiAuthError } from "@/lib/api-auth";
import { computeUnionPermissions } from "@/lib/permissions-server";
import { normalizeRolePermissionsInput, type RoleInput } from "@/lib/types";

// Recomputes and persists the denormalized `permissions` union for every
// employee who currently holds `roleId` — called after that role's own
// permissions change (or it's deleted), since the union each of those
// employees sees is now stale.
async function recomputeEmployeesHoldingRole(roleId: string): Promise<void> {
  const db = getAdminDb();
  const affected = await db.collection("users").where("roleIds", "array-contains", roleId).get();
  await Promise.all(
    affected.docs.map(async (employeeDoc) => {
      const roleIds: string[] = Array.isArray(employeeDoc.data().roleIds) ? employeeDoc.data().roleIds : [];
      const permissions = await computeUnionPermissions(roleIds);
      await employeeDoc.ref.update({ permissions });
    })
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, "roles", "update");
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const body = (await request.json()) as Partial<RoleInput>;
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const permissions = normalizeRolePermissionsInput(body.permissions);
  await getAdminDb()
    .collection("roles")
    .doc(id)
    .set({ name, permissions, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await recomputeEmployeesHoldingRole(id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, "roles", "delete");
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const db = getAdminDb();

  // Strip the role from every employee holding it before deleting it, then
  // recompute their permissions from whatever roles remain.
  const affected = await db.collection("users").where("roleIds", "array-contains", id).get();
  await Promise.all(
    affected.docs.map(async (employeeDoc) => {
      const roleIds: string[] = (
        Array.isArray(employeeDoc.data().roleIds) ? employeeDoc.data().roleIds : []
      ).filter((rid: string) => rid !== id);
      const permissions = await computeUnionPermissions(roleIds);
      await employeeDoc.ref.update({ roleIds, permissions });
    })
  );

  await db.collection("roles").doc(id).delete();

  return NextResponse.json({ ok: true });
}
