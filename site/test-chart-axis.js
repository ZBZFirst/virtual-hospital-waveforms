const assert=require('node:assert/strict');
require('./chart-axis.js');
const axis=globalThis.WaveformAxis;
assert.deepEqual(axis.tickLabels(0,20),['20','15','10','5','0']);
assert.deepEqual(axis.tickLabels(0,2),['2','1.5','1','0.5','0'],'zoomed ranges retain decimal tick values');

const flow=axis.create(),pressure=axis.create();
const first=axis.observe(flow,-5,10);
assert.deepEqual(axis.observe(flow,-2,8),first,'scrolling past extrema keeps both bounds fixed');
const expanded=axis.observe(flow,-20,8);
assert.ok(expanded.min<first.min,'new low expands the lower bound');
assert.equal(expanded.max,first.max,'the other bound stays fixed');
assert.equal(pressure.min,Infinity,'each chart has independent bounds');

axis.observe(flow,-2,8);
const wider=flow.max-flow.min;
assert.equal(axis.zoomOut(flow),true);
assert.ok(flow.max-flow.min>wider,'zoom out expands the vertical range');
assert.equal(axis.zoomIn(flow),true);
assert.ok(flow.min<flow.visibleMin&&flow.max>flow.visibleMax,'zoom in keeps visible values in view');
assert.equal(axis.reset(flow),true);
assert.ok(flow.min<flow.visibleMin&&flow.max>flow.visibleMax,'reset fits the current window');
const resetBounds={min:flow.min,max:flow.max};
assert.deepEqual(axis.observe(flow,-1,7),resetBounds,'offscreen extremes do not return automatically');
assert.ok(axis.observe(flow,-19,7).min<resetBounds.min,'an extreme expands the range if it reenters view');

console.log('Chart axis locking and controls pass');
