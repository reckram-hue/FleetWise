import React from "react";
import { firebaseConfigured } from "../../lib/firebase";
import { writeHealthProbe, readHealthProbe } from "../../lib/firebaseHealth";

export default function AdminHealth() {
  const [server, setServer] = React.useState<any>(null);
  const [writeOk, setWriteOk] = React.useState<null | boolean>(null);
  const [readOk, setReadOk] = React.useState<null | boolean>(null);
  const [doc, setDoc] = React.useState<any>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function pingServer() {
    try {
      const r = await fetch("/health");
      const j = await r.json();
      setServer(j);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  async function testFirestore() {
    try {
      await writeHealthProbe({ client: "admin-ui" });
      setWriteOk(true);
      const rd = await readHealthProbe();
      setDoc(rd);
      setReadOk(!!rd);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setWriteOk(false);
      setReadOk(false);
    }
  }

  React.useEffect(() => { pingServer(); }, []);

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-3">System Health</h1>

      <div className="rounded border p-3 mb-3">
        <div className="font-medium">Server</div>
        <pre className="text-sm bg-gray-50 p-2 rounded overflow-x-auto">
          {JSON.stringify(server, null, 2)}
        </pre>
      </div>

      <div className="rounded border p-3 mb-3">
        <div className="font-medium mb-2">
          Firebase: {firebaseConfigured ? "CONFIGURED" : "NOT CONFIGURED"}
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1 rounded border" onClick={testFirestore} disabled={!firebaseConfigured}>
            Firestore Read/Write Test
          </button>
        </div>
        <div className="text-sm mt-2">
          Write: {writeOk === null ? "—" : writeOk ? "OK" : "FAILED"} |
          Read: {readOk === null ? "—" : readOk ? "OK" : "FAILED"}
        </div>
        {doc && (
          <pre className="text-sm bg-gray-50 p-2 rounded overflow-x-auto mt-2">
            {JSON.stringify(doc, null, 2)}
          </pre>
        )}
      </div>

      {err && <div className="text-red-600 text-sm">Error: {err}</div>}
    </div>
  );
}
