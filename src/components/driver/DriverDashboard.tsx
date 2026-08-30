import React, { useState, useContext, useEffect, Component, ErrorInfo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, AlertTriangle, BarChart2, CheckCircle, XCircle, Bolt, Route, Fuel, DollarSign, Shield } from 'lucide-react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { UserContext } from '../../contexts/UserContext';
import { Shift, ShiftStatus, Vehicle, VehicleType, User, LeaderboardEntry, DriverIncidentSummary, DriverStatsSummary, DefectReport, DefectCategory, DefectUrgency } from '../../types';
import api from '../../services/firebaseApi';
import { useShiftStore } from '../../store/shift';
import { getDriverSession } from '../../store/session';
import { resolveActiveShiftState } from '../../lib/resolveActiveShift';
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
    const { activeShift: localActiveShift, setActiveShift: setLocalActiveShift, clearActiveShift: clearLocalActiveShift } = useShiftStore();
    const [showReportDefect, setShowReportDefect] = useState(false);
    const [showMyStats, setShowMyStats] = useState(false);
    const [showLogCharge, setShowLogCharge] = useState(false);
    const [showLogRefuel, setShowLogRefuel] = useState(false);

    // Reconcile the local shift store with the authoritative server state (WP8H).
    // Replaces the prior api.getDriverShifts(currentUser.id) call, which was an
    // unauthenticated full-collection scan of ALL drivers' shifts (security debt, and
    // blocked outright by the proposed Firestore rules). resolveActiveShiftState() is the
    // same session-authoritative resolver ActiveShift.tsx and App.tsx already use — it
    // also correctly resolves the CURRENT vehicle from the active VehicleAssignment
    // rather than the legacy, swap-stale shift.vehicleId field.
    useEffect(() => {
        let cancelled = false;
        const reconcile = async () => {
            if (!currentUser) return;
            // App hydration already stored a freshly consolidated server response before this
            // route renders. Do not immediately repeat the same active-state lookup.
            if (localActiveShift?.driverId === currentUser.id && Array.isArray(localActiveShift.inspections)) {
                return;
            }
            try {
                const activeState = await resolveActiveShiftState(currentUser);
                if (cancelled) return;
                if (activeState) {
                    setLocalActiveShift(activeState);
                } else {
                    clearLocalActiveShift();
                }
            } catch (err) {
                // Fail closed: leave whatever local state already exists rather than
                // guessing a "no shift" state on a transient lookup failure.
                console.error('Failed to reconcile active shift on dashboard:', err);
            }
        };
        reconcile();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser]);

    // Current vehicle comes from the active VehicleAssignment (via the shift store),
    // never from the legacy shift.vehicleId field, which does not update on a swap.
    const activeVehicle = localActiveShift?.vehicle;
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

    if (showReportDefect && hasActiveAssignment && activeVehicle) return <ReportDefectForm onBack={() => setShowReportDefect(false)} currentVehicle={activeVehicle} />;
    if (showMyStats) return <MyStats onBack={() => setShowMyStats(false)} currentUser={currentUser} />;
    if (showLogCharge) return <LogChargeForm onBack={() => setShowLogCharge(false)} assignmentId={localActiveShift!.assignmentId!} activeVehicle={activeVehicle} />;
    if (showLogRefuel && hasActiveAssignment && activeVehicle) return <LogRefuelForm onBack={() => setShowLogRefuel(false)} assignmentId={localActiveShift!.assignmentId!} activeVehicle={activeVehicle} />;


    return (
        <ErrorBoundary>
            <div className="min-h-screen bg-gray-100">
                <Header title="Driver Dashboard" />
                <main className="max-w-4xl mx-auto p-6">
                    <Card className="mb-6">
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Shift Status</h2>
                        {localActiveShift ? (
                            <div className="flex items-center bg-green-100 text-green-800 p-4 rounded-lg">
                                <CheckCircle className="h-6 w-6 mr-3" />
                                <div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800">Current Shift</h3>
                                        <p className="text-sm text-gray-500">Started at: {localActiveShift.startAt ? new Date(localActiveShift.startAt).toLocaleTimeString() : ''}</p>
                                    </div>                {activeVehicle?.vehicleType === VehicleType.EV ? (
                                        <p>Start SoC: {hasActiveAssignment ? localActiveShift.assignmentStartChargePercent : localActiveShift.startChargePercent}%</p>
                                    ) : (
                                        <p>Odometer: {hasActiveAssignment ? localActiveShift.assignmentStartOdo : localActiveShift.startOdo} km</p>
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
                            text={localActiveShift ? "Active Shift" : "Start New Shift"}
                            onClick={() => {
                                if (localActiveShift) {
                                    navigate('/driver/shift/active');
                                } else {
                                    navigate('/driver/shift/start');
                                }
                            }}
                            color={localActiveShift ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"}
                        />
                        {hasActiveAssignment && (activeVehicle?.vehicleType === VehicleType.EV ? (
                            <MainButton
                                icon={<Bolt size={48} />}
                                text={activeVehicle?.activeChargingSessionId ? "End Charge" : "Log Charge"}
                                onClick={() => setShowLogCharge(true)}
                                color={activeVehicle?.activeChargingSessionId ? "bg-orange-500 hover:bg-orange-600" : "bg-teal-500 hover:bg-teal-600"}
                            />
                        ) : (
                            <MainButton
                                icon={<Fuel size={48} />}
                                text="Log Refuel"
                                onClick={() => setShowLogRefuel(true)}
                                color="bg-orange-500 hover:bg-orange-600"
                            />
                        ))}
                        {hasActiveAssignment && activeVehicle && (
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

const MyStats = ({ onBack, currentUser }: { onBack: () => void; currentUser: User | null }) => {
    const [stats, setStats] = useState<DriverStatsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // WP8H: session-authenticated callable, scoped server-side to this driver only.
    // Replaces the prior api.getLeaderboard() + api.getDriverIncidentSummary() combination,
    // which read the full `shifts` collection and relied on api.getUsers() (an admin-only,
    // Firebase-Auth-gated callable a driver session can never satisfy) plus unauthenticated
    // full-collection reads of driverFines/vehicleDamages — both blocked by the proposed
    // Firestore rules (isAdmin()-only) and already broken today for the same auth reason.
    // Note: the prior ICE/EV breakdown and efficiency-score fields are omitted below because
    // the previous getLeaderboard() implementation never actually populated them — those
    // sections were unreachable dead UI in production, not a behavior this preserves.
    useEffect(() => {
        if (!currentUser) return;

        const fetchData = async () => {
            try {
                const session = getDriverSession();
                if (!session) {
                    throw new Error('Your session has expired. Please log in again.');
                }
                const result = await api.getDriverStatsWithSession(currentUser.id, session.sessionToken);
                setStats(result);
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
                                </div>
                            </div>

                            {/* Safety & Compliance Record */}
                            <div>
                                <h3 className="text-xl font-semibold text-gray-800 mb-3">Safety & Compliance Record</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <StatDisplay
                                        icon={<DollarSign className="h-8 w-8 text-red-500" />}
                                        title="Traffic Fines"
                                        value={`${stats.totalFines}`}
                                        subtitle={stats.totalFineAmount ? `Total: R${stats.totalFineAmount.toLocaleString()}` : 'No fines recorded'}
                                    />
                                    <StatDisplay
                                        icon={<Shield className="h-8 w-8 text-orange-500" />}
                                        title="Vehicle Damage Incidents"
                                        value={`${stats.totalDamages}`}
                                        subtitle={stats.totalDamagesCost ? `Total cost: R${stats.totalDamagesCost.toLocaleString()}` : 'No damage recorded'}
                                    />
                                </div>

                                {/* Safety Status */}
                                <div className="mt-4">
                                    {stats.riskScore === 0 ? (
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                            <div className="flex items-center">
                                                <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                                                <h4 className="text-lg font-semibold text-green-800">Excellent Safety Record</h4>
                                            </div>
                                            <p className="text-sm text-green-700 mt-1">
                                                No traffic fines or vehicle damage incidents recorded. Keep up the safe driving!
                                            </p>
                                        </div>
                                    ) : stats.riskScore < 30 ? (
                                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                            <div className="flex items-center">
                                                <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2" />
                                                <h4 className="text-lg font-semibold text-yellow-800">Low Risk Profile</h4>
                                            </div>
                                            <p className="text-sm text-yellow-700 mt-1">
                                                Risk Score: {stats.riskScore}/100. Minor incidents recorded but overall good safety record.
                                                {stats.unpaidFines > 0 && ` You have ${stats.unpaidFines} unpaid fine(s) totaling R${stats.unpaidAmount.toLocaleString()}.`}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                            <div className="flex items-center">
                                                <XCircle className="h-5 w-5 text-red-400 mr-2" />
                                                <h4 className="text-lg font-semibold text-red-800">
                                                    {stats.needsTraining ? 'Training Required' : 'High Risk Profile'}
                                                </h4>
                                            </div>
                                            <p className="text-sm text-red-700 mt-1">
                                                Risk Score: {stats.riskScore}/100. Multiple incidents recorded require attention.
                                                {stats.unpaidFines > 0 && ` You have ${stats.unpaidFines} unpaid fine(s) totaling R${stats.unpaidAmount.toLocaleString()}.`}
                                                {stats.needsTraining && ' Please contact management regarding mandatory safety training.'}
                                            </p>
                                        </div>
                                    )}

                                    {/* Recent Incident */}
                                    {stats.lastIncidentDate && (
                                        <div className="mt-3 text-sm text-gray-600">
                                            Last incident: {new Date(stats.lastIncidentDate).toLocaleDateString()}
                                        </div>
                                    )}
                                </div>
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
