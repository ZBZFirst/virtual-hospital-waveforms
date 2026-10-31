'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const mapping=require('./signal-mapping.js');
const source=fs.readFileSync('scene3d/parts/tablet-audio.js','utf8');
const events=[];
let resume;
let hit=[];
const param=()=>({value:440,setTargetAtTime(value){this.value=value;},cancelScheduledValues(){}});
class AudioContextMock{
  currentTime=0;
  destination={};
  createGain(){return {gain:param(),connect(){},disconnect(){}};}
  createDynamicsCompressor(){return {threshold:{value:0},ratio:{value:0},connect(){}};}
  createOscillator(){return {frequency:param(),connect(){},disconnect(){},start(){events.push('start');},stop(){events.push('stop');}};}
  createBiquadFilter(){return {frequency:param(),Q:{value:0},connect(){},disconnect(){}};}
  resume(){return resume?new Promise(resolve=>{resume=resolve;}):Promise.resolve();}
  close(){return Promise.resolve();}
}
const context=vm.createContext({
  window:{AudioContext:AudioContextMock},SignalMapping:mapping,
  THREE:{Raycaster:class{setFromCamera(){} intersectObject(){return hit;}},Vector2:class{},
    MathUtils:{clamp:(x,lo,hi)=>Math.max(lo,Math.min(hi,x))}},
  monitorLayouts:{unit:['ecg','art','cvp','pap','pressure','flow','volume']},
  monitorChannels:Object.fromEntries(['ecg','art','cvp','pap','pressure','flow','volume'].map(key=>[key,{label:key}])),
  monitorChannelState:(channel,sources)=>sources.assignment?.patient_id?
    {status:null,range:[-60,60],count:250,sample:()=>channel==='pressure'?20:30}:
    {status:'NO SOURCE',sample:()=>null},
  tabletRoom:1,activeFloor:1,activeHospital:'A',floorRecords:[[{}]],
  roomAssignment:()=>({id:'A-F01-R01',patient_id:'P1'}),ventRecordForRoom:()=>({}),
  performance:{now:()=>1000},playbackStart:0,exportElapsedSeconds:null,walkMode:true,
  addEventListener:()=>{},renderer:{domElement:{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})}},
  document:{pointerLockElement:null},camera:{},tablet:{display:{},canvas:{width:1024,height:768}},
  tabletInspect:true,tabletEquipped:true,
  showError:()=>{},
});
vm.runInContext(source,context);
(async()=>{
  assert.equal(vm.runInContext('tabletAudioVoices.size',context),0,'every speaker starts muted');
  await vm.runInContext("toggleTabletChannelAudio('flow')",context);
  assert.equal(vm.runInContext('tabletAudioVoices.size',context),1);
  vm.runInContext('syncTabletAudio(1)',context);
  const frequency=vm.runInContext("tabletAudioVoices.get('flow').oscillator.frequency.value",context);
  assert.equal(frequency,mapping.midi(30,20).frequency,'flow uses the existing MIDI sound mapping');
  hit=[{uv:{x:900/1024,y:1-80/768}}];
  assert.equal(context.handleTabletAudioClick({clientX:50,clientY:50}),true,'tablet header Mute All is clickable');
  assert.equal(vm.runInContext('tabletAudioVoices.size',context),0);
  assert(events.includes('stop'));
  resume=true;
  const pending=vm.runInContext("toggleTabletChannelAudio('ecg')",context);
  vm.runInContext('muteTabletAudio()',context);
  resume();await pending;
  assert.equal(vm.runInContext('tabletAudioVoices.size',context),0,'a late audio resume cannot unmute after room navigation');
  console.log('Tablet speakers start muted, follow MIDI mapping, and stay muted after navigation');
})().catch(error=>{console.error(error);process.exitCode=1;});
