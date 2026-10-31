function makeGrandCube(hospitalId) {
  const size = 1.45, surface = 1.37, half = size / 2 + 0.003;
  const group = new THREE.Group();
  group.name = `Hospital ${hospitalId} six-floor nursing telemetry cube`;
  const rotor = new THREE.Group();
  group.add(rotor);
  const body = new THREE.Mesh(new THREE.BoxGeometry(size,size,size),
    new THREE.MeshStandardMaterial({color:0x20343d,metalness:0.18,roughness:0.62}));
  rotor.add(body);
  const definitions = [
    {floor:1,position:[0,0,-half],rotation:[0,Math.PI,0]},
    {floor:2,position:[half,0,0],rotation:[0,Math.PI/2,0]},
    {floor:3,position:[0,0,half],rotation:[0,0,0]},
    {floor:4,position:[-half,0,0],rotation:[0,-Math.PI/2,0]},
    {floor:5,position:[0,half,0],rotation:[-Math.PI/2,0,Math.PI]},
    {floor:6,position:[0,-half,0],rotation:[Math.PI/2,0,Math.PI]},
  ];
  const faces = definitions.map(({floor,position,rotation}) => {
    const {canvas,texture,material}=makeMonitorSurface('unit',1280,1280,
      {side:THREE.FrontSide});
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(surface,surface),material);
    mesh.name = `Nursing cube · floor ${floor}`;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.userData.floor = floor;
    rotor.add(mesh);
    return {floor,canvas,texture,mesh,drawCount:0,lastDrawTime:0};
  });
  group.position.set(0,1.35,0.3);
  group.scale.setScalar(0.25);
  rotor.rotation.set(-0.12,0.22,0);
  scene.add(group);
  return {group,rotor,faces,size,focused:false,targetScale:0.25,hovered:null,drag:null,selectedFloor:null,autoBeforeInspect:null,auto:{
    enabled:true,phase:'horizontal',elapsed:0,yawProgress:0,
    fromX:-0.12,toX:-0.12,duration:0,pauseUntil:0,lastNow:performance.now(),
  }};
}

function hideHospitalCubes() {
  for(const cube of cubesByHospital.values())cube.group.visible=false;
}

function attachCubeToFloor(level) {
  const floor=floors[level-1];
  if(!grandCube || !floor)return;
  floor.group.add(grandCube.group);
  grandCube.group.position.set(0,1.35+(level-1)*floorHeight,0.3);
  grandCube.group.visible=true;
}

function startCubePhase(phase,toX,duration) {
  const auto=grandCube.auto;
  auto.phase=phase;
  auto.elapsed=0;
  auto.fromX=grandCube.rotor.rotation.x;
  auto.toX=toX;
  auto.duration=duration;
}

function updateCubeAuto(now) {
  if(!grandCube)return;
  const auto=grandCube.auto;
  const delta=Math.min(100,Math.max(0,now-auto.lastNow));
  auto.lastNow=now;
  if(!auto.enabled || grandCube.drag || grandCube.hovered || now<auto.pauseUntil)return;
  if(auto.phase==='horizontal') {
    const turn=delta*2*Math.PI/180000;
    grandCube.rotor.rotation.y+=turn;
    auto.yawProgress+=turn;
    if(auto.yawProgress>=2*Math.PI)startCubePhase('toTop',-Math.PI/2,1200);
    return;
  }
  if(auto.phase==='holdTop' || auto.phase==='holdBottom') {
    auto.elapsed+=delta;
    if(auto.elapsed>=7000) {
      if(auto.phase==='holdTop')startCubePhase('toBottom',Math.PI/2,1800);
      else startCubePhase('toHorizontal',-0.12,1200);
    }
    return;
  }
  auto.elapsed=Math.min(auto.duration,auto.elapsed+delta);
  const t=auto.duration?auto.elapsed/auto.duration:1;
  const smooth=t*t*(3-2*t);
  grandCube.rotor.rotation.x=THREE.MathUtils.lerp(auto.fromX,auto.toX,smooth);
  if(t<1)return;
  if(auto.phase==='toTop') {auto.phase='holdTop';auto.elapsed=0;}
  else if(auto.phase==='toBottom') {auto.phase='holdBottom';auto.elapsed=0;}
  else {
    auto.phase='horizontal';auto.elapsed=0;auto.yawProgress=0;
    grandCube.rotor.rotation.y%=2*Math.PI;
  }
}

