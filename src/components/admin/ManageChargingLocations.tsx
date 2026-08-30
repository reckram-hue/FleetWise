import React, { useState, useEffect } from 'react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import {
    ChargingLocation,
    ChargingLocationType,
    ChargingLocationTariffMethod,
    ChargingLocationCostOwner,
} from '../../types';
import api from '../../services/firebaseApi';
import { ArrowLeft, Plus, Edit, CheckCircle, XCircle, AlertTriangle, MapPin } from 'lucide-react';

const TYPE_LABELS: Record<ChargingLocationType, string> = {
    OFFICE: 'Office / Company Site',
    PUBLIC_THIRD_PARTY: 'Public / Third Party',
};

const COST_OWNER_LABELS: Record<ChargingLocationCostOwner, string> = {
    COMPANY: 'Company',
    DRIVER: 'Driver',
};

const TARIFF_METHOD_LABELS: Record<ChargingLocationTariffMethod, string> = {
    FREE: 'Free',
    PER_KWH: 'Per kWh',
    PER_SESSION: 'Per Session',
};

function formatTariff(location: ChargingLocation): string {
    if (location.tariffMethod === 'FREE') return 'Free';
    const label = TARIFF_METHOD_LABELS[location.tariffMethod];
    if (typeof location.tariffRate !== 'number') return label;
    return location.tariffMethod === 'PER_KWH'
        ? `R${location.tariffRate.toFixed(2)} / kWh`
        : `R${location.tariffRate.toFixed(2)} / session`;
}

interface ManageChargingLocationsProps {
    onBack: () => void;
}

