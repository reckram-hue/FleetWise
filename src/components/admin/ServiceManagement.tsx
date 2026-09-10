import React, { useEffect, useState } from 'react';
import api from '../../services/firebaseApi';
import { DefectReport, ScheduledService, ServiceProvider, Vehicle } from '../../types';
import Card from '../shared/Card';

export function serviceState(s: ScheduledService) {
  if (s.releasedAt) return 'Released / Completed';
  if (s.returnedFromService) return 'Work Completed / Awaiting Release';
  if (s.sentForService) return 'In Service';
  return s.isBooked ? 'Scheduled / Booked' : 'Scheduled';
}
type Action = 'book' | 'dispatch' | 'complete' | 'release';
type Form = { action: Action; requestId: string; serviceId: string; vehicleId: string; serviceType: string; dueDate: string;
  dueOdometer: string; bookedDate: string; bookedTime: string; serviceProviderId: string; notes: string; actualDate: string;
  odometer: string; cost: string; linked: string[]; resolved: string[]; clearManualHold: boolean; expectedRevision: number;
  expectedLifecycleRevision: number; expectedHoldId: string | null; holdReason: string; reviewedDefects: DefectReport[] };
const today = () => new Date().toISOString().slice(0, 10);
export default function ServiceManagement({ onChanged }: { onChanged: () => void }) {
  const [services, setServices] = useState<ScheduledService[]>([]), [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]), [defects, setDefects] = useState<DefectReport[]>([]);
  const [form, setForm] = useState<Form | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [includeTest, setIncludeTest] = useState(false);
  async function reload() {
    const [s,v,p,d] = await Promise.all([api.getScheduledServices(), api.getVehicles(), api.getServiceProviders(true), api.getAllDefects()]);
    setServices(s); setVehicles(v); setProviders(p); setDefects(d);
  }
  useEffect(() => { reload().catch(e => setError(e.message || 'Could not load services.')).finally(() => setLoading(false)); }, []);
  const isTest = (s: ScheduledService) => s.isTestData === true || vehicles.find(v => v.id === s.vehicleId)?.isTestData === true;
  const visible = services.filter(s => includeTest || !isTest(s));
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const reminders = visible.filter(s => s.isBooked && !s.sentForService && !s.returnedFromService && !s.reminderSent && s.bookedDate === tomorrow);
  const label = (id: string) => vehicles.find(v => v.id === id)?.registration || id;
  function open(action: Action, s?: ScheduledService) {
    setError(''); setNotice('');
    const vehicle = vehicles.find(v => v.id === s?.vehicleId);
    setForm({ action, requestId: crypto.randomUUID(), serviceId: s?.id || crypto.randomUUID(), vehicleId: s?.vehicleId || '',
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
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Service Management</h2>
      <button className="bg-blue-600 text-white rounded px-4 py-2" disabled={busy || loading} onClick={() => open('book')}>Schedule service</button>
      <button className="underline min-h-11" disabled={busy} onClick={() => { setError(''); reload().catch(e => setError(e.message)); }}>Refresh services</button></div>
    <label className="block my-3"><input type="checkbox" checked={includeTest} onChange={e => { setIncludeTest(e.target.checked); setForm(null); }} /> Include TEST services</label>
    {!!reminders.length && <div className="border border-orange-200 bg-orange-50 rounded p-3 my-3"><h3 className="font-bold">Service Reminders Needed</h3>
      {reminders.map(s => <p key={s.id}>{label(s.vehicleId)} — {s.serviceType} tomorrow at {s.bookedTime} ({s.serviceProvider})</p>)}
      <p>Send appointment reminders to prevent missed bookings.</p></div>}
    {error && <p role="alert" className="text-red-800 my-3">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading ? <p>Loading services…</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left [&_th]:p-2 [&_td]:p-2"><thead><tr><th>Vehicle</th><th>Service / workshop</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{visible.map(s => <tr key={s.id} className="border-t"><td className="p-3">{label(s.vehicleId)}{isTest(s) && ' — TEST'}</td>
        <td>{s.serviceType}<small className="block">{s.serviceProvider || 'Workshop not selected'}</small>
          <small className="block">{s.sentForService ? `Sent: ${s.sentDate}` : s.isBooked ? `${s.bookedDate} at ${s.bookedTime}` : 'Not booked'}</small></td>
        <td>{s.dueDate}<small className="block">{s.dueOdometer} km</small>{!s.returnedFromService && s.dueDate <= today() && <small className="block text-red-700 font-bold">{s.dueDate === today() ? 'Due today' : 'Overdue'}</small>}</td>
        <td>{serviceState(s)}{s.returnedFromService && <small className="block">Completed {s.returnDate} · R {s.actualCost?.toLocaleString()}</small>}</td>
        <td>{!s.sentForService && !s.returnedFromService && <><button className="underline p-2" disabled={busy} onClick={() => open('book', s)}>Book / edit</button>
          {s.isBooked && <button className="underline p-2" disabled={busy} onClick={() => open('dispatch', s)}>Send for Service</button>}</>}
          {s.sentForService && !s.returnedFromService && <button className="underline p-2" disabled={busy} onClick={() => open('complete', s)}>Complete work</button>}
          {s.returnedFromService && !s.releasedAt && <button className="underline p-2" disabled={busy} onClick={() => open('release', s)}>Release vehicle</button>}</td></tr>)}</tbody></table>
      {!visible.length && <p className="py-4">No services in this selection.</p>}</div>}
    {form && <form onSubmit={submit} className="border rounded p-4 mt-4 space-y-3" aria-label="Service operation">
      <h3 className="font-bold">{form.action === 'book' ? 'Book service' : form.action === 'dispatch' ? 'Send for Service' : form.action === 'complete' ? 'Complete service work' : 'Release vehicle to Active'}</h3>
      {form.action === 'book' ? <div className="grid md:grid-cols-2 gap-3">
        <label>Vehicle<select required disabled={services.some(s => s.id === form.serviceId)} value={form.vehicleId} onChange={e => patch({ vehicleId: e.target.value, linked: [] })} className="block border p-2 w-full"><option value="">Select vehicle</option>{vehicles.filter(v => !['Sold','End of Life'].includes(v.status) && (includeTest || !v.isTestData)).map(v => <option value={v.id} key={v.id}>{v.registration}{v.isTestData ? ' — TEST' : ''}</option>)}</select></label>
        <label>Service type<input required value={form.serviceType} onChange={e => patch({ serviceType: e.target.value })} className="block border p-2 w-full" /></label>
        <label>Due date<input required type="date" value={form.dueDate} onChange={e => patch({ dueDate: e.target.value })} className="block border p-2" /></label>
        <label>Due odometer (km)<input required type="number" min="0" value={form.dueOdometer} onChange={e => patch({ dueOdometer: e.target.value })} className="block border p-2" /></label>
        <label>Booked date<input required type="date" value={form.bookedDate} onChange={e => patch({ bookedDate: e.target.value })} className="block border p-2" /></label>
        <label>Booked time<input required type="time" value={form.bookedTime} onChange={e => patch({ bookedTime: e.target.value })} className="block border p-2" /></label>
        <label>Workshop<select required value={form.serviceProviderId} onChange={e => patch({ serviceProviderId: e.target.value })} className="block border p-2"><option value="">Select workshop</option>{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      </div> : <p>{label(form.vehicleId)}</p>}
      {(form.action === 'book' || form.action === 'complete') && <fieldset><legend>{form.action === 'book' ? 'Defects addressed by this service' : 'Explicitly resolve repaired defects'}</legend>
        {(form.action === 'complete' ? form.reviewedDefects : defects).filter(d => d.vehicleId === form.vehicleId && !['Resolved','Duplicate'].includes(d.status) && (form.action === 'book' || form.linked.includes(d.id))).map(d => {
          const key = form.action === 'book' ? 'linked' : 'resolved'; return <label className="block" key={d.id}><input type="checkbox" checked={form[key].includes(d.id)} onChange={e => patch({ [key]: e.target.checked ? [...form[key], d.id] : form[key].filter(id => id !== d.id) })} /> {d.description} ({d.urgency})</label>;
        })}</fieldset>}
      {(form.action === 'dispatch' || form.action === 'complete') && <label className="block">Actual {form.action === 'dispatch' ? 'dispatch' : 'completion'} date<input required type="date" max={today()} value={form.actualDate} onChange={e => patch({ actualDate: e.target.value })} className="block border p-2" /></label>}
      {form.action === 'complete' && <><p>Completion records work and cost. The vehicle remains unavailable until explicitly released.</p>
        <label className="block">Actual completion odometer (km)<input required type="number" min="0" step="any" value={form.odometer} onChange={e => patch({ odometer: e.target.value })} className="block border p-2" /></label>
        <label className="block">Actual cost (R)<input required type="number" min="0" step="0.01" value={form.cost} onChange={e => patch({ cost: e.target.value })} className="block border p-2" /></label></>}
      {form.action === 'release' && <><p>Current hold: {form.holdReason}</p><p>All dispatched work and linked or critical defects must be resolved. This service must belong to the current hold. If the hold changes, cancel, refresh and review it again.</p>
        <label className="block"><input type="checkbox" checked={form.clearManualHold} onChange={e => patch({ clearManualHold: e.target.checked })} /> I also confirm any separate manual maintenance/repair hold has been addressed.</label></>}
      {form.action !== 'dispatch' && <label className="block">{form.action === 'complete' ? 'Completion notes' : form.action === 'release' ? 'Release reason' : 'Booking notes'}<textarea required={form.action !== 'book'} value={form.notes} onChange={e => patch({ notes: e.target.value })} className="block border p-2 w-full" /></label>}
      <button disabled={busy} className="bg-blue-600 text-white px-4 py-2 rounded">{busy ? 'Saving…' : 'Save service operation'}</button>
      <button type="button" disabled={busy} className="ml-3 underline" onClick={() => setForm(null)}>Cancel</button>
    </form>}
  </Card>;
}
