function rigChestCover(patient, room) {
  let cover = null;
  patient.traverse(o => { if (o.isMesh && o.name.toLowerCase().includes('blanket')) cover = o; });
  if (!cover) return null;
  // The imported blanket is a static settled cloth. Give its anterior chest
  // area one small morph target, leaving the sides and waist on the bed.
  cover.geometry = cover.geometry.clone();
  const geometry = cover.geometry;
  const position = geometry.getAttribute('position');
  const target = new Float32Array(position.count * 3);
  const smooth = (edge0, edge1, value) => {
    const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const across = 1 - smooth(0.18, 0.39, Math.abs(x));
    const along = smooth(-0.55, -0.35, z) * (1 - smooth(-0.12, 0.05, z));
    const surface = smooth(0.32, 0.50, y);
    const lift = 0.032 * across * along * surface;
    target[3 * i] = x;
    target[3 * i + 1] = y + lift;
    target[3 * i + 2] = z;
  }
  geometry.morphTargetsRelative = false;
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(target, 3)];
  cover.updateMorphTargets();
  const item = { mesh: cover, room };
  breathers.push(item);
  return item;
}

function setPatientAirwayVisible(patient, connected) {
  patient.traverse(object => {
    if (/(?:^|[^A-Za-z0-9])(?:ETT|SACETT)(?:$|[^A-Za-z0-9])/i.test(object.name))
      object.visible = connected;
  });
}

function ensureHighPatient() {
  if (highModel || highLoading) return;
  highLoading = modelLoader.loadAsync(modelUrl('patient_lods/patient_001_lod0.glb')).then(gltf => {
    highModel = gltf.scene;
    highModel.visible = false;
    highModel.traverse(o => {
      if (o.isMesh && o.morphTargetInfluences?.length && o.name.includes('skin')) {
        const item = { mesh: o, room: 1 };
        highBreathers.push(item); breathers.push(item);
      }
    });
    const cover = rigChestCover(highModel, 1);
    if (cover) highBreathers.push(cover);
    highLoading = null;
    updateLODs();
  }).catch(err => { highLoading = null; showError(`Close-up patient load failed: ${err}`); });
}

function updateLODs() {
  if(expandedHospital)return;
  if (!floors[activeFloor - 1]) return;
  const floor = floors[activeFloor - 1];
  const distances = floor.patients.map(patient => patient ? camera.position.distanceTo(patient.getWorldPosition(new THREE.Vector3())) : Infinity);
  let nearest = distances.indexOf(Math.min(...distances));
  const closeRoom = distances[nearest] < 1.65 ? nearest : -1;
  if (closeRoom >= 0 && !highModel) ensureHighPatient();
  if (highModel) highModel.visible = false;
  for (let i = 0; i < 6; i++) {
    if(!floor.patients[i])continue;
    const high = i === closeRoom && Boolean(highModel);
    const low = !high && distances[i] > 7.5;
    floor.patients[i].visible = !high && !low;
    floor.proxies[i].visible = low;
    if (high) {
      floor.bedRigs[i].add(highModel);
      setPatientAirwayVisible(highModel, Boolean(roomAssignment(activeHospital, activeFloor, i + 1)?.uc_davis_recording));
      highModel.visible = true;
      highBreathers.forEach(item => { item.room = i + 1; });
    }
  }
}

