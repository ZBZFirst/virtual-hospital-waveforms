function focus(target, position) {
  cameraMove = { from: camera.position.clone(), fromTarget: controls.target.clone(), to: position, toTarget: target, start: performance.now(), duration: 950 };
}

function resetExpandedView(selectedLevel = null) {
  if(expansion?.materials)for(const [material,old] of expansion.materials){
    material.opacity=old.opacity;material.transparent=old.transparent;material.depthWrite=old.depthWrite;material.needsUpdate=true;
  }
  expansion=null;
  floorReturnMove=null;
  if(expandedHospital){
    floors.forEach((floor,index)=>{
      if(!floor)return;
      floor.badge.visible=false;
      if(index+1===selectedLevel && floor.group.position.lengthSq()>0.001)
        floorReturnMove={group:floor.group,from:floor.group.position.clone(),start:performance.now(),duration:950};
      else floor.group.position.set(0,0,0);
      if(index+1!==selectedLevel)floor.group.visible=false;
    });
  }
  expandedHospital=false;
  if(hospitalShell)hospitalShell.children.forEach(building=>building.visible=true);
  if(selectedLevel!==null){
    if(hospitalShell)hospitalShell.visible=false;
    if(grandCube)grandCube.group.visible=true;
    if(cabGroup)cabGroup.visible=true;
  }
}

async function expandHospital(hospitalId) {
  if(!hospitalStates.has(hospitalId))return;
  stopWalk();stopTour();
  floorSelectToken++;
  const token=floorSelectToken;
  resetExpandedView();
  activateHospital(hospitalId);
  setGrandCubeFocused(false);
  activeRoom=0;roofVisible=false;
  updateOpenFeedButton();
  hospitalView=true;
  hospitalShell.visible=true;
  hideHospitalCubes();cabGroup.visible=false;
  const hospital=campusManifest.hospitals.find(item=>item.id===hospitalId);
  const site=new THREE.Vector3(hospital.position_x_m,0,hospital.position_z_m);
  focus(new THREE.Vector3(site.x,9.5,site.z),new THREE.Vector3(site.x+25,site.y+37,site.z+57));
  status.textContent=`Hospital ${hospitalId} · loading first floor…`;
  try { await ensureFloor(hospitalId,1); }
  catch(error){if(token===floorSelectToken)showError(`Hospital ${hospitalId} load failed: ${error}`);return;}
  if(token!==floorSelectToken || activeHospital!==hospitalId)return;
  const building=hospitalShell.children.find(item=>item.userData.hospitalId===hospitalId);
  hospitalShell.children.forEach(item=>item.visible=item===building);
  hospitalView=false;expandedHospital=true;
  updateToolbarSelection();
  if(highModel)highModel.visible=false;
  document.querySelector('#hospitalView').classList.remove('active');
  document.querySelector('#hospitalView').setAttribute('aria-pressed','false');
  document.querySelectorAll('[data-floor]').forEach(button=>button.classList.remove('active'));
  floors.forEach((floor,index)=>{
    if(!floor)return;
    floor.group.position.set(site.x,index*floorHeight,site.z);
    floor.group.visible=true;
    floor.roof.visible=false;
    floor.badge.visible=false;
    floor.patients.forEach((patient,room)=>{if(patient){patient.visible=false;floor.proxies[room].visible=true;}});
  });
  const materials=new Map();
  building.traverse(object=>{if(object.isMesh && object.visible){
    for(const material of Array.isArray(object.material)?object.material:[object.material])
      if(material && !materials.has(material))materials.set(material,{opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite});
  }});
  expansion={building,materials,site,start:performance.now(),duration:1850,finished:false};
  camera.fov=camera.aspect<0.8?72:53;camera.updateProjectionMatrix();
  const expandedEye=camera.aspect<0.8
    ? new THREE.Vector3(site.x,site.y+135,site.z+175)
    : new THREE.Vector3(site.x+12,site.y+65,site.z+92);
  focus(new THREE.Vector3(site.x,1.2,site.z),expandedEye);
  updateRoofs();
  status.textContent=`Hospital ${hospitalId} · first floor ready · choose any floor`;
  reportSceneLocation('expanded');
  setTimeout(async()=>{
    for(let level=2;level<=6;level++){
      if(token!==floorSelectToken || activeHospital!==hospitalId || !expandedHospital)return;
      try {
        const floor=await ensureFloor(hospitalId,level);
        if(token!==floorSelectToken || activeHospital!==hospitalId || !expandedHospital)return;
        const column=(level-1)%3,row=Math.floor((level-1)/3);
        floor.group.position.set(site.x+(column-1)*38,0,site.z+(row-.5)*42);
        floor.group.visible=true;
        floor.roof.visible=false;
        floor.badge.visible=true;
        floor.patients.forEach((patient,room)=>{if(patient){patient.visible=false;floor.proxies[room].visible=true;}});
        status.textContent=`Hospital ${hospitalId} · ${level} of 6 floors ready · choose any floor`;
      } catch(error){showError(`Hospital ${hospitalId} floor ${level} load failed: ${error}`);return;}
    }
  },2000);
}

