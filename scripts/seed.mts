/**
 * Seeds Firebase Auth + Firestore with a demo org structure (company,
 * administrations, departments, roles), a staff directory, a couple of
 * demo users (customers), and a handful of sample complaints so the app
 * can be demoed immediately after setup.
 *
 * Usage: npm run seed
 * Requires FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 * in .env.local (see .env.example and the README).
 *
 * Safe to re-run: everything uses fixed, deterministic IDs and is upserted
 * rather than duplicated.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

// Load .env.local before touching firebase-admin so credentials are present
// by the time we call initializeApp below.
config({ path: resolve(process.cwd(), ".env.local") });

const { cert, initializeApp } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
const { usernameToEmail } = await import("../src/lib/username");
const { fullRolePermissions, emptyRolePermissions } = await import("../src/lib/types");

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    "Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, " +
      "FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env.local " +
      "(see .env.example)."
  );
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const auth = getAuth(app);
const db = getFirestore(app);

// --- Org structure: one company, a couple of administrations, one department each ---
const COMPANY_ID = "seed-samnan";
const ADMINISTRATIONS = [
  { id: "seed-admin-support", nameEn: "Customer Support", nameAr: "" },
  { id: "seed-admin-qa", nameEn: "Quality Assurance", nameAr: "" },
] as const;
const DEPARTMENTS = [
  { id: "seed-dept-support-lead", nameEn: "Support Team Lead", nameAr: "", administrationId: "seed-admin-support" },
  { id: "seed-dept-support-agent", nameEn: "Customer Support Agent", nameAr: "", administrationId: "seed-admin-support" },
  { id: "seed-dept-qa-manager", nameEn: "Quality Assurance Manager", nameAr: "", administrationId: "seed-admin-qa" },
] as const;

const SUPER_ADMIN_ROLE_ID = "seed-role-super-admin";
const EMPLOYEE_ROLE_ID = "seed-role-employee";

async function upsertOrgStructure() {
  await db.collection("companies").doc(COMPANY_ID).set({ number: "1", nameEn: "Samnan", nameAr: "", managerId: null });
  for (const a of ADMINISTRATIONS) {
    await db
      .collection("administrations")
      .doc(a.id)
      .set({ nameEn: a.nameEn, nameAr: a.nameAr, companyId: COMPANY_ID, managerId: null });
  }
  for (const d of DEPARTMENTS) {
    await db
      .collection("departments")
      .doc(d.id)
      .set({ nameEn: d.nameEn, nameAr: d.nameAr, administrationId: d.administrationId, managerId: null });
  }
  console.log("Seeded org structure: 1 company, 2 administrations, 3 departments");
}

async function upsertRoles() {
  await db
    .collection("roles")
    .doc(SUPER_ADMIN_ROLE_ID)
    .set({ name: "Super Admin", permissions: fullRolePermissions(), updatedAt: FieldValue.serverTimestamp() });

  const employeePermissions = emptyRolePermissions();
  employeePermissions.complaints = { view: true, create: true, update: false, delete: false };
  await db
    .collection("roles")
    .doc(EMPLOYEE_ROLE_ID)
    .set({ name: "Employee", permissions: employeePermissions, updatedAt: FieldValue.serverTimestamp() });

  console.log("Seeded roles: Super Admin, Employee");
}

interface SeedStaff {
  uid: string;
  nameEn: string;
  username: string;
  password: string;
  number: string;
  phone: string;
  jobTitle: string;
  departmentId: string;
  roleId: string;
}

const STAFF: SeedStaff[] = [
  {
    uid: "seed-mhmd",
    nameEn: "Mohammed Al-Otaibi",
    username: "mhmd",
    password: "123456",
    number: "1001",
    phone: "",
    jobTitle: "Support Team Lead",
    departmentId: "seed-dept-support-lead",
    roleId: SUPER_ADMIN_ROLE_ID,
  },
  {
    uid: "seed-sara",
    nameEn: "Sara Al-Harbi",
    username: "sara",
    password: "123456",
    number: "1002",
    phone: "",
    jobTitle: "Customer Support Agent",
    departmentId: "seed-dept-support-agent",
    roleId: EMPLOYEE_ROLE_ID,
  },
  {
    uid: "seed-ali",
    nameEn: "Ali Al-Qahtani",
    username: "ali",
    password: "123456",
    number: "1003",
    phone: "",
    jobTitle: "Customer Support Agent",
    departmentId: "seed-dept-support-agent",
    roleId: EMPLOYEE_ROLE_ID,
  },
  {
    uid: "seed-huda",
    nameEn: "Huda Al-Zahrani",
    username: "huda",
    password: "123456",
    number: "1004",
    phone: "",
    jobTitle: "Quality Assurance Manager",
    departmentId: "seed-dept-qa-manager",
    roleId: SUPER_ADMIN_ROLE_ID,
  },
];

async function upsertStaff(staff: SeedStaff) {
  const email = usernameToEmail(staff.username);
  try {
    await auth.updateUser(staff.uid, { email, password: staff.password, emailVerified: true });
    console.log(`Updated Auth user: ${staff.username}`);
  } catch {
    await auth.createUser({
      uid: staff.uid,
      email,
      password: staff.password,
      emailVerified: true,
      displayName: staff.nameEn,
    });
    console.log(`Created Auth user: ${staff.username}`);
  }

  const department = DEPARTMENTS.find((d) => d.id === staff.departmentId)!;
  const permissions = staff.roleId === SUPER_ADMIN_ROLE_ID ? fullRolePermissions() : (() => {
    const p = emptyRolePermissions();
    p.complaints = { view: true, create: true, update: false, delete: false };
    return p;
  })();

  await db.collection("users").doc(staff.uid).set({
    id: staff.uid,
    nameEn: staff.nameEn,
    nameAr: "",
    username: staff.username,
    number: staff.number,
    phone: staff.phone,
    jobTitle: staff.jobTitle,
    companyId: COMPANY_ID,
    administrationId: department.administrationId,
    departmentId: staff.departmentId,
    roleIds: [staff.roleId],
    permissions,
  });
}

interface SeedCustomer {
  id: string;
  number: string;
  nameEn: string;
  phone: string;
  employeeId: string | null;
}

const CUSTOMERS: SeedCustomer[] = [
  { id: "seed-cust-1", number: "CUST-10432", nameEn: "Demo Customer 1", phone: "0500000001", employeeId: null },
  { id: "seed-cust-2", number: "CUST-10488", nameEn: "Demo Customer 2", phone: "0500000002", employeeId: null },
  { id: "seed-cust-3", number: "CUST-10510", nameEn: "Demo Customer 3", phone: "0500000003", employeeId: null },
  { id: "seed-cust-4", number: "CUST-10312", nameEn: "Demo Customer 4", phone: "0500000004", employeeId: null },
  { id: "seed-cust-5", number: "CUST-10201", nameEn: "Demo Customer 5", phone: "0500000005", employeeId: null },
];

async function upsertCustomer(customer: SeedCustomer) {
  const { id, ...data } = customer;
  await db.collection("customers").doc(id).set({ ...data, nameAr: "" });
}

interface SeedComplaint {
  id: string;
  subject: string;
  description: string;
  customerNumber: string;
  customerId: string;
  customerOrderNumber: string;
  assignedTo: string | null;
  status: "Open" | "Assigned" | "Processing" | "Cancel" | "Closed";
  source: "Twitter" | "Facebook" | "Phone" | "Website" | "WalkIn" | "Other";
}

const COMPLAINTS: SeedComplaint[] = [
  {
    id: "demo-1",
    subject: "Product arrived damaged",
    description:
      "Customer received the package with a cracked casing. Requesting a replacement unit and confirmation of the return shipping label.",
    customerNumber: "CUST-10432",
    customerId: "seed-cust-1",
    customerOrderNumber: "ORD-88291",
    assignedTo: null,
    status: "Open",
    source: "Website",
  },
  {
    id: "demo-2",
    subject: "Wrong item shipped",
    description:
      "Order was placed for a medium size but a small size was delivered instead. Customer wants an exchange, not a refund.",
    customerNumber: "CUST-10488",
    customerId: "seed-cust-2",
    customerOrderNumber: "ORD-88340",
    assignedTo: "seed-sara",
    status: "Assigned",
    source: "Phone",
  },
  {
    id: "demo-3",
    subject: "Delayed delivery, order still not received",
    description:
      "Order was expected 5 days ago per the tracking info. Customer has contacted twice already and is getting frustrated with the delay.",
    customerNumber: "CUST-10510",
    customerId: "seed-cust-3",
    customerOrderNumber: "ORD-88355",
    assignedTo: "seed-ali",
    status: "Processing",
    source: "Twitter",
  },
  {
    id: "demo-4",
    subject: "Duplicate charge on card",
    description:
      "Customer was charged twice for the same order. Turned out to be a duplicate submission on checkout; customer confirmed the second order was cancelled before shipment.",
    customerNumber: "CUST-10312",
    customerId: "seed-cust-4",
    customerOrderNumber: "ORD-88109",
    assignedTo: "seed-mhmd",
    status: "Cancel",
    source: "WalkIn",
  },
  {
    id: "demo-5",
    subject: "Refund processed, confirming resolution",
    description:
      "Customer requested a refund due to a sizing issue. Refund was issued to the original payment method and customer confirmed receipt.",
    customerNumber: "CUST-10201",
    customerId: "seed-cust-5",
    customerOrderNumber: "ORD-87950",
    assignedTo: "seed-huda",
    status: "Closed",
    source: "Facebook",
  },
];

async function upsertComplaint(complaint: SeedComplaint) {
  const { id, ...data } = complaint;
  const ref = db.collection("complaints").doc(id);
  const existing = await ref.get();
  await ref.set(
    {
      ...data,
      channel: "staff",
      createdBy: "seed-mhmd",
      createdAt: existing.exists ? existing.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log(`Upserted complaint: ${complaint.subject}`);
}

async function main() {
  console.log("Seeding org structure...");
  await upsertOrgStructure();

  console.log("\nSeeding roles...");
  await upsertRoles();

  console.log("\nSeeding staff...");
  for (const staff of STAFF) {
    await upsertStaff(staff);
  }

  console.log("\nSeeding demo users...");
  for (const customer of CUSTOMERS) {
    await upsertCustomer(customer);
  }

  console.log("\nSeeding sample complaints...");
  for (const complaint of COMPLAINTS) {
    await upsertComplaint(complaint);
  }

  console.log("\nDone. Demo login -> username: mhmd, password: 123456 (Super Admin)");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
