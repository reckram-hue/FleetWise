import fs from "fs";
import path from "path";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const root = process.cwd();
const envPath = path.join(root, ".env");

if (!fs.existsSync(envPath)) {
  console.error("ERROR: Root .env file not found.");
  process.exit(1);
}

const envText = fs.readFileSync(envPath, "utf8");

function getEnv(name) {
  const line = envText
    .split(/\r?\n/)
    .find(x => x.trim().startsWith(`${name}=`));

  if (!line) return undefined;

  return line
    .substring(line.indexOf("=") + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}

const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY"),
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("VITE_FIREBASE_APP_ID")
};

console.log("");
console.log("============================================");
console.log(" FLEETWISE READ-ONLY FIRESTORE INVENTORY");
console.log("============================================");
console.log("Project:", firebaseConfig.projectId);
console.log("READ ONLY — no Firestore writes will occur.");
console.log("");

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const collectionNames = [
  "users",
  "vehicles",
  "shifts",
  "defects",
  "costs",
  "maintenanceRecords",
  "scheduledServices",
  "driverFines",
  "vehicleDamages",
  "refuelRecords",
  "chargeRecords",
  "serviceProviders",
  "settings",
  "fuelEconomyAlerts",
  "fw_health"
];

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";

  if (
    value &&
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) return "timestamp";

  if (value && typeof value === "object") return "object";

  return typeof value;
}

async function inspectCollection(name) {
  try {
    const snapshot = await getDocs(collection(db, name));
    const fields = new Map();

    snapshot.forEach(docSnap => {
      const data = docSnap.data();

      for (const [key, value] of Object.entries(data)) {
        if (!fields.has(key)) fields.set(key, new Set());
        fields.get(key).add(valueType(value));
      }
    });

    return {
      collection: name,
      count: snapshot.size,
      fields: Object.fromEntries(
        [...fields.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, types]) => [key, [...types].sort().join(" | ")])
      )
    };
  } catch (error) {
    return {
      collection: name,
      error: error?.message || String(error)
    };
  }
}

const results = [];

for (const name of collectionNames) {
  console.log(`Reading ${name}...`);
  results.push(await inspectCollection(name));
}

console.log("");
console.log("============ RESULTS ============");

for (const result of results) {
  console.log("");

  if (result.error) {
    console.log(`${result.collection}: ERROR`);
    console.log(result.error);
    continue;
  }

  console.log(`${result.collection}: ${result.count} documents`);

  for (const [field, type] of Object.entries(result.fields)) {
    console.log(`  ${field}: ${type}`);
  }
}

const reportPath = path.join(root, "firestore-inventory-output.json");

fs.writeFileSync(
  reportPath,
  JSON.stringify({
    projectId: firebaseConfig.projectId,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    results
  }, null, 2),
  "utf8"
);

console.log("");
console.log("Inventory complete.");
console.log("NO FIRESTORE WRITES WERE PERFORMED.");
console.log("Report:", reportPath);

process.exit(0);
