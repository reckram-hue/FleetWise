import React from 'react';
import EvidencePhoto from './EvidencePhoto';
import { formatVehicleIdentity } from '../../lib/vehicleIdentity';
import { AccidentReport } from '../../types';
import { accidentSteps } from '../../lib/accidentFields';
import { accidentApi } from '../../services/accidentApi';

export function AccidentEvidence({ report, admin = false }: { report: AccidentReport; admin?: boolean }) {
    return <section><h3 className="font-bold">Photos ({report.photos.length})</h3>
        {!report.photos.length && <p>No photos provided.</p>}
        {report.photos.map(p => <EvidencePhoto key={report.id + p.id} caption={p.caption || 'Accident evidence'}
            load={() => (admin ? accidentApi.photoAdmin : accidentApi.photo)(report.id, p.id)} />)}
    </section>;
}

export default function AccidentReportDetails({ report, admin = false }: { report: AccidentReport; admin?: boolean }) {
    const f = report.fields;
    const identity = formatVehicleIdentity(report);
    return <div className="space-y-5 break-words">
        <p className="font-bold">{identity.primary}</p><p>{identity.secondary}</p>
        <p className="font-bold">{report.status} {report.isTestData ? '— TEST' : ''}</p>
        {f.vehicleDriveable === 'NO' && <p role="status" className="bg-red-50 p-3 text-red-900 font-bold">Vehicle reported not driveable.</p>}
        {accidentSteps.slice(0, 4).map(step => <section key={step.title}>
            <h3 className="font-bold text-lg">{step.title}</h3><dl className="grid gap-3 sm:grid-cols-2">
                {step.fields.map(field => <div key={field.key}><dt className="text-sm text-gray-500">{field.label}</dt>
                    <dd className="whitespace-pre-wrap">{String(f[field.key] || 'Not provided')}</dd></div>)}
            </dl></section>)}
        <p>GPS: {f.gps ? `${f.gps.latitude}, ${f.gps.longitude}` : 'Not provided'}</p>
        <section><h3 className="font-bold">Witnesses</h3>{!f.witnesses?.length && <p>None provided</p>}
            {f.witnesses?.map((w, i) => <p key={i}>{[w.name, w.phone, w.email, w.notes].map(v => v || 'Not provided').join(' · ')}</p>)}
        </section>
        <p>Incomplete details acknowledged: {f.incompleteDetailsAcknowledged ? 'Yes' : 'Not yet'}</p>
        <AccidentEvidence report={report} admin={admin} />
        <details><summary className="min-h-11 cursor-pointer">Internal references and timestamps</summary><dl className="text-sm space-y-2">
            {Object.entries({ 'Report ID': report.id, Organisation: report.orgId, Driver: report.driverName || report.driverId,
                'Driver ID': report.driverId, Vehicle: identity.primary, 'Vehicle ID': report.vehicleId,
                Shift: report.shiftId, Assignment: report.assignmentId, 'Created by': report.createdByDriverId,
                Created: report.createdAt?.toLocaleString(), Updated: report.updatedAt?.toLocaleString(), Submitted: report.submittedAt?.toLocaleString() || 'Not submitted' }).map(([k, v]) =>
                <div key={k}><dt className="font-semibold">{k}</dt><dd>{v}</dd></div>)}
        </dl></details>
    </div>;
}
