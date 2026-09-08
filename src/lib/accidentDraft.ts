import { AccidentFields, AccidentReport } from '../types';

type PendingSave = { revision: number; mutationId: string; fields: AccidentFields };
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
// Write-through recovery stores no credential. Server revision checks prevent another
// window's edits from being silently overwritten. Pending requests retain their exact ID.
export class AccidentDraft {
    fields: AccidentFields;
    pending: PendingSave | null = null;
    recoveryAvailable = true;
    private saving: Promise<AccidentReport> | null = null;
    constructor(public report: AccidentReport, private storage: DraftStorage | (() => DraftStorage), private key: string,
        private persist: (id: string, revision: number, mutationId: string, fields: AccidentFields) => Promise<AccidentReport>, restore = true) {
        this.fields = report.fields;
        if (report.status === 'SUBMITTED') { this.clearRecovery(); return; }
        if (!restore) return;
        try {
            const raw = this.browserStorage().getItem(key);
            if (raw) {
                const local = JSON.parse(raw);
                if (local.reportId === report.id) {
                    this.fields = local.fields;
                    this.pending = local.pending;
                    const acknowledged = !!this.pending && this.pending.mutationId === report.lastMutationId;
                    if (acknowledged) this.pending = null;
                    // Preserve the old revision on unsent edits, too: conflict must be explicit.
                    if (!acknowledged && !this.pending && local.revision !== report.revision && local.lastMutationId !== report.lastMutationId) {
                        this.pending = { revision: local.revision, mutationId: crypto.randomUUID(), fields: this.fields };
                    }
                }
            }
        } catch { this.recoveryAvailable = false; }
    }
    private browserStorage() { return typeof this.storage === 'function' ? this.storage() : this.storage; }
    clearRecovery() {
        try { this.browserStorage().removeItem(this.key); }
        catch { this.recoveryAvailable = false; }
    }
    private backup() {
        try {
            this.browserStorage().setItem(this.key, JSON.stringify({ reportId: this.report.id, revision: this.report.revision,
                lastMutationId: this.report.lastMutationId, fields: this.fields, pending: this.pending }));
            this.recoveryAvailable = true;
        } catch {
            this.recoveryAvailable = false;
            // Remove a stale copy when possible; server persistence still proceeds.
            this.clearRecovery();
        }
    }
    change(fields: AccidentFields) { this.fields = fields; this.backup(); }
    get dirty() { return !!this.pending || JSON.stringify(this.fields) !== JSON.stringify(this.report.fields); }
    save(): Promise<AccidentReport> {
        if (this.saving) return this.saving;
        this.saving = this.flush().finally(() => { this.saving = null; });
        return this.saving;
    }
    private async flush() {
        while (this.dirty) {
            this.pending ||= { revision: this.report.revision, mutationId: crypto.randomUUID(), fields: this.fields };
            this.backup();
            const p = this.pending;
            this.report = await this.persist(this.report.id, p.revision, p.mutationId, p.fields);
            if (JSON.stringify(this.fields) === JSON.stringify(p.fields)) this.fields = this.report.fields;
            this.pending = null;
            this.backup();
        }
        return this.report;
    }
    submitted(report: AccidentReport) { this.report = report; this.fields = report.fields; this.pending = null; this.clearRecovery(); }
}
