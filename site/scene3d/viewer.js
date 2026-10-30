import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// The generated scene runtime is a classic script while Three.js is a module.
Object.assign(globalThis, { THREE, GLTFLoader, OrbitControls });

try {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const url = new URL('./scene-runtime.js', import.meta.url);
    url.searchParams.set('v', '20261029-tablet-sweep6');
    script.src = url.href;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load scene runtime'));
    document.head.append(script);
  });
} catch (error) {
  const box = document.querySelector('#error');
  box.textContent = String(error);
  box.style.display = 'block';
  document.querySelector('#status').textContent = 'Hospital scene error';
  if (new URLSearchParams(location.search).get('embedded') === '1') {
    parent.postMessage({type:'zebezo-scene-status',status:'error',message:String(error)},location.origin);
  }
  console.error(error);
}
