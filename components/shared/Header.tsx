import React, { useContext } from 'react';
import { UserContext } from '../../contexts/UserContext';
import { ShieldCheck, LogOut, ArrowLeft } from 'lucide-react';

interface HeaderProps {
  title: string;
  onBack?: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, onBack }) => {
  const { currentUser, setCurrentUser } = useContext(UserContext);

  const handleLogout = () => {
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
