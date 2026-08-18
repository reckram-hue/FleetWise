// src/components/auth/ChangePinFlow.tsx
// Component for drivers to change their PIN (forced on first login with default PIN)

import React, { useState } from 'react';
import { User } from '../../types';
import { Lock, AlertCircle, CheckCircle, Loader, ShieldCheck } from 'lucide-react';
import api from '../../services/firebaseApi';

interface ChangePinFlowProps {
  driver: User;
  isForced: boolean;
  onPinChanged: () => void;
  onCancel?: () => void;
}

const ChangePinFlow: React.FC<ChangePinFlowProps> = ({
  driver,
  isForced,
  onPinChanged,
  onCancel
}) => {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePinInput = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const cleaned = value.replace(/\D/g, ''); // Only digits
    if (cleaned.length <= 4) {
      setter(cleaned);
      setError(null);
    }
  };

  const validateNewPin = (): string | null => {
    if (newPin.length !== 4) {
      return 'PIN must be exactly 4 digits';
    }

    if (newPin === '1234') {
      return 'Please choose a PIN other than 1234';
    }

    if (newPin === currentPin) {
      return 'New PIN must be different from current PIN';
    }

    // Check for weak PINs
    if (newPin === '0000' || newPin === '1111' || newPin === '2222' ||
      newPin === '3333' || newPin === '4444' || newPin === '5555' ||
      newPin === '6666' || newPin === '7777' || newPin === '8888' || newPin === '9999') {
      return 'Please choose a more secure PIN (avoid repeating digits)';
    }

    // Check for sequential PINs
    const sequences = ['0123', '1234', '2345', '3456', '4567', '5678', '6789', '7890'];
    if (sequences.includes(newPin)) {
      return 'Please choose a more secure PIN (avoid sequential digits)';
    }

    if (newPin !== confirmPin) {
      return 'PINs do not match';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate current PIN
    if (!isForced && currentPin.length !== 4) {
      setError('Please enter your current PIN');
      return;
    }

    // For forced changes, assume current PIN is 1234
    const currentPinToVerify = isForced ? '1234' : currentPin;

    // Validate new PIN
    const validationError = validateNewPin();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.driverChangePin(driver.id, currentPinToVerify, newPin);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onPinChanged();
        }, 2000);
      } else {
        setError(result.message || 'Failed to change PIN');
      }
    } catch (err: any) {
      console.error('PIN change failed:', err);

      let errorMessage = 'Failed to change PIN. Please try again.';

      if (err.message?.includes('permission-denied')) {
        errorMessage = 'Current PIN is incorrect';
      } else if (err.message?.includes('invalid-argument')) {
        errorMessage = 'Invalid PIN format';
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">PIN Changed Successfully!</h2>
          <p className="text-gray-400 mb-6">
            Your new PIN has been set. You can now use it to log in and start shifts.
          </p>
          <div className="animate-pulse text-blue-400">
            Redirecting to dashboard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <ShieldCheck className="w-16 h-16 text-blue-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">
          {isForced ? 'Set Your New PIN' : 'Change Your PIN'}
        </h1>
        <p className="text-gray-400">
          {isForced
            ? 'For security, you must change your default PIN'
            : `Update your PIN for ${driver.firstName} ${driver.surname}`
          }
        </p>
      </div>

      <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md">
        {isForced && (
          <div className="mb-6 p-4 bg-yellow-900/30 border border-yellow-600 rounded-lg">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-yellow-400 mr-2 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-200">
                <p className="font-semibold mb-1">First Time Login</p>
                <p>
                  You're currently using the default PIN (1234).
                  Please create a new secure 4-digit PIN that only you know.
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {!isForced && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <Lock className="inline h-4 w-4 mr-1" />
                Current PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={currentPin}
                onChange={(e) => handlePinInput(e.target.value, setCurrentPin)}
                placeholder="••••"
                className="w-full px-4 py-3 text-2xl text-center bg-gray-700 border-2 border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white tracking-widest"
                disabled={loading}
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Lock className="inline h-4 w-4 mr-1" />
              New PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={newPin}
              onChange={(e) => handlePinInput(e.target.value, setNewPin)}
              placeholder="••••"
              className="w-full px-4 py-3 text-2xl text-center bg-gray-700 border-2 border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white tracking-widest"
              disabled={loading}
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Choose a 4-digit PIN (avoid 1234, 0000, or sequential numbers)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Lock className="inline h-4 w-4 mr-1" />
              Confirm New PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => handlePinInput(e.target.value, setConfirmPin)}
              placeholder="••••"
              className="w-full px-4 py-3 text-2xl text-center bg-gray-700 border-2 border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white tracking-widest"
              disabled={loading}
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Re-enter your new PIN to confirm
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-900/50 border border-red-500 rounded-lg">
              <div className="flex items-center text-red-200">
                <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <button
              type="submit"
              disabled={loading || newPin.length !== 4 || confirmPin.length !== 4 || (!isForced && currentPin.length !== 4)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader className="animate-spin h-5 w-5 mr-2" />
                  Changing PIN...
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5 mr-2" />
                  {isForced ? 'Set New PIN' : 'Change PIN'}
                </>
              )}
            </button>

            {!isForced && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold py-3 px-4 rounded-lg transition duration-300"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="mt-6 p-3 bg-blue-900/30 border border-blue-600 rounded-lg">
          <p className="text-xs text-blue-200">
            <strong>PIN Security Tips:</strong>
          </p>
          <ul className="text-xs text-blue-200 mt-2 space-y-1 list-disc list-inside">
            <li>Choose a PIN that's easy for you to remember</li>
            <li>Don't use obvious combinations like birthdates</li>
            <li>Don't share your PIN with anyone</li>
            <li>Change your PIN if you suspect it's been compromised</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ChangePinFlow;
