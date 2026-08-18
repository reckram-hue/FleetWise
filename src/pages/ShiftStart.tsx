// src/pages/ShiftStart.tsx — Simplified Shift Start (QR Code + No PIN for logged-in drivers)

import React, { useState, useEffect, useMemo, useContext, useRef } from 'react';
import { Vehicle, User, UserRole, EmploymentStatus, VehicleType } from '../types';
import api from '../services/firebaseApi';
import { shiftStore } from '../store/shift';
import Card from '../components/shared/Card';
import Header from '../components/shared/Header';
import { UserContext } from '../contexts/UserContext';
import { Search, Car, ScanLine, ArrowRight, ArrowLeft, Loader, UserIcon, Info, Camera, X } from 'lucide-react';
import { DefectReport, DefectCategory, DefectUrgency, DefectStatus } from '../types';

interface ShiftStartProps {
  onShiftStarted: () => void;
  onBack: () => void;
}

const ShiftStart: React.FC<ShiftStartProps> = ({ onShiftStarted, onBack }) => {
  const { currentUser } = useContext(UserContext);

  // Defect State
  const [activeDefects, setActiveDefects] = useState<DefectReport[]>([]);
  const [loadingDefects, setLoadingDefects] = useState(false);
  const [showDefectModal, setShowDefectModal] = useState(false);

  // New Defect Form State
  const [newDefectCategory, setNewDefectCategory] = useState<DefectCategory>(DefectCategory.Other);
  const [newDefectDescription, setNewDefectDescription] = useState('');
  const [newDefectUrgency, setNewDefectUrgency] = useState<DefectUrgency>(DefectUrgency.Low);
  const [newDefectPhotos, setNewDefectPhotos] = useState<string[]>([]);
  const [submittingDefect, setSubmittingDefect] = useState(false);

  // State for wizard steps (1 = Vehicle, 2 = Confirm & Start)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // State for scanning
  const [isScanning, setIsScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);

  // State for selections
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Optional fields
  const [startOdo, setStartOdo] = useState<string>('');
  const [startCharge, setStartCharge] = useState<string>('');

  // Data loading
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  // Search filters
  const [vehicleSearch, setVehicleSearch] = useState('');

  // Load vehicles
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [vehiclesData, activeShifts] = await Promise.all([
          api.getVehicles(),
          api.getActiveShifts ? api.getActiveShifts() : Promise.resolve([])
        ]);

        // Get IDs of vehicles currently on shift
        const vehiclesInUse = activeShifts.map((s: any) => s.vehicleId);

        // Filter only active vehicles not in use
        const availableVehicles = vehiclesData.filter(
          (v) => v.status === 'Active' && !vehiclesInUse.includes(v.id)
        );
        setVehicles(availableVehicles);
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('Failed to load vehicles. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Filtered vehicles based on search
  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch.trim()) return vehicles;

    const search = vehicleSearch.toLowerCase();
    return vehicles.filter(
      (v) =>
        v.registration.toLowerCase().includes(search) ||
        v.alias?.toLowerCase().includes(search) ||
        v.make.toLowerCase().includes(search) ||
        v.model.toLowerCase().includes(search)
    );
  }, [vehicles, vehicleSearch]);

  // QR Scanner Logic
  useEffect(() => {
    if (!isScanning) {
      // Cleanup scanner if stopped
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch((err: any) => console.error("Failed to stop scanner", err));
      }
      return;
    }

    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
      });
    };

    const initScanner = async () => {
      try {
        await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
        await new Promise(resolve => setTimeout(resolve, 300)); // Wait for script

        const Html5Qrcode = (window as any).Html5Qrcode;
        if (!Html5Qrcode) throw new Error("QR Library failed to load");

        const scanner = new Html5Qrcode("reader");
        scannerRef.current = scanner;

        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        await scanner.start(
          { facingMode: "environment" },
          config,
          (decodedText: string) => {
            // Success callback
            handleScanSuccess(decodedText);
          },
          (errorMessage: string) => {
            // Ignore frame scan errors
          }
        );
      } catch (err: any) {
        console.error("Scanner Error:", err);
        setScannerError("Camera not accessible. Please use manual selection.");
        setIsScanning(false);
      }
    };

    initScanner();

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch((e: any) => console.error(e));
      }
    };
  }, [isScanning]);

  const handleScanSuccess = (vehicleId: string) => {
    // Find vehicle
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (vehicle) {
      if (scannerRef.current) {
        scannerRef.current.stop().then(() => {
          setIsScanning(false);
          handleVehicleSelect(vehicle);
        }).catch((err: any) => {
          setIsScanning(false);
          handleVehicleSelect(vehicle);
        });
      } else {
        setIsScanning(false);
        handleVehicleSelect(vehicle);
      }
    } else {
      setScannerError("Vehicle not found or unavailable. Please try again.");
      setTimeout(() => setScannerError(null), 3000);
    }
  };

  // Defect Photos Handler
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setNewDefectPhotos(prev => [...prev, base64String]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = (index: number) => {
    setNewDefectPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleReportDefect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || !currentUser) return;

    setSubmittingDefect(true);
    try {
      await api.addDefectReport({
        vehicleId: selectedVehicle.id,
        driverId: currentUser.id,
        category: newDefectCategory,
        description: newDefectDescription,
        urgency: newDefectUrgency,
        photos: newDefectPhotos,
        location: 'Reported at Shift Start'
      });

      // Reset form
      setNewDefectDescription('');
      setNewDefectPhotos([]);
      setShowDefectModal(false);

      // Refresh defects
      const defects = await api.getVehicleDefects(selectedVehicle.id);
      setActiveDefects(defects);
    } catch (err) {
      console.error("Failed to report defect:", err);
      alert("Failed to report defect. Please try again.");
    } finally {
      setSubmittingDefect(false);
    }
  };

  const handleVehicleSelect = async (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setCurrentStep(2);
    setError(null);
    setValidationMsg(null);

    // Fetch active defects
    setLoadingDefects(true);
    try {
      const defects = await api.getVehicleDefects(vehicle.id);
      setActiveDefects(defects);
    } catch (err) {
      console.error("Failed to load defects", err);
    } finally {
      setLoadingDefects(false);
    }
  };

  const handleStartShift = async () => {
    if (!selectedVehicle || !currentUser) return;

    // Validation
    if (selectedVehicle.vehicleType === VehicleType.EV && (!startOdo || !startCharge)) {
      setError("Please enter both Odometer and Charge %");
      return;
    }
    if (!startOdo) {
      setError("Please enter starting odometer");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const startOdometer = parseFloat(startOdo);
      const startChargePercent = startCharge ? parseFloat(startCharge) : undefined;

      // Start shift without PIN (User already logged in)
      const result = await api.startShift({
        driverId: currentUser.id,
        vehicleId: selectedVehicle.id,
        startOdometer,
        startChargePercent
      });

      shiftStore.setActiveShift({
        shiftId: result.id,
        driverId: currentUser.id,
        driverName: `${currentUser.firstName} ${currentUser.surname}`,
        vehicleId: selectedVehicle.id,
        vehicle: {
          id: selectedVehicle.id,
          registration: selectedVehicle.registration,
          alias: selectedVehicle.alias,
          vehicleType: selectedVehicle.vehicleType,
        },
        startAt: new Date().toISOString(),
        startOdo: startOdometer,
        startChargePercent: startChargePercent,
      });

      onShiftStarted();
    } catch (err: any) {
      console.error('Failed to start shift:', err);
      setError(err.message || "Failed to start shift");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
      setStartOdo('');
      setStartCharge('');
    } else {
      onBack();
    }
  };

  if (!currentUser) return <div className="p-6 text-center">Please log in first.</div>;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader className="animate-spin h-12 w-12 text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header title="Start Shift" />
      <main className="max-w-xl mx-auto p-4 sm:p-6">

        {/* Step 1: Select Vehicle */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {!isScanning && (
              <button
                onClick={() => setIsScanning(true)}
                className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg flex flex-col items-center justify-center transition-transform hover:scale-105"
              >
                <ScanLine size={48} className="mb-2" />
                <span className="text-xl font-bold">Scan Vehicle QR Code</span>
              </button>
            )}

            {isScanning && (
              <Card className="text-center relative">
                <h3 className="font-bold text-lg mb-2">Scanning...</h3>
                <div id="reader" className="w-full h-64 bg-black rounded-lg overflow-hidden"></div>
                <button
                  onClick={() => setIsScanning(false)}
                  className="mt-4 px-4 py-2 bg-gray-200 rounded-lg text-gray-800 font-semibold"
                >
                  Cancel Scan
                </button>
                {scannerError && <div className="mt-2 text-red-500 font-bold bg-red-50 p-2 rounded">{scannerError}</div>}
              </Card>
            )}

            {/* Manual Selection */}
            {!isScanning && (
              <Card>
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                  <Car className="mr-2" /> Manual Selection
                </h3>

                {/* Search */}
                <div className="mb-4 relative">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search vehicle..."
                    value={vehicleSearch}
                    onChange={(e) => setVehicleSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {filteredVehicles.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No vehicles found.</p>
                  ) : (
                    filteredVehicles.map(v => (
                      <button
                        key={v.id}
                        onClick={() => handleVehicleSelect(v)}
                        className="w-full text-left p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50 transition flex justify-between items-center"
                      >
                        <div>
                          <p className="font-bold text-gray-900">{v.registration}</p>
                          <p className="text-xs text-gray-500">{v.make} {v.model}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${v.vehicleType === 'EV' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {v.vehicleType}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </Card>
            )}

            <button onClick={onBack} className="w-full py-3 text-gray-600 font-semibold">
              Back to Dashboard
            </button>
          </div>
        )}

        {/* Step 2: Confirm & Start */}
        {currentStep === 2 && selectedVehicle && (
          <Card>
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Start Shift</h2>

            <div className="bg-blue-50 p-4 rounded-lg mb-6 space-y-2">
              <div className="flex items-center">
                <UserIcon className="w-5 h-5 text-blue-600 mr-2" />
                <span className="font-semibold text-gray-700">Driver:</span>
                <span className="ml-2 text-gray-900">{currentUser.firstName} {currentUser.surname}</span>
              </div>
              <div className="flex items-center">
                <Car className="w-5 h-5 text-blue-600 mr-2" />
                <span className="font-semibold text-gray-700">Vehicle:</span>
                <span className="ml-2 text-gray-900">{selectedVehicle.registration}</span>
                <span className="ml-2 text-xs text-gray-500">({selectedVehicle.make} {selectedVehicle.model})</span>
              </div>
            </div>

            {/* Defect Review Section */}
            <div className="mb-6 border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                <h3 className="font-bold text-gray-700">Reported Defects</h3>
                <button
                  onClick={() => setShowDefectModal(true)}
                  className="text-sm bg-red-100 text-red-700 px-3 py-1 rounded-md font-medium hover:bg-red-200"
                >
                  + Report Defect
                </button>
              </div>

              {loadingDefects ? (
                <div className="p-4 text-center text-gray-500">Loading defects...</div>
              ) : activeDefects.length === 0 ? (
                <div className="p-6 text-center text-gray-500 bg-white">
                  <span className="block text-green-500 font-bold mb-1">✓ No Active Defects</span>
                  <span className="text-xs">Vehicle is reported as healthy.</span>
                </div>
              ) : (
                <div className="bg-white max-h-48 overflow-y-auto">
                  {activeDefects.map(defect => (
                    <div key={defect.id} className="p-3 border-b last:border-0 flex items-start space-x-3">
                      <div className={`p-2 rounded-full ${defect.urgency === DefectUrgency.Critical ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'}`}>
                        <Info size={16} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <span className="font-semibold text-gray-800">{defect.category}</span>
                          <span className="text-xs text-gray-500">{new Date(defect.reportedDateTime).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">{defect.description}</p>
                        {defect.photos && defect.photos.length > 0 && (
                          <div className="mt-1 text-xs text-blue-600 flex items-center">
                            <Camera size={12} className="mr-1" /> {defect.photos.length} photo(s)
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Current Odometer (km) *
                </label>
                <input
                  type="number"
                  value={startOdo}
                  onChange={(e) => setStartOdo(e.target.value)}
                  placeholder="e.g. 10500"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg"
                />
              </div>

              {selectedVehicle.vehicleType === 'EV' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Battery Charge (%) *
                  </label>
                  <input
                    type="number"
                    min="0" max="100"
                    value={startCharge}
                    onChange={(e) => setStartCharge(e.target.value)}
                    placeholder="e.g. 85"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleBack}
                className="py-3 bg-gray-200 text-gray-800 rounded-lg font-bold hover:bg-gray-300 transition"
              >
                Back
              </button>
              <button
                onClick={handleStartShift}
                disabled={submitting}
                className="py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition flex justify-center items-center disabled:opacity-50"
              >
                {submitting ? <Loader className="animate-spin" /> : "Start Shift"}
              </button>
            </div>
          </Card>
        )}

        {/* Report Defect Modal */}
        {showDefectModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white">
                <h3 className="text-lg font-bold">Report New Defect</h3>
                <button onClick={() => setShowDefectModal(false)} className="text-gray-500 hover:text-gray-700">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleReportDefect} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={newDefectCategory}
                    onChange={(e) => setNewDefectCategory(e.target.value as DefectCategory)}
                    className="w-full border p-2 rounded-lg"
                  >
                    {Object.values(DefectCategory).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Urgency</label>
                  <select
                    value={newDefectUrgency}
                    onChange={(e) => setNewDefectUrgency(e.target.value as DefectUrgency)}
                    className="w-full border p-2 rounded-lg"
                  >
                    {Object.values(DefectUrgency).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={newDefectDescription}
                    onChange={(e) => setNewDefectDescription(e.target.value)}
                    className="w-full border p-2 rounded-lg h-24"
                    placeholder="Describe the issue... (e.g. Broken windscreen driver side)"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Photos (Optional)</label>
                  <div className="flex items-center space-x-2 overflow-x-auto py-2">
                    {newDefectPhotos.map((photo, index) => (
                      <div key={index} className="relative w-16 h-16 flex-shrink-0">
                        <img src={photo} alt="Defect" className="w-full h-full object-cover rounded" />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <label className="w-16 h-16 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center text-gray-500 cursor-pointer hover:border-blue-500 hover:text-blue-500">
                      <Camera size={20} />
                      <span className="text-[10px]">Add</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingDefect}
                  className="w-full py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {submittingDefect ? 'Reporting...' : 'Submit Defect Report'}
                </button>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default ShiftStart;
