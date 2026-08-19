
import React, { useState, useMemo, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserRole, Shift, Vehicle } from './types';
import AdminDashboard from './components/admin/AdminDashboard';
import AdminHealth from './components/admin/AdminHealth';
import DriverDashboard from './components/driver/DriverDashboard';
import Leaderboard from './components/shared/Leaderboard';
import ShiftStart from './pages/ShiftStart';
import ActiveShift from './pages/ActiveShift';
import { UserContext } from './contexts/UserContext';
import { User } from './types';
import { getDriverSession, clearDriverSession, isSessionLocallyExpired } from './store/session';
import { shiftStore } from './store/shift';
import api from './services/firebaseApi';
import DriverPinLogin from './components/auth/DriverPinLogin';
import AdminLogin from './components/auth/AdminLogin';
import ChangePinFlow from './components/auth/ChangePinFlow';
import { ShieldCheck, User as UserIcon } from 'lucide-react';

type AppState =
  | { screen: 'choose-role' }
  | { screen: 'driver-login' }
  | { screen: 'admin-login' }
  | { screen: 'change-pin'; driver: User; isForced: boolean }
  | { screen: 'app'; user: User };

const RoleSelectionScreen = ({
  onSelectDriver,
  onSelectAdmin,
}: {
  onSelectDriver: () => void;
  onSelectAdmin: () => void;
}) => {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white p-6">
      <div className="text-center mb-8">
        <ShieldCheck className="w-24 h-24 text-blue-500 mx-auto mb-4" />
        <h1 className="text-4xl font-bold mb-2">FleetWise SA</h1>
        <p className="text-gray-400">Vehicle & Driver Management System</p>
      </div>

      <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-sm">
        <h2 className="text-2xl font-semibold text-center mb-6">Select Your Role</h2>
        <div className="space-y-4">
          <button
            onClick={onSelectDriver}
            className="w-full flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-4 rounded-lg transition duration-300 transform hover:scale-105"
          >
            <UserIcon className="mr-2 h-6 w-6" />
            <span className="text-lg">I'm a Driver</span>
          </button>
          <button
            onClick={onSelectAdmin}
            className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-4 rounded-lg transition duration-300 transform hover:scale-105"
          >
            <ShieldCheck className="mr-2 h-6 w-6" />
            <span className="text-lg">I'm an Admin</span>
          </button>
        </div>

        <div className="mt-6 p-3 bg-gray-700 rounded-lg">
          <p className="text-xs text-gray-300 text-center">
            Drivers use PIN authentication<br />
            Admins use email & password
          </p>
        </div>
      </div>
    </div>
  );
};

// Reconcile the local active-shift cache with a server-provided shift, then it can be
// routed to the Active Shift screen. The server remains authoritative.
async function reconcileActiveShiftCache(shift: Shift, driver: User): Promise<void> {
  let vehicle: Vehicle | null = null;
  try {
    vehicle = await api.getVehicle(shift.vehicleId);
  } catch {
    vehicle = null;
  }
  const startDate = new Date(shift.startTime as any);
  if (isNaN(startDate.getTime())) {
    throw new Error('Active shift has an unreadable startTime from the server');
  }
  shiftStore.setActiveShift({
    shiftId: shift.id,
    driverId: driver.id,
    driverName: `${driver.firstName} ${driver.surname}`,
    vehicleId: shift.vehicleId,
    vehicle: {
      id: shift.vehicleId,
      registration: vehicle?.registration || 'Unknown',
      alias: vehicle?.alias,
      vehicleType: vehicle?.vehicleType || 'ICE',
    },
    startAt: startDate.toISOString(),
    startOdo: shift.startOdometer,
    startChargePercent: shift.startChargePercent,
  });
}