const ManageChargingLocations: React.FC<ManageChargingLocationsProps> = ({ onBack }) => {
    const [locations, setLocations] = useState<ChargingLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [showInactive, setShowInactive] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingLocation, setEditingLocation] = useState<ChargingLocation | null>(null);
    const [toggleError, setToggleError] = useState<string | null>(null);

    const fetchLocations = async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const data = await api.listChargingLocationsAdmin();
            setLocations(data);
        } catch (error) {
            console.error('Failed to fetch charging locations:', error);
            setLoadError('Unable to load charging locations. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLocations();
    }, []);

    const handleAddLocation = () => {
        setEditingLocation(null);
        setShowModal(true);
    };

    const handleEditLocation = (location: ChargingLocation) => {
        setEditingLocation(location);
        setShowModal(true);
    };

    const handleToggleActive = async (location: ChargingLocation) => {
        setToggleError(null);
        try {
            await api.updateChargingLocation(location.id, { active: !location.active });
            await fetchLocations();
        } catch (error) {
            console.error('Failed to toggle charging location status:', error);
            setToggleError(`Failed to ${location.active ? 'deactivate' : 'activate'} "${location.name}". Please try again.`);
        }
    };

    const visibleLocations = showInactive ? locations : locations.filter((l) => l.active);

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Manage Charging Locations" />
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
                            Show Inactive Locations
                        </label>
                        <button
                            onClick={handleAddLocation}
                            className="flex items-center bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"
                        >
                            <Plus className="h-5 w-5 mr-2" />
                            Add Charging Location
                        </button>
                    </div>
                </div>

                {toggleError && (
                    <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start">
                        <AlertTriangle className="h-4 w-4 mr-1.5 text-red-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700">{toggleError}</p>
                    </div>
                )}

                {loading ? (
                    <Card>
                        <div className="text-center py-8">Loading charging locations...</div>
                    </Card>
                ) : loadError ? (
                    <Card>
                        <div className="text-center py-8">
                            <AlertTriangle className="mx-auto h-10 w-10 text-red-500 mb-3" />
                            <p className="text-red-700">{loadError}</p>
                            <button
                                onClick={fetchLocations}
                                className="mt-4 bg-gray-200 text-gray-800 font-medium py-2 px-4 rounded-lg hover:bg-gray-300"
                            >
                                Retry
                            </button>
                        </div>
                    </Card>
                ) : (
                    <Card>
                        <h2 className="text-xl font-bold text-gray-800 mb-4">Charging Locations</h2>
                        {visibleLocations.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                {locations.length === 0
                                    ? 'No charging locations found. Add one to make it available in the driver charging flow.'
                                    : 'No active charging locations. Enable "Show Inactive Locations" to see them.'}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost Owner</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tariff</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {visibleLocations.map((location) => (
                                            <tr key={location.id}>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-start">
                                                        <MapPin className="h-4 w-4 mr-1.5 mt-0.5 text-gray-400 flex-shrink-0" />
                                                        <div>
                                                            <div className="text-sm font-medium text-gray-900">{location.name}</div>
                                                            {(location.provider || location.chargerType) && (
                                                                <div className="text-xs text-gray-500">
                                                                    {[location.provider, location.chargerType].filter(Boolean).join(' • ')}
                                                                </div>
                                                            )}
                                                            {location.description && (
                                                                <div className="text-xs text-gray-400 mt-0.5">{location.description}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                    {TYPE_LABELS[location.type]}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                    {COST_OWNER_LABELS[location.costOwner]}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                    {formatTariff(location)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <button
                                                        onClick={() => handleToggleActive(location)}
                                                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${location.active
                                                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                            : 'bg-red-100 text-red-800 hover:bg-red-200'
                                                            }`}
                                                        title={location.active ? 'Deactivate' : 'Activate'}
                                                    >
                                                        {location.active ? (
                                                            <CheckCircle className="h-4 w-4 mr-1" />
                                                        ) : (
                                                            <XCircle className="h-4 w-4 mr-1" />
                                                        )}
                                                        {location.active ? 'Active' : 'Inactive'}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                    <button
                                                        onClick={() => handleEditLocation(location)}
                                                        className="text-indigo-600 hover:text-indigo-900"
                                                        title="Edit"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </button>
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
                    <ChargingLocationModal
                        location={editingLocation}
                        onClose={() => setShowModal(false)}
                        onSave={() => {
                            setShowModal(false);
                            fetchLocations();
                        }}
                    />
                )}
            </main>
        </div>
    );
};

// ---- Create/Edit Modal ----

interface ChargingLocationModalProps {
    location: ChargingLocation | null;
    onClose: () => void;
    onSave: () => void;
}

const ChargingLocationModal: React.FC<ChargingLocationModalProps> = ({ location, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        name: location?.name || '',
        type: (location?.type || '') as ChargingLocationType | '',
        description: location?.description || '',
        active: location?.active ?? true,
        provider: location?.provider || '',
        chargerType: location?.chargerType || '',
        tariffMethod: (location?.tariffMethod || '') as ChargingLocationTariffMethod | '',
        tariffRate: typeof location?.tariffRate === 'number' ? String(location.tariffRate) : '',
        costOwner: (location?.costOwner || '') as ChargingLocationCostOwner | '',
    });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const requiresTariffRate = formData.tariffMethod === 'PER_KWH' || formData.tariffMethod === 'PER_SESSION';

    const handleSave = async () => {
        setFormError(null);

        if (!formData.name.trim()) {
            setFormError('Location name is required.');
            return;
        }
        if (!formData.type) {
            setFormError('Select a location type.');
            return;
        }
        if (!formData.costOwner) {
            setFormError('Select who bears the charging cost.');
            return;
        }
        if (!formData.tariffMethod) {
            setFormError('Select a tariff method.');
            return;
        }

        let tariffRate: number | undefined;
        if (requiresTariffRate) {
            const parsed = parseFloat(formData.tariffRate);
            if (formData.tariffRate.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
                setFormError(`Enter a valid, non-negative tariff rate for ${TARIFF_METHOD_LABELS[formData.tariffMethod]}.`);
                return;
            }
            tariffRate = parsed;
        }
        // FREE locations never carry a rate, even if one was left over from a prior selection.

        const payload = {
            name: formData.name.trim(),
            type: formData.type as ChargingLocationType,
            description: formData.description.trim() || undefined,
            active: formData.active,
            provider: formData.provider.trim() || undefined,
            chargerType: formData.chargerType.trim() || undefined,
            tariffMethod: formData.tariffMethod as ChargingLocationTariffMethod,
            tariffRate,
            costOwner: formData.costOwner as ChargingLocationCostOwner,
        };

        setSaving(true);
        try {
            if (location) {
                await api.updateChargingLocation(location.id, payload);
            } else {
                await api.createChargingLocation(payload);
            }
            onSave();
        } catch (error) {
            console.error('Failed to save charging location:', error);
            setFormError(error instanceof Error && error.message ? error.message : 'Failed to save charging location. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4">
                    {location ? 'Edit Charging Location' : 'Add Charging Location'}
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Location Name *</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full border border-gray-300 rounded-md px-3 py-2"
                            placeholder="e.g., Head Office Depot"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                            <select
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value as ChargingLocationType })}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                            >
                                <option value="">Select type</option>
                                {(Object.keys(TYPE_LABELS) as ChargingLocationType[]).map((type) => (
                                    <option key={type} value={type}>{TYPE_LABELS[type]}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cost Owner *</label>
                            <select
                                value={formData.costOwner}
                                onChange={(e) => setFormData({ ...formData, costOwner: e.target.value as ChargingLocationCostOwner })}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                            >
                                <option value="">Select cost owner</option>
                                {(Object.keys(COST_OWNER_LABELS) as ChargingLocationCostOwner[]).map((owner) => (
                                    <option key={owner} value={owner}>{COST_OWNER_LABELS[owner]}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tariff Method *</label>
                            <select
                                value={formData.tariffMethod}
                                onChange={(e) => setFormData({ ...formData, tariffMethod: e.target.value as ChargingLocationTariffMethod })}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                            >
                                <option value="">Select tariff method</option>
                                {(Object.keys(TARIFF_METHOD_LABELS) as ChargingLocationTariffMethod[]).map((method) => (
                                    <option key={method} value={method}>{TARIFF_METHOD_LABELS[method]}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Tariff Rate (R){requiresTariffRate ? ' *' : ''}
                            </label>
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={formData.tariffRate}
                                onChange={(e) => setFormData({ ...formData, tariffRate: e.target.value })}
                                disabled={!requiresTariffRate}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 disabled:bg-gray-100 disabled:text-gray-400"
                                placeholder={requiresTariffRate ? '0.00' : 'Not applicable — Free'}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                            <input
                                type="text"
                                value={formData.provider}
                                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                                placeholder="e.g., GridCharge"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Charger Type</label>
                            <input
                                type="text"
                                value={formData.chargerType}
                                onChange={(e) => setFormData({ ...formData, chargerType: e.target.value })}
                                className="w-full border border-gray-300 rounded-md px-3 py-2"
                                placeholder="e.g., CCS2 DC Fast"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 h-20"
                            placeholder="Additional details drivers should know about this location..."
                        />
                    </div>

                    <div>
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={formData.active}
                                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                className="mr-2"
                            />
                            Active — visible to drivers in the charging location picker
                        </label>
                    </div>

                    {formError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start">
                            <AlertTriangle className="h-4 w-4 mr-1.5 text-red-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700">{formError}</p>
                        </div>
                    )}
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
                        disabled={saving}
                        className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : (location ? 'Update Location' : 'Add Location')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManageChargingLocations;
