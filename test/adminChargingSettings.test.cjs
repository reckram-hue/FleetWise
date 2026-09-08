const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

// Real component handlers with isolated hook state and local API doubles; no cloud writes.
function harness(overrides = {}) {
  const cache = new Map(), instances = new Map(); let current, cursor;
  const api = { getSettings: async () => ({ areas: ['Cape Town'], departments: ['Operations'] }),
    getAdminUsers: async () => [], getVehicles: async () => [], getUsers: async () => [], getActiveDefects: async () => [],
    listChargingLocationsAdmin: async () => [], ...overrides };
  const hooks = { ...React, useState(initial) {
    const instance = current, i = cursor++; if (!(i in instance.state)) instance.state[i] = initial;
    return [instance.state[i], next => instance.state[i] = typeof next === 'function' ? next(instance.state[i]) : next];
  }, useEffect(callback, deps) {
    const i = cursor++, old = current.deps[i];
    if (!old || !deps || deps.some((v, j) => !Object.is(v, old[j]))) current.effects.push(callback);
    current.deps[i] = deps;
  } };
  const realFiles = ['AdminDashboard', 'Settings', 'ManageChargingLocations'];
  function load(filename) {
    filename = path.resolve(filename); if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module); cache.set(filename, mod); const req = Module.createRequire(filename);
    mod.require = name => {
      if (name === 'react') return hooks;
      if (name.includes('firebaseApi')) return api;
      if (name.endsWith('/Header')) return function Header(p) { return React.createElement('header', null, p.title); };
      if (name.endsWith('/Card')) return function Card(p) { return React.createElement('div', null, p.children); };
      if (name.startsWith('.')) {
        const base = path.resolve(path.dirname(filename), name);
        if (name.endsWith('/types')) return load(base + '.ts');
        if (realFiles.includes(path.basename(name))) return load(base + '.tsx');
        return function OtherAdminView() { return null; };
      }
      return req(name);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
    } }).outputText, filename); return mod.exports;
  }
  function render(Component, props = {}) {
    current = instances.get(Component) || { state: [], deps: [], effects: [] }; instances.set(Component, current); cursor = 0;
    return Component(props);
  }
  return { load: name => load('src/components/admin/' + name + '.tsx').default, render,
    async settle() { for (const instance of instances.values()) await Promise.all(instance.effects.splice(0).map(f => f()));
      await new Promise(resolve => setImmediate(resolve)); } };
}
function nodes(tree, match) {
  const found = []; function visit(value) { React.Children.forEach(value, child => {
    if (!React.isValidElement(child)) return; if (match(child)) found.push(child); visit(child.props.children);
  }); } visit(tree); return found;
}
function text(tree) { if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(''); return React.isValidElement(tree) ? text(tree.props.children) : ''; }
const button = (tree, label) => nodes(tree, n => n.type === 'button' && text(n).trim() === label)[0];

test('dashboard removes charging entry and preserves Settings round-trip and other admin destinations', () => {
  const h = harness(), Dashboard = h.load('AdminDashboard'), Settings = h.load('Settings');
  const tree = h.render(Dashboard);
  assert.doesNotMatch(text(tree), /Charging Locations/);
  for (const label of ['Drivers', 'Vehicles', 'Service Providers', 'Reports', 'Settings']) assert.ok(button(tree, label), label);
  button(tree, 'Settings').props.onClick(); const destination = h.render(Dashboard); assert.equal(destination.type, Settings);
  destination.props.onBack(); assert.ok(button(h.render(Dashboard), 'Settings'));
});

test('Settings charging tab reuses management component and keeps navigation and one header', async () => {
  const h = harness(), Settings = h.load('Settings'), Manage = h.load('ManageChargingLocations'); let back = 0;
  const props = { onBack: () => back++ }; h.render(Settings, props); await h.settle();
  button(h.render(Settings, props), 'Charging Locations').props.onClick(); let tree = h.render(Settings, props);
  assert.equal(button(tree, 'Charging Locations').props['aria-current'], 'page');
  const child = nodes(tree, n => n.type === Manage); assert.equal(child.length, 1); assert.equal(child[0].props.embedded, true);
  assert.equal(nodes(tree, n => n.type.name === 'Header').length, 1);
  assert.match(nodes(tree, n => n.type === 'nav')[0].props.className, /flex-wrap/);
  for (const [label, content] of [['Areas (1)', 'Manage Areas'], ['Departments (1)', 'Manage Departments'],
    ['Service Booking', 'Smart Service Booking Deadlines'], ['Admin Users', 'Admin Users']]) {
    button(tree, label).props.onClick(); await h.settle(); tree = h.render(Settings, props);
    assert.ok(text(tree).includes(content)); assert.equal(nodes(tree, n => n.type === Manage).length, 0);
    assert.equal(button(tree, label).props['aria-current'], 'page');
  }
  button(tree, 'Back to Dashboard').props.onClick(); assert.equal(back, 1);
});

