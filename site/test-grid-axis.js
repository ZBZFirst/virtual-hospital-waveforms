const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={devicePixelRatio:1,globalThis:{}};
vm.runInNewContext(fs.readFileSync(__dirname+'/chart-axis.js','utf8'),context);
context.WaveformAxis=context.globalThis.WaveformAxis;
vm.runInNewContext(fs.readFileSync(__dirname+'/grid-monitor.js','utf8'),context);

function trace(){
  const labels=[];
  const drawing={fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
    measureText(label){return {width:label.length*6};},fillText(label){labels.push(label);}};
  return {axis:context.globalThis.WaveformAxis.create(),value:{textContent:''},canvas:{
    clientWidth:1000,clientHeight:100,width:1000,height:100,getContext:()=>drawing
  },labels};
}
const samples=Float32Array.from({length:2000},(_,index)=>Math.sin(index/20));
samples[200]=-10;samples[1250]=-20;
const traces={flow:trace(),pressure:trace(),volume:trace()};
const monitor={entry:{samples:2000},data:{flow:samples,pressure:samples,volume:samples},
  traces,position:4,scrub:{value:''},clock:{textContent:''}};
const grid=Object.create(context.globalThis.GridMonitor.prototype);
grid.drawOne(monitor);
assert.equal(traces.flow.labels.length,5,'each chart shows five numeric Y-axis labels');
assert.ok(traces.flow.labels.every(label=>Number.isFinite(Number(label))));
const initial=traces.flow.axis.min;
monitor.position=15;grid.drawOne(monitor);
assert.equal(traces.flow.axis.min,initial,'the lower Y bound stays fixed after the old low scrolls away');
monitor.position=25;grid.drawOne(monitor);
assert.ok(traces.flow.axis.min<initial,'a newly visible low expands the lower Y bound');
assert.notEqual(traces.flow.axis,traces.pressure.axis,'each chart keeps its own scale state');
console.log('GRID Monitor Y-axis behavior passes');
