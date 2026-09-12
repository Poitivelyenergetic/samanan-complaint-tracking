import type { Administration, Company, Department, StaffUser } from "./types";

// A "General Manager" isn't a separate role — it's whoever a Company,
// Administration, or Department has set as its managerId (the existing
// "boss of this unit" field). Being the manager of a unit scopes what that
// person sees to their own branch of the org tree: a company GM sees that
// company's administrations/departments/employees, an administration GM
// sees their administration's departments/employees, and a department GM
// sees just their department's employees. Everyone else (not a manager of
// anything) is unaffected and keeps seeing whatever their permissions
// already grant.
export interface ManagerScope {
  level: "company" | "administration" | "department";
  companyId?: string;
  administrationId?: string;
  departmentId?: string;
}

// hasBroaderAccess should be true when the signed-in person already holds a
// permission that's meant to see beyond their own scope (complaints.viewAll
// — the closest existing "sees everything, not just their own" flag this
// app has, held broadly by admin-type roles). Being someone's manager is a
// default restriction for people who don't otherwise have that — it's never
// meant to narrow what an admin or other elevated role can already see.
export function computeManagerScope(
  uid: string | undefined,
  companies: Company[],
  administrations: Administration[],
  departments: Department[],
  hasBroaderAccess: boolean
): ManagerScope | null {
  if (!uid || hasBroaderAccess) return null;
  const company = companies.find((c) => c.managerId === uid);
  if (company) return { level: "company", companyId: company.id };
  const administration = administrations.find((a) => a.managerId === uid);
  if (administration) return { level: "administration", administrationId: administration.id };
  const department = departments.find((d) => d.managerId === uid);
  if (department) return { level: "department", departmentId: department.id };
  return null;
}

export function scopeAdministrations(administrations: Administration[], scope: ManagerScope | null): Administration[] {
  if (!scope) return administrations;
  if (scope.level === "company") return administrations.filter((a) => a.companyId === scope.companyId);
  if (scope.level === "administration") return administrations.filter((a) => a.id === scope.administrationId);
  return []; // a department-level manager has no administrations of their own to browse
}

export function scopeDepartments(
  departments: Department[],
  administrations: Administration[],
  scope: ManagerScope | null
): Department[] {
  if (!scope) return departments;
  if (scope.level === "company") {
    const adminIds = new Set(administrations.filter((a) => a.companyId === scope.companyId).map((a) => a.id));
    return departments.filter((d) => adminIds.has(d.administrationId));
  }
  if (scope.level === "administration") return departments.filter((d) => d.administrationId === scope.administrationId);
  return departments.filter((d) => d.id === scope.departmentId);
}

export function scopeStaff(staff: StaffUser[], scope: ManagerScope | null): StaffUser[] {
  if (!scope) return staff;
  if (scope.level === "company") return staff.filter((s) => s.companyId === scope.companyId);
  if (scope.level === "administration") return staff.filter((s) => s.administrationId === scope.administrationId);
  return staff.filter((s) => s.departmentId === scope.departmentId);
}
