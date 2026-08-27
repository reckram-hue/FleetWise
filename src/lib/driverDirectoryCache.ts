import type { User } from '../types';

const DRIVER_DIRECTORY_CACHE_KEY = 'fleetwise_driver_directory_cache';
export const DRIVER_DIRECTORY_TTL_MS = 5 * 60 * 1000;

type StoredDriverDirectoryCache = {
  version: 1;
  users: User[];
  fetchedAt: string;
  expiresAt: string;
};

export type DriverDirectoryCacheEntry = {
  users: User[];
  fetchedAt: string;
  expiresAt: string;
  isStale: boolean;
};

export function readDriverDirectoryCache(now = Date.now()): DriverDirectoryCacheEntry | null {
  try {
    const raw = localStorage.getItem(DRIVER_DIRECTORY_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredDriverDirectoryCache>;
    if (
      parsed?.version !== 1
      || !Array.isArray(parsed.users)
      || typeof parsed.fetchedAt !== 'string'
      || typeof parsed.expiresAt !== 'string'
    ) {
      return null;
    }

    const expiresAtMs = new Date(parsed.expiresAt).getTime();
    return {
      users: parsed.users as User[],
      fetchedAt: parsed.fetchedAt,
      expiresAt: parsed.expiresAt,
      isStale: Number.isNaN(expiresAtMs) || expiresAtMs <= now,
    };
  } catch {
    return null;
  }
}

export function writeDriverDirectoryCache(users: User[], now = Date.now()): void {
  const payload: StoredDriverDirectoryCache = {
    version: 1,
    users,
    fetchedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + DRIVER_DIRECTORY_TTL_MS).toISOString(),
  };

  try {
    localStorage.setItem(DRIVER_DIRECTORY_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to persist driver directory cache', error);
  }
}

export function clearDriverDirectoryCache(): void {
  try {
    localStorage.removeItem(DRIVER_DIRECTORY_CACHE_KEY);
  } catch (error) {
    console.error('Failed to clear driver directory cache', error);
  }
}
