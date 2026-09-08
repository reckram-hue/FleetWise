const { test } = require('node:test');
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
  const hooks = { ...React, useContext: () => ({ currentUser: { id: 'driver' } }), useRef(initial) { const i = cursor++; return current.state[i] ||= { current: initial }; }, useState(initial) {
    const instance = current, i = cursor++; if (!(i in instance.state)) instance.state[i] = initial;
    return [instance.state[i], next => instance.state[i] = typeof next === 'function' ? next(instance.state[i]) : next];
  }, useEffect(callback, deps) {
    const i = cursor++, old = current.deps[i];
    if (!old || !deps || deps.some((v, j) => !Object.is(v, old[j]))) current.effects.push(callback);
    current.deps[i] = deps;
  } };
  const realFiles = ['vehicleIdentity', 'EvidencePhoto', 'defectVisibility', 'elapsedTime','AccidentReportEntry', 'AccidentReportForm', 'AccidentReportDetails', 'AccidentReports', 'accidentDraft', 'accidentFields', 'DriverDashboard'];
  function load(filename) {
    filename = path.resolve(filename); if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module); cache.set(filename, mod); const req = Module.createRequire(filename);
    mod.require = name => {
      if (name === 'react') return hooks;
      if (name === 'react-router-dom') return { useNavigate: () => () => {} };
      if (name.endsWith('/store/shift')) return { useShiftStore: () => ({ activeShift: null, setActiveShift() {}, clearActiveShift() {} }) };
      if (name.endsWith('/resolveActiveShift')) return { resolveActiveShiftState: async () => null };
      if (name.includes('firebaseApi')) return api;
      if (name.includes('accidentApi')) return { accidentApi: overrides };
      if (name.endsWith('store/session')) return { getDriverSession: () => ({ driverId: 'driver', projectId: 'demo' }) };
      if (name.endsWith('/Header')) return function Header(p) { return React.createElement('header', null, p.title); };
      if (name.endsWith('/Card')) return function Card(p) { return React.createElement('div', null, p.children); };
      if (name.startsWith('.')) {
        const base = path.resolve(path.dirname(filename), name);
        if (name.endsWith('/types')) return load(base + '.ts');
        if (realFiles.includes(path.basename(name))) return load(base + (fs.existsSync(base + '.tsx') ? '.tsx' : '.ts'));
        return function OtherAdminView() { return null; };
      }
      return req(name);
    };
    mod.schedule = cb => { timers.push(cb); return timers.length; };
    mod._compile('const setTimeout = cb => module.schedule(cb); const clearTimeout = () => {};\n' + ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
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


const fixture = (extra = {}) => ({ id: 'report', driverId: 'driver', vehicleId: 'vehicle', assignmentId: 'assignment', shiftId: 'shift', orgId: 'default',
  createdByDriverId: 'driver', isTestData: true, status: 'DRAFT', revision: 0, createdAt: new Date(), updatedAt: new Date(), submittedAt: null,
  fields: { accidentAt: '2026-09-08T05:00:00.000Z', witnesses: [] }, photos: [], ...extra });
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) || null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const modulePath = name => 'src/components/driver/' + name + '.tsx';
const field = (tree, label) => {
  const labels = nodes(tree, n => n.type === 'label' && text(n).trimStart().startsWith(label));
  assert.ok(labels.length, label); return nodes(labels[0], n => ['input','textarea','select'].includes(n.type))[0];
};
const setField = (tree, label, value) => field(tree, label).props.onChange({ target: { value } });

async function formHarness(api = {}, extra = {}) {
  const h = harness(api), Form = h.load(modulePath('AccidentReportForm')).default;
  const props = { initialReport: fixture(extra), onBack: () => { h.left = true; } };
  h.render(Form, props); await h.settle(); h.form = () => h.render(Form, props); return h;
}