function App() {
  const [appState, setAppState] = useState<AppState>({ screen: 'choose-role' });

  // Restore a driver session on app start (survives page refresh). The server remains
  // authoritative; we never restore a profile from a locally cached full profile.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const session = getDriverSession();
      if (!session || isSessionLocallyExpired(session)) {
        clearDriverSession();
        return;
      }
      try {
        // Validate the session server-side and retrieve any active shift.
        const activeShift = await api.getActiveShiftWithSession(session.driverId, session.sessionToken);
        // Fetch the safe driver profile from the server (not from local storage).
        const drivers = await api.listDriversSafe();
        const profile = drivers.find((d: User) => d.id === session.driverId);
        if (cancelled) return;
        if (profile) {
          if (activeShift) {
            // Resume the existing shift — the server is authoritative.
            await reconcileActiveShiftCache(activeShift, profile);
            window.location.hash = '/driver/shift/active';
          } else {
            shiftStore.clearActiveShift();
          }
          setAppState({ screen: 'app', user: profile });
        } else {
          clearDriverSession();
        }
      } catch (e: any) {
        const code = String(e?.code || '');
        if (code.includes('unauthenticated') || code.includes('permission-denied')) {
          clearDriverSession();
        }
      }
    };
    restore();
    return () => { cancelled = true; };
  }, []);

  const handleDriverLogin = async (driver: User, requiresPinChange: boolean) => {
    if (requiresPinChange) {
      setAppState({ screen: 'change-pin', driver, isForced: true });
      return;
    }

    setAppState({ screen: 'app', user: driver });

    // Resume an existing active shift (session expiry must not orphan a server-side shift).
    try {
      const session = getDriverSession();
      if (session && !isSessionLocallyExpired(session)) {
        const activeShift = await api.getActiveShiftWithSession(session.driverId, session.sessionToken);
        if (activeShift) {
          await reconcileActiveShiftCache(activeShift, driver);
          window.location.hash = '/driver/shift/active';
        } else {
          shiftStore.clearActiveShift();
        }
      }
    } catch {
      // Network/server error: route to the Active Shift screen, which surfaces a retryable
      // error rather than a "Start New Shift" prompt (avoids a false second-shift opportunity).
      window.location.hash = '/driver/shift/active';
    }
  };

  const handleAdminLogin = (admin: User) => {
    setAppState({ screen: 'app', user: admin });
  };

  const handlePinChanged = () => {
    setAppState(prev => {
      if (prev.screen === 'change-pin') {
        return { screen: 'app', user: prev.driver };
      }
      return prev;
    });
  };

  const handleBack = () => {
    setAppState({ screen: 'choose-role' });
  };

  const renderContent = () => {
    // Role selection screen
    if (appState.screen === 'choose-role') {
      return (
        <RoleSelectionScreen
          onSelectDriver={() => setAppState({ screen: 'driver-login' })}
          onSelectAdmin={() => setAppState({ screen: 'admin-login' })}
        />
      );
    }

    // Driver PIN login
    if (appState.screen === 'driver-login') {
      return (
        <DriverPinLogin
          onLogin={handleDriverLogin}
          onAdminLogin={() => setAppState({ screen: 'admin-login' })}
        />
      );
    }

    // Admin email/password login
    if (appState.screen === 'admin-login') {
      return <AdminLogin onLogin={handleAdminLogin} onBack={handleBack} />;
    }

    // PIN change screen (forced for first-time drivers)
    if (appState.screen === 'change-pin') {
      return (
        <ChangePinFlow
          driver={appState.driver}
          isForced={appState.isForced}
          onPinChanged={handlePinChanged}
        />
      );
    }

    // Main app (logged in)
    const currentUser = appState.user;
    const userContextValue = {
      currentUser,
      setCurrentUser: (user: User | null) => {
        if (user) {
          setAppState({ screen: 'app', user });
        } else {
          setAppState({ screen: 'choose-role' });
        }
      },
    };

    return (
      <UserContext.Provider value={userContextValue}>
        <HashRouter>
          <Routes>
            <Route path="/leaderboard" element={<Leaderboard />} />
            {currentUser.role === UserRole.Admin && (
              <>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/health" element={<AdminHealth />} />
                <Route path="*" element={<Navigate to="/admin" />} />
              </>
            )}
            {currentUser.role === UserRole.Driver && (
              <>
                <Route path="/driver/shift/start" element={
                  <ShiftStart
                    onShiftStarted={() => window.location.hash = '/driver/shift/active'}
                    onBack={() => window.location.hash = '/driver'}
                  />
                } />
                <Route path="/driver/shift/active" element={
                  <ActiveShift
                    onShiftEnded={() => window.location.hash = '/driver'}
                    onBack={() => window.location.hash = '/driver'}
                  />
                } />
                <Route path="/driver" element={<DriverDashboard />} />
                <Route path="*" element={<Navigate to="/driver" />} />
              </>
            )}
            {/* Fallback for role mismatch */}
            <Route path="*" element={<div className="p-8 text-white">Role mismatch: {currentUser.role} (Expected {UserRole.Driver} or {UserRole.Admin})</div>} />
          </Routes>
        </HashRouter>
      </UserContext.Provider>
    );
  };

  return (
    <div className="app-root relative min-h-screen bg-gray-900">
      {/* Simple Error Boundary inline implementation */}
      <ErrorBoundary>
        {renderContent()}
      </ErrorBoundary>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: any) {
    console.error("Global Error Boundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return <div className="p-8 bg-red-900 text-white">
        <h1 className="text-xl font-bold">Critical Application Error</h1>
        <pre className="mt-4 bg-black p-4 rounded overflow-auto">{this.state.error?.toString()}</pre>
        <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-white text-black rounded">Reload</button>
      </div>;
    }
    return this.props.children;
  }
}

export default App;
