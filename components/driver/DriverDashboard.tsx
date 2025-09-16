import React, { useState, useContext, useEffect, useRef, Component, ErrorInfo } from 'react';
import { PlusCircle, AlertTriangle, BarChart2, CheckCircle, XCircle, Bolt, Route, Fuel, ScanLine, Car, Check, DollarSign, Shield, Trophy, Target, Camera, MapPin, Clock, Wrench, Upload, X } from 'lucide-react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { UserContext } from '../../contexts/UserContext';
import { Shift, ShiftStatus, Vehicle, VehicleType, User, LeaderboardEntry, DriverIncidentSummary, DefectReport, DefectCategory, DefectUrgency } from '../../types';
import api from '../../services/mockApi';

class ErrorBoundary extends Component<
  { children: React.ReactNode; onError?: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('QR Scanner Error:', error, errorInfo);
    if (this.props.onError) {
      this.props.onError();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-100">
          <Header title="Start New Shift" />
          <main className="max-w-md mx-auto p-6">
            <Card>
              <div className="text-center">
                <XCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
                <h3 className="text-xl font-semibold text-gray-800">Something went wrong</h3>
                <p className="text-gray-600 mt-2">The QR scanner encountered an error. Please try again.</p>
                <button
                  onClick={() => {
                    this.setState({ hasError: false });
                    if (this.props.onError) {
                      this.props.onError();
                    }
                  }}
                  className="mt-6 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
                >
                  Try Again
                </button>
              </div>
            </Card>
          </main>
        </div>
      );
    }

    return this.props.children;
  }
}

