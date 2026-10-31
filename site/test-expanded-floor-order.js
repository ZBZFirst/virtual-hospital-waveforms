'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('scene3d/parts/navigation.js','utf8');
const start=source.indexOf('async function fillExpandedFloorDetails(');
const end=source.indexOf('\nfunction leaveHospitalView()',start);
assert(start>=0&&end>start);
const requested=[],revealed=[],progress=[],status={textContent:''};
const context=vm.createContext({
  floorRevealOrder:[4,5,6,1,2,3],floors:Array(6).fill({}),floorPreviews:new Map(),
  floorSelectToken:7,activeHospital:'A',expandedHospital:true,modelTransfers:new Map(),
  finishModelLoad:()=>{},advanceModelBuild:(_token,count)=>progress.push(count),
  ensureFloor:async (hospital,level)=>{requested.push(level);return {level};},
  revealFloor:level=>{revealed.push(level);return Promise.resolve();},status,
  showError:error=>{throw error;},Promise,
});
vm.runInContext(source.slice(start,end),context);
context.fillExpandedFloorDetails('A',{},7,1).then(()=>{
  assert.deepEqual(requested,[4,5,6,1,2,3]);
  assert.deepEqual(revealed,[4,5,6,1,2,3], 'cached floors still follow the reveal order');
  assert.equal(progress.at(-1),6,'progress completes after the sixth reveal');
  assert.match(status.textContent,/six floors ready/);
  console.log('Expanded hospital reveals cached floors in lower-row order');
}).catch(error=>{console.error(error);process.exitCode=1;});
