'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function sourceOf(file, name) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\n}\n', start);
  assert(start >= 0 && end > start);
  return source.slice(start, end + 2);
}

const fills = [], labels = [], strokes = [];
const c = {
  fillRect(...args) { fills.push(args); },
  fillText(...args) { labels.push(args); },
  beginPath() {}, moveTo(...args) { strokes.push(['move', ...args]); },
  lineTo(...args) { strokes.push(['line', ...args]); }, stroke() {},
};
const screen = { sweepStep: 0, canvas: { getContext: () => c } };
const record = time => ({
  room: 1, recording: 'uc-001', external: true, sourceSeconds: time,
  pressure_cm_h2o: Array(750).fill(20), flow_l_min: Array(750).fill(5),
  volume_ml: Array(750).fill(400),
  pressureRange: [0, 50], flowRange: [-60, 60], volumeRange: [0, 800],
});
const context = vm.createContext({});
vm.runInContext(sourceOf('scene3d/parts/screens-and-tablet.js', 'drawVentScreen'), context);
const draw = time => context.drawVentScreen(screen.canvas, record(time), time, screen);
assert.equal(draw(5), true);
assert.equal(screen.sweepStep, 250);
const fullClears = () => fills.filter(([x, y, w, h]) => x === 0 && y === 0 && w === 640 && h === 400).length;
assert.equal(fullClears(), 1);
const rangeLabels = labels.filter(([value]) => /^(0 to 50|-60 to 60|0 to 800)$/.test(value)).length;
assert.equal(rangeLabels, 3);
assert.equal(draw(5.1), true);
assert.equal(screen.sweepStep, 255);
assert.equal(fullClears(), 1, 'incoming samples must not erase completed waveform');
assert.equal(draw(5.1), false, 'paused source must not advance sweep');
assert.equal(screen.sweepStep, 255);
assert.equal(draw(0.1), true, 'replay resets the sweep');
assert.equal(fullClears(), 2);
assert.equal(screen.sweepStep, 250);
assert(strokes.length > 0);

const previewContext = vm.createContext({ Number, Math, Float32Array });
vm.runInContext(sourceOf('page/frame-and-atlas-input.js', 'previewRanges'), previewContext);
const entry = { signalBins: 4, previewBytes: Uint8Array.from([127, 50, 148, 55, 148, 60, 127, 50]) };
const ranges = previewContext.previewRanges(entry);
assert.equal(previewContext.previewRanges(entry), ranges, 'recording scale is calculated only once');
assert.equal(entry.previewVolume.length, 4);
assert(entry.previewVolume[2] > entry.previewVolume[1], 'volume follows successive source samples');
assert(ranges.pressure[0] < 10 && ranges.pressure[1] > 12);
assert(ranges.volume[0] < entry.previewVolume[0] && ranges.volume[1] > entry.previewVolume[2]);
console.log('Ventilator wall screen advances samples with fixed scale and resets on replay');
