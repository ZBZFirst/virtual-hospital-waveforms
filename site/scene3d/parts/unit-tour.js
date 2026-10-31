function setRoomDoorOpen(level, room, fraction) {
  const door=floors[level-1]?.roomDoors[room-1];
  if(!door)return;
  door.hinge.quaternion.copy(door.closed).slerp(door.open,THREE.MathUtils.clamp(fraction,0,1));
}

function buildUnitWalkTour(level) {
  const floor=floors[level-1], eye=1.68+(level-1)*floorHeight;
  const segments=[],doorEvents=[];
  let clock=0, position=new THREE.Vector3(0,eye,-2.8), look=new THREE.Vector3(0,0,1);
  const move=(x,z,label='Hallway')=>{
    const target=new THREE.Vector3(x,eye,z),distance=position.distanceTo(target);
    if(distance<0.01)return;
    const direction=target.clone().sub(position).normalize();
    const duration=distance/1.15*1000;
    segments.push({kind:'move',start:clock,end:clock+duration,from:position.clone(),to:target.clone(),lookFrom:look.clone(),lookTo:direction,label});
    clock+=duration;position=target;look=direction;
  };
  const hold=(seconds,target,label)=>{
    const direction=target.clone().sub(position).normalize();
    const duration=seconds*1000;
    segments.push({kind:'hold',start:clock,end:clock+duration,from:position.clone(),to:position.clone(),lookFrom:look.clone(),lookTo:direction,label});
    clock+=duration;look=direction;
  };
  const roomStop=(room,outside,threshold,inside)=>{
    move(...outside,`Approach room ${room}`);
    const openAt=clock;
    hold(1.1,new THREE.Vector3(threshold[0],eye,threshold[1]),`Open room ${room} door`);
    move(...threshold,`Room ${room} doorway`);
    move(...inside,`Enter room ${room}`);
    const bed=floor.bedRigs[room-1].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,1.0,0));
    const vital=floor.screens[room-1].center;
    const vent=floor.ventScreens[room-1].worldBox.getCenter(new THREE.Vector3());
    hold(4,bed,`Room ${room} patient`);
    hold(3.5,vital,`Room ${room} vital signs`);
    hold(3.5,vent,`Room ${room} ventilator`);
    move(...threshold,`Leave room ${room}`);
    move(...outside,`Room ${room} corridor`);
    const closeAt=clock;
    hold(0.9,new THREE.Vector3(threshold[0],eye,threshold[1]),`Close room ${room} door`);
    doorEvents.push({room,openAt,closeAt});
  };
  hold(2.5,new THREE.Vector3(0,1.35+(level-1)*floorHeight,0.3),'Nursing station');
  move(0,-5.2);
  move(-10.4,-5.2);
  roomStop(1,[-10.4,-5.2],[-10.4,-6.8],[-10.4,-7.9]);
  move(0,-5.2);
  roomStop(2,[0,-5.2],[0,-6.8],[0,-7.9]);
  move(10.4,-5.2);
  roomStop(3,[10.4,-5.2],[10.4,-6.8],[10.4,-7.9]);
  move(7.8,-5.2);move(7.8,-3.4);move(-7.8,-3.4);move(-7.8,-1);
  roomStop(4,[-7.8,-1],[-9.4,-1],[-10.7,-1]);
  move(-7.8,-3.4);move(7.8,-3.4);move(7.8,-1);
  roomStop(5,[7.8,-1],[9.4,-1],[10.7,-1]);
  move(7.8,-3.4);move(-7.8,-3.4);move(-7.8,5);move(-10.4,5);
  roomStop(6,[-10.4,5],[-10.4,6.6],[-10.4,7.8]);
  move(-7.8,5);move(-7.8,-3.4);move(0,-3.4);move(0,-2.8);
  hold(2.5,new THREE.Vector3(0,1.35+(level-1)*floorHeight,0.3),'Return to nursing station');
  return {floor:level,segments,doorEvents,duration:clock};
}

function updateUnitTourControls() {
  if(!unitTour)return;
  const slider=document.querySelector('#tourScrub');
  slider.min='0';slider.max=String(Math.ceil(unitTour.duration));
  slider.value=String(Math.round(unitTourTime));
  const format=milliseconds=>{
    const s=Math.floor(milliseconds/1000);
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  };
  document.querySelector('#tourTime').textContent=`${format(unitTourTime)} / ${format(unitTour.duration)}`;
}

