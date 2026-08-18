import { db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const COLL = "fw_health";
const DOC = "probe";

export async function writeHealthProbe(meta?: Record<string, unknown>) {
  await setDoc(
    doc(db, COLL, DOC),
    { ok: true, at: serverTimestamp(), ...meta },
    { merge: true }
  );
  return true;
}

export async function readHealthProbe() {
  const snap = await getDoc(doc(db, COLL, DOC));
  return snap.exists() ? snap.data() : null;
}
