import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requirePermission, ApiAuthError } from "@/lib/api-auth";
import { computeUnionPermissions } from "@/lib/permissions-server";

// Adds `roleId` to every employee within an org scope (a department, an
// administration, or a whole company) that doesn't already hold it —
// letting an admin grant a role to a whole team at once instead of editing
// employees one by one. Never removes a role from anyone, and never
// touches an employee's other roles.
export async function POST(
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

  const { id: roleId } = await params;
  const body = (await request.json()) as {
    departmentId?: string;
    administrationId?: string;
    companyId?: string;
  };
  const departmentId = body.departmentId?.trim();
  const administrationId = body.administrationId?.trim();
  const companyId = body.companyId?.trim();

  // Most specific scope wins — a department implies its administration and
  // company, so there's no need (and no correct way) to combine them.
  let field: "departmentId" | "administrationId" | "companyId";
  let value: string;
  if (departmentId) {
    field = "departmentId";
    value = departmentId;
  } else if (administrationId) {
    field = "administrationId";
    value = administrationId;
  } else if (companyId) {
    field = "companyId";
    value = companyId;
  } else {
    return NextResponse.json({ error: "missing_scope" }, { status: 400 });
  }

  const db = getAdminDb();
  const roleSnap = await db.collection("roles").doc(roleId).get();
  if (!roleSnap.exists) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const matched = await db.collection("users").where(field, "==", value).get();
  let updated = 0;
  await Promise.all(
    matched.docs.map(async (employeeDoc) => {
      const roleIds: string[] = Array.isArray(employeeDoc.data().roleIds) ? employeeDoc.data().roleIds : [];
      if (roleIds.includes(roleId)) return;
      const nextRoleIds = [...roleIds, roleId];
      const permissions = await computeUnionPermissions(nextRoleIds);
      await employeeDoc.ref.update({ roleIds: nextRoleIds, permissions });
      updated += 1;
    })
  );

  return NextResponse.json({ ok: true, matched: matched.size, updated });
}
