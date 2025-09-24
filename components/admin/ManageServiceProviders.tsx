import React, { useState, useEffect } from 'react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { ServiceProvider, VehicleType } from '../../types';
import api from '../../services/mockApi';
import { ArrowLeft, Plus, Edit, Trash2, Phone, Mail, MapPin, CheckCircle, XCircle } from 'lucide-react';

interface ManageServiceProvidersProps {
    onBack: () => void;
}

const ManageServiceProviders: React.FC<ManageServiceProvidersProps> = ({ onBack }) => {
    const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingProvider, setEditingProvider] = useState<ServiceProvider | null>(null);
    const [showInactive, setShowInactive] = useState(false);

    useEffect(() => {
        fetchServiceProviders();
    }, [showInactive]);

    const fetchServiceProviders = async () => {
        try {
            const providers = await api.getServiceProviders(!showInactive);
            setServiceProviders(providers);
        } catch (error) {
            console.error('Failed to fetch service providers:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddProvider = () => {
        setEditingProvider(null);
        setShowModal(true);
    };

    const handleEditProvider = (provider: ServiceProvider) => {
        setEditingProvider(provider);
        setShowModal(true);
    };

    const handleDeleteProvider = async (providerId: string, providerName: string) => {
        if (!window.confirm(`Are you sure you want to delete "${providerName}"?`)) {
            return;
        }

        try {
            await api.deleteServiceProvider(providerId);
            await fetchServiceProviders();
        } catch (error: any) {
            alert(error.message || 'Failed to delete service provider');
        }
    };

    const handleToggleActive = async (provider: ServiceProvider) => {
        try {
            await api.updateServiceProvider(provider.id, { isActive: !provider.isActive });
            await fetchServiceProviders();
        } catch (error) {
            console.error('Failed to toggle provider status:', error);
            alert('Failed to update provider status');
        }
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Manage Service Providers" />
            <main className="max-w-7xl mx-auto p-6">
                <div className="mb-6 flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="flex items-center text-gray-600 hover:text-gray-800"
                    >
                        <ArrowLeft className="h-5 w-5 mr-2" />
                        Back to Dashboard
                    </button>
                    <div className="flex items-center space-x-4">
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={showInactive}
                                onChange={(e) => setShowInactive(e.target.checked)}
                                className="mr-2"
                            />
                            Show Inactive Providers
                        </label>
                        <button
                            onClick={handleAddProvider}
                            className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                        >
                            <Plus className="h-5 w-5 mr-2" />
                            Add Service Provider
                        </button>
                    </div>
                </div>

                {loading ? (
                    <Card>
                        <div className="text-center py-8">Loading service providers...</div>
                    </Card>
                ) : (
                    <Card>
                        <h2 className="text-xl font-bold text-gray-800 mb-4">Service Providers</h2>
                        {serviceProviders.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                No service providers found
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Provider
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Contact
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Location
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Specializations
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {serviceProviders.map((provider) => (
                                            <tr key={provider.id}>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {provider.name}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            Contact: {provider.contactPerson}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center">
                                                            <Phone className="h-4 w-4 mr-1" />
                                                            {provider.primaryPhone}
                                                        </div>
                                                        {provider.secondaryPhone && (
                                                            <div className="flex items-center">
                                                                <Phone className="h-4 w-4 mr-1" />
                                                                {provider.secondaryPhone}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center">
                                                            <Mail className="h-4 w-4 mr-1" />
                                                            {provider.email}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <div className="flex items-start">
                                                        <MapPin className="h-4 w-4 mr-1 mt-0.5 flex-shrink-0" />
                                                        <div>
                                                            <div>{provider.city}</div>
                                                            <div>{provider.province}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <div className="flex flex-wrap gap-1">
                                                        {provider.specializations.map((spec) => (
                                                            <span
                                                                key={spec}
                                                                className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800"
                                                            >
                                                                {spec}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <button
                                                        onClick={() => handleToggleActive(provider)}
                                                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                                            provider.isActive
                                                                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                                : 'bg-red-100 text-red-800 hover:bg-red-200'
                                                        }`}
                                                    >
                                                        {provider.isActive ? (
                                                            <CheckCircle className="h-4 w-4 mr-1" />
                                                        ) : (
                                                            <XCircle className="h-4 w-4 mr-1" />
                                                        )}
                                                        {provider.isActive ? 'Active' : 'Inactive'}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                    <div className="flex space-x-2">
                                                        <button
                                                            onClick={() => handleEditProvider(provider)}
                                                            className="text-indigo-600 hover:text-indigo-900"
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteProvider(provider.id, provider.name)}
                                                            className="text-red-600 hover:text-red-900"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                )}

                {showModal && (
                    <ServiceProviderModal
                        provider={editingProvider}
                        onClose={() => setShowModal(false)}
                        onSave={() => {
                            setShowModal(false);
                            fetchServiceProviders();
                        }}
                    />
                )}
            </main>
        </div>
    );
};

// Service Provider Modal Component
interface ServiceProviderModalProps {
    provider: ServiceProvider | null;
    onClose: () => void;
    onSave: () => void;
}

const ServiceProviderModal: React.FC<ServiceProviderModalProps> = ({ provider, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        name: provider?.name || '',
        contactPerson: provider?.contactPerson || '',
        primaryPhone: provider?.primaryPhone || '',
        secondaryPhone: provider?.secondaryPhone || '',
        email: provider?.email || '',
        address: provider?.address || '',
        city: provider?.city || '',
        province: provider?.province || '',
        postalCode: provider?.postalCode || '',
        specializations: provider?.specializations || [],
        isActive: provider?.isActive ?? true,
        notes: provider?.notes || ''
    });
    const [loading, setLoading] = useState(false);

    const handleSpecializationChange = (spec: string, checked: boolean) => {
        setFormData(prev => ({
            ...prev,
            specializations: checked
                ? [...prev.specializations, spec]
                : prev.specializations.filter(s => s !== spec)
        }));
    };

    const handleSave = async () => {
        if (!formData.name || !formData.contactPerson || !formData.primaryPhone || !formData.email) {
            alert('Please fill in all required fields');
            return;
        }

        if (formData.specializations.length === 0) {
            alert('Please select at least one specialization');
            return;
        }

        setLoading(true);
        try {
            if (provider) {
                await api.updateServiceProvider(provider.id, formData);
            } else {
                await api.addServiceProvider(formData);
            }
            onSave();
        } catch (error) {
            console.error('Failed to save service provider:', error);
            alert('Failed to save service provider');
        } finally {
            setLoading(false);
        }
    };

    const availableSpecializations = ['ICE', 'EV', 'General', 'Warranty', 'Emergency', 'Toyota', 'Ford', 'Kia', 'Hyundai', 'VW'];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4">
                    {provider ? 'Edit Service Provider' : 'Add Service Provider'}
                </h3>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Provider Name *
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                                placeholder="e.g., City Motors Workshop"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Contact Person *
                            </label>
                            <input
                                type="text"
                                value={formData.contactPerson}
                                onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                                placeholder="e.g., John Smith"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Primary Phone *
                            </label>
                            <input
                                type="text"
                                value={formData.primaryPhone}
                                onChange={(e) => setFormData({...formData, primaryPhone: e.target.value})}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                                placeholder="021-555-0001"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Secondary Phone
                            </label>
                            <input
                                type="text"
                                value={formData.secondaryPhone}
                                onChange={(e) => setFormData({...formData, secondaryPhone: e.target.value})}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                                placeholder="082-555-0001"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email Address *
                        </label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                            placeholder="service@example.co.za"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Address *
                        </label>
                        <input
                            type="text"
                            value={formData.address}
                            onChange={(e) => setFormData({...formData, address: e.target.value})}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                            placeholder="123 Main Road"
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                City *
                            </label>
                            <input
                                type="text"
                                value={formData.city}
                                onChange={(e) => setFormData({...formData, city: e.target.value})}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                                placeholder="Cape Town"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Province *
                            </label>
                            <input
                                type="text"
                                value={formData.province}
                                onChange={(e) => setFormData({...formData, province: e.target.value})}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                                placeholder="Western Cape"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Postal Code *
                            </label>
                            <input
                                type="text"
                                value={formData.postalCode}
                                onChange={(e) => setFormData({...formData, postalCode: e.target.value})}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                                placeholder="8001"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Specializations *
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {availableSpecializations.map((spec) => (
                                <label key={spec} className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={formData.specializations.includes(spec)}
                                        onChange={(e) => handleSpecializationChange(spec, e.target.checked)}
                                        className="mr-2"
                                    />
                                    {spec}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={formData.isActive}
                                onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                                className="mr-2"
                            />
                            Active Provider
                        </label>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Notes
                        </label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({...formData, notes: e.target.value})}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 h-20"
                            placeholder="Additional notes about this service provider..."
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
                        {loading ? 'Saving...' : (provider ? 'Update Provider' : 'Add Provider')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManageServiceProviders;