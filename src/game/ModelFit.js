import * as THREE from 'three';

/**
 * Scale a Kenney tile model to fill one grid cell and sit on y=0.
 * @param {THREE.Object3D} model
 * @param {number} tileSize
 */
export function fitTileModel(model, tileSize) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z, 0.001);
  const scale = (tileSize * 0.98) / maxDim;
  model.scale.setScalar(scale);

  const fitted = new THREE.Box3().setFromObject(model);
  model.position.y = -fitted.min.y;
}

/**
 * @param {THREE.Object3D} model
 * @param {number} tileSize
 */
export function fitTowerModel(model, tileSize) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z, 0.001);
  const scale = (tileSize * 0.75) / maxDim;
  model.scale.setScalar(scale);

  const fitted = new THREE.Box3().setFromObject(model);
  model.position.y = -fitted.min.y;
}
