/* Fixed physical scales shared by atlas color and observational audio. */
const SignalMapping = (() => {
  const NEUTRAL = '#89939b';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const hex = (v) => `#${v.map(x => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  const mix = (a, b, t) => hex(a.map((x, i) => x + (b[i] - x) * t));
  function flowColor(flow, reverse = false) {
    if (!Number.isFinite(flow)) return NEUTRAL;
    const amount = clamp((Math.abs(flow) - .5) / 59.5, 0, 1);
    if (!amount) return NEUTRAL;
    const red = [230, 47, 54], blue = [42, 100, 225], gray = [137, 147, 155];
    return mix(gray, (flow > 0) !== reverse ? red : blue, amount);
  }
  function pressureColor(pressure) {
    if (!Number.isFinite(pressure)) return NEUTRAL;
    if (pressure <= 1) return '#BEF5BE';
    if (pressure <= 15) return mix([190, 245, 190], [0, 105, 32], (pressure - 1) / 14);
    if (pressure <= 50) return mix([0, 105, 32], [230, 30, 35], (pressure - 15) / 35);
    return '#E61E23';
  }
  function midi(flow, pressure) {
    if (!Number.isFinite(flow) || !Number.isFinite(pressure)) return null;
    const pitch = 60 + clamp(flow / 60, -1, 1) * 12;
    const cc74 = Math.round(clamp((pressure - 1) / 49, 0, 1) * 127);
    return { pitch, bend: clamp(flow / 60, -1, 1), cc74,
      frequency: 261.625565 * Math.pow(2, (pitch - 60) / 12),
      cutoff: 240 * Math.pow(6000 / 240, cc74 / 127) };
  }
  return {flowColor, pressureColor, midi, NEUTRAL};
})();
if (typeof module !== 'undefined') module.exports = SignalMapping;
