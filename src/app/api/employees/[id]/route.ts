import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requirePermission, ApiAuthError } from "@/lib/api-auth";
import { usernameToEmail } from "@/lib/username";
import { computeUnionPermissions } from "@/lib/permissions-server";
import type { EmployeeInput } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, "employees", "update");
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const body = (await request.json()) as Partial<EmployeeInput>;
  const nameAr = body.nameAr?.trim() ?? "";
  const nameEn = body.nameEn?.trim() ?? "";
  const username = body.username?.trim().toLowerCase();
  const number = body.number?.trim();
  const phone = body.phone?.trim() ?? "";
  const jobTitle = body.jobTitle?.trim() ?? "";
  const companyId = body.companyId?.trim();
  const administrationId = body.administrationId?.trim();
  const departmentId = body.departmentId?.trim();
  const roleIds = Array.isArray(body.roleIds) ? body.roleIds.filter((rid) => typeof rid === "string" && rid) : [];
  const password = body.password?.trim();

  if (
    (!nameAr && !nameEn) ||
    !username ||
    !number ||
    !companyId ||
    !administrationId ||
    !departmentId
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (password && password.length < 6) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  const permissions = await computeUnionPermissions(roleIds);

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
    {
      id,
      nameAr,
      nameEn,
      username,
      number,
      phone,
      jobTitle,
      companyId,
      administrationId,
      departmentId,
      roleIds,
      permissions,
    },
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
    callerUid = await requirePermission(request, "employees", "delete");
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
