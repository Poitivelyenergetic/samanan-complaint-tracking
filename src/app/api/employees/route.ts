import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requirePermission, ApiAuthError } from "@/lib/api-auth";
import { usernameToEmail } from "@/lib/username";
import { computeUnionPermissions } from "@/lib/permissions-server";
import type { EmployeeInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    await requirePermission(request, "employees", "create");
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

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
  const roleIds = Array.isArray(body.roleIds) ? body.roleIds.filter((id) => typeof id === "string" && id) : [];
  const password = body.password;

  if (
    (!nameAr && !nameEn) ||
    !username ||
    !number ||
    !companyId ||
    !administrationId ||
    !departmentId ||
    !password
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  const permissions = await computeUnionPermissions(roleIds);

  let uid: string;
  try {
    const userRecord = await getAdminAuth().createUser({
      email: usernameToEmail(username),
      password,
      emailVerified: true,
      displayName: nameEn || nameAr,
    });
    uid = userRecord.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/email-already-exists") {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }
    return NextResponse.json({ error: "auth_create_failed" }, { status: 500 });
  }

  await getAdminDb().collection("users").doc(uid).set({
    id: uid,
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
  });

  return NextResponse.json({ id: uid }, { status: 201 });
}
