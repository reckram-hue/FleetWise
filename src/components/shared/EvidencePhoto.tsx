import React, { useState } from 'react';

export default function EvidencePhoto({ caption, load }: { caption: string; load: () => Promise<{ imageDataUrl: string }> }) {
    const [image, setImage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    return <div className="my-3">
        <button className="min-h-11 text-blue-700 underline disabled:opacity-50" disabled={busy} onClick={async () => {
            setBusy(true); setError('');
            try {
                const result = await load();
                if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(result.imageDataUrl)) throw new Error('Invalid evidence response');
                setImage(result.imageDataUrl);
            } catch (e: any) {
                const code = String(e?.code || '').split('/').pop();
                setError(code === 'not-found' ? 'Evidence photo is missing. Contact support.'
                    : code === 'permission-denied' || code === 'unauthenticated' ? 'You are not authorized to view this evidence. Sign in again.'
                    : code === 'failed-precondition' ? 'Evidence is invalid or has changed. Contact support.'
                    : 'Evidence could not be retrieved. Retry or contact support.');
            } finally { setBusy(false); }
        }}>{busy ? 'Loading evidence…' : `View photo: ${caption}`}</button>
        {image && <img src={image} alt={caption} className="max-h-96 max-w-full rounded" onError={() => { setImage(''); setError('The evidence image could not be displayed. Retry or contact support.'); }} />}
        {error && <p role="alert">{error}</p>}
    </div>;
}
