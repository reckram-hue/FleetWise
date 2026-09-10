const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

// Real component handlers with isolated hook state and local API doubles; no cloud writes.
function harness(overrides = {}) {
  const timers = []; const storage = new Map();
  global.localStorage = { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) };
  const cache = new Map(), instances = new Map(); let current, cursor;
  const api = { getSettings: async () => ({ areas: ['Cape Town'], departments: ['Operations'] }),
    getAdminUsers: async () => [], getVehicles: async () => [], getUsers: async () => [], getActiveDefects: async () => [],
    listChargingLocationsAdmin: async () => [], ...overrides };
  const hooks = { ...React, useContext: () => ({ currentUser: overrides.currentUser || { id: 'driver' }, setCurrentUser: overrides.setCurrentUser || (() => {}) }), useRef(initial) { const i = cursor++; return current.state[i] ||= { current: initial }; }, useState(initial) {
    const instance = current, i = cursor++; if (!(i in instance.state)) instance.state[i] = typeof initial === 'function' ? initial() : initial;
    return [instance.state[i], next => instance.state[i] = typeof next === 'function' ? next(instance.state[i]) : next];
  }, useEffect(callback, deps) {
    const i = cursor++, old = current.deps[i];
    if (!old || !deps || deps.some((v, j) => !Object.is(v, old[j]))) current.effects.push(callback);
    current.deps[i] = deps;
  } };
  const realFiles = ['VehicleEvidencePanel', 'economyPresentation', 'FuelEconomyMonitor', 'LogRefuelForm', 'AdminDashboard', 'InspectionHistory', 'successNotice', 'SuccessNotice', 'ActiveShift','App','vehicleIdentity', 'EvidencePhoto', 'defectVisibility', 'elapsedTime', 'fuelEconomy', 'adminSession', 'AdminLogin', 'ManageDefects', 'TelegramDrivers', 'AccidentReportEntry', 'AccidentReportDetails'];
  function load(filename) {
    filename = path.resolve(filename); if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module); cache.set(filename, mod); const req = Module.createRequire(filename);
    mod.require = name => {
      if (name === 'react') return hooks;
      if (name === 'firebase/auth') return { getAuth: () => ({}), signOut: overrides.signOut || (async () => {}), signInWithEmailAndPassword: async () => ({}) };
      if (name.endsWith('/lib/firebase')) return { auth: overrides.auth };
      if (name.endsWith('/UserContext')) return { UserContext: { Provider: 'provider' } };
      if (name === 'react-router-dom') return { useNavigate: () => () => {} };
      if (name.endsWith('/store/shift')) return { shiftStore: { clearActiveShift() {} }, useShiftStore: () => ({ activeShift: overrides.activeShift || null, setActiveShift() {}, clearActiveShift() {}, setVehicleAssignment() {}, clearVehicleAssignment() {} }) };
      if (name.endsWith('/resolveActiveShift')) return { resolveActiveShiftState: async () => overrides.activeShift || null };
      if (name.includes('firebaseApi')) return api;
      if (name.includes('inspectionApi')) return { inspectionApi: overrides.inspectionApi };
      if (name.includes('economyApi')) return { economyApi: overrides.economyApi };
      if (name.includes('accidentApi')) return { accidentApi: overrides };
      if (name.endsWith('store/session')) return { getDriverSession: () => overrides.noDriver ? null : ({ driverId: 'driver', projectId: 'demo' }), clearDriverSession() {}, isSessionLocallyExpired: () => false };
      if (name.endsWith('/Header')) return function Header(p) { return React.createElement('header', null, p.title); };
      if (name.endsWith('/Card')) return function Card(p) { return React.createElement('div', null, p.children); };
      if (name.startsWith('.')) {
        const base = path.resolve(path.dirname(filename), name);
        if (name.endsWith('/types')) return load(base + '.ts');
        if (realFiles.includes(path.basename(name)) || ['fleetScenario', 'EVReplacementScenario'].includes(path.basename(name))) return load(base + (fs.existsSync(base + '.tsx') ? '.tsx' : '.ts'));
        return function OtherAdminView() { return null; };
      }
      return req(name);
    };
    mod.schedule = cb => { timers.push(cb); return timers.length; };
    mod._compile('const setTimeout = cb => module.schedule(cb); const clearTimeout = () => {}; const setInterval = () => 0; const clearInterval = () => {};\n' + ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
    } }).outputText, filename); return mod.exports;
  }
  function render(Component, props = {}) {
    current = instances.get(Component) || { state: [], deps: [], effects: [] }; instances.set(Component, current); cursor = 0;
    return Component(props);
  }
  return { storage, load: name => load(name), timers, render,
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




module.exports = { harness, nodes, text, button };
