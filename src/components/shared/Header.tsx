import React, { useContext } from 'react';
import { UserContext } from '../../contexts/UserContext';
import { getDriverSession, clearDriverSession, isSessionLocallyExpired } from '../../store/session';
import { shiftStore } from '../../store/shift';
import api from '../../services/firebaseApi';
import { ShieldCheck, LogOut, ArrowLeft } from 'lucide-react';

interface HeaderProps {
  title: string;
  onBack?: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, onBack }) => {
  const { currentUser, setCurrentUser } = useContext(UserContext);

  const handleLogout = async () => {
    const session = getDriverSession();

    if (session && !isSessionLocallyExpired(session)) {
      // A valid driver session exists. Do NOT revoke it while an active shift remains,
      // otherwise the shift would be left Active after the driver logs out.
      try {
        const activeShift = await api.getActiveShiftWithSession(session.driverId, session.sessionToken);
        if (activeShift) {
          alert('You have an active shift. Please end your shift before logging out.');
          return;
        }
      } catch {
        // Preserve the session rather than risk orphaning an active shift.
        alert('FleetWise could not confirm your shift status. Please try again before logging out.');
        return;
      }

      // No active shift — safe to revoke the session server-side.
      try {
        await api.driverLogout(session.driverId, session.sessionToken);
      } catch {
        // Ignore remote failure — still clear local state below.
      }
      clearDriverSession();
      shiftStore.clearActiveShift();
    } else if (session) {
      // Locally expired/invalid session — clear local state without server verification.
      clearDriverSession();
      shiftStore.clearActiveShift();
    }

    setCurrentUser(null);
  };

  return (
    <header className="bg-gray-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white mr-4 transition-colors"
                title="Back to Dashboard"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="font-medium">Dashboard</span>
              </button>
            )}
            <ShieldCheck className="h-8 w-8 text-blue-400" />
            <h1 className="text-xl font-bold ml-3">{title}</h1>
          </div>
          <div className="flex items-center">
            <span className="text-gray-300 mr-4">Welcome, {currentUser?.firstName} {currentUser?.surname}</span>
            <button
              onClick={handleLogout}
              className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
              title="Logout"
            >
              <LogOut className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
