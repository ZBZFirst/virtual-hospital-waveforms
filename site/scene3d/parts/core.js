
const status = document.querySelector('#status');
const errorBox = document.querySelector('#error');
const view = document.querySelector('#view');
const cubeHint = document.querySelector('#cubeHint');
const embedded = new URLSearchParams(location.search).get('embedded') === '1';
document.documentElement.classList.toggle('embedded', embedded);
if(embedded){
  document.body.classList.add('controls-collapsed');
  document.querySelector('#toggleControls').addEventListener('click',event=>{
    const collapsed=document.body.classList.toggle('controls-collapsed');
    event.currentTarget.setAttribute('aria-expanded',String(!collapsed));
    event.currentTarget.textContent=collapsed?'Controls ▾':'Controls ▴';
  });
}
const reportSceneStatus = (status, message='') => {
  if(embedded)parent.postMessage({type:'zebezo-scene-status',status,message},location.origin);
};
const reportSceneLocation = view => {
  if(embedded)parent.postMessage({type:'zebezo-scene-location',view,hospital:activeHospital,floor:activeFloor},location.origin);
};
function updateToolbarSelection(){
  document.querySelector('#hospitalPickerLabel').textContent=`Hospital ${activeHospital}`;
  document.querySelector('#floorPickerLabel').textContent=hospitalView||expandedHospital?'Floor':`Floor ${activeFloor}`;
  const room=walkMode?walkRoom:activeRoom;
  document.querySelector('#roomPickerLabel').textContent=room?`Room ${room}`:'Room';
}
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17262d);
scene.fog = new THREE.Fog(0x17262d, 75, 900);
const camera = new THREE.PerspectiveCamera(53, 1, 0.03, 720);
scene.add(camera);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const basePixelRatio = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(basePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxDistance = 600;
scene.add(new THREE.HemisphereLight(0xeaf9ff, 0x75969b, 1.25));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(15, 35, 19);
scene.add(sun);

let meta, campusManifest, roomById = new Map(), floors = [], activeFloor = 1, activeRoom = 0, activeHospital = 'A', grandCube = null;
let cameraTourReady = null;
function loadCameraTour(){
  cameraTourReady ??= fetch('./camera_tour.json').then(response=>{
    if(!response.ok)throw Error(`Camera tour HTTP ${response.status}`);
    return response.json();
  }).then(value=>{tour=value;return value;}).catch(error=>{cameraTourReady=null;throw error;});
  return cameraTourReady;
}
const cubesByHospital = new Map();
let hospitalShell = null, hospitalView = false;
let expandedHospital = false, expansion = null, floorReturnMove = null;
const floorLoads = new Map();
const floorTemplates = new Map(), roofTemplates = new Map(), hospitalStates = new Map();
let floorSelectToken = 0, requestedFloor = null;
let cameraMove = null;
let tour = null, tourPlaying = false, tourFrame = 1, tourClock = 0, cabGroup = null, cabMove = null;
let unitTour = null, unitTourTime = 0;
let exportElapsedSeconds = null;
let roofVisible = false;
let walkMode = false, lastFrameTime = performance.now();
const movementKeys = new Set();
const breathers = [];
let ventRecords = [];
let ventByRoom = new Map();
const ucVentByRoom = new Map();
const ventRecordForRoom = (room,floor=activeFloor) => {
  const assignment=roomAssignment(activeHospital,floor,room);
  if(assignment?.uc_davis_recording)return ucVentByRoom.get(assignment.id) || null;
  const excerpt=assignment?.ventilator_excerpt_room;
  return excerpt ? ventByRoom.get(excerpt) || null : null;
};
function updateUcVentWindow(message) {
  if(!Array.isArray(message.rooms))return;
  const range=(values,pad)=>{
    const valid=values.filter(Number.isFinite);
    if(!valid.length)return [0,1];
    const low=Math.min(...valid),high=Math.max(...valid),margin=Math.max(pad,(high-low)*0.08);
    return [low-margin,high+margin];
  };
  for(const window of message.rooms){
    const assignment=roomById.get(window.id);
    if(!assignment?.uc_davis_recording || assignment.uc_davis_recording!==window.recording ||
       !Array.isArray(window.flow) || !Array.isArray(window.pressure) ||
       ![10,50].includes(window.sourceRate) ||
       window.flow.length!==window.sourceRate*5 || window.pressure.length!==window.sourceRate*5)continue;
    const flow=[],pressure=[],volume=[];
    let cumulative=0,previous=0;
    const factor=50/window.sourceRate;
    for(let index=0;index<window.flow.length;index++)for(let step=0;step<factor;step++){
      const a=step/factor;
      const next=Math.min(index+1,window.flow.length-1);
      const f=Number.isFinite(window.flow[index])&&(factor===1||Number.isFinite(window.flow[next]))?
        THREE.MathUtils.lerp(window.flow[index],window.flow[next],a):null;
      const p=Number.isFinite(window.pressure[index])&&(factor===1||Number.isFinite(window.pressure[next]))?
        THREE.MathUtils.lerp(window.pressure[index],window.pressure[next],a):null;
      const sourceVolume=Array.isArray(window.volume)&&Number.isFinite(window.volume[index])&&
        (factor===1||Number.isFinite(window.volume[next]))?
        THREE.MathUtils.lerp(window.volume[index],window.volume[next],a):null;
      if(f!==null && previous<=1 && f>1)cumulative=0;
      cumulative=f===null?0:cumulative+f/3;
      flow.push(f);pressure.push(p);
      volume.push(Array.isArray(window.volume)?sourceVolume:f===null?null:cumulative);
      previous=f??0;
    }
    const cycle=values=>values.concat(values,values);
    const stable=window.ranges;
    const previousRecord=ucVentByRoom.get(assignment.id);
    const updatedAt=previousRecord?.sourceSeconds===window.sourceSeconds?
      previousRecord.updatedAt:performance.now();
    const record={room:assignment.room,recording:window.recording,external:true,
      sourceRate:window.sourceRate,sourceSeconds:window.sourceSeconds,
      duration:window.duration,paused:window.paused,updatedAt,
      pressure_cm_h2o:cycle(pressure),flow_l_min:cycle(flow),volume_ml:cycle(volume),
      pressureRange:stable?.pressure || previousRecord?.pressureRange || range(pressure,2),
      flowRange:stable?.flow || previousRecord?.flowRange || range(flow,5),
      volumeRange:stable?.volume || previousRecord?.volumeRange || range(volume,15)};
    ucVentByRoom.set(assignment.id,record);
  }
}
let doorHinges = [], doorAngles = Array(6).fill(0), doorTargets = Array(6).fill(0);
let modelLoader = null, highModel = null, highLoading = null, highBreathers = [], lastLODUpdate = 0;
let renderScale = 1, performanceWindowStart = performance.now(), performanceFrames = 0, measuredFps = 0;
const floorHeight = 3.2;
const recordings = new Map();
let telemetryBase = '';
let modelBase = '';
const modelUrl = path => {
  const url=new URL(path,modelBase);
  if(path==='ward_floor_02.glb')url.searchParams.set('v','20261031-glb-traces-removed1');
  return url.href;
};
let telemetryDetail = null, lastDetailPaint = 0;
const playbackStart = performance.now();
let telemetryReady = Array(6).fill(false);
let floorRecords = Array(6).fill(null);
const telemetryBusy = new Set();
let lastTelemetryPaint = 0, lastFeedPaint = 0;
let tablet = null, tabletEquipped = true, tabletInspect = false, tabletRoom = 1, tabletManualRoom = false, walkRoom = 0;
const channels = [
  { key: 'ECG lead II', label: 'ECG II', unit: 'mV', color: '#40db91', min: -2, max: 2 },
  { key: 'ART', label: 'ART', unit: 'mmHg', color: '#eeac59', min: 0, max: 200 },
  { key: 'CVP', label: 'CVP', unit: 'mmHg', color: '#5ed7ed', min: -10, max: 30 },
  { key: 'PAP', label: 'PAP', unit: 'mmHg', color: '#e2b4f2', min: 0, max: 80 },
];
// Begin after two consecutive eight-second windows with variable ECG II, ART,
// and at least one venous pressure channel. The initial visible window is
// therefore clear of the signal startup transition. Playback still traverses
// every source sample before looping.
const telemetryStartSeconds = {
  mgh001: 88, mgh002: 16, mgh003: 16, mgh004: 352,
  mgh005: 744, mgh006: 528, mgh007: 552, mgh008: 464,
  mgh009: 88, mgh010: 496, mgh011: 344, mgh013: 80,
  mgh015: 600, mgh016: 544, mgh019: 624, mgh020: 128,
  mgh021: 528, mgh022: 16, mgh023: 528, mgh026: 32,
  mgh027: 64, mgh028: 448, mgh029: 64, mgh030: 312,
};
const recordClock = (record, elapsed) => Math.floor((elapsed + (record.startSeconds || 0)) * record.fs);

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
  status.textContent = 'Hospital scene error';
  console.error(message);
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
