import * as THREE from 'three';
import { loadModel } from './AssetLoader.js';
import { buildPath, buildPathFlow, isBuildable, tileModelForCell, tileRotation } from './Path.js';
import { fitTileModel, fitTowerModel } from './ModelFit.js';
import { createHealthBar } from './HealthBar.js';

/** @param {THREE.Object3D} root */
function collectMaterials(root) {
  /** @type {THREE.MeshLambertMaterial[]} */
  const mats = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material) mats.push(obj.material);
  });
  return mats;
}

export class MapBoard {
  /**
   * @param {import('./Game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.selectionMesh = null;
    this.waypoints = [];
    this.buildable = [];
    this.occupied = new Set();
    this.outpost = null;
    this.outpostPosition = new THREE.Vector3();
    this.outpostMaterials = [];
    this.outpostFlash = 0;
    this.outpostMaxLives = 15;
    this.outpostHealthBar = null;
  }

  /**
   * @param {object} mapData
   */
  async build(mapData) {
    const { grid, tileSize, startLives } = mapData;
    this.grid = grid;
    this.tileSize = tileSize;
    this.outpostMaxLives = startLives ?? 15;
    this.buildable = [];

    buildPathFlow(grid);

    const rows = grid.length;
    const cols = grid[0].length;

    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const modelName = tileModelForCell(grid, x, z);
        if (!modelName) continue;

        const tile = await loadModel(modelName);
        fitTileModel(tile, tileSize);
        tile.position.set((x + 0.5) * tileSize, 0, (z + 0.5) * tileSize);
        tile.rotation.y = tileRotation(grid, x, z, tileSize);
        this.group.add(tile);

        if (isBuildable(grid, x, z)) {
          this.buildable.push({ x, z, cell: grid[z][x] });
        }
      }
    }

    const sel = await loadModel('selection-a');
    sel.visible = false;
    fitTileModel(sel, tileSize);
    sel.position.y = 0.02;
    sel.scale.multiplyScalar(0.92);
    this.selectionMesh = sel;
    this.group.add(sel);

    this.centerBoard(cols, rows, tileSize);
    await this.buildOutpost(grid, tileSize);

    this.waypoints = buildPath(grid, tileSize).map(({ x, z }) => {
      const p = new THREE.Vector3(x, 0, z);
      this.group.localToWorld(p);
      return { x: p.x, z: p.z };
    });
  }

  centerBoard(cols, rows, tileSize) {
    this.group.position.set(-(cols * tileSize) / 2, 0, -(rows * tileSize) / 2);
  }

  /**
   * @param {string[][]} grid
   * @param {number} tileSize
   */
  async buildOutpost(grid, tileSize) {
    for (let z = 0; z < grid.length; z++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (grid[z][x] !== 'end') continue;

        const root = new THREE.Group();
        const base = await loadModel('tower-round-base');
        const keep = await loadModel('tower-square-build-c');
        fitTowerModel(base, tileSize);
        fitTowerModel(keep, tileSize);
        keep.position.y = 0.12;
        keep.scale.multiplyScalar(1.12);
        root.add(base, keep);
        root.position.set((x + 0.5) * tileSize, 0, (z + 0.5) * tileSize);
        this.group.add(root);

        this.outpost = root;
        this.outpostMaterials = collectMaterials(root);
        const local = new THREE.Vector3((x + 0.5) * tileSize, 1.1, (z + 0.5) * tileSize);
        this.outpostPosition = this.group.localToWorld(local.clone());

        this.outpostHealthBar = createHealthBar({ width: 1.4, height: 0.14, fillColor: 0x5ce1ff });
        this.outpostHealthBar.setRatio(1);
        this.outpostHealthBar.group.position.copy(local);
        this.outpostHealthBar.group.position.y = 2.35;
        this.group.add(this.outpostHealthBar.group);
        this.setOutpostHealth(this.game.lives || this.outpostMaxLives);
        return;
      }
    }
  }

  /** @param {number} lives */
  setOutpostHealth(lives) {
    if (!this.outpostHealthBar) return;
    this.outpostHealthBar.setRatio(lives / this.outpostMaxLives);
  }

  flashOutpost() {
    this.outpostFlash = 0.45;
  }

  /** @param {number} dt */
  update(dt) {
    if (this.outpostHealthBar && this.game.camera) {
      this.outpostHealthBar.lookAtCamera(this.game.camera);
    }

    if (this.outpostFlash <= 0) return;
    this.outpostFlash -= dt;
    const pulse = Math.sin((1 - this.outpostFlash / 0.45) * Math.PI);
    for (const m of this.outpostMaterials) {
      m.emissive.setHex(0xff2200);
      m.emissiveIntensity = pulse * 0.55;
    }
    if (this.outpostFlash <= 0) {
      for (const m of this.outpostMaterials) {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
    }
  }

  /**
   * @param {number} gx
   * @param {number} gz
   */
  worldToGrid(gx, gz) {
    const local = this.group.worldToLocal(new THREE.Vector3(gx, 0, gz));
    const x = Math.floor(local.x / this.tileSize);
    const z = Math.floor(local.z / this.tileSize);
    return { x, z };
  }

  /**
   * @param {number} x
   * @param {number} z
   */
  gridToWorld(x, z) {
    const p = new THREE.Vector3((x + 0.5) * this.tileSize, 0, (z + 0.5) * this.tileSize);
    return this.group.localToWorld(p);
  }

  /**
   * @param {number} x
   * @param {number} z
   */
  canPlaceTower(x, z) {
    if (!isBuildable(this.grid, x, z)) return false;
    const key = `${x},${z}`;
    return !this.occupied.has(key);
  }

  /**
   * @param {number} x
   * @param {number} z
   */
  occupy(x, z) {
    this.occupied.add(`${x},${z}`);
  }

  /**
   * @param {number} x
   * @param {number} z
   */
  free(x, z) {
    this.occupied.delete(`${x},${z}`);
  }

  /**
   * @param {number} x
   * @param {number} z
   */
  showSelection(x, z, valid = true) {
    if (!this.selectionMesh) return;
    if (x < 0 || z < 0 || !valid) {
      this.selectionMesh.visible = false;
      return;
    }
    this.selectionMesh.position.set(
      (x + 0.5) * this.tileSize,
      0.02,
      (z + 0.5) * this.tileSize,
    );
    this.selectionMesh.visible = true;
  }

  hideSelection() {
    if (this.selectionMesh) this.selectionMesh.visible = false;
  }
}
