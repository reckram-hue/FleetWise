import React, { useState, useEffect, useContext, useRef } from 'react';
import { UserContext } from '../../contexts/UserContext';
import api from '../../services/firebaseApi';
import { getDriverSession } from '../../store/session';
import Card from '../shared/Card';
import Header from '../shared/Header';
import {
    CheckCircle,
    MapPin,
    AlertTriangle,
    Camera,
    Upload,
    X,
    Car
} from 'lucide-react';
import { DefectReport, DefectCategory, DefectUrgency } from '../../types';
import type { VehiclePick } from './TakeVehicleForm';
import { outstandingDefects, defectSeverityClasses } from '../../lib/driverVehiclePresentation';

interface ReportDefectFormProps {
    onBack: () => void;
    pickup?: boolean;
    /**
     * The selected pickup vehicle or CURRENT assigned vehicle.
     * Required — reporting is locked to this vehicle; the existing server validates it.
     */
    currentVehicle: VehiclePick;
}

const ReportDefectForm: React.FC<ReportDefectFormProps> = ({ onBack, currentVehicle, pickup = false }) => {
    const { currentUser } = useContext(UserContext);
    const [existingDefects, setExistingDefects] = useState<DefectReport[]>([]);
    const [similarDefects, setSimilarDefects] = useState<DefectReport[]>([]);
    const [loading, setLoading] = useState(false);
    const [showSimilar, setShowSimilar] = useState(false);
    const [photos, setPhotos] = useState<string[]>([]);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const submissionLock = useRef(false);
    const photoReadLock = useRef(false);
    const [readingPhotos, setReadingPhotos] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        category: DefectCategory.Other,
        urgency: DefectUrgency.Medium,
        description: '',
        location: '',
        notes: ''
    });

    useEffect(() => {
        if (currentVehicle?.id) {
            const fetchExistingDefects = async () => {
                const session = getDriverSession();
                if (!currentUser || !session) return;
                try {
                    const defects = await api.getVehicleDefectsForSession(currentUser.id, session.sessionToken, currentVehicle.id);
                    setExistingDefects(outstandingDefects(defects));
                } catch (err) {
                    console.error('Failed to fetch existing vehicle defects:', err);
                }
            };
            fetchExistingDefects();
        }
    }, [currentUser, currentVehicle?.id]);

    const checkForSimilar = () => {
        if (currentVehicle?.id && formData.category && formData.description.length > 10) {
            const descLower = formData.description.toLowerCase();
            const words = descLower.split(' ').filter(w => w.length > 3);
            const similar = existingDefects.filter(defect => {
                if (defect.category !== formData.category || defect.status === 'Resolved') {
                    return false;
                }
                const defectDescLower = defect.description.toLowerCase();
                return words.some(word => defectDescLower.includes(word));
            });
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
    }, [existingDefects, formData.description, formData.category, currentVehicle?.id]);

    const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (!files.length || submissionLock.current || photoReadLock.current) return;
        event.target.value = '';
        photoReadLock.current = true;
        setReadingPhotos(true); setSubmitError(null);
        try {
            const selected = await Promise.all(files.map(file => new Promise<string>((resolve, reject) => {
                if (!file.type.startsWith('image/')) { reject(new Error('Please select an image file.')); return; }
                const reader = new FileReader();
                reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the selected photo. Please select it again.'));
                reader.onerror = reader.onabort = () => reject(new Error('Could not read the selected photo. Please select it again.'));
                reader.readAsDataURL(file);
            })));
            setPhotos(prev => [...prev, ...selected]);
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Could not read photos. Please try again.');
        } finally {
            photoReadLock.current = false; setReadingPhotos(false);
        }
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
        if (!currentUser || !currentVehicle || loading || submissionLock.current || photoReadLock.current) return;
        submissionLock.current = true;

        setLoading(true);
        setSubmitError(null);
        try {
            const session = getDriverSession();
            if (!session) {
                throw new Error('Your session has expired. Please log in again.');
            }

            // Upload photos to Cloud Storage first. If any upload fails, abort here —
            // no defect record is created for a submission with a missing photo.
            const photoPaths: string[] = [];
            for (const photo of photos) {
                const { photoPath } = await api.uploadDefectPhoto(currentUser.id, session.sessionToken, currentVehicle.id, photo);
                photoPaths.push(photoPath);
            }

            await api.reportDefectWithSession({
                vehicleId: currentVehicle.id,
                driverId: currentUser.id,
                sessionToken: session.sessionToken,
                category: formData.category,
                description: formData.description,
                urgency: formData.urgency,
                location: formData.location || undefined,
                notes: formData.notes || undefined,
                photos: photoPaths.length > 0 ? photoPaths : undefined,
                deviceId: localStorage.getItem('fleetwise_device_id') || undefined,
            });

            alert('Defect report submitted successfully! The maintenance team will review it shortly.');
            onBack();
        } catch (err) {
            console.error('Failed to submit defect report:', err);
            // Backend HttpsError messages here (e.g. "Unsupported image format...", "Image
            // must be between 1 byte and 5 MB.", "Vehicle not found") are already written to
            // be driver-facing, so it's safe to surface err.message directly when present.
            setSubmitError(err instanceof Error && err.message ? err.message : 'Failed to submit defect report. Please try again.');
            // formData and photos are intentionally left untouched so the driver can retry
            // without re-entering anything.
        } finally {
            submissionLock.current = false;
            setLoading(false);
        }
    };

    if (!currentVehicle) {
        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="Report a Vehicle Fault" />
                <main className="max-w-4xl mx-auto p-6">
                    <Card>
                        <div className="text-center py-8">
                            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                            <h2 className="text-xl font-bold text-gray-800 mb-2">No Active Vehicle Assignment</h2>
                            <p className="text-gray-600 mb-6">You must have an active vehicle assignment to report a vehicle fault.</p>
                            <button onClick={onBack} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition duration-300">
                                {pickup ? '← Back to vehicle pickup' : '← Back to Dashboard'}
                            </button>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Report a Vehicle Fault" />
            <main className="max-w-4xl mx-auto p-6">
                <button onClick={onBack} disabled={loading || readingPhotos} className="mb-4 min-h-11 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50">
                    {pickup ? '← Back to vehicle pickup' : '← Back'}
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Form */}
                    <div className="lg:col-span-2">
                        <Card>
                            <form onSubmit={handleSubmit}>
                              <fieldset disabled={loading || readingPhotos} className="space-y-6">
                                <legend className="sr-only">Vehicle defect report</legend>
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Report New Defect</h2>
                                    <p className="text-gray-600">{pickup ? 'Describe any faults you noticed before accepting this vehicle.' : "Describe any vehicle faults or issues you've discovered during your shift."}</p>
                                </div>

                                {/* Vehicle (Read-Only / Locked to Active Vehicle) */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Vehicle
                                    </label>
                                    <div className="p-3 bg-gray-50 border border-gray-300 rounded-md text-gray-800 font-medium flex flex-wrap gap-2 items-center justify-between break-words">
                                        <div className="flex items-center">
                                            <Car className="h-5 w-5 text-gray-500 mr-2" />
                                            <span>
                                                {currentVehicle.registration} {currentVehicle.alias ? `(${currentVehicle.alias})` : ''}
                                            </span>
                                        </div>
                                        <span className="text-xs bg-green-100 text-green-800 px-2.5 py-1 rounded-full font-semibold flex items-center">
                                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                            {pickup ? 'Selected Vehicle' : 'Active Vehicle'}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Category */}
                                    <div>
                                        <label htmlFor="driver-formData-category" className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
                                        <select id="driver-formData-category"
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
                                        <label htmlFor="driver-formData-urgency" className="block text-sm font-medium text-gray-700 mb-2">Urgency *</label>
                                        <select id="driver-formData-urgency"
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
                                    <label htmlFor="driver-formData-location" className="block text-sm font-medium text-gray-700 mb-2">
                                        <MapPin className="inline w-4 h-4 mr-1" />
                                        Vehicle Location
                                    </label>
                                    <input id="driver-formData-location"
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                        placeholder="e.g., Front left headlight, Dashboard, Rear door, etc."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                {/* Description */}
                                <div>
                                    <label htmlFor="driver-formData-description" className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                                    <textarea id="driver-formData-description"
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
                                                        <span className={`text-xs px-2 py-1 rounded border ${defectSeverityClasses(defect.urgency)}`}>
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
                                    <label htmlFor="driver-formData-notes" className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label>
                                    <textarea id="driver-formData-notes"
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        placeholder="Any additional context, when it started, etc."
                                        rows={2}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                {/* Photo Attachment */}
                                <div>
                                    <label htmlFor="defect-photos" className="block text-sm font-medium text-gray-700 mb-2">
                                        <Camera className="inline w-4 h-4 mr-1" />
                                        Add photos (optional)
                                    </label>
                                    <div className="space-y-3">
                                        {/* Photo Upload Buttons */}
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={takePhoto}
                                                className="flex min-h-11 items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500"
                                            >
                                                <Camera className="h-4 w-4 mr-2" />
                                                Take Photo
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { fileInputRef.current?.removeAttribute('capture'); fileInputRef.current?.click(); }}
                                                className="flex min-h-11 items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-blue-500"
                                            >
                                                <Upload className="h-4 w-4 mr-2" />
                                                Upload Photo
                                            </button>
                                        </div>

                                        {/* Hidden File Input */}
                                        <input
                                            id="defect-photos" ref={fileInputRef}
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
                                                            aria-label={`Remove photo ${index + 1}`}
                                                            className="absolute top-1 right-1 bg-red-700 text-white rounded-full w-11 h-11 flex items-center justify-center hover:bg-red-800 focus-visible:ring-2 focus-visible:ring-blue-500"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <p className="text-xs text-gray-500">
                                            Add photographs if they help show the fault or damage. You can submit without photos.
                                        </p>
                                    </div>
                                </div>

                                {/* Submission Error */}
                                {submitError && (
                                    <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                                        <AlertTriangle className="h-5 w-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <h4 className="text-sm font-medium text-red-800">Submission Failed</h4>
                                            <p className="text-sm text-red-700 mt-1">{submitError}</p>
                                        </div>
                                    </div>
                                )}

                                {readingPhotos && <p role="status">Preparing selected photos...</p>}
                                {/* Submit */}
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={loading || !currentVehicle?.id || !formData.description}
                                        className={`px-6 py-3 rounded-lg font-medium transition ${loading || !currentVehicle?.id || !formData.description
                                            ? 'bg-gray-400 cursor-not-allowed text-white'
                                            : 'bg-red-600 hover:bg-red-700 text-white'
                                            }`}
                                    >
                                        {loading ? 'Submitting...' : 'Report Defect'}
                                    </button>
                                </div>
                              </fieldset>
                            </form>
                        </Card>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ReportDefectForm;
