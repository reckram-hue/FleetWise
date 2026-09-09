const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { harness, nodes, text, button } = require('./uiHarness.cjs');

test('Admin direct defect navigation clears selection; urgent cards and inspection links retain deep links', () => {
  const h = harness(), Admin = h.load('src/components/admin/AdminDashboard.tsx').default;
  let tree = h.render(Admin);
  button(tree, 'Manage Defects').props.onClick(); tree = h.render(Admin);
  assert.equal(tree.type.name, 'ManageDefects'); assert.equal(tree.props.selectedDefectId, undefined);
  tree.props.onBack(); tree = h.render(Admin);
  nodes(tree, n => n.type.name === 'CriticalDefects')[0].props.onDefectClick('urgent-defect');
  tree = h.render(Admin); assert.equal(tree.props.selectedDefectId, 'urgent-defect');
  tree.props.onBack(); tree = h.render(Admin);
  button(tree, 'Inspection History').props.onClick(); tree = h.render(Admin);
  assert.equal(tree.type.name, 'InspectionHistory'); tree.props.onOpenDefect('linked-defect');
  tree = h.render(Admin); assert.equal(tree.props.selectedDefectId, 'linked-defect');
  tree.props.onBack(); button(h.render(Admin), 'Manage Defects').props.onClick();
  assert.equal(h.render(Admin).props.selectedDefectId, undefined);
});

const record = { id: 'inspection', vehicleId: 'vehicle-internal', driverId: 'driver', assignmentId: 'assignment', shiftId: 'shift',
  vehicleRegistration: 'CA 123-456', vehicleDisplayName: 'Sample EV', identitySource: 'snapshot', driverName: 'Sample Driver',
  boundaryType: 'RETURN', status: 'COMPLETED', createdAt: '2026-09-01T10:00:00Z', capturedAt: '2026-09-01T10:01:00Z', completedAt: '2026-09-01T10:02:00Z',
  odometer: 120, chargePercent: 0, predictedRangeKm: null, hasDamage: true, damageDescription: 'Original statement', linkedDefectId: 'defect',
  photos: { exterior: true, interior: true }, retentionClass: 'EVIDENCE', expiresAt: null, isTestData: false };
const props = { onBack() {}, onOpenDefect() {} };
function control(tree, label, tag) { return nodes(nodes(tree, n => n.type === 'label' && text(n).startsWith(label))[0], n => n.type === tag)[0]; }
test('history defaults to genuine records, applies all filters, opens contextual detail and loads private evidence', async () => {
  const calls = [], photos = [];
  const h = harness({ inspectionApi: { list: async v => { calls.push(v); return { inspections: [record], nextCursor: null }; },
    detail: async id => { assert.equal(id, record.id); return record; }, photo: async (...v) => { photos.push(v); return { imageDataUrl: 'data:image/png;base64,YQ==' }; } } });
  const { default: History, InspectionDetail } = h.load('src/components/admin/InspectionHistory.tsx');
  h.render(History, props); await h.settle(); let tree = h.render(History, props);
  assert.deepEqual(calls, [{ includeTest: false }]); assert.match(text(tree), /1 matching inspections loaded/);
  assert.equal(text(nodes(tree, n => n.type === 'strong')[0]), 'CA 123-456'); assert.doesNotMatch(text(tree), /vehicle-internal/);
  for (const [label, tag, value] of [['Vehicle', 'select', 'vehicle'], ['Driver', 'select', 'driver'], ['Inspection type', 'select', 'RETURN'],
    ['Created from', 'input', '2026-09-01'], ['Created through', 'input', '2026-09-02'], ['Shift reference', 'input', 'shift'], ['Assignment reference', 'input', 'assignment']]) {
    control(tree, label, tag).props.onChange({ target: { value } }); tree = h.render(History, props);
  }
  control(tree, 'Include TEST / QA', 'input').props.onChange({ target: { checked: true } }); tree = h.render(History, props);
  nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} }); h.render(History, props); await h.settle(); tree = h.render(History, props);
  assert.equal(calls[1].includeTest, true); assert.equal(calls[1].boundaryType, 'RETURN'); assert.equal(calls[1].driverId, 'driver'); assert.equal(calls[1].vehicleId, 'vehicle');
  assert.equal(calls[1].shiftId, 'shift'); assert.equal(calls[1].assignmentId, 'assignment');
  assert.equal(calls[1].from, new Date('2026-09-01T00:00:00').toISOString()); assert.equal(calls[1].until, new Date('2026-09-03T00:00:00').toISOString());
  nodes(tree, n => n.type === 'button' && text(n).startsWith('CA 123-456'))[0].props.onClick(); await h.settle(); tree = h.render(History, props);
  const detail = nodes(tree, n => n.type === InspectionDetail)[0]; assert.ok(detail);
  const dt = h.render(InspectionDetail, detail.props); assert.match(text(dt), /Sample Driver/); assert.match(text(dt), /RETURN/); assert.match(text(dt), /Original statement/); assert.match(text(dt), /0%/);
  assert.equal(text(nodes(dt, n => n.type === 'h3')[0]), 'CA 123-456');
  const evidence = nodes(dt, n => n.type.name === 'EvidencePhoto'); assert.equal(evidence.length, 2);
  for (const e of evidence) { await nodes(h.render(e.type, e.props), n => n.type === 'button')[0].props.onClick(); assert.match(nodes(h.render(e.type, e.props), n => n.type === 'img')[0].props.src, /^data:image/); }
  assert.deepEqual(photos, [['inspection', 'EXTERIOR'], ['inspection', 'INTERIOR']]);
  const missingIdentity = h.render(InspectionDetail, { ...detail.props, inspection: { ...record, vehicleRegistration: null, vehicleDisplayName: null } });
  assert.equal(text(nodes(missingIdentity, n => n.type === 'h3')[0]), 'Vehicle unavailable');
  assert.match(text(nodes(missingIdentity, n => n.type === 'details')[0]), /vehicle-internal/);
});

