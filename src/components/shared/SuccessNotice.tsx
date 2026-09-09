import React, { useEffect, useState } from 'react';
import { SUCCESS_NOTICE_EVENT } from '../../lib/successNotice';

/** Mounted outside page navigation so successful submissions can close immediately. */
export default function SuccessNotice() {
    const [message, setMessage] = useState('');
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        const receive = (event: Event) => {
            clearTimeout(timer);
            setMessage((event as CustomEvent<string>).detail);
            timer = setTimeout(() => setMessage(''), 4500);
        };
        window.addEventListener(SUCCESS_NOTICE_EVENT, receive);
        return () => { clearTimeout(timer); window.removeEventListener(SUCCESS_NOTICE_EVENT, receive); };
    }, []);
    return <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none fixed bottom-4 inset-x-4 z-[60] flex justify-center">
        {message && <p className="max-w-sm rounded-lg bg-green-800 text-white px-4 py-3 shadow-lg text-center">{message}</p>}
    </div>;
}
