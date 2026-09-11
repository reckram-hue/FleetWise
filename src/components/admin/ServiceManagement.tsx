import React, { useEffect, useRef, useState } from 'react';
import api from '../../services/firebaseApi';
import { DefectReport, ScheduledService, ServiceProvider, Vehicle } from '../../types';
import Card from '../shared/Card';
import { MaintenanceModal } from './ManageVehicles';
import { formatVehicleIdentity } from '../../lib/vehicleIdentity';

function timestamp(value: unknown): number | null {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}
export function servicePresentation(s: ScheduledService, vehicle?: Vehicle): { label: string; stage: Stage; canRelease: boolean; detail?: string } {
  // Service-specific release evidence survives a later, unrelated vehicle hold.
  if (timestamp(s.releasedAt) !== null) return { label: 'Released / Completed', stage: 'Completed', canRelease: false };
  if (!s.returnedFromService) return { label: s.sentForService ? 'At workshop' : s.isBooked ? 'Scheduled / Booked' : 'Scheduled',
    stage: s.sentForService ? 'At workshop' : 'Scheduled', canRelease: false };
  const current = vehicle?.id === s.vehicleId ? vehicle : undefined;
  const completedAt = timestamp(s.completedAt), lastReleasedAt = timestamp(current?.lastReleasedAt);
  // Separate lifecycle release does not rewrite an older service's hold ID.
  // Require a dated release AFTER this modern completion and explicitly cleared
  // current holds. Active alone proves no service release or hold ownership.
  if (s.holdId && completedAt !== null && lastReleasedAt !== null && lastReleasedAt > completedAt && current?.lastReleasedBy &&
      current.status === 'Active' && current.maintenanceHold === null && current.manualMaintenanceHold === false) {
    return { label: 'Released / Completed', stage: 'Completed', canRelease: false,
      detail: 'Vehicle released through a separate lifecycle review after this work was completed.' };
  }
  if (s.holdId && current?.maintenanceHold?.id && ['In Service', 'Repairs'].includes(current.status)) {
    const ownsHold = s.holdId === current.maintenanceHold.id;
    return { label: 'Work completed / Awaiting release', stage: 'Awaiting release', canRelease: ownsHold,
      detail: ownsHold ? 'Work recorded. Review the release checks to make the vehicle available.' :
        'A separate hold is active. Review and release the current hold in Manage Vehicles.' };
  }
  return { label: 'Work completed — release status unavailable', stage: 'Release status unavailable', canRelease: false,
    detail: 'Release evidence is unavailable for this work. Review the vehicle lifecycle in Manage Vehicles.' };
}
export function serviceState(s: ScheduledService, vehicle?: Vehicle) { return servicePresentation(s, vehicle).label; }
type Action = 'book' | 'dispatch' | 'complete' | 'release';
type Form = { action: Action; requestId: string; serviceId: string; vehicleId: string; serviceType: string; dueDate: string;
  dueOdometer: string; bookedDate: string; bookedTime: string; serviceProviderId: string; notes: string; actualDate: string;
  odometer: string; cost: string; linked: string[]; resolved: string[]; clearManualHold: boolean; expectedRevision: number;
  expectedLifecycleRevision: number; expectedHoldId: string | null; holdReason: string; reviewedDefects: DefectReport[] };
