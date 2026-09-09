// --- Role-based, per-resource CRUD permissions -----------------------------
// Roles are custom, admin-defined records (not a fixed enum) — see Role
// below. An employee can hold multiple roles at once (roleIds); their
// effective permission for any action is the union (OR) across all
// currently-assigned roles' permissions for that resource/action.
//
// Firestore security rules can't loop over an arbitrary-length roleIds array
// to fetch and OR together multiple role docs at read time, so the union is
// computed server-side (Admin SDK, in the /api/employees and /api/roles
// routes) and denormalized onto `StaffUser.permissions`. That denormalized
// field — not roleIds directly — is what every access check actually reads,
// both in the UI and in firestore.rules. It's recomputed whenever an
// employee's roleIds change, or whenever any role they hold has its own
// permissions edited (which cascades to every employee holding that role).

export const PERMISSION_RESOURCES = [
  "companies",
  "administrations",
  "departments",
  "employees",
  "customers", // UI label is always "Users", never "Customers"
  "complaints",
  "roles",
] as const;

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export type CrudAction = "view" | "create" | "update" | "delete";

export const CRUD_ACTIONS: readonly CrudAction[] = ["view", "create", "update", "delete"];

export interface CrudPermission {
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

// Marketing is just a placeholder page — it only ever needs a view flag.
export interface MarketingPermission {
  view: boolean;
}

// Complaints carries two extra flags beyond the standard CRUD set:
//  - viewAll: see every complaint, not just ones assigned to you (default
//    scoping — see hasPermission's callers in the dashboard/detail pages —
//    is "only your own assigned complaints").
//  - reassign: change who a complaint is assigned to. Deliberately separate
//    from `update` so a role can edit complaint details without being able
//    to reassign them, or vice versa.
export interface ComplaintsPermission extends CrudPermission {
  viewAll: boolean;
  reassign: boolean;
}

export interface RolePermissions {
  companies: CrudPermission;
  administrations: CrudPermission;
  departments: CrudPermission;
  employees: CrudPermission;
  customers: CrudPermission;
  complaints: ComplaintsPermission;
  roles: CrudPermission;
  marketing: MarketingPermission;
}

export function emptyCrud(): CrudPermission {
  return { view: false, create: false, update: false, delete: false };
}

export function fullCrud(): CrudPermission {
  return { view: true, create: true, update: true, delete: true };
}

function emptyComplaintsPermission(): ComplaintsPermission {
  return { ...emptyCrud(), viewAll: false, reassign: false };
}

function fullComplaintsPermission(): ComplaintsPermission {
  return { ...fullCrud(), viewAll: true, reassign: true };
}

export function emptyRolePermissions(): RolePermissions {
  return {
    companies: emptyCrud(),
    administrations: emptyCrud(),
    departments: emptyCrud(),
    employees: emptyCrud(),
    customers: emptyCrud(),
    complaints: emptyComplaintsPermission(),
    roles: emptyCrud(),
    marketing: { view: false },
  };
}

export function fullRolePermissions(): RolePermissions {
  return {
    companies: fullCrud(),
    administrations: fullCrud(),
    departments: fullCrud(),
    employees: fullCrud(),
    customers: fullCrud(),
    complaints: fullComplaintsPermission(),
    roles: fullCrud(),
    marketing: { view: true },
  };
}

// OR's a set of roles' permissions together into one effective set — the
// core "multiple roles at once" semantics. Missing/malformed entries are
// treated as all-false rather than throwing, so a role predating a newly
// added resource doesn't break the union.
export function unionRolePermissions(rolePermissions: Partial<RolePermissions>[]): RolePermissions {
  const result = emptyRolePermissions();
  for (const perms of rolePermissions) {
    for (const resource of PERMISSION_RESOURCES) {
      const grant = perms[resource];
      if (!grant) continue;
      for (const action of CRUD_ACTIONS) {
        if (grant[action]) result[resource][action] = true;
      }
      if (resource === "complaints") {
        const complaintsGrant = grant as Partial<ComplaintsPermission>;
        if (complaintsGrant.viewAll) result.complaints.viewAll = true;
        if (complaintsGrant.reassign) result.complaints.reassign = true;
      }
    }
    if (perms.marketing?.view) result.marketing.view = true;
  }
  return result;
}

// The single check every screen/route uses. `profile` is whatever currently
// holds a `permissions: RolePermissions` field (StaffUser); returns false
// (never throws) for a missing profile or an unrecognized resource/action.
export function hasPermission(
  profile: { permissions?: RolePermissions } | null | undefined,
  resource: PermissionResource | "marketing",
  action: CrudAction | "viewAll" | "reassign"
): boolean {
  const resourcePerms = profile?.permissions?.[resource as keyof RolePermissions];
  if (!resourcePerms) return false;
  return (resourcePerms as unknown as Record<string, boolean>)[action] === true;
}

// Turns an arbitrary (client-supplied) permissions payload into a well-formed
// RolePermissions object — every resource/action defaults to false unless
// the input explicitly grants it. Shared by the create and update role API
// routes so the complaints.viewAll/reassign handling only lives in one place.
export function normalizeRolePermissionsInput(input: unknown): RolePermissions {
  const result = emptyRolePermissions();
  if (typeof input !== "object" || input === null) return result;
  const record = input as Record<string, unknown>;

  for (const resource of PERMISSION_RESOURCES) {
    const grant = record[resource];
    if (typeof grant !== "object" || grant === null) continue;
    const grantRecord = grant as Record<string, unknown>;
    for (const action of CRUD_ACTIONS) {
      if (grantRecord[action] === true) result[resource][action] = true;
    }
    if (resource === "complaints") {
      if (grantRecord.viewAll === true) result.complaints.viewAll = true;
      if (grantRecord.reassign === true) result.complaints.reassign = true;
    }
  }

  const marketingGrant = record.marketing as { view?: unknown } | undefined;
  if (marketingGrant?.view === true) result.marketing.view = true;

  return result;
}

export interface Role {
  id: string;
  name: string;
  permissions: RolePermissions;
  updatedAt: string; // ISO string
}

export interface RoleInput {
  name: string;
  permissions: RolePermissions;
}

// --- Org-browsing hierarchy: Company > Administration > Department --------
// Purely for organizing/browsing staff — not separate tenants. Each level
// (except Company, per explicit instruction) has an optional `managerId`
// pointing at an employees doc — the "boss" of that unit — left unset until
// an employee exists to assign, since the very first company can't have a
// manager before its first employee is created.

export interface Company {
  id: string;
  number: string;
  nameAr: string;
  nameEn: string;
  managerId: string | null;
}

export interface CompanyInput {
  number: string;
  nameAr: string;
  nameEn: string;
  managerId: string | null;
}

export interface Administration {
  id: string;
  nameAr: string;
  nameEn: string;
  companyId: string;
  managerId: string | null;
}

export interface AdministrationInput {
  nameAr: string;
  nameEn: string;
  companyId: string;
  managerId: string | null;
}

// An organizational sub-unit within an administration (e.g. "Networking"
// under "IT") — not a job title. Job titles are free text on the employee
// (StaffUser.jobTitle) and unrelated to this hierarchy.
export interface Department {
  id: string;
  nameAr: string;
  nameEn: string;
  administrationId: string;
  managerId: string | null;
}

export interface DepartmentInput {
  nameAr: string;
  nameEn: string;
  administrationId: string;
  managerId: string | null;
}

export interface StaffUser {
  id: string; // Firebase Auth UID
  nameAr: string;
  nameEn: string;
  username: string;
  number: string; // staff / ID number
  phone: string;
  jobTitle: string; // free text, e.g. "Senior Technician" — separate from the org hierarchy below
  companyId: string;
  administrationId: string;
  departmentId: string;
  roleIds: string[]; // an employee can hold multiple roles at once
  permissions: RolePermissions; // denormalized union of all roleIds' permissions — see note above
}

export interface EmployeeInput {
  nameAr: string;
  nameEn: string;
  username: string;
  number: string;
  phone: string;
  jobTitle: string;
  companyId: string;
  administrationId: string;
  departmentId: string;
  roleIds: string[];
  password?: string; // required when creating, optional (reset) when editing
}

// Picks whichever of nameAr/nameEn matches the current locale, falling back
// to whichever one is actually populated (migrated records may have only
// one filled in). Used for every Company/Administration/Department/
// Employee/Customer display name in the UI.
export function localizedName(
  entity: { nameAr: string; nameEn: string } | null | undefined,
  locale: string
): string {
  if (!entity) return "";
  const preferred = locale === "ar" ? entity.nameAr : entity.nameEn;
  const fallback = locale === "ar" ? entity.nameEn : entity.nameAr;
  return preferred || fallback || "";
}

// --- Users (customer-facing record) ----------------------------------------
// Collection/field names stay `customers`/`customerId` internally so they
// don't collide with the `employees` collection, but every UI-facing label
// is "Users", never "Customers" (nav item, screen titles, permission name).

export interface Customer {
  id: string;
  number: string;
  nameAr: string;
  nameEn: string;
  phone: string;
  employeeId: string | null; // the staff member responsible for this user
}

export interface CustomerInput {
  number: string;
  nameAr: string;
  nameEn: string;
  phone: string;
  employeeId: string | null;
}

// --- Complaints --------------------------------------------------------

export const COMPLAINT_STATUSES = [
  "Open",
  "Assigned",
  "Processing",
  "Cancel",
  "Closed",
] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_CATEGORIES = [
  "ProductQuality",
  "DeliveryDelay",
  "BillingIssue",
  "OrderDiscrepancy",
  "CustomerService",
  "Other",
] as const;

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_SOURCES = [
  "Twitter",
  "Facebook",
  "Phone",
  "Website",
  "WalkIn",
  "Other",
] as const;

export type ComplaintSource = (typeof COMPLAINT_SOURCES)[number];

// "staff" = logged via the internal New Complaint form by a staff member.
// "public" = submitted directly by a customer through the public intake form.
export type ComplaintChannel = "staff" | "public";

export interface Complaint {
  id: string; // Firestore document ID (issue_id) — also used as the public tracking/reference number
  subject: string;
  description: string;
  category: ComplaintCategory;
  channel: ComplaintChannel;
  source: ComplaintSource;
  customerId: string | null; // link to a customers doc — the actual reference
  customerNumber: string; // display convenience, derived from the linked customer (or contact info for public complaints); never hand-typed by staff anymore
  customerOrderNumber: string;
  complainantName: string | null; // set when channel is "public"
  contactEmail: string | null;
  contactPhone: string | null;
  attachmentUrl: string | null;
  assignedTo: string | null; // Firestore UID of staff, or null if unassigned
  status: ComplaintStatus;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  createdBy: string | null; // UID of staff who created it, null for public submissions
}

export type ComplaintInput = Omit<
  Complaint,
  "id" | "createdAt" | "updatedAt"
>;

export type SignupRequestStatus = "pending" | "approved" | "rejected";

// A public request for a staff account. Deliberately holds no password —
// an admin reviews it and creates the real account (with a password of
// their choosing) via the existing Employees "New Employee" flow.
export interface SignupRequest {
  id: string;
  name: string;
  username: string;
  contact: string; // email or phone, however the requester prefers to be reached
  position: string;
  administration: string;
  note: string | null;
  status: SignupRequestStatus;
  createdAt: string; // ISO string
}
