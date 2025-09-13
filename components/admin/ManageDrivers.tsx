// Fix: Implement the ManageDrivers component to resolve module error.
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../../types';
import api from '../../services/mockApi';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { UserPlus, Edit, Trash2, X, Upload } from 'lucide-react';

const emptyDriver: Omit<User, 'id' | 'role'> = {
    firstName: '',
    surname: '',
    email: '',
    idNumber: '',
    driversLicenceNumber: '',
    driversLicenceExpiry: '',
    contactNumber: '',
    driversLicenceImageUrl: '',
};

interface ManageDriversProps {
    onBack: () => void;
}

const ManageDrivers: React.FC<ManageDriversProps> = ({ onBack }) => {
    const [drivers, setDrivers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState<User | Omit<User, 'id' | 'role'>>(emptyDriver);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    const fetchDrivers = async () => {
        setLoading(true);
        const allUsers = await api.getUsers();
        setDrivers(allUsers.filter(u => u.role === UserRole.Driver));
        setLoading(false);
    };

    useEffect(() => {
        fetchDrivers();
    }, []);
    
    const handleAddClick = () => {
        setIsEditing(false);
        setSelectedDriver(emptyDriver);
        setImagePreview(null);
        setShowForm(true);
    };

    const handleEditClick = (driver: User) => {
        setIsEditing(true);
        setSelectedDriver(driver);
        setImagePreview(driver.driversLicenceImageUrl || null);
        setShowForm(true);
    };
    
    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    const renderDriverForm = () => (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">{isEditing ? 'Edit Driver' : 'Add New Driver'}</h3>
                    <button onClick={() => setShowForm(false)} className="p-1 rounded-full hover:bg-gray-200"><X size={20}/></button>
                 </div>
                 <form onSubmit={handleSubmit} className="space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input name="firstName" value={selectedDriver.firstName} onChange={handleFormChange} placeholder="First Name" className="p-2 border rounded" required />
                        <input name="surname" value={selectedDriver.surname} onChange={handleFormChange} placeholder="Surname" className="p-2 border rounded" required />
                        <input type="email" name="email" value={selectedDriver.email} onChange={handleFormChange} placeholder="Email" className="p-2 border rounded" required />
                        <input name="contactNumber" value={selectedDriver.contactNumber || ''} onChange={handleFormChange} placeholder="Contact Number" className="p-2 border rounded" />
                        <input name="idNumber" value={selectedDriver.idNumber || ''} onChange={handleFormChange} placeholder="ID Number" className="p-2 border rounded" />
                        <input name="driversLicenceNumber" value={selectedDriver.driversLicenceNumber || ''} onChange={handleFormChange} placeholder="Licence Number" className="p-2 border rounded" />
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Licence Expiry</label>
                            <input type="date" name="driversLicenceExpiry" value={selectedDriver.driversLicenceExpiry || ''} onChange={handleFormChange} className="p-2 border rounded w-full" />
                        </div>
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
                        <h2 className="text-2xl font-bold text-gray-800">Driver Roster</h2>
                        <button onClick={handleAddClick} className="flex items-center bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                            <UserPlus className="h-5 w-5 mr-2" />
                            Add Driver
                        </button>
                    </div>

                    <button onClick={onBack} className="mb-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                        Back to Dashboard
                    </button>

                    {loading ? (
                        <p>Loading drivers...</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Licence Expiry</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Licence Image</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {drivers.map((driver) => {
                                        const expiry = getExpiryStatus(driver.driversLicenceExpiry);
                                        return (
                                            <tr key={driver.id}>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{driver.firstName} {driver.surname}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{driver.email}<br/>{driver.contactNumber}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${expiry.bg} ${expiry.color}`}>{expiry.text}</span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {driver.driversLicenceImageUrl ? <img src={driver.driversLicenceImageUrl} alt="Licence" className="h-10 w-auto rounded" /> : 'No Image'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                                    <button onClick={() => handleEditClick(driver)} className="text-indigo-600 hover:text-indigo-900" title="Edit"><Edit className="h-5 w-5" /></button>
                                                    <button className="text-red-600 hover:text-red-900" title="Delete"><Trash2 className="h-5 w-5" /></button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </main>
        </div>
    );
};

export default ManageDrivers;