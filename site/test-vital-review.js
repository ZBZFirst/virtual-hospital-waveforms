'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('scene3d/parts/vital-review.js','utf8');
function get(name){
  const start=source.indexOf(`function ${name}(`);
  const end=source.indexOf('\n}\n',start);
  assert(start>=0&&end>start,name);
  return source.slice(start,end+2);
}
let now=1000;
const elements=new Map();
function element(id){
  if(!elements.has(id))elements.set(id,{value:'1',textContent:''});
  return elements.get(id);
}
const detail={mode:'review',record:{duration:3241},reviewSeconds:0,reviewPlaying:false,lastReviewFrame:0,ranges:null};
const context=vm.createContext({
  telemetryDetail:detail,lastDetailPaint:99,
  THREE:{MathUtils:{clamp:(x,lo,hi)=>Math.min(hi,Math.max(lo,x))}},
  performance:{now:()=>now},
  document:{querySelector:selector=>element(selector)},
  Math,Number,String,
});
for(const name of ['formatVitalTime','setVitalReviewPosition','advanceVitalReview'])vm.runInContext(get(name),context);
assert.equal(context.formatVitalTime(3241),'54:01');
context.setVitalReviewPosition(2400);
assert.equal(detail.reviewSeconds,2400);
assert.equal(element('#vitalPosition').textContent,'40:00 / 54:01');
assert.equal(element('#vitalScrub').value,String(Math.round(2400/3241*1000)));
context.setVitalReviewPosition(9999);
assert.equal(detail.reviewSeconds,3241,'seek must clamp at recording end');
detail.reviewPlaying=true;
detail.lastReviewFrame=1000;
now=2000;
context.advanceVitalReview(detail,detail.record,now);
assert.equal(detail.reviewPlaying,false,'playback stops at recording end');
context.setVitalReviewPosition(120);
detail.reviewPlaying=true;
detail.lastReviewFrame=2000;
now=2100;
context.advanceVitalReview(detail,detail.record,now);
assert.equal(detail.reviewSeconds,120.1,'playback follows source seconds');
console.log('Vital review supports full-recording seek and bounded playback');
