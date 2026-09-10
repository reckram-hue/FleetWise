const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, nodes, text, button } = require('./uiHarness.cjs');

const vehicle = { id: 'qa-ice', registration: 'TEST ICE', isTestData: true, status: 'Active' };
const setup = overrides => harness({ getVehicles: async () => [vehicle], getScheduledServices: async () => [],
  getServiceProviders: async () => [], getAllDefects: async () => [], ...overrides });
async function mount(h, name, props = {}) {
  const C = h.load(`src/components/admin/${name}.tsx`).default;
  const render = () => h.render(C, props); render(); await h.settle(); return render;
}

test('empty workshop guidance appears before booking and beside the required selector, retaining TEST vehicle context', async () => {
  const opened = [], h = setup(), render = await mount(h, 'ServiceManagement', {
    initialVehicleId: vehicle.id, onChanged() {}, onManageWorkshops: id => opened.push(id),
  });
  assert.match(text(render()), /No active workshops/);
  button(render(), 'Manage workshops').props.onClick();
  button(render(), 'Schedule service').props.onClick();
  const form = nodes(render(), n => n.type === 'form')[0];
  assert.match(text(form), /All booking fields are required except notes and defect links/);
  assert.match(text(form), /Re-enter any unsaved booking details/);
  button(form, 'Manage workshops').props.onClick();
  assert.deepEqual(opened, [vehicle.id, vehicle.id]);
});

test('workshop setup returns to maintenance and preserves vehicle context; dashboard provider entry still returns home', async () => {
  const h = setup(), render = await mount(h, 'AdminDashboard');
  button(render(), 'Vehicles').props.onClick(); render().props.onOpenMaintenance(vehicle.id);
  const Board = h.load('src/components/admin/ServiceManagement.tsx').default;
  nodes(render(), n => n.type === Board)[0].props.onManageWorkshops(vehicle.id);
  assert.equal(render().props.backLabel, 'Back to Maintenance & Service');
  render().props.onBack();
  assert.equal(nodes(render(), n => n.type === Board)[0].props.initialVehicleId, vehicle.id);
  nodes(render(), n => typeof n.type === 'function' && n.type.name === 'Header')[0].props.onBack();
  button(render(), 'Service Providers').props.onClick();
  assert.equal(render().props.backLabel, 'Back to Dashboard');
});

test('legacy providers with missing or malformed specializations render and can be reviewed without writes', async () => {
  let writes = 0; const calls = [];
  const rows = [undefined, null, 'General', { bad: true }, ['ICE', null]].map((specializations, i) => ({
    id: 'legacy-' + i, name: 'LOCAL TEST ' + i, isActive: false, specializations,
  }));
  const h = setup({ getServiceProviders: async activeOnly => { calls.push(activeOnly); return activeOnly ? [] : rows; },
    updateServiceProvider: async () => { writes++; } });
  const render = await mount(h, 'ManageServiceProviders', { onBack() {} });
  nodes(render(), n => n.type === 'input' && n.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } });
  render(); await h.settle();
  assert.deepEqual(calls, [true, false]);
  assert.equal(nodes(render(), n => n.type === 'tr' && n.key).length, 5);
  assert.match(text(render()), /Specializations not recorded/);
  const edit = nodes(render(), n => n.props['aria-label'] === 'Edit LOCAL TEST 3')[0]; edit.props.onClick();
  const Modal = h.load('src/components/admin/ManageServiceProviders.tsx').ServiceProviderModal;
  const modal = nodes(render(), n => n.type === Modal)[0];
  assert.doesNotThrow(() => h.render(Modal, modal.props));
  assert.match(text(h.render(Modal, modal.props)), /Address \(optional\)/);
  assert.equal(writes, 0);
});

test('provider load failure offers retry instead of claiming no configured workshops', async () => {
  let fail = true;
  const h = setup({ getServiceProviders: async () => { if (fail) throw Error('offline'); return []; } });
  const render = await mount(h, 'ManageServiceProviders', { onBack() {} });
  assert.match(text(nodes(render(), n => n.props.role === 'alert')[0]), /Could not load/);
  assert.doesNotMatch(text(render()), /No active workshops/);
  fail = false; await button(render(), 'Retry loading providers').props.onClick();
  assert.match(text(render()), /No active workshops/);
});

test('stale assignment explanation is visible and retries retain the originally reviewed revision', async () => {
  const calls = [], h = setup({ transitionDefectAdmin: async p => { calls.push(p); throw Error('Defect changed. Reload and review before changing its status.'); } });
  const C = h.load('src/components/admin/ManageDefects.tsx').AssignDefectModal;
  const defect = { id: 'test-defect', status: 'Open', defectRevision: 4, description: 'TEST ONLY' };
  let saves = 0; const props = { defect, onClose() {}, onSave() { saves++; } }, render = () => h.render(C, props);
  nodes(render(), n => n.type === 'input' && n.props.type === 'text')[0].props.onChange({ target: { value: 'TEST workshop' } });
  defect.defectRevision = 5;
  await nodes(render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  assert.match(text(nodes(render(), n => n.props.role === 'alert')[0]), /Defect changed\. Reload and review/);
  await nodes(render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  assert.equal(calls[0].expectedDefectRevision, 4); assert.equal(calls[1].expectedDefectRevision, 4);
  assert.equal(calls[0].requestId, calls[1].requestId); assert.equal(saves, 0);
});

test('canonical history presents the saved workshop snapshot and does not invent missing historical workshops', async () => {
  const h = setup({ getMaintenanceRecords: async () => [
    { id: 'saved', date: '2026-09-10', serviceType: 'TEST service', odometer: 2515, cost: 125, serviceProvider: 'TEST saved workshop', notes: 'TEST work' },
    { id: 'old', date: '2026-09-09', serviceType: 'TEST legacy', odometer: 2500, cost: 0 },
  ] });
  const C = h.load('src/components/admin/ManageVehicles.tsx').MaintenanceModal;
  const props = { vehicle, onClose() {}, onRecordAdded() {} };
  h.render(C, props); await h.settle();
  const cards = nodes(h.render(C, props), n => n.type === 'article');
  assert.match(text(cards[0]), /Workshop: TEST saved workshop/);
  assert.match(text(cards[1]), /Workshop: Not recorded/);
});
