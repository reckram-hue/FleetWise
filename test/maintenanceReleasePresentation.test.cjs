const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, nodes, text, button } = require('./uiHarness.cjs');

const service = { id: 'service', vehicleId: 'vehicle', serviceType: 'Saved repair', isBooked: true,
  sentForService: true, returnedFromService: true, holdId: 'original-service-hold',
  completedAt: new Date('2026-09-11T06:28:56Z'), returnDate: '2026-09-11', dueDate: '2026-09-10', actualCost: 125 };
const released = { id: 'vehicle', registration: 'TEST ICE', status: 'Active', maintenanceHold: null,
  manualMaintenanceHold: false, lastReleasedAt: new Date('2026-09-11T06:31:43Z'), lastReleasedBy: 'admin' };
function setup(reads = {}) { return harness({ getScheduledServices: async () => [structuredClone(service)],
  getVehicles: async () => [structuredClone(released)], getServiceProviders: async () => [], getAllDefects: async () => [], ...reads }); }
async function board(h) {
  const C = h.load('src/components/admin/ServiceManagement.tsx').default, props = { onChanged() {} };
  const render = () => h.render(C, props); render(); await h.settle(); return render;
}
const cards = tree => nodes(tree, n => n.type === 'article');

test('explicit service release wins over a later unrelated vehicle hold', () => {
  const present = setup().load('src/components/admin/ServiceManagement.tsx').servicePresentation;
  const state = present({ ...service, releasedAt: new Date('2026-09-11T06:30:00Z') },
    { ...released, status: 'Repairs', maintenanceHold: { id: 'later-hold' } });
  assert.equal(state.label, 'Released / Completed'); assert.equal(state.canRelease, false);
});

test('explicit release with incomplete legacy flags offers history only, not booking or completion', async () => {
  const h = setup({ getScheduledServices: async () => [{ ...service, sentForService: false, returnedFromService: false, releasedAt: new Date('2026-09-11T06:31:43Z') }] });
  const render = await board(h), card = cards(render())[0];
  assert.match(text(card), /Released \/ Completed/);
  assert.deepEqual(nodes(card, n => n.type === 'button').map(text), ['View maintenance history']);
});

test('dated separate lifecycle release after completion reproduces the real TEST hold mismatch without rewriting ownership', async () => {
  for (let reload = 0; reload < 2; reload++) {
    const h = setup(), render = await board(h), card = cards(render())[0];
    assert.match(text(card), /^TEST ICE/);
    assert.match(text(card), /Released \/ Completed/); assert.match(text(card), /separate lifecycle review/);
    assert.doesNotMatch(text(card), /Awaiting release/); assert.equal(button(card, 'Release vehicle'), undefined);
    assert.ok(button(card, 'View maintenance history'));
    assert.equal(service.releasedAt, undefined); assert.equal(service.holdId, 'original-service-hold');
  }
});

test('fresh reads move card, action and stage together after separate lifecycle release', async () => {
  let current = { ...released, status: 'In Service', lastReleasedAt: undefined, maintenanceHold: { id: service.holdId } };
  const h = setup({ getVehicles: async () => [structuredClone(current)] }), render = await board(h);
  assert.match(text(cards(render())[0]), /Awaiting release/); assert.ok(button(cards(render())[0], 'Release vehicle'));
  current = released; button(render(), 'Refresh services').props.onClick(); await h.settle();
  assert.match(text(cards(render())[0]), /Released \/ Completed/); assert.equal(button(cards(render())[0], 'Release vehicle'), undefined);
  button(render(), 'Completed (1)').props.onClick(); assert.equal(cards(render()).length, 1);
  button(render(), 'Awaiting release (0)').props.onClick(); assert.equal(cards(render()).length, 0);
});

