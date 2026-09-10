import ServiceManagement from './ServiceManagement';
import { formatVehicleIdentity } from '../../lib/vehicleIdentity';
import React, { useState, useEffect } from 'react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { DefectReport, DefectUrgency, UserRole, Vehicle, User } from '../../types';
import api from '../../services/firebaseApi';
import { AlertTriangle, Users, Truck, Settings as SettingsIcon, Wrench, MessageCircle, FileText, IdCard } from 'lucide-react';
import ManageDrivers from './ManageDrivers';
import ManageVehicles from './ManageVehicles';
import Reports from './Reports';
import Settings from './Settings';
import ManageServiceProviders from './ManageServiceProviders';
import ManageDefects from './ManageDefects';
import InspectionHistory from './InspectionHistory';
import TelegramDrivers from './TelegramDrivers';
import VehicleLicenseRenewal from './VehicleLicenseRenewal';


const AdminDashboard: React.FC = () => {
    const [view, setView] = useState('dashboard');
    const [totalVehicles, setTotalVehicles] = useState(0);
    const [activeVehicles, setActiveVehicles] = useState(0);
    const [vehiclesNeedingLicense, setVehiclesNeedingLicense] = useState(0);
    const [driversNeedingLicense, setDriversNeedingLicense] = useState(0);
    const [activeDefectsCount, setActiveDefectsCount] = useState(0);
    const [selectedDefectId, setSelectedDefectId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [maintenanceVehicleId, setMaintenanceVehicleId] = useState<string | undefined>();
    const [providerReturn, setProviderReturn] = useState('dashboard');
    const openMaintenance = (vehicleId?: string) => { setMaintenanceVehicleId(vehicleId); setView('maintenance'); };
    const openWorkshops = (vehicleId?: string) => { setMaintenanceVehicleId(vehicleId); setProviderReturn('maintenance'); setView('service-providers'); };

    useEffect(() => {
        // Fetch vehicle data
        api.getVehicles().then(vehicles => {
            // Test-data isolation: TEST EV/TEST ICE must remain manageable in
            // ManageVehicles, but never count toward these fleet-wide KPI cards.
            const realVehicles = vehicles.filter(v => v.isTestData !== true);

            // Exclude sold and end-of-life vehicles from total count
            const operationalVehicles = realVehicles.filter(v =>
                v.status !== 'Sold' && v.status !== 'End of Life'
            );
            // Count only active vehicles
            const activeVehicleCount = realVehicles.filter(v => v.status === 'Active').length;

            setTotalVehicles(operationalVehicles.length);
            setActiveVehicles(activeVehicleCount);

            // Count vehicles needing license renewal within 30 days
            const today = new Date();
            const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
            const needingLicense = realVehicles.filter(v => {
                if (!v.licenseExpiryDate) return false;
                const expiryDate = new Date(v.licenseExpiryDate);
                return expiryDate <= thirtyDaysFromNow;
            });
            setVehiclesNeedingLicense(needingLicense.length);
        });

        // Fetch driver data
        api.getUsers().then(users => {
            // Filter only drivers with driver role, excluding the test driver from
            // this fleet-wide KPI (still fully visible/manageable in ManageDrivers).
            const drivers = users.filter(u => u.role === UserRole.Driver && u.isTestData !== true);

            // Count drivers needing license renewal within 30 days
            const today = new Date();
            const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
            const needingLicense = drivers.filter(d => {
                if (!d.driversLicenceExpiry) return false;
                const expiryDate = new Date(d.driversLicenceExpiry);
                return expiryDate <= thirtyDaysFromNow;
            });
            setDriversNeedingLicense(needingLicense.length);
        });

        // Fetch active defects count
        api.getActiveDefects().then(defects => {
            const criticalDefects = defects.filter(d =>
                d.isTestData !== true
                && (d.urgency === DefectUrgency.High || d.urgency === DefectUrgency.Critical)
            );
            setActiveDefectsCount(criticalDefects.length);
        });
    }, [refreshTrigger]);


    if (view === 'drivers') {
        return <ManageDrivers onBack={() => setView('dashboard')} />;
    }

    if (view === 'vehicles') {
        return <ManageVehicles onBack={() => setView('dashboard')} onOpenMaintenance={openMaintenance} />;
    }

    if (view === 'maintenance') {
        return <div className="min-h-screen bg-gray-100">
            <Header title="Maintenance & Service" onBack={() => setView('dashboard')} />
            <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
                <div className="flex flex-wrap gap-4">
                    <button className="underline min-h-11" onClick={() => openWorkshops(maintenanceVehicleId)}>Workshops / service providers</button>
                    <button className="underline min-h-11" onClick={() => { setSelectedDefectId(null); setView('defects'); }}>Manage defects</button>
                </div>
                <ServiceManagement initialVehicleId={maintenanceVehicleId} onManageWorkshops={openWorkshops} onChanged={() => setRefreshTrigger(v => v + 1)} />
            </main>
        </div>;
    }

    if (view === 'reports') {
        return <Reports onBack={() => setView('dashboard')} />;
    }

    if (view === 'settings') {
        return <Settings onBack={() => setView('dashboard')} />;
    }

    if (view === 'service-providers') {
        return <ManageServiceProviders backLabel={providerReturn === 'maintenance' ? 'Back to Maintenance & Service' : 'Back to Dashboard'} onBack={() => setView(providerReturn)} />;
    }

    if (view === 'defects') {
        return (
            <ManageDefects
                onBack={() => {
                    setView('dashboard');
                    setSelectedDefectId(null);
                }}
                selectedDefectId={selectedDefectId || undefined}
                onOpenMaintenance={openMaintenance}
            />
        );
    }

    if (view === 'inspections') {
        return <InspectionHistory onBack={() => setView('dashboard')} onOpenDefect={id => { setSelectedDefectId(id); setView('defects'); }} />;
    }

    if (view === 'telegram') {
        return <TelegramDrivers onBack={() => setView('dashboard')} />;
    }

    if (view === 'license-renewal') {
        return <VehicleLicenseRenewal onBack={() => setView('dashboard')} />;
    }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header title="Admin Dashboard" />
      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        <nav aria-label="Admin navigation" className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3">
            <button onClick={() => openMaintenance()} className="col-span-2 bg-blue-700 text-white text-left font-bold py-3 px-6 rounded-lg hover:bg-blue-800 shadow-lg">
                <Wrench className="h-5 w-5 mr-2 inline" />Maintenance &amp; Service
                <span className="block text-sm font-normal mt-1">Bookings, workshop returns &amp; history</span>
            </button>
            <button onClick={() => { setSelectedDefectId(null); setView('defects'); }} className="bg-amber-700 text-white font-bold py-3 px-6 rounded-lg hover:bg-amber-800 transition duration-300 shadow-lg">
                <Wrench className="h-5 w-5 mr-2 inline" />Manage Defects
            </button>
            <button onClick={() => setView('inspections')} className="bg-teal-700 text-white font-bold py-3 px-6 rounded-lg hover:bg-teal-800 transition duration-300 shadow-lg">
                <FileText className="h-5 w-5 mr-2 inline" />Inspection History
            </button>
            <button onClick={() => setView('drivers')} className="bg-indigo-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-indigo-600 transition duration-300 shadow-lg">
                <Users className="h-5 w-5 mr-2 inline" />
                Drivers
            </button>
            <button onClick={() => setView('vehicles')} className="bg-cyan-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-cyan-600 transition duration-300 shadow-lg">
                <Truck className="h-5 w-5 mr-2 inline" />
                Vehicles
            </button>
            <button onClick={() => { setProviderReturn('dashboard'); setView('service-providers'); }} className="bg-green-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-600 transition duration-300 shadow-lg">
                <Wrench className="h-5 w-5 mr-2 inline" />
                Service Providers
            </button>
            <button onClick={() => setView('reports')} className="bg-purple-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-purple-600 transition duration-300 shadow-lg">
                <AlertTriangle className="h-5 w-5 mr-2 inline" />
                Reports
            </button>
            <button onClick={() => setView('telegram')} className="bg-blue-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-600 transition duration-300 shadow-lg">
                <MessageCircle className="h-5 w-5 mr-2 inline" />
                Telegram
            </button>
            <button onClick={() => setView('settings')} className="bg-gray-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-700 transition duration-300 shadow-lg">
                <SettingsIcon className="h-5 w-5 mr-2 inline" />
                Settings
            </button>
        </nav>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Total Vehicles" value={`${activeVehicles}/${totalVehicles}`} icon={<Truck className="h-8 w-8 text-cyan-500"/>} />
            <StatCard
                title="Active Defects"
                value={activeDefectsCount.toString()}
                icon={<AlertTriangle className="h-8 w-8 text-red-500"/>}
                onClick={() => {
                    const element = document.getElementById('active-defects-section');
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }}
                isClickable={true}
                isAlert={activeDefectsCount > 0}
            />
            <StatCard
                title="Vehicle License Renewal"
                value={vehiclesNeedingLicense.toString()}
                icon={<FileText className="h-8 w-8 text-red-500"/>}
                onClick={() => {
                    const element = document.getElementById('license-renewal-section');
                    console.log('Attempting to scroll to license renewal section', element);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else {
                        console.log('License renewal section not found in DOM');
                    }
                }}
                isClickable={true}
                isAlert={vehiclesNeedingLicense > 0}
            />
            <StatCard
                title="Drivers Licence Renewals"
                value={driversNeedingLicense.toString()}
                icon={<IdCard className="h-8 w-8 text-orange-500"/>}
                onClick={() => {
                    const element = document.getElementById('driver-license-renewal-section');
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }}
                isClickable={true}
                isAlert={driversNeedingLicense > 0}
            />
        </div>

        <div className="grid grid-cols-1 gap-6">
          <CriticalDefects onDefectClick={(defectId) => {
            setSelectedDefectId(defectId);
            setView('defects');
          }} />
        </div>

        <LicenseRenewalAlerts onLicenseUpdated={() => setRefreshTrigger(prev => prev + 1)} />

        <DriverLicenseRenewalAlerts onLicenseUpdated={() => setRefreshTrigger(prev => prev + 1)} />

      </main>
    </div>
  );
};