test('driver entry loads own assignment drafts and opens resume/read-only reports without duplicate create', async () => {
  const draft = fixture(); const submitted = fixture({ id: 'submitted', status: 'SUBMITTED' });
  const h = harness({ list: async id => { assert.equal(id, 'assignment'); return [draft, submitted]; }, get: async id => id === draft.id ? draft : submitted,
    create: () => assert.fail('Resume must not create') }); const Entry = h.load(modulePath('AccidentReportEntry')).default;
  h.render(Entry, { assignmentId: 'assignment' }); await h.settle(); let tree = h.render(Entry, { assignmentId: 'assignment' });
  assert.ok(button(tree, 'Report Accident / Collision')); assert.match(text(tree), /Accident report in progress/);
  await button(tree, 'Resume Report').props.onClick(); tree = h.render(Entry, { assignmentId: 'assignment' });
  assert.equal(nodes(tree, n => n.type.name === 'AccidentReportForm')[0].props.initialReport.id, 'report');
});
test('entry double-start has one request and lookup errors are recoverable', async () => {
  let resolve, count = 0; const promise = new Promise(r => resolve = r);
  const h = harness({ list: async () => [], create: async () => { count++; await promise; return fixture(); } }); const Entry = h.load(modulePath('AccidentReportEntry')).default;
  h.render(Entry, { assignmentId: 'assignment' }); await h.settle(); const b = button(h.render(Entry, { assignmentId: 'assignment' }), 'Report Accident / Collision');
  const first = b.props.onClick(); await b.props.onClick(); assert.equal(count, 1); resolve(); await first;
});
test('form multi-step navigation, witness add/remove, optional photos and review missing data', async () => {
  const h = await formHarness(); let tree = h.form(); assert.match(text(tree), /What happened/);
  button(tree, 'Next').props.onClick(); assert.match(text(h.form()), /Other driver name/);
  button(h.form(), 'Next').props.onClick(); button(h.form(), 'Add witness').props.onClick(); assert.ok(field(h.form(), 'Witness 1 name'));
  setField(h.form(), 'Witness 1 name', 'Synthetic witness'); button(h.form(), 'Remove witness 1').props.onClick(); assert.doesNotMatch(text(h.form()), /Witness 1 name/);
  button(h.form(), 'Next').props.onClick(); setField(h.form(), 'Vehicle appears driveable?', 'NO'); assert.match(text(h.form()), /Vehicle reported not driveable/);
  button(h.form(), 'Next').props.onClick(); assert.match(text(h.form()), /Photos are optional/);
  button(h.form(), 'Next').props.onClick(); assert.ok(button(h.form(), 'Submit accident report'));
  const Details = h.load('src/components/shared/AccidentReportDetails.tsx').default;
  assert.match(text(h.render(Details, { report: fixture() })), /Not provided/);
});
test('partial Save Draft retains unknown and retry inputs; autosave schedules and server fields restore', async () => {
  let fail = true, calls = 0;
  const h = await formHarness({ save: async (id, revision, mutationId, fields) => { calls++; if (fail) throw new Error('Offline. Retry Save Draft.');
    return fixture({ revision: revision + 1, lastMutationId: mutationId, fields }); } });
  setField(h.form(), 'What happened?', 'Partial account'); setField(h.form(), 'Injuries known or reported?', 'UNKNOWN');
  await h.settle(); assert.ok(h.timers.length); await button(h.form(), 'Save Draft').props.onClick(); await h.settle();
  assert.match(text(h.form()), /Offline/); assert.equal(field(h.form(), 'What happened?').props.value, 'Partial account');
  fail = false; await button(h.form(), 'Save Draft').props.onClick(); await h.settle(); assert.equal(calls, 2); assert.match(text(h.form()), /Draft saved on server/);
});
test('final submission requires only minimum fields and acknowledgement; no photos succeeds and locks UI', async () => {
  let submissions = 0; const h = await formHarness({ save: async (id, rev, mutationId, fields) => fixture({ revision: rev + 1, lastMutationId: mutationId, fields }),
    submit: async () => { submissions++; return fixture({ status: 'SUBMITTED', submittedAt: new Date() }); } });
  button(h.form(), '6. Review & submit').props.onClick(); await button(h.form(), 'Submit accident report').props.onClick();
  assert.equal(submissions, 0); assert.match(text(h.form()), /Complete:/);
  button(h.form(), '1. What happened?').props.onClick(); setField(h.form(), 'Location description', 'Intersection');
  setField(h.form(), 'What happened?', 'Narrative'); setField(h.form(), 'Injuries known or reported?', 'UNKNOWN');
  button(h.form(), '6. Review & submit').props.onClick(); field(h.form(), 'I confirm').props.onChange({ target: { checked: true } });
  await button(h.form(), 'Submit accident report').props.onClick(); assert.equal(submissions, 1); assert.match(text(h.form()), /read-only/);
  assert.equal(button(h.form(), 'Save Draft'), undefined); assert.equal(button(h.form(), 'Submit accident report'), undefined);
});
test('GPS permission denial leaves typed location usable', async () => {
  const old = Object.getOwnPropertyDescriptor(global, 'navigator'); Object.defineProperty(global, 'navigator', { configurable: true, value: { geolocation: { getCurrentPosition: (_ok, fail) => fail() } } });
  try { const h = await formHarness(); button(h.form(), 'Use current location (optional)').props.onClick();
    assert.match(text(h.form()), /Typed location remains available/); setField(h.form(), 'Location description', 'Typed place'); assert.equal(field(h.form(), 'Location description').props.value, 'Typed place');
  } finally { if (old) Object.defineProperty(global, 'navigator', old); else delete global.navigator; }
});
test('selected photos upload with stable retry ID and block submit until uploaded or removed', async () => {
  const previous = global.FileReader; global.FileReader = class { readAsDataURL() { this.result = 'data:image/png;base64,cGhvdG8='; this.onload(); } };
  try { let fail = true, ids = []; const h = await formHarness({ upload: async (_report, id) => { ids.push(id); if (fail) throw new Error('Upload failed'); }, get: async () => fixture({ photos: [{ id: 'saved', path: 'accident-reports/default/report/photo.png' }] }) });
    button(h.form(), '5. Photos / evidence').props.onClick(); await field(h.form(), 'Add photos').props.onChange({ target: { files: [{ type: 'image/png', size: 20 }], value: '' } });
    await button(h.form(), 'Upload selected photos / retry').props.onClick(); assert.match(text(h.form()), /Upload failed/);
    button(h.form(), '6. Review & submit').props.onClick(); assert.equal(button(h.form(), 'Submit accident report').props.disabled, true);
    button(h.form(), '5. Photos / evidence').props.onClick(); fail = false; await button(h.form(), 'Upload selected photos / retry').props.onClick();
    assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]); assert.equal(button(h.form(), 'Upload selected photos / retry'), undefined);
  } finally { global.FileReader = previous; }
});
test('draft write-through survives refresh before autosave and normalizes server-trimmed text without looping', async () => {
  const h = harness(), { AccidentDraft } = h.load('src/lib/accidentDraft.ts'); const storage = memory(); let calls = 0;
  const persist = async (id, rev, mutationId, fields) => { calls++; return fixture({ revision: rev + 1, lastMutationId: mutationId, fields: { ...fields, narrative: fields.narrative.trim() } }); };
  const one = new AccidentDraft(fixture(), storage, 'draft', persist); one.change({ ...one.fields, narrative: '  Kept on refresh  ' });
  const two = new AccidentDraft(fixture(), storage, 'draft', persist); assert.equal(two.fields.narrative, '  Kept on refresh  ');
  await two.save(); assert.equal(two.fields.narrative, 'Kept on refresh'); assert.equal(calls, 1); assert.equal(two.dirty, false);
});
test('lost save response retries exact mutation; reload recognizes acknowledged operation with newer unsaved text', async () => {
  const h = harness(), { AccidentDraft } = h.load('src/lib/accidentDraft.ts'); const storage = memory(); let server = fixture(), fail = true, ids = [];
  const persist = async (id, rev, mutationId, fields) => { ids.push(mutationId); if (server.lastMutationId !== mutationId) server = fixture({ revision: rev + 1, lastMutationId: mutationId, fields });
    if (fail) throw new Error('Response lost'); return server; };
  const one = new AccidentDraft(server, storage, 'draft', persist); one.change({ ...one.fields, narrative: 'First' });
  await assert.rejects(one.save()); fail = false; await one.save(); assert.equal(ids[0], ids[1]);
  one.change({ ...one.fields, narrative: 'Second' }); fail = true; await assert.rejects(one.save());
  one.change({ ...one.fields, narrative: 'Third' }); const restored = new AccidentDraft(server, storage, 'draft', persist);
  assert.equal(restored.fields.narrative, 'Third'); fail = false; await restored.save(); assert.equal(server.fields.narrative, 'Third');
});
test('concurrent window conflict does not overwrite saved report; submitted restore removes recovery copy', async () => {
  const h = harness(), { AccidentDraft } = h.load('src/lib/accidentDraft.ts'); const storage = memory();
  const one = new AccidentDraft(fixture(), storage, 'draft', async () => { throw new Error('Conflict'); }); one.change({ narrative: 'Local' });
  const two = new AccidentDraft(fixture({ revision: 2, lastMutationId: 'other', fields: { narrative: 'Other window' } }), storage, 'draft', async (_id, rev) => { assert.equal(rev, 0); throw new Error('Conflict'); });
  await assert.rejects(two.save(), /Conflict/); assert.equal(two.fields.narrative, 'Local');
  new AccidentDraft(fixture({ status: 'SUBMITTED' }), storage, 'draft', () => assert.fail()); assert.equal(storage.getItem('draft'), null);
});
test('admin review excludes tests by default, explicit QA inclusion and detail read reuse captured fields', async () => {
  let requested = []; const h = harness({ listAdmin: async include => { requested.push(include); return { reports: [fixture()], nextCursor: null }; }, getAdmin: async () => fixture() });
  const Admin = h.load('src/components/admin/AccidentReports.tsx').default; h.render(Admin); await h.settle(); let tree = h.render(Admin);
  assert.deepEqual(requested, [false]); field(tree, 'Include TEST reports').props.onChange({ target: { checked: true } }); h.render(Admin); await h.settle(); tree = h.render(Admin); assert.deepEqual(requested, [false, true]);
  const row = nodes(tree, n => n.type === 'button' && text(n).includes('DRAFT'))[0]; await row.props.onClick(); tree = h.render(Admin);
  assert.equal(nodes(tree, n => n.type.name === 'AccidentReportDetails')[0].props.admin, true);
  button(tree, 'Back to accident reports').props.onClick(); assert.ok(field(h.render(Admin), 'Status'));
});
test('Active Shift accident entry is guarded by assignment and current vehicle, separate from fault flow', () => {
  const source = fs.readFileSync('src/pages/ActiveShift.tsx', 'utf8'); const ast = ts.createSourceFile('ActiveShift.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let entry; function visit(n) { if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'AccidentReportEntry') entry = n; ts.forEachChild(n, visit); } visit(ast);
  assert.ok(entry); assert.match(entry.parent.getText(ast), /hasAssignment && currentVehicle/); assert.match(source, /<ReportDefectForm/);
});

test('autosave runs after an edit and entry lookup retries without blocking other workflows', async () => {
  let saves = 0; const h = await formHarness({ save: async (_id, revision, mutationId, fields) => { saves++; return fixture({ revision: revision + 1, lastMutationId: mutationId, fields }); } });
  setField(h.form(), 'What happened?', 'Autosaved account'); h.form(); await h.settle();
  h.timers[h.timers.length - 1](); await h.settle(); assert.equal(saves, 1); assert.match(text(h.form()), /Draft saved on server/);
  let fail = true; const entry = harness({ list: async () => { if (fail) throw new Error('offline'); return []; } });
  const Entry = entry.load(modulePath('AccidentReportEntry')).default;
  entry.render(Entry, { assignmentId: 'assignment' }); await entry.settle(); let tree = entry.render(Entry, { assignmentId: 'assignment' });
  assert.equal(button(tree, 'Report Accident / Collision').props.disabled, true); fail = false;
  button(tree, 'Retry accident lookup').props.onClick(); entry.render(Entry, { assignmentId: 'assignment' }); await entry.settle();
  assert.equal(button(entry.render(Entry, { assignmentId: 'assignment' }), 'Report Accident / Collision').props.disabled, false);
});
test('edits arriving during a save flush as a new mutation without dropping the later text', async () => {
  const h = harness(), { AccidentDraft } = h.load('src/lib/accidentDraft.ts'); let release, calls = [];
  const gate = new Promise(r => release = r);
  const draft = new AccidentDraft(fixture(), memory(), 'draft', async (_id, revision, mutationId, fields) => {
    calls.push({ mutationId, fields }); if (calls.length === 1) await gate;
    return fixture({ revision: revision + 1, lastMutationId: mutationId, fields });
  });
  draft.change({ narrative: 'First' }); const saving = draft.save(); draft.change({ narrative: 'Later' }); release(); await saving;
  assert.equal(calls.length, 2); assert.notEqual(calls[0].mutationId, calls[1].mutationId); assert.equal(draft.report.fields.narrative, 'Later');
});


test('Dashboard exposes historical drafts without an active shift; refresh/later login resumes original report', async () => {
  const old = fixture({ assignmentId: 'closed-assignment', vehicleId: 'original-vehicle', vehicleRegistration: 'CA ORIGINAL', shiftId: 'ended-shift' });
  const second = fixture({ id: 'second-draft', vehicleId: 'second-vehicle', vehicleRegistrationSnapshot: 'CA SECOND' });
  for (let login = 0; login < 2; login++) {
    const h = harness({ drafts: async () => [old, second], get: async id => { assert.equal(id, old.id); return old; }, create: () => assert.fail('Discovery cannot create') });
    const Dashboard = h.load(modulePath('DriverDashboard')).default;
    const entryNode = nodes(h.render(Dashboard), n => n.type.name === 'AccidentReportEntry')[0];
    assert.ok(entryNode); assert.equal(entryNode.props.assignmentId, undefined);
    const Entry = h.load(modulePath('AccidentReportEntry')).default;
    h.render(Entry, entryNode.props); await h.settle(); let tree = h.render(Entry, entryNode.props);
    assert.equal(button(tree, 'Report Accident / Collision'), undefined);
    assert.match(text(tree), /CA ORIGINAL/); assert.match(text(tree), /CA SECOND/); assert.doesNotMatch(text(tree), /original-vehicle/);
    assert.equal(nodes(tree, n => n.type === 'button' && text(n) === 'Resume Report').length, 2);
    await button(tree, 'Resume Report').props.onClick(); tree = h.render(Entry, entryNode.props);
    const formNode = nodes(tree, n => n.type.name === 'AccidentReportForm')[0];
    assert.equal(formNode.props.initialReport.assignmentId, old.assignmentId);
    assert.equal(formNode.props.backLabel, 'Back to Dashboard');
    h.render(formNode.type, formNode.props); await h.settle();
    assert.ok(button(h.render(formNode.type, formNode.props), 'Save Draft'));
  }
});

test('throwing browser recovery never blocks successive server saves, submission or read-only rendering', async () => {
  const calls = []; let submitted = 0;
  const h = harness({
    save: async (_id, revision, mutationId, fields) => { calls.push({ revision, mutationId }); return fixture({ revision: revision + 1, lastMutationId: mutationId, fields }); },
    submit: async (_id, revision) => { submitted++; assert.equal(revision, 3); return fixture({ status: 'SUBMITTED', revision, fields: complete, submittedAt: new Date() }); },
  });
  const complete = { accidentAt: '2026-09-08T05:00:00.000Z', locationDescription: 'Road', narrative: 'Account', injuries: 'UNKNOWN', incompleteDetailsAcknowledged: true };
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } };
  global.localStorage = broken;
  const Form = h.load(modulePath('AccidentReportForm')).default;
  const props = { initialReport: fixture({ fields: complete }), onBack() {} };
  h.render(Form, props); await h.settle(); const tree = () => h.render(Form, props);
  setField(tree(), 'What happened?', 'First'); await button(tree(), 'Save Draft').props.onClick(); await h.settle();
  assert.match(text(tree()), /Draft saved on server/); assert.match(text(tree()), /Draft saved to FleetWise, but this browser cannot keep an offline recovery copy/);
  setField(tree(), 'What happened?', 'Second'); await button(tree(), 'Save Draft').props.onClick(); await h.settle();
  assert.deepEqual(calls.map(v => v.revision), [0, 1]); assert.notEqual(calls[0].mutationId, calls[1].mutationId);
  setField(tree(), 'What happened?', 'Third'); button(tree(), '6. Review & submit').props.onClick();
  await button(tree(), 'Submit accident report').props.onClick();
  assert.equal(submitted, 1); assert.match(text(tree()), /Report submitted. This report is read-only/);
  assert.equal(button(tree(), 'Save Draft'), undefined);
  assert.doesNotMatch(text(tree()), /quota|localStorage|mutation ID|revision/);
});