function addPlanarUV(mesh) {
  const geometry = mesh.geometry;
  if (geometry.getAttribute('uv')) return;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const horizontal = size.x > size.z ? 'x' : 'z';
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[2 * i] = (position.getX(i) - box.min.x) / (size.x || 1);
    if (horizontal === 'z') uv[2 * i] = (position.getZ(i) - box.min.z) / (size.z || 1);
    uv[2 * i + 1] = (position.getY(i) - box.min.y) / (size.y || 1);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function drawMonitor(canvas, room, record, elapsed) {
  const c = canvas.getContext('2d');
  c.setTransform(canvas.width / 800, 0, 0, canvas.height / 480, 0, 0);
  const w = 800, h = 480;
  c.fillStyle = '#08191f'; c.fillRect(0, 0, w, h);
  c.font = 'bold 25px system-ui'; c.fillStyle = '#cce2e5';
  c.fillText(`ROOM ${String(room).padStart(2, '0')}  •  ${record?.id?.toUpperCase() || 'LOADING'}`, 24, 37);
  c.font = '17px system-ui'; c.fillStyle = '#789ba5';
  c.fillText(record ? `${Math.floor((elapsed + record.startSeconds) % record.duration)} s / ${Math.floor(record.duration)} s · full recording loops` : 'Loading source waveform…', 24, 64);
  const plotX = 150, plotW = 630, rowH = 97;
  for (let j = 0; j < channels.length; j++) {
    const ch = channels[j], y = 83 + j * rowH;
    c.fillStyle = j % 2 ? '#10242a' : '#0d2026'; c.fillRect(12, y, 776, rowH - 3);
    c.strokeStyle = '#28505a'; c.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      const gx = plotX + k * plotW / 4;
      c.beginPath(); c.moveTo(gx, y); c.lineTo(gx, y + rowH - 3); c.stroke();
    }
    c.fillStyle = ch.color; c.font = 'bold 20px system-ui'; c.fillText(ch.label, 22, y + 34);
    c.fillStyle = '#90adb4'; c.font = '15px system-ui'; c.fillText(ch.unit, 23, y + 58);
    if (!record?.windows || !record.channels[ch.key.toLowerCase()]) {
      c.fillStyle = '#5e7880'; c.fillText(record ? 'No source channel' : '…', plotX + 9, y + 68);
      continue;
    }
    const samples = record.windows, info = record.channels[ch.key.toLowerCase()];
    const [chartMin, chartMax] = record.chartRanges?.[ch.key.toLowerCase()] || [ch.min, ch.max];
    if (j > 0) {
      c.fillStyle = '#91aeb6'; c.font = '13px system-ui';
      c.fillText(`${chartMin.toFixed(0)} to ${chartMax.toFixed(0)}`, 22, y + 84);
    }
    c.strokeStyle = ch.color; c.lineWidth = 2.2; c.beginPath();
    let started = false, plotted = 0;
    for (let x = 0; x < plotW; x++) {
      const a = Math.floor(x * samples.length / plotW);
      const b = Math.min(samples.length, Math.floor((x + 1) * samples.length / plotW));
      let lo = Infinity, hi = -Infinity;
      for (let s = a; s < b; s++) {
        const v = decodeWindowSample(samples[s], info.index, record.count, record.parts);
        if (v === null) continue;
        const physical = (v - info.baseline) / info.gain;
        lo = Math.min(lo, physical); hi = Math.max(hi, physical);
      }
      if (!Number.isFinite(lo)) { started = false; continue; }
      const py = y + rowH - 12 - (Math.max(chartMin, Math.min(chartMax, (lo + hi) / 2)) - chartMin) / (chartMax - chartMin) * (rowH - 25);
      if (!started) { c.moveTo(plotX + x, py); started = true; }
      else c.lineTo(plotX + x, py);
      plotted++;
    }
    if (!plotted) {
      c.fillStyle = '#5e7880'; c.fillText('NO SAMPLES', plotX + 9, y + 68);
      continue;
    }
    c.stroke();
    c.globalAlpha = 0.42; c.lineWidth = 1;
    for (let x = 0; x < plotW; x++) {
      const a = Math.floor(x * samples.length / plotW);
      const b = Math.min(samples.length, Math.floor((x + 1) * samples.length / plotW));
      let lo = Infinity, hi = -Infinity;
      for (let s = a; s < b; s++) {
        const v = decodeWindowSample(samples[s], info.index, record.count, record.parts);
        if (v === null) continue;
        const physical = (v - info.baseline) / info.gain;
        lo = Math.min(lo, physical); hi = Math.max(hi, physical);
      }
      if (Number.isFinite(lo)) {
        const y1 = y + rowH - 12 - (Math.max(chartMin, Math.min(chartMax, hi)) - chartMin) / (chartMax - chartMin) * (rowH - 25);
        const y2 = y + rowH - 12 - (Math.max(chartMin, Math.min(chartMax, lo)) - chartMin) / (chartMax - chartMin) * (rowH - 25);
        c.beginPath(); c.moveTo(plotX + x, y1); c.lineTo(plotX + x, y2); c.stroke();
      }
    }
    c.globalAlpha = 1;
  }
}
