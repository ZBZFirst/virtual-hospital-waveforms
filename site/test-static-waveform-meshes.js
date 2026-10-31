'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('scene3d/parts/floor-loader.js','utf8');
const start=source.indexOf('function isStaticWaveformMeshName(');
const end=source.indexOf('\n}\n',source.indexOf('function hideStaticWaveforms(',start));
assert(start>=0 && end>start);
const context=vm.createContext({});
vm.runInContext(source.slice(start,end+2),context);
const bytes=fs.readFileSync('scene3d/ward_floor_02.glb');
assert.equal(bytes.toString('ascii',0,4),'glTF');
const jsonLength=bytes.readUInt32LE(12);
const glb=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
const staticTraces=glb.nodes.filter(node=>node.mesh!==undefined && /rolling (?:pressure|flow|calculated volume)|current sample edge/i.test(node.name||''));
assert.equal(staticTraces.length,24,'shared floor has three baked traces and a fixed edge in each of six ventilator rooms');
const runtime=[];
for(const node of staticTraces){
  assert(context.isStaticWaveformMeshName(node.name),`exported name missed: ${node.name}`);
  assert(context.isStaticWaveformMeshName(node.name.replace(/[^\w]/g,'_')),
    `Three.js runtime name missed: ${node.name}`);
  runtime.push({isMesh:true,name:node.name.replace(/[^\w]/g,'_'),userData:{name:node.name},visible:true});
}
for(const node of glb.nodes.filter(node=>node.mesh!==undefined && /ventilator monitor screen|full-feed screen overlay/i.test(node.name||'')))
  assert(!context.isStaticWaveformMeshName(node.name),`live monitor surface hidden: ${node.name}`);
const liveScreen={isMesh:true,name:'F02_Room_01_ventilator_monitor_screen',userData:{name:'F02 | Room 01 ventilator monitor screen'},visible:true};
runtime.push(liveScreen);
context.hideStaticWaveforms({traverse:callback=>runtime.forEach(callback)});
assert(runtime.slice(0,-1).every(node=>!node.visible),'all baked traces must be hidden after loading');
assert(liveScreen.visible,'live screen mesh must remain visible');
console.log('All 24 baked ventilator trace and edge meshes are hidden; live screens remain');
