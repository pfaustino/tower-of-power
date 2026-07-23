import * as THREE from 'three';
import { isEnemyAttackWave } from './WaveScaling.js';

const MAX_WAVE = 100;

const TIER_ACCENTS = {
  1: 0x88aacc,
  2: 0xdd8844,
  3: 0xdd44aa,
  4: 0xcc3366,
  5: 0x6622aa,
};

/**
 * @param {number} waveNumber
 */
export function getEnemyWaveTier(waveNumber) {
  const w = Math.max(1, waveNumber);
  if (w <= 20) return 1;
  if (w <= 40) return 2;
  if (w <= 60) return 3;
  if (w <= 80) return 4;
  return 5;
}

/**
 * @param {number} waveNumber
 */
export function getEnemyVisualScale(waveNumber) {
  const t = (THREE.MathUtils.clamp(waveNumber, 1, MAX_WAVE) - 1) / (MAX_WAVE - 1);
  return 1 + t * 0.12;
}

/**
 * @param {number} waveNumber
 */
export function shouldAttachWeapon(waveNumber) {
  return isEnemyAttackWave(waveNumber);
}

/**
 * @param {string} hullModel
 */
export function getWeaponModelName(hullModel) {
  if (/^enemy-ufo-[a-d]$/.test(hullModel)) return `${hullModel}-weapon`;
  return null;
}

/**
 * @param {THREE.Object3D} root
 * @param {object} def
 * @param {number} waveNumber
 * @param {boolean} [isBoss]
 */
export function applyEnemyWaveVisual(root, def, waveNumber, isBoss = false) {
  const tier = getEnemyWaveTier(waveNumber);
  const tierT = THREE.MathUtils.clamp((waveNumber - (tier - 1) * 20 - 1) / 20, 0, 1);
  const globalT = (THREE.MathUtils.clamp(waveNumber, 1, MAX_WAVE) - 1) / (MAX_WAVE - 1);
  const typeAccent = new THREE.Color(def.accentColor ?? TIER_ACCENTS[tier]);
  const tierAccent = new THREE.Color(TIER_ACCENTS[tier]);
  const accent = typeAccent.clone().lerp(tierAccent, 0.45 + tierT * 0.25);
  const emissiveIntensity = 0.02 + globalT * 0.14 + (isBoss ? 0.12 : 0) + tier * 0.025;
  const darken = 1 - globalT * 0.18;

  /** @type {{ emissive: number, emissiveIntensity: number }} */
  const waveVisual = { emissive: accent.getHex(), emissiveIntensity };

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.material) return;
    const mat = obj.material;
    if (!('color' in mat)) return;

    if (!obj.userData.enemyBaseColor) {
      obj.userData.enemyBaseColor = mat.color.getHex();
    }

    const base = new THREE.Color(obj.userData.enemyBaseColor);
    base.lerp(accent, 0.08 + globalT * 0.32 + tierT * 0.12);
    base.multiplyScalar(darken);
    mat.color.copy(base);

    if ('emissive' in mat) {
      mat.emissive.copy(accent);
      mat.emissiveIntensity = emissiveIntensity;
    }
  });

  return waveVisual;
}

/**
 * @param {number} waveNumber
 * @param {boolean} isBoss
 * @param {number} scale
 */
export function createEliteRing(waveNumber, isBoss, scale) {
  const tier = getEnemyWaveTier(waveNumber);
  const accent = TIER_ACCENTS[tier];
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42 * scale, 0.028 * scale, 8, 28),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: isBoss ? 0.75 : 0.55,
      depthWrite: false,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.32 * scale;
  return ring;
}

/** Shared hit-flash hull — never dispose. */
const HIT_FLASH_GEO = new THREE.SphereGeometry(1, 8, 8);

/**
 * Single additive overlay for damage flash — avoids touching every cloned material.
 * @param {number} visualScale
 * @param {boolean} [isBoss]
 */
export function createEnemyHitFlashOverlay(visualScale, isBoss = false) {
  const mat = new THREE.MeshBasicMaterial({
    color: isBoss ? 0xff2288 : 0xff5533,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(HIT_FLASH_GEO, mat);
  const radius = (isBoss ? 0.72 : 0.52) * visualScale;
  mesh.scale.setScalar(radius);
  mesh.position.y = (isBoss ? 0.35 : 0.28) * visualScale;
  mesh.visible = false;
  mesh.renderOrder = 10;
  return { mesh, mat };
}

/** @param {THREE.Object3D} root */
export function collectEnemyMaterials(root) {
  /** @type {THREE.Material[]} */
  const materials = [];
  const seen = new Set();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.material) return;
    if (seen.has(obj.material)) return;
    seen.add(obj.material);
    materials.push(obj.material);
  });
  return materials;
}

/** @param {THREE.Object3D} root */
export function disposeObject3D(root) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry?.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
}