const cubeRaycaster = new THREE.Raycaster();
function pickCubeFace(event) {
  if(!grandCube || !grandCube.group.visible)return null;
  const rect=renderer.domElement.getBoundingClientRect();
  const point=new THREE.Vector2(2*(event.clientX-rect.left)/rect.width-1,1-2*(event.clientY-rect.top)/rect.height);
  camera.updateMatrixWorld();
  grandCube.group.updateMatrixWorld(true);
  cubeRaycaster.setFromCamera(point,camera);
  const hit=cubeRaycaster.intersectObjects(grandCube.faces.map(face=>face.mesh),false)[0];
  return hit ? grandCube.faces.find(face=>face.mesh===hit.object) : null;
}

function paintCubeFaceStates() {
  if(!grandCube)return;
  for(const face of grandCube.faces){
    face.mesh.material.color.setHex(face===grandCube.hovered?0xe4faff:0xffffff);
    face.lastDrawTime=0;
  }
}

function updateCubeInspector() {
  const panel=document.querySelector('#cubeInspector');
  panel.hidden=!grandCube?.focused;
  if(!grandCube)return;
  const selected=grandCube.selectedFloor;
  document.querySelector('#cubeHospital').textContent=activeHospital;
  document.querySelector('#cubeSelection').textContent=selected
    ? selected===activeFloor?`Floor ${activeFloor} is current and selected.`:`Floor ${activeFloor} is current. Floor ${selected} is selected; use Visit Floor ${selected} to travel.`
    : `Floor ${activeFloor} is current. Select another floor to visit.`;
  for(const button of panel.querySelectorAll('[data-cube-floor]')){
    const floor=Number(button.dataset.cubeFloor);
    button.setAttribute('aria-pressed',String(Number(button.dataset.cubeFloor)===selected));
    button.dataset.current=String(floor===activeFloor);
    button.setAttribute('aria-label',`Floor ${floor}${floor===activeFloor?', current floor':''}${floor===selected?', selected':''}`);
  }
  const visit=document.querySelector('#cubeVisit');
  visit.disabled=!selected || selected===activeFloor;
  visit.textContent=selected===activeFloor?'Current floor':selected?`Visit Floor ${selected}`:'Select a floor';
  document.querySelector('#cubeRotationToggle').textContent=grandCube.auto.enabled?'Pause rotation':'Resume rotation';
  const toolbar=document.querySelector('#cubeAuto');
  toolbar.textContent=grandCube.auto.enabled?'Pause rotation':'Resume rotation';
  toolbar.setAttribute('aria-pressed',String(grandCube.auto.enabled));
  toolbar.classList.toggle('active',grandCube.auto.enabled);
  paintCubeFaceStates();
  updateControlHelp();
}

function setCubeAutoRotation(enabled) {
  if(!grandCube)return;
  grandCube.auto.enabled=enabled;
  grandCube.auto.lastNow=performance.now();
  if(enabled)grandCube.auto.pauseUntil=0;
  if(grandCube.focused && enabled)grandCube.selectedFloor=null;
  updateCubeInspector();
}

function selectCubeFloor(floor) {
  if(!grandCube?.focused || floor<1 || floor>6)return;
  grandCube.auto.enabled=false;
  grandCube.auto.lastNow=performance.now();
  grandCube.selectedFloor=floor;
  updateCubeInspector();
}

function setCubeHover(face,event) {
  if(!grandCube || grandCube.hovered===face)return;
  if(grandCube.hovered && !face)grandCube.auto.pauseUntil=performance.now()+2000;
  grandCube.hovered=face;
  paintCubeFaceStates();
  renderer.domElement.style.cursor=face?'grab':'';
  cubeHint.style.display=face?'block':'none';
  if(face)cubeHint.textContent=grandCube.focused
    ? `Floor ${face.floor} · click to select · drag to rotate`
    : 'Click to focus nursing cube';
  if(face && event){cubeHint.style.left=`${event.clientX+13}px`;cubeHint.style.top=`${event.clientY+13}px`;}
}

function setGrandCubeFocused(focused) {
  if(!grandCube)return;
  if(focused && !grandCube.focused){
    grandCube.autoBeforeInspect=grandCube.auto.enabled;
    grandCube.auto.enabled=false;
    grandCube.selectedFloor=null;
  } else if(!focused && grandCube.focused){
    grandCube.auto.enabled=grandCube.autoBeforeInspect??grandCube.auto.enabled;
    grandCube.autoBeforeInspect=null;
    grandCube.auto.lastNow=performance.now();
    grandCube.selectedFloor=null;
  }
  grandCube.focused=focused;
  if(focused)grandCube.faces.forEach(face=>{face.lastSourceRequest=0;});
  grandCube.targetScale=focused?1:0.25;
  if(!focused)setCubeHover(null);
  updateCubeInspector();
}

