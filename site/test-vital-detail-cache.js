'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function sourceOf(name){
  const source=fs.readFileSync('scene3d/parts/telemetry.js','utf8');
  const asyncStart=source.indexOf(`async function ${name}(`);
  const start=asyncStart>=0?asyncStart:source.indexOf(`function ${name}(`);
  const end=source.indexOf('\n}\n',start);
  assert(start>=0&&end>start);
  return source.slice(start,end+2);
}
const ranges=[];
const record={id:'mgh-test',fs:125,samples:10000,count:4,
  windows:new Int32Array(1000),parts:null,cacheFromClock:-Infinity,cacheToClock:-Infinity,loading:null};
const context=vm.createContext({recordClock:(_record,elapsed)=>Math.floor(elapsed*125),
  getBytes:async(_id,first,last)=>{ranges.push([first,last]);return {first,last,start:0,bytes:new Uint8Array(0)};},
  channels:[],Number,Math,Promise});
vm.runInContext(sourceOf('isCached'),context);
vm.runInContext(sourceOf('fillRecordCache'),context);
const detailSource=fs.readFileSync('scene3d/parts/vital-detail.js','utf8');
const rangeStart=detailSource.indexOf('function vitalDetailRanges(');
const rangeEnd=detailSource.indexOf('\n}\n',rangeStart);
const rangesContext=vm.createContext({
  channels:[{key:'ART',min:0,max:200}],
  recordClock:()=>6250,
  decodeWindowSample:sample=>sample===6240?240:100,
  Number,Math,
});
vm.runInContext(detailSource.slice(rangeStart,rangeEnd+2),rangesContext);
(async()=>{
  await context.fillRecordCache(record,50,30);
  assert.equal(record.cacheFromClock,2500,'detail must retain 30 seconds of source history');
  assert.equal(record.cacheToClock,8250);
  assert.equal(context.isCached(record,50,0,30),true);
  assert(ranges.length>0);
  record.channels={art:{index:0,baseline:0,gain:1}};
  const detailRanges=rangesContext.vitalDetailRanges(record,50,30);
  assert(detailRanges[0][1]>240,'the detailed chart scale must include source peaks');
  console.log('Vital detail requests and retains a full 30-second source window');
})().catch(error=>{console.error(error);process.exitCode=1;});