function leaveHospitalView() {
  if(!hospitalView)return;
  hospitalView=false;
  if(hospitalShell)hospitalShell.visible=false;
  floors.forEach((floor,index)=>{if(floor)floor.group.visible=index===activeFloor-1;});
  if(grandCube)grandCube.group.visible=true;
  if(cabGroup)cabGroup.visible=true;
  document.querySelector('#hospitalView').classList.remove('active');
  document.querySelector('#hospitalView').setAttribute('aria-pressed','false');
  updateRoofs();
}

function showHospitalView() {
  if(!hospitalShell)return;
  floorSelectToken++;
  requestedFloor=null;
  stopWalk();stopTour();
  resetExpandedView();
  setGrandCubeFocused(false);
  hospitalView=true;
  activeRoom=0;
  updateOpenFeedButton();
  updateToolbarSelection();
  roofVisible=false;
  cabMove=null;
  floors.forEach(floor=>{if(floor)floor.group.visible=false;});
  hideHospitalCubes();
  cabGroup.visible=false;
  hospitalShell.visible=true;
  document.querySelectorAll('[data-room]').forEach(button=>button.classList.remove('active'));
  document.querySelector('#hospitalView').classList.add('active');
  document.querySelector('#hospitalView').setAttribute('aria-pressed','true');
  camera.fov=53;
  camera.updateProjectionMatrix();
  focus(new THREE.Vector3(0,9.2,10),new THREE.Vector3(0,90,165));
  updateRoofs();
  status.textContent='Campus view · five hospitals · select a hospital to enter';
  reportSceneLocation('campus');
}

function styleHospitalShell(shell, hospitalName = 'HOSPITAL') {
  // Keep the exported six-floor architecture as the building core. Add a
  // lightweight facade that follows its measured 34 x 24 m footprint.
  const wall = new THREE.MeshStandardMaterial({color:0x557f90,roughness:0.9});
  const alternate = new THREE.MeshStandardMaterial({color:0x4d7281,roughness:0.9});
  const trim = new THREE.MeshStandardMaterial({color:0xa7cbd4,roughness:0.72});
  const frame = new THREE.MeshStandardMaterial({color:0xc8e4e8,roughness:0.75});
  const glass = new THREE.MeshStandardMaterial({color:0x173a48,roughness:0.33,metalness:0.1});
  const door = new THREE.MeshStandardMaterial({color:0x315360,roughness:0.55});
  const roof = new THREE.MeshStandardMaterial({color:0x89b8c7,roughness:0.8});
  shell.traverse(object=>{if(object.isMesh)object.visible=false;});
  function box(name,w,h,d,x,y,z,material) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.name=name;mesh.position.set(x,y,z);shell.add(mesh);return mesh;
  }
  box('Hospital plinth',35.4,.3,25.4,0,-.17,0,alternate);
  for(let level=1;level<=6;level++) {
    const base=(level-1)*floorHeight;
    box(`Hospital floor ${level} facade`,34.2,3.08,24.2,0,base+1.53,0,level%2?wall:alternate);
    box(`Hospital floor ${level} cornice`,34.55,.12,24.55,0,base+3.13,0,trim);
    const wy=base+1.64;
    for(let column=0;column<6;column++) {
      const x=-13.55+column*5.42;
      for(const face of [-1,1]) {
        const z=face*12.16;
        box(`Floor ${level} window ${column+1} frame ${face}`,1.58,1.43,.08,x,wy,z,frame);
        box(`Floor ${level} window ${column+1} glass ${face}`,1.28,1.15,.09,x,wy,z+face*.085,glass);
      }
    }
    for(let column=0;column<4;column++) {
      const z=-8.25+column*5.5;
      for(const face of [-1,1]) {
        const x=face*17.16;
        box(`Floor ${level} side window ${column+1} frame ${face}`,.08,1.43,1.58,x,wy,z,frame);
        box(`Floor ${level} side window ${column+1} glass ${face}`,.09,1.15,1.28,x+face*.085,wy,z,glass);
      }
    }
  }
  box('Hospital main entrance frame',2.45,2.65,.13,0,1.27,12.22,frame);
  box('Hospital main entrance',2.17,2.4,.14,0,1.18,12.33,door);
  box('Hospital roof',34.8,.29,24.8,0,19.02,0,roof);
  box('Elevator overrun',3.5,.9,3.2,-11.9,19.58,-7.9,alternate);
  const labelCanvas=document.createElement('canvas');labelCanvas.width=1024;labelCanvas.height=256;
  const ctx=labelCanvas.getContext('2d');ctx.clearRect(0,0,1024,256);
  ctx.fillStyle='#173a48';ctx.font='bold 180px system-ui, sans-serif';ctx.textAlign='center';
  ctx.textBaseline='middle';ctx.fillText(hospitalName.toUpperCase(),512,128);
  const label=new THREE.Mesh(new THREE.PlaneGeometry(24,8),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(labelCanvas),transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  label.name='Hospital roof label';label.rotation.x=-Math.PI/2;label.position.set(0,19.32,0);shell.add(label);
}

