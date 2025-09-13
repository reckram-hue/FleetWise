import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Cost, CostCategory, Vehicle } from '../../types';
import api from '../../services/mockApi';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { Plus, X } from 'lucide-react';

const emptyCost: Omit<Cost, 'id'> = {
    vehicleId: '',
    date: new Date(),
    cost: 0,
    category: CostCategory.Fuel,
    description: '',
};

interface ManageCostsProps {
    onBack: () => void;
}

const ManageCosts: React.FC<ManageCostsProps> = ({ onBack }) => {
    const [costs, setCosts] = useState<Cost[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newCost, setNewCost] = useState<Omit<Cost, 'id'>>(emptyCost);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [costData, vehicleData] = await Promise.all([
                api.getVehicleCosts(),
                api.getVehicles()
            ]);
            setCosts(costData.sort((a,b) => b.date.getTime() - a.date.getTime()));
            setVehicles(vehicleData);
            if (vehicleData.length > 0) {
                setNewCost(prev => ({ ...prev, vehicleId: vehicleData[0].id }));
            }
        } catch (error) {
            console.error("Failed to fetch cost data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const parsedValue = name === 'cost' ? parseFloat(value) || 0 : value;
        const finalValue = name === 'date' ? new Date(value) : parsedValue;
        setNewCost({ ...newCost, [name]: finalValue });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCost.vehicleId || newCost.cost <= 0) {
            alert("Please select a vehicle and enter a valid cost.");
            return;
        }
        try {
            await api.addCost(newCost);
            setShowForm(false);
            setNewCost(emptyCost);
            fetchAllData(); // Refetch all data
        } catch (error) {
            console.error("Failed to add cost:", error);
            alert("Error adding cost entry.");
        }
    };

    const costByCategory = useMemo(() => {
        const categoryMap: { [key in CostCategory]?: number } = {};
        costs.forEach(cost => {
            categoryMap[cost.category] = (categoryMap[cost.category] || 0) + cost.cost;
        });
        return Object.entries(categoryMap).map(([name, value]) => ({
            name,
            value,
        }));
    }, [costs]);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF'];
    
    const renderAddCostForm = () => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-lg">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">Add New Cost Entry</h3>
                    <button onClick={() => setShowForm(false)} className="p-1 rounded-full hover:bg-gray-200"><X size={20}/></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Vehicle</label>
                        <select name="vehicleId" value={newCost.vehicleId} onChange={handleFormChange} className="p-2 border rounded w-full" required>
                            {vehicles.map(v => <option key={v.id} value={v.id}>{v.registration} - {v.make} {v.model}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Date</label>
                            <input type="date" name="date" value={newCost.date.toISOString().split('T')[0]} onChange={handleFormChange} className="p-2 border rounded w-full" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Category</label>
                            <select name="category" value={newCost.category} onChange={handleFormChange} className="p-2 border rounded w-full" required>
                                {Object.values(CostCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Cost (R)</label>
                        <input type="number" step="0.01" name="cost" value={newCost.cost || ''} onChange={handleFormChange} placeholder="e.g., 1200.50" className="p-2 border rounded w-full" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Description</label>
                        <textarea name="description" value={newCost.description} onChange={handleFormChange} placeholder="e.g., Diesel fill-up" className="p-2 border rounded w-full" rows={2} required></textarea>
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={() => setShowForm(false)} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">Cancel</button>
                        <button type="submit" className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600">Add Cost</button>
                    </div>
                </form>
            </Card>
        </div>
    );
    
    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Cost Tracking" />
            <main className="max-w-7xl mx-auto p-6">
                {showForm && renderAddCostForm()}
                <Card>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-800">Vehicle Cost Overview</h2>
                        <button onClick={() => setShowForm(true)} className="flex items-center bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                            <Plus className="h-5 w-5 mr-2" />
                            Add Cost
                        </button>
                    </div>

                    <button onClick={onBack} className="mb-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                        Back to Dashboard
                    </button>
                    
                     {loading ? (
                        <p>Loading cost data...</p>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                           <Card className="lg:col-span-2">
                                <h3 className="text-xl font-bold text-gray-800 mb-4">Costs by Category</h3>
                                <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={costByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="#8884d8" label>
                                            {costByCategory.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip formatter={(value: number) => `R ${value.toLocaleString()}`} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                                </div>
                            </Card>
                            <Card className="lg:col-span-3">
                                <h3 className="text-xl font-bold text-gray-800 mb-4">Recent Cost Entries</h3>
                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                    {costs.length > 0 ? costs.map(cost => {
                                        const vehicle = vehicles.find(v => v.id === cost.vehicleId);
                                        return (
                                            <div key={cost.id} className="p-3 bg-gray-50 rounded-lg border flex justify-between items-center">
                                                <div>
                                                    <p className="font-semibold">{cost.description}</p>
                                                    <p className="text-sm text-gray-500">{vehicle?.registration || 'N/A'} | {cost.date.toLocaleDateString()} | <span className="font-medium">{cost.category}</span></p>
                                                </div>
                                                <p className="text-lg font-bold text-gray-800">R {cost.cost.toLocaleString()}</p>
                                            </div>
                                        );
                                    }) : (
                                        <p className="text-gray-500">No cost entries found.</p>
                                    )}
                                </div>
                            </Card>
                        </div>
                    )}
                </Card>
            </main>
        </div>
    );
};

export default ManageCosts;
