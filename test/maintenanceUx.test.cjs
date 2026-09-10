const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness,nodes,text,button}=require('./uiHarness.cjs');
const vehicle={id:'v',registration:'TEST SERVICE',status:'In Service',currentOdometer:1000,lastServiceOdometer:900,isTestData:true,lifecycleRevision:4,maintenanceHold:{id:'hold-a',source:'SERVICE',reason:'Reviewed workshop hold'}};
const service={id:'s',vehicleId:'v',serviceType:'Oil service',dueDate:'2026-09-10',dueOdometer:2000,isBooked:true,sentForService:true,serviceProvider:'Workshop',linkedDefectIds:['d'],isTestData:true};
const byLabel=(tree,label)=>nodes(tree,n=>n.type==='label' && text(n).trim().startsWith(label))[0];
function input(tree,label,type='input') { const l=byLabel(tree,label); assert.ok(l,label); return nodes(l,n=>n.type===type)[0]; }
async function board(s=service,over={}) {
  const h=harness({getScheduledServices:async()=>[s],getVehicles:async()=>[vehicle],getAllDefects:async()=>[{id:'d',vehicleId:'v',status:'Open',urgency:'Low',description:'Original defect'}],getServiceProviders:async()=>[],...over});
  const C=h.load('src/components/admin/ServiceManagement.tsx').default, props={onChanged(){}};
  h.render(C,props); await h.settle(); let tree=h.render(C,props);
  input(tree,'Include TEST services').props.onChange({target:{checked:true}});
  return {h,C,props,render:()=>h.render(C,props)};
}
test('service board excludes TEST initially and completion is awaiting release rather than In Service',async()=>{
  const h=harness({getScheduledServices:async()=>[{...service,returnedFromService:true,actualCost:123,returnDate:'2026-09-10'}],getVehicles:async()=>[vehicle],getAllDefects:async()=>[],getServiceProviders:async()=>[]});
  const C=h.load('src/components/admin/ServiceManagement.tsx').default,props={onChanged(){}};
  h.render(C,props);await h.settle();let tree=h.render(C,props);assert.ok(!text(tree).includes('TEST SERVICE'));
  input(tree,'Include TEST services').props.onChange({target:{checked:true}});tree=h.render(C,props);
  assert.match(text(tree),/TEST SERVICE — TEST/);assert.match(text(tree),/Work Completed \/ Awaiting Release/);
  assert.ok(button(tree,'Release vehicle'));assert.ok(!button(tree,'Complete work'));assert.ok(!text(tree).includes('In Service'));
});
test('completion starts actual odometer/cost blank and resolves only selected explicit links',async()=>{
  const calls=[];const b=await board(service,{completeServiceAdmin:async p=>{calls.push(p);}});
  button(b.render(),'Complete work').props.onClick(); let tree=b.render();
  assert.equal(input(tree,'Actual completion odometer').props.value,''); assert.equal(input(tree,'Actual cost').props.value,'');
  input(tree,'Actual completion odometer').props.onChange({target:{value:'1100'}});
  input(b.render(),'Actual cost').props.onChange({target:{value:'0'}});
  input(b.render(),'Completion notes','textarea').props.onChange({target:{value:'Completed actual work'}});
  await nodes(b.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
  assert.equal(calls.length,1);assert.equal(calls[0].odometer,1100);assert.equal(calls[0].actualCost,0);assert.deepEqual(calls[0].resolvedDefectIds,[]);
  assert.deepEqual(calls[0].expectedDefectRevisions,{});
});

test('completion draft retains reviewed defect revisions and displayed evidence across refresh before FIRST submission',async()=>{
  let current={id:'d',vehicleId:'v',status:'Open',urgency:'Critical',description:'Reviewed brake fault',defectRevision:7};const calls=[];
  const b=await board(service,{getAllDefects:async()=>[current],completeServiceAdmin:async p=>{calls.push(p);throw Error('Selected defect changed');}});
  button(b.render(),'Complete work').props.onClick();input(b.render(),'Reviewed brake fault').props.onChange({target:{checked:true}});
  current={...current,defectRevision:9,description:'Later reopened brake fault'};button(b.render(),'Refresh services').props.onClick();await b.h.settle();
  assert.match(text(b.render()),/Reviewed brake fault/);assert.ok(!text(b.render()).includes('Later reopened brake fault'));
  input(b.render(),'Actual completion odometer').props.onChange({target:{value:'1100'}});input(b.render(),'Actual cost').props.onChange({target:{value:'10'}});input(b.render(),'Completion notes','textarea').props.onChange({target:{value:'Reviewed repair'}});
  await nodes(b.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});assert.deepEqual(calls[0].expectedDefectRevisions,{d:7});assert.match(text(b.render()),/Selected defect changed/);
});

