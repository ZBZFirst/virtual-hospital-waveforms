const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const nodes = Object.fromEntries(['modelLoading','modelLoadingTitle','modelLoadingBar','modelLoadingAmount','modelLoadingPhase']
  .map(id => [`#${id}`, { hidden: true, textContent: '', value: 0 }]));
const messages = [];
let onProgress, resolveModel;
const context = vm.createContext({
  document: { querySelector: selector => nodes[selector] },
  parent: { postMessage: message => messages.push(message) },
  location: { origin: 'https://example.test' },
  embedded: true,
  modelUrl: path => path,
  modelLoader: { loadAsync: (_url, progress) => {
    onProgress = progress;
    return new Promise(resolve => { resolveModel = resolve; });
  } },
  modelBytes: { 'floor.glb': 1000 },
});
vm.runInContext(fs.readFileSync('scene3d/parts/load-progress.js', 'utf8'), context);

(async () => {
  vm.runInContext("globalThis.loadToken = beginModelLoad('floor','Hospital A, Floor 1',['floor.glb']); globalThis.modelPromise = loadTrackedModel('floor.glb');", context);
  assert.equal(nodes['#modelLoading'].hidden, false);
  assert.equal(nodes['#modelLoadingBar'].value, 0);
  onProgress({ loaded: 500, total: 1000 });
  assert.equal(nodes['#modelLoadingBar'].value, 50);
  assert.match(nodes['#modelLoadingAmount'].textContent, /50%/);
  resolveModel({ scene: {} });
  await context.modelPromise;
  assert.equal(nodes['#modelLoadingBar'].value, 100);
  assert.match(nodes['#modelLoadingPhase'].textContent, /preparing rooms/);
  vm.runInContext('finishModelLoad(loadToken)', context);
  assert.equal(nodes['#modelLoading'].hidden, true);
  assert.equal(messages.at(-1).active, false);
  console.log('Model progress follows downloaded bytes and closes after preparation');
})().catch(error => { console.error(error); process.exitCode = 1; });
