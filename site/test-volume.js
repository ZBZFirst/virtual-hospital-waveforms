const assert = require('node:assert/strict');
const {calculate} = require('./volume.js');
const near = (actual, expected, label, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const markers = (n) => [{kind:'BS',index:0},{kind:'BE',index:n}];

{
  const flow = Array(51).fill(30); // 30 L/min for 50 intervals at 50 Hz = 500 mL.
  const result = calculate(flow, markers(flow.length));
  near(result.volume[50], 500, 'constant flow');
  near(result.completed[0].vti, 500, 'constant VTi');
  near(result.completed[0].vte, 0, 'constant VTe');
  near(result.volume[25], 250, 'seek into middle of breath');
}
{
  const flow = [30,30,30,0,-30,-30,-30];
  const result = calculate(flow, markers(flow.length), null, 1);
  near(result.completed[0].vti, 1250, 'positive flow, including zero crossing');
  near(result.completed[0].vte, 1250, 'negative flow, including zero crossing');
  near(result.completed[0].difference, 0, 'balanced breath');
  near(result.volume[6], 0, 'end volume');
}
{
  const flow = [30,30,30,30];
  const result = calculate(flow, markers(flow.length), [0,.01,.03,.06]);
  near(result.volume[3], 30, 'variable sample intervals');
}
{
  const flow = [30,30,-20,-20,30,30];
  const result = calculate(flow,[{kind:'BS',index:0},{kind:'BE',index:4},{kind:'BS',index:4},{kind:'BE',index:6}],null,1);
  near(result.completed[0].difference, 250, 'difference is retained');
  near(result.volume[4], 0, 'reset at second breath');
  near(result.completed[1].vti, 500, 'second breath');
}
{
  const flow = [30,30,30,30];
  const result = calculate(flow,[{kind:'BS',index:0},{kind:'GAP',index:2},{kind:'BE',index:4}],null,1,[2]);
  assert.equal(result.completed.length,0,'damaged breath is not reported');
  assert.ok(Number.isNaN(result.volume[2]),'gap breaks volume');
  const incomplete = calculate(flow,[{kind:'BS',index:0}],null,1);
  assert.equal(incomplete.completed.length,0,'open breath is not reported');
  const badTime = calculate(flow,markers(flow.length),[0,.02,.02,.04]);
  assert.equal(badTime.completed.length,0,'nonmonotonic timestamps invalidate breath');
  const missingTime = calculate(flow,markers(flow.length),[0,.02,.22,.24]);
  assert.equal(missingTime.completed.length,0,'large timestamp gaps invalidate breath');
}
{
  const full = [0,80,40,0,0,-30,-60,-30,0];
  const downsampled = full.filter((_,i)=>i%2===0);
  const accurate = calculate(full,markers(full.length),null,50);
  const coarse = calculate(downsampled,markers(downsampled.length),null,25);
  near(accurate.completed[0].vti,40,'full resolution reference');
  assert.notEqual(accurate.completed[0].vti,coarse.completed[0].vti,
    'downsampled flow must not be substituted for full resolution');
}
console.log('volume integration tests passed');
