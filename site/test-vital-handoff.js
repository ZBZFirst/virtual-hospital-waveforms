'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const campus=JSON.parse(fs.readFileSync('scene3d/campus_manifest_full_catalog.json','utf8'));
const byId=new Map(campus.rooms.map(room=>[room.id,room]));
for(const room of campus.rooms)if(room.simulated_telemetry_record)
  room.telemetry_record=room.simulated_telemetry_record;
const source=fs.readFileSync('scene3d/parts/vital-detail.js','utf8');
const start=source.indexOf('async function openVitalRoomFromPage(');
const end=source.indexOf('\n}\n',start);
assert(start>=0&&end>start);
const opened=[],selected=[];
const context=vm.createContext({
  roomById:byId,activeHospital:'A',activeFloor:1,hospitalView:false,expandedHospital:false,
  floors:[{}],walkMode:true,walkRoom:6,
  selectHospital:async hospital=>{context.activeHospital=hospital;context.expandedHospital=true;context.walkMode=false;},
  setFloor:async floor=>{context.activeFloor=floor;context.expandedHospital=false;context.floors[floor-1]={};},
  stopWalk:()=>{context.walkMode=false;},
  setRoom:room=>selected.push(room),
  openVitalDetail:room=>opened.push(room.id),
});
vm.runInContext(source.slice(start,end+2),context);
(async()=>{
  await context.openVitalRoomFromPage('A-F01-R06');
  assert.deepEqual(opened,['A-F01-R06'],'open the same Room 6 vital recording');
  assert.deepEqual(selected,[],'keep an existing Room 6 walk position');
  await context.openVitalRoomFromPage('B-F01-R06');
  assert.deepEqual(opened,['A-F01-R06','B-F01-R06'],'open the Room 6 simulated telemetry source');
  assert.deepEqual(selected,[6],'navigate when the patient is in another hospital');
  await context.openVitalRoomFromPage('A-F02-R06');
  assert.equal(opened.length,2,'a ventilator-only Room 6 has no vital handoff');
  console.log('Ventilator detail hands off to the matching Room 6 vital view');
})().catch(error=>{console.error(error);process.exitCode=1;});
