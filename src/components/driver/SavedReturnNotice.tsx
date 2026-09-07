import React from 'react';

export default function SavedReturnNotice({ odometer, busy, error, onComplete }: {
  odometer: number; busy: boolean; error: string | null; onComplete: () => void;
}) {
  return <section aria-label="Saved vehicle return">
    <h3 className="text-xl font-bold">Return inspection saved</h3>
    <p>Your inspection, photos and damage declaration are already recorded. You do not need to repeat them. Complete the vehicle return to continue.</p>
    <p className="mt-2 text-sm text-gray-700">Recorded return odometer: {odometer.toLocaleString()} km.</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={onComplete}
      className="mt-4 min-h-12 w-full rounded-lg bg-green-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
      {busy ? 'Completing vehicle return...' : 'Complete vehicle return'}
    </button>
  </section>;
}
