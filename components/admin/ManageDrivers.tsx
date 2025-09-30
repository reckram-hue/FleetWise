// Fix: Implement the ManageDrivers component to resolve module error.
import React, { useState, useEffect } from 'react';
import { User, UserRole, AppSettings, EmploymentStatus } from '../../types';
import api from '../../services/mockApi';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { UserPlus, Edit, Trash2, X, Upload, UserCheck, UserX, MessageCircle, Copy } from 'lucide-react';

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
            } else {
                await api.addDriver(selectedDriver as Omit<User, 'id' | 'role'>);
            }
            setShowForm(false);
            fetchDrivers();
        } catch (error) {
            console.error("Failed to save driver:", error);
            alert("Error saving driver details.");
        }
    };

    const handleEmploymentStatusClick = (driver: User) => {
        setSelectedDriverForStatus(driver);
        setShowEmploymentStatusModal(true);
    };

    const handleDeleteClick = async (driver: User) => {
        try {
            const validation = await api.canDeleteDriver(driver.id);

            if (!validation.canDelete) {
                alert(`Cannot delete driver ${driver.firstName} ${driver.surname}:\n\n${validation.reasons.join('\n')}\n\nConsider changing their employment status to Inactive or Terminated instead.`);
                return;
            }

            if (window.confirm(`Are you sure you want to permanently delete driver ${driver.firstName} ${driver.surname}?\n\nThis action cannot be undone and will remove all their data from the system.`)) {
                await api.deleteDriver(driver.id);
                fetchDrivers();
                alert('Driver deleted successfully.');
            }
        } catch (error) {
            console.error('Failed to delete driver:', error);
            alert('Error deleting driver: ' + (error as Error).message);
        }
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
            const response = await fetch(`http://localhost:3001/api/drivers/${driver.id}/telegram-link`);
            if (!response.ok) throw new Error('Failed to get Telegram link');
            const data = await response.json();

            // Copy to clipboard
            navigator.clipboard.writeText(data.url);
            alert(`Telegram registration link copied to clipboard!\n\nSend this link to ${driver.firstName} ${driver.surname}:\n${data.url}`);
        } catch (error) {
            console.error('Failed to get Telegram link:', error);
            alert('Failed to generate Telegram link. Make sure the server is running.');
        }
    };

    const filteredDrivers = drivers.filter(driver => {
        if (statusFilter === 'all') return true;
        return driver.employmentStatus === statusFilter;
    });

    const renderDriverForm = () => (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">{isEditing ? 'Edit Driver' : 'Add New Driver'}</h3>
                    <button onClick={() => setShowForm(false)} className="p-1 rounded-full hover:bg-gray-200"><X size={20}/></button>
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
                                {settings?.areas.map(area => (
                                    <option key={area} value={area}>{area}</option>
                                ))}
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
                                {settings?.departments.map(department => (
                                    <option key={department} value={department}>{department}</option>
                                ))}
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
                                <Upload size={16} className="mr-2"/>
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

                    <div className="flex justify-between items-center mb-4">
                        <button onClick={onBack} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                            Back to Dashboard
                        </button>
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-700">Filter by Status:</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as 'all' | EmploymentStatus)}
                                className="p-2 border border-gray-300 rounded-md text-sm"
                            >
                                <option value="all">All Drivers ({drivers.length})</option>
                                <option value={EmploymentStatus.Active}>Active ({drivers.filter(d => d.employmentStatus === EmploymentStatus.Active).length})</option>
                                <option value={EmploymentStatus.Inactive}>Inactive ({drivers.filter(d => d.employmentStatus === EmploymentStatus.Inactive).length})</option>
                                <option value={EmploymentStatus.Terminated}>Terminated ({drivers.filter(d => d.employmentStatus === EmploymentStatus.Terminated).length})</option>
                            </select>
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
                                                    {driver.email}<br/>
                                                    {driver.contactNumber}<br/>
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
                                                        <button onClick={() => handleDeleteClick(driver)} className="text-red-600 hover:text-red-900" title="Delete Driver">
                                                            <Trash2 className="h-4 w-4" />
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

export default ManageDrivers;