import React, { useState, useEffect } from 'react';
import { MessageCircle, RefreshCw, Copy } from 'lucide-react';
import Card from '../shared/Card';
import Header from '../shared/Header';

interface TelegramDriver {
  id: string;
  firstName: string;
  surname: string;
  isActive: boolean;
  hasTelegram: boolean;
  telegram_username?: string;
}

interface TelegramDriversProps {
  onBack: () => void;
}

const TelegramDrivers: React.FC<TelegramDriversProps> = ({ onBack }) => {
  const [drivers, setDrivers] = useState<TelegramDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrivers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:3001/api/drivers');
      if (!response.ok) throw new Error('Failed to fetch drivers');
      const data = await response.json();
      setDrivers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  const handleTelegramLink = async (driver: TelegramDriver) => {
    try {
      const response = await fetch(`http://localhost:3001/api/drivers/${driver.id}/telegram-link`);
      if (!response.ok) throw new Error('Failed to get Telegram link');
      const data = await response.json();

      // Copy to clipboard
      await navigator.clipboard.writeText(data.url);
      alert(`Telegram registration link copied to clipboard!\n\nSend this link to ${driver.firstName} ${driver.surname}:\n${data.url}`);
    } catch (error) {
      console.error('Failed to get Telegram link:', error);
      alert('Failed to generate Telegram link. Make sure the server is running.');
    }
  };

  const handleCreateTestDriver = async () => {
    try {
      const driverId = 'test_' + Date.now();
      const response = await fetch('http://localhost:3001/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: driverId,
          firstName: 'Test',
          surname: 'Driver'
        })
      });

      if (!response.ok) throw new Error('Failed to create driver');

      alert('Test driver created: ' + driverId);
      await fetchDrivers();
    } catch (error) {
      console.error('Failed to create test driver:', error);
      alert('Error creating test driver');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header title="Telegram Integration" />
      <main className="max-w-6xl mx-auto p-6">
        <Card>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Driver Telegram Status</h2>
            <div className="flex gap-2">
              <button
                onClick={handleCreateTestDriver}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
              >
                Create Test Driver
              </button>
              <button
                onClick={fetchDrivers}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300 flex items-center"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </button>
            </div>
          </div>

          <div className="mb-4">
            <button
              onClick={onBack}
              className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
            >
              Back to Dashboard
            </button>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              Error: {error}
            </div>
          )}

          {loading ? (
            <p>Loading drivers...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Driver
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Telegram
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Username
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {drivers.map((driver) => (
                    <tr key={driver.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {driver.firstName} {driver.surname}
                        <br />
                        <span className="text-xs text-gray-500">ID: {driver.id}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          driver.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {driver.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          driver.hasTelegram
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {driver.hasTelegram ? '✅ Connected' : '❌ Not Connected'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {driver.telegram_username || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleTelegramLink(driver)}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
                          title="Get Telegram registration link"
                        >
                          <MessageCircle className="h-3 w-3 mr-1" />
                          Get Link
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {drivers.length === 0 && !loading && (
                <div className="text-center py-8 text-gray-500">
                  No drivers found. Create a test driver to get started.
                </div>
              )}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

export default TelegramDrivers;