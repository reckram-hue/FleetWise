import React, { useState, useEffect, useRef } from 'react';
import { Vehicle, VehicleType, VehicleStatus, MaintenanceRecord, BodyStyle, FuelType } from '../../types';
import api from '../../services/mockApi';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { Plus, Edit, Trash2, X, Wrench, QrCode, ChevronDown } from 'lucide-react';

const emptyVehicle: Omit<Vehicle, 'id'> = {
    registration: '',
    alias: '',
    make: '',
    model: '',
    vin: '',
    engineNumber: '',
    bodyStyle: undefined,
    colour: '',
    fuelType: undefined,
    vehicleType: VehicleType.ICE,
    status: VehicleStatus.Active,
    statusDate: new Date().toISOString().split('T')[0],
    statusNotes: '',
    currentOdometer: 0,
    serviceIntervalKm: 10000,
    lastServiceOdometer: 0,
    freeServicesUntilKm: 0,
    batteryCapacityKwh: 0,
    // Performance specifications
    manufacturerFuelConsumption: 0,
    manufacturerEnergyConsumption: 0,
    baselineFuelConsumption: 0,
    baselineEnergyConsumption: 0,
    economyVarianceThreshold: 15,
    // Financial details
    financeCompany: '',
    financeAccountNumber: '',
    financeCost: 0,
    financeEndDate: '',
    balloonPayment: 0,
    financeContactName: '',
    financeContactEmail: '',
    financeContactPhone: '',
    insuranceCompany: '',
    insurancePolicyNumber: '',
    insuranceFee: 0,
    insuranceContactName: '',
    insuranceContactEmail: '',
    insuranceContactPhone: '',
    trackingCompany: '',
    trackingAccountNumber: '',
    trackingFee: 0,
    trackingContactName: '',
    trackingContactEmail: '',
    trackingContactPhone: '',
    // Third Party Warranty Insurance
    warrantyInsurer: '',
    warrantyPolicyNumber: '',
    warrantyInceptionDate: '',
    warrantyExpiryDate: '',
    warrantyMileageTo: 0,
    warrantyContactName: '',
    warrantyContactEmail: '',
    warrantyContactPhone: '',
    // License Information
    licenseExpiryDate: '',
    licenseRenewalReminderDays: 30,
    lastLicenseRenewalDate: '',
    licenseNumber: '',
};

const emptyRecord: Omit<MaintenanceRecord, 'id' | 'vehicleId'> = {
    date: new Date().toISOString().split('T')[0],
    odometer: 0,
    serviceType: '',
    cost: 0,
    notes: '',
};

interface MaintenanceModalProps {
    vehicle: Vehicle;
    onClose: () => void;
    onRecordAdded: (updatedVehicle: Vehicle) => void;
}

