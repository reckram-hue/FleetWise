import React, { useState, useEffect } from 'react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DefectReport, Cost, DefectUrgency, CostCategory, UserRole, ScheduledService, Vehicle } from '../../types';
import api from '../../services/mockApi';
import { AlertTriangle, Fuel, Users, Truck, Settings as SettingsIcon } from 'lucide-react';
import ManageDrivers from './ManageDrivers';
import ManageVehicles from './ManageVehicles';
import Reports from './Reports';
import Settings from './Settings';


const AdminDashboard: React.FC = () => {
    const [view, setView] = useState('dashboard');
    const [totalDrivers, setTotalDrivers] = useState(0);
    const [totalVehicles, setTotalVehicles] = useState(0);

    useEffect(() => {
        api.getUsers().then(users => {
            setTotalDrivers(users.filter(u => u.role === UserRole.Driver).length);
        });
        api.getVehicles().then(vehicles => {
            setTotalVehicles(vehicles.length);
        });
    }, []);


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

  return (
    <div className="min-h-screen bg-gray-100">
      <Header title="Admin Dashboard" />
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Total Vehicles" value={totalVehicles.toString()} icon={<Truck className="h-8 w-8 text-cyan-500"/>} />
            <StatCard title="Total Drivers" value={totalDrivers.toString()} icon={<Users className="h-8 w-8 text-purple-500"/>} />
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
            <button onClick={() => setView('reports')} className="bg-purple-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-purple-600 transition duration-300 shadow-lg">
                <AlertTriangle className="h-5 w-5 mr-2 inline" />
                Reports
            </button>
            <button onClick={() => setView('settings')} className="bg-gray-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-700 transition duration-300 shadow-lg">
                <SettingsIcon className="h-5 w-5 mr-2 inline" />
                Settings
            </button>
        </div>


        <div className="grid grid-cols-1 gap-6">
          <CriticalDefects />
        </div>
        
        <UpcomingServices />
        
      </main>
    </div>
  );
};


const StatCard = ({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) => (
    <Card>
        <div className="flex items-center">
            <div className="p-3 rounded-full bg-gray-200 mr-4">
                {icon}
            </div>
            <div>
                <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
            </div>
        </div>
    </Card>
);

const CriticalDefects: React.FC = () => {
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
            <div key={defect.id} className="p-3 bg-gray-50 rounded-lg border">
              <div className="flex justify-between items-start">
                <p className="font-semibold">{defect.description}</p>
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
            </div>
          );
        }) : <p className="text-gray-500">No high or critical defects reported.</p>}
      </div>
    </Card>
  );
};


const UpcomingServices: React.FC = () => {
    const [scheduledServices, setScheduledServices] = useState<ScheduledService[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [servicesNeedingReminders, setServicesNeedingReminders] = useState<ScheduledService[]>([]);

    useEffect(() => {
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
        fetchData();
    }, []);

    const handleBookingToggle = async (serviceId: string, isBooked: boolean) => {
        try {
            const updates: Partial<ScheduledService> = { isBooked };
            if (!isBooked) {
                // Clear booking details if unchecking
                updates.bookedDate = undefined;
                updates.bookedTime = undefined;
                updates.serviceProvider = undefined;
                updates.reminderSent = false;
            }

            const updatedService = await api.updateScheduledService(serviceId, updates);
            setScheduledServices(prev =>
                prev.map(s => s.id === serviceId ? updatedService : s)
            );
        } catch (error) {
            console.error('Failed to update booking status:', error);
        }
    };

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
                <h2 className="text-xl font-bold text-gray-800 mb-4">Upcoming Services</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle Reg</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Booked</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {scheduledServices.map((service) => {
                                const daysUntilDue = calculateDaysUntilDue(service.dueDate);
                                const isOverdue = daysUntilDue.includes('overdue');

                                return (
                                    <tr key={service.id} className={isOverdue ? 'bg-red-50' : ''}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {getVehicleRegistration(service.vehicleId)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {service.serviceType}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <span className={`font-bold ${isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
                                                {daysUntilDue}
                                            </span>
                                            <div className="text-xs text-gray-500">{service.dueDate}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <input
                                                type="checkbox"
                                                checked={service.isBooked}
                                                onChange={(e) => handleBookingToggle(service.id, e.target.checked)}
                                                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                            {service.isBooked && (
                                                <span className="ml-2 text-xs text-green-600">✓ Booked</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                                            {service.isBooked ? (
                                                <div>
                                                    <div>{service.bookedDate} at {service.bookedTime}</div>
                                                    <div className="text-gray-400">{service.serviceProvider}</div>
                                                </div>
                                            ) : (
                                                <span className="text-red-500">Not booked</span>
                                            )}
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


export default AdminDashboard;