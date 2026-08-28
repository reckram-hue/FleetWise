const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
  createActiveAdminProfile,
  requireActiveAdmin,
} = require('../lib/adminAuthorization.js');

function profileDocument(data, exists = true) {
  return {
    exists,
    data: () => data,
  };
}

async function assertAuthorizationDenied(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, expectedCode);
    return true;
  });
}

describe('canonical active-admin callable authorization', () => {
  test('unauthenticated caller is denied', async () => {
    await assertAuthorizationDenied(
      requireActiveAdmin(undefined, async () => profileDocument(undefined, false)),
      'unauthenticated',
    );
  });

  test('authenticated non-admin is denied', async () => {
    await assertAuthorizationDenied(
      requireActiveAdmin(
        { uid: 'driver-uid' },
        async () => profileDocument({ role: 'driver', employmentStatus: 'Active' }),
      ),
      'permission-denied',
    );
  });

  test('inactive admin is denied', async () => {
    await assertAuthorizationDenied(
      requireActiveAdmin(
        { uid: 'inactive-admin-uid' },
        async () => profileDocument({ role: 'admin', employmentStatus: 'Inactive' }),
      ),
      'permission-denied',
    );
  });

  test('admin profile without employmentStatus is denied closed', async () => {
    await assertAuthorizationDenied(
      requireActiveAdmin(
        { uid: 'legacy-admin-uid' },
        async () => profileDocument({ role: 'admin' }),
      ),
      'permission-denied',
    );
  });

  test('active admin is allowed', async () => {
    const authorization = await requireActiveAdmin(
      { uid: 'active-admin-uid' },
      async () => profileDocument({ role: 'admin', employmentStatus: 'Active' }),
    );

    assert.equal(authorization.uid, 'active-admin-uid');
    assert.equal(authorization.data.role, 'admin');
    assert.equal(authorization.data.employmentStatus, 'Active');
  });

  test('new admin profiles always include employmentStatus Active', () => {
    const createdAt = { sentinel: 'server-timestamp' };
    const profile = createActiveAdminProfile(
      'Test',
      'Administrator',
      'test-admin@example.com',
      createdAt,
    );

    assert.deepEqual(profile, {
      firstName: 'Test',
      surname: 'Administrator',
      email: 'test-admin@example.com',
      role: 'admin',
      employmentStatus: 'Active',
      createdAt,
    });
  });
});
