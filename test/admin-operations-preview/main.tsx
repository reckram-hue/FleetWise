import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AdminDashboard from '../../src/components/admin/AdminDashboard';
import InspectionHistory from '../../src/components/admin/InspectionHistory';
import FuelEconomyMonitor from '../../src/components/admin/FuelEconomyMonitor';
import ReportDefectForm from '../../src/components/driver/ReportDefectForm';
import SuccessNotice from '../../src/components/shared/SuccessNotice';
import { UserContext } from '../../src/contexts/UserContext';
import { driver, vehicle } from './mocks';
function Preview() {
  const params = new URLSearchParams(location.search), embedded = params.has('embedded');
  const [screen, setScreen] = useState(params.get('screen') || 'history'), [narrow, setNarrow] = useState(false);
  return <UserContext.Provider value={{ currentUser: { ...driver, role: screen === 'fault' ? 'driver' : 'admin' } as any, setCurrentUser() {} }}>
    {!embedded && <nav className="bg-amber-100 p-3 flex flex-wrap gap-4"><strong>LOCAL SYNTHETIC FIXTURE{params.has('maintenanceUx') ? ' — READ ONLY' : ''}</strong>
      {['admin', 'history', 'fault', 'economy'].map(s => <button key={s} className="underline min-h-11" onClick={() => setScreen(s)}>{s}</button>)}
      <button className="underline min-h-11" onClick={() => setNarrow(v => !v)}>Toggle 375px width</button>
    </nav>}
    {narrow ? <iframe title="375px mobile preview" src={`/?embedded=1&screen=${screen}${params.has('maintenance') ? '&maintenance=1' : ''}${params.has('maintenanceUx') ? '&maintenanceUx=1' : ''}${params.has('workshopSetup') ? '&workshopSetup=1' : ''}`} style={{ width: 375, height: 812, display: 'block', margin: 'auto', border: 0 }} /> : <div>
      {screen === 'economy' ? <main className="max-w-6xl mx-auto p-4"><FuelEconomyMonitor vehicles={[]} /></main> : screen === 'admin' ? <AdminDashboard /> : screen === 'history' ? <InspectionHistory onBack={() => setScreen('admin')} onOpenDefect={() => setScreen('admin')} />
        : <ReportDefectForm currentVehicle={vehicle as any} onBack={() => setScreen('history')} />}
    </div>}<SuccessNotice />
  </UserContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
