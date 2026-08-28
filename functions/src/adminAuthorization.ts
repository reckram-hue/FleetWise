import * as functions from 'firebase-functions';

type CallableAuth = {
  uid: string;
} | null | undefined;

type AdminProfileData = Record<string, unknown>;

type AdminProfileDocument = {
  exists: boolean;
  data(): AdminProfileData | undefined;
};

type AdminProfileLoader = (uid: string) => Promise<AdminProfileDocument>;

export type ActiveAdminAuthorization = {
  uid: string;
  data: AdminProfileData;
};

/**
 * Canonical server-side authorization contract for every admin callable.
 * The caller must have Firebase Authentication and an active admin profile.
 */
export async function requireActiveAdmin(
  auth: CallableAuth,
  loadProfile: AdminProfileLoader,
): Promise<ActiveAdminAuthorization> {
  if (!auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const userDoc = await loadProfile(auth.uid);
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'User profile not found');
  }

  const userData = userDoc.data();
  if (userData?.role !== 'admin' || userData.employmentStatus !== 'Active') {
    throw new functions.https.HttpsError('permission-denied', 'Active admin privileges required');
  }

  return { uid: auth.uid, data: userData };
}

export function createActiveAdminProfile(
  firstName: string,
  surname: string,
  email: string,
  createdAt: unknown,
): AdminProfileData {
  return {
    firstName,
    surname,
    email,
    role: 'admin',
    employmentStatus: 'Active',
    createdAt,
  };
}
