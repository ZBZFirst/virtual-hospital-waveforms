'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('scene3d/index.html','utf8');
for(const id of ['cubeInspector','cubeVisit','cubeRotationToggle','controlsHelp','controlsLegend'])
  assert(html.includes(`id="${id}"`));
const source=fs.readFileSync('scene3d/parts/nursing-cube.js','utf8');
const section=source.slice(source.indexOf('function paintCubeFaceStates()'),source.indexOf('function drawGrandSlot('));
const canvas={handlers:new Map(),style:{},addEventListener(type,fn){this.handlers.set(type,fn);},
  setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){}};
const floors=Array.from({length:6},(_,index)=>({dataset:{cubeFloor:String(index+1)},attrs:{},
  addEventListener(){},setAttribute(key,value){this.attrs[key]=value;}}));
const buttons=new Map();
for(const id of ['cubeHospital','cubeSelection','cubeVisit','cubeRotationToggle','cubeAuto','cubeClose'])
  buttons.set(`#${id}`,{textContent:'',disabled:false,attrs:{},classList:{toggle(){}},
    addEventListener(){},setAttribute(key,value){this.attrs[key]=value;}});
const panel={hidden:true,querySelectorAll:()=>floors};
buttons.set('#cubeInspector',panel);
const faces=floors.map((_,index)=>({floor:index+1,mesh:{material:{color:{setHex(){}}}}}));
const cube={faces,focused:false,targetScale:.25,hovered:null,drag:null,selectedFloor:null,
  autoBeforeInspect:null,auto:{enabled:true,pauseUntil:0,lastNow:0,yawProgress:0},
  rotor:{rotation:{x:0,y:0}}};
const travels=[];
const composites=[];
let gridSlots=0,expandedLayouts=0;
const faceContext={fillRect(){},strokeRect(){},fillText(){},save(){},restore(){},
  set globalCompositeOperation(value){composites.push(value);}};
for(const face of faces){face.canvas={getContext:()=>faceContext};face.texture={needsUpdate:false};}
const context={grandCube:cube,activeFloor:1,activeHospital:'A',walkMode:false,tourPlaying:false,
  renderer:{domElement:canvas},cubeHint:{style:{},textContent:''},controls:{enabled:true,addEventListener(){}},
  document:{querySelector:selector=>buttons.get(selector),querySelectorAll:selector=>
    selector==='[data-cube-floor]'?floors:[]},
  performance:{now:()=>1000},updateControlHelp(){},pickCubeFace:event=>event.face||null,
  pickCubeFaceHit:event=>event.face?{face:event.face,uv:event.uv}:null,
  startCubePhase(){},overview(){},setFloor:async(floor,moveCamera)=>{travels.push([floor,moveCamera]);},
  floorRecords:[],ventRecordForRoom:()=>null,roomAssignment:()=>({patient_id:'P1'}),
  drawGrandSlot(){gridSlots++;},drawMonitorLayout(){expandedLayouts++;},
};
vm.createContext(context);
const roomStart=source.indexOf('function cubeRoomAtUv(');
vm.runInContext(source.slice(roomStart,source.indexOf('\nfunction paintCubeFaceStates(',roomStart)),context);
vm.runInContext(section,context);
const drawStart=source.indexOf('function drawCubeFace(');
vm.runInContext(source.slice(drawStart,source.indexOf('\nfunction drawCubeFaces(',drawStart)),context);
vm.runInContext('setGrandCubeFocused(true)',context);
assert.equal(cube.auto.enabled,false);
assert.equal(panel.hidden,false);
for(let room=1;room<=6;room++){
  const column=(room-1)%2,tier=Math.floor((room-1)/2);
  assert.equal(context.cubeRoomAtUv({x:(112+column*634)/1280,y:1-(175+tier*400)/1280}),room);
}
assert.equal(context.cubeRoomAtUv({x:.5,y:.99}),null,'face heading is not a room');
context.drawCubeFace(faces[0],0,1000);
assert.deepEqual(composites,['difference'],'the current floor face is inverted');
composites.length=0;
context.drawCubeFace(faces[1],0,1000);
assert.deepEqual(composites,[],'an unselected other floor keeps its normal colors');
const gridBefore=gridSlots;
let menuBlocked=false;
canvas.handlers.get('contextmenu')({face:faces[0],uv:{x:112/1280,y:1-175/1280},clientX:10,clientY:10,
  preventDefault(){menuBlocked=true;}});
assert(menuBlocked,'cube right-click suppresses the browser menu');
assert.equal(faces[0].enlargedRoom,1);
context.drawCubeFace(faces[0],0,1000);
assert.equal(gridSlots,gridBefore,'expanded room replaces the six-room grid');
assert.equal(expandedLayouts,1,'expanded room uses the full unit waveform layout');
canvas.handlers.get('contextmenu')({face:faces[0],uv:{x:.5,y:.99},clientX:10,clientY:10,preventDefault(){}});
assert.equal(faces[0].enlargedRoom,null,'right-click again restores the six-room view');
context.drawCubeFace(faces[0],0,1000);
assert.equal(gridSlots,gridBefore+42);
const pointer=(type,face,x,y)=>canvas.handlers.get(type)({button:0,pointerId:1,clientX:x,clientY:y,face,
  preventDefault(){},stopImmediatePropagation(){}});
pointer('pointerdown',faces[1],10,10);
pointer('pointerup',faces[1],10,10);
assert.equal(cube.selectedFloor,2,'click selects a floor');
assert.equal(floors[0].dataset.current,'true');
assert.equal(floors[1].dataset.current,'false');
composites.length=0;
context.drawCubeFace(faces[1],0,1000);
assert.deepEqual(composites,['multiply'],'a selected other floor has its own highlight');
context.activeFloor=2;context.updateCubeInspector();
composites.length=0;context.drawCubeFace(faces[1],0,1000);
assert.deepEqual(composites,['difference'],'the inverted face follows the current floor after travel');
assert.equal(floors[1].dataset.current,'true');
context.activeFloor=1;context.updateCubeInspector();
assert.deepEqual(travels,[],'click must never travel');
assert.equal(buttons.get('#cubeVisit').textContent,'Visit Floor 2');
pointer('pointerdown',faces[2],10,10);
pointer('pointermove',faces[2],30,10);
pointer('pointerup',faces[2],30,10);
assert.equal(cube.selectedFloor,2,'drag must not select a different floor');
assert.deepEqual(travels,[],'drag must never travel');
pointer('pointerdown',faces[3],10,10);
pointer('pointerup',faces[4],10,10);
assert.equal(cube.selectedFloor,2,'release on another face must not select it');
vm.runInContext('selectCubeFloor(1)',context);
assert.equal(buttons.get('#cubeVisit').disabled,true,'current floor cannot be visited');
vm.runInContext('selectCubeFloor(2)',context);
vm.runInContext('setCubeAutoRotation(true)',context);
assert.equal(cube.selectedFloor,null,'resuming rotation clears selection');
vm.runInContext('selectCubeFloor(2)',context);
(async()=>{
  await vm.runInContext('visitCubeFloor(2)',context);
  assert.deepEqual(travels,[[2,true]],'only explicit Visit navigates');
  vm.runInContext('setGrandCubeFocused(false)',context);
  assert.equal(cube.auto.enabled,true,'exit restores prior rotation setting');
  assert.equal(panel.hidden,true);
  console.log('Cube click selects, drag rotates, and only Visit Floor navigates');
})().catch(error=>{console.error(error);process.exitCode=1;});
