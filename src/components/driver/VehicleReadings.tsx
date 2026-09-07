import React from 'react';

export function VehicleStartReadings({ isEV, odometer, stateOfCharge, predictedRange }: {
  isEV: boolean; odometer?: number; stateOfCharge?: number; predictedRange?: number;
}) {
  const readings = [
    { label: 'Start Odometer', value: odometer, unit: ' km' },
    ...(isEV ? [
      { label: 'Start State of Charge', value: stateOfCharge, unit: '%' },
      { label: 'Start Predicted Range', value: predictedRange, unit: ' km' },
    ] : []),
  ].filter(reading => reading.value != null && Number.isFinite(reading.value));
  return <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
    {readings.map(reading => <div key={reading.label}>
      <dt className="text-sm text-gray-600">{reading.label}</dt>
      <dd className="font-semibold text-gray-900">{reading.value!.toLocaleString()}{reading.unit}</dd>
    </div>)}
  </dl>;
}

export function ReturnReadings({ isEV, odometer, stateOfCharge, predictedRange, disabled,
  onOdometerChange, onStateOfChargeChange, onPredictedRangeChange }: {
  isEV: boolean; odometer: string; stateOfCharge: string; predictedRange: string; disabled: boolean;
  onOdometerChange: (value: string) => void;
  onStateOfChargeChange: (value: string) => void;
  onPredictedRangeChange: (value: string) => void;
}) {
  const fields = [
    { id: 'return-odometer', label: 'End Odometer (km)', value: odometer, change: onOdometerChange, max: undefined },
    ...(isEV ? [
      { id: 'return-soc', label: 'End State of Charge (%)', value: stateOfCharge, change: onStateOfChargeChange, max: 100 },
      { id: 'return-range', label: 'End Predicted Range (km)', value: predictedRange, change: onPredictedRangeChange, max: 2000 },
    ] : []),
  ];
  return <fieldset disabled={disabled} className="space-y-4">
    <legend className="sr-only">Return vehicle readings</legend>
    {fields.map(field => <div key={field.id}>
      <label htmlFor={field.id} className="block text-sm font-semibold text-gray-700 mb-1">{field.label} *</label>
      <input id={field.id} type="number" min="0" max={field.max} required value={field.value}
        onChange={event => field.change(event.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg" />
    </div>)}
  </fieldset>;
}
