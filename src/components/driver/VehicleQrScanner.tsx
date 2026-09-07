import React, { useEffect, useId, useRef, useState } from 'react';
import { findScannedVehicle } from '../../lib/driverVehiclePresentation';

// Reuse the existing initial-pickup library/version, loaded only after a scan action.
let libraryPromise: Promise<void> | undefined;
function loadLibrary() {
  if ((window as any).Html5Qrcode) return Promise.resolve();
  if (!libraryPromise) libraryPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); libraryPromise = undefined; reject(new Error('Camera library unavailable')); };
    document.head.appendChild(script);
  });
  return libraryPromise;
}

export default function VehicleQrScanner<T extends { id: string }>({ vehicles, onSelected, disabled = false }: {
  vehicles: T[]; onSelected: (vehicle: T) => void; disabled?: boolean;
}) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elementId = 'vehicle-qr-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const latest = useRef({ vehicles, onSelected });
  latest.current = { vehicles, onSelected };
  useEffect(() => {
    if (!scanning || disabled) return;
    let cancelled = false, accepted = false;
    let scanner: any;
    const start = async () => {
      try {
        await loadLibrary();
        if (cancelled) return;
        scanner = new (window as any).Html5Qrcode(elementId);
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } }, (text: string) => {
          if (cancelled || accepted) return;
          const vehicle = findScannedVehicle(latest.current.vehicles, text);
          if (!vehicle) { setError('Vehicle not found or unavailable. Scan another code or use manual selection.'); return; }
          accepted = true;
          setScanning(false); setError(null); latest.current.onSelected(vehicle);
        }, () => { /* Ignore individual unreadable camera frames. */ });
        if (cancelled && scanner.isScanning) await scanner.stop();
      } catch {
        if (!cancelled) { setError('Camera unavailable. Allow camera access or use manual selection.'); setScanning(false); }
      }
    };
    void start();
    return () => {
      cancelled = true;
      if (scanner?.isScanning) void scanner.stop().catch(() => {});
    };
  }, [scanning, disabled, elementId]);
  return <section className="mb-4 space-y-2" aria-label="Vehicle QR selection">
    {scanning ? <>
      <p role="status">Point your camera at the vehicle QR code.</p>
      <div id={elementId} className="w-full min-h-64 overflow-hidden rounded-lg" />
      <button type="button" onClick={() => setScanning(false)} className="w-full min-h-11 rounded-lg bg-gray-200 p-3">Cancel scan</button>
    </> : <button type="button" disabled={disabled} onClick={() => { setError(null); setScanning(true); }}
      className="w-full min-h-12 rounded-lg bg-blue-600 p-4 font-bold text-white disabled:opacity-50">Scan vehicle QR code</button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