const StatCard = ({
    title,
    value,
    icon,
    onClick,
    isClickable = false,
    isAlert = false
}: {
    title: string;
    value: string;
    icon: React.ReactNode;
    onClick?: () => void;
    isClickable?: boolean;
    isAlert?: boolean;
}) => (
    <Card
        className={`${isClickable ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''} ${isAlert ? 'bg-red-50 border-red-200' : ''}`}
        onClick={isClickable ? onClick : undefined}
    >
        <div className="flex items-center">
            <div className={`p-3 rounded-full mr-4 ${isAlert ? 'bg-red-100' : 'bg-gray-200'}`}>
                {icon}
            </div>
            <div>
                <p className={`text-sm font-medium truncate ${isAlert ? 'text-red-700' : 'text-gray-500'}`}>{title}</p>
                <p className={`mt-1 text-3xl font-semibold ${isAlert ? 'text-red-900' : 'text-gray-900'}`}>{value}</p>
            </div>
        </div>
    </Card>
);

interface CriticalDefectsProps {
  onDefectClick: (defectId: string) => void;
}

const CriticalDefects: React.FC<CriticalDefectsProps> = ({ onDefectClick }) => {
  const [defects, setDefects] = useState<DefectReport[]>([]);
  const [identityVehicles, setIdentityVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    const fetchDefects = async () => {
      const [allDefects, vehicles] = await Promise.all([api.getActiveDefects(), api.getVehicles()]);
      setIdentityVehicles(vehicles);
      const critical = allDefects.filter(d =>
        d.isTestData !== true
        && (d.urgency === DefectUrgency.High || d.urgency === DefectUrgency.Critical)
      );
      setDefects(critical);
    };
    fetchDefects();
  }, []);

  const urgencyColor = {
      [DefectUrgency.High]: 'bg-yellow-100 text-yellow-800',
      [DefectUrgency.Critical]: 'bg-red-100 text-red-800',
      [DefectUrgency.Medium]: 'bg-blue-100 text-blue-800',
      [DefectUrgency.Low]: 'bg-gray-100 text-gray-800'
  };

  const calculateDaysSinceReported = (reportedDateTime: Date): number => {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - reportedDateTime.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getDaysColor = (days: number): string => {
    if (days <= 1) return 'text-green-600';
    if (days <= 3) return 'text-yellow-600';
    if (days <= 7) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <Card id="active-defects-section">
      <h2 className="text-xl font-bold text-gray-800 mb-4">High & Critical Defects</h2>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {defects.length > 0 ? defects.map(defect => {
          const daysSinceReported = calculateDaysSinceReported(defect.reportedDateTime);
          return (
            <button
              key={defect.id}
              onClick={() => onDefectClick(defect.id)}
              className="w-full p-3 bg-gray-50 rounded-lg border hover:bg-blue-50 hover:border-blue-300 transition-colors duration-200 text-left cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <p className="font-semibold text-gray-900 hover:text-blue-700">{defect.description}</p>
                <div className="flex gap-2">
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 ${getDaysColor(daysSinceReported)}`}>
                    {daysSinceReported === 0 ? 'Today' :
                     daysSinceReported === 1 ? '1 day ago' :
                     `${daysSinceReported} days ago`}
                  </span>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${urgencyColor[defect.urgency]}`}>
                    {defect.urgency}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">Vehicle: {formatVehicleIdentity(defect, identityVehicles.find(v => v.id === defect.vehicleId)).primary} | Reported: {defect.reportedDateTime.toLocaleDateString()}</p>
            </button>
          );
        }) : <p className="text-gray-500">No high or critical defects reported.</p>}
      </div>
    </Card>
  );
};


