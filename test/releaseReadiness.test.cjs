const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { harness, nodes, text, button } = require('./uiHarness.cjs');

const lib = name => harness().load('src/lib/' + name + '.ts');
test('vehicle registration is primary, historical snapshot wins, names and explicit short references preserve identity', () => {
  const { formatVehicleIdentity: f } = lib('vehicleIdentity');
  assert.deepEqual(f({ id: 'internal-long-id', registration: 'CA 123', make: 'Toyota', model: 'Hilux', alias: 'Pool 3' }), { primary: 'CA 123', secondary: 'Toyota Hilux Pool 3' });
  assert.equal(f({ vehicleId: 'internal', vehicleRegistrationSnapshot: 'OLD' }, { registration: 'NEW' }).primary, 'OLD');
  assert.equal(f({ vehicleId: 'internal', name: 'Named vehicle' }).primary, 'Named vehicle');
  assert.match(f({ vehicleId: 'abcdefghijk' }).primary, /^Vehicle reference abcdefgh…$/);
});
test('defect TEST filter and counts use explicit markers and missing-marker parent fallback, never names', () => {
  const { visibleDefects, isTestDefect } = lib('defectVisibility');
  const records = [{ id: 'real', vehicleId: 'v', driverId: 'd', status: 'Open', urgency: 'Low' },
    { id: 'test', isTestData: true, status: 'Open', urgency: 'Low' },
    { id: 'old', vehicleId: 'test-v', status: 'Open', urgency: 'Low' }];
  const vehicles = [{ id: 'test-v', isTestData: true }];
  assert.deepEqual(visibleDefects(records, [], vehicles, false).map(v => v.id), ['real']);
  assert.equal(visibleDefects(records, [], vehicles, true).filter(v => v.status === 'Open').length, 3);
  assert.equal(isTestDefect(records[0], [{ id: 'd', firstName: 'Test' }], []), false);
  assert.equal(visibleDefects(records, [], vehicles, true, 'Resolved').length, 0);
});
test('admin restoration waits for auth readiness and server profile, and denies non-admin/inactive profiles', async () => {
  const { restoreAdminProfile: restore } = lib('adminSession'); const calls=[];
  const admin = { role: 'admin', employmentStatus: 'Active' };
  const auth = { currentUser: null, authStateReady: async () => { calls.push('ready'); auth.currentUser = {}; } };
  assert.equal(await restore(auth, async () => { calls.push('server'); return admin; }), admin);
  assert.deepEqual(calls, ['ready', 'server']);
  for (const profile of [null, { role: 'driver', employmentStatus: 'Active' }, { role: 'admin', employmentStatus: 'Inactive' }]) assert.equal(await restore(auth, async () => profile), null);
  await assert.rejects(restore(auth, async () => { throw Error('denied'); }), /denied/);
  assert.equal(await restore({ currentUser: null, authStateReady: async () => {} }, () => assert.fail()), null);
});
test('economy missing inputs retain null variance and never count healthy for either fuel type', () => {
  const { fuelEconomyStatus: f, fuelEconomyCounts: counts } = lib('fuelEconomy');
  for (const vehicleType of ['ICE', 'EV']) {
    const status = f({ vehicleType }); assert.equal(status.current, null); assert.equal(status.currentVsBaseline, null); assert.equal(status.hasSufficientData, false);
    assert.deepEqual(counts([status], 2), { healthy: 0, attention: 0, insufficient: 2 });
  }
  const good = f({ vehicleType: 'ICE', baselineFuelConsumption: 7, currentFuelConsumption: 7, economyVarianceThreshold: 15 });
  assert.equal(good.currentVsBaseline, 0); assert.equal(counts([good], 1).healthy, 1);
  assert.equal(f({ vehicleType: 'EV', baselineEnergyConsumption: 12, currentEnergyConsumption: 16 }).needsAttention, true);
  assert.equal(f({ vehicleType: 'ICE', baselineFuelConsumption: 7 }).hasSufficientData, false);
});
test('elapsed time clamps future and invalid clocks and formats normal duration', () => {
  const { elapsedTime: f } = lib('elapsedTime');
  assert.equal(f('2026-01-01T00:00:01Z', Date.parse('2026-01-01T00:00:00Z')), '0h 0m');
  assert.equal(f('invalid', 0), '0h 0m'); assert.equal(f(new Date(0), 3660000), '1h 1m');
});
test('password eye changes type but preserves value and has accessible labels', () => {
  const h = harness(), Login = h.load('src/components/auth/AdminLogin.tsx').default; let tree=h.render(Login, {});
  nodes(tree, n => n.type === 'input' && n.props.type === 'password')[0].props.onChange({ target: { value: 'synthetic secret' } });
  tree=h.render(Login, {}); const show=nodes(tree, n => n.type === 'button' && n.props['aria-label'] === 'Show password')[0];
  assert.equal(show.props.type, 'button'); show.props.onClick(); tree=h.render(Login, {});
  assert.equal(nodes(tree, n => n.type === 'input' && n.props.value === 'synthetic secret')[0].props.type, 'text');
  nodes(tree, n => n.type === 'button' && n.props['aria-label'] === 'Hide password')[0].props.onClick();
  assert.equal(nodes(h.render(Login, {}), n => n.type === 'input' && n.props.value === 'synthetic secret')[0].props.type, 'password');
});
test('evidence viewer renders private image bytes, disables during read and reports missing evidence', async () => {
  const h = harness(), Photo = h.load('src/components/shared/EvidencePhoto.tsx').default;
  const props={ caption: 'Scene', load: async () => ({ imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }) };
  const pending=button(h.render(Photo,props), 'View photo: Scene').props.onClick();
  assert.ok(button(h.render(Photo,props), 'Loading evidence…').props.disabled); await pending;
  assert.match(nodes(h.render(Photo,props), n => n.type === 'img')[0].props.src, new RegExp('^data:image/png'));
  props.load=async () => { throw { code: 'functions/not-found' }; };
  await button(h.render(Photo,props), 'View photo: Scene').props.onClick();
  assert.match(text(h.render(Photo,props)), /Evidence photo is missing/);
});
test('Telegram release screen makes no network request and presents deferred notice', async () => {
  const previous=global.fetch; global.fetch=() => assert.fail('No localhost/network fetch allowed');
  try { const h=harness(), Page=h.load('src/components/admin/TelegramDrivers.tsx').default;
    assert.match(text(h.render(Page,{onBack(){}})), /deferred/); await h.settle();
  } finally { global.fetch=previous; }
});
test('defect list and read-only detail prefer registration and route attached evidence by index', async () => {
  const defect={id:'defect',vehicleId:'internal-v',driverId:'d',reportedDateTime:new Date(),description:'Body mark',category:'Exterior',urgency:'Low',status:'Open',photos:['private-path'],vehicleRegistrationSnapshot:'CA 123'};
  const h=harness({getAllDefects:async()=>[defect,{...defect,id:'test',isTestData:true}],getVehicles:async()=>[],getUsers:async()=>[{id:'d',firstName:'QA',surname:'Driver'}]});
  const Page=h.load('src/components/admin/ManageDefects.tsx').default;h.render(Page,{});await h.settle();let tree=h.render(Page,{});
  assert.equal(nodes(tree,n=>n.type==='tr').length,2); assert.match(text(tree),/CA 123/);
  nodes(tree,n=>n.type==='button'&&text(n).includes('Body mark'))[0].props.onClick();tree=h.render(Page,{});
  const detail=nodes(tree,n=>n.props.role==='dialog')[0];assert.match(text(detail),new RegExp('Evidence / Photos'));assert.equal(nodes(detail,n=>n.type==='input').length,0);
  assert.equal(nodes(detail,n=>n.type.name==='EvidencePhoto').length,1);
  nodes(tree,n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({target:{checked:true}});
  assert.equal(nodes(h.render(Page,{}),n=>n.type==='tr').length,3);
});

test('App startup actually restores validated Admin after auth initialization and fails closed for another role', async () => {
  const previous=global.window;global.window={location:{hash:'#/admin'}};
  try {
    for (const role of ['admin','driver']) {
      const user={role,employmentStatus:'Active',id:'auth-user'};
      const h=harness({noDriver:true,auth:{currentUser:{uid:'auth-user'},authStateReady:async()=>{}},getAdminProfile:async()=>user});
      const App=h.load('src/App.tsx').default;
      assert.match(text(h.render(App,{})),/Please wait/);await h.settle();await h.settle();
      const tree=h.render(App,{});const provider=nodes(tree,n=>n.type==='provider')[0];
      if(role==='admin')assert.equal(provider.props.value.currentUser.id,'auth-user');else assert.equal(provider,undefined);
    }
  } finally {global.window=previous;}
});
test('Admin logout signs out Firebase before clearing app state', async () => {
  const order=[];const h=harness({currentUser:{role:'admin'},auth:{},signOut:async()=>order.push('firebase'),setCurrentUser:user=>{assert.equal(user,null);order.push('app');}});
  const Header=h.load('src/components/shared/Header.tsx').default;
  await nodes(h.render(Header,{title:'Admin'}),n=>n.type==='button'&&n.props.title==='Logout')[0].props.onClick();
  assert.deepEqual(order,['firebase','app']);
});
