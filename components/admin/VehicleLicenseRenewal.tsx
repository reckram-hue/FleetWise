import React, { useState, useEffect } from 'react';
import { Vehicle } from '../../types';
import api from '../../services/mockApi';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { AlertTriangle, FileText, ArrowLeft, Edit, Save, X } from 'lucide-react';

interface VehicleLicenseRenewalProps {
    onBack: () => void;
}

const VehicleLicenseRenewal: React.FC<VehicleLicenseRenewalProps> = ({ onBack }) => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{
        licenseExpiryDate: string;
        licenseDiscNumber: string;
        lastLicenseRenewalDate: string;
        licenseRenewalReminderDays: number;
        licenseNumber: string;
    }>({
        licenseExpiryDate: '',
        licenseDiscNumber: '',
        lastLicenseRenewalDate: '',
        licenseRenewalReminderDays: 30,
        licenseNumber: ''
    });

    useEffect(() => {
        fetchVehicles();
    }, []);

    const fetchVehicles = async () => {
        setLoading(true);
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

    const handleEditClick = (vehicle: Vehicle) => {
        setEditingVehicleId(vehicle.id);
        setEditForm({
            licenseExpiryDate: vehicle.licenseExpiryDate || '',
            licenseDiscNumber: vehicle.licenseDiscNumber || '',
            lastLicenseRenewalDate: vehicle.lastLicenseRenewalDate || '',
            licenseRenewalReminderDays: vehicle.licenseRenewalReminderDays || 30,
            licenseNumber: vehicle.licenseNumber || ''
        });
    };

    const handleCancelEdit = () => {
        setEditingVehicleId(null);
        setEditForm({
            licenseExpiryDate: '',
            licenseDiscNumber: '',
            lastLicenseRenewalDate: '',
            licenseRenewalReminderDays: 30,
            licenseNumber: ''
        });
    };

    const handleSaveEdit = async () => {
        if (!editingVehicleId) return;

        try {
            const vehicle = vehicles.find(v => v.id === editingVehicleId);
            if (!vehicle) return;

            const updatedVehicle = {
                ...vehicle,
                ...editForm
            };

            await api.updateVehicle(updatedVehicle);

            // Refresh the vehicles list
            await fetchVehicles();

            setEditingVehicleId(null);
            setEditForm({
                licenseExpiryDate: '',
                licenseDiscNumber: '',
                lastLicenseRenewalDate: '',
                licenseRenewalReminderDays: 30,
                licenseNumber: ''
            });
        } catch (error) {
            console.error('Failed to update vehicle license information:', error);
            alert('Failed to update license information. Please try again.');
        }
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Vehicle License Renewal" />
            <main className="max-w-7xl mx-auto p-6 space-y-6">
                {/* Back Button */}
                <button
                    onClick={onBack}
                    className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5 mr-2" />
                    Back to Dashboard
                </button>

                {/* Page Header Card */}
                <Card className="bg-gradient-to-r from-red-50 to-orange-50 border-red-200">
                    <div className="flex items-center">
                        <div className="p-3 rounded-full mr-4 bg-red-100">
                            <FileText className="h-8 w-8 text-red-500" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">
                                Vehicle License Renewal Management
                            </h1>
                            <p className="text-gray-600 mt-1">
                                Manage and update license information for vehicles requiring renewal within 30 days
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                        <div className="text-center">
                            <p className="text-sm font-medium text-gray-500">Total Vehicles</p>
                            <p className="mt-1 text-3xl font-semibold text-gray-900">{vehicles.length}</p>
                        </div>
                    </Card>
                    <Card>
                        <div className="text-center">
                            <p className="text-sm font-medium text-red-600">Expired</p>
                            <p className="mt-1 text-3xl font-semibold text-red-600">
                                {vehicles.filter(v => {
                                    if (!v.licenseExpiryDate) return false;
                                    const today = new Date();
                                    const expiryDate = new Date(v.licenseExpiryDate);
                                    return expiryDate < today;
                                }).length}
                            </p>
                        </div>
                    </Card>
                    <Card>
                        <div className="text-center">
                            <p className="text-sm font-medium text-orange-600">Expiring Soon</p>
                            <p className="mt-1 text-3xl font-semibold text-orange-600">
                                {vehicles.filter(v => {
                                    if (!v.licenseExpiryDate) return false;
                                    const today = new Date();
                                    const expiryDate = new Date(v.licenseExpiryDate);
                                    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                    return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
                                }).length}
                            </p>
                        </div>
                    </Card>
                </div>

                {/* Vehicles Table */}
                <Card>
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-800">
                            Vehicles Requiring License Renewal
                        </h2>
                    </div>

                    {loading ? (
                        <div className="animate-pulse space-y-4">
                            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                        </div>
                    ) : vehicles.length === 0 ? (
                        <div className="text-center py-12">
                            <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-700 mb-2">
                                No License Renewals Needed
                            </h3>
                            <p className="text-gray-500">
                                All vehicle licenses are up to date for the next 30 days.
                            </p>
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
                                                License Expiry Date
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Disc Number
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Last Renewal
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {vehicles.map((vehicle) => (
                                            <React.Fragment key={vehicle.id}>
                                                {editingVehicleId === vehicle.id ? (
                                                    <tr className="bg-blue-50">
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
                                                            <input
                                                                type="date"
                                                                value={editForm.licenseExpiryDate}
                                                                onChange={(e) => setEditForm({ ...editForm, licenseExpiryDate: e.target.value })}
                                                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getLicenseStatusColor(vehicle)}`}>
                                                                {getLicenseStatusText(vehicle)}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <input
                                                                type="text"
                                                                value={editForm.licenseDiscNumber}
                                                                onChange={(e) => setEditForm({ ...editForm, licenseDiscNumber: e.target.value })}
                                                                placeholder="Disc Number"
                                                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <input
                                                                type="date"
                                                                value={editForm.lastLicenseRenewalDate}
                                                                onChange={(e) => setEditForm({ ...editForm, lastLicenseRenewalDate: e.target.value })}
                                                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex space-x-2">
                                                                <button
                                                                    onClick={handleSaveEdit}
                                                                    className="text-green-600 hover:text-green-900 transition-colors"
                                                                    title="Save"
                                                                >
                                                                    <Save className="h-5 w-5" />
                                                                </button>
                                                                <button
                                                                    onClick={handleCancelEdit}
                                                                    className="text-red-600 hover:text-red-900 transition-colors"
                                                                    title="Cancel"
                                                                >
                                                                    <X className="h-5 w-5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    <tr className="hover:bg-gray-50">
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
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm text-gray-900">
                                                                {vehicle.lastLicenseRenewalDate || 'N/A'}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <button
                                                                onClick={() => handleEditClick(vehicle)}
                                                                className="text-blue-600 hover:text-blue-900 transition-colors"
                                                                title="Edit License Information"
                                                            >
                                                                <Edit className="h-5 w-5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-start">
                                    <AlertTriangle className="h-5 w-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm text-red-800">
                                        <strong>Important:</strong> Ensure all vehicle licenses are renewed before their expiry dates
                                        to avoid penalties and keep vehicles road-legal. Contact your licensing authority immediately
                                        for vehicles that are expired or expiring soon.
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </Card>
            </main>
        </div>
    );
};

export default VehicleLicenseRenewal;
