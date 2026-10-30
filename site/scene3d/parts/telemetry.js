function parseHeader(id, header) {
  const lines = header.split(/\r?\n/);
  const fields = lines[0].trim().split(/\s+/);
  const count = Number(fields[1]), fs = Number(fields[2].split('/')[0]);
  const channels = {};
  for (let i = 0; i < count; i++) {
    const f = lines[i + 1].trim().split(/\s+/);
    if (f[1] !== '212') throw Error(`${id}: expected WFDB format 212`);
    const gainField = f[2].match(/^([\d.]+)(?:\((-?\d+)\))?/);
    channels[f.slice(8).join(' ').toLowerCase()] = {
      index: i, gain: Number(gainField[1]), baseline: gainField[2] === undefined ? Number(f[4]) : Number(gainField[2]),
    };
  }
  return { id, count, fs, samples: Number(fields[3]), duration: Number(fields[3]) / fs, channels,
    startSeconds: telemetryStartSeconds[id] || 0,
    windows: new Int32Array(Math.round(fs * 8)), parts: null, cacheFromClock: -Infinity, cacheToClock: -Infinity, loading: null };
}

async function getRecord(id) {
  if (recordings.has(id)) return recordings.get(id);
  const promise = fetch(`${telemetryBase}${id}.hea`)
    .then(r => { if (!r.ok) throw Error(`${id} header HTTP ${r.status}`); return r.text(); })
    .then(text => parseHeader(id, text));
  recordings.set(id, promise);
  return promise;
}

async function getBytes(id, first, last, count) {
  const start = Math.floor(first * count / 2) * 3;
  const end = Math.floor((last * count - 1) / 2) * 3 + 2;
  const response = await fetch(`${telemetryBase}${id}.dat`, { headers: { Range: `bytes=${start}-${end}` } });
  if (response.status !== 206) throw Error(`${id} byte range failed (HTTP ${response.status}); use serve.py`);
  return { first, last, start, bytes: new Uint8Array(await response.arrayBuffer()) };
}

function decodeWindowSample(sample, channel, count, parts) {
  const part = sample >= parts[0].first && sample < parts[0].last ? parts[0] : parts[1];
  if (!part) return null;
  const linear = sample * count + channel;
  const offset = Math.floor(linear / 2) * 3 - part.start;
  const bytes = part.bytes;
  if (offset < 0 || offset + 2 >= bytes.length) return null;
  let digital = linear % 2 ? bytes[offset + 2] + ((bytes[offset + 1] >> 4) << 8)
                           : bytes[offset] + ((bytes[offset + 1] & 15) << 8);
  if (digital >= 2048) digital -= 4096;
  return digital === -2048 ? null : digital;
}

function isCached(record, elapsed, leadSeconds = 0) {
  const clock = recordClock(record, elapsed);
  return Boolean(record.parts) && clock - record.windows.length >= record.cacheFromClock
    && clock + Math.floor(leadSeconds * record.fs) < record.cacheToClock;
}

async function fillRecordCache(record, elapsed) {
  if (isCached(record, elapsed, 6)) return;
  if (record.loading) return record.loading;
  const current = recordClock(record, elapsed);
  const fromClock = current - record.windows.length;
  const toClock = current + Math.round(record.fs * 16);
  const mod = n => ((n % record.samples) + record.samples) % record.samples;
  const first = mod(fromClock), last = mod(toClock);
  record.loading = (async () => {
    const requests = first < last
      ? [getBytes(record.id, first, last, record.count)]
      : [getBytes(record.id, first, record.samples, record.count), ...(last ? [getBytes(record.id, 0, last, record.count)] : [])];
    const parts = await Promise.all(requests);
    record.parts = parts;
    record.cacheFromClock = fromClock;
    record.cacheToClock = toClock;
    const ranges = {};
    for (const channel of channels.slice(1)) {
      const info = record.channels[channel.key.toLowerCase()];
      if (!info) continue;
      let lo = Infinity, hi = -Infinity;
      for (let clock = fromClock; clock < toClock; clock += 4) {
        const sample = mod(clock);
        const digital = decodeWindowSample(sample, info.index, record.count, parts);
        if (digital === null) continue;
        const value = (digital - info.baseline) / info.gain;
        lo = Math.min(lo, value); hi = Math.max(hi, value);
      }
      if (Number.isFinite(lo)) {
        const center = (lo + hi) / 2;
        const half = Math.max((hi - lo) * 0.58, channel.key === 'ART' ? 15 : 6);
        ranges[channel.key.toLowerCase()] = [center - half, center + half];
      }
    }
    // Keep a recording's display scale steady when the byte-range cache advances.
    record.chartRanges ||= ranges;
  })();
  try { await record.loading; } finally { record.loading = null; }
}

