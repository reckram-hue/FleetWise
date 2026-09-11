const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, nodes, text, button } = require('./uiHarness.cjs');

const vehicles = [
  { id: 'v1', registration: 'CA 123-456', make: 'Sample', model: 'EV', status: 'Active', currentOdometer: 1000, serviceIntervalKm: 10000 },
  { id: 'v2', registration: 'CA 234-567', make: 'Sample', model: 'Car', status: 'In Service', maintenanceHold: { id: 'hold-v2' }, currentOdometer: 2000, serviceIntervalKm: 10000 },
];
const base = { vehicleId: 'v1', serviceType: 'Routine service', dueDate: '2026-09-11', dueOdometer: 10000, isBooked: true, bookedDate: '2026-09-11', bookedTime: '09:00', serviceProviderId: 'p1', revision: 3 };
const services = [{ ...base, id: 'scheduled' }, { ...base, id: 'workshop', vehicleId: 'v2', sentForService: true },
  { ...base, id: 'awaiting', vehicleId: 'v2', holdId: 'hold-v2', sentForService: true, returnedFromService: true },
  { ...base, id: 'released', sentForService: true, returnedFromService: true, releasedAt: '2026-09-10' }];
const defect = { id: 'd1', vehicleId: 'v2', driverId: 'driver', description: 'Brake noise', category: 'Mechanical', status: 'Open', urgency: 'High', reportedDateTime: new Date(), defectRevision: 3 };
function setup(overrides = {}) {
  return harness({ getVehicles: async () => vehicles, getScheduledServices: async () => services, getServiceProviders: async () => [],
    getAllDefects: async () => [defect], getMaintenanceRecords: async () => [], ...overrides });
}
async function mount(h, file, props = {}) {
  const C = h.load(`src/components/admin/${file}.tsx`).default;
  const render = () => h.render(C, props); render(); await h.settle(); return { C, render };
}
const labelled = (tree, label) => nodes(tree, n => n.props['aria-label'] === label)[0];
const stage = (tree, label) => nodes(tree, n => n.type === 'button' && text(n).startsWith(label + ' ('))[0];

test('main navigation leads with maintenance and opens the existing workflow once', async () => {
  const h = setup(), b = await mount(h, 'AdminDashboard');
  const nav = labelled(b.render(), 'Admin navigation'); assert.ok(nav);
  const first = nodes(nav, n => n.type === 'button')[0]; assert.match(text(first), /^Maintenance & Service/);
  assert.equal(nodes(b.render(), n => n.type === h.load('src/components/admin/ServiceManagement.tsx').default).length, 0);
  first.props.onClick(); const tree = b.render();
  const boards = nodes(tree, n => n.type === h.load('src/components/admin/ServiceManagement.tsx').default);
  assert.equal(boards.length, 1); assert.equal(boards[0].props.initialVehicleId, undefined);
  assert.ok(button(tree, 'Workshops / service providers')); assert.ok(button(tree, 'Manage defects'));
});

test('Manage Vehicles route and return remain available; vehicle context converges on the same board', async () => {
  const h = setup(), b = await mount(h, 'AdminDashboard'); button(b.render(), 'Vehicles').props.onClick();
  let view = b.render(); assert.equal(view.type, h.load('src/components/admin/ManageVehicles.tsx').default);
  view.props.onBack(); assert.ok(labelled(b.render(), 'Admin navigation'));
  button(b.render(), 'Vehicles').props.onClick(); b.render().props.onOpenMaintenance('v2');
  const board = nodes(b.render(), n => n.type === h.load('src/components/admin/ServiceManagement.tsx').default)[0];
  assert.equal(board.props.initialVehicleId, 'v2');
});

test('defect navigation and explicit repair link retain the vehicle without writing a service', async () => {
  const h = setup(), b = await mount(h, 'AdminDashboard'); button(b.render(), 'Manage Defects').props.onClick();
  const view = b.render(); assert.equal(view.type, h.load('src/components/admin/ManageDefects.tsx').default);
  const props = { ...view.props, selectedDefectId: 'd1' }; h.render(view.type, props); await h.settle();
  button(h.render(view.type, props), 'Plan service / repair').props.onClick();
  const board = nodes(b.render(), n => n.type === h.load('src/components/admin/ServiceManagement.tsx').default)[0];
  assert.equal(board.props.initialVehicleId, 'v2');
  h.render(board.type, board.props); await h.settle(); assert.equal(nodes(h.render(board.type, board.props), n => n.type === 'form').length, 0);
});

