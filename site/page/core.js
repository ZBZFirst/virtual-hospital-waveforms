const $ = (id) => document.getElementById(id);
const RATE = 50;
const DEFAULT_WINDOW_SECONDS = 30;
let breathSequenceMap=null;
let fullCatalogByRecording=new Map();
const LAYOUT_KEY = 'zebezo-hospital-layout-v3';
const LEGACY_LAYOUT_KEYS = ['zebezo-hospital-layout-v2','zebezo-hospital-layout-v1'];
const ATLAS_SIGNAL_STRIDE = 5;
const LOCAL_ROOM_PREVIEW = location.port === '8766';
const RECORDING_BASE = LOCAL_ROOM_PREVIEW ? new URL('/recordings/', location.href).href :
  "https://raw.githubusercontent.com/ZBZFirst/file/32063407e7fffb75d3866d080078d80295de476c/WaveformBackups/";
const els = {
  atlas: $('atlas'), atlasStatus: $('atlasStatus'), sessionClock: $('sessionClock'),
  activityStatus: $('activityStatus'), flowDirection: $('flowDirection'), muteAll: $('muteAll'),
  segmentProgressBar: $('segmentProgressBar'), segmentProgressText: $('segmentProgressText'),
  segmentFailures: $('segmentFailures'), segmentFailureList: $('segmentFailureList'), retrySegments: $('retrySegments'),
  hospitalScene: $('hospitalScene'), sceneLoading: $('sceneLoading'), sceneLoadingTitle: $('sceneLoadingTitle'),
  sceneLoadingMessage: $('sceneLoadingMessage'), retryScene: $('retryScene'),
  mobileMenu: $('mobileMenu'), mobileMenuToggle: $('mobileMenuToggle'), mobileMenuClose: $('mobileMenuClose'),
  mobileMenuBackdrop: $('mobileMenuBackdrop'),
  speaker: $('speakerBtn'), midiReadout: $('midiReadout'), list: $('recordingList'), listCount: $('listCount'),
  search: $('search'), datasetStats: $('datasetStats'), streamLabel: $('streamLabel'),
  streamTitle: $('streamTitle'), streamMeta: $('streamMeta'), loadStatus: $('loadStatus'),
  start: $('startBtn'), play: $('playBtn'), pause: $('pauseBtn'), stop: $('stopBtn'),
  speed: $('speed'), window: $('window'), scrub: $('scrub'), time: $('timeReadout'),
  flowValue: $('flowValue'), pressureValue: $('pressureValue'), volumeValue: $('volumeValue'),
  flowBreathValue: $('flowBreathValue'), pressureBreathValue: $('pressureBreathValue'),
  breathValue: $('breathValue'), volumeToggle: $('volumeToggle'), pathAxis: $('pathAxis'),
  overview: $('overview'), flow: $('flowChart'), pressure: $('pressureChart'),
  volume: $('volumeChart'), volumeCard: $('volumeCard'), path: $('wave3d'), pathLabel: $('pathLabel'),
  database: $('databasePanel'), waveform: $('waveformPanel'), breadcrumbs: $('breadcrumbs'),
  detailOverlay: $('detailOverlay'), directoryOverlay: $('directoryOverlay')
};
const state = {
  entries: [], units: new Map(), nodes: [], corridors: [], layout: null,
  projected: [], selectedNode: null, selected: null, data: null,
  active: false, position: 0, lastFrame: 0, lastDraw: 0, pending: null,
  atlasCenter: {x:0,y:0}, atlasZoom: 1, atlasDrag: null, atlasPointers: new Map(),
  atlasPinch: null, atlasLastDraw: 0, clockLastDraw: 0, sessionStart: performance.now(),
  signals: null, hover: null, reverseFlow: false, audio: null, voices: new Map(),
  pathYaw: .7, pathPitch: -.32, pathDrag: null, cache: new Map(), filter: '', unitPlayback: null,
  model: null, organization: null, proposal: null, layoutIssues: [], hospitalView: null,
  floorLevel: null, buildingFaces: 'south-east', bedManagerView: false, managerHospitalId: null,
  segmentStore: null, segmentReady: null, seekTimer: null, seekGeneration: 0,
  roomMode: 'review', reviewWasPlaying: false
};
const feedStarts=new Map();
const completedFeeds=new Set();
function feedElapsed(entry,at=sessionSeconds()){
  if(completedFeeds.has(entry.name))return entry.samples/RATE;
  return Math.min(entry.samples/RATE,Math.max(0,at-(feedStarts.get(entry.name)??0)));
}
function feedEnded(entry){return feedElapsed(entry)>=entry.samples/RATE;}
function advanceFeed(entry,seconds){
  if(seconds>=entry.samples/RATE)completedFeeds.add(entry.name);
  else feedStarts.set(entry.name,sessionSeconds()-Math.max(0,seconds));
}
function replayFeed(entry){completedFeeds.delete(entry.name);feedStarts.set(entry.name,sessionSeconds());drawAtlas();}
let roomAxes={flow:WaveformAxis.create(),pressure:WaveformAxis.create(),volume:WaveformAxis.create()};
window.RoomChartAxes={get:key=>roomAxes[key]};
function mountRoomAxisControls(){
  for(const [id,key,label] of [['flowChart','flow','Flow'],['pressureChart','pressure','Airway pressure'],['volumeChart','volume','Calculated volume']]){
    const heading=$(id).closest('.signal-card').querySelector('.chart-head');
    const controls=document.createElement('div');controls.className='chart-axis-controls';
    for(const [action,symbol,title] of [['zoomOut','Y−','Zoom out'],['zoomIn','Y+','Zoom in'],['reset','Y↺','Reset axis to visible values']]){
      const button=document.createElement('button');button.type='button';button.textContent=symbol;
      button.title=`${title} · ${label} Y axis`;
      button.setAttribute('aria-label',`${title} for ${label} Y axis`);
      button.addEventListener('click',()=>{
        if(!WaveformAxis[action](roomAxes[key]))return;
        if(state.roomMode==='live')window.RoomLive.draw();else drawAll();
      });
      controls.append(button);
    }
    heading.append(controls);
  }
}

