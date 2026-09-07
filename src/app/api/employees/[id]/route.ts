import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, ApiAuthError } from "@/lib/api-auth";
import { usernameToEmail } from "@/lib/username";
import type { EmployeeInput } from "@/lib/types";

const VALID_ROLES = ["admin", "employee", "user"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request);
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
  const position = body.position?.trim();
  const administration = body.administration?.trim();
  const role = body.role;
  const password = body.password?.trim();

  if (!name || !username || !number || !position || !administration || !role) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }
  if (password && password.length < 6) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

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
    { id, name, username, number, position, administration, role },
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
    callerUid = await requireAdmin(request);
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