for(const name of ['StatusUpdateModal','AssignDefectModal']) test(`${name} retains reviewed revision across parent refresh`,async()=>{
  const calls=[];const h=harness({transitionDefectAdmin:async p=>{calls.push(p);}}),C=h.load('src/components/admin/ManageDefects.tsx')[name];
  const defect={id:'d',vehicleId:'v',status:'Open',urgency:'Critical',description:'Brake fault',reportedDateTime:new Date(),defectRevision:4},props={defect,onClose(){},onSave(){}};
  const tree=h.render(C,props);
  if(name==='StatusUpdateModal') {nodes(tree,n=>n.type==='select')[0].props.onChange({target:{value:'Resolved'}});nodes(tree,n=>n.type==='textarea')[0].props.onChange({target:{value:'Reviewed original condition'}});}
  else nodes(tree,n=>n.type==='input'&&n.props.type==='text')[0].props.onChange({target:{value:'TEST technician'}});
  const updated={...props,defect:{...defect,defectRevision:6}};await nodes(h.render(C,updated),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
  assert.equal(calls[0].expectedDefectRevision,4);assert.equal(calls[0].expectedStatus,'Open');
});
test('failed release retains request identity for a safe retry and shows blocker error',async()=>{
  const calls=[];const b=await board({...service,returnedFromService:true},{changeVehicleLifecycleAdmin:async p=>{calls.push(p);throw Error('Another dispatched service requires completion');}});
  button(b.render(),'Release vehicle').props.onClick();input(b.render(),'Release reason','textarea').props.onChange({target:{value:'Checked vehicle'}});
  await nodes(b.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
  assert.match(text(b.render()),/Another dispatched service/);
  await nodes(b.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
  assert.equal(calls[0].requestId,calls[1].requestId);assert.equal(calls[0].clearManualHold,false);
  assert.equal(calls[0].expectedLifecycleRevision,4);assert.equal(calls[0].expectedHoldId,'hold-a');assert.equal(calls[0].releaseServiceId,'s');
});
test('maintenance modal reads canonical history on fresh mount, ignoring stale local history as authority',async()=>{
  const record={id:'saved',vehicleId:'v',date:'2026-09-10',odometer:1100,serviceType:'Persisted workshop repair',cost:123,notes:'Saved notes'};
  for(let reload=0;reload<2;reload++){
    const reads=[];const h=harness({getMaintenanceRecords:async id=>{reads.push(id);return [record];}});
    const C=h.load('src/components/admin/ManageVehicles.tsx').MaintenanceModal,props={vehicle,onClose(){},onRecordAdded(){}};
    h.render(C,props);await h.settle();const tree=h.render(C,props);
    assert.deepEqual(reads,['v']);assert.match(text(tree),/Persisted workshop repair/);assert.match(text(tree),/History — TEST/);
  }
});
test('explicit lifecycle UI remains separate from descriptive save and surfaces server blocker',async()=>{
  const calls=[];const h=harness({changeVehicleLifecycleAdmin:async p=>{calls.push(p);throw Error('Outstanding linked defect');}});
  const C=h.load('src/components/admin/VehicleLifecycleActions.tsx').default,props={vehicle,onSaved(){assert.fail('Blocked transition cannot report saved');}};
  let tree=h.render(C,props);input(tree,'New lifecycle state','select').props.onChange({target:{value:'Active'}});
  input(h.render(C,props),'Lifecycle reason').props.onChange({target:{value:'Release check'}});
  await button(h.render(C,props),'Apply lifecycle change').props.onClick();tree=h.render(C,props);
  assert.match(text(tree),/Outstanding linked defect/);assert.equal(calls[0].status,'Active');assert.equal(calls[0].clearManualHold,false);
});

test('lifecycle draft keeps the reviewed hold when parent data changes before FIRST submission',async()=>{
  const calls=[];const h=harness({changeVehicleLifecycleAdmin:async p=>{calls.push(p);throw Error('Vehicle hold changed. Reload and review');}});
  const C=h.load('src/components/admin/VehicleLifecycleActions.tsx').default,props={vehicle,onSaved(){}};
  let tree=h.render(C,props);input(tree,'New lifecycle state','select').props.onChange({target:{value:'Active'}});
  input(h.render(C,props),'Lifecycle reason').props.onChange({target:{value:'Approve reviewed hold A'}});
  const newer={...props,vehicle:{...vehicle,lifecycleRevision:5,maintenanceHold:{id:'hold-b',reason:'New brakes'}}};
  await button(h.render(C,newer),'Apply lifecycle change').props.onClick();
  assert.equal(calls[0].expectedLifecycleRevision,4);assert.equal(calls[0].expectedHoldId,'hold-a');
  assert.match(text(h.render(C,newer)),/Reviewed workshop hold/);assert.match(text(h.render(C,newer)),/Vehicle hold changed/);
});

test('service release refresh cannot silently rebind an open approval to a newer hold',async()=>{
  let current=vehicle;const calls=[];const b=await board({...service,returnedFromService:true},{getVehicles:async()=>[current],changeVehicleLifecycleAdmin:async p=>{calls.push(p);throw Error('Vehicle hold changed');}});
  button(b.render(),'Release vehicle').props.onClick();input(b.render(),'Release reason','textarea').props.onChange({target:{value:'Reviewed A'}});
  current={...vehicle,lifecycleRevision:5,maintenanceHold:{id:'hold-b',reason:'New hold'}};
  button(b.render(),'Refresh services').props.onClick();await b.h.settle();
  await nodes(b.render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
  assert.equal(calls[0].expectedLifecycleRevision,4);assert.equal(calls[0].expectedHoldId,'hold-a');assert.match(text(b.render()),/Reviewed workshop hold/);
});