function roomAssignment(hospitalId, floor, room) {
  return roomById.get(`${hospitalId}-F${String(floor).padStart(2,'0')}-R${String(room).padStart(2,'0')}`) || null;
}

function updateOpenFeedButton() {
  const button=document.querySelector('#openFeed');
  const room=walkMode?walkRoom:activeRoom;
  const assignment=room?roomAssignment(activeHospital,activeFloor,room):null;
  button.hidden=!(assignment?.patient_id && (assignment.uc_davis_recording || assignment.telemetry_record));
  button.disabled=button.hidden;
  button.textContent=assignment?.uc_davis_recording?'Open full UC Davis waveform':
    assignment?.telemetry_record?'Open full MGH telemetry':'Open full waveform';
}

async function paintTelemetryDetail(now) {
  if (!telemetryDetail || now-lastDetailPaint<80) return;
  lastDetailPaint=now;
  const {assignment,canvas}=telemetryDetail;
  const elapsed=exportElapsedSeconds ?? (now-playbackStart)/1000;
  try {
    const record=await getRecord(assignment.telemetry_record);
    if (!telemetryDetail || telemetryDetail.assignment!==assignment) return;
    await fillRecordCache(record,elapsed);
    if (!telemetryDetail || telemetryDetail.assignment!==assignment || !isCached(record,elapsed)) return;
    const start=recordClock(record,elapsed)-record.windows.length;
    for(let j=0;j<record.windows.length;j++)record.windows[j]=((start+j)%record.samples+record.samples)%record.samples;
    drawMonitor(canvas,assignment.room,record,elapsed);
  } catch(error) { showError(String(error)); }
}

function activateHospital(hospitalId) {
  setCubeHover(null);
  hideHospitalCubes();
  for(const floor of floors)if(floor){floor.group.visible=false;floor.roof.visible=false;}
  const state=hospitalStates.get(hospitalId);
  if(!state)throw Error(`Unknown hospital ${hospitalId}`);
  activeHospital=hospitalId;
  if(!cubesByHospital.has(hospitalId)){
    const cube=makeGrandCube(hospitalId);
    cube.group.visible=false;
    cubesByHospital.set(hospitalId,cube);
  }
  grandCube=cubesByHospital.get(hospitalId);
  floors=state.floors;
  doorHinges=state.doorHinges;
  doorAngles=state.doorAngles;
  doorTargets=state.doorTargets;
  telemetryReady=state.telemetryReady;
  floorRecords=state.floorRecords;
  activeFloor=1;
  activeRoom=0;
  updateOpenFeedButton();
  updateToolbarSelection();
  unitTour=null;
  unitTourTime=0;
  if(cabGroup){cabMove=null;cabGroup.position.y=0;}
  document.querySelectorAll('[data-hospital]').forEach(button=>button.classList.toggle('active',button.dataset.hospital===hospitalId));
}

async function selectHospital(hospitalId) {
  await expandHospital(hospitalId);
}

