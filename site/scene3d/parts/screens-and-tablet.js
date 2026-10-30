function makeScreen(room) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false, depthTest: true, depthWrite: true });
  drawMonitor(canvas, room, null, 0);
  return { canvas, texture, material };
}

function makeVentScreen() {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 400;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false, depthTest: true, depthWrite: true });
  return { canvas, texture, material };
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
  const c = canvas.getContext('2d');
  const reset = !screen || !record.external || screen.sweepRecording !== record.recording ||
    screen.sweepRate !== record.sourceRate ||
    !Number.isFinite(screen.lastSourceSeconds) || record.sourceSeconds < screen.lastSourceSeconds ||
    record.sourceSeconds - screen.lastSourceSeconds > 5;
  if (reset) { c.fillStyle = '#07181e'; c.fillRect(0, 0, 640, 400); }
  if (!reset && record.sourceSeconds <= screen.lastSourceSeconds) return false;
  if (reset) {
  c.fillStyle = '#cce4e7'; c.font = 'bold 19px system-ui';
  c.fillText(`VENTILATOR · ROOM ${String(record.room).padStart(2, '0')}`, 18, 28);
  c.fillStyle = '#7fa5aa'; c.font = '12px system-ui';
  c.fillText(record.external?`UC Davis ${record.sourceRate} Hz source track`:
    'Recorded pressure + flow · calculated volume · 10 s loop', 18, 46);
  }
  const rows = [
    ['pressure_cm_h2o', 'P cmH₂O', '#f0a256', record.pressureRange],
    ['flow_l_min', 'Flow L/min', '#79e1a0', record.flowRange],
    ['volume_ml', 'V calc mL', '#65d3e1', record.volumeRange],
  ];
  const start = record.external?0:Math.min(499, Math.floor((elapsed % 10) * 50));
  const count = record.external && !reset
    ? Math.min(250, Math.max(1, Math.round((record.sourceSeconds - screen.lastSourceSeconds) * 50))) : 250;
  const first = record.external ? 250 - count : 0;
  const plotLeft = 132, plotWidth = 490, plotSamples = 250;
  if (reset && screen) {
    screen.sweepStep = 0;
    screen.sweepPoints = Array(3).fill(null);
    screen.sweepRecording = record.recording;
    screen.sweepRate = record.sourceRate;
  }
  for (let j = 0; j < 3; j++) {
    const [key, label, color, range] = rows[j];
    const y = 65 + j * 107;
    if (reset) {
      c.fillStyle = j % 2 ? '#0d232a' : '#0b1e25'; c.fillRect(9, y, 622, 103);
      c.fillStyle = color; c.font = 'bold 17px system-ui'; c.fillText(label, 18, y + 26);
      c.fillStyle = '#88aab0'; c.font = '12px system-ui';
      c.fillText(`${range[0].toFixed(0)} to ${range[1].toFixed(0)}`, 18, y + 46);
      c.strokeStyle = '#24464d'; c.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const x = plotLeft + k * 98;
        c.beginPath(); c.moveTo(x, y + 5); c.lineTo(x, y + 98); c.stroke();
      }
    }
    const values = record[key];
    if (!Array.isArray(values)) {
      c.fillStyle = '#8da8ad'; c.fillText('NO SOURCE', 144, y + 55);
      continue;
    }
    c.strokeStyle = color; c.lineWidth = 2;
    let plotted = 0, previous = screen?.sweepPoints?.[j] || null;
    for (let i = first; i < 250; i++) {
      const step = (screen?.sweepStep || 0) + i - first;
      const column = step % plotSamples;
      const x = plotLeft + column * plotWidth / (plotSamples - 1);
      if (record.external) {
        c.fillStyle = j % 2 ? '#0d232a' : '#0b1e25';
        c.fillRect(x - 1, y + 5, 3, 93);
        if (column % 50 === 0) {
          c.strokeStyle = '#24464d'; c.lineWidth = 1; c.beginPath();
          c.moveTo(x, y + 5); c.lineTo(x, y + 98); c.stroke();
          c.strokeStyle = color; c.lineWidth = 2;
        }
      }
      const value = values[start + i];
      if (!Number.isFinite(value)) { previous = null; continue; }
      const plotY = y + 93 - Math.max(0,Math.min(1,(value - range[0]) / (range[1] - range[0] || 1))) * 83;
      c.beginPath();
      if (previous && column > 0 && previous.step === step - 1) c.moveTo(previous.x, previous.y);
      else c.moveTo(x, plotY);
      c.lineTo(x, plotY); c.stroke();
      previous = {step,x,y:plotY}; plotted++;
    }
    if (screen) screen.sweepPoints[j] = previous;
    if (!plotted && reset) { c.fillStyle = '#8da8ad'; c.fillText('NO SAMPLES', 144, y + 55); }
  }
  if (screen && record.external) {
    screen.sweepStep += count;
    screen.lastSourceSeconds = record.sourceSeconds;
  }
  return true;
}

