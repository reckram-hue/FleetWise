
import React, { useState, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserRole } from './types';
import AdminDashboard from './components/admin/AdminDashboard';
import DriverDashboard from './components/driver/DriverDashboard';
import Leaderboard from './components/shared/Leaderboard';
import { UserContext } from './contexts/UserContext';
import { mockUsers } from './services/mockApi';
import { User } from './types';
import { ShieldCheck, User as UserIcon } from 'lucide-react';

const LoginScreen = ({ onLogin }: { onLogin: (user: User) => void }) => {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white">
      <div className="text-center">
        <ShieldCheck className="w-24 h-24 text-blue-500 mx-auto mb-4" />
        <h1 className="text-4xl font-bold mb-2">FleetWise SA</h1>
        <p className="text-gray-400 mb-8">Vehicle & Driver Management System</p>
      </div>
      <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-sm">
        <h2 className="text-2xl font-semibold text-center mb-6">Select Your Role</h2>
        <div className="space-y-4">
          <button
            onClick={() => onLogin(mockUsers.find(u => u.role === UserRole.Admin)!)}
            className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 transform hover:scale-105"
          >
            <UserIcon className="mr-2 h-5 w-5" />
            Login as Admin
          </button>
          <button
            onClick={() => onLogin(mockUsers.find(u => u.role === UserRole.Driver)!)}
            className="w-full flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 transform hover:scale-105"
          >
            <UserIcon className="mr-2 h-5 w-5" />
            Login as Driver
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const userContextValue = useMemo(() => ({ currentUser, setCurrentUser }), [currentUser]);

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />;
  }

  return (
    <UserContext.Provider value={userContextValue}>
      <HashRouter>
        <Routes>
          <Route path="/leaderboard" element={<Leaderboard />} />
          {currentUser.role === UserRole.Admin && (
            <>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="*" element={<Navigate to="/admin" />} />
            </>
          )}
          {currentUser.role === UserRole.Driver && (
            <>
              <Route path="/driver" element={<DriverDashboard />} />
              <Route path="*" element={<Navigate to="/driver" />} />
            </>
          )}
        </Routes>
      </HashRouter>
    </UserContext.Provider>
  );
}

export default App;
