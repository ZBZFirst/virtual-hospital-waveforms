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
  return { group, canvas, texture, drawCount: 0 };
}

function selectTabletRoom(room) {
  tabletRoom = ((room - 1 + 6) % 6) + 1;
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
  const room = tabletRoom, vital = floorRecords[activeFloor - 1]?.[room - 1];
  const assignment=roomAssignment(activeHospital,activeFloor,room);
  const vent = ventRecordForRoom(room);
  const chartX = 196, chartW = 803, rowH = 94;
  const stepRate = 100;
  const signature = `${assignment?.id}:${vital?.id || ''}:${Boolean(vital?.parts)}:${Boolean(vent)}`;
  if (tablet.signature !== signature || elapsed < tablet.sweepStart) {
    tablet.signature = signature;
    tablet.sweepStart = elapsed;
    tablet.lastStep = -1;
    tablet.lastPoints = Array(7).fill(null);
    tablet.ranges = [];
    c.fillStyle = '#07181e'; c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#d8eef0'; c.font = 'bold 27px system-ui';
    c.fillText(`${activeHospital}-F${String(activeFloor).padStart(2,'0')}-R${String(room).padStart(2,'0')}`, 22, 34);
    c.fillStyle = '#82aab2'; c.font = '16px system-ui';
    c.fillText(assignment?.telemetry_record?'VITAL SIGNS · complete MGH recording':assignment?.patient_id?'VITAL SIGNS · NO SOURCE':'VITAL SIGNS · UNASSIGNED', 22, 58);
    c.fillText(assignment?.uc_davis_recording?'VENTILATOR · UC Davis full source visual track':assignment?.patient_id?'VENTILATOR · NO SOURCE':'VENTILATOR · UNASSIGNED', 510, 58);
    for (let row = 0; row < 7; row++) {
      const y = 75 + row * rowH, channel = monitorChannels[monitorLayouts.unit[row]];
      const channelState=monitorChannelState(monitorLayouts.unit[row],{vital,vent,assignment},elapsed);
      const range=channelState.range;
      tablet.ranges.push(range);
      const color = channel.color;
      const label = `${channel.label}  ${channel.unit}`;
      c.fillStyle = row % 2 ? '#10252c' : '#0d2027'; c.fillRect(12, y, 1000, rowH - 3);
      c.strokeStyle = '#28505a'; c.lineWidth = 1;
      for (let tick = 0; tick < 5; tick++) {
        const x = chartX + tick * chartW / 4;
        c.beginPath(); c.moveTo(x, y + 4); c.lineTo(x, y + rowH - 8); c.stroke();
      }
      c.fillStyle = color; c.font = 'bold 20px system-ui'; c.fillText(label, 23, y + 32);
      c.fillStyle = '#89a9af'; c.font = '15px system-ui'; c.fillText(`${range[0].toFixed(0)} to ${range[1].toFixed(0)}`, 23, y + 58);
      const available=!channelState.status;
      if (!available) {
        c.fillStyle = '#79939b';
        c.fillText(channelState.status, chartX + 12, y + 52);
      }
    }
    c.fillStyle = '#96bbc2'; c.font = '15px system-ui';
    c.fillText(`${vital?.id?.toUpperCase() || 'MGH loading'} · patient ${room}/6 · [ / ] cycle · feeds loop independently`, 22, 753);
    texture.needsUpdate = true;
  }
  if (assignment?.telemetry_record && (!vital || !isCached(vital, elapsed))) return;
  const currentStep = Math.floor((elapsed - tablet.sweepStart) * stepRate);
  if (currentStep - tablet.lastStep > chartW) tablet.lastStep = currentStep - chartW;
  for (let step = tablet.lastStep + 1; step <= currentStep; step++) {
    const x = step % chartW, t = tablet.sweepStart + step / stepRate;
    for (let row = 0; row < 7; row++) {
      const y = 75 + row * rowH, channel = monitorChannels[monitorLayouts.unit[row]];
      const key = channel.key;
      const available = row < 4 ? Boolean(vital?.parts && vital.channels[key]) : Boolean(vent && Array.isArray(vent[key]));
      if (!available) continue;
      c.fillStyle = row % 2 ? '#10252c' : '#0d2027';
      c.fillRect(chartX + x, y + 4, 2, rowH - 12);
      if ([0, 1, 2, 3, 4].some(tick => Math.abs(x - Math.round(tick * chartW / 4)) < 2)) {
        c.strokeStyle = '#28505a'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(chartX + x, y + 4); c.lineTo(chartX + x, y + rowH - 8); c.stroke();
      }
      const span=monitorSampleSpan(monitorLayouts.unit[row],{vital,vent,assignment},t-1/stepRate,t,elapsed);
      if (!span) { tablet.lastPoints[row] = null; continue; }
      const [lo,hi]=span;
      const [min, max] = tablet.ranges[row];
      const plot = value => y + rowH - 12 - THREE.MathUtils.clamp((value - min) / (max - min || 1), 0, 1) * (rowH - 24);
      const py = plot((lo + hi) / 2);
      c.strokeStyle = channel.color;
      c.lineWidth = 2; c.beginPath();
      const previous = tablet.lastPoints[row];
      if (previous && previous.step === step - 1 && x > 0) c.moveTo(chartX + x - 1, previous.py);
      else c.moveTo(chartX + x, py);
      c.lineTo(chartX + x, py);
      if (lo !== hi) { c.moveTo(chartX + x, plot(lo)); c.lineTo(chartX + x, plot(hi)); }
      c.stroke();
      tablet.lastPoints[row] = { step, py };
    }
  }
  if (currentStep > tablet.lastStep) texture.needsUpdate = true;
  tablet.lastStep = currentStep;
  tablet.lastDrawElapsed = elapsed;
  tablet.drawCount++;
}