interface LicenseRenewalAlertsProps {
    onLicenseUpdated: () => void;
}

const LicenseRenewalAlerts: React.FC<LicenseRenewalAlertsProps> = ({ onLicenseUpdated }) => {
    const [expiredVehicles, setExpiredVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{
        licenseExpiryDate: string;
        licenseNumber: string;
        lastLicenseRenewalDate: string;
    }>({
        licenseExpiryDate: '',
        licenseNumber: '',
        lastLicenseRenewalDate: ''
    });
    const [saving, setSaving] = useState(false);

    const fetchExpiredLicenses = async () => {
        setLoading(true);
        try {
            // Get vehicles with licenses expiring in the next 60 days
            const vehicles = await api.getVehiclesWithExpiredLicenses(60);
            setExpiredVehicles(vehicles);
        } catch (error) {
            console.error('Failed to fetch expired licenses:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExpiredLicenses();
    }, []);

    const getLicenseStatusColor = (vehicle: Vehicle) => {
        if (!vehicle.licenseExpiryDate) return 'text-gray-500';

        const today = new Date();
        const expiryDate = new Date(vehicle.licenseExpiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 0) return 'text-red-600';
        if (daysUntilExpiry <= (vehicle.licenseRenewalReminderDays || 30)) return 'text-orange-600';
        return 'text-yellow-600';
    };

    const getLicenseStatusText = (vehicle: Vehicle) => {
        if (!vehicle.licenseExpiryDate) return 'No expiry date set';

        const today = new Date();
        const expiryDate = new Date(vehicle.licenseExpiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 0) return `Expired ${Math.abs(daysUntilExpiry)} days ago`;
        if (daysUntilExpiry === 0) return 'Expires today';
        if (daysUntilExpiry === 1) return 'Expires tomorrow';
        return `Expires in ${daysUntilExpiry} days`;
    };

    const handleEditClick = (vehicle: Vehicle) => {
        setEditingVehicleId(vehicle.id);
        setEditForm({
            licenseExpiryDate: vehicle.licenseExpiryDate || '',
            licenseNumber: vehicle.licenseNumber || '',
            lastLicenseRenewalDate: vehicle.lastLicenseRenewalDate || ''
        });
    };

    const handleCancelEdit = () => {
        setEditingVehicleId(null);
        setEditForm({
            licenseExpiryDate: '',
            licenseNumber: '',
            lastLicenseRenewalDate: ''
        });
    };

    const handleSaveEdit = async () => {
        if (!editingVehicleId) return;

        setSaving(true);
        try {
            const vehicle = expiredVehicles.find(v => v.id === editingVehicleId);
            if (!vehicle) return;

            const updatedVehicle = {
                ...vehicle,
                ...editForm
            };

            await api.updateVehicle(updatedVehicle);

            // Refresh the vehicles list
            await fetchExpiredLicenses();

            // Trigger refresh of dashboard stats
            onLicenseUpdated();

            setEditingVehicleId(null);
            setEditForm({
                licenseExpiryDate: '',
                licenseNumber: '',
                lastLicenseRenewalDate: ''
            });
        } catch (error) {
            console.error('Failed to update vehicle license information:', error);
            alert('Failed to update license information. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Card id="license-renewal-section">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
            </Card>
        );
    }

    if (expiredVehicles.length === 0) {
        return null; // Don't show the section if no vehicles need license renewals
    }

    return (
            <Card id="license-renewal-section" className="border-orange-200 bg-orange-50">
            <div className="flex items-center mb-3">
                <AlertTriangle className="h-5 w-5 text-orange-500 mr-2" />
                <h3 className="text-lg font-semibold text-orange-800">License Renewal Required</h3>
            </div>
            <div className="space-y-3">
                {expiredVehicles.map(vehicle => (
                    <div key={vehicle.id} className={`p-3 bg-white rounded-lg border border-orange-200 ${editingVehicleId === vehicle.id ? 'ring-2 ring-blue-500' : ''}`}>
                        {editingVehicleId === vehicle.id ? (
                            // Edit Mode
                            <div className="space-y-3">
                                <div className="font-medium text-gray-900 mb-2">
                                    {vehicle.registration} - {vehicle.make} {vehicle.model}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                            License Expiry Date *
                                        </label>
                                        <input
                                            type="date"
                                            value={editForm.licenseExpiryDate}
                                            onChange={(e) => setEditForm({ ...editForm, licenseExpiryDate: e.target.value })}
                                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                            License Disc Number
                                        </label>
                                        <input
                                            type="text"
                                            value={editForm.licenseNumber}
                                            onChange={(e) => setEditForm({ ...editForm, licenseNumber: e.target.value })}
                                            placeholder="Disc Number"
                                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                            Last Renewal Date
                                        </label>
                                        <input
                                            type="date"
                                            value={editForm.lastLicenseRenewalDate}
                                            onChange={(e) => setEditForm({ ...editForm, lastLicenseRenewalDate: e.target.value })}
                                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end space-x-2 mt-2">
                                    <button
                                        onClick={handleCancelEdit}
                                        disabled={saving}
                                        className="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveEdit}
                                        disabled={saving}
                                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                    >
                                        {saving ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            // View Mode
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="font-medium text-gray-900">
                                        {vehicle.registration} - {vehicle.make} {vehicle.model}
                                    </div>
                                    <div className={`text-sm ${getLicenseStatusColor(vehicle)}`}>
                                        {getLicenseStatusText(vehicle)}
                                    </div>
                                    {vehicle.licenseExpiryDate && (
                                        <div className="text-xs text-gray-500">
                                            License expires: {vehicle.licenseExpiryDate}
                                        </div>
                                    )}
                                    {vehicle.licenseNumber && (
                                        <div className="text-xs text-gray-500">
                                            Disc: {vehicle.licenseNumber}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <button
                                        onClick={() => handleEditClick(vehicle)}
                                        className="bg-orange-500 text-white px-3 py-1 rounded text-sm hover:bg-orange-600 transition"
                                    >
                                        Update License
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <p className="text-xs text-orange-600 mt-3">⚠️ Ensure licenses are renewed to avoid penalties and keep vehicles road-legal!</p>
        </Card>
    );
};


interface DriverLicenseRenewalAlertsProps {
    onLicenseUpdated: () => void;
}

const DriverLicenseRenewalAlerts: React.FC<DriverLicenseRenewalAlertsProps> = ({ onLicenseUpdated }) => {
    const [expiredDrivers, setExpiredDrivers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{
        driversLicenceExpiry: string;
        driversLicenceNumber: string;
    }>({
        driversLicenceExpiry: '',
        driversLicenceNumber: ''
    });
    const [saving, setSaving] = useState(false);

    const fetchExpiredLicenses = async () => {
        setLoading(true);
        try {
            const users = await api.getUsers();
            const drivers = users.filter(u => u.role === UserRole.Driver && u.isTestData !== true);

            // Get drivers with licenses expiring in the next 30 days
            const today = new Date();
            const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
            const needingLicense = drivers.filter(d => {
                if (!d.driversLicenceExpiry) return false;
                const expiryDate = new Date(d.driversLicenceExpiry);
                return expiryDate <= thirtyDaysFromNow;
            });
            setExpiredDrivers(needingLicense);
        } catch (error) {
            console.error('Failed to fetch drivers with expiring licenses:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExpiredLicenses();
    }, []);

    const getLicenseStatusColor = (driver: User) => {
        if (!driver.driversLicenceExpiry) return 'text-gray-500';

        const today = new Date();
        const expiryDate = new Date(driver.driversLicenceExpiry);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 0) return 'text-red-600';
        if (daysUntilExpiry <= 14) return 'text-orange-600';
        return 'text-yellow-600';
    };

    const getLicenseStatusText = (driver: User) => {
        if (!driver.driversLicenceExpiry) return 'No expiry date set';

        const today = new Date();
        const expiryDate = new Date(driver.driversLicenceExpiry);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 0) return `Expired ${Math.abs(daysUntilExpiry)} days ago`;
        if (daysUntilExpiry === 0) return 'Expires today';
        if (daysUntilExpiry === 1) return 'Expires tomorrow';
        return `Expires in ${daysUntilExpiry} days`;
    };

    const handleEditClick = (driver: User) => {
        setEditingDriverId(driver.id);
        setEditForm({
            driversLicenceExpiry: driver.driversLicenceExpiry || '',
            driversLicenceNumber: driver.driversLicenceNumber || ''
        });
    };

    const handleCancelEdit = () => {
        setEditingDriverId(null);
        setEditForm({
            driversLicenceExpiry: '',
            driversLicenceNumber: ''
        });
    };

    const handleSaveEdit = async () => {
        if (!editingDriverId) return;

        setSaving(true);
        try {
            const driver = expiredDrivers.find(d => d.id === editingDriverId);
            if (!driver) return;

            const updatedDriver = {
                ...driver,
                ...editForm
            };

            await api.updateDriver(updatedDriver);

            // Refresh the drivers list
            await fetchExpiredLicenses();

            // Trigger refresh of dashboard stats
            onLicenseUpdated();

            setEditingDriverId(null);
            setEditForm({
                driversLicenceExpiry: '',
                driversLicenceNumber: ''
            });
        } catch (error) {
            console.error('Failed to update driver license information:', error);
            alert('Failed to update license information. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Card id="driver-license-renewal-section">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
            </Card>
        );
    }

    if (expiredDrivers.length === 0) {
        return null; // Don't show the section if no drivers need license renewals
    }

    return (
        <Card id="driver-license-renewal-section" className="border-blue-200 bg-blue-50">
            <div className="flex items-center mb-3">
                <IdCard className="h-5 w-5 text-blue-500 mr-2" />
                <h3 className="text-lg font-semibold text-blue-800">Driver License Renewal Required</h3>
            </div>
            <div className="space-y-3">
                {expiredDrivers.map(driver => (
                    <div key={driver.id} className={`p-3 bg-white rounded-lg border border-blue-200 ${editingDriverId === driver.id ? 'ring-2 ring-blue-500' : ''}`}>
                        {editingDriverId === driver.id ? (
                            // Edit Mode
                            <div className="space-y-3">
                                <div className="font-medium text-gray-900 mb-2">
                                    {driver.firstName} {driver.surname}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                            License Expiry Date *
                                        </label>
                                        <input
                                            type="date"
                                            value={editForm.driversLicenceExpiry}
                                            onChange={(e) => setEditForm({ ...editForm, driversLicenceExpiry: e.target.value })}
                                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                            License Number
                                        </label>
                                        <input
                                            type="text"
                                            value={editForm.driversLicenceNumber}
                                            onChange={(e) => setEditForm({ ...editForm, driversLicenceNumber: e.target.value })}
                                            placeholder="License Number"
                                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end space-x-2 mt-2">
                                    <button
                                        onClick={handleCancelEdit}
                                        disabled={saving}
                                        className="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveEdit}
                                        disabled={saving}
                                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                    >
                                        {saving ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            // View Mode
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="font-medium text-gray-900">
                                        {driver.firstName} {driver.surname}
                                    </div>
                                    <div className={`text-sm ${getLicenseStatusColor(driver)}`}>
                                        {getLicenseStatusText(driver)}
                                    </div>
                                    {driver.driversLicenceExpiry && (
                                        <div className="text-xs text-gray-500">
                                            License expires: {driver.driversLicenceExpiry}
                                        </div>
                                    )}
                                    {driver.driversLicenceNumber && (
                                        <div className="text-xs text-gray-500">
                                            License #: {driver.driversLicenceNumber}
                                        </div>
                                    )}
                                    {driver.contactNumber && (
                                        <div className="text-xs text-gray-500">
                                            Contact: {driver.contactNumber}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <button
                                        onClick={() => handleEditClick(driver)}
                                        className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition"
                                    >
                                        Update License
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <p className="text-xs text-blue-600 mt-3">⚠️ Ensure driver licenses are renewed before expiry to maintain compliance and avoid penalties!</p>
        </Card>
    );
};

export default AdminDashboard;
