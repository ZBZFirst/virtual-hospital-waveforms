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
const staticIds=new Set(glb.nodes.flatMap((node,index)=>staticTraces.includes(node)?[index]:[]));
const reachable=new Set();
function visit(index){
  if(reachable.has(index))return;
  reachable.add(index);
  for(const child of glb.nodes[index].children||[])visit(child);
}
for(const scene of glb.scenes)for(const root of scene.nodes||[])visit(root);
assert([...staticIds].every(index=>!reachable.has(index)),
  'baked ventilator traces and playheads must be detached from every GLB scene');
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
console.log('All 24 baked ventilator traces and playheads are detached from the floor scene; live screens remain');