test('unavailable browser storage getter restores server state and lost save response retains in-memory request', async () => {
  const h = harness(), { AccidentDraft } = h.load('src/lib/accidentDraft.ts'); let server = fixture(), fail = true; const calls = [];
  const unavailable = () => { throw new Error('Storage getter blocked'); };
  const persist = async (_id, revision, mutationId, fields) => {
    calls.push({ revision, mutationId });
    if (server.lastMutationId !== mutationId) server = fixture({ revision: revision + 1, lastMutationId: mutationId, fields });
    if (fail) { fail = false; throw new Error('Lost response'); } return server;
  };
  const draft = new AccidentDraft(server, unavailable, 'draft', persist);
  draft.change({ narrative: 'Preserved on server' }); await assert.rejects(draft.save(), /Lost response/);
  await draft.save(); assert.deepEqual(calls[0], calls[1]); assert.equal(draft.report.revision, 1);
  const refreshed = new AccidentDraft(server, unavailable, 'draft', persist);
  assert.equal(refreshed.fields.narrative, 'Preserved on server'); assert.equal(refreshed.dirty, false);
  const done = fixture({ status: 'SUBMITTED', fields: server.fields });
  assert.doesNotThrow(() => new AccidentDraft(done, unavailable, 'draft', persist));
});

