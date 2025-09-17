import React, { useState, useEffect } from 'react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { Plus, X, Trash2, Settings as SettingsIcon } from 'lucide-react';
import { AppSettings } from '../../types';
import api from '../../services/mockApi';

interface SettingsProps {
    onBack: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'areas' | 'departments' | 'service-booking'>('areas');
    const [newAreaInput, setNewAreaInput] = useState('');
    const [newDepartmentInput, setNewDepartmentInput] = useState('');

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
                                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                    activeTab === 'areas'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Areas ({settings.areas.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('departments')}
                                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                    activeTab === 'departments'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Departments ({settings.departments.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('service-booking')}
                                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                    activeTab === 'service-booking'
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Service Booking
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

                    <div className="mt-8 pt-4 border-t border-gray-200 text-sm text-gray-500">
                        Last modified: {settings.lastModified.toLocaleString()}
                    </div>
                </Card>
            </main>
        </div>
    );
};

export default Settings;