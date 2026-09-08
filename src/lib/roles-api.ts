import { auth } from "./firebase";
import type { RoleInput } from "./types";

class RolesApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

async function authedFetch(url: string, init: RequestInit): Promise<unknown> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new RolesApiError("not_authenticated");

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new RolesApiError(typeof data.error === "string" ? data.error : "request_failed");
  }
  return data;
}

export { RolesApiError };

// Role mutations go through the Admin SDK (not a direct Firestore write)
// because editing or deleting a role must cascade: every employee currently
// holding that role needs their denormalized `permissions` union
// recomputed, which touches documents beyond the one the client is
// nominally writing — exactly the kind of cross-document side effect
// Firestore security rules can't express for a single client write.

export async function createRole(input: RoleInput): Promise<{ id: string }> {
  return (await authedFetch("/api/roles", {
    method: "POST",
    body: JSON.stringify(input),
  })) as { id: string };
}

export async function updateRole(id: string, input: RoleInput): Promise<void> {
  await authedFetch(`/api/roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteRole(id: string): Promise<void> {
  await authedFetch(`/api/roles/${id}`, { method: "DELETE" });
}
