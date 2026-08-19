// src/components/auth/AdminLogin.tsx
// Admin login using Firebase Authentication

import React, { useState } from 'react';
import { User } from '../../types';
import { ShieldCheck, Mail, Lock, AlertCircle, Loader, ArrowLeft } from 'lucide-react';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import api from '../../services/firebaseApi';

interface AdminLoginProps {
  onLogin: (user: User) => void;
  onBack: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin, onBack }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Sign in with Firebase Auth
      const auth = getAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Get admin profile via secure callable (uses context.auth.uid)
      // No need to download all users — callable reads users/{uid} directly
      const adminUser = await api.getAdminProfile();

      if (!adminUser) {
        throw new Error('Admin profile not found');
      }

      onLogin(adminUser);
    } catch (err: any) {
      console.error('Admin login failed:', err);

      let errorMessage = 'Login failed. Please try again.';

      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password';
      } else if (err.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your connection.';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <ShieldCheck className="w-20 h-20 text-blue-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">Admin Login</h1>
        <p className="text-gray-400">FleetWise Management System</p>
      </div>

      <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Mail className="inline h-4 w-4 mr-1" />
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@fleetwise.com"
              className="w-full px-4 py-3 bg-gray-700 border-2 border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-400"
              disabled={loading}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Lock className="inline h-4 w-4 mr-1" />
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-4 py-3 bg-gray-700 border-2 border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-400"
              disabled={loading}
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/50 border border-red-500 rounded-lg">
              <div className="flex items-center text-red-200">
                <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader className="animate-spin h-5 w-5 mr-2" />
                  Signing in...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-5 w-5 mr-2" />
                  Login as Admin
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onBack}
              disabled={loading}
              className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold py-3 px-4 rounded-lg transition duration-300 flex items-center justify-center"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Login
            </button>
          </div>
        </form>

        <div className="mt-6 p-3 bg-blue-900/30 border border-blue-600 rounded-lg">
          <p className="text-xs text-blue-200">
            <strong>Admin Access Only</strong>
            <br />
            Use your Firebase Authentication credentials to log in.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
