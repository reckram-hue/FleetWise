// src/store/session.ts — Driver session store.
// SECURITY: sessionToken is a SENSITIVE bearer credential. It is stored ONLY here
// (localStorage key 'fleetwise_driver_session'). Never place it in URLs, logs, analytics,
// React context, Firestore writes, or error messages. The raw PIN and pinHash are NEVER
// stored client-side anywhere.
export interface DriverSession {
  sessionToken: string;
  driverId: string;
  expiresAt: string; // ISO timestamp
}

const STORAGE_KEY = 'fleetwise_driver_session';

export function getDriverSession(): DriverSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.sessionToken === 'string' &&
      typeof parsed.driverId === 'string' &&
      typeof parsed.expiresAt === 'string'
    ) {
      return parsed as DriverSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function setDriverSession(session: DriverSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Failed to persist driver session', e);
  }
}

export function clearDriverSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear driver session', e);
  }
}

export function isSessionLocallyExpired(session?: DriverSession | null): boolean {
  const s = session === undefined ? getDriverSession() : session;
  if (!s) return true;
  const exp = new Date(s.expiresAt).getTime();
  return Number.isNaN(exp) || exp <= Date.now();
}