function drawVentilatorsFrame(elapsed, frustum) {
  if(hospitalView || expandedHospital)return;
  if (!floors[activeFloor - 1]) return;
  const screens = floors[activeFloor - 1].ventScreens;
  screens.forEach((screen, i) => {
    if (!frustum.intersectsBox(screen.worldBox)) return;
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
      const y = 75 + row * rowH, channel = channels[row];
      const range = row < 4
        ? (vital?.chartRanges?.[channel.key.toLowerCase()] || [channel.min, channel.max])
        : (vent ? [vent.pressureRange, vent.flowRange, vent.volumeRange][row - 4] : [0, 1]);
      tablet.ranges.push(range);
      const color = row < 4 ? channel.color : ['#f0a256', '#79e1a0', '#65d3e1'][row - 4];
      const label = row < 4 ? `${channel.label}  ${channel.unit}` : ['P  cmH₂O', 'Flow  L/min', 'V  calc mL'][row - 4];
      c.fillStyle = row % 2 ? '#10252c' : '#0d2027'; c.fillRect(12, y, 1000, rowH - 3);
      c.strokeStyle = '#28505a'; c.lineWidth = 1;
      for (let tick = 0; tick < 5; tick++) {
        const x = chartX + tick * chartW / 4;
        c.beginPath(); c.moveTo(x, y + 4); c.lineTo(x, y + rowH - 8); c.stroke();
      }
      c.fillStyle = color; c.font = 'bold 20px system-ui'; c.fillText(label, 23, y + 32);
      c.fillStyle = '#89a9af'; c.font = '15px system-ui'; c.fillText(`${range[0].toFixed(0)} to ${range[1].toFixed(0)}`, 23, y + 58);
      const available = row < 4 ? Boolean(vital?.parts && vital.channels[channel.key.toLowerCase()])
        : Boolean(vent && Array.isArray(vent[['pressure_cm_h2o', 'flow_l_min', 'volume_ml'][row - 4]]));
      if (!available) {
        c.fillStyle = '#79939b';
        const message = row < 4
          ? (!assignment?.telemetry_record ? assignment?.patient_id?'NO SOURCE':'UNASSIGNED' : vital?.parts?'No source channel':'Loading source waveform…')
          : (assignment?.uc_davis_recording?'LOADING':assignment?.patient_id?'NO SOURCE':'UNASSIGNED');
        c.fillText(message, chartX + 12, y + 52);
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
      const y = 75 + row * rowH, channel = channels[row];
      const key = row < 4 ? channel.key.toLowerCase() : ['pressure_cm_h2o', 'flow_l_min', 'volume_ml'][row - 4];
      const available = row < 4 ? Boolean(vital?.parts && vital.channels[key]) : Boolean(vent && Array.isArray(vent[key]));
      if (!available) continue;
      c.fillStyle = row % 2 ? '#10252c' : '#0d2027';
      c.fillRect(chartX + x, y + 4, 2, rowH - 12);
      if ([0, 1, 2, 3, 4].some(tick => Math.abs(x - Math.round(tick * chartW / 4)) < 2)) {
        c.strokeStyle = '#28505a'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(chartX + x, y + 4); c.lineTo(chartX + x, y + rowH - 8); c.stroke();
      }
      let lo = Infinity, hi = -Infinity;
      if (row < 4) {
        const info = vital.channels[key];
        const from = recordClock(vital, t - 1 / stepRate), to = recordClock(vital, t);
        for (let clock = from; clock <= to; clock++) {
          const sample = ((clock % vital.samples) + vital.samples) % vital.samples;
          const digital = decodeWindowSample(sample, info.index, vital.count, vital.parts);
          if (digital === null) continue;
          const value = (digital - info.baseline) / info.gain;
          lo = Math.min(lo, value); hi = Math.max(hi, value);
        }
      } else {
        const index = vent.external
          ? Math.max(0, Math.min(249, Math.floor(249 - (elapsed - t) * 50)))
          : Math.min(499, Math.floor((t % 10) * 50));
        lo = hi = vent[key][index];
      }
      if (!Number.isFinite(lo)) { tablet.lastPoints[row] = null; continue; }
      const [min, max] = tablet.ranges[row];
      const plot = value => y + rowH - 12 - THREE.MathUtils.clamp((value - min) / (max - min || 1), 0, 1) * (rowH - 24);
      const py = plot((lo + hi) / 2);
      c.strokeStyle = row < 4 ? channel.color : ['#f0a256', '#79e1a0', '#65d3e1'][row - 4];
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
