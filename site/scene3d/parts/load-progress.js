// Model byte sizes are generated with the release, so the bar includes assets
// that have not emitted their first network progress event yet.
const modelTransfers = new Map();
const modelLoading = document.querySelector('#modelLoading');
const modelLoadingTitle = document.querySelector('#modelLoadingTitle');
const modelLoadingBar = document.querySelector('#modelLoadingBar');
const modelLoadingAmount = document.querySelector('#modelLoadingAmount');
const modelLoadingPhase = document.querySelector('#modelLoadingPhase');
let activeModelLoad = null;
let modelLoadSerial = 0;
const formatModelBytes = value => `${(value / 1048576).toFixed(1)} MiB`;

function paintModelLoad() {
  if (!activeModelLoad) return;
  const { paths, title, kind } = activeModelLoad;
  let loaded = 0, total = 0, pending = 0;
  for (const path of paths) {
    const transfer = modelTransfers.get(path);
    const size = modelBytes[path] || transfer?.total || 0;
    total += size;
    loaded += transfer?.complete ? size : Math.min(transfer?.loaded || 0, size);
    if (!transfer?.complete) pending++;
  }
  const percent = total ? Math.min(100, Math.round(loaded * 100 / total)) : 0;
  const amount = total ? `${formatModelBytes(loaded)} / ${formatModelBytes(total)} · ${percent}%` : 'Preparing model download…';
  const phase = pending ? 'Downloading 3D models' : 'Download complete · preparing rooms…';
  modelLoadingTitle.textContent = title;
  modelLoadingBar.value = percent;
  modelLoadingAmount.textContent = amount;
  modelLoadingPhase.textContent = phase;
  if (embedded) parent.postMessage({ type: 'zebezo-scene-progress', active: true, kind, title, percent, amount, phase }, location.origin);
}

function beginModelLoad(kind, title, paths) {
  const token = ++modelLoadSerial;
  activeModelLoad = { token, kind, title, paths: [...new Set(paths)] };
  modelLoading.hidden = false;
  paintModelLoad();
  return token;
}

function finishModelLoad(token) {
  if (activeModelLoad?.token !== token) return;
  const { kind } = activeModelLoad;
  activeModelLoad = null;
  modelLoading.hidden = true;
  if (embedded) parent.postMessage({ type: 'zebezo-scene-progress', active: false, kind }, location.origin);
}

function loadTrackedModel(path) {
  const progress = modelTransfers.get(path) || { loaded: 0, total: modelBytes[path] || 0, complete: false };
  modelTransfers.set(path, progress);
  return modelLoader.loadAsync(modelUrl(path), event => {
    progress.loaded = event.loaded;
    progress.total = modelBytes[path] || event.total || progress.total;
    paintModelLoad();
  }).then(asset => {
    progress.complete = true;
    progress.loaded = modelBytes[path] || progress.total;
    paintModelLoad();
    return asset;
  }).catch(error => {
    modelTransfers.delete(path);
    paintModelLoad();
    throw error;
  });
}