async function setFloor(number, moveCamera = true) {
  if(!meta?.floors[number-1])return;
  const token=++floorSelectToken;
  const hospitalId=activeHospital;
  requestedFloor=number;
  status.textContent=`Loading hospital ${hospitalId}, floor ${number}…`;
  try { await ensureFloor(hospitalId,number); }
  catch(err) { if(token===floorSelectToken){requestedFloor=null;showError(`Floor ${number} load failed: ${err}`);} return; }
  if(token!==floorSelectToken || hospitalId!==activeHospital)return;
  resetExpandedView(number);
  leaveHospitalView();
  if(unitTour && unitTour.floor!==number) {
    for(let room=1;room<=6;room++)setRoomDoorOpen(unitTour.floor,room,1);
    unitTour=null;
    unitTourTime=0;
  }
  activeFloor = number;
  updateOpenFeedButton();
  updateToolbarSelection();
  attachCubeToFloor(number);
  floors.forEach((f, i) => { if(f)f.group.visible = i === number - 1; });
  document.querySelectorAll('[data-floor]').forEach(b => b.classList.toggle('active', Number(b.dataset.floor) === number));
  document.querySelector('#elevatorDoor').textContent = doorTargets[number - 1] > 40 ? 'Close elevator' : 'Open elevator';
  document.querySelector('#elevatorDoor').setAttribute('aria-pressed', String(doorTargets[number - 1] > 40));
  if (moveCamera) {
    activeRoom ? setRoom(activeRoom) : overview();
    if (cabGroup) cabMove = { from: cabGroup.position.y, to: (number - 1) * floorHeight, start: performance.now(), duration: 1400 };
  }
  updateRoofs();
  ensureTelemetryCaches();
  if(floors[number-1]) {
    unitTour=buildUnitWalkTour(number);
    unitTourTime=0;
    updateUnitTourControls();
  }
  status.textContent=`Hospital ${hospitalId} · Floor ${number} · 6 rooms`;
  reportSceneLocation('floor');
}

function updateRoofs() {
  const insideView=walkMode || tourPlaying || exportElapsedSeconds!==null;
  floors.forEach((f, i) => { if (f?.roof) f.roof.visible = !hospitalView && !expandedHospital && i === activeFloor - 1 && (insideView || (roofVisible && activeRoom === 0)); });
}

function setDoorAngle(level, degrees) {
  const item = doorHinges[level - 1];
  if (!item) return;
  doorAngles[level - 1] = degrees;
  item.object.quaternion.copy(item.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(degrees)));
}

function toggleElevatorDoor() {
  const index = activeFloor - 1;
  doorTargets[index] = doorTargets[index] > 40 ? 0 : 85;
  document.querySelector('#elevatorDoor').textContent = doorTargets[index] > 40 ? 'Close elevator' : 'Open elevator';
  document.querySelector('#elevatorDoor').setAttribute('aria-pressed', String(doorTargets[index] > 40));
}

function setRoom(room) {
  leaveHospitalView();
  setGrandCubeFocused(false);
  activeRoom = room;
  updateOpenFeedButton();
  updateToolbarSelection();
  updateRoofs();
  document.querySelectorAll('[data-room]').forEach(b => b.classList.toggle('active', Number(b.dataset.room) === room));
  const floor = floors[activeFloor - 1];
  if (!floor) return;
  const assignment=roomAssignment(activeHospital,activeFloor,room);
  const monitor = assignment?.uc_davis_recording
    ? floor.ventScreens[room - 1].object : floor.monitors[room - 1];
  const center = new THREE.Box3().setFromObject(monitor).getCenter(new THREE.Vector3());
  const inward = new THREE.Vector3(-center.x, 0, -center.z).normalize();
  const target = center.clone().addScaledVector(inward, 0.45);
  const position = center.clone().addScaledVector(inward, 2.2).add(new THREE.Vector3(0, 0.5, 0));
  focus(target, position);
  status.textContent=`${assignment?.id || `Hospital ${activeHospital} · Floor ${activeFloor} · Room ${room}`} · ${assignment?.patient_id || 'Unassigned'}`;
}

function overview() {
  leaveHospitalView();
  setGrandCubeFocused(false);
  activeRoom = 0;
  updateOpenFeedButton();
  updateToolbarSelection();
  updateRoofs();
  document.querySelectorAll('[data-room]').forEach(b => b.classList.remove('active'));
  const y = (activeFloor - 1) * floorHeight;
  focus(new THREE.Vector3(0, y, 0), new THREE.Vector3(22, y + 35, 31));
}
