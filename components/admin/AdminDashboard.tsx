import React, { useState, useEffect } from 'react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DefectReport, Cost, DefectUrgency, CostCategory, UserRole } from '../../types';
import api from '../../services/mockApi';
import { AlertTriangle, Fuel, Users, Truck } from 'lucide-react';
import Leaderboard from '../shared/Leaderboard';
import ManageDrivers from './ManageDrivers';
import ManageVehicles from './ManageVehicles';
import ManageCosts from './ManageCosts';
import ManageIncidents from './ManageIncidents';


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


    if (view === 'leaderboard') {
        return <Leaderboard onBack={() => setView('dashboard')} />;
    }
    
    if (view === 'manageDrivers') {
        return <ManageDrivers onBack={() => setView('dashboard')} />;
    }

    if (view === 'manageVehicles') {
        return <ManageVehicles onBack={() => setView('dashboard')} />;
    }

    if (view === 'manageCosts') {
        return <ManageCosts onBack={() => setView('dashboard')} />;
    }

    if (view === 'manageIncidents') {
        return <ManageIncidents onBack={() => setView('dashboard')} />;
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
        
        <div className="flex flex-wrap gap-4">
            <button onClick={() => setView('leaderboard')} className="bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 transition">View Driver Leaderboard</button>
            <button onClick={() => setView('manageDrivers')} className="bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-600 transition">Manage Drivers</button>
            <button onClick={() => setView('manageVehicles')} className="bg-cyan-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-600 transition">Manage Vehicles</button>
            <button onClick={() => setView('manageCosts')} className="bg-orange-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-orange-600 transition">Track Costs</button>
            <button onClick={() => setView('manageIncidents')} className="bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 transition">Manage Driver Incidents</button>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CriticalDefects />
          <CostAnalysisChart />
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

  return (
    <Card>
      <h2 className="text-xl font-bold text-gray-800 mb-4">High & Critical Defects</h2>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {defects.length > 0 ? defects.map(defect => (
          <div key={defect.id} className="p-3 bg-gray-50 rounded-lg border">
            <div className="flex justify-between items-start">
              <p className="font-semibold">{defect.description}</p>
              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${urgencyColor[defect.urgency]}`}>{defect.urgency}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">Vehicle: {defect.vehicleId} | Reported: {defect.dateTime.toLocaleDateString()}</p>
          </div>
        )) : <p className="text-gray-500">No high or critical defects reported.</p>}
      </div>
    </Card>
  );
};

const CostAnalysisChart: React.FC = () => {
  const [costs, setCosts] = useState<Cost[]>([]);

  useEffect(() => {
    api.getVehicleCosts().then(setCosts);
  }, []);

  const data = Object.values(CostCategory).map(category => ({
    name: category,
    Cost: costs
      .filter(c => c.category === category)
      .reduce((sum, c) => sum + c.cost, 0)
  }));

  return (
    <Card>
      <h2 className="text-xl font-bold text-gray-800 mb-4">Vehicle Running Costs by Category</h2>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} interval={0} fontSize={12} />
            <YAxis />
            <Tooltip formatter={(value: number) => `R ${value.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="Cost" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

const UpcomingServices: React.FC = () => {
    // In a real app, this data would be calculated based on last service odometer + service interval vs current odometer
    const upcoming = [
        { vehicle: 'CA 123-456', dueIn: '500 km', lastService: '45100 km' },
        { vehicle: 'GP 789-XYZ', dueIn: '1200 km', lastService: '72300 km' },
    ];
    return (
        <Card>
             <h2 className="text-xl font-bold text-gray-800 mb-4">Upcoming Services</h2>
             <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle Reg</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due In</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Service Odometer</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {upcoming.map((item, index) => (
                        <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.vehicle}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"><span className="font-bold text-red-600">{item.dueIn}</span></td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.lastService}</td>
                        </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};


export default AdminDashboard;