async function focusGrandCube() {
  if(!grandCube)return;
  if(hospitalView || expandedHospital)await setFloor(activeFloor);
  stopWalk();stopTour();
  leaveHospitalView();
  activeRoom=0;
  roofVisible=false;
  updateRoofs();
  document.querySelectorAll('[data-room]').forEach(b=>b.classList.remove('active'));
  setGrandCubeFocused(true);
  const y=1.35+(activeFloor-1)*floorHeight;
  focus(new THREE.Vector3(0,y,0.3),new THREE.Vector3(0,y,-2.8));
  updateControlHelp();
}

controls.addEventListener('end',()=>{
  if(!grandCube?.focused || cameraMove)return;
  const center=grandCube.group.getWorldPosition(new THREE.Vector3());
  if(controls.target.distanceTo(center)>0.8)setGrandCubeFocused(false);
});

async function visitCubeFloor(floor) {
  if(!grandCube?.focused || grandCube.selectedFloor!==floor || activeFloor===floor)return;
  cameraMove=null;
  await setFloor(floor,true);
  updateControlHelp();
}

document.querySelectorAll('[data-cube-floor]').forEach(button=>button.addEventListener('click',()=>selectCubeFloor(Number(button.dataset.cubeFloor))));
document.querySelectorAll('[data-cube-rotate]').forEach(button=>button.addEventListener('click',()=>{
  if(!grandCube?.focused)return;
  const step=Math.PI/8;
  const direction=button.dataset.cubeRotate;
  grandCube.rotor.rotation.y+=(direction==='left'?-step:direction==='right'?step:0);
  grandCube.rotor.rotation.x+=(direction==='up'?-step:direction==='down'?step:0);
  grandCube.auto.enabled=false;
  grandCube.auto.lastNow=performance.now();
  updateCubeInspector();
}));
document.querySelector('#cubeVisit').addEventListener('click',()=>visitCubeFloor(grandCube?.selectedFloor));
document.querySelector('#cubeRotationToggle').addEventListener('click',()=>setCubeAutoRotation(!grandCube?.auto.enabled));
document.querySelector('#cubeClose').addEventListener('click',()=>overview());

renderer.domElement.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  const face=pickCubeFace(event);
  if(!face)return;
  event.preventDefault();event.stopImmediatePropagation();
  grandCube.drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,moved:false,face};
  renderer.domElement.setPointerCapture(event.pointerId);
  controls.enabled=false;
  renderer.domElement.style.cursor='grabbing';
},{capture:true});
renderer.domElement.addEventListener('pointermove',event=>{
  const drag=grandCube?.drag;
  if(drag && drag.pointerId===event.pointerId){
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>8)drag.moved=true;
    if(drag.moved){
      grandCube.rotor.rotation.y+=dx*0.007;
      grandCube.rotor.rotation.x+=dy*0.007;
    }
    drag.x=event.clientX;drag.y=event.clientY;
    event.preventDefault();event.stopImmediatePropagation();
    return;
  }
  const face=pickCubeFace(event);
  setCubeHover(face,event);
  if(face){cubeHint.style.left=`${event.clientX+13}px`;cubeHint.style.top=`${event.clientY+13}px`;}
},{capture:true});
renderer.domElement.addEventListener('pointerup',event=>{
  const drag=grandCube?.drag;
  if(!drag || drag.pointerId!==event.pointerId)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>8)drag.moved=true;
  grandCube.drag=null;
  grandCube.auto.pauseUntil=performance.now()+7000;
  if(drag.moved){grandCube.auto.yawProgress=0;if(!grandCube.focused)startCubePhase('toHorizontal',-0.12,1200);}
  if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);
  controls.enabled=!walkMode&&!tourPlaying;
  const releasedFace=pickCubeFace(event);
  setCubeHover(releasedFace,event);
  if(!drag.moved && releasedFace===drag.face) {
    if(grandCube.focused)selectCubeFloor(drag.face.floor);
    else focusGrandCube();
  }
},{capture:true});
renderer.domElement.addEventListener('pointercancel',event=>{
  if(grandCube?.drag?.pointerId!==event.pointerId)return;
  grandCube.drag=null;
  grandCube.auto.pauseUntil=performance.now()+7000;
  grandCube.auto.yawProgress=0;
  if(!grandCube.focused)startCubePhase('toHorizontal',-0.12,1200);
  controls.enabled=!walkMode&&!tourPlaying;
  setCubeHover(null);
},{capture:true});
renderer.domElement.addEventListener('pointerleave',()=>{if(!grandCube?.drag)setCubeHover(null);});

