'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const labels=[],lines=[];
const canvas={
  fillRect(){},fillText(value){labels.push(String(value));},
  beginPath(){},moveTo(x,y){lines.push([x,y]);},lineTo(x,y){lines.push([x,y]);},stroke(){},
};
const vital={
  fs:50,samples:1000,windows:new Int32Array(400),parts:{},count:1,
  channels:{'ecg lead ii':{index:0,baseline:0,gain:1},art:{index:0,baseline:0,gain:1}},
  chartRanges:{'ecg lead ii':[-2,2],art:[0,200]},
};
const vent={
  external:true,pressure_cm_h2o:Array(250).fill(15),
  flow_l_min:Array(250).fill(2),volume_ml:Array(250).fill(400),
  pressureRange:[0,40],flowRange:[-60,60],volumeRange:[0,800],
};
vent.flow_l_min[125]=110;
const assignment={patient_id:'patient',telemetry_record:'mgh001',uc_davis_recording:'uc001'};
const context=vm.createContext({
  isCached:()=>true,recordClock:()=>400,
  decodeWindowSample:sample=>sample===125?120:10,
  document:{createElement:()=>({})},
  THREE:{CanvasTexture:class{constructor(canvas){this.image=canvas;}},
    MeshBasicMaterial:class{constructor(options){Object.assign(this,options);}},
    SRGBColorSpace:'srgb',DoubleSide:2},
});
vm.runInContext(fs.readFileSync('scene3d/parts/monitor-system.js','utf8'),context);
const surface=context.makeMonitorSurface('telemetry',512,320);
assert.equal(surface.layout,'telemetry');
assert.equal(surface.canvas.width,512);
assert.equal(surface.material.map,surface.texture);
let boxRefreshes=0;
const screen={object:{},worldBox:{setFromObject(){boxRefreshes++;return this;},getCenter(center){return center;}},center:{}};
assert.equal(context.monitorIntersects(screen,{intersectsBox:()=>true}),true);
assert.equal(boxRefreshes,1,'visibility uses the monitor’s current world position');
const area={x:0,y:0,width:640,height:400};
function render(layout){labels.length=0;lines.length=0;
  context.drawMonitorLayout(canvas,layout,{vital,vent,assignment},8,area);
  return [...labels];
}
assert(render('ventilator').some(label=>label.includes('Flow')));
assert(!labels.some(label=>label.includes('ECG')));
assert(render('telemetry').some(label=>label.includes('ECG')));
assert(!labels.some(label=>label.includes('Flow')));
assert(render('unit').some(label=>label.includes('Flow')));
assert(labels.some(label=>label.includes('ECG')));
assert(lines.length>0,'the common plotter draws the source samples');
const flow=context.monitorChannelState('flow',{vent,assignment},8);
assert.equal(flow.sample(125),110,'the full 50 Hz ventilator peak reaches every layout');
const missing=context.monitorChannelState('pressure',{assignment:{patient_id:'patient'}},8);
assert.equal(missing.status,'NO SOURCE');
assert.throws(()=>render('unknown'),/Unknown monitor layout/);
console.log('Named monitor layouts share channel sampling and preserve source peaks');
