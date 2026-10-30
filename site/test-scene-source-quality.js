'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function sourceOf(file,name){
  const source=fs.readFileSync(file,'utf8');
  const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n}\n',start);
  assert(start>=0&&end>start);
  return source.slice(start,end+2);
}

const recording='uc-test';
const flow=Float32Array.from({length:300},(_,i)=>i===250?112.7:Math.sin(i/9)*20);
const pressure=Float32Array.from({length:300},(_,i)=>i===250?32.3:12);
const volume=Float64Array.from({length:300},(_,i)=>i*2);
const data={flow,pressure,volume,loadedSegments:new Set([0])};
const entry={name:recording,samples:300};
const page=vm.createContext({state:{cache:new Map([[recording,data]])},RATE:50,
  segmentNumber:()=>0,Number,Math});
vm.runInContext(sourceOf('page/frame-and-atlas-input.js','fullSceneRanges'),page);
vm.runInContext(sourceOf('page/frame-and-atlas-input.js','sceneWindow'),page);
const window=page.sceneWindow(entry,5);
assert.equal(window.sourceRate,50);
assert.equal(window.flow.length,250);
assert(Math.abs(window.flow[249]-112.7)<.0001,'the exact 50 Hz source peak must reach the scene');
assert(window.ranges.flow[1]>112.7,'the fixed scale must contain the full source peak');

const assignment={id:'A-F01-R01',room:1,uc_davis_recording:recording};
const scene=vm.createContext({roomById:new Map([[assignment.id,assignment]]),
  ucVentByRoom:new Map(),THREE:{MathUtils:{lerp:(a,b,t)=>a+(b-a)*t}},
  Number,Math});
vm.runInContext(sourceOf('scene3d/parts/core.js','updateUcVentWindow'),scene);
scene.updateUcVentWindow({rooms:[{id:assignment.id,recording,sourceSeconds:5,...window}]});
const result=scene.ucVentByRoom.get(assignment.id);
assert.equal(result.sourceRate,50);
assert(Math.abs(result.flow_l_min[249]-112.7)<.0001,'the scene must preserve rather than resample full source values');
assert(Math.abs(result.pressure_cm_h2o[249]-32.3)<.0001);
assert.equal(result.volume_ml[249],500);

let previewLoads=0,fullLoads=0;
const requests=vm.createContext({scenePreviewRequests:new Map(),performance:{now:()=>5000},
  loadPreviewForFloor:async()=>{previewLoads++;},warmSceneFloor:async()=>{fullLoads++;},
  state:{segmentStore:{}},console});
vm.runInContext(sourceOf('page/frame-and-atlas-input.js','requestSceneFloor'),requests);
requests.requestSceneFloor('A',2,'preview');
assert.equal(previewLoads,1);
assert.equal(fullLoads,0,'unfocused cube faces must not prefetch full recordings');
requests.requestSceneFloor('A',2,'full');
assert.equal(fullLoads,1,'focused cube face requests full source data');
console.log('Full 50 Hz samples and peaks survive the scene handoff');
