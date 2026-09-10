import EvidencePhoto from '../shared/EvidencePhoto';
import { formatVehicleIdentity } from '../../lib/vehicleIdentity';
import { visibleDefects, isTestDefect } from '../../lib/defectVisibility';
import React, { useState, useEffect } from 'react';
import { DefectReport, DefectUrgency, DefectCategory, DefectStatus, User, Vehicle } from '../../types';
import api from '../../services/firebaseApi';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { AlertTriangle, Edit, CheckCircle, X, User as UserIcon, Car, Calendar, DollarSign } from 'lucide-react';

interface ManageDefectsProps {
    onBack: () => void;
    selectedDefectId?: string;
}

const ManageDefects: React.FC<ManageDefectsProps> = ({ onBack, selectedDefectId }) => {
    const [defects, setDefects] = useState<DefectReport[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<DefectStatus | 'all'>('all');
    const [urgencyFilter, setUrgencyFilter] = useState<DefectUrgency | 'all'>('all');
    const [selectedDefect, setSelectedDefect] = useState<DefectReport | null>(null);
    const [showDetail, setShowDetail] = useState(false);
    const [includeTest, setIncludeTest] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [defectsData, usersData, vehiclesData] = await Promise.all([
                api.getAllDefects(),
                api.getUsers(),
                api.getVehicles()
            ]);
            setDefects(defectsData);
            setUsers(usersData);
            setVehicles(vehiclesData);

            // If a specific defect was requested, select it
            if (selectedDefectId) {
                const defect = defectsData.find(d => d.id === selectedDefectId);
                if (defect) {
                    setSelectedDefect(defect);
                    setShowDetail(true);
                }
            }
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [selectedDefectId]);

    const getDriverName = (driverId: string) => {
        const driver = users.find(u => u.id === driverId);
        return driver ? `${driver.firstName} ${driver.surname}` : 'Unknown Driver';
    };

    const getVehicleInfo = (vehicleId: string) => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        return vehicle ? `${vehicle.registration} (${vehicle.make} ${vehicle.model})` : 'Unknown Vehicle';
    };

    const getUrgencyColor = (urgency: DefectUrgency) => {
        switch (urgency) {
            case DefectUrgency.Critical:
                return 'bg-red-100 text-red-800';
            case DefectUrgency.High:
                return 'bg-orange-100 text-orange-800';
            case DefectUrgency.Medium:
                return 'bg-yellow-100 text-yellow-800';
            case DefectUrgency.Low:
                return 'bg-gray-100 text-gray-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusColor = (status: DefectStatus) => {
        switch (status) {
            case DefectStatus.Open:
                return 'bg-red-100 text-red-800';
            case DefectStatus.Acknowledged:
                return 'bg-yellow-100 text-yellow-800';
            case DefectStatus.InProgress:
                return 'bg-blue-100 text-blue-800';
            case DefectStatus.Resolved:
                return 'bg-green-100 text-green-800';
            case DefectStatus.Duplicate:
                return 'bg-gray-100 text-gray-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const handleDefectClick = (defect: DefectReport) => {
        setSelectedDefect(defect);
        setShowDetail(true);
    };

    const handleStatusUpdate = (defect: DefectReport) => {
        setSelectedDefect(defect);
        setShowStatusModal(true);
    };

    const handleAssignDefect = (defect: DefectReport) => {
        setSelectedDefect(defect);
        setShowAssignModal(true);
    };

    const filteredDefects = visibleDefects(defects, users, vehicles, includeTest, statusFilter, urgencyFilter);

    const criticalAndHighDefects = filteredDefects.filter(d =>
        (d.urgency === DefectUrgency.Critical || d.urgency === DefectUrgency.High) &&
        d.status !== DefectStatus.Resolved
    );

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Manage Defects" />
            <main className="max-w-7xl mx-auto p-6">
                <Card>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-800">Defect Management</h2>
                        <button
                            onClick={onBack}
                            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
                        >
                            Back to Dashboard
                        </button>
                    </div>

                    <label className="block mb-4"><input type="checkbox" checked={includeTest} onChange={e => { setIncludeTest(e.target.checked); setShowDetail(false); }} /> Include TEST defects</label>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                            <div className="flex items-center">
                                <AlertTriangle className="h-8 w-8 text-red-500 mr-3" />
                                <div>
                                    <p className="text-sm font-medium text-red-600">Critical & High</p>
                                    <p className="text-2xl font-bold text-red-900">{criticalAndHighDefects.length}</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                            <div className="flex items-center">
                                <Edit className="h-8 w-8 text-yellow-500 mr-3" />
                                <div>
                                    <p className="text-sm font-medium text-yellow-600">Open</p>
                                    <p className="text-2xl font-bold text-yellow-900">
                                        {filteredDefects.filter(d => d.status === DefectStatus.Open).length}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <div className="flex items-center">
                                <UserIcon className="h-8 w-8 text-blue-500 mr-3" />
                                <div>
                                    <p className="text-sm font-medium text-blue-600">In Progress</p>
                                    <p className="text-2xl font-bold text-blue-900">
                                        {filteredDefects.filter(d => d.status === DefectStatus.InProgress).length}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                            <div className="flex items-center">
                                <CheckCircle className="h-8 w-8 text-green-500 mr-3" />
                                <div>
                                    <p className="text-sm font-medium text-green-600">Resolved</p>
                                    <p className="text-2xl font-bold text-green-900">
                                        {filteredDefects.filter(d => d.status === DefectStatus.Resolved).length}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status Filter</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as DefectStatus | 'all')}
                                className="p-2 border border-gray-300 rounded-md"
                            >
                                <option value="all">All Statuses</option>
                                <option value={DefectStatus.Open}>Open</option>
                                <option value={DefectStatus.Acknowledged}>Acknowledged</option>
                                <option value={DefectStatus.InProgress}>In Progress</option>
                                <option value={DefectStatus.Resolved}>Resolved</option>
                                <option value={DefectStatus.Duplicate}>Duplicate</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Urgency Filter</label>
                            <select
                                value={urgencyFilter}
                                onChange={(e) => setUrgencyFilter(e.target.value as DefectUrgency | 'all')}
                                className="p-2 border border-gray-300 rounded-md"
                            >
                                <option value="all">All Urgencies</option>
                                <option value={DefectUrgency.Critical}>Critical</option>
                                <option value={DefectUrgency.High}>High</option>
                                <option value={DefectUrgency.Medium}>Medium</option>
                                <option value={DefectUrgency.Low}>Low</option>
                            </select>
                        </div>
                    </div>

                    {/* Defects Table */}
                    {loading ? (
                        <p>Loading defects...</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Defect Details
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Vehicle & Driver
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Status & Priority
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Assignment
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredDefects.map((defect) => (
                                        <tr
                                            key={defect.id}
                                            className={`hover:bg-gray-50 ${
                                                defect.urgency === DefectUrgency.Critical ? 'border-l-4 border-red-500' :
                                                defect.urgency === DefectUrgency.High ? 'border-l-4 border-orange-500' : ''
                                            }`}
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <button
                                                    onClick={() => handleDefectClick(defect)}
                                                    className="text-left hover:text-blue-600 hover:underline cursor-pointer"
                                                >
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {defect.description}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {defect.category} • Reported {defect.reportedDateTime.toLocaleDateString()}
                                                    </div>
                                                    {defect.location && (
                                                        <div className="text-xs text-gray-400">Location: {defect.location}</div>
                                                    )}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                <div className="flex items-center text-sm">
                                                    <Car className="h-4 w-4 mr-1" />
                                                    {formatVehicleIdentity(defect, vehicles.find(v => v.id === defect.vehicleId)).primary}{isTestDefect(defect, users, vehicles) && <span className="ml-2 font-bold">TEST</span>}
                                                </div>
                                                <div className="flex items-center text-xs text-gray-400 mt-1">
                                                    <UserIcon className="h-3 w-3 mr-1" />
                                                    {getDriverName(defect.driverId)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col space-y-1">
                                                    <span className={`inline-flex px-2 text-xs font-semibold rounded-full ${getStatusColor(defect.status)}`}>
                                                        {defect.status}
                                                    </span>
                                                    <span className={`inline-flex px-2 text-xs font-semibold rounded-full ${getUrgencyColor(defect.urgency)}`}>
                                                        {defect.urgency}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {defect.assignedTo ? (
                                                    <div>
                                                        <div className="font-medium">{defect.assignedTo}</div>
                                                        {defect.estimatedCost && (
                                                            <div className="text-xs text-green-600">
                                                                Est: R{defect.estimatedCost.toLocaleString()}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400">Unassigned</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                <div className="flex space-x-2">
                                                    <button
                                                        onClick={() => handleStatusUpdate(defect)}
                                                        className="text-indigo-600 hover:text-indigo-900"
                                                        title="Update Status"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </button>
                                                    {!defect.assignedTo && (
                                                        <button
                                                            onClick={() => handleAssignDefect(defect)}
                                                            className="text-green-600 hover:text-green-900"
                                                            title="Assign Defect"
                                                        >
                                                            <UserIcon className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                {showDetail && selectedDefect && <div role="dialog" aria-modal="true" aria-label="Defect details" className="fixed inset-0 z-50 bg-white overflow-y-auto p-6">
                    <button className="min-h-11 underline" onClick={() => setShowDetail(false)}>Close defect details</button>
                    <h2 className="text-xl font-bold">{formatVehicleIdentity(selectedDefect, vehicles.find(v => v.id === selectedDefect.vehicleId)).primary}</h2>
                    <p>{formatVehicleIdentity(selectedDefect, vehicles.find(v => v.id === selectedDefect.vehicleId)).secondary}</p>
                    {isTestDefect(selectedDefect, users, vehicles) && <p className="font-bold">TEST</p>}
                    <p>{getDriverName(selectedDefect.driverId)} · {selectedDefect.category} · {selectedDefect.urgency} · {selectedDefect.status}</p>
                    <p>{selectedDefect.reportedDateTime.toLocaleString()}</p><p>{selectedDefect.description}</p>
                    <p>{selectedDefect.location}</p><p>{selectedDefect.notes}</p>
                    <h3 className="font-bold">Evidence / Photos</h3>
                    {!selectedDefect.photos?.length && <p>No photos provided.</p>}
                    {selectedDefect.photos?.map((_, index) => <EvidencePhoto key={selectedDefect.id + index} caption={'Defect evidence ' + (index + 1)} load={() => api.getDefectPhotoAdmin(selectedDefect.id, index)} />)}
                    <details><summary>Internal references</summary><p>Defect: {selectedDefect.id}</p><p>Vehicle: {selectedDefect.vehicleId}</p><p>Driver: {selectedDefect.driverId}</p></details>
                </div>}
                {/* Status Update Modal */}
                {showStatusModal && selectedDefect && (
                    <StatusUpdateModal
                        defect={selectedDefect}
                        onClose={() => {
                            setShowStatusModal(false);
                            setSelectedDefect(null);
                        }}
                        onSave={() => {
                            setShowStatusModal(false);
                            setSelectedDefect(null);
                            fetchData();
                        }}
                    />
                )}

                {/* Assignment Modal */}
                {showAssignModal && selectedDefect && (
                    <AssignDefectModal
                        defect={selectedDefect}
                        onClose={() => {
                            setShowAssignModal(false);
                            setSelectedDefect(null);
                        }}
                        onSave={() => {
                            setShowAssignModal(false);
                            setSelectedDefect(null);
                            fetchData();
                        }}
                    />
                )}
            </main>
        </div>
    );
};

// Status Update Modal Component
export const StatusUpdateModal = ({
    defect,
    onClose,
    onSave
}: {
    defect: DefectReport;
    onClose: () => void;
    onSave: () => void;
}) => {
    const [status, setStatus] = useState<DefectStatus>(defect.status);
    const [reviewed] = useState({ status: defect.status, revision: defect.defectRevision ?? 0 });
    const [notes, setNotes] = useState('');
    const [requestId] = useState(() => crypto.randomUUID());
    const [duplicateOf, setDuplicateOf] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await api.transitionDefectAdmin({ defectId: defect.id, requestId, expectedStatus: reviewed.status, expectedDefectRevision: reviewed.revision, status, notes, ...(status === DefectStatus.Duplicate ? { duplicateOf } : {}) });
            onSave();
        } catch (error) {
            console.error('Failed to update defect status:', error);
            alert((error as Error).message || 'Error updating defect status.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">Update Defect Status</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200">
                        <X size={20} />
                    </button>
                </div>

                <div className="mb-4 p-3 bg-gray-50 rounded">
                    <p className="text-sm font-medium text-gray-900">{defect.description}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {defect.category} • Current Status: {defect.status}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {status === DefectStatus.Duplicate && <label>Original defect reference<input required value={duplicateOf} onChange={e => setDuplicateOf(e.target.value)} className="block border p-2 w-full" /></label>}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as DefectStatus)}
                            className="w-full p-2 border border-gray-300 rounded-md"
                            required
                        >
                            <option value={DefectStatus.Open}>Open</option>
                            <option value={DefectStatus.Acknowledged}>Acknowledged</option>
                            <option value={DefectStatus.InProgress}>In Progress</option>
                            <option value={DefectStatus.Resolved}>Resolved</option>
                            <option value={DefectStatus.Duplicate}>Duplicate</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            required placeholder="Reason for status change (required)..."
                            className="w-full p-2 border border-gray-300 rounded-md h-24"
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Updating...' : 'Update Status'}
                        </button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

// Assignment Modal Component
export const AssignDefectModal = ({
    defect,
    onClose,
    onSave
}: {
    defect: DefectReport;
    onClose: () => void;
    onSave: () => void;
}) => {
    const [assignedTo, setAssignedTo] = useState('');
    const [reviewed] = useState({ status: defect.status, revision: defect.defectRevision ?? 0 });
    const [estimatedCost, setEstimatedCost] = useState('');
    const [requestId] = useState(() => crypto.randomUUID());
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignedTo) {
            alert('Please enter who to assign this defect to.');
            return;
        }

        setIsSubmitting(true);
        try {
            const cost = estimatedCost ? parseFloat(estimatedCost) : undefined;
            await api.transitionDefectAdmin({ defectId: defect.id, requestId, expectedStatus: reviewed.status, expectedDefectRevision: reviewed.revision, status: DefectStatus.InProgress, assignedTo, notes: 'Assigned for repair: ' + assignedTo, ...(cost !== undefined ? { estimatedCost: cost } : {}) });
            onSave();
        } catch (error) {
            console.error('Failed to assign defect:', error);
            alert('Error assigning defect.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">Assign Defect</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200">
                        <X size={20} />
                    </button>
                </div>

                <div className="mb-4 p-3 bg-gray-50 rounded">
                    <p className="text-sm font-medium text-gray-900">{defect.description}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {defect.category} • {defect.urgency} Priority
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
                        <input
                            type="text"
                            value={assignedTo}
                            onChange={(e) => setAssignedTo(e.target.value)}
                            placeholder="Workshop, technician, or company name"
                            className="w-full p-2 border border-gray-300 rounded-md"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Estimated Cost (Optional)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={estimatedCost}
                            onChange={(e) => setEstimatedCost(e.target.value)}
                            placeholder="0.00"
                            className="w-full p-2 border border-gray-300 rounded-md"
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Assigning...' : 'Assign Defect'}
                        </button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default ManageDefects;
