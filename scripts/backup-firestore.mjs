// Dumps every top-level Firestore collection to one JSON file per
// collection under the given output directory. Run by
// .github/workflows/backup-database.yml, which then commits the result
// into the private backup repo — see that workflow for why this reads
// Firestore directly instead of using `gcloud firestore export` (that API
// requires the destination bucket to be in the exact same region as the
// database, which turned out to be blocked for this project/account).
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { mkdirSync, writeFileSync } from "fs";

const outDir = process.argv[2];
if (!outDir) {
  console.error("Usage: node backup-firestore.mjs <output-dir>");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function serialize(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) out[key] = serialize(v);
    return out;
  }
  return value;
}

mkdirSync(outDir, { recursive: true });

const collections = await db.listCollections();
const summary = {};
for (const collection of collections) {
  const snapshot = await collection.get();
  const data = {};
  snapshot.docs.forEach((doc) => {
    data[doc.id] = serialize(doc.data());
  });
  writeFileSync(`${outDir}/${collection.id}.json`, JSON.stringify(data, null, 2));
  summary[collection.id] = snapshot.size;
}

console.log("Backed up:", summary);
