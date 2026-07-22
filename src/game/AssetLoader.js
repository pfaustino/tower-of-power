import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

/** @type {THREE.Texture | null} */
let colormap = null;

/** @type {THREE.MeshLambertMaterial | null} */
let fallbackMaterial = null;

/** @param {THREE.Texture} tex */
function configureKenneyTexture(tex) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
}

export async function loadColormap() {
  if (colormap) return colormap;
  const tex = await new THREE.TextureLoader().loadAsync('./models/Textures/colormap.png');
  configureKenneyTexture(tex);
  colormap = tex;
  fallbackMaterial = new THREE.MeshLambertMaterial({
    map: colormap,
    color: 0xffffff,
  });
  return colormap;
}

/**
 * Kenney GLBs use atlas UVs on colormap — keep the loaded map when present.
 * @param {THREE.Material | null | undefined} mat
 */
function toKenneyMaterial(mat) {
  if (!fallbackMaterial) {
    return new THREE.MeshLambertMaterial({ color: 0xff00ff });
  }

  const map = mat?.map ?? colormap;
  if (map) configureKenneyTexture(map);

  return new THREE.MeshLambertMaterial({
    map: map ?? undefined,
    color: 0xffffff,
  });
}

/** @param {THREE.Object3D} root */
function enhanceScene(root) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;

    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => toKenneyMaterial(m));
    } else {
      obj.material = toKenneyMaterial(obj.material);
    }

    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}

/**
 * @param {string} name without extension
 */
export async function loadModel(name) {
  if (cache.has(name)) return cache.get(name).clone(true);

  if (!colormap) await loadColormap();

  const gltf = await loader.loadAsync(`./models/${name}.glb`);
  enhanceScene(gltf.scene);
  cache.set(name, gltf.scene);
  return gltf.scene.clone(true);
}

export async function preloadModels(names) {
  await loadColormap();
  await Promise.all(names.map((n) => loadModel(n)));
}
