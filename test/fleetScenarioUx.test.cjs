const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, nodes, text } = require('./uiHarness.cjs');
const { scenarioReport } = require('./scenarioFixtures.cjs');
const admin = { id:'admin', role:'admin', employmentStatus:'Active' };
function setup(overrides = {}) {
  const h = harness({ currentUser:admin, listChargingLocationsAdmin:async () => [], ...overrides });
  const C = h.load('src/components/admin/EVReplacementScenario.tsx').default;
  const report = scenarioReport(), source = report.vehicles[0];
  const render = () => h.render(C, { report, source, catalogue:[], onClose() {} });
  const change = (label, value) => {
    const wrapper = nodes(render(), n => n.type === 'label' && text(n).startsWith(label))[0];
    assert.ok(wrapper, label); nodes(wrapper, n => n.type === 'input' || n.type === 'select')[0].props.onChange({target:{value}});
  };
  const submit = () => nodes(render(), n => n.type === 'form')[0].props.onSubmit({preventDefault(){}});
  return {h, render, change, submit, report};
}
test('scenario UI separates observations, assumptions and outputs; edit clears calculated output', () => {
  const {render,change,submit} = setup();
  assert.match(text(render()), /FleetWise observed evidence/); assert.match(text(render()), /Scenario assumptions/);
  change('Target EV','ev'); change('Planned annual distance','25000'); change('ICE baseline source','USER_SCENARIO');
  change('Scenario ICE consumption','10'); change('Scenario fuel price','24'); change('EV consumption source','USER_SCENARIO');
  change('Scenario EV consumption','18'); change('EV energy boundary','BATTERY'); change('Charging loss assumption','10');
  change('Electricity tariff source','CUSTOM'); change('Electricity tariff (','2.5'); submit();
  let words = text(render()); assert.match(words, /Calculated scenario outputs/); assert.match(words, /TEST ICE/); assert.match(words, /TEST EV/);
  assert.match(words, /47[\s,.]?500/); assert.match(words, /User-supplied consumption/);
  assert.match(words, /Excludes vehicle purchase price, finance, depreciation, maintenance, insurance, infrastructure and residual value/);
  assert.match(words, /Vehicle suitability is not assessed/); assert.match(words, /Indicative operating energy\/fuel comparison/);
  assert.doesNotMatch(words, /\bROI\b|payback|replace now|savings guaranteed|best option/i);
  change('Planned annual distance','26000'); assert.doesNotMatch(text(render()), /Calculated scenario outputs/);
});
test('missing inputs block results; location failure permits explicit custom tariff', async () => {
  const s = setup({listChargingLocationsAdmin:async () => {throw Error('test');}});
  s.render(); await s.h.settle(); s.submit();
  assert.match(text(s.render()), /Enter a positive planned annual distance/);
  assert.match(text(s.render()), /Charging location tariffs could not load/);
  assert.doesNotMatch(text(s.render()), /Calculated scenario outputs/);
});
test('insufficient observed input is disabled, manufacturer EV absent, planned distance remains explicit', () => {
  const s=setup(); s.report.vehicles.forEach(v => { v.readiness.consumption.state='INSUFFICIENT_DATA'; v.readiness.cost.state='INSUFFICIENT_DATA'; });
  s.change('Target EV','ev');
  const tree=s.render(), options=nodes(tree,n=>n.type==='option');
  assert.ok(options.filter(n=>n.props.value==='OBSERVED_VEHICLE').every(n=>n.props.disabled));
  assert.ok(options.find(n=>n.props.value==='OBSERVED_COST').props.disabled);
  assert.equal(options.filter(n=>n.props.value==='MANUFACTURER_REFERENCE').length,1);
  assert.match(text(tree), /Observed annualization is unavailable/);
});
for(const user of [{role:'driver',employmentStatus:'Active'},{role:'admin',employmentStatus:'Inactive'}]) test(`scenario denies ${user.role} ${user.employmentStatus} without fetching tariffs`, async () => {
  let calls=0; const s=setup({currentUser:user,listChargingLocationsAdmin:async()=>{calls++;return [];}});
  assert.equal(text(s.render()),'Active Admin access required.'); await s.h.settle(); assert.equal(calls,0);
});
