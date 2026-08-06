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
    /** @type {Map<number, { x: number, y: number }>} */
    this.activePointers = new Map();
    this.pinching = false;
    this.pinchStartDist = 0;
    this.pinchStartZoom = 1;
  }

  /** @param {import('./Game.js').Game} game */
  init(game) {
    this.game = game;
    this.canvas = document.getElementById('game-canvas');
    this.canvas.style.touchAction = 'none';
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

    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (this.pinching || this.activePointers.size >= 2) {
      this.updatePinchZoom();
      return;
    }

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

    if (this.game.abilities.isStrikeArmed()) {
      this.game.map.hideSelection();
      this.game.towers.updatePlacementGhost(-1, -1, false);
      this.game.abilities.updateStrikeAim(hit.x, hit.z);
      this.canvas.style.cursor = 'crosshair';
      return;
    }

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
      this.game.deselectEnemy();
      return;
    }
    if (e.button !== 0) return;

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore capture failures on some devices */
    }

    if (this.activePointers.size >= 2) {
      this.beginPinch();
      return;
    }

    if (this.game.abilities.isStrikeArmed()) {
      this.syncPointer(e);
      const hit = this.intersectGround(e);
      if (hit) this.game.abilities.confirmStrike(hit.x, hit.z);
      return;
    }

    if (this.game.canPanCamera()) {
      this.panning = true;
      this.panDragged = false;
      this.panPointerId = e.pointerId;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      return;
    }

    this.syncPointer(e);
    const { x, z } = this.hoverGrid;
    if (this.game.placementArmed) {
      if (x < 0 || z < 0) return;
      const existing = this.game.towers.pickAt(x, z);
      if (existing) {
        this.game.selectPlacedTower(existing);
        return;
      }
      this.game.tryPlaceTower(x, z);
      return;
    }
    this.game.trySelectPlacedTower(x, z, this.raycaster);
  }

  /** @param {PointerEvent} e */
  onPointerUp(e) {
    const hadPointer = this.activePointers.delete(e.pointerId);
    if (this.canvas.hasPointerCapture?.(e.pointerId)) {
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    if (this.pinching) {
      if (this.activePointers.size < 2) {
        this.pinching = false;
        this.pinchStartDist = 0;
        // Remaining finger should not instantly pan from a stale origin.
        this.panning = false;
        this.panPointerId = null;
        this.panDragged = true;
      }
      return;
    }

    if (!this.panning || e.pointerId !== this.panPointerId) {
      if (!hadPointer) return;
      return;
    }

    this.canvas.style.cursor = this.game.canPanCamera() ? 'grab' : '';
    const wasClick = !this.panDragged;
    this.panning = false;
    this.panPointerId = null;
    this.panDragged = false;

    if (wasClick && e.button === 0) {
      this.syncPointer(e);
      const { x, z } = this.hoverGrid;
      this.game.trySelectPlacedTower(x, z, this.raycaster);
    }
  }

  beginPinch() {
    const dist = this.pinchDistance();
    if (dist <= 0) return;
    this.pinching = true;
    this.pinchStartDist = dist;
    this.pinchStartZoom = this.game.cameraZoom;
    this.panning = false;
    this.panPointerId = null;
    this.panDragged = true;
    this.canvas.style.cursor = '';
  }

  updatePinchZoom() {
    if (this.activePointers.size < 2) return;
    if (!this.pinching) this.beginPinch();
    const dist = this.pinchDistance();
    if (dist <= 0 || this.pinchStartDist <= 0) return;
    // Fingers apart → zoom in (lower cameraZoom). Fingers together → zoom out.
    const next = this.pinchStartZoom * (this.pinchStartDist / dist);
    this.game.setCameraZoom(next);
  }

  /** @returns {number} */
  pinchDistance() {
    if (this.activePointers.size < 2) return 0;
    const pts = [...this.activePointers.values()];
    const a = pts[0];
    const b = pts[1];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  /** @param {MouseEvent} e */
  onContext(e) {
    e.preventDefault();
    if (this.game.state === 'playing') {
      this.game.cancelPlacement();
      this.game.deselectPlacedTower();
      this.game.deselectEnemy();
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

    const abilityKey = e.key.toLowerCase();
    if (abilityKey === 'q') {
      e.preventDefault();
      this.game.tryUseAbility('freeze');
      return;
    }
    if (abilityKey === 'w') {
      e.preventDefault();
      this.game.tryUseAbility('strike');
      return;
    }
    if (abilityKey === 'e') {
      e.preventDefault();
      this.game.tryUseAbility('overclock');
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
  syncPointer(e) {
    const hit = this.intersectGround(e);
    if (!hit) {
      this.hoverGrid = { x: -1, z: -1 };
      return null;
    }
    this.hoverGrid = this.game.map.worldToGrid(hit.x, hit.z);
    return hit;
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