test('successful service release reloads persisted metadata and removes the release action', async () => {
  let saved = structuredClone(service), current = { ...released, status: 'In Service', maintenanceHold: { id: service.holdId } };
  const calls = [], h = setup({ getScheduledServices: async () => [structuredClone(saved)], getVehicles: async () => [structuredClone(current)],
    changeVehicleLifecycleAdmin: async p => { calls.push(p); saved = { ...saved, releasedAt: new Date('2026-09-11T06:31:43Z') }; current = released; return structuredClone(current); } });
  const render = await board(h); button(render(), 'Release vehicle').props.onClick();
  await nodes(render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  assert.equal(calls[0].releaseServiceId, service.id); assert.equal(calls[0].expectedHoldId, service.holdId);
  assert.match(text(cards(render())[0]), /Released \/ Completed/); assert.equal(button(cards(render())[0], 'Release vehicle'), undefined);
  const fresh = await board(setup({ getScheduledServices: async () => [structuredClone(saved)] }));
  assert.match(text(cards(fresh())[0]), /Released \/ Completed/); assert.equal(button(cards(fresh())[0], 'Release vehicle'), undefined);
});

test('current separate manual hold offers lifecycle guidance and cannot be released as the old service', async () => {
  const h = setup({ getVehicles: async () => [{ ...released, status: 'In Service', maintenanceHold: { id: 'manual-hold' }, manualMaintenanceHold: true }] });
  const render = await board(h), card = cards(render())[0];
  assert.match(text(card), /Awaiting release/); assert.match(text(card), /separate hold is active/);
  assert.equal(button(card, 'Release vehicle'), undefined);
});

for (const [name, s, v] of [
  ['Active alone', service, { id: 'vehicle', status: 'Active' }],
  ['release predates completion', service, { ...released, lastReleasedAt: new Date('2026-09-10') }],
  ['same timestamp is ambiguous', service, { ...released, lastReleasedAt: service.completedAt }],
  ['missing completion timestamp', { ...service, completedAt: undefined }, released],
  ['missing legacy hold identity', { ...service, holdId: undefined }, released],
  ['missing release actor', service, { ...released, lastReleasedBy: undefined }],
  ['malformed release timestamp', service, { ...released, lastReleasedAt: new Date('invalid') }],
  ['vehicle identity mismatch', service, { ...released, id: 'unrelated' }],
  ['hold fields not explicitly cleared', service, { ...released, maintenanceHold: undefined }],
  ['manual hold still set', service, { ...released, manualMaintenanceHold: true }],
]) test(`${name} does not fabricate release evidence`, () => {
  const state = setup().load('src/components/admin/ServiceManagement.tsx').servicePresentation(s, v);
  assert.equal(state.label, 'Work completed — release status unavailable');
  assert.equal(state.stage, 'Release status unavailable'); assert.equal(state.canRelease, false);
});

test('Firestore/callable timestamp normalization retains completion and vehicle-release evidence', () => {
  const h = setup(), convert = h.load('src/lib/convertTimestamps.ts').convertTimestamps;
  const s = convert({ ...service, completedAt: { seconds: 1789108136, nanoseconds: 0 } });
  const v = convert({ ...released, lastReleasedAt: { _seconds: 1789108303, _nanoseconds: 0 } });
  assert.equal(h.load('src/components/admin/ServiceManagement.tsx').servicePresentation(s, v).stage, 'Completed');
});

test('workshop snapshots survive provider deletion/inactivation and fresh mounts without current-default substitution', async () => {
  for (const currentProvider of [[], [{ id: 'old-provider', name: 'Renamed inactive provider', isActive: false }]]) {
    for (let refresh = 0; refresh < 2; refresh++) {
      const reads = [], h = setup({ getServiceProviders: async () => { assert.fail('History must not join current providers'); return currentProvider; },
        getMaintenanceRecords: async id => { reads.push(id); return structuredClone([
          { id: 'saved', date: '2026-09-11', odometer: 2515, cost: 125, serviceType: 'Saved repair', serviceProviderId: 'old-provider', serviceProvider: 'Original saved workshop' },
          { id: 'legacy', date: '2026-08-01', odometer: 2000, cost: 0, serviceType: 'Legacy work' },
        ]); } });
      const C = h.load('src/components/admin/ManageVehicles.tsx').MaintenanceModal;
      const props = { vehicle: { ...released, defaultServiceProviderId: 'current-default', maintenanceHistory: [{ serviceProvider: 'Stale embedded workshop' }] }, onClose() {}, onRecordAdded() {} };
      h.render(C, props); await h.settle(); const tree = h.render(C, props), history = cards(tree);
      assert.deepEqual(reads, ['vehicle']); assert.match(text(tree), /Maintenance history — TEST ICE/);
      assert.match(text(history[0]), /Workshop: Original saved workshop/);
      assert.match(text(history[1]), /Workshop: Not recorded/);
      assert.doesNotMatch(text(history), /Renamed inactive|Stale embedded|current-default/);
    }
  }
});
