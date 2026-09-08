import type { User } from '../types';

/** Firebase initialization must finish before testing currentUser; profile remains server-authoritative. */
export async function restoreAdminProfile(auth: { authStateReady: () => Promise<void>; currentUser: unknown }, getProfile: () => Promise<User | null>) {
    await auth.authStateReady();
    if (!auth.currentUser) return null;
    const profile = await getProfile();
    return profile?.role === 'admin' && profile.employmentStatus === 'Active' ? profile : null;
}
