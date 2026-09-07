import React from 'react';

export default function ReturnChargingChoice({ value, onChange, disabled, children }: {
  value: boolean | null; onChange: (value: boolean) => void; disabled: boolean; children: React.ReactNode;
}) {
  return <fieldset disabled={disabled} className="rounded-lg border border-teal-200 bg-teal-50 p-4">
    <legend className="px-1 text-sm font-semibold text-gray-800">Leave this vehicle for charging after return? *</legend>
    <p id="return-charging-help" className="mb-3 text-sm text-gray-700">
      Choose Yes to record a charging handover at the selected location. The handover closes when the vehicle is next picked up.
      This is separate from charging during your shift while you keep the vehicle.
    </p>
    <div className="flex gap-3">
      {[false, true].map(choice => <label key={String(choice)} className="flex min-h-12 flex-1 items-center gap-2 rounded-lg border bg-white px-4 py-3 font-semibold">
        <input type="radio" name="return-charging" value={String(choice)} checked={value === choice}
          aria-describedby="return-charging-help" onChange={() => onChange(choice)} />
        {choice ? 'Yes' : 'No'}
      </label>)}
    </div>
    {value === true && <div className="mt-4 space-y-3">
      <p className="text-sm text-gray-700">Select where you are leaving the vehicle so the charging handover has the correct location. A location is required; cost and receipt details are optional.</p>
      {children}
    </div>}
  </fieldset>;
}
