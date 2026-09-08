import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requirePermission, ApiAuthError } from "@/lib/api-auth";
import { usernameToEmail } from "@/lib/username";
import { PERMISSION_KEYS, ROLE_DEFAULT_PERMISSIONS, type EmployeeInput, type Permissions } from "@/lib/types";

const VALID_ROLES = ["admin", "employee", "user"];

function normalizePermissions(input: unknown, role: "admin" | "employee" | "user"): Permissions {
  const fallback = ROLE_DEFAULT_PERMISSIONS[role];
  if (typeof input !== "object" || input === null) return fallback;
  const record = input as Record<string, unknown>;
  const result = { ...fallback };
  for (const key of PERMISSION_KEYS) {
    if (typeof record[key] === "boolean") result[key] = record[key] as boolean;
  }
  return result;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, "manageEmployees");
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const body = (await request.json()) as Partial<EmployeeInput>;
  const name = body.name?.trim();
  const username = body.username?.trim().toLowerCase();
  const number = body.number?.trim();
  const companyId = body.companyId?.trim();
  const positionId = body.positionId?.trim();
  const administrationId = body.administrationId?.trim();
  const role = body.role;
  const password = body.password?.trim();

  if (
    !name ||
    !username ||
    !number ||
    !companyId ||
    !administrationId ||
    !positionId ||
    !role
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }
  if (password && password.length < 6) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  const permissions = normalizePermissions(body.permissions, role);

  try {
    const authUpdates: { email: string; password?: string } = {
      email: usernameToEmail(username),
    };
    if (password) authUpdates.password = password;
    await getAdminAuth().updateUser(id, authUpdates);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/email-already-exists") {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }
    if (code === "auth/user-not-found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "auth_update_failed" }, { status: 500 });
  }

  await getAdminDb().collection("users").doc(id).set(
    { id, name, username, number, companyId, administrationId, positionId, role, permissions },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let callerUid: string;
  try {
    callerUid = await requirePermission(request, "manageEmployees");
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  if (id === callerUid) {
    return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
  }

  await getAdminAuth().deleteUser(id).catch(() => undefined);
  await getAdminDb().collection("users").doc(id).delete();

  return NextResponse.json({ ok: true });
}