test('embedded management has no duplicate page header/main/back; standalone retains its back callback', () => {
  const h = harness(), Manage = h.load('ManageChargingLocations'); const tree = h.render(Manage, { embedded: true });
  assert.equal(nodes(tree, n => n.type.name === 'Header' || n.type === 'main').length, 0);
  assert.equal(button(tree, 'Back to Dashboard'), undefined); assert.ok(button(tree, 'Add Charging Location'));
  let back = 0; const standalone = h.render(Manage, { onBack: () => back++ });
  assert.equal(nodes(standalone, n => n.type.name === 'Header').length, 1);
  button(standalone, 'Back to Dashboard').props.onClick(); assert.equal(back, 1);
});

test('embedded list, edit, add and active toggle use existing CRUD handlers', async () => {
  const location = { id: 'office', name: 'Office', type: 'OFFICE', costOwner: 'COMPANY', tariffMethod: 'FREE', active: true };
  const updates = []; const h = harness({ listChargingLocationsAdmin: async () => [location], updateChargingLocation: async (...args) => updates.push(args) });
  const Manage = h.load('ManageChargingLocations'); h.render(Manage, { embedded: true }); await h.settle(); let tree = h.render(Manage, { embedded: true });
  assert.match(text(tree), /Office/); assert.match(text(tree), /Free/);
  await nodes(tree, n => n.props.title === 'Deactivate')[0].props.onClick(); assert.deepEqual(updates, [['office', { active: false }]]);
  nodes(tree, n => n.props.title === 'Edit')[0].props.onClick(); tree = h.render(Manage, { embedded: true });
  const modal = nodes(tree, n => n.type.name === 'ChargingLocationModal')[0]; assert.equal(modal.props.location, location);
  modal.props.onClose(); button(h.render(Manage, { embedded: true }), 'Add Charging Location').props.onClick();
  assert.equal(nodes(h.render(Manage, { embedded: true }), n => n.type.name === 'ChargingLocationModal')[0].props.location, null);
});

for (const method of ['FREE', 'PER_KWH']) test('reused modal preserves ' + method + ' tariff payload', async () => {
  let payload; const h = harness({ createChargingLocation: async p => payload = p }); const Manage = h.load('ManageChargingLocations');
  button(h.render(Manage, { embedded: true }), 'Add Charging Location').props.onClick();
  const modal = nodes(h.render(Manage, { embedded: true }), n => n.type.name === 'ChargingLocationModal')[0];
  const render = () => h.render(modal.type, modal.props);
  nodes(render(), n => n.type === 'input' && n.props.placeholder === 'e.g., Head Office Depot')[0].props.onChange({ target: { value: 'Test depot' } });
  for (const [i, value] of [[0, 'OFFICE'], [1, 'COMPANY'], [2, method]]) nodes(render(), n => n.type === 'select')[i].props.onChange({ target: { value } });
  if (method !== 'FREE') nodes(render(), n => n.type === 'input' && n.props.type === 'number')[0].props.onChange({ target: { value: '2.50' } });
  await button(render(), 'Add Location').props.onClick(); assert.equal(payload.tariffMethod, method);
  if (method === 'FREE') assert.equal(Object.hasOwn(payload, 'tariffRate'), false); else assert.equal(payload.tariffRate, 2.5);
});

test('dashboard contains no dead direct charging view/import; admin access remains role-gated', () => {
  const source = fs.readFileSync('src/components/admin/AdminDashboard.tsx', 'utf8');
  assert.doesNotMatch(source, /ManageChargingLocations|charging-locations/);
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /currentUser.role === UserRole.Admin/);
});