test('quota failure after a normal backup clears stale copy and reload uses server draft', async () => {
  const h = harness(), { AccidentDraft } = h.load('src/lib/accidentDraft.ts'); const storage = memory(); let server = fixture();
  const draft = new AccidentDraft(server, storage, 'draft', async (_id, revision, mutationId, fields) => server = fixture({ revision: revision + 1, lastMutationId: mutationId, fields }));
  draft.change({ narrative: 'Old text' }); storage.setItem = () => { throw new Error('Quota'); };
  draft.change({ narrative: 'Latest text' }); await draft.save(); assert.equal(storage.getItem('draft'), null);
  assert.equal(new AccidentDraft(server, storage, 'draft', async () => server).fields.narrative, 'Latest text');
});

test('session survives browser storage failure in memory and explicit logout cannot resurrect stored credentials', () => {
  const filename = path.resolve('src/store/session.ts'); const mod = new Module(filename, module);
  const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env.VITE_FIREBASE_PROJECT_ID', "'demo'");
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  const session = mod.exports; const storage = memory(); global.localStorage = storage;
  const credential = { driverId: 'driver', sessionToken: 'synthetic-only', expiresAt: '2099-01-01', projectId: 'demo' };
  session.setDriverSession(credential); assert.deepEqual(session.getDriverSession(), credential);
  storage.getItem = () => { throw new Error('Blocked'); }; storage.removeItem = () => { throw new Error('Blocked'); };
  assert.deepEqual(session.getDriverSession(), credential);
  session.clearDriverSession(); assert.equal(session.getDriverSession(), null);
  storage.setItem = () => { throw new Error('Blocked'); }; session.setDriverSession(credential);
  assert.deepEqual(session.getDriverSession(), credential);
  session.clearDriverSession(); assert.equal(session.getDriverSession(), null);
  global.localStorage = memory(); session.setDriverSession(credential);
  global.localStorage.setItem('fleetwise_driver_session', '{invalid');
  assert.equal(session.getDriverSession(), null);
  session.setDriverSession(credential);
  global.localStorage.setItem('fleetwise_driver_session', JSON.stringify({ ...credential, projectId: 'foreign-project' }));
  assert.equal(session.getDriverSession(), null);
});