let unitCubes;
let audioViewGeneration=0;

function clock(seconds) {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = (seconds % 60).toFixed(2).padStart(5, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
function sessionSeconds(){return (performance.now()-state.sessionStart)/1000;}
function compactAtlas(){return matchMedia('(max-width: 700px), (max-height: 520px)').matches;}
function defaultAtlasZoom(){return compactAtlas()?2.5:1;}
function signalAt(entry, seconds){
  const bytes=entry.previewBytes;
  if(!bytes)return null;
  const duration=entry.samples/RATE;
  if(seconds<0||seconds>=duration)return null;
  const sample=seconds*RATE/ATLAS_SIGNAL_STRIDE;
  const current=Math.min(entry.signalBins-1,Math.floor(sample));
  const next=Math.min(entry.signalBins-1,current+1),blend=sample-current;
  const flowA=bytes[current*2],flowB=bytes[next*2];
  const pressureA=bytes[current*2+1],pressureB=bytes[next*2+1];
  if(flowA===255||flowB===255||pressureA===255||pressureB===255)return null;
  return {flow:((flowA+(flowB-flowA)*blend)-127)*60/127,
    pressure:(pressureA+(pressureB-pressureA)*blend)/5};
}
function feedClock(entry){
  if(!els.detailOverlay.hidden&&state.selected===entry&&state.roomMode==='live')return window.RoomLive.elapsed();
  if(!els.detailOverlay.hidden&&state.selected===entry&&state.data)return state.position/RATE;
  if(!els.detailOverlay.hidden && state.unitPlayback?.members.includes(entry))return feedElapsed(entry,state.unitPlayback.elapsed);
  return feedElapsed(entry);
}
function feedPaused(entry){
  if(!els.detailOverlay.hidden&&state.selected===entry&&state.roomMode==='live')return !window.RoomLive.isRunning();
  if(!els.detailOverlay.hidden&&state.selected===entry&&state.data)return !state.active;
  if(!els.detailOverlay.hidden && state.unitPlayback?.members.includes(entry))return !state.unitPlayback.active;
  return false;
}
const previewLoads=new Map();
function loadPreviewForFloor(hospital,floor){
  const key=`${hospital}-${String(floor).padStart(2,'0')}`;
  if(previewLoads.has(key))return previewLoads.get(key);
  const members=state.entries.filter(entry=>{
    const room=fullCatalogByRecording.get(entry.name);
    return room?.hospital_id===hospital&&room.floor===floor;
  }).sort((a,b)=>fullCatalogByRecording.get(a.name).room-fullCatalogByRecording.get(b.name).room);
  if(!members.length)return Promise.resolve();
  const request=(async()=>{
    if(!('DecompressionStream' in window))throw new Error('This browser cannot unpack the preview track');
    const response=await fetch(`signal-previews/${key}.bin.gz?v=20261029-tablet-sweep6`);
    if(!response.ok)throw new Error(`Preview HTTP ${response.status}`);
    const bytes=new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    let offset=0;
    for(const entry of members){
      entry.signalBins=Math.ceil(entry.samples/ATLAS_SIGNAL_STRIDE);
      const length=entry.signalBins*2;
      entry.previewBytes=bytes.subarray(offset,offset+length);
      offset+=length;
    }
    if(offset!==bytes.length)throw new Error('Floor preview length does not match the manifest');
    state.signals=true;
    els.activityStatus.textContent=`Hospital ${hospital} floor ${floor} previews ready`;
    updateSpeaker();refreshHospitalStatuses();
  })().catch(error=>{previewLoads.delete(key);els.activityStatus.textContent=`Preview unavailable: ${error.message}`;throw error;});
  previewLoads.set(key,request);
  return request;
}
function loadPreviewForEntry(entry){
  const room=fullCatalogByRecording.get(entry.name);
  return room?loadPreviewForFloor(room.hospital_id,room.floor):Promise.resolve();
}
function updateSpeaker(){
  const entry=state.selected;
  els.speaker.hidden=!entry||els.waveform.hidden;
  els.speaker.disabled=!!entry&&!entry.previewBytes;
  const on=!!entry&&state.voices.has(entry.name);
  els.speaker.textContent=on?'🔊 Sound on':'🔇 Sound off';
  els.speaker.setAttribute('aria-pressed',String(on));
  els.speaker.setAttribute('aria-label',on?'Disable this feed’s sound':'Enable this feed’s sound');
  els.midiReadout.hidden=!on;
  if(!on)els.midiReadout.textContent='';
}
function voiceLevel(){
  if(!state.audio)return;
  const count=state.voices.size;
  state.audio.master.gain.setTargetAtTime(count?.32/Math.sqrt(count):0,state.audio.context.currentTime,.02);
}
async function enableVoice(entry){
  if(!entry.previewBytes||state.selected!==entry||els.detailOverlay.hidden||els.detailOverlay.classList.contains('detail-exit'))return;
  const generation=audioViewGeneration;
  if(!state.audio){
    const context=new AudioContext();
    const master=context.createGain();master.gain.value=0;
    const limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=8;
    master.connect(limiter);limiter.connect(context.destination);
    state.audio={context,master,limiter};
  }
  const {context,master}=state.audio;
  await context.resume();
  if(generation!==audioViewGeneration||state.audio?.context!==context||state.selected!==entry||
      els.detailOverlay.hidden||els.detailOverlay.classList.contains('detail-exit'))return;
  if(state.voices.has(entry.name))return;
  const oscillator=context.createOscillator();oscillator.type='sawtooth';
  const filter=context.createBiquadFilter();filter.type='lowpass';filter.Q.value=.7;
  const gain=context.createGain();gain.gain.value=0;
  oscillator.connect(filter);filter.connect(gain);gain.connect(master);
  oscillator.start();
  state.voices.set(entry.name,{entry,oscillator,filter,gain});
  voiceLevel();updateSpeaker();syncAudio();
}
function disableVoice(name){
  const voice=state.voices.get(name);if(!voice)return;
  state.voices.delete(name);
  const t=state.audio.context.currentTime;
  voice.gain.gain.cancelScheduledValues(t);
  voice.gain.gain.setTargetAtTime(0,t,.008);
  voice.oscillator.stop(t+.09);
  voice.oscillator.onended=()=>{voice.oscillator.disconnect();voice.filter.disconnect();voice.gain.disconnect();};
  voiceLevel();updateSpeaker();
}
function muteAll(){for(const name of [...state.voices.keys()])disableVoice(name);}
function stopPatientAudio(){
  audioViewGeneration++;
  muteAll();
}
function syncAudio(){
  if(!state.audio||!state.voices.size)return;
  const t=state.audio.context.currentTime;
  for(const voice of state.voices.values()){
    const sample=feedPaused(voice.entry)?null:signalAt(voice.entry,feedClock(voice.entry));
    const mapping=sample&&SignalMapping.midi(sample.flow,sample.pressure);
    const target=mapping?.frequency??voice.oscillator.frequency.value;
    voice.oscillator.frequency.setTargetAtTime(target,t,.025);
    if(mapping)voice.filter.frequency.setTargetAtTime(mapping.cutoff,t,.025);
    voice.gain.gain.setTargetAtTime(mapping?.07:0,t,.018);
    if(state.selected===voice.entry&&!els.detailOverlay.hidden){
      els.midiReadout.textContent=mapping?`MIDI ${mapping.pitch.toFixed(1)} · pressure ${sample.pressure.toFixed(1)} cmH₂O → CC74 ${mapping.cc74}`:'No sample · silent';
    }
  }
}