test('empty filtered history pages can continue; failed pagination retries without duplicate requests or rows', async () => {
  let count = 0, release; const cursor = { id: 'first', seconds: 1, nanoseconds: 0 };
  const h = harness({ inspectionApi: { list: async v => {
    count++; if (count === 1) return { inspections: [], nextCursor: cursor };
    assert.deepEqual(v.cursor, cursor); if (count === 2) throw Error('offline');
    return new Promise(resolve => { release = () => resolve({ inspections: [record], nextCursor: null }); });
  } } });
  const History = h.load('src/components/admin/InspectionHistory.tsx').default;
  h.render(History, props); await h.settle(); let tree = h.render(History, props); assert.match(text(tree), /No matches in this page/);
  button(tree, 'Load older records').props.onClick(); await h.settle(); tree = h.render(History, props); assert.match(text(tree), /Retry loading older records/);
  button(tree, 'Load older records').props.onClick(); button(tree, 'Load older records').props.onClick(); assert.equal(count, 3);
  release(); await h.settle(); tree = h.render(History, props); assert.match(text(tree), /1 matching inspections loaded/); assert.equal(button(tree, 'Load older records'), undefined);
});

for (const mode of ['active', 'pickup', 'return']) test(`accident entry placement: ${mode}`, async () => {
  const h = harness({ currentUser: { id: 'driver' }, activeShift: { driverId: 'driver', shiftId: 'shift', assignmentId: 'assignment', startAt: Date.now(),
    vehicle: { id: 'vehicle', registration: 'CA 123', vehicleType: 'EV' }, inspections: mode === 'pickup' ? [] : [{ boundaryType: 'PICKUP', status: 'COMPLETED' },
      ...(mode === 'return' ? [{ boundaryType: 'RETURN', status: 'PENDING', returnIntent: 'SHIFT_END' }] : [])] } });
  const Active = h.load('src/pages/ActiveShift.tsx').default;
  h.render(Active, props); await h.settle(); const tree = h.render(Active, props);
  const entries = nodes(tree, n => n.type?.name === 'AccidentReportEntry'); assert.equal(entries.length, mode === 'active' ? 1 : 0);
  if (mode === 'active') assert.equal(entries[0].props.assignmentId, 'assignment');
});

test('success notice is polite, nonblocking, navigation-independent and expires', async () => {
  const oldWindow = global.window; global.window = new EventTarget();
  try {
    const h = harness(), Notice = h.load('src/components/shared/SuccessNotice.tsx').default;
    h.render(Notice); await h.settle(); h.load('src/lib/successNotice.ts').notifyFaultReported();
    let tree = h.render(Notice); assert.equal(tree.props.role, 'status'); assert.equal(tree.props['aria-live'], 'polite');
    assert.match(tree.props.className, /pointer-events-none/); assert.equal(text(tree), 'Fault reported successfully'); assert.equal(nodes(tree, n => n.type === 'button').length, 0);
    h.timers.at(-1)(); assert.equal(text(h.render(Notice)), '');
  } finally { global.window = oldWindow; }
});

test('narrative textareas explicitly enable English spellcheck without changing stored fields', () => {
  for (const file of ['ReportDefectForm', 'VehicleInspectionForm', 'LogRefuelForm', 'LogChargeForm', 'AccidentReportForm']) {
    const src = fs.readFileSync(`src/components/driver/${file}.tsx`, 'utf8');
    const ast = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let count = 0;
    function visit(node) { if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === 'textarea') {
      count++; const attrs = node.attributes.getText(ast); assert.match(attrs, /spellCheck=\{true\}/, file); assert.match(attrs, /lang="en-ZA"/, file);
    } ts.forEachChild(node, visit); } visit(ast); assert.ok(count, file);
  }
});

test('startup restoration copy is role-neutral', () => {
  const h = harness(); const App = h.load('src/App.tsx').default;
  assert.match(text(h.render(App)), /Restoring session/); assert.doesNotMatch(text(h.render(App)), /Restoring Driver Session/i);
});