function drawGrandSlot(c, x, y, width, height, room, row, vital, vent, elapsed, assignment) {
  const channelId=monitorLayouts.unit[row];
  drawMonitorChannel(c,monitorChannelState(channelId,{vital,vent,assignment},elapsed),
    {x,y,width,height},{compact:true,index:row});
}

function drawCubeFace(face, elapsed, now) {
  const c=face.canvas.getContext('2d'), floor=face.floor;
  c.fillStyle='#06171e';c.fillRect(0,0,1280,1280);
  c.fillStyle='#ddf0f2';c.font='bold 30px system-ui';
  c.fillText(`HOSPITAL ${activeHospital} · FLOOR ${floor} · UNIT TELEMETRY`,18,38);
  c.fillStyle='#83aab2';c.font='16px system-ui';
  c.fillText('6 rooms · ECG II / ART / CVP / PAP / ventilator P / flow / volume',18,63);
  for(let room=1;room<=6;room++) {
    const column=(room-1)%2, tier=Math.floor((room-1)/2);
    const x=12+column*634,y=75+tier*400,w=622;
    const vital=floorRecords[floor-1]?.[room-1] || null;
    const vent=ventRecordForRoom(room,floor);
    const assignment=roomAssignment(activeHospital,floor,room);
    c.fillStyle='#19353e';c.fillRect(x,y,w,391);
    c.fillStyle='#cde9ec';c.font='bold 20px system-ui';c.fillText(`ROOM ${String(room).padStart(2,'0')}`,x+9,y+26);
    c.fillStyle='#8bb1b8';c.font='14px system-ui';c.fillText(assignment?.uc_davis_recording?'UC DAVIS':assignment?.telemetry_record?vital?.id?.toUpperCase()||'MGH LOADING':'UNASSIGNED',x+141,y+25);
    for(let row=0;row<7;row++) drawGrandSlot(c,x+6,y+36+row*50,w-12,50,room,row,vital,vent,elapsed,assignment);
  }
  const current=floor===activeFloor,selected=floor===grandCube.selectedFloor;
  if(current||selected){
    c.save();
    c.globalCompositeOperation=current?'difference':'multiply';
    c.fillStyle=current?'#ffffff':'#8bc3cb';c.fillRect(0,0,1280,1280);
    c.restore();
  }
  if(current||selected){
    c.strokeStyle=current?'#0d5362':'#80e8ee';c.lineWidth=11;c.strokeRect(6,6,1268,1268);
    c.fillStyle=current?'#0e4650':'#155763';c.fillRect(970,12,295,48);
    c.fillStyle='#f5fcff';c.font='bold 21px system-ui';
    c.fillText(current&&selected?'CURRENT · SELECTED':current?'CURRENT FLOOR':'SELECTED FLOOR',986,43);
  }
  face.texture.needsUpdate=true;
  face.lastDrawElapsed=elapsed;
  face.lastDrawTime=now;
  face.drawCount++;
}

function drawCubeFaces(elapsed, now, frustum) {
  if(!grandCube || !grandCube.group.visible)return;
  grandCube.group.updateMatrixWorld(true);
  for(const face of grandCube.faces) {
    const center=face.mesh.getWorldPosition(new THREE.Vector3());
    const normal=new THREE.Vector3(0,0,1).applyQuaternion(face.mesh.getWorldQuaternion(new THREE.Quaternion()));
    if(normal.dot(camera.position.clone().sub(center))<=0.02)continue;
    if(!frustum.intersectsBox(new THREE.Box3().setFromObject(face.mesh)))continue;
    if(embedded && (!face.lastSourceRequest || now-face.lastSourceRequest>2000)){
      parent.postMessage({type:'zebezo-cube-face',hospital:activeHospital,floor:face.floor,
        quality:grandCube.focused?'full':'preview'},location.origin);
      face.lastSourceRequest=now;
    }
    if((!telemetryReady[face.floor-1] || floorRecords[face.floor-1]?.some(r=>r&&!isCached(r,elapsed))) &&
      campusManifest.rooms.some(room=>room.hospital_id===activeHospital&&room.floor===face.floor&&room.telemetry_record))ensureTelemetryCaches(face.floor);
    if(now-face.lastDrawTime>=(grandCube.focused?33:80))drawCubeFace(face,elapsed,now);
  }
}
