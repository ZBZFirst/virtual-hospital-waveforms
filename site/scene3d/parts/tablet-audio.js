// The tablet is the only in-scene sound controller. Each voice follows the
// same channel sampler and fixed chart range used to draw its waveform.
const tabletAudioVoices=new Map();
let tabletAudioContext=null,tabletAudioMaster=null,tabletAudioGeneration=0;
const tabletAudioButtons=monitorLayouts.unit.map((channel,index)=>({channel,key:String(index+1),x:20+index*115,y:69,width:109,height:31}));
const tabletMuteButton={x:850,y:69,width:152,height:31};

function muteTabletAudio(){
  tabletAudioGeneration++;
  for(const [channel,voice] of tabletAudioVoices){
    tabletAudioVoices.delete(channel);
    const at=voice.context.currentTime;
    voice.gain.gain.cancelScheduledValues(at);
    voice.gain.gain.setTargetAtTime(0,at,.008);
    voice.oscillator.stop(at+.09);
    voice.oscillator.onended=()=>{voice.oscillator.disconnect();voice.filter.disconnect();voice.gain.disconnect();};
  }
  if(tabletAudioMaster) tabletAudioMaster.gain.setTargetAtTime(0,tabletAudioContext.currentTime,.02);
}

function tabletAudioSources(elapsed){
  const room=tabletRoom;
  return {vital:floorRecords[activeFloor-1]?.[room-1],vent:ventRecordForRoom(room),
    assignment:roomAssignment(activeHospital,activeFloor,room),elapsed};
}

async function toggleTabletChannelAudio(channelId){
  if(tabletAudioVoices.has(channelId)){
    const voice=tabletAudioVoices.get(channelId);
    tabletAudioVoices.delete(channelId);
    const at=voice.context.currentTime;
    voice.gain.gain.setTargetAtTime(0,at,.008);
    voice.oscillator.stop(at+.09);
    voice.oscillator.onended=()=>{voice.oscillator.disconnect();voice.filter.disconnect();voice.gain.disconnect();};
    return;
  }
  const elapsed=exportElapsedSeconds??(performance.now()-playbackStart)/1000;
  const sources=tabletAudioSources(elapsed);
  if(monitorChannelState(channelId,sources,elapsed).status)return;
  const generation=tabletAudioGeneration,room=sources.assignment?.id;
  if(!tabletAudioContext){
    tabletAudioContext=new (window.AudioContext||window.webkitAudioContext)();
    tabletAudioMaster=tabletAudioContext.createGain();tabletAudioMaster.gain.value=0;
    const limiter=tabletAudioContext.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=8;
    tabletAudioMaster.connect(limiter);limiter.connect(tabletAudioContext.destination);
  }
  const context=tabletAudioContext;
  await context.resume();
  if(generation!==tabletAudioGeneration||!walkMode||room!==tabletAudioSources(elapsed).assignment?.id||tabletAudioVoices.has(channelId))return;
  const oscillator=context.createOscillator();oscillator.type='sawtooth';
  const filter=context.createBiquadFilter();filter.type='lowpass';filter.Q.value=.7;
  const gain=context.createGain();gain.gain.value=0;
  oscillator.connect(filter);filter.connect(gain);gain.connect(tabletAudioMaster);
  oscillator.start();
  tabletAudioVoices.set(channelId,{context,oscillator,filter,gain});
}

