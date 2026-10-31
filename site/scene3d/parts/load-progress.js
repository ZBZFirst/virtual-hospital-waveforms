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
  const { paths, title, kind, buildSteps, builtSteps, buildPhase } = activeModelLoad;
  let loaded = 0, total = 0, pending = 0;
  for (const path of paths) {
    const transfer = modelTransfers.get(path);
    const size = modelBytes[path] || transfer?.total || 0;
    total += size;
    loaded += transfer?.complete ? size : Math.min(transfer?.loaded || 0, size);
    if (!transfer?.complete) pending++;
  }
  const downloadFraction=total?Math.min(1,loaded/total):1;
  const buildFraction=buildSteps?Math.min(1,builtSteps/buildSteps):1;
  const percent=Math.min(100,Math.round(100*(buildSteps ? .35*downloadFraction+.65*buildFraction : downloadFraction)));
  const amount=buildSteps?
    `${builtSteps} of ${buildSteps} floors ready · ${percent}%`:
    total?`${formatModelBytes(loaded)} / ${formatModelBytes(total)} · ${percent}%`:'Preparing scene…';
  const phase=pending?'Downloading 3D models · floor plan visible behind this card':
    buildSteps?buildPhase||'Building rooms and equipment…':'Download complete · preparing scene…';
  modelLoadingTitle.textContent = title;
  modelLoadingBar.value = percent;
  modelLoadingAmount.textContent = amount;
  modelLoadingPhase.textContent = phase;
  if (embedded) parent.postMessage({ type: 'zebezo-scene-progress', active: true, kind, title, percent, amount, phase }, location.origin);
}

function beginModelLoad(kind, title, paths, buildSteps=0) {
  const token = ++modelLoadSerial;
  activeModelLoad = { token, kind, title, paths: [...new Set(paths)], buildSteps, builtSteps:0, buildPhase:'' };
  modelLoading.hidden = false;
  paintModelLoad();
  return token;
}

function advanceModelBuild(token,builtSteps,phase) {
  if(activeModelLoad?.token!==token)return;
  activeModelLoad.builtSteps=Math.min(activeModelLoad.buildSteps,builtSteps);
  activeModelLoad.buildPhase=phase;
  paintModelLoad();
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
