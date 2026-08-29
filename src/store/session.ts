// src/store/session.ts — Driver session store.
// SECURITY: sessionToken is a SENSITIVE bearer credential. It is stored ONLY here
// (localStorage key 'fleetwise_driver_session'). Never place it in URLs, logs, analytics,
// React context, Firestore writes, or error messages. The raw PIN and pinHash are NEVER
// stored client-side anywhere.
export interface DriverSession {
  sessionToken: string;
  driverId: string;
  expiresAt: string; // ISO timestamp
  projectId?: string; // Firebase project this session was issued against (migration guard)
}

const STORAGE_KEY = 'fleetwise_driver_session';

// The project this session-storage format shipped under before `projectId` existed.
// A stored session with no projectId predates the migration guard and is treated as
// if it were tagged with this project — so current fleetwise-9ab3a production keeps
// restoring untagged sessions unchanged, while a build for any other project (e.g.
// Johannesburg) correctly treats an untagged session as foreign and clears it.
const LEGACY_UNTAGGED_PROJECT_ID = 'fleetwise-9ab3a';

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
      const currentProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
      const sessionProjectId =
        typeof parsed.projectId === 'string' && parsed.projectId
          ? parsed.projectId
          : LEGACY_UNTAGGED_PROJECT_ID;
      if (currentProjectId && sessionProjectId !== currentProjectId) {
        clearDriverSession();
        return null;
      }
      return parsed as DriverSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function setDriverSession(session: DriverSession): void {
  try {
    const currentProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    const toStore: DriverSession = currentProjectId
      ? { ...session, projectId: currentProjectId }
      : session;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
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