function syncTabletAudio(elapsed){
  if(!tabletAudioVoices.size||!tabletAudioContext)return;
  const sources=tabletAudioSources(elapsed),at=tabletAudioContext.currentTime;
  tabletAudioMaster.gain.setTargetAtTime(.32/Math.sqrt(tabletAudioVoices.size),at,.02);
  for(const [channelId,voice] of tabletAudioVoices){
    const state=monitorChannelState(channelId,sources,elapsed);
    const value=state.status?null:state.sample(state.count-1);
    if(!Number.isFinite(value)){
      voice.gain.gain.setTargetAtTime(0,at,.018);
      continue;
    }
    const [low,high]=state.range,portion=THREE.MathUtils.clamp((value-low)/(high-low||1),0,1);
    const pressure=channelId==='flow'&&sources.vent?
      monitorChannelState('pressure',sources,elapsed).sample(249):null;
    const originalMapping=channelId==='flow'&&Number.isFinite(pressure)?SignalMapping.midi(value,pressure):null;
    const pitch=48+portion*24;
    voice.oscillator.frequency.setTargetAtTime(originalMapping?.frequency??440*Math.pow(2,(pitch-69)/12),at,.025);
    voice.filter.frequency.setTargetAtTime(originalMapping?.cutoff??240*Math.pow(6000/240,portion),at,.025);
    voice.gain.gain.setTargetAtTime(.07,at,.018);
  }
}

function drawTabletAudioControls(c,sources,elapsed){
  for(const button of tabletAudioButtons){
    const state=monitorChannelState(button.channel,sources,elapsed),on=tabletAudioVoices.has(button.channel);
    c.fillStyle=state.status?'#19323a':on?'#23768b':'#244450';
    c.fillRect(button.x,button.y,button.width,button.height);
    c.strokeStyle=on?'#8ff1cc':'#5a8997';c.strokeRect(button.x+.5,button.y+.5,button.width-1,button.height-1);
    c.fillStyle=state.status?'#78959c':'#e6f5f7';c.font='bold 15px system-ui';
    c.fillText(`${button.key} ${on?'🔊':'🔇'} ${monitorChannels[button.channel].label}`,button.x+6,button.y+21);
  }
  c.fillStyle='#244450';c.fillRect(tabletMuteButton.x,tabletMuteButton.y,tabletMuteButton.width,tabletMuteButton.height);
  c.strokeStyle='#5a8997';c.strokeRect(tabletMuteButton.x+.5,tabletMuteButton.y+.5,tabletMuteButton.width-1,tabletMuteButton.height-1);
  c.fillStyle='#e6f5f7';c.font='bold 16px system-ui';c.fillText('0 Mute All',tabletMuteButton.x+26,tabletMuteButton.y+21);
}

function handleTabletAudioKey(event){
  if(!walkMode||!tabletEquipped||event.repeat||event.altKey||event.ctrlKey||event.metaKey||
      event.target?.closest?.('input, textarea, select, [contenteditable="true"]'))return false;
  if(event.key==='0'){muteTabletAudio();return true;}
  const button=tabletAudioButtons.find(item=>item.key===event.key);
  if(!button)return false;
  toggleTabletChannelAudio(button.channel).catch(error=>showError(`Tablet sound unavailable: ${error.message}`));
  return true;
}

const tabletAudioRaycaster=new THREE.Raycaster();
function tabletDisplayHit(event){
  if(!walkMode||!tabletInspect||!tabletEquipped||!tablet?.display)return null;
  const bounds=renderer.domElement.getBoundingClientRect();
  const pointer=new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
  tabletAudioRaycaster.setFromCamera(pointer,camera);
  return tabletAudioRaycaster.intersectObject(tablet.display)[0]||null;
}
function handleTabletAudioClick(event){
  if(document.pointerLockElement===renderer.domElement)return false;
  const hit=tabletDisplayHit(event);
  if(!hit?.uv)return false;
  const x=hit.uv.x*tablet.canvas.width,y=(1-hit.uv.y)*tablet.canvas.height;
  if(y>=tabletMuteButton.y&&y<=tabletMuteButton.y+tabletMuteButton.height&&x>=tabletMuteButton.x&&x<=tabletMuteButton.x+tabletMuteButton.width){
    muteTabletAudio();return true;
  }
  const button=tabletAudioButtons.find(item=>x>=item.x&&x<=item.x+item.width&&y>=item.y&&y<=item.y+item.height);
  if(!button)return false;
  toggleTabletChannelAudio(button.channel).catch(error=>showError(`Tablet sound unavailable: ${error.message}`));
  return true;
}
addEventListener('pagehide',()=>{muteTabletAudio();tabletAudioContext?.close().catch(()=>{});tabletAudioContext=null;});
