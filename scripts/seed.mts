/**
 * Bootstraps Firebase Auth + Firestore with the org structure (company,
 * administrations, departments), the two base roles (Super Admin,
 * Employee), and the primary admin account, so a fresh environment has
 * something to sign in with.
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
  employeePermissions.complaints = {
    view: true,
    create: true,
    update: false,
    delete: false,
    viewAll: false,
    reassign: false,
  };
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
    nameEn: "Mohammed",
    username: "mhmd",
    password: "123456",
    number: "1001",
    phone: "",
    jobTitle: "Support Team Lead",
    departmentId: "seed-dept-support-lead",
    roleId: SUPER_ADMIN_ROLE_ID,
  },
];

async function upsertStaff(staff: SeedStaff) {
  const email = usernameToEmail(staff.username);
  try {
    await auth.updateUser(staff.uid, { email, password: staff.password, emailVerified: true, displayName: staff.nameEn });
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
    p.complaints = { view: true, create: true, update: false, delete: false, viewAll: false, reassign: false };
    return p;
  })();

  await db.collection("users").doc(staff.uid).set(
    {
      id: staff.uid,
      nameEn: staff.nameEn,
      username: staff.username,
      number: staff.number,
      phone: staff.phone,
      jobTitle: staff.jobTitle,
      companyId: COMPANY_ID,
      administrationId: department.administrationId,
      departmentId: staff.departmentId,
      roleIds: [staff.roleId],
      permissions,
    },
    { merge: true }
  );
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

  console.log("\nDone. Login -> username: mhmd, password: 123456 (Super Admin)");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
