import * as THREE from 'three';

const PAN_CLICK_THRESHOLD = 6;

export class Input {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hoverGrid = { x: -1, z: -1 };
    this._onMove = this.onMove.bind(this);
    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onContext = this.onContext.bind(this);
    this._onKey = this.onKey.bind(this);
    this._onWheel = this.onWheel.bind(this);
    this.panning = false;
    this.panDragged = false;
    this.panPointerId = null;
    this.panStartX = 0;
    this.panStartY = 0;
    this.lastPanX = 0;
    this.lastPanY = 0;
  }

  /** @param {import('./Game.js').Game} game */
  init(game) {
    this.game = game;
    this.canvas = document.getElementById('game-canvas');
    this.canvas.addEventListener('pointermove', this._onMove);
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointercancel', this._onPointerUp);
    this.canvas.addEventListener('contextmenu', this._onContext);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('keydown', this._onKey);
  }

  /** @param {PointerEvent} e */
  onMove(e) {
    if (this.game.pauseMenu.open) return;
    if (this.game.state !== 'playing' || this.game.paused) return;

    if (this.panning && e.pointerId === this.panPointerId) {
      const totalDx = e.clientX - this.panStartX;
      const totalDy = e.clientY - this.panStartY;
      if (Math.abs(totalDx) > PAN_CLICK_THRESHOLD || Math.abs(totalDy) > PAN_CLICK_THRESHOLD) {
        this.panDragged = true;
      }
      if (this.panDragged) {
        const frameDx = e.clientX - this.lastPanX;
        const frameDy = e.clientY - this.lastPanY;
        this.game.panCamera(frameDx, frameDy);
        this.lastPanX = e.clientX;
        this.lastPanY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
      }
      return;
    }

    if (this.game.canPanCamera()) {
      this.canvas.style.cursor = 'grab';
    } else {
      this.canvas.style.cursor = '';
    }

    const hit = this.intersectGround(e);
    if (!hit) {
      this.hoverGrid = { x: -1, z: -1 };
      this.game.map.hideSelection();
      if (this.game.placementArmed) {
        this.game.towers.updatePlacementGhost(-1, -1, false);
      }
      return;
    }
    const { x, z } = this.game.map.worldToGrid(hit.x, hit.z);
    this.hoverGrid = { x, z };

    if (this.game.placementArmed) {
      const valid = this.game.canDropAt(x, z);
      this.game.map.showSelection(x, z, valid);
      this.game.towers.updatePlacementGhost(x, z, valid);
      return;
    }

    this.game.map.hideSelection();
    this.game.towers.updatePlacementGhost(-1, -1, false);
  }

  /** @param {PointerEvent} e */
  onPointerDown(e) {
    if (this.game.pauseMenu.open) return;
    if (this.game.state !== 'playing' || this.game.paused) return;
    if (e.button === 2) {
      e.preventDefault();
      this.game.cancelPlacement();
      this.game.deselectPlacedTower();
      return;
    }
    if (e.button !== 0) return;

    if (this.game.canPanCamera()) {
      this.panning = true;
      this.panDragged = false;
      this.panPointerId = e.pointerId;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    const { x, z } = this.hoverGrid;
    if (x < 0 || z < 0) return;
    if (this.game.placementArmed) {
      const existing = this.game.towers.pickAt(x, z);
      if (existing) {
        this.game.selectPlacedTower(existing);
        return;
      }
      this.game.tryPlaceTower(x, z);
      return;
    }
    this.game.trySelectPlacedTower(x, z);
  }

  /** @param {PointerEvent} e */
  onPointerUp(e) {
    if (!this.panning || e.pointerId !== this.panPointerId) return;

    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    this.canvas.style.cursor = this.game.canPanCamera() ? 'grab' : '';
    const wasClick = !this.panDragged;
    this.panning = false;
    this.panPointerId = null;
    this.panDragged = false;

    if (wasClick && e.button === 0) {
      const { x, z } = this.hoverGrid;
      if (x >= 0 && z >= 0) {
        this.game.trySelectPlacedTower(x, z);
      }
    }
  }

  /** @param {MouseEvent} e */
  onContext(e) {
    e.preventDefault();
    if (this.game.state === 'playing') {
      this.game.cancelPlacement();
      this.game.deselectPlacedTower();
    }
  }

  /** @param {WheelEvent} e */
  onWheel(e) {
    if (this.game.pauseMenu.open || this.game.paused) return;
    e.preventDefault();
    this.game.adjustCameraZoom(e.deltaY * 0.0012);
  }

  /** @param {KeyboardEvent} e */
  onKey(e) {
    if (e.code === 'Escape') {
      e.preventDefault();
      this.game.togglePauseMenu();
      return;
    }

    if (this.game.pauseMenu.open) return;
    if (this.game.state !== 'playing' || this.game.paused) return;

    if (e.code === 'Space') {
      e.preventDefault();
      this.game.tryStartWave();
      return;
    }

    const key = e.key;
    for (const def of this.game.towerDefs.values()) {
      if (def.hotkey === key) {
        this.game.selectTower(def.id);
        return;
      }
    }
  }

  /** @param {PointerEvent} e */
  intersectGround(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.game.camera);
    const target = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, target)) return null;
    return target;
  }
}
