'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const campus=JSON.parse(fs.readFileSync('scene3d/campus_manifest_full_catalog.json','utf8'));
const rawRooms=new Map(campus.rooms.map(room=>[room.id,{...room}]));
const source=fs.readFileSync('scene3d/parts/navigation.js','utf8');
const start=source.indexOf('function prepareSimulationRooms(');
const end=source.indexOf('\n}\n',start);
assert(start>=0&&end>start);
const context=vm.createContext({Map,Error,String});
vm.runInContext(source.slice(start,end+2),context);
const rooms=context.prepareSimulationRooms(campus);
const simulations=campus.rooms.filter(room=>room.simulation_room);
assert.equal(simulations.length,25);
assert.equal(simulations.filter(room=>room.simulated_uc_davis_recording).length,3);
assert.equal(simulations.filter(room=>room.simulated_telemetry_record).length,2);
for(const room of simulations){
  const donor=rooms.get(`${room.hospital_id}-F${String(room.floor).padStart(2,'0')}-R05`);
  assert(room.patient_id && room.room===6);
  if(room.simulated_uc_davis_recording)assert.equal(room.uc_davis_recording,donor.uc_davis_recording);
  if(room.simulated_telemetry_record)assert.equal(room.telemetry_record,donor.telemetry_record);
}
assert.equal(simulations.filter(room=>room.uc_davis_recording&&room.telemetry_record).length,5);
assert.equal(simulations.filter(room=>room.uc_davis_recording&&!room.telemetry_record).length,20);
const pageSource=fs.readFileSync('page/waveform-detail.js','utf8');
const pageStart=pageSource.indexOf('function simulationRoomForRecording(');
const pageEnd=pageSource.indexOf('\n}\n',pageStart);
assert(pageStart>=0&&pageEnd>pageStart);
const page=vm.createContext({fullCatalogById:new Map(campus.rooms.map(room=>[room.id,room]))});
vm.runInContext(pageSource.slice(pageStart,pageEnd+2),page);
const vitalStart=pageSource.indexOf('function vitalRoomForSelectedRecording(');
const vitalEnd=pageSource.indexOf('\n}\n',vitalStart);
assert(vitalStart>=0&&vitalEnd>vitalStart);
page.fullCatalogByRecording=new Map([...rawRooms.values()].filter(room=>room.uc_davis_recording).map(room=>[room.uc_davis_recording,room]));
page.state={selected:null,sceneRoomContext:null};
vm.runInContext(pageSource.slice(vitalStart,vitalEnd+2),page);
for(const room of simulations.filter(room=>room.simulated_uc_davis_recording)){
  assert.equal(page.simulationRoomForRecording(room.id,room.simulated_uc_davis_recording),room);
  assert.equal(page.simulationRoomForRecording(room.id,'wrong-source'),null);
}
for(const room of simulations.filter(room=>room.uc_davis_recording&&room.telemetry_record)){
  page.state.selected={name:room.uc_davis_recording};
  page.state.sceneRoomContext=room.simulated_uc_davis_recording?rawRooms.get(room.id):null;
  assert.equal(page.vitalRoomForSelectedRecording().id,room.id);
}
const ventOnly=simulations.find(room=>room.uc_davis_recording&&!room.telemetry_record);
page.state.selected={name:ventOnly.uc_davis_recording};page.state.sceneRoomContext=null;
assert.equal(page.vitalRoomForSelectedRecording(),null);
console.log('Occupied Room 6 simulation sources follow Room 5 without reassigning original recordings');
