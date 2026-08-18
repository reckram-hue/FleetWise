import React, { useState, useEffect } from 'react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { Plus, X, Trash2, Settings as SettingsIcon, Users, UserPlus, Shield } from 'lucide-react';
import { AppSettings, User } from '../../types';
import api from '../../services/firebaseApi';

interface SettingsProps {
    onBack: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'areas' | 'departments' | 'service-booking' | 'users'>('areas');
    const [newAreaInput, setNewAreaInput] = useState('');
    const [newDepartmentInput, setNewDepartmentInput] = useState('');

    // Admin Management State
    const [admins, setAdmins] = useState<User[]>([]);
    const [loadingAdmins, setLoadingAdmins] = useState(false);
    const [showAddAdmin, setShowAddAdmin] = useState(false);
    const [newAdminData, setNewAdminData] = useState({ firstName: '', surname: '', email: '', password: '' });
    const [creatingAdmin, setCreatingAdmin] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const data = await api.getSettings();
            setSettings(data);
        } catch (error) {
            console.error('Failed to fetch settings:', error);
            // Create default settings if fetch fails
            setSettings({
                id: 'default',
                areas: [],
                departments: [],
                serviceBookingLeadTimeDays: 7,
                enableSmartBookingReminders: false,
                defaultDailyUsageKm: 50,
                bookingReminderThresholdKm: 1000,
                defaultLicenseReminderDays: 30,
                enableLicenseReminders: true,
                createdBy: 'system',
                lastModified: new Date()
            });
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async (updatedSettings: Partial<AppSettings>) => {
        setSaving(true);
        try {
            const saved = await api.updateSettings(updatedSettings);
            setSettings(saved);
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('Error saving settings.');
        } finally {
            setSaving(false);
        }
    };

    const addArea = async () => {
        if (!newAreaInput.trim() || !settings) return;
        const trimmedArea = newAreaInput.trim();

        if (settings.areas.includes(trimmedArea)) {
            alert('This area already exists.');
            return;
        }

        const updatedAreas = [...settings.areas, trimmedArea].sort();
        await saveSettings({ areas: updatedAreas });
        setNewAreaInput('');
    };

    const removeArea = async (areaToRemove: string) => {
        if (!settings) return;
        const updatedAreas = settings.areas.filter(area => area !== areaToRemove);
        await saveSettings({ areas: updatedAreas });
    };

    const addDepartment = async () => {
        if (!newDepartmentInput.trim() || !settings) return;
        const trimmedDepartment = newDepartmentInput.trim();

        if (settings.departments.includes(trimmedDepartment)) {
            alert('This department already exists.');
            return;
        }

        const updatedDepartments = [...settings.departments, trimmedDepartment].sort();
        await saveSettings({ departments: updatedDepartments });
        setNewDepartmentInput('');
    };

    const removeDepartment = async (departmentToRemove: string) => {
        if (!settings) return;
        const updatedDepartments = settings.departments.filter(dept => dept !== departmentToRemove);
        await saveSettings({ departments: updatedDepartments });
    };

    const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
        if (e.key === 'Enter') {
            action();
        }
    };

    const fetchAdmins = async () => {
        setLoadingAdmins(true);
        try {
            const data = await api.getAdminUsers();
            setAdmins(data);
        } catch (error) {
            console.error('Failed to fetch admins:', error);
        } finally {
            setLoadingAdmins(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'users') {
            fetchAdmins();
        }
    }, [activeTab]);

    const handleCreateAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreatingAdmin(true);
        try {
            await api.createAdminUser(newAdminData);
            await fetchAdmins(); // Refresh list
            setShowAddAdmin(false);
            setNewAdminData({ firstName: '', surname: '', email: '', password: '' });
            alert('Admin user created successfully!');
        } catch (error: any) {
            console.error('Failed to create admin:', error);
            alert(`Error: ${error.message || 'Failed to create admin'}`);
        } finally {
            setCreatingAdmin(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="Settings" />
                <main className="max-w-4xl mx-auto p-6">
                    <div className="text-center py-8">Loading settings...</div>
                </main>
            </div>
        );
    }

    if (!settings) {
        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="Settings" />
                <main className="max-w-4xl mx-auto p-6">
                    <div className="text-center py-8 text-red-500">Failed to load settings.</div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Settings" />
            <main className="max-w-4xl mx-auto p-6">
                <Card>
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center">
                            <SettingsIcon className="h-8 w-8 text-gray-600 mr-3" />
                            <div>
                                <h2 className="text-2xl font-bold text-gray-800">System Settings</h2>
                                <p className="text-gray-600">Manage dropdown options for driver information</p>
                            </div>
                        </div>
                        <button
                            onClick={onBack}
                            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition"
                        >
                            Back to Dashboard
                        </button>
                    </div>

                    {/* Tab Navigation */}
                    <div className="border-b border-gray-200 mb-6">
                        <nav className="flex space-x-8">
                            <button
                                onClick={() => setActiveTab('areas')}
                                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'areas'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                Areas ({settings.areas.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('departments')}
                                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'departments'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                Departments ({settings.departments.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('service-booking')}
                                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'service-booking'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                Service Booking
                            </button>
                            <button
                                onClick={() => setActiveTab('users')}
                                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center ${activeTab === 'users'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <Users className="h-4 w-4 mr-1" />
                                Admin Users
                            </button>
                        </nav>
                    </div>

                    {/* Areas Tab */}
                    {activeTab === 'areas' && (
                        <div>
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold mb-4">Manage Areas</h3>
                                <div className="flex gap-3 mb-4">
                                    <input
                                        type="text"
                                        value={newAreaInput}
                                        onChange={(e) => setNewAreaInput(e.target.value)}
                                        onKeyPress={(e) => handleKeyPress(e, addArea)}
                                        placeholder="Enter new area name"
                                        className="flex-1 p-2 border border-gray-300 rounded-md"
                                    />
                                    <button
                                        onClick={addArea}
                                        disabled={!newAreaInput.trim() || saving}
                                        className="flex items-center bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400"
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Area
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {settings.areas.map((area) => (
                                    <div key={area} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                                        <span className="font-medium">{area}</span>
                                        <button
                                            onClick={() => removeArea(area)}
                                            disabled={saving}
                                            className="text-red-600 hover:text-red-800 p-1 disabled:opacity-50"
                                            title="Remove area"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {settings.areas.length === 0 && (
                                <p className="text-gray-500 text-center py-8">No areas configured yet.</p>
                            )}
                        </div>
                    )}

                    {/* Departments Tab */}
                    {activeTab === 'departments' && (
                        <div>
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold mb-4">Manage Departments</h3>
                                <div className="flex gap-3 mb-4">
                                    <input
                                        type="text"
                                        value={newDepartmentInput}
                                        onChange={(e) => setNewDepartmentInput(e.target.value)}
                                        onKeyPress={(e) => handleKeyPress(e, addDepartment)}
                                        placeholder="Enter new department name"
                                        className="flex-1 p-2 border border-gray-300 rounded-md"
                                    />
                                    <button
                                        onClick={addDepartment}
                                        disabled={!newDepartmentInput.trim() || saving}
                                        className="flex items-center bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400"
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Department
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {settings.departments.map((department) => (
                                    <div key={department} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                                        <span className="font-medium">{department}</span>
                                        <button
                                            onClick={() => removeDepartment(department)}
                                            disabled={saving}
                                            className="text-red-600 hover:text-red-800 p-1 disabled:opacity-50"
                                            title="Remove department"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {settings.departments.length === 0 && (
                                <p className="text-gray-500 text-center py-8">No departments configured yet.</p>
                            )}
                        </div>
                    )}

                    {/* Service Booking Tab */}
                    {/* Users Tab */}
                    {activeTab === 'users' && (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-semibold">Admin Users</h3>
                                <button
                                    onClick={() => setShowAddAdmin(true)}
                                    className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition"
                                >
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Add New Admin
                                </button>
                            </div>

                            {/* Add Admin Form */}
                            {showAddAdmin && (
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
                                    <h4 className="font-semibold text-gray-800 mb-4">Create New Admin</h4>
                                    <form onSubmit={handleCreateAdmin} className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={newAdminData.firstName}
                                                    onChange={e => setNewAdminData({ ...newAdminData, firstName: e.target.value })}
                                                    className="w-full p-2 border rounded"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Surname</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={newAdminData.surname}
                                                    onChange={e => setNewAdminData({ ...newAdminData, surname: e.target.value })}
                                                    className="w-full p-2 border rounded"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                                <input
                                                    type="email"
                                                    required
                                                    value={newAdminData.email}
                                                    onChange={e => setNewAdminData({ ...newAdminData, email: e.target.value })}
                                                    className="w-full p-2 border rounded"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                                <input
                                                    type="password"
                                                    required
                                                    minLength={6}
                                                    value={newAdminData.password}
                                                    onChange={e => setNewAdminData({ ...newAdminData, password: e.target.value })}
                                                    className="w-full p-2 border rounded"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end space-x-3">
                                            <button
                                                type="button"
                                                onClick={() => setShowAddAdmin(false)}
                                                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-100"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={creatingAdmin}
                                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
                                            >
                                                {creatingAdmin ? 'Creating...' : 'Create Admin'}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            {/* Admin List */}
                            {loadingAdmins ? (
                                <p className="text-gray-500">Loading users...</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {admins.map(admin => (
                                        <div key={admin.id} className="flex items-start p-4 border rounded-lg hover:shadow-md transition bg-white">
                                            <div className="bg-blue-100 p-2 rounded-full mr-3">
                                                <Shield className="h-6 w-6 text-blue-600" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-gray-900">{admin.firstName} {admin.surname}</h4>
                                                <p className="text-sm text-gray-500">{admin.email}</p>
                                                <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                                    Admin Access
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    {admins.length === 0 && <p className="text-gray-500">No admin users found.</p>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ORIGINAL Service Booking Tab End */}
                    {activeTab === 'service-booking' && (
                        <div>
                            <h3 className="text-lg font-semibold mb-6">Smart Service Booking Deadlines</h3>
                            <div className="space-y-6">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <h4 className="font-medium text-blue-900 mb-2">How Smart Booking Works</h4>
                                    <p className="text-sm text-blue-700">
                                        The system calculates when to remind you to book services based on each vehicle's usage patterns.
                                        For example: if a vehicle averages 100km/day and needs 10 days booking notice,
                                        you'll be reminded when the vehicle reaches 1000km before its service is due.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Booking Lead Time (days)
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="30"
                                                value={settings.serviceBookingLeadTimeDays}
                                                onChange={(e) => saveSettings({ serviceBookingLeadTimeDays: parseInt(e.target.value) || 1 })}
                                                className="w-full p-2 border border-gray-300 rounded-md"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                How many days notice do you need to book a service appointment?
                                            </p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Default Daily Usage (km)
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={settings.defaultDailyUsageKm}
                                                onChange={(e) => saveSettings({ defaultDailyUsageKm: parseInt(e.target.value) || 50 })}
                                                className="w-full p-2 border border-gray-300 rounded-md"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                Used for new vehicles without usage history
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="flex items-center space-x-3">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.enableSmartBookingReminders}
                                                    onChange={(e) => saveSettings({ enableSmartBookingReminders: e.target.checked })}
                                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                />
                                                <span className="text-sm font-medium text-gray-700">
                                                    Enable Smart Booking Reminders
                                                </span>
                                            </label>
                                            <p className="text-xs text-gray-500 mt-1 ml-7">
                                                Use individual vehicle usage patterns to calculate booking deadlines
                                            </p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Manual Override Threshold (km)
                                            </label>
                                            <input
                                                type="number"
                                                min="100"
                                                value={settings.bookingReminderThresholdKm}
                                                onChange={(e) => saveSettings({ bookingReminderThresholdKm: parseInt(e.target.value) || 1000 })}
                                                className="w-full p-2 border border-gray-300 rounded-md"
                                                disabled={settings.enableSmartBookingReminders}
                                            />
                                            <p className="text-xs text-gray-500 mt-1">
                                                Fixed km threshold when smart reminders are disabled
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gray-50 rounded-lg p-4">
                                    <h4 className="font-medium text-gray-900 mb-3">Current Configuration</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="font-medium text-gray-700">Smart Reminders:</span>
                                            <span className={`ml-2 px-2 py-1 rounded text-xs ${settings.enableSmartBookingReminders ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                                {settings.enableSmartBookingReminders ? 'Enabled' : 'Disabled'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="font-medium text-gray-700">Lead Time:</span>
                                            <span className="ml-2 text-gray-900">{settings.serviceBookingLeadTimeDays} days</span>
                                        </div>
                                        <div>
                                            <span className="font-medium text-gray-700">Default Usage:</span>
                                            <span className="ml-2 text-gray-900">{settings.defaultDailyUsageKm} km/day</span>
                                        </div>
                                        <div>
                                            <span className="font-medium text-gray-700">Manual Threshold:</span>
                                            <span className="ml-2 text-gray-900">{settings.bookingReminderThresholdKm} km</span>
                                        </div>
                                    </div>
                                </div>

                                {settings.enableSmartBookingReminders && (
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                        <h4 className="font-medium text-green-900 mb-2">Smart Calculation Example</h4>
                                        <p className="text-sm text-green-700">
                                            Vehicle averaging 150 km/day with {settings.serviceBookingLeadTimeDays}-day lead time =
                                            Reminder at {150 * settings.serviceBookingLeadTimeDays} km before service due
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {saving && (
                        <div className="fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center z-50">
                            <div className="bg-white p-4 rounded-lg shadow-lg">
                                <p>Saving settings...</p>
                            </div>
                        </div>
                    )}

                    {settings.lastModified && (
                        <div className="mt-8 pt-4 border-t border-gray-200 text-sm text-gray-500">
                            Last modified: {settings.lastModified.toLocaleString()}
                        </div>
                    )}
                </Card>
            </main>
        </div>
    );
};

export default Settings;