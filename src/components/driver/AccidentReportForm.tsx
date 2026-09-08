import React, { useEffect, useRef, useState } from 'react';
import { AccidentFields, AccidentReport } from '../../types';
import { accidentApi } from '../../services/accidentApi';
import { AccidentDraft } from '../../lib/accidentDraft';
import { accidentSteps, accidentMinimumMissing } from '../../lib/accidentFields';
import AccidentReportDetails, { AccidentEvidence } from '../shared/AccidentReportDetails';
import { getDriverSession } from '../../store/session';

const control = 'w-full min-h-11 rounded border border-gray-300 p-3';
const action = 'min-h-11 rounded border px-4 py-2 font-semibold disabled:opacity-50';
const localDateTime = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const recoveryKey = (report: AccidentReport) => {
    const session = getDriverSession();
    if (session && session.driverId !== report.driverId) throw new Error('Report does not belong to the current session.');
    return `fleetwise_accident_${session?.projectId || 'current'}_${report.driverId}_${report.id}`;
};
const readPhoto = (file: File) => new Promise<string>((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size) {
        reject(new Error('Choose a JPEG, PNG or WebP photo up to 5 MB.')); return;
    }
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
    reader.onerror = reader.onabort = () => reject(new Error('Could not read photo. Please select it again.')); reader.readAsDataURL(file);
});

