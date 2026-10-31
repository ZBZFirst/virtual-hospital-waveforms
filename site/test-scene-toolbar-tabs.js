'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('scene3d/index.html','utf8');
for(const id of ['locationTab','viewTab','patientTab','motionTab','barHeader','cubeDragHandle'])
  assert(html.includes(`id="${id}"`));
const source=fs.readFileSync('scene3d/parts/events.js','utf8');
const end=source.indexOf('\ndocument.querySelector(\'#walk\')');
assert(end>0);
const listeners=new Map(),rows=new Map();
const tabs=['location','view','patient','motion'].map((name,index)=>({
  name,tabIndex:0,attrs:{'aria-controls':`${name}Row`},handlers:new Map(),
  addEventListener(type,callback){this.handlers.set(type,callback);},
  setAttribute(key,value){this.attrs[key]=value;},getAttribute(key){return this.attrs[key];},
  focus(){this.focused=true;},
}));
for(const tab of tabs)rows.set(`${tab.name}Row`,{hidden:false});
const bar={offsetWidth:300,offsetHeight:190,style:{},getBoundingClientRect(){return {left:10,top:100};}};
const header={handlers:new Map(),addEventListener(type,callback){this.handlers.set(type,callback);},setPointerCapture(){}};
const cube={offsetWidth:120,offsetHeight:90,style:{},getBoundingClientRect(){return {left:180,top:140};}};
const cubeHeader={handlers:new Map(),addEventListener(type,callback){this.handlers.set(type,callback);},setPointerCapture(){}};
const context=vm.createContext({
  document:{querySelector:selector=>({'#bar':bar,'#barHeader':header,'#cubeInspector':cube,'#cubeDragHandle':cubeHeader})[selector],
    querySelectorAll:()=>tabs,getElementById:id=>rows.get(id)},
  closeToolbarPickers:()=>{},addEventListener:(type,callback)=>listeners.set(type,callback),
  innerWidth:320,innerHeight:300,
});
vm.runInContext(source.slice(0,end),context);
assert.equal(rows.get('locationRow').hidden,false);
assert.equal(rows.get('viewRow').hidden,true);
tabs[1].handlers.get('click')();
assert.equal(rows.get('viewRow').hidden,false);
assert.equal(rows.get('locationRow').hidden,true);
assert.equal(tabs[1].attrs['aria-selected'],'true');
tabs[1].handlers.get('keydown')({key:'ArrowRight',preventDefault(){}});
assert.equal(rows.get('patientRow').hidden,false);
assert.equal(tabs[2].focused,true);
header.handlers.get('pointerdown')({button:0,pointerId:1,clientX:10,clientY:100,target:{closest:()=>null},preventDefault(){}});
header.handlers.get('pointermove')({pointerId:1,clientX:500,clientY:500});
assert.equal(bar.style.left,'20px');
assert.equal(bar.style.top,'110px');
header.handlers.get('pointerup')({pointerId:1});
cubeHeader.handlers.get('pointerdown')({button:0,pointerId:2,clientX:180,clientY:140,target:{closest:()=>null},preventDefault(){}});
cubeHeader.handlers.get('pointermove')({pointerId:2,clientX:-100,clientY:-100});
assert.equal(cube.style.left,'0px');
assert.equal(cube.style.top,'0px');
cubeHeader.handlers.get('pointermove')({pointerId:2,clientX:900,clientY:900});
assert.equal(cube.style.left,'200px');
assert.equal(cube.style.top,'210px');
cubeHeader.handlers.get('pointerup')({pointerId:2});
console.log('Scene tabs and both movable panels stay inside the viewport');
