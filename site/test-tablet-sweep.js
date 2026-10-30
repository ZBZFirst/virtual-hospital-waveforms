'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'scene3d/parts/screens-and-tablet.js'), 'utf8');
const fills = [];
const context2d = {
  fillRect(...args) { fills.push(args); },
  fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
};
const tablet = {
  group: { visible: true },
  canvas: { width: 1024, height: 768, getContext: () => context2d },
  texture: { needsUpdate: false }, drawCount: 0,
};
const channels = ['ecg ii', 'art', 'cvp', 'pap'].map(key => ({ key, label: key, unit: 'mV', min: -2, max: 2, color: '#fff' }));
const record = {
  id: 'mgh001', parts: {}, samples: 10000, fs: 100, count: 4,
  channels: Object.fromEntries(channels.map((channel, index) => [channel.key, { index, baseline: 0, gain: 100 }])),
};
const rooms = [{ id: 'A-F01-R01', patient_id: 'SIM-A-F01-R01', telemetry_record: 'mgh001' },
  { id: 'A-F01-R02', patient_id: 'SIM-A-F01-R02', telemetry_record: 'mgh001' }];
const context = {
  tablet, tabletRoom: 1, activeHospital: 'A', activeFloor: 1,
  floorRecords: [[record, record]], channels,
  roomAssignment: (_hospital, _floor, room) => rooms[room - 1],
  ventRecordForRoom: () => null,
  isCached: () => true,
  recordClock: (item, elapsed) => Math.floor(elapsed * item.fs),
  decodeWindowSample: sample => 100 + 40 * Math.sin(sample / 10),
  THREE: { MathUtils: { clamp: (value, low, high) => Math.max(low, Math.min(high, value)) } },
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function drawTablet(')), context);
const fullClears = () => fills.filter(([x, y, width, height]) => x === 0 && y === 0 && width === 1024 && height === 768).length;

context.drawTablet(0);
assert.equal(fullClears(), 1);
context.drawTablet(0.25);
assert.equal(tablet.lastStep, 25);
assert.equal(fullClears(), 1, 'completed columns must remain on the canvas');
record.parts = { next: true };
context.drawTablet(8.25);
assert.equal(fullClears(), 1, 'cache renewal and sweep wrap must not clear the trace');
context.tabletRoom = 2;
context.drawTablet(8.5);
assert.equal(fullClears(), 2, 'a different room starts a fresh trace');
console.log('Tablet sweep preserves completed trace columns');
