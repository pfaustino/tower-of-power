import * as THREE from 'three';
import { loadModel } from './AssetLoader.js';
import { fitTowerModel } from './ModelFit.js';

/** @type {Map<HTMLCanvasElement, { renderer: THREE.WebGLRenderer, setActive: (on: boolean) => void, dispose: () => void }>} */
const previews = new Map();

/**
 * Render a spinning tower model into a toolbar canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {object} def
 * @param {number} [tileSize]
 */
export async function mountTowerPreview(canvas, def, tileSize = 2) {
  const w = canvas.clientWidth || 72;
  const h = canvas.clientHeight || 72;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 50);
  camera.position.set(2.6, 2.2, 2.6);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xfff4d8, 1.15);
  dir.position.set(3, 5, 4);
  scene.add(dir);

  const root = new THREE.Group();
  const base = await loadModel(def.models.base);
  const body = await loadModel(def.models.body);
  const weapon = await loadModel(def.models.weapon);
  fitTowerModel(base, tileSize);
  fitTowerModel(body, tileSize);
  fitTowerModel(weapon, tileSize);
  body.position.y = 0.12;
  weapon.position.y = 0.45;
  weapon.scale.multiplyScalar(0.85);
  root.add(base, body, weapon);
  scene.add(root);

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.position.y += -box.min.y + center.y;
  camera.lookAt(0, 0.45, 0);

  let raf = 0;
  let active = false;

  const tick = () => {
    raf = 0;
    if (!active) return;
    root.rotation.y += 0.01;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };

  const entry = {
    renderer,
    setActive(on) {
      if (active === on) return;
      active = on;
      if (active && !raf) {
        raf = requestAnimationFrame(tick);
      } else if (!active && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    dispose() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      renderer.dispose();
      previews.delete(canvas);
    },
  };

  previews.set(canvas, entry);
  return entry;
}

/** Pause or resume all toolbar preview render loops (off during gameplay). */
export function setTowerPreviewsActive(on) {
  for (const entry of previews.values()) {
    entry.setActive(on);
  }
}

/** @param {HTMLCanvasElement} canvas */
export function resizeTowerPreview(canvas) {
  const entry = previews.get(canvas);
  if (!entry) return;
  const w = canvas.clientWidth || 72;
  const h = canvas.clientHeight || 72;
  entry.renderer.setSize(w, h, false);
}
