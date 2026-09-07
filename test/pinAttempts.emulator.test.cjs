// Build both production backends first. Run only against a local Firestore emulator:
// FIRESTORE_EMULATOR_HOST=127.0.0.1:18081 node --test test/pinAttempts.emulator.test.cjs
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const Module = require('node:module');

// Fail before initializing any SDK if no explicit loopback emulator is selected.
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const projectId = 'demo-fleetwise-pin-test';
const clients = [];
after(async () => { await Promise.all(clients.map(db => db.terminate())); });

for (const backend of ['functions', 'functions-prod-jhb']) {
  const localRequire = Module.createRequire(resolve(backend, 'package.json'));
  const { Firestore, Timestamp, FieldValue } = localRequire('firebase-admin/firestore');
  const bcrypt = localRequire('bcryptjs');
  const { HttpsError } = localRequire('firebase-functions/v2/https');
  const db = new Firestore({ projectId });
  clients.push(db);
  const { reservePinAttempt, pinAttemptDocumentId, PIN_ATTEMPT_WINDOW_MS } =
    localRequire('./lib/pinAttempts.js');

  // Execute real compiled handlers with the transport wrapper removed. All Admin
  // Firestore access is injected into the demo emulator; Auth/Storage are forbidden.
  const filename = resolve(backend, 'lib/index.js');
  const loaded = new Module(filename, module);
  const realRequire = Module.createRequire(filename);
  const firestore = Object.assign(() => db, { Timestamp, FieldValue });
  const admin = {
    initializeApp: options => ({ options }),
    firestore,
    auth: () => { throw new Error('Auth service must not be accessed in this test'); },
    storage: () => { throw new Error('Storage must not be accessed in this test'); },
  };
  const https = { HttpsError, onCall: handler => handler };
  loaded.require = name => {
    if (name === 'firebase-admin') return admin;
    if (name === 'firebase-functions') return { https, runWith: () => ({ https }) };
    if (name === 'firebase-functions/v2/https') return {
      HttpsError, onCall: (_options, handler) => (data, context) => handler({ ...context, data }),
    };
    return realRequire(name);
  };
  loaded._compile(readFileSync(filename, 'utf8'), filename);
  const api = loaded.exports;
  const driverId = () => backend + '-' + randomUUID();
  async function seedDriver(status = 'Active') {
    const id = driverId();
    await db.collection('users').doc(id).set({
      role: 'driver', employmentStatus: status, pinHash: await bcrypt.hash('2468', 4),
      firstName: 'Synthetic', surname: 'Test', isTestData: true,
    });
    return id;
  }
  const wrongLogin = (id, deviceId) => api.driverLogin({ driverId: id, pin: '1111', deviceId }, {});
  const wrongChange = id => api.driverChangePin({ driverId: id, currentPin: '1111', newPin: '5678' }, {});
  const expectCode = (operation, code) => assert.rejects(operation, error => error.code === code);

  test(backend + ': login and PIN change share six attempts despite rotated devices', async () => {
    const id = await seedDriver();
    for (let i = 0; i < 6; i++) {
      await expectCode(i % 2 ? wrongChange(id) : wrongLogin(id, 'device-' + i), 'permission-denied');
    }
    await expectCode(wrongLogin(id, 'new-device'), 'resource-exhausted');
    await expectCode(wrongChange(id), 'resource-exhausted');
    await expectCode(api.driverLogin({ driverId: id, pin: '2468', deviceId: 'correct-but-blocked' }, {}), 'resource-exhausted');
  });

  test(backend + ': Firestore contention admits only one request for the last slot', async () => {
    const id = await seedDriver();
    for (let i = 0; i < 5; i++) await expectCode(wrongLogin(id, 'd' + i), 'permission-denied');
    const results = await Promise.allSettled([wrongLogin(id, 'parallel'), wrongChange(id)]);
    assert.deepEqual(results.map(r => r.reason.code).sort(), ['permission-denied', 'resource-exhausted']);
    assert.equal((await db.collection('rateLimits').doc(pinAttemptDocumentId(id)).get()).data().attempts, 6);
  });

  test(backend + ': success refunds only itself; duplicate/late refund cannot erase failures', async () => {
    const id = driverId();
    let now = 1000;
    const success = await reservePinAttempt(db, id, () => now);
    await reservePinAttempt(db, id, () => now); // another failed attempt
    await success();
    await success();
    const ref = db.collection('rateLimits').doc(pinAttemptDocumentId(id));
    assert.equal((await ref.get()).data().attempts, 1);
    const lateSuccess = await reservePinAttempt(db, id, () => now);
    now += PIN_ATTEMPT_WINDOW_MS;
    await reservePinAttempt(db, id, () => now);
    await lateSuccess();
    assert.equal((await ref.get()).data().attempts, 1);
  });

  test(backend + ': blocked window expires at exactly ten minutes', async () => {
    const id = driverId();
    for (let i = 0; i < 6; i++) await reservePinAttempt(db, id, () => 1000);
    await expectCode(reservePinAttempt(db, id, () => 1000 + PIN_ATTEMPT_WINDOW_MS - 1), 'resource-exhausted');
    await reservePinAttempt(db, id, () => 1000 + PIN_ATTEMPT_WINDOW_MS);
  });

  test(backend + ': successful login and self-change retain session policy and refund successful attempts', async () => {
    const id = await seedDriver();
    await expectCode(wrongLogin(id, 'one'), 'permission-denied');
    const login = await api.driverLogin({ driverId: id, pin: '2468', deviceId: 'success' }, {});
    assert.equal(typeof login.sessionToken, 'string');
    assert.equal(login.driver.id, id);
    const sessions = await db.collection('driverSessions').where('driverId', '==', id).get();
    assert.equal(sessions.size, 1);
    const before = sessions.docs[0].data();
    const changed = await api.driverChangePin({ driverId: id, currentPin: '2468', newPin: '5678' }, {});
    assert.equal(changed.success, true);
    assert.ok(await bcrypt.compare('5678', (await db.collection('users').doc(id).get()).data().pinHash));
    assert.deepEqual((await sessions.docs[0].ref.get()).data(), before);
    assert.equal((await db.collection('rateLimits').doc(pinAttemptDocumentId(id)).get()).data().attempts, 1);
  });

  test(backend + ': inactive and archived drivers cannot login or change PIN', async () => {
    for (const status of ['Inactive', 'Archived']) {
      const id = await seedDriver(status);
      await expectCode(api.driverLogin({ driverId: id, pin: '2468' }, {}), 'failed-precondition');
      await expectCode(api.driverChangePin({ driverId: id, currentPin: '2468', newPin: '5678' }, {}), 'failed-precondition');
      assert.ok(await bcrypt.compare('2468', (await db.collection('users').doc(id).get()).data().pinHash));
    }
  });

  test(backend + ': admin reset retains active-admin authorization and session revocation', async () => {
    const id = await seedDriver();
    const uid = driverId();
    await db.collection('users').doc(uid).set({ role: 'admin', employmentStatus: 'Active' });
    const session = db.collection('driverSessions').doc(driverId());
    await session.set({ driverId: id, isRevoked: false });
    for (let i = 0; i < 6; i++) await reservePinAttempt(db, id);
    await expectCode(api.adminSetDriverPin({ driverId: id, newPin: '5678' }, {}), 'unauthenticated');
    await db.collection('users').doc(uid).update({ employmentStatus: 'Inactive' });
    await expectCode(api.adminSetDriverPin({ driverId: id, newPin: '5678' }, { auth: { uid } }), 'permission-denied');
    await db.collection('users').doc(uid).update({ employmentStatus: 'Active' });
    await api.adminSetDriverPin({ driverId: id, newPin: '5678' }, { auth: { uid } });
    assert.ok(await bcrypt.compare('5678', (await db.collection('users').doc(id).get()).data().pinHash));
    assert.equal((await session.get()).data().isRevoked, true);
    assert.equal((await session.get()).data().revokedReason, 'pin_reset');
    assert.equal((await db.collection('rateLimits').doc(pinAttemptDocumentId(id)).get()).exists, false);
  });
}
