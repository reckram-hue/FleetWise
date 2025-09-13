import React, { useState, useContext, useEffect, useRef } from 'react';
import { PlusCircle, AlertTriangle, BarChart2, CheckCircle, XCircle, Bolt, Route, Fuel, ScanLine, Car, Check } from 'lucide-react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { UserContext } from '../../contexts/UserContext';
import { Shift, ShiftStatus, Vehicle, VehicleType, User, LeaderboardEntry } from '../../types';
import api from '../../services/mockApi';

const DriverDashboard: React.FC = () => {
  const { currentUser } = useContext(UserContext);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showStartShift, setShowStartShift] = useState(false);
  const [showReportDefect, setShowReportDefect] = useState(false);
  const [showMyStats, setShowMyStats] = useState(false);
  const [showLogCharge, setShowLogCharge] = useState(false);
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
  
  if (showStartShift) return <StartShiftFlow onBack={() => setShowStartShift(false)} vehicles={vehicles} currentUser={currentUser} onShiftStarted={() => {
      setShowStartShift(false);
      setDashboardKey(k => k + 1);
  }} />;
  if (showReportDefect) return <ReportDefectForm onBack={() => setShowReportDefect(false)} />;
  if (showMyStats) return <MyStats onBack={() => setShowMyStats(false)} currentUser={currentUser} />;
  if (showLogCharge) return <LogChargeForm onBack={() => setShowLogCharge(false)} />;


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
                alert("Ending shift is not implemented yet.");
              } else {
                setShowStartShift(true);
              }
            }}
            color={activeShift ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"}
          />
          <MainButton
            icon={<Bolt size={48} />}
            text="Log Charge"
            onClick={() => setShowLogCharge(true)}
            color="bg-teal-500 hover:bg-teal-600"
          />
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
    const scannerRef = useRef<any>(null);

    useEffect(() => {
        if (step !== 'scan') {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch((err: any) => console.error("Failed to stop scanner on step change", err));
            }
            return;
        }

        const Html5Qrcode = (window as any).Html5Qrcode;
        if (!Html5Qrcode) {
            console.error("Html5Qrcode library not loaded.");
            setErrorMessage("QR Code scanner library failed to load.");
            setStep('error');
            return;
        }

        const html5QrCode = new Html5Qrcode("qr-reader");
        scannerRef.current = html5QrCode;

        const qrCodeSuccessCallback = (decodedText: string) => {
            const foundVehicle = vehicles.find(v => v.id === decodedText);
            if (foundVehicle) {
                setScannedVehicle(foundVehicle);
                setStep('confirm');
                setErrorMessage('');
            } else {
                setErrorMessage(`Vehicle with ID "${decodedText}" not found. Please scan a valid QR code.`);
                setStep('error');
            }
        };

        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

        html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback, undefined)
            .catch((err: any) => {
                setErrorMessage("Could not start camera. Please ensure permissions are granted.");
                setStep('error');
            });

        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch((err: any) => console.error("Failed to stop scanner on cleanup", err));
            }
        };
    }, [step, vehicles]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!scannedVehicle || !startValue) return;
        setStep('submitting');
        
        const startData = {
            driverId: currentUser.id,
            vehicleId: scannedVehicle.id,
            startOdometer: scannedVehicle.vehicleType === VehicleType.ICE ? parseInt(startValue, 10) : undefined,
            startChargePercent: scannedVehicle.vehicleType === VehicleType.EV ? parseInt(startValue, 10) : undefined
        };

        try {
            await api.startShift(startData);
            onShiftStarted();
        } catch(err: any) {
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
                                onChange={e => setStartValue(e.target.value)}
                                placeholder={isEV ? 'e.g., 95' : `e.g., ${scannedVehicle.currentOdometer}`}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                required
                            />
                        </div>
                        <div className="mt-8 flex justify-between items-center gap-4">
                            <button type="button" onClick={() => setStep('scan')} className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition">Scan Again</button>
                            <button type="submit" className="w-full bg-blue-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-600 transition disabled:bg-gray-400" disabled={!startValue}>
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

const ReportDefectForm = ({ onBack }: {onBack: () => void}) => {
    // Placeholder form
    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Report a Fault" />
            <main className="max-w-4xl mx-auto p-6">
                <Card>
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Report a Vehicle Fault</h2>
                    <p className="text-gray-600">This form would allow the driver to select the vehicle, category, urgency, describe the issue, and upload photos.</p>
                    <button onClick={onBack} className="mt-6 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Back to Dashboard</button>
                </Card>
            </main>
        </div>
    );
}

const MyStats = ({ onBack, currentUser }: { onBack: () => void; currentUser: User | null }) => {
    const [stats, setStats] = useState<LeaderboardEntry | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!currentUser) return;

        const fetchData = async () => {
            try {
                const leaderboardData = await api.getLeaderboard();
                const myStats = leaderboardData.find(e => e.driver.id === currentUser.id) || null;
                setStats(myStats);
            } catch (err) {
                setError("Could not load your stats. Please try again later.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [currentUser]);
    
    const efficiencyMetric = stats?.averageKmL 
        ? { value: `${stats.averageKmL.toFixed(2)} km/L`, icon: <Fuel className="h-8 w-8 text-green-500" /> }
        : stats?.averageKmPerKwh
        ? { value: `${stats.averageKmPerKwh.toFixed(2)} km/kWh`, icon: <Bolt className="h-8 w-8 text-yellow-500" /> }
        : { value: "N/A", icon: <Fuel className="h-8 w-8 text-gray-400" /> };

    const StatDisplay = ({ icon, title, value }: { icon: React.ReactNode, title: string, value: string }) => (
        <div className="flex items-center bg-gray-100 p-4 rounded-lg">
            <div className="p-3 rounded-full bg-gray-200 mr-4">
                {icon}
            </div>
            <div>
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="My Performance Stats" />
            <main className="max-w-4xl mx-auto p-6">
                 <button onClick={onBack} className="mb-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Back to Dashboard</button>
                <Card>
                    <h2 className="text-3xl font-bold text-gray-800 mb-4">My Stats</h2>
                    {loading ? (
                        <p>Loading your stats...</p>
                    ) : error ? (
                         <p className="text-red-500">{error}</p>
                    ) : stats ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <StatDisplay icon={<Route className="h-8 w-8 text-blue-500"/>} title="Total Distance Driven" value={`${stats.totalKmDriven.toLocaleString()} km`} />
                           <StatDisplay icon={efficiencyMetric.icon} title="Average Efficiency" value={efficiencyMetric.value} />
                        </div>
                    ) : (
                        <p className="text-gray-600">Not enough data for stats yet. Complete a few shifts to see your performance.</p>
                    )}
                </Card>
            </main>
        </div>
    );
};


const LogChargeForm = ({ onBack }: { onBack: () => void }) => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [recommendation, setRecommendation] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        api.getVehicles().then(allVehicles => {
            const evs = allVehicles.filter(v => v.vehicleType === VehicleType.EV);
            setVehicles(evs);
            if (evs.length > 0) {
                setSelectedVehicleId(evs[0].id);
            }
        });
    }, []);

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
                    <p className="text-gray-600">This form would allow the driver to select their EV, enter odometer, start/end charge %, energy added (kWh), and total cost.</p>
                    <button onClick={onBack} className="mt-6 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Back to Dashboard</button>
                </Card>
            </main>
        </div>
    );
};


export default DriverDashboard;