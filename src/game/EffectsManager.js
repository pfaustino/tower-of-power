import * as THREE from 'three';
import { loadModel } from './AssetLoader.js';
import { disposeObject3D } from './EnemyVisuals.js';

/**
 * Short-lived burst particles for boulder impacts.
 */
export class EffectsManager {
  /**
   * @param {import('./Game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.bursts = [];
    this.oilPatches = [];
    this._beamBurstReady = false;
  }

  async initModels() {
    await loadModel('enemy-ufo-beam-burst');
    this._beamBurstReady = true;
  }

  /**
   * @param {THREE.Vector3} position
   */
  spawnBeamBurst(position) {
    if (!this._beamBurstReady) return;

    loadModel('enemy-ufo-beam-burst').then((burst) => {
      burst.scale.setScalar(0.32);
      burst.position.copy(position);
      burst.position.y = Math.max(position.y, 0.65);
      this.group.add(burst);
      this.bursts.push({
        age: 0,
        duration: 0.38,
        radius: 0,
        meshes: [{ mesh: burst, kind: 'burstModel', baseScale: 0.32 }],
      });
    });
  }

  /**
   * @param {THREE.Vector3} position
   * @param {number} radius
   */
  spawnSplash(position, radius) {
    const burst = {
      age: 0,
      duration: 0.55,
      radius,
      meshes: [],
    };

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.15, radius * 0.35, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffb347,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, 0.55, position.z);
    this.group.add(ring);
    burst.meshes.push({ mesh: ring, kind: 'ring' });

