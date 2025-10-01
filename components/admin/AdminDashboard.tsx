import React, { useState, useEffect } from 'react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DefectReport, Cost, DefectUrgency, CostCategory, UserRole, ScheduledService, Vehicle, ServiceProvider } from '../../types';
import { VehicleStatus } from '../../types';
import api from '../../services/mockApi';
import { AlertTriangle, Fuel, Users, Truck, Settings as SettingsIcon, Wrench, MessageCircle, FileText } from 'lucide-react';
import ManageDrivers from './ManageDrivers';
import ManageVehicles from './ManageVehicles';
import Reports from './Reports';
import Settings from './Settings';
import ManageServiceProviders from './ManageServiceProviders';
import ManageDefects from './ManageDefects';
import TelegramDrivers from './TelegramDrivers';


const AdminDashboard: React.FC = () => {
    const [view, setView] = useState('dashboard');
    const [totalVehicles, setTotalVehicles] = useState(0);
    const [activeVehicles, setActiveVehicles] = useState(0);
    const [vehiclesNeedingLicense, setVehiclesNeedingLicense] = useState(0);
    const [selectedDefectId, setSelectedDefectId] = useState<string | null>(null);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [showSendModal, setShowSendModal] = useState(false);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [selectedService, setSelectedService] = useState<ScheduledService | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [showLicenseRenewalModal, setShowLicenseRenewalModal] = useState(false);

    useEffect(() => {
        api.getVehicles().then(vehicles => {
            // Exclude sold and end-of-life vehicles from total count
            const operationalVehicles = vehicles.filter(v =>
                v.status !== 'Sold' && v.status !== 'End of Life'
            );
            // Count only active vehicles
            const activeVehicleCount = vehicles.filter(v => v.status === 'Active').length;

            setTotalVehicles(operationalVehicles.length);
            setActiveVehicles(activeVehicleCount);

            // Count vehicles needing license renewal within 30 days
            const today = new Date();
            const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
            const needingLicense = vehicles.filter(v => {
                if (!v.licenseExpiryDate) return false;
                const expiryDate = new Date(v.licenseExpiryDate);
                return expiryDate <= thirtyDaysFromNow;
            });
            setVehiclesNeedingLicense(needingLicense.length);
        });
    }, [refreshTrigger]);


    if (view === 'drivers') {
        return <ManageDrivers onBack={() => setView('dashboard')} />;
    }

    if (view === 'vehicles') {
        return <ManageVehicles onBack={() => setView('dashboard')} />;
    }

    if (view === 'reports') {
        return <Reports onBack={() => setView('dashboard')} />;
    }

    if (view === 'settings') {
        return <Settings onBack={() => setView('dashboard')} />;
    }

    if (view === 'service-providers') {
        return <ManageServiceProviders onBack={() => setView('dashboard')} />;
    }

    if (view === 'defects') {
        return (
            <ManageDefects
                onBack={() => {
                    setView('dashboard');
                    setSelectedDefectId(null);
                }}
                selectedDefectId={selectedDefectId || undefined}
            />
        );
    }

    if (view === 'telegram') {
        return <TelegramDrivers onBack={() => setView('dashboard')} />;
    }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header title="Admin Dashboard" />
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Total Vehicles" value={`${activeVehicles}/${totalVehicles}`} icon={<Truck className="h-8 w-8 text-cyan-500"/>} />
            <StatCard
                title="Vehicle License Renewal"
                value={vehiclesNeedingLicense.toString()}
                icon={<FileText className="h-8 w-8 text-red-500"/>}
                onClick={() => setShowLicenseRenewalModal(true)}
                isClickable={true}
                isAlert={vehiclesNeedingLicense > 0}
            />
            <StatCard title="Active Defects" value="5" icon={<AlertTriangle className="h-8 w-8 text-red-500"/>} />
            <StatCard title="Total Costs This Month" value="R 25,750" icon={<Fuel className="h-8 w-8 text-green-500"/>} />
        </div>
        
        <div className="flex flex-wrap gap-6">
            <button onClick={() => setView('drivers')} className="bg-indigo-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-indigo-600 transition duration-300 shadow-lg">
                <Users className="h-5 w-5 mr-2 inline" />
                Drivers
            </button>
            <button onClick={() => setView('vehicles')} className="bg-cyan-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-cyan-600 transition duration-300 shadow-lg">
                <Truck className="h-5 w-5 mr-2 inline" />
                Vehicles
            </button>
            <button onClick={() => setView('service-providers')} className="bg-green-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-600 transition duration-300 shadow-lg">
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
        </div>


        <div className="grid grid-cols-1 gap-6">
          <CriticalDefects onDefectClick={(defectId) => {
            setSelectedDefectId(defectId);
            setView('defects');
          }} />
        </div>

        <UpcomingServices
          onBookService={(service) => {
            setSelectedService(service);
            setShowBookingModal(true);
          }}
          onSendService={(service) => {
            setSelectedService(service);
            setShowSendModal(true);
          }}
          onReturnService={(service) => {
            setSelectedService(service);
            setShowReturnModal(true);
          }}
          refreshTrigger={refreshTrigger}
        />

        <LicenseRenewalAlerts />

        {/* Service Booking Modal */}
        {showBookingModal && selectedService && (
          <ServiceBookingModal
            service={selectedService}
            onClose={() => {
              setShowBookingModal(false);
              setSelectedService(null);
            }}
            onSave={() => {
              setShowBookingModal(false);
              setSelectedService(null);
              // Trigger refresh of services data
              setRefreshTrigger(prev => prev + 1);
            }}
          />
        )}

        {/* Send for Service Modal */}
        {showSendModal && selectedService && (
          <SendServiceModal
            service={selectedService}
            onClose={() => {
              setShowSendModal(false);
              setSelectedService(null);
            }}
            onSave={() => {
              setShowSendModal(false);
              setSelectedService(null);
              setRefreshTrigger(prev => prev + 1);
            }}
          />
        )}

        {/* Return from Service Modal */}
        {showReturnModal && selectedService && (
          <ReturnServiceModal
            service={selectedService}
            onClose={() => {
              setShowReturnModal(false);
              setSelectedService(null);
            }}
            onSave={() => {
              setShowReturnModal(false);
              setSelectedService(null);
              setRefreshTrigger(prev => prev + 1);
            }}
          />
        )}

        {/* License Renewal Modal */}
        {showLicenseRenewalModal && (
          <VehicleLicenseRenewalModal
            onClose={() => setShowLicenseRenewalModal(false)}
          />
        )}

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

  useEffect(() => {
    const fetchDefects = async () => {
      const allDefects = await api.getActiveDefects();
      const critical = allDefects.filter(d =>
        d.urgency === DefectUrgency.High || d.urgency === DefectUrgency.Critical
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
    <Card>
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
              <p className="text-sm text-gray-500 mt-1">Vehicle: {defect.vehicleId} | Reported: {defect.reportedDateTime.toLocaleDateString()}</p>
            </button>
          );
        }) : <p className="text-gray-500">No high or critical defects reported.</p>}
      </div>
    </Card>
  );
};