function applyUnitTourTime(time) {
  if(!unitTour)return;
  unitTourTime=THREE.MathUtils.clamp(time,0,unitTour.duration);
  const segment=unitTour.segments.find(item=>unitTourTime<=item.end) || unitTour.segments.at(-1);
  const t=THREE.MathUtils.clamp((unitTourTime-segment.start)/(segment.end-segment.start),0,1);
  cameraMove=null;
  camera.position.lerpVectors(segment.from,segment.to,t);
  const smooth=t*t*(3-2*t);
  const direction=segment.lookFrom.clone().lerp(segment.lookTo,smooth);
  if(direction.lengthSq()<0.00001)direction.copy(segment.lookTo);
  direction.normalize();
  camera.up.set(0,1,0);
  camera.lookAt(camera.position.clone().add(direction));
  controls.target.copy(camera.position).addScaledVector(direction,2);
  for(let room=1;room<=6;room++) {
    const event=unitTour.doorEvents.find(item=>item.room===room);
    let open=0;
    if(unitTourTime>=event.openAt && unitTourTime<event.openAt+900)open=(unitTourTime-event.openAt)/900;
    else if(unitTourTime>=event.openAt+900 && unitTourTime<event.closeAt)open=1;
    else if(unitTourTime>=event.closeAt && unitTourTime<event.closeAt+900)open=1-(unitTourTime-event.closeAt)/900;
    setRoomDoorOpen(unitTour.floor,room,open);
  }
  status.textContent=`Walking tour · floor ${unitTour.floor} · ${segment.label}`;
  updateUnitTourControls();
}

function updateBreathing(seconds) {
  for (const { mesh, room } of breathers) {
    const record = ventRecordForRoom(room);
    if (record && Array.isArray(record.volume_ml)) {
      const index = record.playback_offset_samples + Math.floor((seconds % 10) * 50);
      let chest = 0, count = 0;
      for (let k = Math.max(0, index - 2); k <= Math.min(749, index + 2); k++) {
        const value = record.volume_ml[k];
        if (Number.isFinite(value)) { chest += Math.max(0, value); count++; }
      }
      mesh.morphTargetInfluences[0] = count ? Math.min(1, chest / count / record.chestLevel) : 0;
    } else mesh.morphTargetInfluences[0] = 0;
  }
}

async function renderUnitTourFrame(milliseconds) {
  exportElapsedSeconds=milliseconds/1000;
  updateRoofs();
  applyUnitTourTime(milliseconds);
  const floor=activeFloor;
  while(telemetryBusy.has(`${activeHospital}:${floor}`))await new Promise(resolve=>setTimeout(resolve,20));
  await ensureTelemetryCaches(floor);
  const records=floorRecords[floor-1];
  if(records?.some(record=>record&&!isCached(record,exportElapsedSeconds))) {
    await Promise.all(records.filter(Boolean).map(record=>fillRecordCache(record,exportElapsedSeconds)));
  }
  updateBreathing(exportElapsedSeconds);
  updateLODs();
  camera.updateMatrixWorld();
  const projection=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  const frustum=new THREE.Frustum().setFromProjectionMatrix(projection);
  drawTelemetryFrame(performance.now(),exportElapsedSeconds,frustum);
  drawVentilatorsFrame(exportElapsedSeconds,frustum);
  drawCubeFaces(exportElapsedSeconds,performance.now(),frustum);
  renderer.render(scene,camera);
}

function stopTour(restoreDoors = true) {
  tourPlaying = false;
  if(restoreDoors && unitTour)for(let room=1;room<=6;room++)setRoomDoorOpen(unitTour.floor,room,1);
  controls.enabled = true;
  document.querySelector('#tourPlay').textContent = 'Play unit walk';
  camera.up.set(0, 1, 0);
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  controls.target.copy(camera.position).addScaledVector(forward,2);
  updateRoofs();
}

function stopWalk() {
  if (!walkMode) return;
  walkMode = false;
  walkRoom=0;
  tabletInspect = false;
  placeTablet();
  updateOpenFeedButton();updateToolbarSelection();
  movementKeys.clear();
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  controls.enabled = true;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  controls.target.copy(camera.position).add(forward.multiplyScalar(2));
  document.querySelector('#walk').classList.remove('active');
  document.querySelector('#walk').setAttribute('aria-pressed', 'false');
  document.querySelector('#walk').textContent = 'Walk mode';
  updateControlHelp();
  updateRoofs();
}

async function startWalk() {
  if(hospitalView || expandedHospital || !floors[activeFloor-1]) await setFloor(activeFloor);
  if(!floors[activeFloor-1] || hospitalView || expandedHospital)return;
  await loadCameraTour();
  stopTour();
  leaveHospitalView();
  setGrandCubeFocused(false);
  walkMode = true;
  walkRoom=0;
  tabletManualRoom = false;
  cameraMove = null;
  activeRoom = 0;
  updateOpenFeedButton();updateToolbarSelection();
  document.querySelectorAll('[data-room]').forEach(b => b.classList.remove('active'));
  const sample = tour.samples[0];
  camera.position.set(sample[1][0], 1.68 + (activeFloor - 1) * floorHeight, sample[1][2]);
  camera.up.set(0, 1, 0);
  camera.rotation.order = 'YXZ';
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(...sample[2])));
  camera.fov = 73;
  camera.updateProjectionMatrix();
  controls.enabled = false;
  document.querySelector('#walk').classList.add('active');
  document.querySelector('#walk').setAttribute('aria-pressed', 'true');
  document.querySelector('#walk').textContent = 'Exit walk';
  updateControlHelp();
  placeTablet();
  updateRoofs();
}