async function ensureTelemetryCaches(floor = activeFloor) {
  const state=hospitalStates.get(activeHospital),key=`${activeHospital}:${floor}`;
  if (telemetryBusy.has(key) || !state?.floors.length) return;
  telemetryBusy.add(key);
  const elapsed = exportElapsedSeconds ?? (performance.now() - playbackStart) / 1000;
  try {
    const entries = campusManifest.rooms.filter(e => e.hospital_id===activeHospital && e.floor === floor).sort((a, b) => a.room - b.room);
    const records = await Promise.all(entries.map(e => e.telemetry_record?getRecord(e.telemetry_record):null));
    await Promise.all(records.filter(Boolean).map(r => fillRecordCache(r, elapsed)));
    state.floorRecords[floor - 1] = records;
    state.telemetryReady[floor - 1] = true;
  } catch (err) { showError(String(err)); }
  telemetryBusy.delete(key);
}

function drawTelemetryFrame(now, elapsed, frustum) {
  if(hospitalView || expandedHospital)return;
  if (!floors[activeFloor - 1]) return;
  if (!telemetryReady[activeFloor - 1]) return;
  const floor = activeFloor;
  const records = floorRecords[floor - 1];
  if (!records) {
    ensureTelemetryCaches();
    return;
  }
  if (records.some(record => record && !isCached(record, elapsed))) ensureTelemetryCaches();
  if(!records.some(Boolean))return;
  const screens = floors[floor - 1].screens;
  const nearest = Math.min(...screens.map(s => camera.position.distanceTo(s.center)));
  const visible = [];
  for (let i = 0; i < 6; i++) {
    const screen = screens[i];
    if (frustum.intersectsBox(screen.worldBox) && (nearest >= 6 || camera.position.distanceTo(screen.center) < 10)) visible.push(i);
  }
  // Screens visible in the same camera view receive the same timestamp. A
  // hidden screen catches up on its next visible frame.
  for (const i of visible) {
    const record = records[i];
    if(!record || !isCached(record, elapsed))continue;
    const start = recordClock(record, elapsed) - record.windows.length;
    for (let j = 0; j < record.windows.length; j++) {
      record.windows[j] = ((start + j) % record.samples + record.samples) % record.samples;
    }
    const screen = screens[i];
    const width = nearest >= 6 ? 256 : 512;
    if (screen.canvas.width !== width) {
      screen.canvas.width = width;
      screen.canvas.height = width * 5 / 8;
    }
    drawMonitor(screen.canvas, i + 1, record, elapsed);
    screen.texture.needsUpdate = true;
    screen.lastDrawElapsed = elapsed;
    screen.drawCount = (screen.drawCount || 0) + 1;
  }
  if (!activeRoom && Math.floor(elapsed) !== Math.floor((lastTelemetryPaint - playbackStart) / 1000)) {
    status.textContent = `Hospital ${activeHospital} · Floor ${floor} · 6 rooms · recordings · ${Math.floor(elapsed)} s`;
  }
  lastTelemetryPaint = now;
}
