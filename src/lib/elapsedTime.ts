export function elapsedTime(start: Date | string, now = Date.now()) {
    const delta = now - new Date(start).getTime();
    const minutes = Number.isFinite(delta) ? Math.floor(Math.max(0, delta) / 60000) : 0;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
