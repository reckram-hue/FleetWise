// Fix: Implement the ManageDrivers component to resolve module error.
import React, { useState, useEffect } from 'react';
import { User, UserRole, AppSettings, EmploymentStatus } from '../../types';
import api from '../../services/firebaseApi';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { UserPlus, Edit, Archive, X, Upload, UserCheck, UserX, MessageCircle, Copy, Key, Search } from 'lucide-react';

const emptyDriver: Omit<User, 'id' | 'role'> = {
    firstName: '',
    surname: '',
    email: '',
    idNumber: '',
    driversLicenceNumber: '',
    driversLicenceExpiry: '',
    contactNumber: '',
    driversLicenceImageUrl: '',
    area: '',
    department: '',
    employmentStatus: EmploymentStatus.Active,
};

interface ManageDriversProps {
    onBack: () => void;
}

const ManageDrivers: React.FC<ManageDriversProps> = ({ onBack }) => {
    const [drivers, setDrivers] = useState<User[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState<User | Omit<User, 'id' | 'role'>>(emptyDriver);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | EmploymentStatus>('all');
    const [showEmploymentStatusModal, setShowEmploymentStatusModal] = useState(false);
    const [selectedDriverForStatus, setSelectedDriverForStatus] = useState<User | null>(null);
    const [showTelegramLinkModal, setShowTelegramLinkModal] = useState(false);
    const [newlyCreatedDriver, setNewlyCreatedDriver] = useState<User | null>(null);
    const [showSetPinModal, setShowSetPinModal] = useState(false);
    const [selectedDriverForPin, setSelectedDriverForPin] = useState<User | null>(null);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [selectedDriverForArchive, setSelectedDriverForArchive] = useState<User | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchDrivers = async () => {
        setLoading(true);
        const [allUsers, settingsData] = await Promise.all([
            api.getUsers(),
            api.getSettings()
        ]);
        setDrivers(allUsers.filter(u => u.role === UserRole.Driver));
        setSettings(settingsData);
        setLoading(false);
    };

    useEffect(() => {
        fetchDrivers();
    }, []);

    const fetchSettings = async () => {
        try {
            const settingsData = await api.getSettings();
            setSettings(settingsData);
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        }
    };

    const handleAddClick = async () => {
        setIsEditing(false);
        setSelectedDriver(emptyDriver);
        setImagePreview(null);
        await fetchSettings(); // Refresh settings when opening form
        setShowForm(true);
    };

    const handleEditClick = async (driver: User) => {
        setIsEditing(true);
        setSelectedDriver(driver);
        setImagePreview(driver.driversLicenceImageUrl || null);
        await fetchSettings(); // Refresh settings when opening form
        setShowForm(true);
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setSelectedDriver({ ...selectedDriver, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                setSelectedDriver({ ...selectedDriver, driversLicenceImageUrl: base64String });
                setImagePreview(base64String);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (isEditing) {
                await api.updateDriver(selectedDriver as User);
                setShowForm(false);
                fetchDrivers();
            } else {
                const newDriver = await api.addDriver(selectedDriver as Omit<User, 'id' | 'role'>);
                setShowForm(false);
                await fetchDrivers();
                // Show Telegram link modal for newly created driver
                setNewlyCreatedDriver(newDriver);
                setShowTelegramLinkModal(true);
            }
        } catch (error) {
            console.error("Failed to save driver:", error);
            alert("Error saving driver details.");
        }
    };

    const handleEmploymentStatusClick = (driver: User) => {
        setSelectedDriverForStatus(driver);
        setShowEmploymentStatusModal(true);
    };

    const handleArchiveClick = (driver: User) => {
        setSelectedDriverForArchive(driver);
        setShowArchiveModal(true);
    };

    const getExpiryStatus = (expiryDate?: string) => {
        if (!expiryDate) return { text: 'N/A', color: 'text-gray-500', bg: 'bg-gray-100' };
        const today = new Date();
        const expiry = new Date(expiryDate);
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(today.getDate() + 30);

        if (expiry < today) return { text: 'Expired', color: 'text-red-800', bg: 'bg-red-100' };
        if (expiry <= thirtyDaysFromNow) return { text: 'Expires Soon', color: 'text-yellow-800', bg: 'bg-yellow-100' };
        return { text: expiryDate, color: 'text-green-800', bg: 'bg-green-100' };
    };

    const getEmploymentStatusDisplay = (status?: EmploymentStatus) => {
        switch (status) {
            case EmploymentStatus.Active:
                return { text: 'Active', color: 'text-green-800', bg: 'bg-green-100' };
            case EmploymentStatus.Inactive:
                return { text: 'Inactive', color: 'text-yellow-800', bg: 'bg-yellow-100' };
            case EmploymentStatus.Terminated:
                return { text: 'Terminated', color: 'text-red-800', bg: 'bg-red-100' };
            default:
                return { text: 'Unknown', color: 'text-gray-800', bg: 'bg-gray-100' };
        }
    };

    const handleTelegramLink = async (driver: User) => {
        try {
            // First, ensure driver is registered with backend
            await fetch('http://localhost:3001/api/drivers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: driver.id,
                    firstName: driver.firstName,
                    surname: driver.surname,
                    isActive: true
                })
            });

            // Then get the Telegram link
            const response = await fetch(`http://localhost:3001/api/drivers/${driver.id}/telegram-link`);
            if (!response.ok) throw new Error('Failed to get Telegram link');
            const data = await response.json();

            // Copy to clipboard
            navigator.clipboard.writeText(data.url);
            alert(`Telegram registration link copied to clipboard!\n\nSend this link to ${driver.firstName} ${driver.surname}:\n${data.url}`);
        } catch (error) {
            console.error('Failed to get Telegram link:', error);
            alert('Failed to generate Telegram link. Make sure the backend server is running on port 3001.');
        }
    };

    const handleSetPinClick = (driver: User) => {
        setSelectedDriverForPin(driver);
        setShowSetPinModal(true);
    };

    const filteredDrivers = drivers.filter(driver => {
        // Status Filter
        if (statusFilter !== 'all' && driver.employmentStatus !== statusFilter) return false;

        // Search Filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const fullName = `${driver.firstName} ${driver.surname}`.toLowerCase();
            return (
                fullName.includes(query) ||
                driver.email.toLowerCase().includes(query) ||
                (driver.idNumber && driver.idNumber.toLowerCase().includes(query)) ||
                (driver.driversLicenceNumber && driver.driversLicenceNumber.toLowerCase().includes(query)) ||
                (driver.area && driver.area.toLowerCase().includes(query)) ||
                (driver.department && driver.department.toLowerCase().includes(query))
            );
        }
        return true;
    });

    const renderDriverForm = () => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">{isEditing ? 'Edit Driver' : 'Add New Driver'}</h3>
                    <button onClick={() => setShowForm(false)} className="p-1 rounded-full hover:bg-gray-200"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                            <input name="firstName" value={selectedDriver.firstName} onChange={handleFormChange} className="p-2 border rounded w-full" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Surname</label>
                            <input name="surname" value={selectedDriver.surname} onChange={handleFormChange} className="p-2 border rounded w-full" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input type="email" name="email" value={selectedDriver.email} onChange={handleFormChange} className="p-2 border rounded w-full" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                            <input name="contactNumber" value={selectedDriver.contactNumber || ''} onChange={handleFormChange} className="p-2 border rounded w-full" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
                            <input name="idNumber" value={selectedDriver.idNumber || ''} onChange={handleFormChange} className="p-2 border rounded w-full" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Licence Number</label>
                            <input name="driversLicenceNumber" value={selectedDriver.driversLicenceNumber || ''} onChange={handleFormChange} className="p-2 border rounded w-full" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Licence Expiry</label>
                            <input type="date" name="driversLicenceExpiry" value={selectedDriver.driversLicenceExpiry || ''} onChange={handleFormChange} className="p-2 border rounded w-full" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Area</label>
                            <select
                                name="area"
                                value={selectedDriver.area || ''}
                                onChange={handleFormChange}
                                className="p-2 border rounded w-full"
                            >
                                <option value="">Select Area</option>
                                {settings?.areas?.map(area => (
                                    <option key={area} value={area}>{area}</option>
                                )) || null}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                            <select
                                name="department"
                                value={selectedDriver.department || ''}
                                onChange={handleFormChange}
                                className="p-2 border rounded w-full"
                            >
                                <option value="">Select Department</option>
                                {settings?.departments?.map(department => (
                                    <option key={department} value={department}>{department}</option>
                                )) || null}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Employment Status</label>
                            <select
                                name="employmentStatus"
                                value={selectedDriver.employmentStatus || EmploymentStatus.Active}
                                onChange={handleFormChange}
                                className="p-2 border rounded w-full"
                                required
                            >
                                {Object.values(EmploymentStatus).map(status => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                        </div>
                        {(selectedDriver.employmentStatus === EmploymentStatus.Inactive || selectedDriver.employmentStatus === EmploymentStatus.Terminated) && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Employment End Date</label>
                                <input
                                    type="date"
                                    name="employmentEndDate"
                                    value={selectedDriver.employmentEndDate || ''}
                                    onChange={handleFormChange}
                                    className="p-2 border rounded w-full"
                                />
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Driver's Licence Image</label>
                        <div className="flex items-center gap-4">
                            {imagePreview && <img src={imagePreview} alt="Licence Preview" className="h-20 w-auto border rounded" />}
                            <label htmlFor="file-upload" className="cursor-pointer bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 flex items-center">
                                <Upload size={16} className="mr-2" />
                                <span>Upload Image</span>
                            </label>
                            <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" />
                        </div>
                    </div>
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={() => setShowForm(false)} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">Cancel</button>
                        <button type="submit" className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600">{isEditing ? 'Save Changes' : 'Add Driver'}</button>
                    </div>
                </form>
            </Card>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Manage Drivers" />
            <main className="max-w-6xl mx-auto p-6">
                {showForm && renderDriverForm()}
                <Card>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-800">Drivers</h2>
                        <button onClick={handleAddClick} className="flex items-center bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                            <UserPlus className="h-5 w-5 mr-2" />
                            Add Driver
                        </button>
                    </div>

                    <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                        <button onClick={onBack} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300 w-full md:w-auto">
                            Back to Dashboard
                        </button>
                        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                            <div className="relative w-full md:w-64">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search drivers..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Filter by Status:</label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as 'all' | EmploymentStatus)}
                                    className="p-2 border border-gray-300 rounded-md text-sm w-full md:w-auto"
                                >
                                    <option value="all">All Drivers ({drivers.length})</option>
                                    <option value={EmploymentStatus.Active}>Active ({drivers.filter(d => d.employmentStatus === EmploymentStatus.Active).length})</option>
                                    <option value={EmploymentStatus.Inactive}>Inactive ({drivers.filter(d => d.employmentStatus === EmploymentStatus.Inactive).length})</option>
                                    <option value={EmploymentStatus.Terminated}>Terminated ({drivers.filter(d => d.employmentStatus === EmploymentStatus.Terminated).length})</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <p>Loading drivers...</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact & Area</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employment Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Licence Expiry</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telegram</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredDrivers.map((driver) => {
                                        const expiry = getExpiryStatus(driver.driversLicenceExpiry);
                                        const empStatus = getEmploymentStatusDisplay(driver.employmentStatus);
                                        return (
                                            <tr key={driver.id} className={driver.employmentStatus !== EmploymentStatus.Active ? 'bg-gray-50' : ''}>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    <button
                                                        onClick={() => handleEditClick(driver)}
                                                        className="text-left hover:text-blue-600 hover:underline cursor-pointer transition-colors duration-200"
                                                    >
                                                        {driver.firstName} {driver.surname}
                                                    </button>
                                                    <br />
                                                    <span className="text-xs text-gray-500">{driver.department}</span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {driver.email}<br />
                                                    {driver.contactNumber}<br />
                                                    <span className="text-xs font-medium text-gray-600">{driver.area}</span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${empStatus.bg} ${empStatus.color}`}>
                                                        {empStatus.text}
                                                    </span>
                                                    {driver.employmentEndDate && (
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            Ended: {driver.employmentEndDate}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${expiry.bg} ${expiry.color}`}>{expiry.text}</span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    <button
                                                        onClick={() => handleTelegramLink(driver)}
                                                        className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
                                                        title="Get Telegram registration link"
                                                    >
                                                        <MessageCircle className="h-3 w-3 mr-1" />
                                                        Get Link
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                    <div className="flex items-center space-x-2">
                                                        <button onClick={() => handleEditClick(driver)} className="text-indigo-600 hover:text-indigo-900" title="Edit Driver">
                                                            <Edit className="h-4 w-4" />
                                                        </button>
                                                        <button onClick={() => handleEmploymentStatusClick(driver)} className="text-blue-600 hover:text-blue-900" title="Change Employment Status">
                                                            {driver.employmentStatus === EmploymentStatus.Active ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                                        </button>
                                                        <button onClick={() => handleSetPinClick(driver)} className="text-green-600 hover:text-green-900" title="Set/Reset PIN">
                                                            <Key className="h-4 w-4" />
                                                        </button>
                                                        <button onClick={() => handleArchiveClick(driver)} className="text-orange-600 hover:text-orange-900" title="Archive Driver">
                                                            <Archive className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                {/* Employment Status Modal */}
                {showEmploymentStatusModal && selectedDriverForStatus && (
                    <EmploymentStatusModal
                        driver={selectedDriverForStatus}
                        onClose={() => {
                            setShowEmploymentStatusModal(false);
                            setSelectedDriverForStatus(null);
                        }}
                        onSave={() => {
                            setShowEmploymentStatusModal(false);
                            setSelectedDriverForStatus(null);
                            fetchDrivers();
                        }}
                    />
                )}

                {/* Telegram Link Modal */}
                {showTelegramLinkModal && newlyCreatedDriver && (
                    <TelegramLinkModal
                        driver={newlyCreatedDriver}
                        onClose={() => {
                            setShowTelegramLinkModal(false);
                            setNewlyCreatedDriver(null);
                        }}
                    />
                )}

                {/* Set PIN Modal */}
                {showSetPinModal && selectedDriverForPin && (
                    <SetPinModal
                        driver={selectedDriverForPin}
                        onClose={() => {
                            setShowSetPinModal(false);
                            setSelectedDriverForPin(null);
                        }}
                        onSuccess={() => {
                            setShowSetPinModal(false);
                            setSelectedDriverForPin(null);
                            alert('PIN set successfully!');
                        }}
                    />
                )}

                {/* Archive Driver Modal */}
                {showArchiveModal && selectedDriverForArchive && (
                    <ArchiveDriverModal
                        driver={selectedDriverForArchive}
                        onClose={() => {
                            setShowArchiveModal(false);
                            setSelectedDriverForArchive(null);
                        }}
                        onSuccess={() => {
                            setShowArchiveModal(false);
                            setSelectedDriverForArchive(null);
                            fetchDrivers();
                        }}
                    />
                )}
            </main>
        </div>
    );
};

// Employment Status Modal Component
const EmploymentStatusModal = ({
    driver,
    onClose,
    onSave
}: {
    driver: User;
    onClose: () => void;
    onSave: () => void;
}) => {
    const [status, setStatus] = useState<EmploymentStatus>(driver.employmentStatus || EmploymentStatus.Active);
    const [endDate, setEndDate] = useState(driver.employmentEndDate || '');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await api.updateEmploymentStatus(driver.id, status, status !== EmploymentStatus.Active ? endDate : undefined);
            onSave();
        } catch (error) {
            console.error('Failed to update employment status:', error);
            alert('Error updating employment status.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">Update Employment Status</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200">
                        <X size={20} />
                    </button>
                </div>

                <div className="mb-4">
                    <p className="text-sm text-gray-600">
                        <strong>{driver.firstName} {driver.surname}</strong>
                        <br />
                        Current Status: <span className={`font-medium ${driver.employmentStatus === EmploymentStatus.Active ? 'text-green-600' : 'text-red-600'}`}>
                            {driver.employmentStatus}
                        </span>
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">New Employment Status</label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as EmploymentStatus)}
                            className="w-full p-2 border border-gray-300 rounded-md"
                            required
                        >
                            {Object.values(EmploymentStatus).map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    {status !== EmploymentStatus.Active && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Employment End Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-md"
                                required
                            />
                        </div>
                    )}

                    <div className="bg-yellow-50 p-3 rounded-md">
                        <p className="text-sm text-yellow-800">
                            <strong>Note:</strong> Changing employment status will preserve all historical data (fines, damages, shifts) for audit purposes.
                        </p>
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

// Set PIN Modal Component
const SetPinModal = ({
    driver,
    onClose,
    onSuccess
}: {
    driver: User;
    onClose: () => void;
    onSuccess: () => void;
}) => {
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handlePinChange = (value: string, isConfirm: boolean) => {
        const digitsOnly = value.replace(/\D/g, '').substring(0, 4);
        if (isConfirm) {
            setConfirmPin(digitsOnly);
        } else {
            setPin(digitsOnly);
        }
        setError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (pin.length !== 4) {
            setError('PIN must be exactly 4 digits');
            return;
        }

        if (pin !== confirmPin) {
            setError('PINs do not match');
            return;
        }

        setIsSubmitting(true);
        try {
            await api.adminSetDriverPin(driver.id, pin);
            onSuccess();
        } catch (error: any) {
            console.error('Failed to set PIN:', error);
            setError(error.message || 'Failed to set PIN. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold flex items-center">
                        <Key className="mr-2 text-green-600" />
                        Set Driver PIN
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200">
                        <X size={20} />
                    </button>
                </div>

                <div className="mb-4">
                    <p className="text-gray-700 mb-1">
                        <strong>{driver.firstName} {driver.surname}</strong>
                    </p>
                    <p className="text-sm text-gray-600">
                        Set a 4-digit PIN that the driver will use to start shifts.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            New PIN (4 digits)
                        </label>
                        <input
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={4}
                            value={pin}
                            onChange={(e) => handlePinChange(e.target.value, false)}
                            placeholder="Enter 4-digit PIN"
                            className="w-full px-4 py-2 text-2xl text-center border border-gray-300 rounded-md tracking-widest focus:ring-2 focus:ring-green-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Confirm PIN
                        </label>
                        <input
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={4}
                            value={confirmPin}
                            onChange={(e) => handlePinChange(e.target.value, true)}
                            placeholder="Re-enter PIN"
                            className="w-full px-4 py-2 text-2xl text-center border border-gray-300 rounded-md tracking-widest focus:ring-2 focus:ring-green-500"
                            required
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-400 p-3 rounded">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
                        <p className="text-sm text-blue-800">
                            <strong>Important:</strong> Make sure to communicate this PIN securely to the driver.
                            The PIN will be encrypted and stored securely.
                        </p>
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
                            disabled={isSubmitting || pin.length !== 4 || pin !== confirmPin}
                            className="bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Setting PIN...' : 'Set PIN'}
                        </button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

// Telegram Link Modal Component
const TelegramLinkModal = ({
    driver,
    onClose
}: {
    driver: User;
    onClose: () => void;
}) => {
    const [telegramLink, setTelegramLink] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const fetchTelegramLink = async () => {
            try {
                // First, ensure driver is registered with backend
                await fetch('http://localhost:3001/api/drivers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: driver.id,
                        firstName: driver.firstName,
                        surname: driver.surname,
                        isActive: true
                    })
                });

                // Then get the Telegram link
                const response = await fetch(`http://localhost:3001/api/drivers/${driver.id}/telegram-link`);
                if (!response.ok) throw new Error('Failed to get Telegram link');
                const data = await response.json();
                setTelegramLink(data.url);
            } catch (error) {
                console.error('Failed to get Telegram link:', error);
                alert('Failed to generate Telegram link. Make sure the backend server is running on port 3001.');
            } finally {
                setLoading(false);
            }
        };
        fetchTelegramLink();
    }, [driver.id, driver.firstName, driver.surname]);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(telegramLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-green-600">✅ Driver Created Successfully!</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200">
                        <X size={20} />
                    </button>
                </div>

                <div className="mb-4">
                    <p className="text-gray-700 mb-2">
                        <strong>{driver.firstName} {driver.surname}</strong> has been added to the system.
                    </p>
                    <p className="text-sm text-gray-600 mb-4">
                        Send them this Telegram link to connect their account:
                    </p>

                    {loading ? (
                        <div className="text-center py-4">
                            <p className="text-gray-500">Generating Telegram link...</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                                <p className="text-sm font-mono text-blue-900 break-all">{telegramLink}</p>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={handleCopyLink}
                                    className="flex-1 bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600 transition flex items-center justify-center gap-2"
                                >
                                    <Copy size={16} />
                                    {copied ? 'Copied!' : 'Copy Link'}
                                </button>
                                <button
                                    onClick={onClose}
                                    className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300"
                                >
                                    Done
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
                    <p className="text-sm text-yellow-800">
                        <strong>Note:</strong> The driver needs to click this link and follow the Telegram bot instructions to complete setup.
                    </p>
                </div>
            </Card>
        </div>
    );
};

// Archive Driver Modal Component
const RETENTION_PRESETS = [
    { months: 6,   label: '6 months' },
    { months: 12,  label: '1 year (12 months)' },
    { months: 24,  label: '2 years (24 months)' },
    { months: 36,  label: '3 years (36 months)' },
    { months: 60,  label: '5 years (60 months)' },
    { months: 84,  label: '7 years (84 months)' },
    { months: 120, label: '10 years (120 months)' },
    { months: 0,   label: 'Custom...' },
];

const ArchiveDriverModal = ({
    driver,
    onClose,
    onSuccess,
}: {
    driver: User;
    onClose: () => void;
    onSuccess: () => void;
}) => {
    const [inactiveReason, setInactiveReason] = useState('');
    const [presetMonths, setPresetMonths] = useState<number>(12);
    const [customMonths, setCustomMonths] = useState<string>('');
    const [retentionReason, setRetentionReason] = useState('');
    const [legalHold, setLegalHold] = useState(false);
    const [legalHoldReason, setLegalHoldReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [serverError, setServerError] = useState('');

    const isCustom = presetMonths === 0;

    const effectiveMonths = (): number | null => {
        if (!isCustom) return presetMonths;
        const n = parseInt(customMonths, 10);
        return Number.isInteger(n) && n > 0 ? n : null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setServerError('');

        if (legalHold && !legalHoldReason.trim()) {
            setServerError('Legal hold reason is required when a legal hold is applied.');
            return;
        }

        const months = effectiveMonths();
        if (!months) {
            setServerError('Please enter a valid number of months (must be a positive whole number).');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await api.archiveDriver({
                driverId: driver.id,
                inactiveReason: inactiveReason.trim(),
                retentionPeriodMonths: months,
                retentionReason: retentionReason.trim() || undefined,
                legalHold,
                legalHoldReason: legalHold ? legalHoldReason.trim() : undefined,
            });
            const holdNote = legalHold ? ' — legal hold applied, no purge eligibility while hold is active' : '';
            alert(`Driver archived. Record retained until ${result.archiveUntil}${holdNote}.`);
            onSuccess();
        } catch (error: any) {
            console.error('Failed to archive driver:', error);
            setServerError(error.message || 'Failed to archive driver. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const submitDisabled = isSubmitting
        || !inactiveReason.trim()
        || (isCustom && !effectiveMonths())
        || (legalHold && !legalHoldReason.trim());

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <Archive className="text-orange-600" />
                        Archive Driver
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200">
                        <X size={20} />
                    </button>
                </div>

                <div className="mb-4 p-3 bg-orange-50 border-l-4 border-orange-400 rounded">
                    <p className="text-sm text-orange-800">
                        <strong>{driver.firstName} {driver.surname}</strong> will be set to <strong>Inactive</strong>.
                        Their record, shift history, and all associated data will be fully preserved.
                        This action does not delete any data.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Reason for Inactivation <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={inactiveReason}
                            onChange={(e) => setInactiveReason(e.target.value)}
                            placeholder="e.g. Resignation, contract end, redundancy..."
                            className="w-full p-2 border border-gray-300 rounded-md text-sm"
                            rows={3}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Record Retention Period <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={presetMonths}
                            onChange={(e) => {
                                setPresetMonths(Number(e.target.value));
                                setCustomMonths('');
                            }}
                            className="w-full p-2 border border-gray-300 rounded-md text-sm"
                        >
                            {RETENTION_PRESETS.map(opt => (
                                <option key={opt.months === 0 ? 'custom' : opt.months} value={opt.months}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        {isCustom && (
                            <div className="mt-2 flex items-center gap-2">
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={customMonths}
                                    onChange={(e) => setCustomMonths(e.target.value)}
                                    placeholder="Number of months"
                                    className="w-40 p-2 border border-gray-300 rounded-md text-sm"
                                    required={isCustom}
                                    autoFocus
                                />
                                <span className="text-sm text-gray-600">months</span>
                            </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                            Calculated from today. A legal hold (below) overrides this — no purge eligibility while the hold is active regardless of this date.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Retention Reason <span className="text-gray-400">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={retentionReason}
                            onChange={(e) => setRetentionReason(e.target.value)}
                            placeholder="e.g. Statutory requirement, CCMA pending, insurance claim..."
                            className="w-full p-2 border border-gray-300 rounded-md text-sm"
                        />
                    </div>

                    <div className="border border-gray-200 rounded-md p-3 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={legalHold}
                                onChange={(e) => {
                                    setLegalHold(e.target.checked);
                                    if (!e.target.checked) setLegalHoldReason('');
                                }}
                                className="h-4 w-4 text-orange-600 border-gray-300 rounded"
                            />
                            <span className="text-sm font-medium text-gray-700">Apply Legal / Disciplinary Hold</span>
                        </label>
                        <p className="text-xs text-gray-500">
                            Use for pending disciplinary proceedings, CCMA/labour matters, litigation, insurance or accident investigations.
                            While active, the record is not eligible for permanent purge regardless of the retention period above.
                        </p>
                        {legalHold && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Legal Hold Reason <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    value={legalHoldReason}
                                    onChange={(e) => setLegalHoldReason(e.target.value)}
                                    placeholder="e.g. CCMA referral dated 2026-08-01, case ref 123/2026..."
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm"
                                    rows={2}
                                    required={legalHold}
                                />
                            </div>
                        )}
                    </div>

                    {serverError && (
                        <div className="bg-red-50 border-l-4 border-red-400 p-3 rounded">
                            <p className="text-sm text-red-700">{serverError}</p>
                        </div>
                    )}

                    <div className="flex justify-end space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitDisabled}
                            className="bg-orange-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Archiving...' : 'Archive Driver'}
                        </button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default ManageDrivers;