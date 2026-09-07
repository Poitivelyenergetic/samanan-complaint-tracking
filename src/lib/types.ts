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

export interface Complaint {
  id: string; // Firestore document ID (issue_id)
  subject: string;
  description: string;
  customerNumber: string;
  customerOrderNumber: string;
  assignedTo: string | null; // Firestore UID of staff, or null if unassigned
  status: ComplaintStatus;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  createdBy: string | null; // UID of staff who created it
}

export type ComplaintInput = Omit<
  Complaint,
  "id" | "createdAt" | "updatedAt"
>;
