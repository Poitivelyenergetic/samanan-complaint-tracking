export type UserRole = "admin" | "employee" | "user";

export interface Permissions {
  viewAllComplaints: boolean; // see every complaint, not just ones assigned/linked to them
  editAnyComplaint: boolean; // edit, reassign, or change the status of any complaint
  viewEmployees: boolean; // browse the Companies/Administrations/Positions/Employees hierarchy
  manageEmployees: boolean; // add, edit, or remove employee accounts
  accessMarketing: boolean; // access the Marketing placeholder section
  manageCompanies: boolean; // create, rename, and delete companies (and administrations/positions within any of them)
  manageAdministrations: boolean; // create, rename, and delete administrations (and positions within any of them), within a company already accessible
  managePositions: boolean; // create, rename, and delete positions within administrations (narrower than manageAdministrations)
}

export const PERMISSION_KEYS = [
  "viewAllComplaints",
  "editAnyComplaint",
  "viewEmployees",
  "manageEmployees",
  "accessMarketing",
  "manageCompanies",
  "manageAdministrations",
  "managePositions",
] as const satisfies readonly (keyof Permissions)[];

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

// The role dropdown is a convenient preset — picking a role pre-fills these
// defaults into `permissions`, which is the value actually checked
// everywhere. An admin can then override individual permissions per employee.
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, Permissions> = {
  admin: {
    viewAllComplaints: true,
    editAnyComplaint: true,
    viewEmployees: true,
    manageEmployees: true,
    accessMarketing: true,
    manageCompanies: true,
    manageAdministrations: true,
    managePositions: true,
  },
  employee: {
    viewAllComplaints: true,
    editAnyComplaint: true,
    viewEmployees: false,
    manageEmployees: false,
    accessMarketing: true,
    manageCompanies: false,
    manageAdministrations: false,
    managePositions: false,
  },
  user: {
    viewAllComplaints: false,
    editAnyComplaint: false,
    viewEmployees: false,
    manageEmployees: false,
    accessMarketing: false,
    manageCompanies: false,
    manageAdministrations: false,
    managePositions: false,
  },
};

// Four-level org-browsing hierarchy: a Company has Administrations
// (departments), each Administration has Positions, each Position has
// Employees. Purely for browsing/organizing staff — not separate tenants.
export interface Company {
  id: string;
  name: string;
}

// A department, e.g. "Support" or "IT". Positions belong to exactly one
// administration; employees belong to exactly one position.
export interface Administration {
  id: string;
  name: string;
  companyId: string;
}

export interface Position {
  id: string;
  name: string;
  administrationId: string;
}

export interface StaffUser {
  id: string; // Firebase Auth UID
  name: string; // full name
  username: string;
  number: string; // staff / ID number
  companyId: string;
  administrationId: string;
  positionId: string;
  role: UserRole;
  permissions: Permissions;
}

export interface EmployeeInput {
  name: string;
  username: string;
  number: string;
  companyId: string;
  administrationId: string;
  positionId: string;
  role: UserRole;
  permissions: Permissions;
  password?: string; // required when creating, optional (reset) when editing
}

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

// "staff" = logged via the internal New Complaint form by a staff member.
// "public" = submitted directly by a customer through the public intake form.
export type ComplaintChannel = "staff" | "public";

export interface Complaint {
  id: string; // Firestore document ID (issue_id) — also used as the public tracking/reference number
  subject: string;
  description: string;
  category: ComplaintCategory;
  channel: ComplaintChannel;
  customerNumber: string;
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
