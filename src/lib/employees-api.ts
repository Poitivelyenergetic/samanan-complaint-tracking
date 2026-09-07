import { auth } from "./firebase";
import type { EmployeeInput } from "./types";

class EmployeesApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

async function authedFetch(url: string, init: RequestInit): Promise<unknown> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new EmployeesApiError("not_authenticated");

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
    throw new EmployeesApiError(
      typeof data.error === "string" ? data.error : "request_failed"
    );
  }
  return data;
}

export { EmployeesApiError };

export async function createEmployee(
  input: EmployeeInput & { password: string }
): Promise<{ id: string }> {
  return (await authedFetch("/api/employees", {
    method: "POST",
    body: JSON.stringify(input),
  })) as { id: string };
}

export async function updateEmployee(
  id: string,
  input: EmployeeInput
): Promise<void> {
  await authedFetch(`/api/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteEmployee(id: string): Promise<void> {
  await authedFetch(`/api/employees/${id}`, { method: "DELETE" });
}
