

import React, { useState, useEffect, useRef } from 'react';
import { Vehicle, VehicleType, MaintenanceRecord } from '../../types';
import api from '../../services/mockApi';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { Plus, Edit, Trash2, X, Wrench, QrCode } from 'lucide-react';

const emptyVehicle: Omit<Vehicle, 'id'> = {
    registration: '',
    make: '',
    model: '',
    vehicleType: VehicleType.ICE,
    currentOdometer: 0,
    serviceIntervalKm: 10000,
    lastServiceOdometer: 0,
    freeServicesUntilKm: 0,
    batteryCapacityKwh: 0,
    financeCompany: '',
    financeAccountNumber: '',
    financeCost: 0,
    financeEndDate: '',
    balloonPayment: 0,
    insuranceCompany: '',
    insurancePolicyNumber: '',
    insuranceFee: 0,
    trackingCompany: '',
    trackingAccountNumber: '',
    trackingFee: 0,
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

        const generateQRCode = () => {
            if (!isMounted || !canvasRef.current) return;
            
            const QRCode = (window as any).QRCode;

            // QRCodeJS library takes an element as the first argument, not a canvas ref.
            // It creates its own canvas, so we need a container.
            const qrContainer = document.getElementById('qr-code-container');
            if (qrContainer) {
                qrContainer.innerHTML = ''; // Clear previous QR code
                 new QRCode(qrContainer, {
                    text: vehicle.id,
                    width: 256,
                    height: 256,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
                setQrStatus('generated');
            } else {
                 console.error("QR Code container element not found.");
                 setErrorMessage("QR Code container element not found.");
                 setQrStatus('error');
            }
        };

        const startTime = Date.now();
        const intervalId = setInterval(() => {
            if ((window as any).QRCode) {
                clearInterval(intervalId);
                generateQRCode();
            } else if (Date.now() - startTime > 10000) { // 10 second timeout
                clearInterval(intervalId);
                if (isMounted) {
                    console.error("QRCode library is not available on the window object after 10 seconds.");
                    setErrorMessage("QR Code generation library failed to initialize.");
                    setQrStatus('error');
                }
            }
        }, 100);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
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
    const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | Omit<Vehicle, 'id'>>(emptyVehicle);
    const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
    const [vehicleForMaintenance, setVehicleForMaintenance] = useState<Vehicle | null>(null);
    const [showQRModal, setShowQRModal] = useState(false);
    const [vehicleForQR, setVehicleForQR] = useState<Vehicle | null>(null);

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
        setSelectedVehicle(emptyVehicle);
        setShowForm(true);
    };

    const handleEditClick = (vehicle: Vehicle) => {
        setIsEditing(true);
        setSelectedVehicle(vehicle);
        setShowForm(true);
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
    
    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const numericFields = ['currentOdometer', 'serviceIntervalKm', 'lastServiceOdometer', 'batteryCapacityKwh', 'financeCost', 'insuranceFee', 'trackingFee', 'balloonPayment', 'freeServicesUntilKm'];
        const parsedValue = numericFields.includes(name) ? (parseFloat(value) || 0) : value;
        setSelectedVehicle({ ...selectedVehicle, [name]: parsedValue });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (isEditing) {
                await api.updateVehicle(selectedVehicle as Vehicle);
            } else {
                await api.addVehicle(selectedVehicle as Omit<Vehicle, 'id'>);
            }
            setShowForm(false);
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


    const renderVehicleForm = () => (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">{isEditing ? 'Edit Vehicle' : 'Add New Vehicle'}</h3>
                    <button onClick={() => setShowForm(false)} className="p-1 rounded-full hover:bg-gray-200"><X size={20}/></button>
                 </div>
                 <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <h4 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Vehicle Details</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Registration</label>
                                <input name="registration" value={selectedVehicle.registration} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Make</label>
                                <input name="make" value={selectedVehicle.make} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Model</label>
                                <input name="model" value={selectedVehicle.model} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" required />
                            </div>
                            <div>
                                <label  className="block text-sm font-medium text-gray-700">Vehicle Type</label>
                                <select name="vehicleType" value={selectedVehicle.vehicleType} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" required>
                                    <option value={VehicleType.ICE}>ICE</option>
                                    <option value={VehicleType.EV}>EV</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Current Odometer (km)</label>
                                <input type="number" name="currentOdometer" value={selectedVehicle.currentOdometer || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" required />
                            </div>
                            
                            {selectedVehicle.vehicleType === VehicleType.ICE && (
                                <>
                                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Service Interval (km)</label>
                                            <input type="number" name="serviceIntervalKm" value={selectedVehicle.serviceIntervalKm || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Last Service Odo (km)</label>
                                            <input type="number" name="lastServiceOdometer" value={selectedVehicle.lastServiceOdometer || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Free Services Until (km)</label>
                                            <input type="number" name="freeServicesUntilKm" value={selectedVehicle.freeServicesUntilKm || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                        </div>
                                    </div>
                                </>
                            )}
                            {selectedVehicle.vehicleType === VehicleType.EV && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Battery Capacity (kWh)</label>
                                    <input type="number" name="batteryCapacityKwh" value={selectedVehicle.batteryCapacityKwh || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Financial Details</h4>
                        
                        {/* Vehicle Finance Section */}
                        <div className="p-4 border rounded-md bg-gray-50/50">
                            <h5 className="font-semibold text-md text-gray-700 mb-3">Vehicle Finance</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Finance Company</label>
                                    <input name="financeCompany" value={selectedVehicle.financeCompany || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Account Number</label>
                                    <input name="financeAccountNumber" value={selectedVehicle.financeAccountNumber || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Monthly Cost (R)</label>
                                    <input type="number" step="0.01" name="financeCost" value={selectedVehicle.financeCost || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Finance End Date</label>
                                    <input type="date" name="financeEndDate" value={selectedVehicle.financeEndDate || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                </div>
                                 <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Balloon Payment (R)</label>
                                    <input type="number" step="0.01" name="balloonPayment" value={selectedVehicle.balloonPayment || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                </div>
                            </div>
                        </div>

                        {/* Insurance Section */}
                        <div className="p-4 border rounded-md bg-gray-50/50">
                            <h5 className="font-semibold text-md text-gray-700 mb-3">Insurance</h5>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Insurance Company</label>
                                    <input name="insuranceCompany" value={selectedVehicle.insuranceCompany || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Policy Number</label>
                                    <input name="insurancePolicyNumber" value={selectedVehicle.insurancePolicyNumber || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                </div>
                                 <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Monthly Fee (R)</label>
                                    <input type="number" step="0.01" name="insuranceFee" value={selectedVehicle.insuranceFee || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                </div>
                            </div>
                        </div>

                         {/* Tracking Section */}
                        <div className="p-4 border rounded-md bg-gray-50/50">
                            <h5 className="font-semibold text-md text-gray-700 mb-3">Tracking</h5>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Tracking Company</label>
                                    <input name="trackingCompany" value={selectedVehicle.trackingCompany || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Account Number</label>
                                    <input name="trackingAccountNumber" value={selectedVehicle.trackingAccountNumber || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                </div>
                                 <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Monthly Fee (R)</label>
                                    <input type="number" step="0.01" name="trackingFee" value={selectedVehicle.trackingFee || ''} onChange={handleFormChange} className="mt-1 p-2 border rounded w-full" />
                                </div>
                            </div>
                        </div>

                    </div>

                     <div className="flex justify-end space-x-3 pt-4">
                         <button type="button" onClick={() => setShowForm(false)} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">Cancel</button>
                         <button type="submit" className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600">{isEditing ? 'Save Changes' : 'Add Vehicle'}</button>
                     </div>
                 </form>
            </Card>
        </div>
    );

    const handleCloseMaintenanceModal = () => {
        setShowMaintenanceModal(false);
        setVehicleForMaintenance(null);
    };

    const handleRecordAdded = (updatedVehicle: Vehicle) => {
        setVehicleForMaintenance(updatedVehicle);
        setVehicles(prevVehicles => prevVehicles.map(v => v.id === updatedVehicle.id ? updatedVehicle : v));
    };

    const VehicleCard = ({ vehicle }: { vehicle: Vehicle }) => (
        <Card className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
            {/* Column 1: Basic Info */}
            <div className="md:col-span-1">
                <h3 className="text-lg font-bold text-gray-900">{vehicle.make} {vehicle.model}</h3>
                <p className="text-sm font-medium text-blue-600">{vehicle.registration}</p>
                <span className={`mt-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${vehicle.vehicleType === VehicleType.EV ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{vehicle.vehicleType}</span>
            </div>
            {/* Column 2: Odometer & Service */}
            <div className="md:col-span-1">
                <p className="text-sm text-gray-500">Odometer</p>
                <p className="font-semibold">{(vehicle.currentOdometer || 0).toLocaleString()} km</p>
                <p className="text-sm text-gray-500 mt-2">Next Service</p>
                <div className="font-semibold">{getNextServiceKm(vehicle)}</div>
            </div>
            {/* Column 3: Financials */}
            <div className="md:col-span-1 space-y-3">
                <FinancialInfoItem label="Finance" value={vehicle.financeCost} provider={vehicle.financeCompany} />
                <FinancialInfoItem label="Insurance" value={vehicle.insuranceFee} provider={vehicle.insuranceCompany} />
                <FinancialInfoItem label="Tracking" value={vehicle.trackingFee} provider={vehicle.trackingCompany} />
                 {(vehicle.financeEndDate || (vehicle.balloonPayment || 0) > 0) && <div className="mt-2 pt-2 border-t">
                    {vehicle.financeEndDate && <>
                        <p className="text-xs text-gray-500">Finance Ends</p>
                        <p className="text-sm font-semibold">{vehicle.financeEndDate}</p>
                    </>}
                    {(vehicle.balloonPayment || 0) > 0 && <>
                        <p className="text-xs text-gray-500 mt-1">Balloon Pmt</p>
                        <p className="text-sm font-semibold">R {(vehicle.balloonPayment || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                    </>}
                 </div>}
            </div>
            {/* Column 4: Actions */}
            <div className="md:col-span-1 flex flex-wrap md:flex-col md:items-end md:justify-start gap-2 pt-2">
                 <button onClick={() => handleQRClick(vehicle)} className="w-full md:w-auto flex items-center justify-center text-sm text-gray-600 hover:text-gray-900 p-2 rounded-md hover:bg-gray-200 transition" title="Show QR Code"><QrCode className="h-4 w-4 mr-2" />QR Code</button>
                 <button onClick={() => handleMaintenanceClick(vehicle)} className="w-full md:w-auto flex items-center justify-center text-sm text-gray-600 hover:text-gray-900 p-2 rounded-md hover:bg-gray-200 transition" title="Maintenance Log"><Wrench className="h-4 w-4 mr-2" />Maintenance</button>
                 <button onClick={() => handleEditClick(vehicle)} className="w-full md:w-auto flex items-center justify-center text-sm text-indigo-600 hover:text-indigo-900 p-2 rounded-md hover:bg-indigo-100 transition" title="Edit"><Edit className="h-4 w-4 mr-2" />Edit</button>
                 <button onClick={() => handleDeleteClick(vehicle.id)} className="w-full md:w-auto flex items-center justify-center text-sm text-red-600 hover:text-red-900 p-2 rounded-md hover:bg-red-100 transition" title="Delete"><Trash2 className="h-4 w-4 mr-2" />Delete</button>
            </div>
        </Card>
    );

    const FinancialInfoItem = ({ label, value, provider }: { label: string, value?: number, provider?: string }) => {
        if (!value || value <= 0) return null;
        return (
            <div>
                <p className="text-sm font-semibold">
                    {label}: <span className="text-gray-800">R {value.toFixed(2)} /mo</span>
                </p>
                {provider && <p className="text-xs text-gray-500">Provider: {provider}</p>}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Manage Vehicles" />
            <main className="max-w-7xl mx-auto p-6">
                 {showForm && renderVehicleForm()}
                 {showMaintenanceModal && vehicleForMaintenance && (
                    <MaintenanceModal
                        vehicle={vehicleForMaintenance}
                        onClose={handleCloseMaintenanceModal}
                        onRecordAdded={handleRecordAdded}
                    />
                 )}
                 {showQRModal && vehicleForQR && (
                     <QRModal vehicle={vehicleForQR} onClose={() => setShowQRModal(false)} />
                 )}
                <Card>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-800">Vehicle Fleet</h2>
                        <button onClick={handleAddClick} className="flex items-center bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                            <Plus className="h-5 w-5 mr-2" />
                            Add Vehicle
                        </button>
                    </div>

                    <button onClick={onBack} className="mb-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                        Back to Dashboard
                    </button>

                    {loading ? (
                        <p>Loading vehicles...</p>
                    ) : (
                        <div className="space-y-4">
                            {vehicles.map((vehicle) => (
                               <VehicleCard key={vehicle.id} vehicle={vehicle} />
                            ))}
                        </div>
                    )}
                </Card>
            </main>
        </div>
    );
};

export default ManageVehicles;