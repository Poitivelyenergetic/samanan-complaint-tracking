import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requirePermission, ApiAuthError } from "@/lib/api-auth";
import { emptyRolePermissions, PERMISSION_RESOURCES, CRUD_ACTIONS, type RoleInput } from "@/lib/types";

function normalizePermissions(input: unknown) {
  const result = emptyRolePermissions();
  if (typeof input !== "object" || input === null) return result;
  const record = input as Record<string, unknown>;
  for (const resource of PERMISSION_RESOURCES) {
    const grant = record[resource];
    if (typeof grant !== "object" || grant === null) continue;
    for (const action of CRUD_ACTIONS) {
      if ((grant as Record<string, unknown>)[action] === true) result[resource][action] = true;
    }
  }
  if ((record.marketing as { view?: unknown } | undefined)?.view === true) result.marketing.view = true;
  return result;
}

// A brand-new role has no employees referencing it yet, so — unlike editing
// or deleting one — creating a role needs no cascade and could in principle
// be a direct client write. It goes through this Admin SDK route anyway to
// keep all role mutations on one code path (and one permission check).
export async function POST(request: Request) {
  try {
    await requirePermission(request, "roles", "create");
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = (await request.json()) as Partial<RoleInput>;
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const permissions = normalizePermissions(body.permissions);
  const ref = await getAdminDb()
    .collection("roles")
    .add({ name, permissions, updatedAt: FieldValue.serverTimestamp() });

  return NextResponse.json({ id: ref.id }, { status: 201 });
}
