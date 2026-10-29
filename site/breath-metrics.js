/* Observational summaries of complete PB 840 flow/pressure breaths. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BreathMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function calculate(flow, pressure, breaths, times = null, sampleRate = 50) {
    return breaths.map(breath => {
      const {start, end} = breath;
      let peakIn = -Infinity, peakEx = Infinity, peakPressure = -Infinity;
      let positiveSeen = false, expirationStart = -1;
      let pressureArea = 0, duration = 0;
      for (let i = start; i < end; i++) {
        const q = flow[i], p = pressure[i];
        if (!Number.isFinite(q) || !Number.isFinite(p)) throw new Error('Invalid sample in completed breath');
        if (q > 0) {positiveSeen = true;peakIn = Math.max(peakIn, q);}
        if (q < 0 && positiveSeen) {peakEx = Math.min(peakEx, q);if (expirationStart < 0) expirationStart = i;}
        peakPressure = Math.max(peakPressure, p);
        if (i === start) continue;
        const dt = times ? times[i] - times[i - 1] : 1 / sampleRate;
        if (!Number.isFinite(dt) || dt <= 0 || (times && dt > 0.1)) throw new Error('Invalid time in completed breath');
        pressureArea += (pressure[i - 1] + p) * dt / 2;
        duration += dt;
      }
      let peep = null;
      if (expirationStart >= 0 && end - expirationStart >= 5) {
        let sum = 0;
        for (let i = end - 5; i < end; i++) sum += pressure[i];
        peep = sum / 5;
      }
      return {...breath,
        pifr: Number.isFinite(peakIn) ? peakIn : null,
        pefr: Number.isFinite(peakEx) ? -peakEx : null,
        peakPressure,
        peep,
        map: duration > 0 ? pressureArea / duration : null};
    });
  }
  return {calculate};
});
