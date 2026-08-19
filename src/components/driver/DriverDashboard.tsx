import React, { useState, useContext, useEffect, useRef, Component, ErrorInfo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, AlertTriangle, BarChart2, CheckCircle, XCircle, Bolt, Route, Fuel, ScanLine, Car, Check, DollarSign, Shield, Trophy, Target, Camera, MapPin, Clock, Wrench, Upload, X } from 'lucide-react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { UserContext } from '../../contexts/UserContext';
import { Shift, ShiftStatus, Vehicle, VehicleType, VehicleStatus, User, LeaderboardEntry, DriverIncidentSummary, DefectReport, DefectCategory, DefectUrgency } from '../../types';
import api from '../../services/firebaseApi';
import { useShiftStore } from '../../store/shift';
import ReportDefectForm from './ReportDefectForm';
import LogChargeForm from './LogChargeForm';
import LogRefuelForm from './LogRefuelForm';

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
    const navigate = useNavigate();
    const { activeShift: localActiveShift } = useShiftStore();
    const [activeShift, setActiveShift] = useState<Shift | null>(null);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [showReportDefect, setShowReportDefect] = useState(false);
    const [showMyStats, setShowMyStats] = useState(false);
    const [showLogCharge, setShowLogCharge] = useState(false);
    const [showLogRefuel, setShowLogRefuel] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            if (currentUser) {
                // Check for active shift in local storage first
                if (localActiveShift) {
                    // We have an active shift in local storage, verify it's still valid
                    const shifts = await api.getDriverShifts(currentUser.id);
                    const currentActiveShift = shifts.find(s => s.status === ShiftStatus.Active) || null;
                    setActiveShift(currentActiveShift);
                } else {
                    // No local shift, check database
                    const shifts = await api.getDriverShifts(currentUser.id);
                    const currentActiveShift = shifts.find(s => s.status === ShiftStatus.Active) || null;
                    setActiveShift(currentActiveShift);
                }

                const vehicleData = await api.getVehicles();
                setVehicles(vehicleData);
            }
        };
        fetchData();
    }, [currentUser, localActiveShift]);

    const activeVehicle = vehicles.find(v => v.id === activeShift?.vehicleId);
    // Vehicle-dependent actions (Log Refuel/Charge, Report a Fault) are only valid when the
    // driver has an active Shift AND an active VehicleAssignment (WP7C1). The store's
    // assignmentId is the authoritative client-side signal (reconciled from the server).
    const hasActiveAssignment = !!localActiveShift?.assignmentId;

    const MainButton = ({ icon, text, onClick, color }: { icon: React.ReactNode, text: string, onClick: () => void, color: string }) => (
        <button onClick={onClick} className={`flex flex-col items-center justify-center p-6 rounded-lg shadow-lg text-white font-semibold transform transition hover:scale-105 ${color}`}>
            {icon}
            <span className="mt-2 text-lg">{text}</span>
        </button>
    );

    if (!currentUser) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="text-center">
                    <div className="animate-spin mb-4">
                        <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800">Loading Dashboard...</h2>
                </div>
            </div>
        );
    }

    if (showReportDefect) return <ReportDefectForm onBack={() => setShowReportDefect(false)} />;
    if (showMyStats) return <MyStats onBack={() => setShowMyStats(false)} currentUser={currentUser} />;
    if (showLogCharge) return <LogChargeForm onBack={() => setShowLogCharge(false)} activeVehicle={activeVehicle} />;
    if (showLogRefuel) return <LogRefuelForm onBack={() => setShowLogRefuel(false)} activeVehicle={activeVehicle} />;


    return (
        <ErrorBoundary>
            <div className="min-h-screen bg-gray-100">
                <Header title="Driver Dashboard" />
                <main className="max-w-4xl mx-auto p-6">
                    <Card className="mb-6">
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Shift Status</h2>
                        {activeShift ? (
                            <div className="flex items-center bg-green-100 text-green-800 p-4 rounded-lg">
                                <CheckCircle className="h-6 w-6 mr-3" />
                                <div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800">Current Shift</h3>
                                        <p className="text-sm text-gray-500">Started at: {activeShift.startTime ? new Date(activeShift.startTime).toLocaleTimeString() : ''}</p>
                                    </div>                {activeVehicle?.vehicleType === VehicleType.EV ? (
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
                            text={activeShift ? "Active Shift" : "Start New Shift"}
                            onClick={() => {
                                if (activeShift || localActiveShift) {
                                    navigate('/driver/shift/active');
                                } else {
                                    navigate('/driver/shift/start');
                                }
                            }}
                            color={activeShift ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"}
                        />
                        {hasActiveAssignment && (activeVehicle?.vehicleType === VehicleType.EV ? (
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
                        ))}
                        {hasActiveAssignment && (
                            <MainButton
                                icon={<AlertTriangle size={48} />}
                                text="Report a Fault"
                                onClick={() => setShowReportDefect(true)}
                                color="bg-yellow-500 hover:bg-yellow-600"
                            />
                        )}
                        <MainButton
                            icon={<BarChart2 size={48} />}
                            text="View My Stats"
                            onClick={() => setShowMyStats(true)}
                            color="bg-purple-500 hover:bg-purple-600"
                        />
                    </div>
                </main>
            </div>
        </ErrorBoundary>
    );
};

const StartShiftFlow = ({ onBack, onShiftStarted, vehicles, currentUser }: { onBack: () => void; onShiftStarted: () => void; vehicles: Vehicle[], currentUser: User }) => {
    const [step, setStep] = useState<'choose' | 'scan' | 'manual' | 'confirm' | 'error' | 'submitting'>('choose');
    const [scannedVehicle, setScannedVehicle] = useState<Vehicle | null>(null);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
    const [availableVehicles, setAvailableVehicles] = useState<Vehicle[]>([]);
    const [startValue, setStartValue] = useState(''); // For ICE odometer or backward compatibility
    const [startOdometer, setStartOdometer] = useState(''); // For EV odometer
    const [startSoC, setStartSoC] = useState(''); // For EV State of Charge
    const [errorMessage, setErrorMessage] = useState('');
    const [lastShiftEndOdometer, setLastShiftEndOdometer] = useState<number | null>(null);
    const [validationMessage, setValidationMessage] = useState('');
    const [socValidationMessage, setSocValidationMessage] = useState('');
    const scannerRef = useRef<any>(null);

    // Load available vehicles on component mount
    useEffect(() => {
        const loadAvailableVehicles = async () => {
            try {
                // Get all vehicles and active shifts to filter out unavailable ones
                const [allVehicles, activeShifts] = await Promise.all([
                    api.getVehicles(),
                    api.getActiveShifts() // This should return shifts that are currently active
                ]);

                // Get vehicle IDs that are currently in use
                const vehiclesInUse = activeShifts.map((shift: any) => shift.vehicleId);

                // Filter out vehicles that are in use, in service, or unavailable
                const available = allVehicles.filter((vehicle: Vehicle) =>
                    !vehiclesInUse.includes(vehicle.id) &&
                    vehicle.status === VehicleStatus.Active // Only show active/available vehicles
                );

                setAvailableVehicles(available);
            } catch (error) {
                console.error('Failed to load available vehicles:', error);
                setAvailableVehicles(vehicles); // Fallback to all vehicles
            }
        };

        loadAvailableVehicles();
    }, [vehicles]);

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

    const handleManualVehicleSelect = async () => {
        if (!selectedVehicleId) return;

        const foundVehicle = availableVehicles.find(v => v.id === selectedVehicleId);
        if (!foundVehicle) {
            setErrorMessage('Selected vehicle not found. Please try again.');
            setStep('error');
            return;
        }

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
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const isEV = scannedVehicle?.vehicleType === VehicleType.EV;

        console.log("Form submitted with:", {
            scannedVehicle: scannedVehicle?.id,
            isEV,
            startValue,
            startOdometer,
            startSoC
        });

        if (!scannedVehicle) {
            console.log("Missing vehicle data");
            return;
        }

        // Check required fields based on vehicle type
        if (isEV) {
            if (!startOdometer || !startSoC) {
                alert('Both odometer reading and State of Charge are required for electric vehicles');
                return;
            }
        } else {
            if (!startValue) {
                alert('Odometer reading is required');
                return;
            }
        }

        // Enhanced validation for EVs
        if (isEV) {
            const odometerValue = parseFloat(startOdometer);
            const socValue = parseFloat(startSoC);

            // Odometer validation for EVs
            if (odometerValue < 0) {
                alert('Odometer reading cannot be negative');
                return;
            }
            if (odometerValue > 999999) {
                alert('Odometer reading seems too high. Please verify the reading.');
                return;
            }

            // SoC validation for EVs (0-100%)
            if (socValue < 0 || socValue > 100) {
                alert('State of Charge must be between 0% and 100%');
                return;
            }
            if (socValue < 20) {
                const confirmed = confirm(`Starting charge is quite low (${socValue}%). Are you sure this vehicle has sufficient charge for your shift?`);
                if (!confirmed) return;
            }
        } else {
            // Validation for ICE vehicles
            const numericValue = parseFloat(startValue);
            if (numericValue < 0) {
                alert('Odometer reading cannot be negative');
                return;
            }
            if (numericValue > 999999) {
                alert('Odometer reading seems too high. Please verify the reading.');
                return;
            }
        }

        // Final validation for ICE vehicles against last shift
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

        // Final validation for EV odometer against last shift
        if (scannedVehicle.vehicleType === VehicleType.EV && lastShiftEndOdometer !== null) {
            const enteredOdometer = parseInt(startOdometer, 10);
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
            startOdometer: scannedVehicle.vehicleType === VehicleType.ICE
                ? parseInt(startValue, 10)
                : parseInt(startOdometer, 10),
            startChargePercent: scannedVehicle.vehicleType === VehicleType.EV
                ? parseInt(startSoC, 10)
                : undefined
        };

        console.log("Starting shift with data:", startData);

        try {
            await api.startShift(startData);
            console.log("Shift started successfully");
            onShiftStarted();
        } catch (err: any) {
            console.error("Shift start failed:", err);
            setErrorMessage(err.message || "Failed to start shift.");
            setStep('error');
        }
    };

    const renderContent = () => {
        switch (step) {
            case 'choose':
                return (
                    <div className="text-center">
                        <Car className="mx-auto h-16 w-16 text-blue-500 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-800 mb-2">Start Your Shift</h3>
                        <p className="text-gray-600 mb-6">Choose how you'd like to select your vehicle:</p>

                        <div className="space-y-3">
                            <button
                                onClick={() => setStep('scan')}
                                className="w-full flex items-center justify-center p-4 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition"
                            >
                                <ScanLine className="h-6 w-6 text-blue-500 mr-3" />
                                <div className="text-left">
                                    <div className="font-medium text-gray-800">Scan QR Code</div>
                                    <div className="text-sm text-gray-500">Quick and automatic</div>
                                </div>
                            </button>

                            <button
                                onClick={() => setStep('manual')}
                                className="w-full flex items-center justify-center p-4 border-2 border-green-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition"
                            >
                                <Car className="h-6 w-6 text-green-500 mr-3" />
                                <div className="text-left">
                                    <div className="font-medium text-gray-800">Select Manually</div>
                                    <div className="text-sm text-gray-500">Choose from available vehicles</div>
                                </div>
                            </button>
                        </div>
                    </div>
                );
            case 'manual':
                return (
                    <div>
                        <div className="text-center mb-6">
                            <Car className="mx-auto h-16 w-16 text-green-500 mb-4" />
                            <h3 className="text-xl font-semibold text-gray-800">Select Vehicle</h3>
                            <p className="text-gray-600 mt-2">Choose from available vehicles for your shift.</p>
                        </div>

                        {availableVehicles.length === 0 ? (
                            <div className="text-center py-8">
                                <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
                                <h4 className="text-lg font-semibold text-gray-800 mb-2">No Vehicles Available</h4>
                                <p className="text-gray-600">All vehicles are currently in use or out of service. Please try again later or contact dispatch.</p>
                                <button
                                    onClick={() => setStep('choose')}
                                    className="mt-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition"
                                >
                                    Back
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Available Vehicles ({availableVehicles.length})</label>
                                    <select
                                        value={selectedVehicleId}
                                        onChange={(e) => setSelectedVehicleId(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
                                        required
                                    >
                                        <option value="">Select a vehicle...</option>
                                        {availableVehicles.map(vehicle => (
                                            <option key={vehicle.id} value={vehicle.id}>
                                                {vehicle.make} {vehicle.model} - {vehicle.registration}
                                                {vehicle.vehicleType === VehicleType.EV ? ' (Electric)' : ' (Petrol/Diesel)'}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex justify-between gap-4 mt-6">
                                    <button
                                        onClick={() => setStep('choose')}
                                        className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleManualVehicleSelect}
                                        disabled={!selectedVehicleId}
                                        className={`w-full font-bold py-3 px-4 rounded-lg transition ${!selectedVehicleId
                                            ? 'bg-gray-400 cursor-not-allowed text-white'
                                            : 'bg-green-500 hover:bg-green-600 text-white'
                                            }`}
                                    >
                                        <Check className="inline h-5 w-5 mr-2" />
                                        Select Vehicle
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
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
                console.log("Selected vehicle:", scannedVehicle.id, "Type:", scannedVehicle.vehicleType, "IsEV:", isEV);
                return (
                    <form onSubmit={handleSubmit}>
                        <div className="text-center">
                            <Car className="mx-auto h-12 w-12 text-green-500" />
                            <h3 className="text-2xl font-bold mt-2">{scannedVehicle.make} {scannedVehicle.model}</h3>
                            <p className="text-lg text-gray-600 font-medium">{scannedVehicle.registration}</p>
                        </div>
                        {/* Input fields based on vehicle type */}
                        {isEV ? (
                            /* EV vehicles need both odometer and SoC */
                            <div className="mt-6 space-y-4">
                                {/* Odometer for EV */}
                                <div>
                                    <label htmlFor="startOdometer" className="block text-sm font-medium text-gray-700">
                                        Starting Odometer (km) *
                                        <span className="text-xs text-gray-500 block mt-1">
                                            Enter current odometer reading in kilometers
                                        </span>
                                    </label>
                                    <input
                                        type="number"
                                        id="startOdometer"
                                        value={startOdometer}
                                        min="0"
                                        max="999999"
                                        step="1"
                                        onChange={e => {
                                            const value = e.target.value;
                                            setStartOdometer(value);

                                            if (value) {
                                                const numericValue = parseFloat(value);

                                                // Validate EV odometer against last shift
                                                if (lastShiftEndOdometer !== null) {
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
                                                } else if (numericValue > 999999) {
                                                    setValidationMessage(`⚠️ Odometer reading seems very high. Please verify.`);
                                                } else {
                                                    setValidationMessage(`✅ Odometer reading recorded: ${numericValue.toLocaleString()} km`);
                                                }
                                            } else {
                                                setValidationMessage('');
                                            }
                                        }}
                                        placeholder={`e.g., ${scannedVehicle.currentOdometer || '50000'}`}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        required
                                    />
                                    {validationMessage && (
                                        <div className={`mt-2 p-2 rounded-md text-sm ${validationMessage.includes('✅')
                                            ? 'bg-green-50 text-green-800 border border-green-200'
                                            : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                                            }`}>
                                            {validationMessage}
                                        </div>
                                    )}
                                </div>

                                {/* State of Charge for EV */}
                                <div>
                                    <label htmlFor="startSoC" className="block text-sm font-medium text-gray-700">
                                        Starting Charge (%) *
                                        <span className="text-xs text-gray-500 block mt-1">
                                            Enter current battery charge level (0-100%)
                                        </span>
                                    </label>
                                    <input
                                        type="number"
                                        id="startSoC"
                                        value={startSoC}
                                        min="0"
                                        max="100"
                                        step="1"
                                        onChange={e => {
                                            const value = e.target.value;
                                            setStartSoC(value);

                                            if (value) {
                                                const numericValue = parseFloat(value);

                                                if (numericValue < 0 || numericValue > 100) {
                                                    setSocValidationMessage(`⚠️ State of Charge must be between 0% and 100%`);
                                                } else if (numericValue < 20) {
                                                    setSocValidationMessage(`⚠️ Battery level is quite low (${numericValue}%). Consider charging before starting shift.`);
                                                } else if (numericValue >= 80) {
                                                    setSocValidationMessage(`✅ Excellent battery level (${numericValue}%)`);
                                                } else {
                                                    setSocValidationMessage(`✅ Battery level OK (${numericValue}%)`);
                                                }
                                            } else {
                                                setSocValidationMessage('');
                                            }
                                        }}
                                        placeholder="Enter 0-100"
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        required
                                    />
                                    {socValidationMessage && (
                                        <div className={`mt-2 p-2 rounded-md text-sm ${socValidationMessage.includes('✅')
                                            ? 'bg-green-50 text-green-800 border border-green-200'
                                            : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                                            }`}>
                                            {socValidationMessage}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* ICE vehicles need only odometer */
                            <div className="mt-6">
                                <label htmlFor="startValue" className="block text-sm font-medium text-gray-700">
                                    Starting Odometer (km) *
                                    <span className="text-xs text-gray-500 block mt-1">
                                        Enter current odometer reading in kilometers
                                    </span>
                                </label>
                                <input
                                    type="number"
                                    id="startValue"
                                    value={startValue}
                                    min="0"
                                    max="999999"
                                    step="1"
                                    onChange={e => {
                                        const value = e.target.value;
                                        setStartValue(value);

                                        if (value) {
                                            const numericValue = parseFloat(value);

                                            // Validate odometer against last shift for ICE vehicles
                                            if (lastShiftEndOdometer !== null) {
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
                                            } else if (numericValue > 999999) {
                                                setValidationMessage(`⚠️ Odometer reading seems very high. Please verify.`);
                                            } else {
                                                setValidationMessage(`✅ Odometer reading recorded: ${numericValue.toLocaleString()} km`);
                                            }
                                        } else {
                                            setValidationMessage('');
                                        }
                                    }}
                                    placeholder={`e.g., ${scannedVehicle.currentOdometer || '50000'}`}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    required
                                />
                                {validationMessage && (
                                    <div className={`mt-2 p-2 rounded-md text-sm ${validationMessage.includes('✅')
                                        ? 'bg-green-50 text-green-800 border border-green-200'
                                        : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                                        }`}>
                                        {validationMessage}
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Confirmation Summary */}
                        {((isEV && startOdometer && startSoC) || (!isEV && startValue)) && (
                            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <h4 className="font-semibold text-blue-800 mb-2">Shift Start Confirmation</h4>
                                <div className="space-y-1 text-sm text-blue-700">
                                    <div className="flex justify-between">
                                        <span>Vehicle:</span>
                                        <span className="font-medium">{scannedVehicle.make} {scannedVehicle.model} ({scannedVehicle.registration})</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Vehicle Type:</span>
                                        <span className="font-medium">{isEV ? 'Electric' : 'Petrol/Diesel'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Starting Odometer:</span>
                                        <span className="font-medium">{isEV ? startOdometer : startValue} km</span>
                                    </div>
                                    {isEV && (
                                        <div className="flex justify-between">
                                            <span>Starting Charge:</span>
                                            <span className="font-medium">{startSoC}%</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span>Driver:</span>
                                        <span className="font-medium">{currentUser.firstName} {currentUser.surname}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Start Time:</span>
                                        <span className="font-medium">{new Date().toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="mt-8 flex justify-between items-center gap-4">
                            <button type="button" onClick={() => setStep('choose')} className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition">Back</button>
                            <button
                                type="submit"
                                className={`w-full font-bold py-3 px-4 rounded-lg transition ${(isEV && (!startOdometer || !startSoC)) || (!isEV && !startValue)
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-green-500 hover:bg-green-600'
                                    } text-white`}
                                disabled={(isEV && (!startOdometer || !startSoC)) || (!isEV && !startValue)}
                                onClick={() => console.log("Button clicked, EV:", isEV, "Values:", { startValue, startOdometer, startSoC })}
                            >
                                <Check className="inline h-5 w-5 mr-2" />
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
                        <button onClick={() => setStep('choose')} className="mt-6 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Back to Start</button>
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
    const [endOdometer, setEndOdometer] = useState('');
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
        if (isEV && !endOdometer) return;

        setIsSubmitting(true);
        setErrorMessage('');

        try {
            await api.endShift(
                activeShift.id,
                {
                    endOdometer: isEV ? parseInt(endOdometer, 10) : parseInt(endValue, 10),
                    endChargePercent: isEV ? parseInt(endValue, 10) : undefined
                }
            );
            onShiftEnded();
        } catch (err: any) {
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
                                {isEV ? (
                                    <>
                                        <p><span className="text-gray-600">Start Charge:</span> {activeShift.startChargePercent}%</p>
                                        <p><span className="text-gray-600">Start Odometer:</span> {activeShift.startOdometer?.toLocaleString()} km</p>
                                    </>
                                ) : (
                                    <p><span className="text-gray-600">Start Odometer:</span> {startValue} km</p>
                                )}
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

                        {isEV && (
                            <div className="mt-4">
                                <label htmlFor="endOdometer" className="block text-sm font-medium text-gray-700">
                                    Ending Odometer (km)
                                </label>
                                <input
                                    type="number"
                                    id="endOdometer"
                                    value={endOdometer}
                                    onChange={e => setEndOdometer(e.target.value)}
                                    placeholder={`e.g., ${(activeShift.startOdometer || 50000) + 100}`}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
                                    required
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Record the odometer reading at the end of your shift
                                </p>
                            </div>
                        )}

                        {errorMessage && (
                            <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                                {errorMessage}
                            </div>
                        )}

                        <div className="mt-8 flex justify-between items-center gap-4">
                            <button type="button" onClick={onBack} className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition">Cancel</button>
                            <button type="submit" className="w-full bg-red-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-600 transition disabled:bg-gray-400" disabled={!endValue || (isEV && !endOdometer) || isSubmitting}>
                                <Check className="inline h-5 w-5 mr-2" />
                                {isSubmitting ? 'Ending Shift...' : 'End Shift'}
                            </button>
                        </div>
                    </form>
                </Card>
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
                const myIncidents = incidentSummary.length > 0 ? incidentSummary[0] : null;

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
                                        icon={<Route className="h-8 w-8 text-blue-500" />}
                                        title="Total Distance Driven"
                                        value={`${stats.totalKmDriven.toLocaleString()} km`}
                                        subtitle="Across all vehicles"
                                    />
                                    <StatDisplay
                                        icon={<Car className="h-8 w-8 text-purple-500" />}
                                        title="Vehicle Types Driven"
                                        value={`${hasICEData && hasEVData ? 'ICE & EV' : hasICEData ? 'ICE Only' : hasEVData ? 'EV Only' : 'None'}`}
                                        subtitle={hasICEData && hasEVData ? 'Multi-fleet experience' : ''}
                                    />
                                    {stats.overallEfficiencyScore && (
                                        <StatDisplay
                                            icon={stats.overallEfficiencyScore >= 100 ?
                                                <Trophy className="h-8 w-8 text-yellow-500" /> :
                                                <Target className="h-8 w-8 text-gray-500" />}
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
                                            icon={<Fuel className="h-8 w-8 text-orange-500" />}
                                            title="ICE Distance Driven"
                                            value={`${(stats.totalICEKmDriven || 0).toLocaleString()} km`}
                                            subtitle="Petrol/diesel vehicles"
                                        />
                                        <StatDisplay
                                            icon={<Fuel className="h-8 w-8 text-green-500" />}
                                            title="Fuel Economy"
                                            value={stats.averageKmL ? `${stats.averageKmL.toFixed(2)} km/L` : 'N/A'}
                                            subtitle="Aggregated across ICE vehicles"
                                        />
                                        <StatDisplay
                                            icon={<Fuel className="h-8 w-8 text-blue-500" />}
                                            title="Total Fuel Consumed"
                                            value={stats.totalFuelConsumed ? `${stats.totalFuelConsumed.toFixed(1)} L` : 'N/A'}
                                            subtitle="Including mid-shift refuels"
                                        />
                                        <StatDisplay
                                            icon={stats.iceEfficiencyScore && stats.iceEfficiencyScore >= 100 ?
                                                <Trophy className="h-8 w-8 text-yellow-500" /> :
                                                <Target className="h-8 w-8 text-gray-500" />}
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
                                            icon={<Bolt className="h-8 w-8 text-blue-500" />}
                                            title="EV Distance Driven"
                                            value={`${(stats.totalEVKmDriven || 0).toLocaleString()} km`}
                                            subtitle="Electric vehicles"
                                        />
                                        <StatDisplay
                                            icon={<Bolt className="h-8 w-8 text-yellow-500" />}
                                            title="Energy Efficiency"
                                            value={stats.averageKmPerKwh ? `${stats.averageKmPerKwh.toFixed(2)} km/kWh` : 'N/A'}
                                            subtitle="Aggregated across EVs"
                                        />
                                        <StatDisplay
                                            icon={<Bolt className="h-8 w-8 text-purple-500" />}
                                            title="Total Energy Consumed"
                                            value={stats.totalEnergyConsumed ? `${stats.totalEnergyConsumed.toFixed(1)} kWh` : 'N/A'}
                                            subtitle="Including mid-shift charges"
                                        />
                                        <StatDisplay
                                            icon={stats.evEfficiencyScore && stats.evEfficiencyScore >= 100 ?
                                                <Trophy className="h-8 w-8 text-green-500" /> :
                                                <Target className="h-8 w-8 text-gray-500" />}
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
                                                    <Trophy className="h-5 w-5 text-yellow-500 mr-2" /> :
                                                    <Target className="h-5 w-5 text-blue-600 mr-2" />}
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
                                        icon={<DollarSign className="h-8 w-8 text-red-500" />}
                                        title="Traffic Fines"
                                        value={incidentData ? `${incidentData.totalFines}` : '0'}
                                        subtitle={incidentData?.totalFineAmount ? `Total: R${incidentData.totalFineAmount.toLocaleString()}` : 'No fines recorded'}
                                    />
                                    <StatDisplay
                                        icon={<Shield className="h-8 w-8 text-orange-500" />}
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






export default DriverDashboard;