interface UpcomingServicesProps {
    onBookService: (service: ScheduledService) => void;
    onSendService: (service: ScheduledService) => void;
    onReturnService: (service: ScheduledService) => void;
    refreshTrigger: number;
}

const UpcomingServices: React.FC<UpcomingServicesProps> = ({ onBookService, onSendService, onReturnService, refreshTrigger }) => {
    const [scheduledServices, setScheduledServices] = useState<ScheduledService[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [servicesNeedingReminders, setServicesNeedingReminders] = useState<ScheduledService[]>([]);

    const fetchData = async () => {
        try {
            const [services, vehicleData, reminders] = await Promise.all([
                api.getScheduledServices(),
                api.getVehicles(),
                api.getServicesNeedingReminders()
            ]);
            setScheduledServices(services);
            setVehicles(vehicleData);
            setServicesNeedingReminders(reminders);
        } catch (error) {
            console.error('Failed to fetch service data:', error);
        }
    };

    useEffect(() => {
        fetchData();
    }, [refreshTrigger]);


    const getVehicleRegistration = (vehicleId: string) => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        return vehicle?.registration || 'Unknown';
    };

    const calculateDaysUntilDue = (dueDate: string): string => {
        const today = new Date();
        const due = new Date(dueDate);
        const diffTime = due.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
        if (diffDays === 0) return 'Due today';
        if (diffDays === 1) return 'Due tomorrow';
        return `${diffDays} days`;
    };

    return (
        <div className="space-y-4">
            {/* Reminder Alerts */}
            {servicesNeedingReminders.length > 0 && (
                <Card className="border-orange-200 bg-orange-50">
                    <div className="flex items-center mb-3">
                        <AlertTriangle className="h-5 w-5 text-orange-500 mr-2" />
                        <h3 className="text-lg font-semibold text-orange-800">Service Reminders Needed</h3>
                    </div>
                    <div className="space-y-2">
                        {servicesNeedingReminders.map(service => (
                            <div key={service.id} className="text-sm text-orange-700">
                                <strong>{getVehicleRegistration(service.vehicleId)}</strong> - {service.serviceType}
                                scheduled for tomorrow at {service.bookedTime} ({service.serviceProvider})
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-orange-600 mt-2">⚠️ Send reminders to prevent no-show fees!</p>
                </Card>
            )}

            <Card>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Service Management</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Type</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {scheduledServices.map((service) => {
                                const daysUntilDue = calculateDaysUntilDue(service.dueDate);
                                const isOverdue = daysUntilDue.includes('overdue');

                                return (
                                    <tr key={service.id} className={isOverdue ? 'bg-red-50' : ''}>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {getVehicleRegistration(service.vehicleId)}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {service.serviceType}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                                            <span className={`font-bold ${isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
                                                {daysUntilDue}
                                            </span>
                                            <div className="text-xs text-gray-500">{service.dueDate}</div>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            {service.sentForService ? (
                                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                                    In Service
                                                </span>
                                            ) : service.isBooked ? (
                                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                                    Booked
                                                </span>
                                            ) : (
                                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                                    Not Booked
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-xs text-gray-500">
                                            {service.sentForService ? (
                                                <div>
                                                    <div>Sent: {service.sentDate}</div>
                                                    <div className="text-gray-400">{service.serviceProvider}</div>
                                                </div>
                                            ) : service.isBooked ? (
                                                <div>
                                                    <div>{service.bookedDate} at {service.bookedTime}</div>
                                                    <div className="text-gray-400">{service.serviceProvider}</div>
                                                </div>
                                            ) : (
                                                <span className="text-red-500">Not scheduled</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                                            <div className="flex space-x-2">
                                                {!service.isBooked && (
                                                    <button
                                                        onClick={() => onBookService(service)}
                                                        className="text-blue-600 hover:text-blue-900 text-xs"
                                                    >
                                                        Book Service
                                                    </button>
                                                )}
                                                {service.isBooked && !service.sentForService && (
                                                    <button
                                                        onClick={() => onSendService(service)}
                                                        className="text-orange-600 hover:text-orange-900 text-xs"
                                                    >
                                                        Send for Service
                                                    </button>
                                                )}
                                                {service.sentForService && !service.returnedFromService && (
                                                    <button
                                                        onClick={() => onReturnService(service)}
                                                        className="text-green-600 hover:text-green-900 text-xs"
                                                    >
                                                        Return from Service
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

// Service Booking Modal
interface ServiceBookingModalProps {
    service: ScheduledService;
    onClose: () => void;
    onSave: () => void;
}

const ServiceBookingModal: React.FC<ServiceBookingModalProps> = ({ service, onClose, onSave }) => {
    const [bookedDate, setBookedDate] = useState(service.bookedDate || '');
    const [bookedTime, setBookedTime] = useState(service.bookedTime || '');
    const [serviceProviderId, setServiceProviderId] = useState('');
    const [notes, setNotes] = useState(service.notes || '');
    const [loading, setLoading] = useState(false);
    const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>([]);
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [vehicleData, providers] = await Promise.all([
                    api.getVehicle(service.vehicleId),
                    api.getServiceProviders(true) // Only active providers
                ]);

                setVehicle(vehicleData);
                setServiceProviders(providers);

                // Set default service provider based on vehicle preferences or current service provider
                if (service.serviceProvider) {
                    // Find existing provider by name
                    const existingProvider = providers.find(p => p.name === service.serviceProvider);
                    if (existingProvider) {
                        setServiceProviderId(existingProvider.id);
                    }
                } else if (vehicleData?.defaultServiceProviderId) {
                    setServiceProviderId(vehicleData.defaultServiceProviderId);
                }
            } catch (error) {
                console.error('Failed to fetch data for service booking:', error);
            }
        };
        fetchData();
    }, [service.vehicleId, service.serviceProvider]);

    const handleSave = async () => {
        if (!bookedDate || !bookedTime || !serviceProviderId) {
            alert('Please fill in all required fields');
            return;
        }

        const selectedProvider = serviceProviders.find(p => p.id === serviceProviderId);
        if (!selectedProvider) {
            alert('Please select a valid service provider');
            return;
        }

        setLoading(true);
        try {
            await api.updateScheduledService(service.id, {
                isBooked: true,
                bookedDate,
                bookedTime,
                serviceProvider: selectedProvider.name,
                notes,
                reminderSent: false
            });
            onSave();
        } catch (error) {
            console.error('Failed to book service:', error);
            alert('Failed to book service. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold mb-4">Book Service</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Service Date *
                        </label>
                        <input
                            type="date"
                            value={bookedDate}
                            onChange={(e) => setBookedDate(e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Service Time *
                        </label>
                        <input
                            type="time"
                            value={bookedTime}
                            onChange={(e) => setBookedTime(e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Service Provider *
                        </label>
                        <select
                            value={serviceProviderId}
                            onChange={(e) => setServiceProviderId(e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                        >
                            <option value="">Select a service provider...</option>
                            {serviceProviders.map((provider) => (
                                <option key={provider.id} value={provider.id}>
                                    {provider.name} - {provider.city}
                                    {vehicle?.defaultServiceProviderId === provider.id && ' (Default)'}
                                    {vehicle?.warrantyServiceProviderId === provider.id && ' (Warranty)'}
                                </option>
                            ))}
                        </select>
                        {serviceProviderId && (
                            <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                                {(() => {
                                    const selected = serviceProviders.find(p => p.id === serviceProviderId);
                                    return selected ? (
                                        <div>
                                            <div><strong>{selected.name}</strong></div>
                                            <div>Contact: {selected.contactPerson} - {selected.primaryPhone}</div>
                                            <div>Specializes in: {selected.specializations.join(', ')}</div>
                                        </div>
                                    ) : null;
                                })()}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Notes
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Any additional notes"
                            className="w-full border border-gray-300 rounded-md px-3 py-2 h-20"
                        />
                    </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading ? 'Saving...' : 'Book Service'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Send for Service Modal
interface SendServiceModalProps {
    service: ScheduledService;
    onClose: () => void;
    onSave: () => void;
}

const SendServiceModal: React.FC<SendServiceModalProps> = ({ service, onClose, onSave }) => {
    const [sentDate, setSentDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            await api.sendVehicleForService(service.id, sentDate);
            onSave();
        } catch (error) {
            console.error('Failed to send vehicle for service:', error);
            alert('Failed to send vehicle for service. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold mb-4">Send Vehicle for Service</h3>
                <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-2">
                        Vehicle: <strong>{service.vehicleId}</strong><br/>
                        Service: <strong>{service.serviceType}</strong><br/>
                        Provider: <strong>{service.serviceProvider}</strong>
                    </p>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Date Sent
                        </label>
                        <input
                            type="date"
                            value={sentDate}
                            onChange={(e) => setSentDate(e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                    </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
                    >
                        {loading ? 'Sending...' : 'Send for Service'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Return from Service Modal
interface ReturnServiceModalProps {
    service: ScheduledService;
    onClose: () => void;
    onSave: () => void;
}

const ReturnServiceModal: React.FC<ReturnServiceModalProps> = ({ service, onClose, onSave }) => {
    const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
    const [actualCost, setActualCost] = useState('');
    const [serviceNotes, setServiceNotes] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!actualCost || !serviceNotes) {
            alert('Please fill in the service cost and notes');
            return;
        }

        const cost = parseFloat(actualCost);
        if (isNaN(cost) || cost < 0) {
            alert('Please enter a valid cost');
            return;
        }

        setLoading(true);
        try {
            await api.returnVehicleFromService(service.id, {
                returnDate,
                actualCost: cost,
                serviceNotes
            });
            onSave();
        } catch (error) {
            console.error('Failed to return vehicle from service:', error);
            alert('Failed to return vehicle from service. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold mb-4">Return Vehicle from Service</h3>
                <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-2">
                        Vehicle: <strong>{service.vehicleId}</strong><br/>
                        Service: <strong>{service.serviceType}</strong><br/>
                        Provider: <strong>{service.serviceProvider}</strong><br/>
                        Sent: <strong>{service.sentDate}</strong>
                    </p>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Return Date
                        </label>
                        <input
                            type="date"
                            value={returnDate}
                            onChange={(e) => setReturnDate(e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Actual Service Cost *
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={actualCost}
                            onChange={(e) => setActualCost(e.target.value)}
                            placeholder="0.00"
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Service Notes *
                        </label>
                        <textarea
                            value={serviceNotes}
                            onChange={(e) => setServiceNotes(e.target.value)}
                            placeholder="What work was completed, any issues found, etc."
                            className="w-full border border-gray-300 rounded-md px-3 py-2 h-24"
                        />
                    </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                        {loading ? 'Saving...' : 'Return from Service'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const LicenseRenewalAlerts: React.FC = () => {
    const [expiredVehicles, setExpiredVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(false);

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

    if (loading) {
        return (
            <Card>
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
        <Card className="border-orange-200 bg-orange-50">
            <div className="flex items-center mb-3">
                <AlertTriangle className="h-5 w-5 text-orange-500 mr-2" />
                <h3 className="text-lg font-semibold text-orange-800">License Renewal Required</h3>
            </div>
            <div className="space-y-3">
                {expiredVehicles.map(vehicle => (
                    <div key={vehicle.id} className="flex justify-between items-center p-3 bg-white rounded-lg border border-orange-200">
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
                        </div>
                        <div className="text-right">
                            <button
                                onClick={() => {
                                    // This would open the vehicle details in edit mode
                                    // For now, we'll show an alert
                                    alert(`Please update license information for ${vehicle.registration}`);
                                }}
                                className="bg-orange-500 text-white px-3 py-1 rounded text-sm hover:bg-orange-600 transition"
                            >
                                Update License
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <p className="text-xs text-orange-600 mt-3">⚠️ Ensure licenses are renewed to avoid penalties and keep vehicles road-legal!</p>
        </Card>
    );
};

interface VehicleLicenseRenewalModalProps {
    onClose: () => void;
}

const VehicleLicenseRenewalModal: React.FC<VehicleLicenseRenewalModalProps> = ({ onClose }) => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchVehicles = async () => {
            try {
                // Get vehicles with licenses expiring in the next 30 days
                const vehiclesNeedingRenewal = await api.getVehiclesWithExpiredLicenses(30);
                setVehicles(vehiclesNeedingRenewal);
            } catch (error) {
                console.error('Failed to fetch vehicles:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchVehicles();
    }, []);

    const getLicenseStatusColor = (vehicle: Vehicle) => {
        if (!vehicle.licenseExpiryDate) return 'text-gray-500';

        const today = new Date();
        const expiryDate = new Date(vehicle.licenseExpiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 0) return 'bg-red-100 text-red-800';
        if (daysUntilExpiry <= 7) return 'bg-red-100 text-red-800';
        if (daysUntilExpiry <= 14) return 'bg-orange-100 text-orange-800';
        return 'bg-yellow-100 text-yellow-800';
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

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div className="flex items-center">
                        <AlertTriangle className="h-6 w-6 text-red-500 mr-2" />
                        <h2 className="text-2xl font-bold text-gray-800">
                            Vehicles Requiring License Renewal (Next 30 Days)
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                    >
                        ×
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="animate-pulse space-y-4">
                            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                        </div>
                    ) : vehicles.length === 0 ? (
                        <div className="text-center py-8">
                            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                            <h3 className="text-lg font-semibold text-gray-700 mb-2">No License Renewals Needed</h3>
                            <p className="text-gray-500">All vehicle licenses are up to date for the next 30 days.</p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Registration
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Vehicle
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                License Expiry
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Disc Number
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {vehicles.map((vehicle) => (
                                            <tr key={vehicle.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {vehicle.registration}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">
                                                        {vehicle.make} {vehicle.model}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {vehicle.year}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">
                                                        {vehicle.licenseExpiryDate || 'Not set'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getLicenseStatusColor(vehicle)}`}>
                                                        {getLicenseStatusText(vehicle)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">
                                                        {vehicle.licenseDiscNumber || 'N/A'}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-sm text-red-800">
                                    <strong>⚠️ Important:</strong> Ensure all vehicle licenses are renewed before their expiry dates
                                    to avoid penalties and keep vehicles road-legal. Contact your licensing authority immediately
                                    for vehicles that are expired or expiring soon.
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="flex justify-end p-6 border-t border-gray-200">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition duration-300"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};


export default AdminDashboard;