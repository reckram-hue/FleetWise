import React, { useEffect, useState } from 'react';
import { Loader, MapPin } from 'lucide-react';
import api from '../../services/firebaseApi';
import { ChargingLocationForDriver, ChargingLocationType } from '../../types';

interface ChargingLocationPickerProps {
  driverId: string;
  sessionToken: string;
  value: string;
  onChange: (location: ChargingLocationForDriver | null) => void;
  disabled?: boolean;
}

const typeLabel: Record<ChargingLocationType, string> = {
  OFFICE: 'Office',
  PUBLIC_THIRD_PARTY: 'Public charging',
};

const ChargingLocationPicker: React.FC<ChargingLocationPickerProps> = ({
  driverId,
  sessionToken,
  value,
  onChange,
  disabled = false,
}) => {
  const [locations, setLocations] = useState<ChargingLocationForDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadLocations = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.listChargingLocationsForSession(driverId, sessionToken);
        if (cancelled) return;
        setLocations([...result].sort((a, b) => {
          const nameOrder = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
          return nameOrder || a.id.localeCompare(b.id, 'en', { sensitivity: 'base' });
        }));
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load charging locations', err);
          setError('Unable to load charging locations. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadLocations();
    return () => { cancelled = true; };
  }, [driverId, sessionToken]);

  const selectedLocation = locations.find((location) => location.id === value) ?? null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600" role="status">
        <Loader className="h-4 w-4 animate-spin" />
        Loading charging locations...
      </div>
    );
  }

  if (error) {
    return <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>;
  }

  if (locations.length === 0) {
    return <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-600">No active charging locations are available.</p>;
  }

  return (
    <div className="space-y-2">
      <label htmlFor="charging-location" className="block text-sm font-medium text-gray-700">
        Charging location
      </label>
      <select
        id="charging-location"
        value={value}
        onChange={(event) => {
          const location = locations.find((item) => item.id === event.target.value) ?? null;
          onChange(location);
        }}
        disabled={disabled}
        className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm disabled:cursor-not-allowed disabled:bg-gray-100"
      >
        <option value="">Select a charging location</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name} ({typeLabel[location.type]})
          </option>
        ))}
      </select>
      {selectedLocation && (
        <div className="flex gap-2 rounded-md bg-teal-50 p-3 text-sm text-teal-900">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{selectedLocation.name}</p>
            <p>
              {typeLabel[selectedLocation.type]}
              {selectedLocation.provider ? ` | ${selectedLocation.provider}` : ''}
              {selectedLocation.chargerType ? ` | ${selectedLocation.chargerType}` : ''}
              {` | ${selectedLocation.costOwner === 'COMPANY' ? 'Company paid' : 'Driver paid'}`}
            </p>
            {selectedLocation.description && <p className="mt-1">{selectedLocation.description}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChargingLocationPicker;
