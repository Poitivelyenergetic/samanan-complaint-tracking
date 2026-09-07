import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, ApiAuthError } from "@/lib/api-auth";
import { usernameToEmail } from "@/lib/username";
import type { EmployeeInput } from "@/lib/types";

const VALID_ROLES = ["admin", "employee", "user"];

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = (await request.json()) as Partial<EmployeeInput>;
  const name = body.name?.trim();
  const username = body.username?.trim().toLowerCase();
  const number = body.number?.trim();
  const position = body.position?.trim();
  const administration = body.administration?.trim();
  const role = body.role;
  const password = body.password;

  if (!name || !username || !number || !position || !administration || !role || !password) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  let uid: string;
  try {
    const userRecord = await getAdminAuth().createUser({
      email: usernameToEmail(username),
      password,
      emailVerified: true,
      displayName: name,
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
    name,
    username,
    number,
    position,
    administration,
    role,
  });

  return NextResponse.json({ id: uid }, { status: 201 });
}
