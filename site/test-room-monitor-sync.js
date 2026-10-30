const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function functionSource(file, name) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1);
  return source.slice(start, end + 2);
}

const ventDraws = [];
const ventScreens = Array.from({ length: 6 }, () => ({ canvas: {}, texture: {}, worldBox: {} }));
const ventContext = vm.createContext({
  hospitalView: false, expandedHospital: false, activeFloor: 1,
  ventRecords: [], floors: [{ ventScreens }],
  frustum: { intersectsBox: () => true },
  ventRecordForRoom: room => room === 3 ? { room } : null,
  drawVentScreen: (_canvas, record) => ventDraws.push(record.room),
});
vm.runInContext(functionSource('scene3d/parts/screens-and-tablet.js', 'drawVentilatorsFrame'), ventContext);
vm.runInContext('drawVentilatorsFrame(5, frustum)', ventContext);
assert.deepEqual(ventDraws, [3], 'UC Davis room screen should draw without legacy excerpt records');
assert.equal(ventScreens[2].texture.needsUpdate, true);

const telemetryDraws = [];
let cacheRequests = 0;
const telemetryScreens = Array.from({ length: 6 }, () => ({
  canvas: { width: 512, height: 320 }, texture: {}, worldBox: {}, center: {},
}));
const ready = { id: 'mgh001', ready: true, windows: new Int32Array(2), samples: 100 };
const stale = { id: 'mgh002', ready: false, windows: new Int32Array(2), samples: 100 };
const telemetryContext = vm.createContext({
  hospitalView: false, expandedHospital: false, activeFloor: 1, activeRoom: 1,
  telemetryReady: [true], floorRecords: [[ready, stale, null, null, null, null]],
  floors: [{ screens: telemetryScreens }],
  camera: { position: { distanceTo: () => 1 } },
  frustum: { intersectsBox: () => true },
  isCached: record => record.ready,
  ensureTelemetryCaches: () => { cacheRequests++; },
  recordClock: () => 10,
  drawMonitor: (_canvas, room) => telemetryDraws.push(room),
  lastTelemetryPaint: 0, playbackStart: 0,
});
vm.runInContext(functionSource('scene3d/parts/telemetry.js', 'drawTelemetryFrame'), telemetryContext);
vm.runInContext('drawTelemetryFrame(1000, 5, frustum)', telemetryContext);
assert.deepEqual(telemetryDraws, [1], 'ready telemetry screen should draw while another room is uncached');
assert.equal(cacheRequests, 1);
assert.equal(telemetryScreens[0].texture.needsUpdate, true);
assert.notEqual(telemetryScreens[1].texture.needsUpdate, true);
console.log('Room screens draw available sources independently');
