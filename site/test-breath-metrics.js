const assert = require('node:assert/strict');
const {calculate} = require('./breath-metrics.js');
const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} vs ${expected}`);

{
  const flow = [0, 20, 40, 0, -20, -60, -30, -10, -5, -2];
  const pressure = [5, 10, 20, 25, 15, 8, 7, 6, 5, 5];
  const [breath] = calculate(flow, pressure, [{start:0,end:10}], null, 1);
  near(breath.pifr, 40, 'peak inspiratory flow');
  near(breath.pefr, 60, 'peak expiratory flow magnitude');
  near(breath.peakPressure, 25, 'whole-breath peak pressure');
  near(breath.peep, 6.2, 'last five expiratory pressure samples');
  near(breath.map, 101 / 9, 'time-weighted whole-breath pressure');
}
{
  const [breath] = calculate([30, 20, -20, -10, -5, -2, -1],
    [5, 15, 15, 10, 8, 6, 5], [{start:0,end:7}], [0,.01,.03,.06,.10,.15,.21]);
  near(breath.map, 1.815 / .21, 'irregular interval time weighting');
  near(breath.peep, 8.8, 'expiratory final samples');
}
{
  const [breath] = calculate([1, 2, 3, 4, 5, 6], [5, 10, 15, 20, 25, 30], [{start:0,end:6}]);
  assert.equal(breath.pefr, null, 'no expiratory flow');
  assert.equal(breath.peep, null, 'no expiratory phase');
}
{
  const [breath] = calculate([20, -20, -10, -5, -2, 1], [10, 9, 8, 7, 6, 5], [{start:0,end:6}]);
  near(breath.peep, 7, 'final pressure estimate remains available with trigger flow');
}
console.log('breath metrics tests passed');