export default function AccidentReportForm({ initialReport, onBack, backLabel = 'Back to Active Shift' }: { initialReport: AccidentReport; onBack: () => void; backLabel?: string }) {
    const draft = useRef<AccidentDraft | null>(null);
    const [report, setReport] = useState(initialReport);
    const [fields, setFields] = useState(initialReport.fields);
    const [step, setStep] = useState(0);
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState('');
    const [caption, setCaption] = useState('');
    const [pendingPhotos, setPendingPhotos] = useState<{ id: string; data: string; caption: string }[]>([]);
    const [photoReading, setPhotoReading] = useState(false);
    const photoLock = useRef(false);
    useEffect(() => {
        try {
            const key = recoveryKey(initialReport);
            draft.current = new AccidentDraft(initialReport, () => localStorage, key, accidentApi.save);
            setFields(draft.current.fields); setReady(true);
        } catch { setError('Could not open this report. Please reopen it from your dashboard.'); }
    }, [initialReport.id]);
    const change = (next: AccidentFields) => {
        if (busyRef.current || draft.current?.report.status === 'SUBMITTED') return;
        setFields(next); setSaved('Unsaved changes');
        draft.current!.change(next);
    };
    const save = async () => {
        if (!draft.current || busyRef.current || photoLock.current) return null;
        busyRef.current = true; setBusy(true); setError('');
        try { const r = await draft.current.save(); setFields(draft.current.fields); setReport(r); setSaved('Draft saved on server'); return r; }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not save draft. Retry Save Draft.'); return null; }
        finally { busyRef.current = false; setBusy(false); }
    };
    useEffect(() => {
        if (!ready || report.status !== 'DRAFT' || !draft.current?.dirty) return;
        const timer = setTimeout(() => { void save(); }, 800);
        return () => clearTimeout(timer);
    }, [fields, ready]);
    const upload = async () => {
        if (busyRef.current || photoLock.current) return;
        busyRef.current = true; setBusy(true); setError('');
        try {
            for (const p of pendingPhotos) {
                await accidentApi.upload(report.id, p.id, p.data, p.caption);
                setPendingPhotos(prev => prev.filter(item => item.id !== p.id));
            }
            const latest = await accidentApi.get(report.id);
            // Field edits stay in the draft controller; photos are independently attached.
            if (draft.current) draft.current.report.photos = latest.photos;
            setReport(latest);
        } catch (e) { setError(e instanceof Error ? e.message : 'Photo upload failed. Retry upload.'); }
        finally { busyRef.current = false; setBusy(false); }
    };
    const submit = async () => {
        if (pendingPhotos.length || photoLock.current || busyRef.current) return;
        const missing = accidentMinimumMissing(fields);
        if (missing.length) { setError(`Complete: ${missing.join(', ')}`); return; }
        const r = await save(); if (!r) return;
        busyRef.current = true; setBusy(true);
        try { const submitted = await accidentApi.submit(r.id, r.revision); draft.current!.submitted(submitted); setReport(submitted); setFields(submitted.fields); }
        catch (e) { setError(e instanceof Error ? e.message : 'Submission failed. Retry submission.'); }
        finally { busyRef.current = false; setBusy(false); }
    };
    return <div className="mx-auto max-w-3xl p-4 sm:p-6 bg-white">
        <h2 className="text-2xl font-bold">Accident / Collision Report</h2>
        <p className="my-2 text-sm">Vehicle and assignment are linked automatically. Provide what you know; optional details can be left blank.</p>
        {report.isTestData && <p className="font-bold text-amber-800">TEST report</p>}
        {error && <div role="alert" className="my-3 rounded bg-red-50 p-3 text-red-900"><p>{error}</p>
            <button className={action} disabled={busy || photoReading} onClick={async () => {
                if (busyRef.current) return; busyRef.current = true; setBusy(true);
                try { const latest = await accidentApi.get(report.id); const key = recoveryKey(latest); draft.current?.clearRecovery();
                    // Explicit discard must use server fields even if browser cleanup fails.
                    draft.current = new AccidentDraft(latest, () => localStorage, key, accidentApi.save, false); setReport(latest); setFields(latest.fields); setReady(true); setError(''); }
                catch { setError('Could not reload saved draft. Retry when connected.'); }
                finally { busyRef.current = false; setBusy(false); }
            }}>Use server-saved version (discard local text edits)</button>
        </div>}
        {ready && draft.current?.recoveryAvailable === false && <p role="status" className="my-3 rounded bg-amber-50 p-3 text-amber-900">
            {report.status === 'SUBMITTED' ? 'Report submitted to FleetWise. Browser recovery is unavailable.' : saved === 'Draft saved on server'
                ? 'Draft saved to FleetWise, but this browser cannot keep an offline recovery copy.'
                : 'This browser cannot keep an offline recovery copy. Save to FleetWise before leaving; unsaved text may be lost on refresh.'}
        </p>}
        {!ready ? <p role="status">Restoring report...</p> : report.status === 'SUBMITTED' ? <>
            <p role="status" className="my-4 font-bold text-green-800">Report submitted. This report is read-only.</p>
            <AccidentReportDetails report={report} /><button className={action} onClick={onBack}>{backLabel}</button>
        </> : <>
            <div className="sticky top-0 z-10 flex flex-wrap gap-2 bg-white py-3 border-b">
                <button className={action} disabled={busy || photoReading} onClick={() => { void save(); }}>Save Draft</button>
                <button className={action} disabled={busy || photoReading} onClick={async () => { if (await save()) onBack(); }}>Save & leave</button>
                <button className={action} disabled={busy || photoReading} onClick={onBack}>Leave for now</button>
                <span role="status" className="self-center text-sm">{busy ? 'Saving / uploading...' : saved}</span>
            </div>
            <p className="text-xs text-gray-600 my-2">Text is saved automatically to FleetWise when connected. This browser also keeps recovery text when available. Selected photos must finish uploading before leaving; unuploaded photos need to be selected again after refresh.</p>
            <nav aria-label="Accident report steps" className="flex flex-wrap gap-2 my-4">{accidentSteps.map((s, i) =>
                <button key={s.title} className={`${action} ${i === step ? 'bg-blue-100 border-blue-600' : ''}`} disabled={busy || photoReading} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>{i + 1}. {s.title}</button>)}</nav>
            <h3 className="text-xl font-bold mb-3">{accidentSteps[step].title}</h3>
            <fieldset disabled={busy || photoReading} className="space-y-4">
                {accidentSteps[step].fields.map(spec => <label key={spec.key} className="block"><span className="block font-medium mb-1">{spec.label}</span>
                    {spec.type === 'tri' || spec.type === 'motion' ? <select className={control} value={String(fields[spec.key] || '')} onChange={e => change({ ...fields, [spec.key]: e.target.value || null })}>
                        <option value="">Not answered</option>{(spec.type === 'tri' ? ['YES', 'NO', 'UNKNOWN'] : ['MOVING', 'PARKED', 'UNKNOWN']).map(v => <option key={v} value={v}>{v}</option>)}
                    </select> : spec.type === 'long' ? <textarea className={control} rows={3} maxLength={6000} value={String(fields[spec.key] || '')} onChange={e => change({ ...fields, [spec.key]: e.target.value })} />
                        : <input className={control} type={spec.type === 'datetime' ? 'datetime-local' : 'text'} maxLength={300}
                            value={spec.type === 'datetime' && fields.accidentAt ? localDateTime(fields.accidentAt) : String(fields[spec.key] || '')}
                            onChange={e => change({ ...fields, [spec.key]: spec.type === 'datetime' ? (e.target.value ? new Date(e.target.value).toISOString() : null) : e.target.value })} />}
                </label>)}
                {step === 0 && <><button className={action} type="button" onClick={() => {
                    if (!navigator.geolocation) { setError('GPS is unavailable. Enter a location description instead.'); return; }
                    navigator.geolocation.getCurrentPosition(p => change({ ...draft.current!.fields, gps: { latitude: p.coords.latitude, longitude: p.coords.longitude } }),
                        () => setError('GPS was unavailable or permission was denied. Typed location remains available.'), { timeout: 10000, maximumAge: 0 });
                }}>Use current location (optional)</button>{fields.gps && <p>GPS recorded: {fields.gps.latitude}, {fields.gps.longitude}</p>}</>}
                {step === 2 && <section className="space-y-3"><h4 className="font-bold">Witnesses (optional)</h4>
                    {(fields.witnesses || []).map((w, i) => <div className="border rounded p-3 space-y-2" key={i}>
                        {(['name', 'phone', 'email', 'notes'] as const).map(k => <label className="block" key={k}>Witness {i + 1} {k}
                            <input className={control} value={w[k] || ''} maxLength={k === 'notes' ? 6000 : 300} onChange={e => change({ ...fields, witnesses: fields.witnesses!.map((v, j) => j === i ? { ...v, [k]: e.target.value } : v) })} /></label>)}
                        <button className={action} onClick={() => change({ ...fields, witnesses: fields.witnesses!.filter((_, j) => j !== i) })}>Remove witness {i + 1}</button>
                    </div>)}<button className={action} disabled={(fields.witnesses?.length || 0) >= 20} onClick={() => change({ ...fields, witnesses: [...(fields.witnesses || []), {}] })}>Add witness</button>
                </section>}
                {step === 3 && fields.vehicleDriveable === 'NO' && <p role="status" className="bg-red-50 p-3 font-bold text-red-900">Vehicle reported not driveable. Contact your fleet team to arrange assistance.</p>}
                {step === 4 && <section className="space-y-3">
                    <p>Photos are optional. You can submit without photos. Up to 20 photos, 5 MB each.</p>
                    <label className="block">Photo category / description (optional)<input className={control} value={caption} maxLength={300} onChange={e => setCaption(e.target.value)} placeholder="Scene, vehicle, number plate, document..." /></label>
                    <label className="block">Add photos<input className={control} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={async e => {
                        if (photoLock.current || busyRef.current) return;
                        const files = Array.from(e.target.files || []); e.target.value = '';
                        if (files.length + pendingPhotos.length + report.photos.length > 20) { setError('Up to 20 photos per report.'); return; }
                        photoLock.current = true; setPhotoReading(true);
                        try { const selected = await Promise.all(files.map(async file => ({ id: crypto.randomUUID(), data: await readPhoto(file), caption })));
                            setPendingPhotos(p => [...p, ...selected]); setError(''); }
                        catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare photos.'); }
                        finally { photoLock.current = false; setPhotoReading(false); }
                    }} /></label>
                    {pendingPhotos.map((p, i) => <div key={p.id}><img src={p.data} alt={`Selected evidence ${i + 1}`} className="max-h-36" /><button className={action} onClick={() => setPendingPhotos(all => all.filter(v => v.id !== p.id))}>Remove selected photo {i + 1}</button></div>)}
                    {!!pendingPhotos.length && <button className={action} onClick={upload}>Upload selected photos / retry</button>}
                    <AccidentEvidence report={report} />
                </section>}
                {step === 5 && <><AccidentReportDetails report={{ ...report, fields }} />
                    <label className="flex gap-3 items-start"><input className="mt-1 h-5 w-5" type="checkbox" checked={!!fields.incompleteDetailsAcknowledged} onChange={e => change({ ...fields, incompleteDetailsAcknowledged: e.target.checked })} />
                        I confirm this report reflects what I know. Third-party details may be incomplete.</label>
                    {!!pendingPhotos.length && <p>Upload or remove selected photos before submission.</p>}
                    <button className={`${action} bg-red-700 text-white`} disabled={!!pendingPhotos.length} onClick={submit}>Submit accident report</button>
                </>}
            </fieldset>
            <div className="flex justify-between my-6"><button className={action} disabled={step === 0 || busy || photoReading} onClick={() => setStep(s => s - 1)}>Previous</button>
                <button className={action} disabled={step === 5 || busy || photoReading} onClick={() => setStep(s => s + 1)}>Next</button></div>
        </>}
    </div>;
}