const DriverDashboard: React.FC = () => {
  const { currentUser } = useContext(UserContext);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showStartShift, setShowStartShift] = useState(false);
  const [showReportDefect, setShowReportDefect] = useState(false);
  const [showMyStats, setShowMyStats] = useState(false);
  const [showLogCharge, setShowLogCharge] = useState(false);
  const [showLogRefuel, setShowLogRefuel] = useState(false);
  const [showEndShift, setShowEndShift] = useState(false);
  const [dashboardKey, setDashboardKey] = useState(0); // Used to force a refresh

  useEffect(() => {
    const fetchData = async () => {
      if(currentUser) {
        const shifts = await api.getDriverShifts(currentUser.id);
        const currentActiveShift = shifts.find(s => s.status === ShiftStatus.Active) || null;
        setActiveShift(currentActiveShift);
        
        const vehicleData = await api.getVehicles();
        setVehicles(vehicleData);
      }
    };
    fetchData();
  }, [currentUser, dashboardKey]);

  const activeVehicle = vehicles.find(v => v.id === activeShift?.vehicleId);

  const MainButton = ({ icon, text, onClick, color }: { icon: React.ReactNode, text: string, onClick: () => void, color: string }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center p-6 rounded-lg shadow-lg text-white font-semibold transform transition hover:scale-105 ${color}`}>
      {icon}
      <span className="mt-2 text-lg">{text}</span>
    </button>
  );

  if (!currentUser) return null;
  
  if (showStartShift) return (
    <ErrorBoundary onError={() => setShowStartShift(false)}>
      <StartShiftFlow onBack={() => setShowStartShift(false)} vehicles={vehicles} currentUser={currentUser} onShiftStarted={() => {
          setShowStartShift(false);
          setDashboardKey(k => k + 1);
      }} />
    </ErrorBoundary>
  );
  if (showReportDefect) return <ReportDefectForm onBack={() => setShowReportDefect(false)} />;
  if (showMyStats) return <MyStats onBack={() => setShowMyStats(false)} currentUser={currentUser} />;
  if (showLogCharge) return <LogChargeForm onBack={() => setShowLogCharge(false)} activeVehicle={activeVehicle} />;
  if (showLogRefuel) return <LogRefuelForm onBack={() => setShowLogRefuel(false)} activeVehicle={activeVehicle} />;
  if (showEndShift) return <EndShiftFlow onBack={() => setShowEndShift(false)} activeShift={activeShift} activeVehicle={activeVehicle} currentUser={currentUser} onShiftEnded={() => {
      setShowEndShift(false);
      setDashboardKey(k => k + 1);
  }} />;


  return (
    <div className="min-h-screen bg-gray-100">
      <Header title="Driver Dashboard" />
      <main className="max-w-4xl mx-auto p-6">
        <Card className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Shift Status</h2>
          {activeShift ? (
            <div className="flex items-center bg-green-100 text-green-800 p-4 rounded-lg">
              <CheckCircle className="h-6 w-6 mr-3" />
              <div>
                <p className="font-bold">Shift Active</p>
                <p>Started at: {activeShift.startTime.toLocaleTimeString()}</p>
                 {activeVehicle?.vehicleType === VehicleType.EV ? (
                     <p>Start SoC: {activeShift.startChargePercent}%</p>
                ) : (
                     <p>Odometer: {activeShift.startOdometer} km</p>
                )}
              </div>
            </div>
          ) : (
             <div className="flex items-center bg-yellow-100 text-yellow-800 p-4 rounded-lg">
              <XCircle className="h-6 w-6 mr-3" />
              <div>
                <p className="font-bold">No Active Shift</p>
                <p>Click "Start New Shift" to begin.</p>
              </div>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <MainButton 
            icon={<PlusCircle size={48} />}
            text={activeShift ? "End Shift" : "Start New Shift"}
            onClick={() => {
              if (activeShift) {
                setShowEndShift(true);
              } else {
                setShowStartShift(true);
              }
            }}
            color={activeShift ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"}
          />
          {activeVehicle?.vehicleType === VehicleType.EV ? (
            <MainButton
              icon={<Bolt size={48} />}
              text="Log Charge"
              onClick={() => setShowLogCharge(true)}
              color="bg-teal-500 hover:bg-teal-600"
            />
          ) : (
            <MainButton
              icon={<Fuel size={48} />}
              text="Log Refuel"
              onClick={() => setShowLogRefuel(true)}
              color="bg-orange-500 hover:bg-orange-600"
            />
          )}
          <MainButton
            icon={<AlertTriangle size={48} />}
            text="Report a Fault"
            onClick={() => setShowReportDefect(true)}
            color="bg-yellow-500 hover:bg-yellow-600"
          />
          <MainButton
            icon={<BarChart2 size={48} />}
            text="View My Stats"
            onClick={() => setShowMyStats(true)}
            color="bg-purple-500 hover:bg-purple-600"
          />
        </div>
      </main>
    </div>
  );
};

const StartShiftFlow = ({ onBack, onShiftStarted, vehicles, currentUser }: { onBack: () => void; onShiftStarted: () => void; vehicles: Vehicle[], currentUser: User }) => {
    const [step, setStep] = useState<'scan' | 'confirm' | 'error' | 'submitting'>('scan');
    const [scannedVehicle, setScannedVehicle] = useState<Vehicle | null>(null);
    const [startValue, setStartValue] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [lastShiftEndOdometer, setLastShiftEndOdometer] = useState<number | null>(null);
    const [validationMessage, setValidationMessage] = useState('');
    const scannerRef = useRef<any>(null);

    useEffect(() => {
        if (step !== 'scan') {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch((err: any) => console.error("Failed to stop scanner on step change", err));
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

        const initializeQRScanner = async () => {
            try {
                // Load Html5Qrcode library from CDN (more reliable)
                await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');

                // Wait a bit for the library to initialize
                await new Promise(resolve => setTimeout(resolve, 200));

                const Html5Qrcode = (window as any).Html5Qrcode;
                if (!Html5Qrcode) {
                    throw new Error("Html5Qrcode library not available after loading");
                }

                console.log("Html5Qrcode library loaded successfully from CDN");

                // Wait a bit for DOM to be ready and check if element exists
                await new Promise(resolve => setTimeout(resolve, 100));

                const qrContainer = document.getElementById('qr-reader');
                if (!qrContainer) {
                    throw new Error("QR scanner container element not found in DOM");
                }

                const html5QrCode = new Html5Qrcode("qr-reader");
                scannerRef.current = html5QrCode;

                const qrCodeSuccessCallback = (decodedText: string) => {
                    console.log("QR code scanned:", decodedText);

                    // Stop the scanner first to prevent multiple scans
                    if (scannerRef.current && scannerRef.current.isScanning) {
                        scannerRef.current.stop().catch((err: any) => console.error("Failed to stop scanner", err));
                    }

                    const foundVehicle = vehicles.find(v => v.id === decodedText);
                    if (foundVehicle) {
                        // Batch state updates
                        setTimeout(async () => {
                            setScannedVehicle(foundVehicle);
                            setErrorMessage('');

                            // Get last completed shift for this vehicle
                            try {
                                const lastShift = await api.getLastCompletedShift(foundVehicle.id);
                                if (lastShift && lastShift.endOdometer && foundVehicle.vehicleType === VehicleType.ICE) {
                                    setLastShiftEndOdometer(lastShift.endOdometer);
                                    setValidationMessage(`Last shift ended at ${lastShift.endOdometer.toLocaleString()} km`);
                                } else {
                                    setLastShiftEndOdometer(null);
                                    setValidationMessage('');
                                }
                            } catch (error) {
                                console.error("Failed to get last shift:", error);
                                setLastShiftEndOdometer(null);
                                setValidationMessage('');
                            }

                            setStep('confirm');
                        }, 100);
                    } else {
                        setTimeout(() => {
                            setErrorMessage(`Vehicle with ID "${decodedText}" not found. Please scan a valid QR code.`);
                            setStep('error');
                        }, 100);
                    }
                };

                const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

                await html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback, undefined);

            } catch (err: any) {
                console.error("QR Scanner initialization error:", err);
                const errorMsg = err?.message || err?.toString() || "Unknown error";

                if (errorMsg.includes("NotAllowedError") || errorMsg.includes("permission")) {
                    setErrorMessage("Camera permission denied. Please allow camera access and try again.");
                } else if (errorMsg.includes("script") || errorMsg.includes("library")) {
                    setErrorMessage("Failed to load QR scanner. Please refresh the page and try again.");
                } else if (errorMsg.includes("qr-reader") || errorMsg.includes("not found")) {
                    setErrorMessage("QR scanner setup failed. Please try again.");
                } else {
                    setErrorMessage("Could not start camera. Please ensure permissions are granted and try again.");
                }
                setStep('error');
            }
        };

        initializeQRScanner();

        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch((err: any) => console.error("Failed to stop scanner on cleanup", err));
            }
        };
    }, [step, vehicles]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log("Form submitted with:", { scannedVehicle: scannedVehicle?.id, startValue });

        if (!scannedVehicle || !startValue) {
            console.log("Missing data - vehicle or start value");
            return;
        }

        // Final validation for ICE vehicles
        if (scannedVehicle.vehicleType === VehicleType.ICE && lastShiftEndOdometer !== null) {
            const enteredOdometer = parseInt(startValue, 10);
            const difference = Math.abs(enteredOdometer - lastShiftEndOdometer);

            if (difference > 5) {
                const confirmed = confirm(`The odometer reading (${enteredOdometer.toLocaleString()} km) differs by ${difference} km from the last shift end (${lastShiftEndOdometer.toLocaleString()} km). Do you want to continue anyway?`);
                if (!confirmed) {
                    return;
                }
            }
        }

        setStep('submitting');

        const startData = {
            driverId: currentUser.id,
            vehicleId: scannedVehicle.id,
            startOdometer: scannedVehicle.vehicleType === VehicleType.ICE ? parseInt(startValue, 10) : undefined,
            startChargePercent: scannedVehicle.vehicleType === VehicleType.EV ? parseInt(startValue, 10) : undefined
        };

        console.log("Starting shift with data:", startData);

        try {
            await api.startShift(startData);
            console.log("Shift started successfully");
            onShiftStarted();
        } catch(err: any) {
            console.error("Shift start failed:", err);
            setErrorMessage(err.message || "Failed to start shift.");
            setStep('error');
        }
    };
    
    const renderContent = () => {
        switch (step) {
            case 'scan':
                return (
                    <div className="text-center">
                        <ScanLine className="mx-auto h-16 w-16 text-blue-500 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-800">Scan Vehicle QR Code</h3>
                        <p className="text-gray-600 mt-2">Point your camera at the QR code inside the vehicle to begin your shift.</p>
                        <div id="qr-reader" className="w-full max-w-sm mx-auto mt-4 border-2 border-dashed rounded-lg overflow-hidden"></div>
                    </div>
                );
            case 'confirm':
                 if (!scannedVehicle) return null;
                 const isEV = scannedVehicle.vehicleType === VehicleType.EV;
                 return (
                    <form onSubmit={handleSubmit}>
                        <div className="text-center">
                            <Car className="mx-auto h-12 w-12 text-green-500" />
                            <h3 className="text-2xl font-bold mt-2">{scannedVehicle.make} {scannedVehicle.model}</h3>
                            <p className="text-lg text-gray-600 font-medium">{scannedVehicle.registration}</p>
                        </div>
                        <div className="mt-6">
                            <label htmlFor="startValue" className="block text-sm font-medium text-gray-700">{isEV ? 'Starting Charge (%)' : 'Starting Odometer (km)'}</label>
                            <input
                                type="number"
                                id="startValue"
                                value={startValue}
                                onChange={e => {
                                    console.log("Input changed to:", e.target.value);
                                    const value = e.target.value;
                                    setStartValue(value);

                                    // Validate odometer against last shift for ICE vehicles
                                    if (scannedVehicle?.vehicleType === VehicleType.ICE && lastShiftEndOdometer !== null && value) {
                                        const enteredOdometer = parseInt(value, 10);
                                        const difference = Math.abs(enteredOdometer - lastShiftEndOdometer);

                                        if (difference > 5) {
                                            if (enteredOdometer < lastShiftEndOdometer) {
                                                setValidationMessage(`⚠️ Odometer reading (${enteredOdometer.toLocaleString()} km) is ${difference} km less than last shift end (${lastShiftEndOdometer.toLocaleString()} km). This seems incorrect.`);
                                            } else {
                                                setValidationMessage(`⚠️ Odometer reading (${enteredOdometer.toLocaleString()} km) is ${difference} km more than last shift end (${lastShiftEndOdometer.toLocaleString()} km). Please verify this is correct.`);
                                            }
                                        } else {
                                            setValidationMessage(`✅ Odometer reading looks correct (difference: ${difference} km)`);
                                        }
                                    }
                                }}
                                placeholder={isEV ? 'e.g., 95' : `e.g., ${scannedVehicle.currentOdometer}`}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                required
                            />
                            {validationMessage && (
                                <div className={`mt-2 p-2 rounded-md text-sm ${
                                    validationMessage.includes('✅')
                                        ? 'bg-green-50 text-green-800 border border-green-200'
                                        : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                                }`}>
                                    {validationMessage}
                                </div>
                            )}
                        </div>
                        <div className="mt-8 flex justify-between items-center gap-4">
                            <button type="button" onClick={() => setStep('scan')} className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition">Scan Again</button>
                            <button
                                type="submit"
                                className={`w-full font-bold py-3 px-4 rounded-lg transition ${!startValue ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white`}
                                disabled={!startValue}
                                onClick={() => console.log("Button clicked, startValue:", startValue)}
                            >
                                <Check className="inline h-5 w-5 mr-2"/>
                                Start Shift
                            </button>
                        </div>
                    </form>
                 );
             case 'error':
                 return (
                     <div className="text-center">
                         <XCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
                         <h3 className="text-xl font-semibold text-gray-800">Error</h3>
                         <p className="text-red-600 mt-2 bg-red-100 p-3 rounded-md">{errorMessage}</p>
                         <button onClick={() => setStep('scan')} className="mt-6 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Try Scanning Again</button>
                     </div>
                 );
            case 'submitting':
                return <p className="text-center text-lg">Starting your shift...</p>;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Start New Shift" />
            <main className="max-w-md mx-auto p-6">
                <Card>
                    {renderContent()}
                </Card>
                 <div className="text-center mt-4">
                    <button onClick={onBack} className="text-gray-600 hover:text-gray-800 font-semibold">Cancel</button>
                 </div>
            </main>
        </div>
    );
}

const EndShiftFlow = ({ onBack, onShiftEnded, activeShift, activeVehicle, currentUser }: {
    onBack: () => void;
    onShiftEnded: () => void;
    activeShift: Shift | null;
    activeVehicle: Vehicle | undefined;
    currentUser: User
}) => {
    const [endValue, setEndValue] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    if (!activeShift || !activeVehicle) {
        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="End Shift" />
                <main className="max-w-md mx-auto p-6">
                    <Card>
                        <div className="text-center">
                            <XCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
                            <h3 className="text-xl font-semibold text-gray-800">Error</h3>
                            <p className="text-red-600 mt-2">No active shift found.</p>
                            <button onClick={onBack} className="mt-6 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Back to Dashboard</button>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    const isEV = activeVehicle.vehicleType === VehicleType.EV;
    const startValue = isEV ? activeShift.startChargePercent : activeShift.startOdometer;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!endValue) return;

        setIsSubmitting(true);
        setErrorMessage('');

        const endData = {
            driverId: currentUser.id,
            endOdometer: isEV ? undefined : parseInt(endValue, 10),
            endChargePercent: isEV ? parseInt(endValue, 10) : undefined
        };

        try {
            await api.endShift(endData);
            onShiftEnded();
        } catch(err: any) {
            setErrorMessage(err.message || "Failed to end shift.");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="End Shift" />
            <main className="max-w-md mx-auto p-6">
                <Card>
                    <form onSubmit={handleSubmit}>
                        <div className="text-center">
                            <Car className="mx-auto h-12 w-12 text-red-500" />
                            <h3 className="text-2xl font-bold mt-2">{activeVehicle.make} {activeVehicle.model}</h3>
                            <p className="text-lg text-gray-600 font-medium">{activeVehicle.registration}</p>
                        </div>

                        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                            <h4 className="font-semibold text-gray-800 mb-2">Shift Summary</h4>
                            <div className="space-y-1 text-sm">
                                <p><span className="text-gray-600">Started:</span> {activeShift.startTime.toLocaleString()}</p>
                                <p><span className="text-gray-600">{isEV ? 'Start Charge:' : 'Start Odometer:'}</span> {startValue}{isEV ? '%' : ' km'}</p>
                            </div>
                        </div>

                        <div className="mt-6">
                            <label htmlFor="endValue" className="block text-sm font-medium text-gray-700">
                                {isEV ? 'Ending Charge (%)' : 'Ending Odometer (km)'}
                            </label>
                            <input
                                type="number"
                                id="endValue"
                                value={endValue}
                                onChange={e => setEndValue(e.target.value)}
                                placeholder={isEV ? 'e.g., 45' : 'e.g., 45750'}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
                                required
                            />
                        </div>

                        {errorMessage && (
                            <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                                {errorMessage}
                            </div>
                        )}

                        <div className="mt-8 flex justify-between items-center gap-4">
                            <button type="button" onClick={onBack} className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition">Cancel</button>
                            <button type="submit" className="w-full bg-red-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-600 transition disabled:bg-gray-400" disabled={!endValue || isSubmitting}>
                                <Check className="inline h-5 w-5 mr-2"/>
                                {isSubmitting ? 'Ending Shift...' : 'End Shift'}
                            </button>
                        </div>
                    </form>
                </Card>
            </main>
        </div>
    );
}

const ReportDefectForm = ({ onBack }: {onBack: () => void}) => {
    const { currentUser } = useContext(UserContext);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [activeVehicle, setActiveVehicle] = useState<Vehicle | null>(null);
    const [existingDefects, setExistingDefects] = useState<DefectReport[]>([]);
    const [similarDefects, setSimilarDefects] = useState<DefectReport[]>([]);
    const [loading, setLoading] = useState(false);
    const [showSimilar, setShowSimilar] = useState(false);
    const [photos, setPhotos] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        vehicleId: '',
        category: DefectCategory.Other,
        urgency: DefectUrgency.Medium,
        description: '',
        location: '',
        notes: ''
    });

    useEffect(() => {
        const fetchData = async () => {
            if (!currentUser) return;

            const [vehicleData, driverActiveVehicle] = await Promise.all([
                api.getVehicles(),
                api.getDriverActiveVehicle(currentUser.id)
            ]);

            setVehicles(vehicleData);
            setActiveVehicle(driverActiveVehicle);

            // Auto-select the active vehicle if driver has one
            if (driverActiveVehicle) {
                setFormData(prev => ({ ...prev, vehicleId: driverActiveVehicle.id }));
            }
        };
        fetchData();
    }, [currentUser]);

    useEffect(() => {
        if (formData.vehicleId) {
            const fetchExistingDefects = async () => {
                const defects = await api.getVehicleDefects(formData.vehicleId);
                setExistingDefects(defects);
            };
            fetchExistingDefects();
        }
    }, [formData.vehicleId]);

    const checkForSimilar = async () => {
        if (formData.vehicleId && formData.category && formData.description.length > 10) {
            const similar = await api.checkSimilarDefects(formData.vehicleId, formData.category, formData.description);
            setSimilarDefects(similar);
            setShowSimilar(similar.length > 0);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (formData.description.length > 10) {
                checkForSimilar();
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [formData.description, formData.category, formData.vehicleId]);

    const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;

        Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (e.target?.result) {
                        setPhotos(prev => [...prev, e.target!.result as string]);
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    };

    const removePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const takePhoto = () => {
        if (fileInputRef.current) {
            fileInputRef.current.accept = 'image/*';
            fileInputRef.current.capture = 'environment'; // Use rear camera
            fileInputRef.current.click();
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;

        setLoading(true);
        try {
            await api.addDefectReport({
                vehicleId: formData.vehicleId,
                driverId: currentUser.id,
                category: formData.category,
                description: formData.description,
                urgency: formData.urgency,
                location: formData.location || undefined,
                notes: formData.notes || undefined,
                photos: photos.length > 0 ? photos : undefined
            });

            alert('Defect report submitted successfully! The maintenance team will review it shortly.');
            onBack();
        } catch (err) {
            alert('Failed to submit defect report. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const getUrgencyColor = (urgency: DefectUrgency) => {
        switch (urgency) {
            case DefectUrgency.Critical: return 'text-red-600 bg-red-50 border-red-200';
            case DefectUrgency.High: return 'text-orange-600 bg-orange-50 border-orange-200';
            case DefectUrgency.Medium: return 'text-yellow-600 bg-yellow-50 border-yellow-200';
            case DefectUrgency.Low: return 'text-green-600 bg-green-50 border-green-200';
            default: return 'text-gray-600 bg-gray-50 border-gray-200';
        }
    };

    const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId);

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Report a Vehicle Fault" />
            <main className="max-w-4xl mx-auto p-6">
                <button onClick={onBack} className="mb-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                    ← Back to Dashboard
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Form */}
                    <div className="lg:col-span-2">
                        <Card>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Report New Defect</h2>
                                    <p className="text-gray-600">Describe any vehicle faults or issues you've discovered during your shift.</p>
                                </div>

                                {/* Vehicle Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Vehicle *
                                        {activeVehicle && (
                                            <span className="ml-2 text-sm text-green-600 font-normal">
                                                (Currently signed in)
                                            </span>
                                        )}
                                    </label>
                                    <select
                                        value={formData.vehicleId}
                                        onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        required
                                    >
                                        <option value="">Select vehicle...</option>
                                        {vehicles.map(vehicle => (
                                            <option key={vehicle.id} value={vehicle.id}>
                                                {vehicle.registration} - {vehicle.make} {vehicle.model}
                                                {activeVehicle?.id === vehicle.id ? ' (Active Shift)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {activeVehicle && (
                                        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                                            <div className="flex items-center text-green-700">
                                                <CheckCircle className="h-4 w-4 mr-1" />
                                                Auto-selected your current vehicle: <strong className="ml-1">
                                                    {activeVehicle.registration}
                                                </strong>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Category */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
                                        <select
                                            value={formData.category}
                                            onChange={(e) => setFormData({ ...formData, category: e.target.value as DefectCategory })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            {Object.values(DefectCategory).map(category => (
                                                <option key={category} value={category}>{category}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Urgency */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Urgency *</label>
                                        <select
                                            value={formData.urgency}
                                            onChange={(e) => setFormData({ ...formData, urgency: e.target.value as DefectUrgency })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            {Object.values(DefectUrgency).map(urgency => (
                                                <option key={urgency} value={urgency}>{urgency}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Location */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        <MapPin className="inline w-4 h-4 mr-1" />
                                        Location on Vehicle
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                        placeholder="e.g., Front left headlight, Dashboard, Rear door, etc."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Describe the issue in detail. Be specific about when it occurs, sounds, visual indicators, etc."
                                        rows={4}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        required
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Be specific to help avoid duplicate reports</p>
                                </div>

                                {/* Similar Defects Warning */}
                                {showSimilar && similarDefects.length > 0 && (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                        <div className="flex items-center mb-2">
                                            <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
                                            <h4 className="text-sm font-medium text-yellow-800">Similar Issues Found</h4>
                                        </div>
                                        <p className="text-sm text-yellow-700 mb-3">
                                            We found similar defects for this vehicle. Please check if your issue is already reported:
                                        </p>
                                        <div className="space-y-2">
                                            {similarDefects.map(defect => (
                                                <div key={defect.id} className="bg-white p-3 rounded border">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-xs font-medium text-gray-600">{defect.category}</span>
                                                        <span className={`text-xs px-2 py-1 rounded border ${getUrgencyColor(defect.urgency)}`}>
                                                            {defect.urgency}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-800">{defect.description}</p>
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        Reported {defect.reportedDateTime.toLocaleDateString()}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Notes */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
                                    <textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        placeholder="Any additional context, when it started, etc."
                                        rows={2}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                {/* Photo Attachment */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        <Camera className="inline w-4 h-4 mr-1" />
                                        Photos (Optional)
                                    </label>
                                    <div className="space-y-3">
                                        {/* Photo Upload Buttons */}
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={takePhoto}
                                                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                                            >
                                                <Camera className="h-4 w-4 mr-2" />
                                                Take Photo
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                                            >
                                                <Upload className="h-4 w-4 mr-2" />
                                                Upload Photo
                                            </button>
                                        </div>

                                        {/* Hidden File Input */}
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            multiple
                                            accept="image/*"
                                            onChange={handlePhotoUpload}
                                            className="hidden"
                                        />

                                        {/* Photo Preview Grid */}
                                        {photos.length > 0 && (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                {photos.map((photo, index) => (
                                                    <div key={index} className="relative group">
                                                        <img
                                                            src={photo}
                                                            alt={`Defect photo ${index + 1}`}
                                                            className="w-full h-24 object-cover rounded-lg border border-gray-200"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => removePhoto(index)}
                                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition opacity-0 group-hover:opacity-100"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <p className="text-xs text-gray-500">
                                            📸 Tip: Photos help maintenance teams understand the issue better
                                        </p>
                                    </div>
                                </div>

                                {/* Submit */}
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={loading || !formData.vehicleId || !formData.description}
                                        className={`px-6 py-3 rounded-lg font-medium transition ${
                                            loading || !formData.vehicleId || !formData.description
                                                ? 'bg-gray-400 cursor-not-allowed text-white'
                                                : 'bg-red-600 hover:bg-red-700 text-white'
                                        }`}
                                    >
                                        {loading ? 'Submitting...' : 'Report Defect'}
                                    </button>
                                </div>
                            </form>
                        </Card>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Existing Defects for Selected Vehicle */}
                        {selectedVehicle && existingDefects.length > 0 && (
                            <Card>
                                <div className="flex items-center mb-3">
                                    <Wrench className="h-5 w-5 text-orange-600 mr-2" />
                                    <h3 className="text-lg font-semibold text-gray-800">Known Issues</h3>
                                </div>
                                <p className="text-sm text-gray-600 mb-3">
                                    Current defects for {selectedVehicle.registration}:
                                </p>
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {existingDefects.slice(0, 5).map(defect => (
                                        <div key={defect.id} className="p-3 border rounded-lg">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-xs font-medium text-gray-600">{defect.category}</span>
                                                <span className={`text-xs px-2 py-1 rounded border ${getUrgencyColor(defect.urgency)}`}>
                                                    {defect.urgency}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-800 mb-1">{defect.description}</p>
                                            {defect.location && (
                                                <p className="text-xs text-gray-500 mb-1">📍 {defect.location}</p>
                                            )}
                                            <div className="flex justify-between text-xs text-gray-500">
                                                <span>{defect.reportedDateTime.toLocaleDateString()}</span>
                                                <span className="capitalize">{defect.status.toLowerCase()}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {existingDefects.length > 5 && (
                                        <p className="text-xs text-gray-500 text-center">
                                            ... and {existingDefects.length - 5} more
                                        </p>
                                    )}
                                </div>
                            </Card>
                        )}

                        {/* Urgency Guide */}
                        <Card>
                            <h3 className="text-lg font-semibold text-gray-800 mb-3">Urgency Guide</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center">
                                    <div className="w-3 h-3 bg-red-500 rounded mr-2"></div>
                                    <div>
                                        <strong>Critical:</strong> Safety risk, vehicle unsafe to drive
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-3 h-3 bg-orange-500 rounded mr-2"></div>
                                    <div>
                                        <strong>High:</strong> Affects vehicle operation significantly
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-3 h-3 bg-yellow-500 rounded mr-2"></div>
                                    <div>
                                        <strong>Medium:</strong> Minor operational impact
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-3 h-3 bg-green-500 rounded mr-2"></div>
                                    <div>
                                        <strong>Low:</strong> Cosmetic or comfort issue
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
}

const MyStats = ({ onBack, currentUser }: { onBack: () => void; currentUser: User | null }) => {
    const [stats, setStats] = useState<LeaderboardEntry | null>(null);
    const [incidentData, setIncidentData] = useState<DriverIncidentSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!currentUser) return;

        const fetchData = async () => {
            try {
                const [leaderboardData, incidentSummary] = await Promise.all([
                    api.getLeaderboard(),
                    api.getDriverIncidentSummary(currentUser.id)
                ]);

                const myStats = leaderboardData.find(e => e.driver.id === currentUser.id) || null;
                const myIncidents = incidentSummary.find(e => e.driverId === currentUser.id) || null;

                setStats(myStats);
                setIncidentData(myIncidents);
            } catch (err) {
                setError("Could not load your stats. Please try again later.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [currentUser]);

    const StatDisplay = ({ icon, title, value, subtitle }: { icon: React.ReactNode, title: string, value: string, subtitle?: string }) => (
        <div className="flex items-center bg-gray-100 p-4 rounded-lg">
            <div className="p-3 rounded-full bg-gray-200 mr-4">
                {icon}
            </div>
            <div>
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
                {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
            </div>
        </div>
    );

    const hasICEData = stats && (stats.totalICEKmDriven || 0) > 0;
    const hasEVData = stats && (stats.totalEVKmDriven || 0) > 0;

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="My Performance Stats" />
            <main className="max-w-4xl mx-auto p-6">
                 <button onClick={onBack} className="mb-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Back to Dashboard</button>
                <Card>
                    <h2 className="text-3xl font-bold text-gray-800 mb-6">My Performance Stats</h2>
                    {loading ? (
                        <p className="text-center text-gray-600">Loading your stats...</p>
                    ) : error ? (
                         <p className="text-red-500 text-center">{error}</p>
                    ) : stats ? (
                        <div className="space-y-6">
                            {/* Overall Stats */}
                            <div>
                                <h3 className="text-xl font-semibold text-gray-800 mb-3">Overall Performance</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                   <StatDisplay
                                       icon={<Route className="h-8 w-8 text-blue-500"/>}
                                       title="Total Distance Driven"
                                       value={`${stats.totalKmDriven.toLocaleString()} km`}
                                       subtitle="Across all vehicles"
                                   />
                                   <StatDisplay
                                       icon={<Car className="h-8 w-8 text-purple-500"/>}
                                       title="Vehicle Types Driven"
                                       value={`${hasICEData && hasEVData ? 'ICE & EV' : hasICEData ? 'ICE Only' : hasEVData ? 'EV Only' : 'None'}`}
                                       subtitle={hasICEData && hasEVData ? 'Multi-fleet experience' : ''}
                                   />
                                   {stats.overallEfficiencyScore && (
                                       <StatDisplay
                                           icon={stats.overallEfficiencyScore >= 100 ?
                                               <Trophy className="h-8 w-8 text-yellow-500"/> :
                                               <Target className="h-8 w-8 text-gray-500"/>}
                                           title="Overall Efficiency Score"
                                           value={`${stats.overallEfficiencyScore}/100`}
                                           subtitle={stats.overallEfficiencyScore >= 110 ? 'Excellent performance' :
                                                    stats.overallEfficiencyScore >= 100 ? 'Above baseline' :
                                                    stats.overallEfficiencyScore >= 90 ? 'Near baseline' : 'Below baseline'}
                                       />
                                   )}
                                </div>
                            </div>

                            {/* ICE Vehicle Stats */}
                            {hasICEData && (
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-800 mb-3">ICE Vehicle Performance</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <StatDisplay
                                            icon={<Fuel className="h-8 w-8 text-orange-500"/>}
                                            title="ICE Distance Driven"
                                            value={`${(stats.totalICEKmDriven || 0).toLocaleString()} km`}
                                            subtitle="Petrol/diesel vehicles"
                                        />
                                        <StatDisplay
                                            icon={<Fuel className="h-8 w-8 text-green-500"/>}
                                            title="Fuel Economy"
                                            value={stats.averageKmL ? `${stats.averageKmL.toFixed(2)} km/L` : 'N/A'}
                                            subtitle="Aggregated across ICE vehicles"
                                        />
                                        <StatDisplay
                                            icon={<Fuel className="h-8 w-8 text-blue-500"/>}
                                            title="Total Fuel Consumed"
                                            value={stats.totalFuelConsumed ? `${stats.totalFuelConsumed.toFixed(1)} L` : 'N/A'}
                                            subtitle="Including mid-shift refuels"
                                        />
                                        <StatDisplay
                                            icon={stats.iceEfficiencyScore && stats.iceEfficiencyScore >= 100 ?
                                                <Trophy className="h-8 w-8 text-yellow-500"/> :
                                                <Target className="h-8 w-8 text-gray-500"/>}
                                            title="ICE Efficiency Score"
                                            value={stats.iceEfficiencyScore ? `${stats.iceEfficiencyScore}/100` : 'N/A'}
                                            subtitle={stats.iceEfficiencyScore ?
                                                (stats.iceEfficiencyScore >= 110 ? 'Excellent vs baseline' :
                                                 stats.iceEfficiencyScore >= 100 ? 'Good vs baseline' :
                                                 stats.iceEfficiencyScore >= 90 ? 'Fair vs baseline' : 'Below baseline') :
                                                'Compared to vehicle baselines'}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* EV Stats */}
                            {hasEVData && (
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-800 mb-3">Electric Vehicle Performance</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <StatDisplay
                                            icon={<Bolt className="h-8 w-8 text-blue-500"/>}
                                            title="EV Distance Driven"
                                            value={`${(stats.totalEVKmDriven || 0).toLocaleString()} km`}
                                            subtitle="Electric vehicles"
                                        />
                                        <StatDisplay
                                            icon={<Bolt className="h-8 w-8 text-yellow-500"/>}
                                            title="Energy Efficiency"
                                            value={stats.averageKmPerKwh ? `${stats.averageKmPerKwh.toFixed(2)} km/kWh` : 'N/A'}
                                            subtitle="Aggregated across EVs"
                                        />
                                        <StatDisplay
                                            icon={<Bolt className="h-8 w-8 text-purple-500"/>}
                                            title="Total Energy Consumed"
                                            value={stats.totalEnergyConsumed ? `${stats.totalEnergyConsumed.toFixed(1)} kWh` : 'N/A'}
                                            subtitle="Including mid-shift charges"
                                        />
                                        <StatDisplay
                                            icon={stats.evEfficiencyScore && stats.evEfficiencyScore >= 100 ?
                                                <Trophy className="h-8 w-8 text-green-500"/> :
                                                <Target className="h-8 w-8 text-gray-500"/>}
                                            title="EV Efficiency Score"
                                            value={stats.evEfficiencyScore ? `${stats.evEfficiencyScore}/100` : 'N/A'}
                                            subtitle={stats.evEfficiencyScore ?
                                                (stats.evEfficiencyScore >= 110 ? 'Excellent vs baseline' :
                                                 stats.evEfficiencyScore >= 100 ? 'Good vs baseline' :
                                                 stats.evEfficiencyScore >= 90 ? 'Fair vs baseline' : 'Below baseline') :
                                                'Compared to vehicle baselines'}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Efficiency Comparison */}
                            {hasICEData && hasEVData && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-lg font-semibold text-blue-800">Multi-Fleet Performance</h4>
                                        {stats.overallEfficiencyScore && (
                                            <div className="flex items-center bg-white rounded-lg px-3 py-1 border border-blue-200">
                                                {stats.overallEfficiencyScore >= 100 ?
                                                    <Trophy className="h-5 w-5 text-yellow-500 mr-2"/> :
                                                    <Target className="h-5 w-5 text-blue-600 mr-2"/>}
                                                <span className="font-bold text-blue-800">
                                                    Overall Score: {stats.overallEfficiencyScore}/100
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-sm text-blue-700">
                                        You've driven both ICE and electric vehicles, demonstrating versatility across different powertrains.
                                        Your fuel economy of {stats.averageKmL?.toFixed(2) || 'N/A'} km/L and energy efficiency of {stats.averageKmPerKwh?.toFixed(2) || 'N/A'} km/kWh
                                        {stats.overallEfficiencyScore ? (
                                            stats.overallEfficiencyScore >= 110 ? ' show excellent performance across all vehicle types.' :
                                            stats.overallEfficiencyScore >= 100 ? ' show good performance compared to vehicle baselines.' :
                                            stats.overallEfficiencyScore >= 90 ? ' show fair performance with room for improvement.' :
                                            ' indicate areas for improvement in fuel efficiency.'
                                        ) : ' show your ability to optimize performance across vehicle types.'}
                                    </p>
                                </div>
                            )}

                            {/* Safety & Compliance Record */}
                            <div>
                                <h3 className="text-xl font-semibold text-gray-800 mb-3">Safety & Compliance Record</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <StatDisplay
                                        icon={<DollarSign className="h-8 w-8 text-red-500"/>}
                                        title="Traffic Fines"
                                        value={incidentData ? `${incidentData.totalFines}` : '0'}
                                        subtitle={incidentData?.totalFineAmount ? `Total: R${incidentData.totalFineAmount.toLocaleString()}` : 'No fines recorded'}
                                    />
                                    <StatDisplay
                                        icon={<Shield className="h-8 w-8 text-orange-500"/>}
                                        title="Vehicle Damage Incidents"
                                        value={incidentData ? `${incidentData.totalDamages}` : '0'}
                                        subtitle={incidentData?.totalDamagesCost ? `Total cost: R${incidentData.totalDamagesCost.toLocaleString()}` : 'No damage recorded'}
                                    />
                                </div>

                                {/* Safety Status */}
                                {incidentData && (
                                    <div className="mt-4">
                                        {incidentData.riskScore === 0 ? (
                                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                                <div className="flex items-center">
                                                    <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                                                    <h4 className="text-lg font-semibold text-green-800">Excellent Safety Record</h4>
                                                </div>
                                                <p className="text-sm text-green-700 mt-1">
                                                    No traffic fines or vehicle damage incidents recorded. Keep up the safe driving!
                                                </p>
                                            </div>
                                        ) : incidentData.riskScore < 30 ? (
                                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                                <div className="flex items-center">
                                                    <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
                                                    <h4 className="text-lg font-semibold text-yellow-800">Low Risk Profile</h4>
                                                </div>
                                                <p className="text-sm text-yellow-700 mt-1">
                                                    Risk Score: {incidentData.riskScore}/100. Minor incidents recorded but overall good safety record.
                                                    {incidentData.unpaidFines > 0 && ` You have ${incidentData.unpaidFines} unpaid fine(s) totaling R${incidentData.unpaidAmount.toLocaleString()}.`}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                                <div className="flex items-center">
                                                    <XCircle className="h-5 w-5 text-red-400 mr-2" />
                                                    <h4 className="text-lg font-semibold text-red-800">
                                                        {incidentData.needsTraining ? 'Training Required' : 'High Risk Profile'}
                                                    </h4>
                                                </div>
                                                <p className="text-sm text-red-700 mt-1">
                                                    Risk Score: {incidentData.riskScore}/100. Multiple incidents recorded require attention.
                                                    {incidentData.unpaidFines > 0 && ` You have ${incidentData.unpaidFines} unpaid fine(s) totaling R${incidentData.unpaidAmount.toLocaleString()}.`}
                                                    {incidentData.needsTraining && ' Please contact management regarding mandatory safety training.'}
                                                </p>
                                            </div>
                                        )}

                                        {/* Recent Incident */}
                                        {incidentData.lastIncidentDate && (
                                            <div className="mt-3 text-sm text-gray-600">
                                                Last incident: {new Date(incidentData.lastIncidentDate).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <AlertTriangle className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                            <p className="text-gray-600 text-lg">Not enough data for stats yet.</p>
                            <p className="text-gray-500">Complete a few shifts to see your performance metrics.</p>
                        </div>
                    )}
                </Card>
            </main>
        </div>
    );
};


const LogChargeForm = ({ onBack, activeVehicle }: { onBack: () => void; activeVehicle?: Vehicle }) => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [recommendation, setRecommendation] = useState('');
    const [loading, setLoading] = useState(false);
    const [showChecklist, setShowChecklist] = useState(false);
    const [checklistItems, setChecklistItems] = useState<{[key: string]: boolean}>({
        'charge_level': false,
        'tyre_pressure': false,
        'washer_fluid': false
    });

    useEffect(() => {
        api.getVehicles().then(allVehicles => {
            const evs = allVehicles.filter(v => v.vehicleType === VehicleType.EV);
            setVehicles(evs);
            // Prioritize active vehicle if it's an EV, otherwise use first available
            if (activeVehicle && activeVehicle.vehicleType === VehicleType.EV) {
                setSelectedVehicleId(activeVehicle.id);
            } else if (evs.length > 0) {
                setSelectedVehicleId(evs[0].id);
            }
        });
    }, [activeVehicle]);

    useEffect(() => {
        if (!selectedVehicleId) return;

        const fetchRecommendation = async () => {
            setLoading(true);
            setRecommendation('');
            const stats = await api.getVehicleStats(selectedVehicleId);
            const vehicle = vehicles.find(v => v.id === selectedVehicleId);
            if (stats.avgDailyDistanceKm > 0 && vehicle && vehicle.batteryCapacityKwh) {
                const requiredKwh = stats.avgDailyDistanceKm * stats.avgEnergyConsumptionKwhPerKm;
                // Add a 15% buffer
                const recommendedChargePercent = Math.min(100, Math.ceil(((requiredKwh * 1.15) / vehicle.batteryCapacityKwh) * 100));
                
                setRecommendation(`Based on this vehicle's typical daily use (~${Math.round(stats.avgDailyDistanceKm)} km), we recommend charging to at least ${recommendedChargePercent}% for a full shift.`);
            } else {
                 setRecommendation("No usage data available. Recommend charging to 100%.");
            }
            setLoading(false);
        };

        fetchRecommendation();

    }, [selectedVehicleId, vehicles]);

    const handleStartCharging = () => {
        setShowChecklist(true);
    };

    const handleCompleteChecklist = () => {
        // All checklist items must be checked
        const allItemsChecked = Object.values(checklistItems).every(item => item);
        if (allItemsChecked) {
            alert('Charging session logged successfully! All safety checks completed.');
            onBack();
        }
    };

    if (showChecklist) {
        const allItemsChecked = Object.values(checklistItems).every(item => item);
        const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

        const checklistLabels = {
            'charge_level': 'Verified charge level and connected charging cable properly',
            'tyre_pressure': 'Checked tyre pressure and condition',
            'washer_fluid': 'Checked washer fluid level'
        };

        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="EV Charging Checklist" />
                <main className="max-w-md mx-auto p-6">
                    <Card>
                        <div className="text-center mb-6">
                            <Bolt className="mx-auto h-12 w-12 text-teal-500" />
                            <h3 className="text-2xl font-bold mt-2">Charging Safety Check</h3>
                            <p className="text-gray-600">
                                {selectedVehicle ? `${selectedVehicle.registration} - ${selectedVehicle.make} ${selectedVehicle.model}` : 'Electric Vehicle'}
                            </p>
                        </div>

                        <div className="space-y-4 mb-6">
                            {Object.entries(checklistLabels).map(([key, label]) => (
                                <label key={key} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        checked={checklistItems[key] || false}
                                        onChange={(e) => setChecklistItems(prev => ({
                                            ...prev,
                                            [key]: e.target.checked
                                        }))}
                                        className="mt-1 h-4 w-4 text-teal-600 border-gray-300 rounded"
                                    />
                                    <span className="text-sm text-gray-700 leading-5">{label}</span>
                                </label>
                            ))}
                        </div>

                        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-6">
                            <div className="flex">
                                <Bolt className="h-5 w-5 text-teal-400 mr-2 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-medium text-teal-800">Charging Safety</h4>
                                    <p className="text-sm text-teal-700 mt-1">
                                        Complete all safety checks before and during charging. Report any charging issues immediately.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center gap-4">
                            <button
                                type="button"
                                onClick={() => setShowChecklist(false)}
                                className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={handleCompleteChecklist}
                                disabled={!allItemsChecked}
                                className={`w-full font-bold py-3 px-4 rounded-lg transition ${
                                    !allItemsChecked
                                        ? 'bg-gray-400 cursor-not-allowed text-white'
                                        : 'bg-teal-500 hover:bg-teal-600 text-white'
                                }`}
                            >
                                <Check className="inline h-5 w-5 mr-2"/>
                                Complete Charging
                            </button>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Log Charging Session" />
            <main className="max-w-4xl mx-auto p-6">
                <Card>
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Log EV Charge</h2>
                    {recommendation && (
                         <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-6" role="alert">
                            <p className="font-bold">Charging Recommendation</p>
                            <p>{loading ? "Calculating..." : recommendation}</p>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Vehicle</label>
                            <select
                                value={selectedVehicleId}
                                onChange={(e) => setSelectedVehicleId(e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                            >
                                {vehicles.map(vehicle => (
                                    <option key={vehicle.id} value={vehicle.id}>
                                        {vehicle.registration} - {vehicle.make} {vehicle.model}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-between items-center gap-4">
                            <button onClick={onBack} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                                Back to Dashboard
                            </button>
                            <button
                                onClick={handleStartCharging}
                                disabled={!selectedVehicleId}
                                className={`font-bold py-2 px-6 rounded-lg transition ${
                                    !selectedVehicleId
                                        ? 'bg-gray-400 cursor-not-allowed text-white'
                                        : 'bg-teal-500 hover:bg-teal-600 text-white'
                                }`}
                            >
                                <Bolt className="inline h-5 w-5 mr-2"/>
                                Start Charging Session
                            </button>
                        </div>
                    </div>
                </Card>
            </main>
        </div>
    );
};

const LogRefuelForm = ({ onBack, activeVehicle }: { onBack: () => void; activeVehicle?: Vehicle }) => {
    const [showChecklist, setShowChecklist] = useState(false);
    const [checklistItems, setChecklistItems] = useState<{[key: string]: boolean}>({
        'oil_level': false,
        'washer_fluid': false,
        'tyre_pressure': false,
        'fuel_level': false
    });
    const [refuelData, setRefuelData] = useState({
        odometer: '',
        litres: '',
        fuelCost: '',
        oilRequired: false,
        oilCost: '',
        notes: ''
    });

    // Ensure we have an active ICE vehicle
    if (!activeVehicle || activeVehicle.vehicleType !== VehicleType.ICE) {
        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="Log Refueling Session" />
                <main className="max-w-4xl mx-auto p-6">
                    <Card>
                        <div className="text-center">
                            <AlertTriangle className="mx-auto h-16 w-16 text-red-500 mb-4" />
                            <h3 className="text-xl font-semibold text-gray-800">No Active ICE Vehicle</h3>
                            <p className="text-red-600 mt-2">You must have an active ICE vehicle shift to log refueling.</p>
                            <button onClick={onBack} className="mt-6 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Back to Dashboard</button>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    const handleStartRefueling = () => {
        // Since button is disabled when validation fails, we can proceed directly to checklist
        setShowChecklist(true);
    };

    const handleCompleteChecklist = () => {
        const allItemsChecked = Object.values(checklistItems).every(item => item);
        if (allItemsChecked) {
            const totalCost = parseFloat(refuelData.fuelCost) + (refuelData.oilRequired ? parseFloat(refuelData.oilCost || '0') : 0);
            alert(`Refueling completed successfully!\n\nSummary:\n- Vehicle: ${activeVehicle?.registration}\n- Odometer: ${parseInt(refuelData.odometer).toLocaleString()} km\n- Fuel: ${refuelData.litres}L @ R${parseFloat(refuelData.fuelCost).toFixed(2)}\n- Oil: ${refuelData.oilRequired ? `Yes - R${parseFloat(refuelData.oilCost || '0').toFixed(2)}` : 'No'}\n- Total Cost: R${totalCost.toFixed(2)}`);
            onBack();
        }
    };

    const calculateTotalCost = () => {
        const fuelCost = parseFloat(refuelData.fuelCost || '0');
        const oilCost = refuelData.oilRequired ? parseFloat(refuelData.oilCost || '0') : 0;
        return fuelCost + oilCost;
    };

    const handleInputChange = (field: string, value: string | boolean) => {
        setRefuelData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    if (showChecklist) {
        const allItemsChecked = Object.values(checklistItems).every(item => item);
        const checklistLabels = {
            'oil_level': 'Checked engine oil level',
            'washer_fluid': 'Checked washer fluid level',
            'tyre_pressure': 'Checked tyre pressure and condition',
            'fuel_level': 'Confirmed fuel tank is properly filled'
        };

        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="Refueling Checklist" />
                <main className="max-w-md mx-auto p-6">
                    <Card>
                        <div className="text-center mb-6">
                            <Fuel className="mx-auto h-12 w-12 text-orange-500" />
                            <h3 className="text-2xl font-bold mt-2">Refueling Safety Check</h3>
                            <p className="text-gray-600">
                                {activeVehicle ? `${activeVehicle.registration} - ${activeVehicle.make} ${activeVehicle.model}` : 'ICE Vehicle'}
                            </p>
                        </div>

                        <div className="space-y-4 mb-6">
                            {Object.entries(checklistLabels).map(([key, label]) => (
                                <label key={key} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        checked={checklistItems[key] || false}
                                        onChange={(e) => setChecklistItems(prev => ({
                                            ...prev,
                                            [key]: e.target.checked
                                        }))}
                                        className="mt-1 h-4 w-4 text-orange-600 border-gray-300 rounded"
                                    />
                                    <span className="text-sm text-gray-700 leading-5">{label}</span>
                                </label>
                            ))}
                        </div>

                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                            <div className="flex">
                                <Fuel className="h-5 w-5 text-orange-400 mr-2 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-medium text-orange-800">Refueling Safety</h4>
                                    <p className="text-sm text-orange-700 mt-1">
                                        Complete all safety checks during refueling. Check fluid levels and report any issues immediately.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center gap-4">
                            <button
                                type="button"
                                onClick={() => setShowChecklist(false)}
                                className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={handleCompleteChecklist}
                                disabled={!allItemsChecked}
                                className={`w-full font-bold py-3 px-4 rounded-lg transition ${
                                    !allItemsChecked
                                        ? 'bg-gray-400 cursor-not-allowed text-white'
                                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                                }`}
                            >
                                <Check className="inline h-5 w-5 mr-2"/>
                                Complete Refueling
                            </button>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Log Refueling Session" />
            <main className="max-w-4xl mx-auto p-6">
                <Card>
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Log Vehicle Refuel</h2>

                    <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6" role="alert">
                        <p className="font-bold">Refueling Reminder</p>
                        <p>Remember to turn off engine, check fluid levels, and ensure proper fuel cap closure.</p>
                    </div>

                    <div className="space-y-6">
                        {/* Vehicle Info - Read Only */}
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <h3 className="font-semibold text-gray-800 mb-2">Vehicle</h3>
                            <div className="flex items-center">
                                <Car className="h-5 w-5 text-gray-500 mr-2" />
                                <span className="text-lg font-medium">{activeVehicle.registration} - {activeVehicle.make} {activeVehicle.model}</span>
                            </div>
                        </div>

                        {/* Refuel Data Form */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Current Odometer Reading (km) *</label>
                                <input
                                    type="number"
                                    value={refuelData.odometer}
                                    onChange={(e) => handleInputChange('odometer', e.target.value)}
                                    placeholder={`e.g., ${(activeVehicle.currentOdometer || 50000) + 100}`}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Litres Filled *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={refuelData.litres}
                                    onChange={(e) => handleInputChange('litres', e.target.value)}
                                    placeholder="e.g., 45.5"
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Fuel Cost (R) *</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={refuelData.fuelCost}
                                    onChange={(e) => handleInputChange('fuelCost', e.target.value)}
                                    placeholder="e.g., 850.00"
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={refuelData.oilRequired}
                                        onChange={(e) => handleInputChange('oilRequired', e.target.checked)}
                                        className="h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Oil purchased</span>
                                </label>

                                {refuelData.oilRequired && (
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={refuelData.oilCost}
                                        onChange={(e) => handleInputChange('oilCost', e.target.value)}
                                        placeholder="Oil cost (R)"
                                        className="mt-2 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                        required={refuelData.oilRequired}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                            <textarea
                                value={refuelData.notes}
                                onChange={(e) => handleInputChange('notes', e.target.value)}
                                rows={2}
                                placeholder="Any additional notes about refueling..."
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                            />
                        </div>

                        {/* Cost Summary */}
                        {(refuelData.fuelCost || refuelData.oilCost) && (
                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                <h4 className="font-medium text-orange-800 mb-2">Cost Summary</h4>
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                        <span>Fuel:</span>
                                        <span>R{parseFloat(refuelData.fuelCost || '0').toFixed(2)}</span>
                                    </div>
                                    {refuelData.oilRequired && (
                                        <div className="flex justify-between">
                                            <span>Oil:</span>
                                            <span>R{parseFloat(refuelData.oilCost || '0').toFixed(2)}</span>
                                        </div>
                                    )}
                                    <hr className="border-orange-200" />
                                    <div className="flex justify-between font-medium text-orange-800">
                                        <span>Total:</span>
                                        <span>R{calculateTotalCost().toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center gap-4">
                            <button onClick={onBack} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                                Back to Dashboard
                            </button>
                            <button
                                onClick={handleStartRefueling}
                                disabled={!refuelData.odometer || !refuelData.litres || !refuelData.fuelCost || (refuelData.oilRequired && !refuelData.oilCost)}
                                className={`font-bold py-2 px-6 rounded-lg transition ${
                                    (!refuelData.odometer || !refuelData.litres || !refuelData.fuelCost || (refuelData.oilRequired && !refuelData.oilCost))
                                        ? 'bg-gray-400 cursor-not-allowed text-white'
                                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                                }`}
                            >
                                <Fuel className="inline h-5 w-5 mr-2"/>
                                Proceed to Safety Check
                            </button>
                        </div>
                    </div>
                </Card>
            </main>
        </div>
    );
};

export default DriverDashboard;