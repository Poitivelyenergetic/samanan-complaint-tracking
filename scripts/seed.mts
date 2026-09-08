/**
 * Seeds Firebase Auth + Firestore with a demo org structure (company,
 * administrations, positions), a staff directory, and a handful of sample
 * complaints so the app can be demoed immediately after setup.
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
const { ROLE_DEFAULT_PERMISSIONS } = await import("../src/lib/types");

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

// --- Org structure: one company, a couple of administrations, one position each ---
const COMPANY_ID = "seed-samnan";
const ADMINISTRATIONS = [
  { id: "seed-admin-support", name: "Customer Support" },
  { id: "seed-admin-qa", name: "Quality Assurance" },
] as const;
const POSITIONS = [
  { id: "seed-pos-support-lead", name: "Support Team Lead", administrationId: "seed-admin-support" },
  { id: "seed-pos-support-agent", name: "Customer Support Agent", administrationId: "seed-admin-support" },
  { id: "seed-pos-qa-manager", name: "Quality Assurance Manager", administrationId: "seed-admin-qa" },
] as const;

async function upsertOrgStructure() {
  await db.collection("companies").doc(COMPANY_ID).set({ name: "Samnan" });
  for (const a of ADMINISTRATIONS) {
    await db.collection("administrations").doc(a.id).set({ name: a.name, companyId: COMPANY_ID });
  }
  for (const p of POSITIONS) {
    await db
      .collection("positions")
      .doc(p.id)
      .set({ name: p.name, administrationId: p.administrationId });
  }
  console.log("Seeded org structure: 1 company, 2 administrations, 3 positions");
}

interface SeedStaff {
  uid: string;
  name: string;
  username: string;
  password: string;
  number: string;
  positionId: string;
  role: "admin" | "employee" | "user";
}

const STAFF: SeedStaff[] = [
  {
    uid: "seed-mhmd",
    name: "Mohammed Al-Otaibi",
    username: "mhmd",
    password: "123456",
    number: "1001",
    positionId: "seed-pos-support-lead",
    role: "admin",
  },
  {
    uid: "seed-sara",
    name: "Sara Al-Harbi",
    username: "sara",
    password: "123456",
    number: "1002",
    positionId: "seed-pos-support-agent",
    role: "employee",
  },
  {
    uid: "seed-ali",
    name: "Ali Al-Qahtani",
    username: "ali",
    password: "123456",
    number: "1003",
    positionId: "seed-pos-support-agent",
    role: "employee",
  },
  {
    uid: "seed-huda",
    name: "Huda Al-Zahrani",
    username: "huda",
    password: "123456",
    number: "1004",
    positionId: "seed-pos-qa-manager",
    role: "admin",
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
      displayName: staff.name,
    });
    console.log(`Created Auth user: ${staff.username}`);
  }

  const position = POSITIONS.find((p) => p.id === staff.positionId)!;

  await db.collection("users").doc(staff.uid).set({
    id: staff.uid,
    name: staff.name,
    username: staff.username,
    number: staff.number,
    companyId: COMPANY_ID,
    administrationId: position.administrationId,
    positionId: staff.positionId,
    role: staff.role,
    permissions: ROLE_DEFAULT_PERMISSIONS[staff.role],
  });
}

interface SeedComplaint {
  id: string;
  subject: string;
  description: string;
  customerNumber: string;
  customerOrderNumber: string;
  assignedTo: string | null;
  status: "Open" | "Assigned" | "Processing" | "Cancel" | "Closed";
}

const COMPLAINTS: SeedComplaint[] = [
  {
    id: "demo-1",
    subject: "Product arrived damaged",
    description:
      "Customer received the package with a cracked casing. Requesting a replacement unit and confirmation of the return shipping label.",
    customerNumber: "CUST-10432",
    customerOrderNumber: "ORD-88291",
    assignedTo: null,
    status: "Open",
  },
  {
    id: "demo-2",
    subject: "Wrong item shipped",
    description:
      "Order was placed for a medium size but a small size was delivered instead. Customer wants an exchange, not a refund.",
    customerNumber: "CUST-10488",
    customerOrderNumber: "ORD-88340",
    assignedTo: "seed-sara",
    status: "Assigned",
  },
  {
    id: "demo-3",
    subject: "Delayed delivery, order still not received",
    description:
      "Order was expected 5 days ago per the tracking info. Customer has contacted twice already and is getting frustrated with the delay.",
    customerNumber: "CUST-10510",
    customerOrderNumber: "ORD-88355",
    assignedTo: "seed-ali",
    status: "Processing",
  },
  {
    id: "demo-4",
    subject: "Duplicate charge on card",
    description:
      "Customer was charged twice for the same order. Turned out to be a duplicate submission on checkout; customer confirmed the second order was cancelled before shipment.",
    customerNumber: "CUST-10312",
    customerOrderNumber: "ORD-88109",
    assignedTo: "seed-mhmd",
    status: "Cancel",
  },
  {
    id: "demo-5",
    subject: "Refund processed, confirming resolution",
    description:
      "Customer requested a refund due to a sizing issue. Refund was issued to the original payment method and customer confirmed receipt.",
    customerNumber: "CUST-10201",
    customerOrderNumber: "ORD-87950",
    assignedTo: "seed-huda",
    status: "Closed",
  },
];

async function upsertComplaint(complaint: SeedComplaint) {
  const { id, ...data } = complaint;
  const ref = db.collection("complaints").doc(id);
  const existing = await ref.get();
  await ref.set(
    {
      ...data,
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

  console.log("\nSeeding staff...");
  for (const staff of STAFF) {
    await upsertStaff(staff);
  }

  console.log("\nSeeding sample complaints...");
  for (const complaint of COMPLAINTS) {
    await upsertComplaint(complaint);
  }

  console.log("\nDone. Demo login -> username: mhmd, password: 123456 (admin)");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