    const colors = [0xd4a574, 0x8b6914, 0xffcc66, 0xa08050];
    const count = 18;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 2.5 + Math.random() * 3.5;
      const geo = new THREE.SphereGeometry(0.07 + Math.random() * 0.06, 5, 5);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(position.x, position.y, position.z);
      this.group.add(mesh);
      burst.meshes.push({
        mesh,
        kind: 'particle',
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          2 + Math.random() * 3,
          Math.sin(angle) * speed,
        ),
      });
    }

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffe0aa,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    flash.position.copy(position);
    flash.position.y = 0.6;
    this.group.add(flash);
    burst.meshes.push({ mesh: flash, kind: 'flash' });

    this.bursts.push(burst);
  }

  /**
   * @param {THREE.Vector3} position
   */
  spawnHitFlash(position) {
    position.y += 0.55;
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 4, 4),
        new THREE.MeshBasicMaterial({
          color: 0xffee88,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
      );
      mesh.position.copy(position);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2;
      this.group.add(mesh);
      this.bursts.push({
        age: 0,
        duration: 0.22,
        radius: 0,
        meshes: [{
          mesh,
          kind: 'particle',
          velocity: new THREE.Vector3(
            Math.cos(angle) * speed,
            1 + Math.random() * 1.5,
            Math.sin(angle) * speed,
          ),
        }],
      });
    }
  }

  /**
   * @param {THREE.Vector3} position
   */
  spawnDeathPuff(position) {
    position.y += 0.5;
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0xaaddff,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    flash.position.copy(position);
    this.group.add(flash);
    this.bursts.push({
      age: 0,
      duration: 0.35,
      radius: 0,
      meshes: [{ mesh: flash, kind: 'flash' }],
    });
  }

  /**
   * Expanding cyan pulse ring when a Pulse Turret fires.
   * @param {THREE.Vector3} position
   * @param {number} [maxRadius]
   */
  spawnTurretPulse(position, maxRadius = 2.4) {
    const burst = { age: 0, duration: 0.45, radius: maxRadius, meshes: [] };
    const y = 0.58;
    const outerStart = 0.32;

    const ringMat = {
      color: 0x66eeff,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    };

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.1, outerStart, 48),
      new THREE.MeshBasicMaterial(ringMat),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, y, position.z);
    ring.renderOrder = 20;
    this.group.add(ring);
    burst.meshes.push({ mesh: ring, kind: 'pulseRing', maxRadius, outerStart, baseOpacity: 0.95 });

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.15, outerStart * 0.85, 48),
      new THREE.MeshBasicMaterial({
        ...ringMat,
        opacity: 0.55,
        color: 0x44ccff,
      }),
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.set(position.x, y + 0.02, position.z);
    outerRing.renderOrder = 19;
    this.group.add(outerRing);
    burst.meshes.push({
      mesh: outerRing,
      kind: 'pulseRing',
      maxRadius: maxRadius * 1.15,
      outerStart: outerStart * 0.85,
      baseOpacity: 0.55,
    });

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xccffff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: false,
        fog: false,
      }),
    );
    core.position.set(position.x, 0.88, position.z);
    core.renderOrder = 21;
    this.group.add(core);
    burst.meshes.push({ mesh: core, kind: 'pulseCore' });

    this.bursts.push(burst);
  }

  /**
   * @param {THREE.Vector3} position
   */
  spawnLeak(position) {
    const burst = { age: 0, duration: 0.65, radius: 1.4, meshes: [] };

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.55, 28),
      new THREE.MeshBasicMaterial({
        color: 0xff3344,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, 0.6, position.z);
    this.group.add(ring);
    burst.meshes.push({ mesh: ring, kind: 'ring' });

    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xff6677, transparent: true, opacity: 0.85 }),
      );
      mesh.position.set(position.x, 0.8, position.z);
      this.group.add(mesh);
      burst.meshes.push({
        mesh,
        kind: 'particle',
        velocity: new THREE.Vector3(
          Math.cos(angle) * 2.5,
          2 + Math.random() * 2,
          Math.sin(angle) * 2.5,
        ),
      });
    }

    this.bursts.push(burst);
  }

  /**
   * @param {number} x
   * @param {number} z
   * @param {number} radius
   * @param {number} duration
   * @param {number} burnDps
   */
  spawnOilPatch(x, z, radius, duration, burnDps) {
    this.spawnOilIgnite(x, z, radius);

    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 28),
      new THREE.MeshBasicMaterial({
        color: 0x1a1208,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.52, z);
    this.group.add(pool);

    const fireRing = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.2, radius * 0.88, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff6622,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    fireRing.rotation.x = -Math.PI / 2;
    fireRing.position.set(x, 0.54, z);
    this.group.add(fireRing);

    const flames = [];
    const flameCount = 5;
    for (let i = 0; i < flameCount; i++) {
      const angle = (i / flameCount) * Math.PI * 2 + Math.random() * 0.5;
      const dist = radius * (0.25 + Math.random() * 0.45);
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.1 + Math.random() * 0.06, 5, 5),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0xffaa33 : 0xff4400,
          transparent: true,
          opacity: 0.85,
        }),
      );
      flame.position.set(x + Math.cos(angle) * dist, 0.62, z + Math.sin(angle) * dist);
      this.group.add(flame);
      flames.push({ mesh: flame, phase: Math.random() * Math.PI * 2 });
    }

    this.oilPatches.push({
      x,
      z,
      radius,
      duration,
      burnDps,
      age: 0,
      pool,
      fireRing,
      flames,
    });
  }

  /** @param {number} x @param {number} z @param {number} radius */
  spawnOilIgnite(x, z, radius) {
    const burst = {
      age: 0,
      duration: 0.45,
      radius,
      meshes: [],
    };

    const flash = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.05, radius * 0.35, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffcc44,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    flash.rotation.x = -Math.PI / 2;
    flash.position.set(x, 0.58, z);
    this.group.add(flash);
    burst.meshes.push({ mesh: flash, kind: 'ring' });

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.9 }),
      );
      mesh.position.set(x, 0.7, z);
      this.group.add(mesh);
      burst.meshes.push({
        mesh,
        kind: 'particle',
        velocity: new THREE.Vector3(
          Math.cos(angle) * 3,
          2.5 + Math.random(),
          Math.sin(angle) * 3,
        ),
      });
    }

    this.bursts.push(burst);
  }

  clearOilPatches() {
    for (const patch of this.oilPatches) {
      this.group.remove(patch.pool);
      patch.pool.geometry.dispose();
      patch.pool.material.dispose();
      this.group.remove(patch.fireRing);
      patch.fireRing.geometry.dispose();
      patch.fireRing.material.dispose();
      for (const f of patch.flames) {
        this.group.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
      }
    }
    this.oilPatches = [];
  }

  /** @param {number} dt */
  updateOilPatches(dt) {
    for (let i = this.oilPatches.length - 1; i >= 0; i--) {
      const patch = this.oilPatches[i];
      patch.age += dt;
      const lifeT = patch.age / patch.duration;
      const flicker = 0.45 + Math.sin(patch.age * 14) * 0.18 + Math.sin(patch.age * 23) * 0.1;

      patch.pool.material.opacity = Math.max(0, 0.82 * (1 - lifeT * 0.35));
      patch.fireRing.material.opacity = Math.max(0, flicker * (1 - lifeT * 0.5));
      patch.fireRing.scale.setScalar(0.92 + Math.sin(patch.age * 9) * 0.06);

      for (const f of patch.flames) {
        f.mesh.position.y = 0.58 + Math.sin(patch.age * 8 + f.phase) * 0.08;
        f.mesh.material.opacity = Math.max(0, flicker * (1 - lifeT * 0.6));
        f.mesh.scale.setScalar(0.85 + Math.sin(patch.age * 11 + f.phase) * 0.2);
      }

      for (const enemy of this.game.enemies.alive) {
        const dx = enemy.mesh.position.x - patch.x;
        const dz = enemy.mesh.position.z - patch.z;
        if (dx * dx + dz * dz <= patch.radius * patch.radius) {
          this.game.enemies.damage(enemy, patch.burnDps * dt);
          enemy.hitFlash = Math.max(enemy.hitFlash ?? 0, 0.06);
        }
      }

      if (patch.age >= patch.duration) {
        this.group.remove(patch.pool);
        patch.pool.geometry.dispose();
        patch.pool.material.dispose();
        this.group.remove(patch.fireRing);
        patch.fireRing.geometry.dispose();
        patch.fireRing.material.dispose();
        for (const f of patch.flames) {
          this.group.remove(f.mesh);
          f.mesh.geometry.dispose();
          f.mesh.material.dispose();
        }
        this.oilPatches.splice(i, 1);
      }
    }
  }

  /** @param {number} dt */
  update(dt) {
    this.updateOilPatches(dt);

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i];
      burst.age += dt;
      const t = burst.age / burst.duration;

      for (const item of burst.meshes) {
        const { mesh, kind, velocity } = item;
        if (kind === 'particle' && velocity) {
          velocity.y -= 16 * dt;
          mesh.position.addScaledVector(velocity, dt);
          mesh.material.opacity = Math.max(0, 1 - t * 1.2);
        } else if (kind === 'ring') {
          const scale = 1 + t * 2.8;
          mesh.scale.set(scale, scale, 1);
          mesh.material.opacity = Math.max(0, 0.85 * (1 - t));
        } else if (kind === 'flash') {
          const scale = 1 + t * 3;
          mesh.scale.setScalar(scale);
          mesh.material.opacity = Math.max(0, 0.55 * (1 - t * 1.5));
        } else if (kind === 'burstModel') {
          const base = item.baseScale ?? 0.32;
          const scale = base * (1 + t * 2.8);
          mesh.scale.setScalar(scale);
          mesh.traverse((obj) => {
            if (obj instanceof THREE.Mesh && obj.material?.transparent) {
              obj.material.opacity = Math.max(0, 1 - t * 1.4);
            }
          });
        } else if (kind === 'pulseRing') {
          const maxR = item.maxRadius ?? 2.4;
          const outerStart = item.outerStart ?? 0.32;
          const targetScale = maxR / outerStart;
          const scale = THREE.MathUtils.lerp(1, targetScale, t);
          mesh.scale.set(scale, scale, 1);
          mesh.material.opacity = Math.max(0, (item.baseOpacity ?? 0.95) * (1 - t));
        } else if (kind === 'pulseCore') {
          const scale = 1 + t * 2.2;
          mesh.scale.setScalar(scale);
          mesh.material.opacity = Math.max(0, 0.85 * (1 - t * 1.4));
        }
      }

      if (burst.age >= burst.duration) {
        for (const item of burst.meshes) {
          this.group.remove(item.mesh);
          if (item.kind === 'burstModel') disposeObject3D(item.mesh);
          else {
            item.mesh.geometry?.dispose();
            item.mesh.material?.dispose();
          }
        }
        this.bursts.splice(i, 1);
      }
    }
  }
}
