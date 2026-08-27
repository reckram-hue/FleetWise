// src/components/auth/DriverPinLogin.tsx
// PIN-based login for drivers

import React, { useState, useEffect } from 'react';
import { DriverLoginResult, User } from '../../types';
import api from '../../services/firebaseApi';
import { setDriverSession } from '../../store/session';
import { readDriverDirectoryCache, writeDriverDirectoryCache } from '../../lib/driverDirectoryCache';
import { ShieldCheck, User as UserIcon, Lock, AlertCircle, Loader } from 'lucide-react';
import Card from '../shared/Card';

interface DriverPinLoginProps {
  onLogin: (result: DriverLoginResult) => void | Promise<void>;
  onAdminLogin: () => void;
}

const DriverPinLogin: React.FC<DriverPinLoginProps> = ({ onLogin, onAdminLogin }) => {
  const [drivers, setDrivers] = useState<User[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter drivers based on search
  const filteredDrivers = drivers.filter(driver =>
    `${driver.firstName} ${driver.surname}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    driver.area?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Load active drivers on mount (safe listing — no PII or pinHash)
  useEffect(() => {
    let cancelled = false;
    const loadDrivers = async () => {
      const cached = readDriverDirectoryCache();
      if (cached) {
        setDrivers(cached.users);
        setLoadingDrivers(false);
        console.info('[FW-PERF] driverDirectory cache', {
          source: 'cache',
          stale: cached.isStale,
          count: cached.users.length,
          timestamp: new Date().toISOString(),
        });
      }

      if (cached && !cached.isStale) {
        return;
      }

      const startedAt = performance.now();
      try {
        // listDriversSafe returns only: id, firstName, surname, area, department, employmentStatus, role
        // Never returns pinHash, idNumber, email, contactNumber, driversLicenceImageUrl
        const activeDrivers = await api.listDriversSafe();
        if (cancelled) return;
        setDrivers(activeDrivers);
        writeDriverDirectoryCache(activeDrivers);
        console.info('[FW-PERF] driverDirectory fetch', {
          source: 'network',
          cachePrimed: !!cached,
          staleCache: cached?.isStale === true,
          elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
          count: activeDrivers.length,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load drivers:', err);
        if (!cached) {
          setError('Failed to load drivers. Please refresh the page.');
        }
      } finally {
        if (!cancelled) {
          setLoadingDrivers(false);
        }
      }
    };

    void loadDrivers();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDriverSelect = (driver: User) => {
    setSelectedDriver(driver);
    setPin('');
    setError(null);
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Only digits
    if (value.length <= 4) {
      setPin(value);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDriver || pin.length !== 4) {
      setError('Please enter a 4-digit PIN');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get device ID for rate limiting
      const deviceId = localStorage.getItem('fleetwise_device_id') ||
        `browser_${navigator.userAgent.substring(0, 50)}`;
      localStorage.setItem('fleetwise_device_id', deviceId);

      // Establish a server-issued driver session. The PIN is verified server-side and
      // discarded; it is never persisted. The returned sessionToken is a bearer credential
      // stored only in the dedicated session store.
      const result = await api.driverLogin(selectedDriver.id, pin, deviceId);

      setDriverSession({
        sessionToken: result.sessionToken,
        driverId: result.driverId,
        expiresAt: result.expiresAt,
      });

      // Clear the PIN immediately; never persist it anywhere.
      setPin('');

      await onLogin(result);
    } catch (err: any) {
      const code = String(err?.code || '');
      const msg = String(err?.message || '');
      let errorMessage = 'Login failed. Please try again.';

      if (code.includes('permission-denied')) {
        errorMessage = 'Incorrect PIN. Please try again.';
      } else if (code.includes('resource-exhausted')) {
        errorMessage = 'Too many failed attempts. Please wait 10 minutes before trying again.';
      } else if (code.includes('failed-precondition')) {
        errorMessage = msg || 'Login failed. Please try again.';
      } else if (code.includes('not-found')) {
        errorMessage = 'Driver not found. Please contact your administrator.';
      }

      setError(errorMessage);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedDriver(null);
    setPin('');
    setError(null);
  };

  if (loadingDrivers) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader className="animate-spin h-12 w-12 text-blue-500 mx-auto mb-4" />
          <p className="text-white">Loading drivers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white p-6">
      <div className="text-center mb-8">
        <ShieldCheck className="w-24 h-24 text-blue-500 mx-auto mb-4" />
        <h1 className="text-4xl font-bold mb-2">FleetWise SA</h1>
        <p className="text-gray-400">Vehicle & Driver Management System</p>
      </div>

      {!selectedDriver ? (
        // Driver Selection Screen
        <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md">
          <h2 className="text-2xl font-semibold text-center mb-6">Select Your Profile</h2>

          {/* Search Bar */}
          <div className="mb-4 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search driver..."
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {filteredDrivers.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <p className="text-gray-400">No active drivers found matching "{searchQuery}".</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredDrivers.map((driver) => (
                <button
                  key={driver.id}
                  onClick={() => handleDriverSelect(driver)}
                  className="w-full p-4 bg-gray-700 hover:bg-gray-600 rounded-lg transition-all duration-200 text-left border-2 border-transparent hover:border-blue-500"
                >
                  <div className="flex items-center">
                    <UserIcon className="h-8 w-8 text-blue-400 mr-3" />
                    <div>
                      <p className="font-bold text-white">
                        {driver.firstName} {driver.surname}
                      </p>
                      {driver.area && (
                        <p className="text-sm text-gray-400">{driver.area}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-700">
            <button
              onClick={onAdminLogin}
              className="w-full flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold py-3 px-4 rounded-lg transition duration-300"
            >
              <ShieldCheck className="mr-2 h-5 w-5" />
              Switch to Admin Login
            </button>
          </div>
        </div>
      ) : (
        // PIN Entry Screen
        <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md">
          <div className="text-center mb-6">
            <UserIcon className="h-16 w-16 text-blue-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-white">
              {selectedDriver.firstName} {selectedDriver.surname}
            </h2>
            {selectedDriver.area && (
              <p className="text-gray-400 mt-1">{selectedDriver.area}</p>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2 text-center">
                <Lock className="inline h-4 w-4 mr-1" />
                Enter Your 4-Digit PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={pin}
                onChange={handlePinChange}
                placeholder="••••"
                className="w-full px-4 py-4 text-3xl text-center bg-gray-700 border-2 border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white tracking-widest"
                autoFocus
                disabled={loading}
              />
              <p className="text-xs text-gray-400 mt-2 text-center">
                Enter your personal 4-digit PIN
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg">
                <div className="flex items-center text-red-200">
                  <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button
                type="submit"
                disabled={pin.length !== 4 || loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader className="animate-spin h-5 w-5 mr-2" />
                    Verifying...
                  </>
                ) : (
                  'Login'
                )}
              </button>

              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold py-3 px-4 rounded-lg transition duration-300"
              >
                Back
              </button>
            </div>
          </form>

          <div className="mt-6 p-3 bg-yellow-900/30 border border-yellow-600 rounded-lg">
            <p className="text-xs text-yellow-200 text-center">
              <strong>Enter your PIN</strong>
              <br />
              If you do not know your PIN, contact your administrator.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverPinLogin;
