'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'scene3d/parts/screens-and-tablet.js'), 'utf8');
const fills = [], layouts = [], audioControls = [];
const context2d = {
  fillRect(...args) { fills.push(args); },
  fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
};
const tablet = {
  group: { visible: true },
  canvas: { width: 1024, height: 768, getContext: () => context2d },
  texture: { needsUpdate: false }, drawCount: 0,
};
const records = [{id:'mgh001'}, {id:'mgh002'}];
const vents = [{recording:'vent001'}, {recording:'vent002'}];
const rooms = [{ id: 'A-F01-R01', patient_id: 'SIM-A-F01-R01', telemetry_record: 'mgh001' },
  { id: 'A-F01-R02', patient_id: 'SIM-A-F01-R02', telemetry_record: 'mgh001' }];
const context = {
  tablet, tabletRoom: 1, activeHospital: 'A', activeFloor: 1,
  floorRecords: [records],
  roomAssignment: (_hospital, _floor, room) => rooms[room - 1],
  ventRecordForRoom: room => vents[room-1],
  drawMonitorLayout: (_canvas, layout, sources, elapsed, area) => layouts.push({layout,sources,elapsed,area}),
  drawTabletAudioControls: (_canvas, sources) => audioControls.push(sources),
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function drawTablet(')), context);
const fullClears = () => fills.filter(([x, y, width, height]) => x === 0 && y === 0 && width === 1024 && height === 768).length;

context.drawTablet(0);
assert.equal(fullClears(), 1);
context.drawTablet(0.25);
assert.equal(fullClears(), 2, 'the tablet redraws the shared live monitor window');
assert.equal(layouts[1].layout,'unit');
assert.equal(layouts[1].sources.vital,records[0]);
assert.equal(layouts[1].sources.vent,vents[0], 'tablet and room monitor use the same ventilator record');
assert.equal(layouts[1].elapsed,0.25);
assert.equal(layouts[1].area.width,1000);
assert.equal(audioControls[1].vent,vents[0]);
context.drawTablet(8.25);
assert.equal(fullClears(), 3);
context.tabletRoom = 2;
context.drawTablet(8.5);
assert.equal(layouts[3].sources.vital,records[1]);
assert.equal(layouts[3].sources.vent,vents[1]);
assert.equal(layouts[3].sources.assignment,rooms[1]);
console.log('Tablet redraws the shared seven-channel monitor layout from the selected room sources');
