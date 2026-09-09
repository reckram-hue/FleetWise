export const SUCCESS_NOTICE_EVENT = 'fleetwise:success';
/** Display-only event; never contains report text, credentials or evidence. */
export function notifyFaultReported() {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(SUCCESS_NOTICE_EVENT, { detail: 'Fault reported successfully' }));
    }
}
