export type UserRole = "admin" | "employee" | "user";

export interface StaffUser {
  id: string; // Firebase Auth UID
  name: string; // full name
  username: string;
  number: string; // staff / ID number
  position: string; // job title, free text
  administration: string; // department / administration, free text
  role: UserRole;
}

export interface EmployeeInput {
  name: string;
  username: string;
  number: string;
  position: string;
  administration: string;
  role: UserRole;
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