const MaintenanceModal: React.FC<MaintenanceModalProps> = ({ vehicle, onClose, onRecordAdded }) => {
    const [newRecord, setNewRecord] = useState<Omit<MaintenanceRecord, 'id' | 'vehicleId'>>({
        ...emptyRecord,
        odometer: vehicle.currentOdometer || 0,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        setNewRecord(prev => ({ ...prev, odometer: vehicle.currentOdometer || 0 }));
    }, [vehicle]);

    const handleRecordChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const parsedValue = (name === 'cost' || name === 'odometer') ? parseFloat(value) || 0 : value;
        setNewRecord({ ...newRecord, [name]: parsedValue });
    };

    const handleRecordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newRecord.serviceType || newRecord.cost < 0 || newRecord.odometer <= 0) {
            alert("Please fill in all required fields: Service Type, Odometer, and a valid Cost.");
            return;
        }
        setIsSubmitting(true);
        try {
            const recordData = { ...newRecord, vehicleId: vehicle.id };
            const addedRecord = await api.addMaintenanceRecord(recordData);

            const updatedHistory = [addedRecord, ...(vehicle.maintenanceHistory || [])];
            updatedHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const updatedVehicle = {
                ...vehicle,
                maintenanceHistory: updatedHistory,
                lastServiceOdometer: Math.max(vehicle.lastServiceOdometer || 0, addedRecord.odometer)
            };

            onRecordAdded(updatedVehicle);

            setNewRecord({ ...emptyRecord, odometer: updatedVehicle.currentOdometer || 0 });
        } catch (error) {
            console.error("Failed to add maintenance record:", error);
            alert("Error adding record.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const isPotentiallyFreeService = vehicle.freeServicesUntilKm && (vehicle.currentOdometer || 0) <= vehicle.freeServicesUntilKm;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">Maintenance Log: {vehicle.make} {vehicle.model} ({vehicle.registration})</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200"><X size={20}/></button>
                </div>

                {isPotentiallyFreeService && (
                    <div className="mb-4 p-3 border-l-4 border-teal-500 bg-teal-50 text-teal-700 rounded-r-lg" role="alert">
                        <p className="font-bold">Service Plan Active</p>
                        <p>This vehicle has free services up to {(vehicle.freeServicesUntilKm || 0).toLocaleString()} km. Please verify if this service is covered and set cost to R 0.00 if applicable.</p>
                    </div>
                )}

                <div className="mb-6 p-4 border rounded-lg bg-gray-50">
                    <h4 className="text-lg font-semibold mb-3">Add New Record</h4>
                    <form onSubmit={handleRecordSubmit} className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <input type="date" name="date" value={newRecord.date} onChange={handleRecordChange} className="p-2 border rounded" required />
                            <input name="serviceType" value={newRecord.serviceType} onChange={handleRecordChange} placeholder="Service Type (e.g., Oil Change)" className="p-2 border rounded" required />
                            <input type="number" name="odometer" value={newRecord.odometer || ''} onChange={handleRecordChange} placeholder="Odometer (km)" className="p-2 border rounded" required />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <input type="number" name="cost" value={newRecord.cost || ''} onChange={handleRecordChange} placeholder="Cost (R)" className="p-2 border rounded col-span-1" required />
                            <textarea name="notes" value={newRecord.notes || ''} onChange={handleRecordChange} placeholder="Notes (optional)" className="p-2 border rounded md:col-span-2" rows={1}></textarea>
                        </div>
                        <div className="flex justify-end">
                            <button type="submit" disabled={isSubmitting} className="bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 transition disabled:bg-gray-400">
                                {isSubmitting ? 'Saving...' : 'Save Record'}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="flex-grow overflow-y-auto">
                    <h4 className="text-lg font-semibold mb-2">History</h4>
                    {(!vehicle.maintenanceHistory || vehicle.maintenanceHistory.length === 0) ? (
                        <p className="text-gray-500">No maintenance records found.</p>
                    ) : (
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Odometer</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {vehicle.maintenanceHistory.map(record => (
                                    <tr key={record.id}>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm">{record.date}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">{record.serviceType}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm">{record.odometer.toLocaleString()} km</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm">R {record.cost.toLocaleString()}</td>
                                        <td className="px-4 py-2 text-sm text-gray-600">{record.notes}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    )}
                </div>
            </Card>
        </div>
    );
};

interface QRModalProps {
    vehicle: Vehicle;
    onClose: () => void;
}
const QRModal: React.FC<QRModalProps> = ({ vehicle, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [qrStatus, setQrStatus] = useState<'loading' | 'generated' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState('Could not generate QR code.');

    useEffect(() => {
        if (!vehicle) return;

        let isMounted = true;
        setQrStatus('loading');

        const loadScript = (src: string): Promise<void> => {
            return new Promise((resolve, reject) => {
                if (document.querySelector(`script[src="${src}"]`)) {
                    resolve();
                    return;
                }

                const script = document.createElement('script');
                script.src = src;
                script.onload = () => resolve();
                script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
                document.head.appendChild(script);
            });
        };

        const generateQRCode = async () => {
            if (!isMounted) return;

            try {
                // Load QRCode library from CDN
                await loadScript('https://unpkg.com/qrcode-generator@1.4.4/qrcode.js');

                // Wait a bit for library to initialize
                await new Promise(resolve => setTimeout(resolve, 100));

                const qrContainer = document.getElementById('qr-code-container');
                if (!qrContainer) {
                    setErrorMessage("QR Code container element not found.");
                    setQrStatus('error');
                    return;
                }

                // Use qrcode-generator library (different API)
                const qr = (window as any).qrcode(0, 'H');
                qr.addData(vehicle.id);
                qr.make();

                // Create the QR code as SVG
                const cellSize = 4;
                const margin = 4;
                const size = qr.getModuleCount();
                const svgSize = (size + 2 * margin) * cellSize;

                let svg = `<svg width="${svgSize}" height="${svgSize}" xmlns="http://www.w3.org/2000/svg">`;
                svg += `<rect width="${svgSize}" height="${svgSize}" fill="white"/>`;

                for (let row = 0; row < size; row++) {
                    for (let col = 0; col < size; col++) {
                        if (qr.isDark(row, col)) {
                            const x = (col + margin) * cellSize;
                            const y = (row + margin) * cellSize;
                            svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
                        }
                    }
                }
                svg += '</svg>';

                qrContainer.innerHTML = svg;
                setQrStatus('generated');
                console.log("QR Code generated successfully for vehicle:", vehicle.id);

            } catch (error) {
                console.error("QR Code generation error:", error);
                setErrorMessage("Failed to generate QR Code. Please try again.");
                setQrStatus('error');
            }
        };

        generateQRCode();

        return () => {
            isMounted = false;
        };
    }, [vehicle]);


    return (
        <div className="qr-modal-overlay fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
             <style>{`
                @media print {
                    body > *:not(.qr-modal-print-area) {
                        display: none;
                    }
                    .qr-modal-print-area, .qr-modal-print-area * {
                        visibility: visible;
                    }
                     .qr-modal-print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        height: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>
            <div className="qr-modal-print-area">
                <Card className="text-center">
                    <h3 className="text-2xl font-bold">{vehicle.make} {vehicle.model}</h3>
                    <p className="text-lg font-semibold text-gray-700">{vehicle.registration}</p>

                    <div className="relative w-[256px] h-[256px] mx-auto my-4 bg-gray-100 flex items-center justify-center rounded-lg overflow-hidden">
                        {qrStatus === 'loading' && <p className="text-gray-500">Generating QR Code...</p>}
                        {qrStatus === 'error' && <p className="text-red-500 p-4">{errorMessage}</p>}
                        {/* The library will insert a canvas or img tag here */}
                        <div id="qr-code-container" className={qrStatus === 'generated' ? 'block' : 'hidden'}></div>
                    </div>

                    <p className="mt-2 text-sm text-gray-500">Scan to start/end shift</p>
                    <div className="mt-6 flex justify-center gap-4 no-print">
                        <button onClick={() => window.print()} className="bg-blue-500 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-600 transition">Print</button>
                        <button onClick={onClose} className="bg-gray-200 text-gray-800 font-bold py-2 px-6 rounded-lg hover:bg-gray-300">Close</button>
                    </div>
                </Card>
            </div>
        </div>
    )
};


interface ManageVehiclesProps {
    onBack: () => void;
}

const ManageVehicles: React.FC<ManageVehiclesProps> = ({ onBack }) => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false); // Controls whether form is in edit mode or view mode
    const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | Omit<Vehicle, 'id'>>(emptyVehicle);
    const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
    const [vehicleForMaintenance, setVehicleForMaintenance] = useState<Vehicle | null>(null);
    const [showQRModal, setShowQRModal] = useState(false);
    const [vehicleForQR, setVehicleForQR] = useState<Vehicle | null>(null);
    type StatusSortOrder = 'default' | 'active-first' | 'service-first' | 'repairs-first' | 'sold-first';
    const [statusSortOrder, setStatusSortOrder] = useState<StatusSortOrder>('default');

    const fetchVehicles = async () => {
        setLoading(true);
        const allVehicles = await api.getVehicles();
        setVehicles(allVehicles);
        setLoading(false);
    };

    useEffect(() => {
        fetchVehicles();
    }, []);

    const handleAddClick = () => {
        setIsEditing(false);
        setIsEditMode(true); // New vehicles start in edit mode
        setSelectedVehicle(emptyVehicle);
        setShowForm(true);
    };

    const handleEditClick = (vehicle: Vehicle) => {
        setIsEditing(true);
        setIsEditMode(false); // Start in view mode for existing vehicles
        setSelectedVehicle(vehicle);
        setShowForm(true);
    };

    const handleEditToggle = () => {
        setIsEditMode(!isEditMode);
    };

    const handleQRClick = (vehicle: Vehicle) => {
        setVehicleForQR(vehicle);
        setShowQRModal(true);
    };

    const handleDeleteClick = async (vehicleId: string) => {
        if (window.confirm("Are you sure you want to delete this vehicle?")) {
            try {
                await api.deleteVehicle(vehicleId);
                fetchVehicles();
            } catch (error) {
                console.error("Failed to delete vehicle:", error);
                alert("Error deleting vehicle.");
            }
        }
    };

    const handleMaintenanceClick = (vehicle: Vehicle) => {
        setVehicleForMaintenance(vehicle);
        setShowMaintenanceModal(true);
    };

    const handleViewVehicleDetails = (vehicle: Vehicle) => {
        setIsEditing(true);
        setIsEditMode(false); // Start in view mode
        setSelectedVehicle(vehicle);
        setShowForm(true);
    };

    const handleStatusSort = () => {
        const sortOrders: StatusSortOrder[] = ['default', 'active-first', 'service-first', 'repairs-first', 'sold-first'];
        const currentIndex = sortOrders.indexOf(statusSortOrder);
        const nextIndex = (currentIndex + 1) % sortOrders.length;
        setStatusSortOrder(sortOrders[nextIndex]);
    };

    const getSortOrderLabel = (order: StatusSortOrder): string => {
        switch (order) {
            case 'active-first': return 'Active First';
            case 'service-first': return 'In Service First';
            case 'repairs-first': return 'Repairs First';
            case 'sold-first': return 'Sold First';
            default: return 'Default Order';
        }
    };

    const getSortOrderPriority = (status: VehicleStatus, order: StatusSortOrder): number => {
        switch (order) {
            case 'active-first':
                return status === VehicleStatus.Active ? 0 :
                       status === VehicleStatus.InService ? 1 :
                       status === VehicleStatus.Repairs ? 2 :
                       status === VehicleStatus.Sold ? 3 : 4;
            case 'service-first':
                return status === VehicleStatus.InService ? 0 :
                       status === VehicleStatus.Active ? 1 :
                       status === VehicleStatus.Repairs ? 2 :
                       status === VehicleStatus.Sold ? 3 : 4;
            case 'repairs-first':
                return status === VehicleStatus.Repairs ? 0 :
                       status === VehicleStatus.InService ? 1 :
                       status === VehicleStatus.Active ? 2 :
                       status === VehicleStatus.Sold ? 3 : 4;
            case 'sold-first':
                return status === VehicleStatus.Sold ? 0 :
                       status === VehicleStatus.EndOfLife ? 1 :
                       status === VehicleStatus.Active ? 2 :
                       status === VehicleStatus.InService ? 3 : 4;
            default:
                return 0; // Default alphabetical/original order
        }
    };

    const sortedVehicles = [...vehicles].sort((a, b) => {
        if (statusSortOrder === 'default') {
            // Default sort by registration
            return a.registration.localeCompare(b.registration);
        }

        const priorityA = getSortOrderPriority(a.status, statusSortOrder);
        const priorityB = getSortOrderPriority(b.status, statusSortOrder);

        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }

        // Secondary sort by registration within same status
        return a.registration.localeCompare(b.registration);
    });

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const numericFields = [
            'currentOdometer', 'serviceIntervalKm', 'lastServiceOdometer', 'batteryCapacityKwh',
            'financeCost', 'insuranceFee', 'trackingFee', 'balloonPayment', 'freeServicesUntilKm',
            // Manufacturer and performance specs
            'manufacturerFuelConsumption', 'manufacturerEnergyConsumption',
            'baselineFuelConsumption', 'baselineEnergyConsumption',
            'currentFuelConsumption', 'currentEnergyConsumption',
            'economyVarianceThreshold',
            // License fields
            'licenseRenewalReminderDays'
        ];
        const parsedValue = numericFields.includes(name) ? (parseFloat(value) || 0) : value;
        setSelectedVehicle({ ...selectedVehicle, [name]: parsedValue });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isEditMode && isEditing) {
            // If viewing an existing vehicle and not in edit mode, don't submit
            return;
        }
        try {
            if (isEditing) {
                await api.updateVehicle(selectedVehicle as Vehicle);
            } else {
                await api.addVehicle(selectedVehicle as Omit<Vehicle, 'id'>);
            }
            setShowForm(false);
            setIsEditMode(false);
            fetchVehicles();
        } catch (error) {
            console.error("Failed to save vehicle:", error);
            alert("Error saving vehicle details.");
        }
    };

    const getNextServiceKm = (vehicle: Vehicle) => {
        if (vehicle.vehicleType === VehicleType.EV || !vehicle.serviceIntervalKm || vehicle.serviceIntervalKm <= 0) {
            return 'N/A';
        }

        const lastService = vehicle.lastServiceOdometer || 0;
        const nextServiceOdo = lastService + vehicle.serviceIntervalKm;
        const dueIn = nextServiceOdo - (vehicle.currentOdometer || 0);

        const isFree = vehicle.freeServicesUntilKm && nextServiceOdo <= vehicle.freeServicesUntilKm;
        const freeServiceTag = isFree ? (
            <span className="ml-2 px-2 py-1 text-xs font-semibold rounded-full bg-teal-100 text-teal-800">Free</span>
        ) : null;

        let dueText;
        if (dueIn <= 0) {
            dueText = <span className="font-bold text-red-600">Overdue by {Math.abs(dueIn).toLocaleString()} km</span>;
        } else if (dueIn <= 1000) {
            dueText = <span className="font-bold text-yellow-600">In {dueIn.toLocaleString()} km</span>;
        } else {
            dueText = `In ${dueIn.toLocaleString()} km`;
        }

        return <div className="flex items-center">{dueText}{freeServiceTag}</div>;
    };

    const getLicenseStatus = (vehicle: Vehicle) => {
        if (!vehicle.licenseExpiryDate) {
            return <span className="text-gray-500">No Date Set</span>;
        }

        const today = new Date();
        const expiryDate = new Date(vehicle.licenseExpiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const reminderDays = vehicle.licenseRenewalReminderDays || 30;

        if (daysUntilExpiry < 0) {
            return <span className="font-bold text-red-600">Expired {Math.abs(daysUntilExpiry)} days ago</span>;
        } else if (daysUntilExpiry <= reminderDays) {
            return <span className="font-bold text-yellow-600">Expires in {daysUntilExpiry} days</span>;
        } else {
            return <span className="text-green-600">Valid ({daysUntilExpiry} days left)</span>;
        }
    };

    const renderVehicleForm = () => (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                 <div className="flex justify-between items-center mb-4">
                    {!isEditing ? (
                        <h3 className="text-xl font-bold">Add New Vehicle</h3>
                    ) : (
                        <div className="flex items-center justify-between w-full">
                            <h3 className="text-xl font-bold">{selectedVehicle.make} {selectedVehicle.model} ({(selectedVehicle as Vehicle).registration})</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleEditToggle}
                                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition flex items-center gap-2"
                                >
                                    <Edit size={16} />
                                    {isEditMode ? 'Cancel Edit' : 'Edit Vehicle'}
                                </button>
                                <button onClick={() => { setShowForm(false); setIsEditMode(false); }} className="p-1 rounded-full hover:bg-gray-200"><X size={20}/></button>
                            </div>
                        </div>
                    )}
                    {!isEditing && (
                        <button onClick={() => { setShowForm(false); setIsEditMode(false); }} className="p-1 rounded-full hover:bg-gray-200"><X size={20}/></button>
                    )}
                 </div>
                 <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <h4 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Vehicle Details</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Registration</label>
                                <input name="registration" value={selectedVehicle.registration} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" required disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Alias/Friendly Name</label>
                                <input name="alias" value={selectedVehicle.alias || ''} onChange={handleFormChange} placeholder="e.g., Fleet Car 1, Delivery Van" className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Make</label>
                                <input name="make" value={selectedVehicle.make} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" required disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Model</label>
                                <input name="model" value={selectedVehicle.model} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" required disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">VIN (Vehicle Identification Number)</label>
                                <input name="vin" value={selectedVehicle.vin || ''} onChange={handleFormChange} placeholder="17-character VIN" className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Engine Number</label>
                                <input name="engineNumber" value={selectedVehicle.engineNumber || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Body Style</label>
                                <select name="bodyStyle" value={selectedVehicle.bodyStyle || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode}>
                                    <option value="">Select body style</option>
                                    <option value={BodyStyle.Sedan}>Sedan</option>
                                    <option value={BodyStyle.Hatchback}>Hatchback</option>
                                    <option value={BodyStyle.SUV}>SUV</option>
                                    <option value={BodyStyle.PanelVan}>Panel Van</option>
                                    <option value={BodyStyle.Truck}>Truck</option>
                                    <option value={BodyStyle.Bakkie}>Bakkie</option>
                                    <option value={BodyStyle.Coupe}>Coupe</option>
                                    <option value={BodyStyle.Convertible}>Convertible</option>
                                    <option value={BodyStyle.Wagon}>Wagon</option>
                                    <option value={BodyStyle.MiniBus}>Mini Bus</option>
                                    <option value={BodyStyle.Bus}>Bus</option>
                                    <option value={BodyStyle.Other}>Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Colour</label>
                                <input name="colour" value={selectedVehicle.colour || ''} onChange={handleFormChange} placeholder="e.g., White, Blue, Silver" className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Vehicle Type</label>
                                <select name="vehicleType" value={selectedVehicle.vehicleType} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" required disabled={!isEditMode}>
                                    <option value={VehicleType.ICE}>ICE (Internal Combustion Engine)</option>
                                    <option value={VehicleType.EV}>EV (Electric Vehicle)</option>
                                </select>
                            </div>
                            {selectedVehicle.vehicleType === VehicleType.ICE && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Fuel Type</label>
                                    <select name="fuelType" value={selectedVehicle.fuelType || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode}>
                                        <option value="">Select fuel type</option>
                                        <option value={FuelType.Petrol}>Petrol</option>
                                        <option value={FuelType.Diesel}>Diesel</option>
                                        <option value={FuelType.LPG}>LPG</option>
                                        <option value={FuelType.CNG}>CNG</option>
                                        <option value={FuelType.Hybrid}>Hybrid</option>
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Status</label>
                                <select name="status" value={selectedVehicle.status} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" required disabled={!isEditMode}>
                                    <option value={VehicleStatus.Active}>Active</option>
                                    <option value={VehicleStatus.InService}>In Service</option>
                                    <option value={VehicleStatus.Repairs}>Repairs</option>
                                    <option value={VehicleStatus.Sold}>Sold</option>
                                    <option value={VehicleStatus.EndOfLife}>End of Life</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Status Date</label>
                                <input type="date" name="statusDate" value={selectedVehicle.statusDate || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Status Notes</label>
                                <input name="statusNotes" value={selectedVehicle.statusNotes || ''} onChange={handleFormChange} placeholder="Reason for status change, expected return date, etc." className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Current Odometer (km)</label>
                                <input type="number" name="currentOdometer" value={selectedVehicle.currentOdometer || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" required disabled={!isEditMode} />
                            </div>

                            {selectedVehicle.vehicleType === VehicleType.ICE && (
                                <>
                                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Service Interval (km)</label>
                                            <input type="number" name="serviceIntervalKm" value={selectedVehicle.serviceIntervalKm || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Last Service Odo (km)</label>
                                            <input type="number" name="lastServiceOdometer" value={selectedVehicle.lastServiceOdometer || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Free Services Until (km)</label>
                                            <input type="number" name="freeServicesUntilKm" value={selectedVehicle.freeServicesUntilKm || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                                        </div>
                                    </div>
                                </>
                            )}
                            {selectedVehicle.vehicleType === VehicleType.EV && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Battery Capacity (kWh)</label>
                                    <input type="number" name="batteryCapacityKwh" value={selectedVehicle.batteryCapacityKwh || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Manufacturer Specifications & Performance */}
                    <div>
                        <h4 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Performance Specifications</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {selectedVehicle.vehicleType === VehicleType.ICE ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">
                                            Manufacturer Fuel Economy (L/100km)
                                            <span className="text-xs text-gray-500 block">Official manufacturer specification</span>
                                        </label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            name="manufacturerFuelConsumption"
                                            value={selectedVehicle.manufacturerFuelConsumption || ''}
                                            onChange={handleFormChange}
                                            className="mt-1 p-2 border rounded w-full"
                                            placeholder="e.g., 8.5"
                                            disabled={!isEditMode}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">
                                            Actual Baseline (L/100km)
                                            <span className="text-xs text-gray-500 block">Real-world established baseline</span>
                                        </label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            name="baselineFuelConsumption"
                                            value={selectedVehicle.baselineFuelConsumption || ''}
                                            onChange={handleFormChange}
                                            className="mt-1 p-2 border rounded w-full"
                                            placeholder="e.g., 9.2"
                                            disabled={!isEditMode}
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">
                                            Manufacturer Energy Economy (kWh/100km)
                                            <span className="text-xs text-gray-500 block">Official manufacturer specification</span>
                                        </label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            name="manufacturerEnergyConsumption"
                                            value={selectedVehicle.manufacturerEnergyConsumption || ''}
                                            onChange={handleFormChange}
                                            className="mt-1 p-2 border rounded w-full"
                                            placeholder="e.g., 18.5"
                                            disabled={!isEditMode}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">
                                            Actual Baseline (kWh/100km)
                                            <span className="text-xs text-gray-500 block">Real-world established baseline</span>
                                        </label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            name="baselineEnergyConsumption"
                                            value={selectedVehicle.baselineEnergyConsumption || ''}
                                            onChange={handleFormChange}
                                            className="mt-1 p-2 border rounded w-full"
                                            placeholder="e.g., 19.8"
                                            disabled={!isEditMode}
                                        />
                                    </div>
                                </>
                            )}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Performance Variance Threshold (%)
                                    <span className="text-xs text-gray-500 block">Alert when consumption exceeds this percentage above baseline</span>
                                </label>
                                <input
                                    type="number"
                                    step="1"
                                    name="economyVarianceThreshold"
                                    value={selectedVehicle.economyVarianceThreshold || ''}
                                    onChange={handleFormChange}
                                    className="mt-1 p-2 border rounded w-full max-w-xs"
                                    placeholder="15"
                                    disabled={!isEditMode}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Financial Information */}
                    <div>
                        <h4 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Financial Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Finance Company</label>
                                <input name="financeCompany" value={selectedVehicle.financeCompany || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Finance Account Number</label>
                                <input name="financeAccountNumber" value={selectedVehicle.financeAccountNumber || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Finance Cost (R)</label>
                                <input type="number" name="financeCost" value={selectedVehicle.financeCost || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Finance End Date</label>
                                <input type="date" name="financeEndDate" value={selectedVehicle.financeEndDate || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Balloon Payment (R)</label>
                                <input type="number" name="balloonPayment" value={selectedVehicle.balloonPayment || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact Name</label>
                                <input name="financeContactName" value={selectedVehicle.financeContactName || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact Email</label>
                                <input type="email" name="financeContactEmail" value={selectedVehicle.financeContactEmail || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact Phone</label>
                                <input type="tel" name="financeContactPhone" value={selectedVehicle.financeContactPhone || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                        </div>
                    </div>

                    {/* Insurance Information */}
                    <div>
                        <h4 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Insurance Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Insurance Company</label>
                                <input name="insuranceCompany" value={selectedVehicle.insuranceCompany || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Insurance Policy Number</label>
                                <input name="insurancePolicyNumber" value={selectedVehicle.insurancePolicyNumber || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Insurance Fee (R)</label>
                                <input type="number" name="insuranceFee" value={selectedVehicle.insuranceFee || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact Name</label>
                                <input name="insuranceContactName" value={selectedVehicle.insuranceContactName || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact Email</label>
                                <input type="email" name="insuranceContactEmail" value={selectedVehicle.insuranceContactEmail || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact Phone</label>
                                <input type="tel" name="insuranceContactPhone" value={selectedVehicle.insuranceContactPhone || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                        </div>
                    </div>

                    {/* Tracking Information */}
                    <div>
                        <h4 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Tracking Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Tracking Company</label>
                                <input name="trackingCompany" value={selectedVehicle.trackingCompany || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Tracking Account Number</label>
                                <input name="trackingAccountNumber" value={selectedVehicle.trackingAccountNumber || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Tracking Fee (R)</label>
                                <input type="number" name="trackingFee" value={selectedVehicle.trackingFee || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact Name</label>
                                <input name="trackingContactName" value={selectedVehicle.trackingContactName || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact Email</label>
                                <input type="email" name="trackingContactEmail" value={selectedVehicle.trackingContactEmail || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact Phone</label>
                                <input type="tel" name="trackingContactPhone" value={selectedVehicle.trackingContactPhone || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                        </div>
                    </div>

                    {/* Third Party Warranty Insurance */}
                    <div>
                        <h4 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Third Party Warranty Insurance</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Insurer</label>
                                <input name="warrantyInsurer" value={selectedVehicle.warrantyInsurer || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Policy Number</label>
                                <input name="warrantyPolicyNumber" value={selectedVehicle.warrantyPolicyNumber || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Date of Inception</label>
                                <input type="date" name="warrantyInceptionDate" value={selectedVehicle.warrantyInceptionDate || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Date of Expiry</label>
                                <input type="date" name="warrantyExpiryDate" value={selectedVehicle.warrantyExpiryDate || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Mileage To (km)</label>
                                <input type="number" name="warrantyMileageTo" value={selectedVehicle.warrantyMileageTo || ''} onChange={handleFormChange} placeholder="Mileage when warranty lapses" className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact Name</label>
                                <input name="warrantyContactName" value={selectedVehicle.warrantyContactName || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact Email</label>
                                <input type="email" name="warrantyContactEmail" value={selectedVehicle.warrantyContactEmail || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Contact Phone</label>
                                <input type="tel" name="warrantyContactPhone" value={selectedVehicle.warrantyContactPhone || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                        </div>
                    </div>

                    {/* License Information */}
                    <div>
                        <h4 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">License Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">License Number</label>
                                <input name="licenseNumber" value={selectedVehicle.licenseNumber || ''} onChange={handleFormChange} placeholder="License/Registration number" className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">License Expiry Date</label>
                                <input type="date" name="licenseExpiryDate" value={selectedVehicle.licenseExpiryDate || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Last Renewal Date</label>
                                <input type="date" name="lastLicenseRenewalDate" value={selectedVehicle.lastLicenseRenewalDate || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    Reminder Days Before Expiry
                                    <span className="text-xs text-gray-500 block">How many days before expiry to send reminder</span>
                                </label>
                                <input type="number" min="1" max="365" name="licenseRenewalReminderDays" value={selectedVehicle.licenseRenewalReminderDays || 30} onChange={handleFormChange} placeholder="30" className="mt-1 p-2 border rounded w-full" disabled={!isEditMode} />
                            </div>
                        </div>
                    </div>

                    {(isEditMode || !isEditing) && (
                        <div className="flex justify-end space-x-4">
                            <button type="button" onClick={() => {
                                if (isEditing) {
                                    setIsEditMode(false);
                                } else {
                                    setShowForm(false);
                                    setIsEditMode(false);
                                }
                            }} className="bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded-lg hover:bg-gray-400 transition">
                                {isEditing ? 'Cancel Edit' : 'Cancel'}
                            </button>
                            <button type="submit" className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600 transition">
                                {isEditing ? 'Update Vehicle' : 'Add Vehicle'}
                            </button>
                        </div>
                    )}
                </form>
            </Card>
        </div>
    );

    return (
        <div className="container mx-auto p-4">
            <Header title="Manage Vehicles" onBack={onBack} />
            {loading ? (
                <p>Loading vehicles...</p>
            ) : (
                <>
                    <div className="mb-4 flex justify-between items-center">
                        <button onClick={handleAddClick} className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600 transition flex items-center gap-2">
                            <Plus size={16} />
                            Add Vehicle
                        </button>
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-600">Sort by Status:</span>
                            <button
                                onClick={handleStatusSort}
                                className={`px-4 py-2 border rounded-lg transition-colors flex items-center gap-2 ${
                                    statusSortOrder !== 'default'
                                        ? 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                        : 'border-gray-300 bg-white hover:bg-gray-50'
                                }`}
                                title="Click to cycle through status sort orders"
                            >
                                {getSortOrderLabel(statusSortOrder)}
                                <ChevronDown size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full bg-white border border-gray-300 rounded-lg shadow-md">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registration</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alias</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Make & Model</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                        {statusSortOrder !== 'default' && (
                                            <div className="text-xs text-blue-600 font-normal mt-1">
                                                {getSortOrderLabel(statusSortOrder)}
                                            </div>
                                        )}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Odometer</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Service</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">License Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {sortedVehicles.map((vehicle, index) => {
                                    const isFirstOfStatus = index === 0 || sortedVehicles[index - 1].status !== vehicle.status;
                                    const shouldShowStatusDivider = statusSortOrder !== 'default' && isFirstOfStatus && index > 0;

                                    return (
                                        <React.Fragment key={vehicle.id}>
                                            {shouldShowStatusDivider && (
                                                <tr>
                                                    <td colSpan={9} className="px-6 py-2 bg-gray-100 border-t border-gray-300">
                                                        <div className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                                                            {vehicle.status} Vehicles
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            <tr className={`hover:bg-gray-50 ${isFirstOfStatus && statusSortOrder !== 'default' ? 'border-t-2 border-blue-200' : ''}`}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <button
                                                onClick={() => handleViewVehicleDetails(vehicle)}
                                                className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
                                            >
                                                {vehicle.registration}
                                                <ChevronDown size={16} />
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {vehicle.alias || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{vehicle.make} {vehicle.model}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                                vehicle.vehicleType === VehicleType.EV
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-blue-100 text-blue-800'
                                            }`}>
                                                {vehicle.vehicleType}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                                vehicle.status === VehicleStatus.Active ? 'bg-green-100 text-green-800' :
                                                vehicle.status === VehicleStatus.InService ? 'bg-yellow-100 text-yellow-800' :
                                                vehicle.status === VehicleStatus.Repairs ? 'bg-red-100 text-red-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                                {vehicle.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{(vehicle.currentOdometer || 0).toLocaleString()} km</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getNextServiceKm(vehicle)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getLicenseStatus(vehicle)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                            <button onClick={() => handleEditClick(vehicle)} className="text-blue-600 hover:text-blue-900" title="Edit">
                                                <Edit size={16} />
                                            </button>
                                            <button onClick={() => handleMaintenanceClick(vehicle)} className="text-green-600 hover:text-green-900" title="Maintenance">
                                                <Wrench size={16} />
                                            </button>
                                            <button onClick={() => handleQRClick(vehicle)} className="text-purple-600 hover:text-purple-900" title="QR Code">
                                                <QrCode size={16} />
                                            </button>
                                            <button onClick={() => handleDeleteClick(vehicle.id)} className="text-red-600 hover:text-red-900" title="Delete">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                                {sortedVehicles.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                                            No vehicles found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {showForm && renderVehicleForm()}

            {showMaintenanceModal && vehicleForMaintenance && (
                <MaintenanceModal
                    vehicle={vehicleForMaintenance}
                    onClose={() => {
                        setShowMaintenanceModal(false);
                        setVehicleForMaintenance(null);
                    }}
                    onRecordAdded={(updatedVehicle) => {
                        // Update the vehicle in the list
                        setVehicles(prev => prev.map(v => v.id === updatedVehicle.id ? updatedVehicle : v));
                        setVehicleForMaintenance(updatedVehicle);
                    }}
                />
            )}

            {showQRModal && vehicleForQR && (
                <QRModal
                    vehicle={vehicleForQR}
                    onClose={() => {
                        setShowQRModal(false);
                        setVehicleForQR(null);
                    }}
                />
            )}
        </div>
    );
};

export default ManageVehicles;