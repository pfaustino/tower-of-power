import * as THREE from 'three';

/**
 * Scale from 1.0 at level 1 to 1.10 at max level.
 * @param {number} level
 * @param {number} [maxLevel]
 */
export function getUpgradeScale(level, maxLevel = 10) {
  const steps = Math.max(maxLevel - 1, 1);
  return 1 + ((level - 1) / steps) * 0.10;
}

/**
 * @param {object} def
 * @param {number} level
 */
export function getBodyModelForLevel(def, level) {
  const progression = def.bodyProgression;
  if (!progression?.length) return def.models.body;
  const maxLevel = def.maxLevel ?? 10;
  const idx = Math.min(
    progression.length - 1,
    Math.floor(((level - 1) * progression.length) / maxLevel),
  );
  return progression[idx];
}

/**
 * Apply level-based tint, emissive glow, and uniform scale to a tower mesh.
 * @param {THREE.Object3D} mesh
 * @param {object} def
 * @param {number} level
 */
export function applyTowerUpgradeVisual(mesh, def, level) {
  const maxLevel = def.maxLevel ?? 10;
  const tier = maxLevel <= 1 ? 0 : (level - 1) / (maxLevel - 1);
  const scale = getUpgradeScale(level, maxLevel);
  mesh.scale.setScalar(scale);

  const accent = new THREE.Color(def.accentColor ?? 0x5ce1ff);
  const brighten = 1 + tier * 0.1;

  mesh.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.material) return;
    const mat = obj.material;
    if (!('color' in mat)) return;

    if (!obj.userData.towerBaseColor) {
      obj.userData.towerBaseColor = mat.color.getHex();
      obj.userData.towerBaseEmissive = mat.emissive?.getHex?.() ?? 0x000000;
      obj.userData.towerBaseEmissiveIntensity = mat.emissiveIntensity ?? 0;
    }

    const base = new THREE.Color(obj.userData.towerBaseColor);
    base.lerp(accent, 0.12 + tier * 0.38);
    base.multiplyScalar(brighten);
    mat.color.copy(base);

    if ('emissive' in mat) {
      mat.emissive.copy(accent);
      mat.emissiveIntensity = 0.03 + tier * 0.22;
    }
  });
}

/** @param {THREE.Object3D} mesh */
export function collectTowerMaterials(mesh) {
  /** @type {THREE.Material[]} */
  const materials = [];
  mesh.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material) materials.push(obj.material);
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