test('vehicle registration exposes history and service without opening an edit form', async () => {
  const opened = [], h = setup(), b = await mount(h, 'ManageVehicles', { onBack() {}, onOpenMaintenance: id => opened.push(id) });
  const history = labelled(b.render(), 'Maintenance history for CA 123-456'); assert.ok(history);
  assert.match(text(nodes(b.render(), n => n.type === 'td' && text(n).includes('CA 123-456'))[0]), /HistoryService/);
  history.props.onClick();
  const modal = nodes(b.render(), n => n.type === h.load('src/components/admin/ManageVehicles.tsx').MaintenanceModal)[0];
  assert.equal(modal.props.vehicle.id, 'v1'); modal.props.onClose();
  labelled(b.render(), 'Maintenance & Service for CA 123-456').props.onClick(); assert.deepEqual(opened, ['v1']);
  button(b.render(), 'CA 123-456').props.onClick();
  assert.ok(button(b.render(), 'Maintenance history')); assert.ok(button(b.render(), 'Maintenance & Service'));
});

test('stage filters expose the appropriate existing action and registration-first cards', async () => {
  const h = setup(), b = await mount(h, 'ServiceManagement', { onChanged() {} });
  assert.equal(nodes(b.render(), n => n.type === 'article').length, 4);
  for (const [label, action] of [['Scheduled', 'Send to workshop'], ['At workshop', 'Record completed work'], ['Awaiting release', 'Release vehicle'], ['Completed', 'View maintenance history']]) {
    stage(b.render(), label).props.onClick(); const tree = b.render();
    assert.equal(nodes(tree, n => n.type === 'article').length, 1); assert.ok(button(tree, action));
    assert.equal(stage(tree, label).props['aria-pressed'], true);
    assert.match(text(nodes(tree, n => n.type === 'article')[0]), /^CA \d{3}-\d{3}Sample/);
    assert.equal(nodes(tree, n => n.type === 'table').length, 0);
  }
});

test('history is accessible even when the selected vehicle has no booking', async () => {
  const h = setup({ getScheduledServices: async () => [] }), b = await mount(h, 'ServiceManagement', { onChanged() {} });
  assert.equal(button(b.render(), 'Maintenance history').props.disabled, true);
  labelled(b.render(), 'Filter by vehicle').props.onChange({ target: { value: 'v1' } });
  button(b.render(), 'Maintenance history').props.onClick();
  const modal = nodes(b.render(), n => n.type === h.load('src/components/admin/ManageVehicles.tsx').MaintenanceModal)[0];
  assert.equal(modal.props.vehicle.id, 'v1');
});

test('explicit TEST context remains labelled and returning to all vehicles restores exclusion', async () => {
  const v = { ...vehicles[0], isTestData: true }, h = setup({ getVehicles: async () => [v] });
  const b = await mount(h, 'ServiceManagement', { initialVehicleId: 'v1', onChanged() {} });
  assert.match(text(nodes(b.render(), n => n.type === 'article')[0]), /^CA 123-456 — TEST/);
  labelled(b.render(), 'Filter by vehicle').props.onChange({ target: { value: '' } });
  assert.deepEqual(nodes(b.render(), n => n.type === 'article').map(n => n.key), ['workshop', 'awaiting']); // Only v2's non-TEST services remain.
});

test('vehicle-context scheduling preserves callable payload names and does not write on navigation', async () => {
  const calls = [], h = setup({ saveScheduledServiceAdmin: async p => calls.push(p) });
  const b = await mount(h, 'ServiceManagement', { initialVehicleId: 'v1', onChanged() {} });
  button(b.render(), 'Schedule service').props.onClick(); assert.equal(calls.length, 0);
  let form = nodes(b.render(), n => n.type === 'form')[0];
  const vehicleSelect = nodes(form, n => n.type === 'select')[0]; assert.equal(vehicleSelect.props.value, 'v1');
  button(b.render(), 'Cancel').props.onClick(); button(b.render(), 'Book / edit').props.onClick();
  form = nodes(b.render(), n => n.type === 'form')[0]; await form.props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1); assert.equal(calls[0].serviceId, 'scheduled'); assert.equal(calls[0].expectedRevision, 3);
  assert.deepEqual(Object.keys(calls[0]).sort(), ['serviceId','vehicleId','serviceType','dueDate','dueOdometer','bookedDate','bookedTime','serviceProviderId','notes','linkedDefectIds','expectedRevision'].sort());
});

test('send to workshop retains the dispatch callable contract', async () => {
  const calls = [], h = setup({ dispatchServiceAdmin: async p => calls.push(p) }), b = await mount(h, 'ServiceManagement', { onChanged() {} });
  button(b.render(), 'Send to workshop').props.onClick();
  await nodes(b.render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  assert.deepEqual(Object.keys(calls[0]).sort(), ['serviceId', 'vehicleId', 'sentDate'].sort());
  assert.equal(calls[0].serviceId, 'scheduled'); assert.equal(calls[0].vehicleId, 'v1');
});
