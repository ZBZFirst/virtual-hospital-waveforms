function makeScreen(room) {
  const surface=makeMonitorSurface('telemetry',512,320);
  drawMonitor(surface.canvas,room,null,0);
  return surface;
}

function makeVentScreen() {
  return makeMonitorSurface('ventilator',640,400);
}

function markUnassigned(screen, roomId, label='UNASSIGNED') {
  const {canvas,texture}=screen,c=canvas.getContext('2d');
  c.fillStyle='#07181e';c.fillRect(0,0,canvas.width,canvas.height);
  c.fillStyle='#a7cbd2';c.font='bold 22px system-ui';c.fillText(roomId,20,35);
  c.fillStyle='#6d929b';c.font='18px system-ui';c.fillText(label,20,70);
  texture.needsUpdate=true;
}

function makeFloorBadge(level) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const c=canvas.getContext('2d');
  c.fillStyle='#153943';c.fillRect(0,0,512,128);
  c.strokeStyle='#8bd1df';c.lineWidth=7;c.strokeRect(4,4,504,120);
  c.fillStyle='#e7fbff';c.font='bold 64px system-ui';c.textAlign='center';c.textBaseline='middle';
  c.fillText(`FLOOR ${level}`,256,65);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const badge=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false}));
  badge.name=`Expanded floor ${level} label`;
  badge.scale.set(11,2.75,1);
  badge.position.set(0,(level-1)*floorHeight+4,0);
  badge.visible=false;
  return badge;
}

function drawVentScreen(canvas, record, elapsed, screen) {
  if (!record) return false;
  const c=canvas.getContext('2d');
  c.fillStyle='#07181e';c.fillRect(0,0,640,400);
  c.fillStyle='#cce4e7';c.font='bold 19px system-ui';
  c.fillText(`VENTILATOR · ROOM ${String(record.room).padStart(2,'0')}`,18,28);
  c.fillStyle='#7fa5aa';c.font='12px system-ui';
  const feedStatus=record.paused?' · paused':
    Number.isFinite(record.duration)&&record.sourceSeconds>=record.duration?' · complete · replay to restart':
    Number.isFinite(record.updatedAt)&&performance.now()-record.updatedAt>1500?' · waiting for data':'';
  c.fillText(record.external?`UC Davis ${record.sourceRate} Hz source track${feedStatus}`:
    'Recorded pressure + flow · calculated volume',18,46);
  const assignment=roomAssignment(activeHospital,activeFloor,record.room);
  drawMonitorLayout(c,'ventilator',{vent:record,assignment},elapsed,
    {x:9,y:65,width:622,height:321});
  if(screen){
    screen.lastSourceSeconds=record.sourceSeconds;
    screen.sweepRecording=record.recording;
    screen.sweepRate=record.sourceRate;
  }
  return true;
}

function drawVentilatorsFrame(elapsed, frustum) {
  if(hospitalView || expandedHospital)return;
  if (!floors[activeFloor - 1]) return;
  const screens = floors[activeFloor - 1].ventScreens;
  screens.forEach((screen, i) => {
    if (!monitorIntersects(screen,frustum)) return;
    const record = ventRecordForRoom(i + 1);
    if(!record)return;
    if (!drawVentScreen(screen.canvas, record, elapsed, screen)) return;
    screen.texture.needsUpdate = true;
    screen.lastDrawElapsed = elapsed;
    screen.drawCount = (screen.drawCount || 0) + 1;
  });
}

function makeTablet() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 768;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  group.name = 'Equippable waveform tablet';
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.79, 0.61, 0.025), new THREE.MeshBasicMaterial({ color: 0x1a3038, depthTest: false }));
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.555), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, depthTest: false, depthWrite: false }));
  display.position.z = 0.014;
  shell.renderOrder = 1000; display.renderOrder = 1001;
  group.add(shell, display);
  camera.add(group);
  group.visible = false;
  return { group, display, canvas, texture, drawCount: 0 };
}

function selectTabletRoom(room) {
  const next=((room - 1 + 6) % 6) + 1;
  if(next!==tabletRoom)muteTabletAudio();
  tabletRoom = next;
  tabletManualRoom = true;
  document.querySelectorAll('[data-room]').forEach(item => item.classList.toggle('active', Number(item.dataset.room) === tabletRoom));
}

function cycleTabletRoom(step) { selectTabletRoom(tabletRoom + step); }

function placeTablet() {
  if (!tablet) return;
  tablet.group.visible = walkMode;
  tablet.group.position.set(tabletInspect ? 0 : 0.28, tabletInspect ? -0.05 : -0.25, tabletInspect ? -0.73 : -0.72);
  tablet.group.scale.setScalar(tabletInspect ? 1 : 0.57);
  tablet.group.rotation.set(tabletInspect ? 0 : -0.12, tabletInspect ? 0 : -0.13, tabletInspect ? 0 : -0.09);
  const inspect = document.querySelector('#inspectTarget');
  inspect.textContent = walkMode?(tabletInspect?'Lower tablet':'Inspect tablet'):'Inspect nursing cube';
  inspect.classList.toggle('active', tabletInspect && walkMode);
  inspect.setAttribute('aria-pressed', String(tabletInspect && walkMode));
}

function drawTablet(elapsed) {
  if (!tablet?.group.visible) return;
  const { canvas, texture } = tablet, c = canvas.getContext('2d');
  const room = tabletRoom, vital = floorRecords[activeFloor - 1]?.[room - 1] || null;
  const assignment=roomAssignment(activeHospital,activeFloor,room);
  const vent = ventRecordForRoom(room);
  const sources={vital,vent,assignment};
  c.fillStyle='#07181e';c.fillRect(0,0,canvas.width,canvas.height);
  c.fillStyle='#d8eef0';c.font='bold 27px system-ui';
  c.fillText(`${activeHospital}-F${String(activeFloor).padStart(2,'0')}-R${String(room).padStart(2,'0')}`,22,34);
  c.fillStyle='#82aab2';c.font='16px system-ui';
  c.fillText(assignment?.telemetry_record?'VITAL SIGNS · complete MGH recording':assignment?.patient_id?'VITAL SIGNS · NO SOURCE':'VITAL SIGNS · UNASSIGNED',22,58);
  c.fillText(assignment?.uc_davis_recording?'VENTILATOR · UC Davis full source visual track':assignment?.patient_id?'VENTILATOR · NO SOURCE':'VENTILATOR · UNASSIGNED',510,58);
  drawMonitorLayout(c,'unit',sources,elapsed,{x:12,y:120,width:1000,height:609});
  drawTabletAudioControls(c,{vital,vent,assignment},elapsed);
  c.fillStyle='#96bbc2';c.font='15px system-ui';
  c.fillText(`${vital?.id?.toUpperCase() || 'MGH loading'} · patient ${room}/6 · [ / ] cycle · 1–7 speakers · 0 mute all`,22,753);
  texture.needsUpdate=true;
  tablet.lastDrawElapsed = elapsed;
  tablet.drawCount++;
}
