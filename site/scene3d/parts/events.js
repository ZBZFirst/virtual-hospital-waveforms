function enablePanelDrag(panel,header){
  let drag=null;
  function clamp(left,top){
    panel.style.left=`${Math.max(0,Math.min(innerWidth-panel.offsetWidth,left))}px`;
    panel.style.top=`${Math.max(0,Math.min(innerHeight-panel.offsetHeight,top))}px`;
    panel.style.right='auto';
    panel.style.bottom='auto';
  }
  header.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('button'))return;
    const rect=panel.getBoundingClientRect();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
    clamp(rect.left,rect.top);
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  header.addEventListener('pointermove',event=>{
    if(drag?.id===event.pointerId)clamp(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);
  });
  for(const type of ['pointerup','pointercancel'])header.addEventListener(type,event=>{
    if(drag?.id===event.pointerId)drag=null;
  });
  addEventListener('resize',()=>{
    if(panel.style.left)clamp(parseFloat(panel.style.left),parseFloat(panel.style.top));
  });
  return {clamp};
}

function setupToolbarTabsAndDrag(){
  const bar=document.querySelector('#bar'),header=document.querySelector('#barHeader');
  const barDrag=enablePanelDrag(bar,header);
  const tabs=[...document.querySelectorAll('.toolbar-tab')];
  function selectTab(tab){
    closeToolbarPickers();
    for(const item of tabs){
      const active=item===tab;
      item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;
      document.getElementById(item.getAttribute('aria-controls')).hidden=!active;
    }
    if(bar.style.left)barDrag.clamp(parseFloat(bar.style.left),parseFloat(bar.style.top));
  }
  for(const tab of tabs){
    tab.addEventListener('click',()=>selectTab(tab));
    tab.addEventListener('keydown',event=>{
      let index=tabs.indexOf(tab);
      if(event.key==='ArrowRight')index=(index+1)%tabs.length;
      else if(event.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;
      else if(event.key==='Home')index=0;
      else if(event.key==='End')index=tabs.length-1;
      else return;
      event.preventDefault();selectTab(tabs[index]);tabs[index].focus();
    });
  }
  selectTab(tabs[0]);
}
setupToolbarTabsAndDrag();
enablePanelDrag(document.querySelector('#cubeInspector'),document.querySelector('#cubeDragHandle'));
document.querySelector('#walk').addEventListener('click', () => walkMode ? stopWalk() : startWalk());
document.querySelector('#inspectTarget').addEventListener('click', () => {
  if(walkMode){
    tabletInspect=!tabletInspect;
    if(tabletInspect&&document.pointerLockElement===renderer.domElement)document.exitPointerLock();
    placeTablet();
  }
  else focusGrandCube();
});
async function changePatient(step){
  if(walkMode){cycleTabletRoom(step);return;}
  if(hospitalView||expandedHospital)await setFloor(activeFloor);
  const base=activeRoom||(step>0?0:1);
  const next=((base-1+step+6)%6)+1;
  setRoom(next);
}
document.querySelector('#previousPatient').addEventListener('click', () => changePatient(-1));
document.querySelector('#nextPatient').addEventListener('click', () => changePatient(1));
document.querySelector('#openVital').addEventListener('click',()=>{
  const room=walkMode?walkRoom:activeRoom;
  const assignment=room?roomAssignment(activeHospital,activeFloor,room):null;
  if(assignment?.telemetry_record)openVitalDetail(assignment);
});
document.querySelector('#openVent').addEventListener('click',()=>{
  const room=walkMode?walkRoom:activeRoom;
  const assignment=room?roomAssignment(activeHospital,activeFloor,room):null;
  if(!assignment?.uc_davis_recording){if(assignment?.patient_id)openVitalDetail(assignment,'vent');return;}
  parent.postMessage({type:'zebezo-open-recording',recording:assignment.uc_davis_recording,
    roomId:assignment.id},location.origin);
});
document.querySelector('#vitalTab').addEventListener('click',()=>selectVitalDetailTab('vital'));
document.querySelector('#ventTab').addEventListener('click',()=>selectVitalDetailTab('vent'));
document.querySelector('#vitalLiveTab').addEventListener('click',()=>selectVitalMode('live'));
document.querySelector('#vitalReviewTab').addEventListener('click',()=>selectVitalMode('review'));
document.querySelector('#vitalLivePlay').addEventListener('click',()=>{
  if(!telemetryDetail)return;
  const sceneElapsed=exportElapsedSeconds??(performance.now()-playbackStart)/1000;
  if(telemetryDetail.paused)telemetryDetail.offset=sceneElapsed-telemetryDetail.elapsed;
  else telemetryDetail.elapsed=sceneElapsed-telemetryDetail.offset;
  telemetryDetail.paused=!telemetryDetail.paused;
  document.querySelector('#vitalLivePlay').textContent=telemetryDetail.paused?'Resume':'Pause';
});
document.querySelector('#vitalReviewPlay').addEventListener('click',()=>{
  const detail=telemetryDetail;
  if(!detail?.record || detail.mode!=='review')return;
  if(!detail.reviewPlaying && detail.reviewSeconds>=detail.record.duration)setVitalReviewPosition(0);
  detail.reviewPlaying=!detail.reviewPlaying;
  detail.lastReviewFrame=performance.now();
  document.querySelector('#vitalReviewPlay').textContent=detail.reviewPlaying?'Pause':'Play';
});
document.querySelector('#vitalScrub').addEventListener('input',event=>{
  const record=telemetryDetail?.record;
  if(record)setVitalReviewPosition(Number(event.target.value)/1000*record.duration);
});
for(const [id,direction] of [['vitalPrev',-1],['vitalNext',1]])
  document.querySelector(`#${id}`).addEventListener('click',()=>{
    const detail=telemetryDetail;
    if(detail?.record)setVitalReviewPosition(detail.reviewSeconds+direction*Number(document.querySelector('#vitalWindow').value));
  });
const vitalOverviewCanvas=document.querySelector('#vitalOverview');
function seekVitalOverview(event){
  const record=telemetryDetail?.record;
  if(!record)return;
  const bounds=vitalOverviewCanvas.getBoundingClientRect();
  const fraction=THREE.MathUtils.clamp((event.clientX-bounds.left-78)/(bounds.width-90),0,1);
  setVitalReviewPosition(fraction*record.duration);
}
vitalOverviewCanvas.addEventListener('pointerdown',event=>{
  vitalOverviewCanvas.setPointerCapture(event.pointerId);
  seekVitalOverview(event);
});
vitalOverviewCanvas.addEventListener('pointermove',event=>{
  if(vitalOverviewCanvas.hasPointerCapture(event.pointerId))seekVitalOverview(event);
});
document.querySelector('#vitalWindow').addEventListener('change',()=>{lastDetailPaint=0;if(telemetryDetail)telemetryDetail.ranges=null;});
document.querySelector('#closeTelemetry').addEventListener('click',()=>{
  telemetryDetail=null;
  document.querySelector('#telemetryDetail').classList.remove('open');
});
document.querySelector('#cubeAuto').addEventListener('click', () => {
  if(!grandCube)return;
  setCubeAutoRotation(!grandCube.auto.enabled);
});
renderer.domElement.addEventListener('click', event => {
  if(!walkMode)return;
  if(tabletInspect&&document.pointerLockElement===renderer.domElement){document.exitPointerLock();return;}
  if(handleTabletAudioClick(event)||tabletDisplayHit(event)||pickCubeFace(event))return;
  if(event.pointerType==='touch')return;
  if(document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock();
});
document.addEventListener('mousemove', event => {
  if (!walkMode || document.pointerLockElement !== renderer.domElement) return;
  camera.rotation.y -= event.movementX * 0.002;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - event.movementY * 0.002, -1.48, 1.48);
  camera.rotation.z = 0;
});
document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if(telemetryDetail){
    if(key==='escape'){document.querySelector('#closeTelemetry').click();event.preventDefault();}
    return;
  }
  if(handleTabletAudioKey(event)){event.preventDefault();return;}
  if (walkMode && ['w', 'a', 's', 'd', 'shift'].includes(key)) { movementKeys.add(key); event.preventDefault(); }
  if (walkMode && key === 'e' && !event.repeat) { toggleElevatorDoor(); event.preventDefault(); }
  if (walkMode && key === 'i' && !event.repeat) { document.querySelector('#inspectTarget').click(); event.preventDefault(); }
  if (walkMode && tabletEquipped && key === '[' && !event.repeat) { cycleTabletRoom(-1); event.preventDefault(); }
  if (walkMode && tabletEquipped && key === ']' && !event.repeat) { cycleTabletRoom(1); event.preventDefault(); }
  if (embedded && key === 'escape' && !event.defaultPrevented &&
      document.pointerLockElement !== renderer.domElement)
    parent.postMessage({type:'zebezo-scene-escape'},location.origin);
});
document.addEventListener('keyup', event => movementKeys.delete(event.key.toLowerCase()));
addEventListener('blur', () => movementKeys.clear());

