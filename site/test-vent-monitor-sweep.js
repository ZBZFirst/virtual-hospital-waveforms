'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function sourceOf(file, name) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\n}\n', start);
  assert(start >= 0 && end > start);
  return source.slice(start, end + 2);
}

const labels=[], fills=[];
const c={
  fillRect(...args){fills.push(args);},fillText(...args){labels.push(args);},
  beginPath(){},moveTo(){},lineTo(){},stroke(){},
};
const screen={canvas:{getContext:()=>c}};
const record={
  room:1,recording:'uc-001',external:true,sourceRate:50,sourceSeconds:5,
  pressure_cm_h2o:Array(750).fill(20),flow_l_min:Array(750).fill(5),volume_ml:Array(750).fill(400),
  pressureRange:[0,50],flowRange:[-60,60],volumeRange:[0,800],
};
const context=vm.createContext({
  roomAssignment:()=>({patient_id:'patient',uc_davis_recording:'uc-001'}),
  activeHospital:'A',activeFloor:1,performance:{now:()=>1000},
});
vm.runInContext(fs.readFileSync('scene3d/parts/monitor-system.js','utf8'),context);
vm.runInContext(sourceOf('scene3d/parts/screens-and-tablet.js','drawVentScreen'),context);
assert.equal(context.drawVentScreen(screen.canvas,record,5,screen),true);
assert.equal(screen.lastSourceSeconds,5);
assert.equal(fills.filter(([x,y,w,h])=>x===0&&y===0&&w===640&&h===400).length,1);
assert(labels.some(([label])=>String(label).includes('VENTILATOR')));
assert(labels.some(([label])=>String(label).includes('Flow')));
assert(!labels.some(([label])=>String(label).includes('ECG')),'ventilator layout excludes vital channels');
assert.equal(context.drawVentScreen(screen.canvas,{...record,sourceSeconds:5.1},5.1,screen),true);
labels.length=0;
context.drawVentScreen(screen.canvas,{...record,duration:5},5,screen);
assert(labels.some(([label])=>String(label).includes('complete · replay to restart')),
  'a finite source must say when its final trace is complete');

const previewContext = vm.createContext({ Number, Math, Float32Array });
vm.runInContext(sourceOf('page/frame-and-atlas-input.js', 'previewRanges'), previewContext);
const entry = { signalBins: 4, previewBytes: Uint8Array.from([127, 50, 148, 55, 148, 60, 127, 50]) };
const ranges = previewContext.previewRanges(entry);
assert.equal(previewContext.previewRanges(entry), ranges, 'recording scale is calculated only once');
assert.equal(entry.previewVolume.length, 4);
assert(entry.previewVolume[2] > entry.previewVolume[1], 'volume follows successive source samples');
assert(ranges.pressure[0] < 10 && ranges.pressure[1] > 12);
assert(ranges.volume[0] < entry.previewVolume[0] && ranges.volume[1] > entry.previewVolume[2]);
console.log('Ventilator wall screen uses shared waveform layout and fixed source ranges');