const today = () => new Date().toISOString().slice(0, 10);
const stages = ['All services', 'Scheduled', 'At workshop', 'Awaiting release', 'Completed', 'Release status unavailable'] as const;
type Stage = typeof stages[number];
export default function ServiceManagement({ onChanged, initialVehicleId = '', onManageWorkshops }: { onChanged: () => void; initialVehicleId?: string; onManageWorkshops?: (vehicleId?: string) => void }) {
  const [services, setServices] = useState<ScheduledService[]>([]), [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]), [defects, setDefects] = useState<DefectReport[]>([]);
  const [form, setForm] = useState<Form | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [includeTest, setIncludeTest] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState(initialVehicleId), [stage, setStage] = useState<Stage>('All services');
  const [historyVehicle, setHistoryVehicle] = useState<Vehicle | null>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (form) { formHeading.current?.focus(); formHeading.current?.scrollIntoView({ block: 'start' }); }
  }, [form?.requestId]);
  async function reload() {
    const [s,v,p,d] = await Promise.all([api.getScheduledServices(), api.getVehicles(), api.getServiceProviders(true), api.getAllDefects()]);
    setServices(s); setVehicles(v); setProviders(p); setDefects(d);
  }
  useEffect(() => { reload().catch(e => setError(e.message || 'Could not load services.')).finally(() => setLoading(false)); }, []);
  const isTest = (s: ScheduledService) => s.isTestData === true || vehicles.find(v => v.id === s.vehicleId)?.isTestData === true;
  const selectedVehicle = vehicles.find(v => v.id === vehicleFilter);
  // An explicit vehicle-context link may show that TEST vehicle; fleet-wide views still exclude TEST by default.
  const scoped = services.filter(s => (includeTest || !isTest(s) || (initialVehicleId === s.vehicleId && vehicleFilter === s.vehicleId)) && (!vehicleFilter || s.vehicleId === vehicleFilter));
  const presentation = (s: ScheduledService) => servicePresentation(s, vehicles.find(v => v.id === s.vehicleId));
  const visible = scoped.filter(s => stage === 'All services' || presentation(s).stage === stage);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const reminders = visible.filter(s => presentation(s).stage === 'Scheduled' && s.isBooked && !s.reminderSent && s.bookedDate === tomorrow);
  const identity = (id: string) => formatVehicleIdentity({ vehicleId: id }, vehicles.find(v => v.id === id));
  const label = (id: string) => identity(id).primary;
  function open(action: Action, s?: ScheduledService) {
    setError(''); setNotice('');
    const vehicle = vehicles.find(v => v.id === s?.vehicleId);
    setForm({ action, requestId: crypto.randomUUID(), serviceId: s?.id || crypto.randomUUID(), vehicleId: s?.vehicleId || vehicleFilter,
      reviewedDefects: defects.filter(d => d.vehicleId === s?.vehicleId).map(d => ({ ...d })),
      expectedLifecycleRevision: vehicle?.lifecycleRevision || 0, expectedHoldId: vehicle?.maintenanceHold?.id || null,
      holdReason: vehicle?.maintenanceHold?.reason || vehicle?.statusNotes || 'Legacy hold: review and confirm the current condition in vehicle lifecycle.',
      serviceType: s?.serviceType || '', dueDate: s?.dueDate || today(), dueOdometer: s ? String(s.dueOdometer) : '',
      bookedDate: s?.bookedDate || today(), bookedTime: s?.bookedTime || '09:00', serviceProviderId: s?.serviceProviderId || providers.find(p => p.name === s?.serviceProvider)?.id || '',
      notes: action === 'book' ? s?.notes || '' : '', actualDate: today(), odometer: '', cost: '', linked: s?.linkedDefectIds || [], resolved: [], clearManualHold: false, expectedRevision: s?.revision || 0 });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!form || busy) return;
    setBusy(true); setError('');
    try {
      if (form.action === 'book') await api.saveScheduledServiceAdmin({ serviceId: form.serviceId, vehicleId: form.vehicleId,
        serviceType: form.serviceType, dueDate: form.dueDate, dueOdometer: Number(form.dueOdometer), bookedDate: form.bookedDate,
        bookedTime: form.bookedTime, serviceProviderId: form.serviceProviderId, notes: form.notes, linkedDefectIds: form.linked, expectedRevision: form.expectedRevision });
      if (form.action === 'dispatch') await api.dispatchServiceAdmin({ serviceId: form.serviceId, vehicleId: form.vehicleId, sentDate: form.actualDate });
      if (form.action === 'complete') await api.completeServiceAdmin({ serviceId: form.serviceId, vehicleId: form.vehicleId,
        returnDate: form.actualDate, odometer: Number(form.odometer), actualCost: Number(form.cost), serviceNotes: form.notes, resolvedDefectIds: form.resolved,
        expectedDefectRevisions: Object.fromEntries(form.resolved.map(id => [id, form.reviewedDefects.find(d => d.id === id)?.defectRevision ?? 0])) });
      if (form.action === 'release') await api.changeVehicleLifecycleAdmin({ vehicleId: form.vehicleId, requestId: form.requestId,
        status: 'Active', notes: form.notes, clearManualHold: form.clearManualHold, releaseServiceId: form.serviceId,
        expectedLifecycleRevision: form.expectedLifecycleRevision, expectedHoldId: form.expectedHoldId });
      setForm(null); setNotice('Saved.'); await reload(); onChanged();
    } catch (e: any) { setError(e.message || 'Could not save. Retry with the same details or reload the saved record.'); }
    finally { setBusy(false); }
  }
  const patch = (p: Partial<Form>) => setForm(f => f ? { ...f, ...p } : f);
  return <Card>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Bookings & workshop progress</h2>
      <button className="bg-blue-600 text-white rounded px-4 py-2" disabled={busy || loading} onClick={() => open('book')}>Schedule service</button>
      <button className="underline min-h-11" disabled={busy} onClick={() => { setError(''); reload().catch(e => setError(e.message)); }}>Refresh services</button></div>
    <p className="text-gray-600 mt-3">Schedule service, send the vehicle to a workshop, record completed work, then release it to make it available.</p>
    {!loading && !error && !form && providers.length === 0 && <div className="border border-amber-300 bg-amber-50 rounded p-3 mt-3" role="status">
      <p className="font-semibold">No active workshops are available for booking.</p>
      <p>Add a workshop or activate an existing service provider before scheduling service. Workshop setup requires a name, contact person, phone, email and at least one specialization.</p>
      {onManageWorkshops && <button type="button" className="underline min-h-11" onClick={() => onManageWorkshops(vehicleFilter || undefined)}>Manage workshops</button>}
    </div>}
    <div className="flex flex-wrap items-end gap-3 my-4">
      <label className="w-full sm:flex-1 min-w-0">Vehicle
        <select disabled={busy} aria-label="Filter by vehicle" className="block border rounded p-2 w-full min-h-11" value={vehicleFilter} onChange={e => { setVehicleFilter(e.target.value); setForm(null); }}>
          <option value="">All vehicles</option>{vehicles.filter(v => includeTest || !v.isTestData || v.id === initialVehicleId).map(v => <option key={v.id} value={v.id}>{label(v.id)}{identity(v.id).secondary ? ` — ${identity(v.id).secondary}` : ''}{v.isTestData ? ' — TEST' : ''}</option>)}
        </select>
      </label>
      <button className="border border-blue-700 text-blue-800 rounded px-3 min-h-11 disabled:text-gray-500 disabled:border-gray-300" disabled={busy || !selectedVehicle} onClick={() => setHistoryVehicle(selectedVehicle || null)}>Maintenance history</button>
    </div>
    <p className="text-sm text-gray-600">Select a vehicle to view its maintenance history, including past work without a booking.</p>
    <label className="block my-3"><input type="checkbox" disabled={busy} checked={includeTest} onChange={e => { setIncludeTest(e.target.checked); setForm(null); if (!e.target.checked && selectedVehicle?.isTestData && vehicleFilter !== initialVehicleId) setVehicleFilter(''); }} /> Include TEST services</label>
    <div role="group" aria-label="Service progress" className="flex flex-wrap gap-2 my-4">{stages.map(value => <button key={value} aria-pressed={stage === value} onClick={() => setStage(value)} className={`min-h-11 px-3 py-2 rounded border ${stage === value ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-700 border-gray-300'}`}>{value} ({value === 'All services' ? scoped.length : scoped.filter(s => presentation(s).stage === value).length})</button>)}</div>
    {!!reminders.length && <div className="border border-orange-200 bg-orange-50 rounded p-3 my-3"><h3 className="font-bold">Service Reminders Needed</h3>
      {reminders.map(s => <p key={s.id}>{label(s.vehicleId)} — {s.serviceType} tomorrow at {s.bookedTime} ({s.serviceProvider})</p>)}
      <p>Send appointment reminders to prevent missed bookings.</p></div>}
    {error && !form && <p role="alert" className="text-red-800 my-3">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading ? <p>Loading services…</p> : <div className="space-y-3">
      {visible.map(s => { const state = presentation(s); return <article key={s.id} aria-label={`${label(s.vehicleId)} — ${s.serviceType}`} className="border rounded-lg p-4 bg-gray-50 break-words">
        <div className="grid gap-3 md:grid-cols-3">
          <div><h3 className="font-bold text-lg">{label(s.vehicleId)}{isTest(s) && ' — TEST'}</h3><p className="text-sm text-gray-600">{identity(s.vehicleId).secondary}</p>
            <p className="font-medium mt-2">{s.serviceType}</p><p className="text-sm">{s.serviceProvider || 'Workshop not selected'}</p></div>
          <div className="text-sm"><p>Due: {s.dueDate} · {s.dueOdometer != null ? `${s.dueOdometer.toLocaleString()} km` : 'Odometer not set'}</p>
            <p>{s.sentForService ? `Sent: ${s.sentDate}` : s.isBooked ? `Booked: ${s.bookedDate} at ${s.bookedTime}` : 'Not booked yet'}</p>
            {state.stage === 'Scheduled' && s.dueDate <= today() && <p className="text-red-700 font-bold">{s.dueDate === today() ? 'Due today' : 'Overdue'}</p>}</div>
          <div><p className="font-semibold text-blue-900">{state.label}</p>{s.returnedFromService && <p className="text-sm">Completed {s.returnDate} · R {s.actualCost?.toLocaleString()}</p>}
            {state.detail && <p className="text-sm mt-1">{state.detail}</p>}</div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {state.stage === 'Scheduled' && <><button className="underline min-h-11 px-2" disabled={busy} onClick={() => open('book', s)}>Book / edit</button>
            {s.isBooked && <button className="bg-blue-700 text-white rounded min-h-11 px-3" disabled={busy} onClick={() => open('dispatch', s)}>Send to workshop</button>}</>}
          {state.stage === 'At workshop' && <button className="bg-blue-700 text-white rounded min-h-11 px-3" disabled={busy} onClick={() => open('complete', s)}>Record completed work</button>}
          {state.canRelease && <button className="bg-blue-700 text-white rounded min-h-11 px-3" disabled={busy} onClick={() => open('release', s)}>Release vehicle</button>}
          <button className="underline min-h-11 px-2" disabled={busy || !vehicles.some(v => v.id === s.vehicleId)} onClick={() => setHistoryVehicle(vehicles.find(v => v.id === s.vehicleId) || null)}>View maintenance history</button>
        </div>
      </article>; })}
      {!visible.length && <p className="py-4">No services in this selection. Choose another stage or vehicle, or schedule service.</p>}
    </div>}
    {form && <form onSubmit={submit} className="border rounded p-4 mt-4 space-y-3" aria-label="Service operation">
      <h3 ref={formHeading} tabIndex={-1} className="font-bold">{form.action === 'book' ? 'Book service' : form.action === 'dispatch' ? 'Send to workshop' : form.action === 'complete' ? 'Complete service work' : 'Release vehicle to Active'}</h3>
      {error && <p role="alert" className="text-red-800">{error}</p>}
      {form.action === 'book' && <p className="text-sm text-gray-600">All booking fields are required except notes and defect links.</p>}
      {form.action === 'book' ? <div className="grid md:grid-cols-2 gap-3">
        <label>Vehicle<select required disabled={services.some(s => s.id === form.serviceId)} value={form.vehicleId} onChange={e => patch({ vehicleId: e.target.value, linked: [] })} className="block border p-2 w-full"><option value="">Select vehicle</option>{vehicles.filter(v => !['Sold','End of Life'].includes(v.status) && (includeTest || !v.isTestData || v.id === initialVehicleId)).map(v => <option value={v.id} key={v.id}>{label(v.id)}{v.isTestData ? ' — TEST' : ''}</option>)}</select></label>
        <label>Service type<input required value={form.serviceType} onChange={e => patch({ serviceType: e.target.value })} className="block border p-2 w-full" /></label>
        <label>Due date<input required type="date" value={form.dueDate} onChange={e => patch({ dueDate: e.target.value })} className="block border p-2 w-full min-w-0" /></label>
        <label>Due odometer (km)<input required type="number" min="0" value={form.dueOdometer} onChange={e => patch({ dueOdometer: e.target.value })} className="block border p-2 w-full min-w-0" /></label>
        <label>Booked date<input required type="date" value={form.bookedDate} onChange={e => patch({ bookedDate: e.target.value })} className="block border p-2 w-full min-w-0" /></label>
        <label>Booked time<input required type="time" value={form.bookedTime} onChange={e => patch({ bookedTime: e.target.value })} className="block border p-2 w-full min-w-0" /></label>
        <label>Workshop<select required value={form.serviceProviderId} onChange={e => patch({ serviceProviderId: e.target.value })} className="block border p-2 w-full min-w-0"><option value="">Select workshop</option>{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {providers.length === 0 && <div className="border border-amber-300 bg-amber-50 rounded p-3 md:col-span-2" role="status">
          <p>No active workshops are available. Add a workshop or activate an existing service provider before booking.</p>
          {onManageWorkshops && <button type="button" className="underline min-h-11" onClick={() => onManageWorkshops(form.vehicleId || undefined)}>Manage workshops</button>}
          <p className="text-sm">Your selected vehicle will be retained. Re-enter any unsaved booking details when you return.</p>
        </div>}
      </div> : <p>{label(form.vehicleId)}</p>}
      {(form.action === 'book' || form.action === 'complete') && <fieldset><legend>{form.action === 'book' ? 'Defects addressed by this service' : 'Explicitly resolve repaired defects'}</legend>
        {(form.action === 'complete' ? form.reviewedDefects : defects).filter(d => d.vehicleId === form.vehicleId && !['Resolved','Duplicate'].includes(d.status) && (form.action === 'book' || form.linked.includes(d.id))).map(d => {
          const key = form.action === 'book' ? 'linked' : 'resolved'; return <label className="block" key={d.id}><input type="checkbox" checked={form[key].includes(d.id)} onChange={e => patch({ [key]: e.target.checked ? [...form[key], d.id] : form[key].filter(id => id !== d.id) })} /> {d.description} ({d.urgency})</label>;
        })}</fieldset>}
      {(form.action === 'dispatch' || form.action === 'complete') && <label className="block">Actual {form.action === 'dispatch' ? 'dispatch' : 'completion'} date<input required type="date" max={today()} value={form.actualDate} onChange={e => patch({ actualDate: e.target.value })} className="block border p-2 w-full min-w-0" /></label>}
      {form.action === 'complete' && <><p>Completion records work and cost. The vehicle remains unavailable until explicitly released.</p>
        <label className="block">Actual completion odometer (km)<input required type="number" min="0" step="any" value={form.odometer} onChange={e => patch({ odometer: e.target.value })} className="block border p-2 w-full min-w-0" /></label>
        <label className="block">Actual cost (R)<input required type="number" min="0" step="0.01" value={form.cost} onChange={e => patch({ cost: e.target.value })} className="block border p-2 w-full min-w-0" /></label></>}
      {form.action === 'release' && <><p>Current hold: {form.holdReason}</p><p>All dispatched work and linked or critical defects must be resolved. This service must belong to the current hold. If the hold changes, cancel, refresh and review it again.</p>
        <label className="block"><input type="checkbox" checked={form.clearManualHold} onChange={e => patch({ clearManualHold: e.target.checked })} /> I also confirm any separate manual maintenance/repair hold has been addressed.</label></>}
      {form.action !== 'dispatch' && <label className="block">{form.action === 'complete' ? 'Completion notes' : form.action === 'release' ? 'Release reason' : 'Booking notes'}<textarea required={form.action !== 'book'} value={form.notes} onChange={e => patch({ notes: e.target.value })} className="block border p-2 w-full" /></label>}
      <button disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded">{busy ? 'Saving…' : 'Save service operation'}</button>
      <button type="button" disabled={busy} className="ml-3 underline" onClick={() => setForm(null)}>Cancel</button>
    </form>}
    {historyVehicle && <MaintenanceModal key={historyVehicle.id} vehicle={historyVehicle} onClose={() => setHistoryVehicle(null)} onRecordAdded={v => { setHistoryVehicle(v); reload().catch(e => setError(e.message)); onChanged(); }} />}
  </Card>;
}