function applyTourFrame(frame) {
  if (!tour) return;
  tourFrame = Math.max(tour.first_frame, Math.min(tour.last_frame, frame));
  const samples = tour.samples;
  let low = 0, high = samples.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (samples[mid][0] <= tourFrame) low = mid;
    else high = mid - 1;
  }
  const a = samples[low], b = samples[Math.min(low + 1, samples.length - 1)];
  const t = b[0] === a[0] ? 0 : (tourFrame - a[0]) / (b[0] - a[0]);
  const pos = new THREE.Vector3(...a[1]).lerp(new THREE.Vector3(...b[1]), t);
  const direction = new THREE.Vector3(...a[2]).lerp(new THREE.Vector3(...b[2]), t).normalize();
  const up = new THREE.Vector3(...a[3]).lerp(new THREE.Vector3(...b[3]), t).normalize();
  cameraMove = null;
  camera.position.copy(pos);
  camera.up.copy(up);
  controls.target.copy(pos).add(direction);
  camera.lookAt(controls.target);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(36 / (2 * THREE.MathUtils.lerp(a[4], b[4], t))));
  camera.updateProjectionMatrix();
  if (cabGroup) { cabMove = null; cabGroup.position.y = THREE.MathUtils.lerp(a[5], b[5], t); }
  if (a[6] && b[6]) for (let i = 0; i < floors.length; i++) {
    setDoorAngle(i + 1, THREE.MathUtils.lerp(a[6][i], b[6][i], t));
    doorTargets[i] = doorAngles[i];
  }
  const level = Math.max(1, Math.min(floors.length, Math.round((pos.y - 1.68) / floorHeight) + 1));
  if (level !== activeFloor && level !== requestedFloor) setFloor(level, false);
  document.querySelector('#tourScrub').value = String(Math.round(tourFrame));
  const seconds = Math.floor((tourFrame - 1) / tour.fps);
  const total = Math.floor((tour.last_frame - 1) / tour.fps);
  document.querySelector('#tourTime').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} / ${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function closeToolbarPickers(){document.querySelectorAll('.toolbar-picker').forEach(picker=>picker.open=false);}
document.querySelectorAll('.toolbar-picker').forEach(picker=>picker.addEventListener('toggle',()=>{
  if(picker.open)document.querySelectorAll('.toolbar-picker').forEach(other=>{if(other!==picker)other.open=false;});
}));
document.querySelectorAll('[data-floor]').forEach(b => b.addEventListener('click', () => { closeToolbarPickers();stopWalk();stopTour();setFloor(Number(b.dataset.floor)); }));
document.querySelectorAll('[data-hospital]').forEach(b=>b.addEventListener('click',()=>{closeToolbarPickers();selectHospital(b.dataset.hospital);}));
const campusRaycaster=new THREE.Raycaster();
renderer.domElement.addEventListener('click',event=>{
  if((!hospitalView && !expandedHospital) || !hospitalShell)return;
  const bounds=renderer.domElement.getBoundingClientRect();
  const pointer=new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
  campusRaycaster.setFromCamera(pointer,camera);
  if(expandedHospital){
    if(!expansion?.finished)return;
    const targets=[...floors.filter(Boolean).map(floor=>floor.group),...[...floorPreviews.values()].map(preview=>preview.group)];
    for(const hit of campusRaycaster.intersectObjects(targets,true)){
      const belongsTo=group=>{let node=hit.object;while(node){if(node===group)return true;node=node.parent;}return false;};
      const index=floors.findIndex(floor=>floor&&belongsTo(floor.group));
      const preview=[...floorPreviews.entries()].find(([,item])=>belongsTo(item.group));
      const level=index>=0?index+1:preview?.[0];
      if(level){setFloor(level);break;}
    }
    return;
  }
  for(const hit of campusRaycaster.intersectObjects(hospitalShell.children,true)) {
    let building=hit.object;
    while(building?.parent!==hospitalShell)building=building?.parent;
    if(building?.userData.hospitalId){selectHospital(building.userData.hospitalId);break;}
  }
});
document.querySelectorAll('[data-room]').forEach(b => b.addEventListener('click', async () => {
  closeToolbarPickers();
  if(expandedHospital)await setFloor(activeFloor);
  if (walkMode) {
    selectTabletRoom(Number(b.dataset.room));
  } else { stopTour(); setRoom(Number(b.dataset.room)); }
}));
document.querySelector('#overview').addEventListener('click', async () => {
  stopWalk();stopTour();
  if(hospitalView || expandedHospital || !floors[activeFloor-1]) await setFloor(activeFloor);
  else overview();
});
document.querySelector('#hospitalView').addEventListener('click',showHospitalView);
document.querySelector('#elevatorDoor').addEventListener('click', () => { stopTour(); toggleElevatorDoor(); });
document.querySelector('#tourPlay').addEventListener('click', async () => {
  if(expandedHospital)await setFloor(activeFloor);
  if (!floors[activeFloor-1]) return;
  stopWalk();
  if (tourPlaying) { stopTour(false); return; }
  leaveHospitalView();
  setGrandCubeFocused(false);
  if(!unitTour || unitTour.floor!==activeFloor)unitTour=buildUnitWalkTour(activeFloor);
  if(unitTourTime>=unitTour.duration)unitTourTime=0;
  tourPlaying = true;
  controls.enabled = false;
  updateRoofs();
  tourClock = performance.now();
  document.querySelector('#tourPlay').textContent = 'Pause tour';
  camera.fov=73;
  camera.updateProjectionMatrix();
  applyUnitTourTime(unitTourTime);
});
document.querySelector('#tourScrub').addEventListener('input', event => {
  if(expandedHospital)return;
  stopWalk();
  stopTour();
  leaveHospitalView();
  setGrandCubeFocused(false);
  if(!unitTour || unitTour.floor!==activeFloor)unitTour=buildUnitWalkTour(activeFloor);
  applyUnitTourTime(Number(event.target.value));
});
