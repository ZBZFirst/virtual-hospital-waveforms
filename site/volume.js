/* Derived, breath-relative volume from full-resolution PB 840 flow samples. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CalculatedVolume = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ML_PER_L_PER_MINUTE_SECOND = 1000 / 60;

  // A straight line between samples crosses zero at this fraction of dt.
  function signedAreas(a, b, dt) {
    const factor = dt * ML_PER_L_PER_MINUTE_SECOND;
    if (a >= 0 && b >= 0) return [(a + b) * factor / 2, 0];
    if (a <= 0 && b <= 0) return [0, -(a + b) * factor / 2];
    const fraction = Math.abs(a) / (Math.abs(a) + Math.abs(b));
    if (a > 0) return [a * fraction * factor / 2, -b * (1 - fraction) * factor / 2];
    return [b * (1 - fraction) * factor / 2, -a * fraction * factor / 2];
  }

  function calculate(flow, markers, times = null, sampleRate = 50, gaps = []) {
    const volume = new Float64Array(flow.length);
    volume.fill(NaN);
    const segment = new Int32Array(flow.length);
    segment.fill(-1);
    const completed = [];
    const gapSet = new Set(gaps);
    let start = -1, broken = false, inspired = 0, expired = 0;
    let markerIndex = 0;
    for (let i = 0; i <= flow.length; i++) {
      while (markerIndex < markers.length && markers[markerIndex].index === i) {
        const marker = markers[markerIndex++];
        if (marker.kind === 'BS') {
          start = i; broken = false; inspired = 0; expired = 0;
          if (i < flow.length && Number.isFinite(flow[i])) {volume[i] = 0;segment[i] = i;}
          else broken = true;
        } else if (marker.kind === 'GAP' && start >= 0) {
          broken = true;
        } else if (marker.kind === 'BE' && start >= 0) {
          if (!broken && i > start + 1) {
            completed.push({start, end: i, vti: inspired, vte: expired,
              difference: inspired - expired});
          }
          start = -1;
        }
      }
      if (i === flow.length || start < 0 || i <= start) continue;
      const dt = times ? times[i] - times[i - 1] : 1 / sampleRate;
      if (gapSet.has(i) || !Number.isFinite(flow[i - 1]) || !Number.isFinite(flow[i]) ||
          !Number.isFinite(dt) || dt <= 0 || (times && dt > 0.1)) broken = true;
      if (broken) { volume[i] = NaN; continue; }
      const [positive, negative] = signedAreas(flow[i - 1], flow[i], dt);
      inspired += positive; expired += negative;
      volume[i] = volume[i - 1] + positive - negative;
      segment[i] = start;
    }
    return {volume, segment, completed};
  }
  return {calculate, signedAreas};
});
