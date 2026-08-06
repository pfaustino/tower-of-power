import * as THREE from 'three';
import { disposeObject3D } from './EnemyVisuals.js';

const MAX_OIL_PATCHES = 6;
const MAX_BURSTS = 40;

/** Reused geometries — never dispose these. */
const SHARED_GEOS = {
  circle: new THREE.CircleGeometry(1, 16),
  ring: new THREE.RingGeometry(0.14, 0.9, 16),
  spark: new THREE.SphereGeometry(0.07, 4, 4),
  puff: new THREE.SphereGeometry(0.35, 6, 6),
};

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
  }

  async initModels() {
    // No async effect models required.
  }

  /**
   * @param {THREE.Vector3} position
   */
  spawnBeamBurst(position) {
    if (this.bursts.length >= MAX_BURSTS) return;

    const burst = { age: 0, duration: 0.3, radius: 0, meshes: [] };
    const ring = new THREE.Mesh(
      SHARED_GEOS.ring,
      new THREE.MeshBasicMaterial({
        color: 0xff4466,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(0.5);
    ring.position.set(position.x, Math.max(position.y, 0.65), position.z);
    this.group.add(ring);
    burst.meshes.push({ mesh: ring, kind: 'ring', sharedGeo: true });

    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        SHARED_GEOS.spark,
        new THREE.MeshBasicMaterial({
          color: 0xff6688,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      );
      mesh.position.set(position.x, Math.max(position.y, 0.7), position.z);
      const angle = (i / 3) * Math.PI * 2;
      burst.meshes.push({
        mesh,
        kind: 'particle',
        sharedGeo: true,
        velocity: new THREE.Vector3(Math.cos(angle) * 2, 1.5, Math.sin(angle) * 2),
      });
      this.group.add(mesh);
    }

    this.bursts.push(burst);
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
    if (this.bursts.length >= MAX_BURSTS) return;

    const origin = position.clone();
    origin.y += 0.55;
    const burst = {
      age: 0,
      duration: 0.22,
      radius: 0,
      meshes: [],
    };

    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        SHARED_GEOS.spark,
        new THREE.MeshBasicMaterial({
          color: 0xffee88,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
      );
      mesh.position.copy(origin);
      const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 1.5 + Math.random() * 2;
      burst.meshes.push({
        mesh,
        kind: 'particle',
        sharedGeo: true,
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          1 + Math.random() * 1.5,
          Math.sin(angle) * speed,
        ),
      });
      this.group.add(mesh);
    }

    this.bursts.push(burst);
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
   * Expanding danger ring used for boss attack / spawn telegraphs.
   * @param {THREE.Vector3} position
   * @param {number} [maxRadius]
   */
  spawnBossTelegraph(position, maxRadius = 2.2) {
    const burst = { age: 0, duration: 0.85, radius: maxRadius, meshes: [] };
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.55, 36),
      new THREE.MeshBasicMaterial({
        color: 0xff2244,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, 0.62, position.z);
    this.group.add(ring);
    burst.meshes.push({
      mesh: ring,
      kind: 'pulseRing',
      maxRadius,
      outerStart: 0.55,
      baseOpacity: 0.9,
    });

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff6688,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    core.position.set(position.x, 0.9, position.z);
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
    while (this.oilPatches.length >= MAX_OIL_PATCHES) {
      this._removeOilPatchAt(0);
    }

    const layers = [];
    const layerDefs = [
      { scale: 1, color: 0xff3300, opacity: 0.28, y: 0.52 },
      { scale: 0.55, color: 0xffaa22, opacity: 0.32, y: 0.54 },
    ];

    for (const def of layerDefs) {
      const mesh = new THREE.Mesh(
        SHARED_GEOS.circle,
        new THREE.MeshBasicMaterial({
          color: def.color,
          transparent: true,
          opacity: def.opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.setScalar(radius * def.scale);
      mesh.position.set(x, def.y, z);
      this.group.add(mesh);
      layers.push({
        mesh,
        baseOpacity: def.opacity,
        color: def.color,
        baseScale: radius * def.scale,
      });
    }

    const fireRing = new THREE.Mesh(
      SHARED_GEOS.ring,
      new THREE.MeshBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    fireRing.rotation.x = -Math.PI / 2;
    fireRing.scale.setScalar(radius);
    fireRing.position.set(x, 0.545, z);
    this.group.add(fireRing);

    const flames = [];
    const flameCount = 4;
    for (let i = 0; i < flameCount; i++) {
      const angle = (i / flameCount) * Math.PI * 2;
      const dist = radius * (0.25 + (i % 2) * 0.25);
      const flame = new THREE.Mesh(
        SHARED_GEOS.spark,
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0xff5500 : 0xffcc33,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      flame.position.set(x + Math.cos(angle) * dist, 0.58, z + Math.sin(angle) * dist);
      this.group.add(flame);
      flames.push({ mesh: flame, phase: angle, baseOpacity: 0.5 });
    }

    this.oilPatches.push({
      x,
      z,
      radius,
      radiusSq: radius * radius,
      duration,
      burnDps,
      age: 0,
      layers,
      fireRing,
      fireRingBaseScale: radius,
      flames,
    });
  }

  /** @param {number} index */
  _removeOilPatchAt(index) {
    const patch = this.oilPatches[index];
    if (!patch) return;

    for (const layer of patch.layers) {
      this.group.remove(layer.mesh);
      layer.mesh.material.dispose();
    }
    this.group.remove(patch.fireRing);
    patch.fireRing.material.dispose();
    for (const f of patch.flames) {
      this.group.remove(f.mesh);
      f.mesh.material.dispose();
    }
    this.oilPatches.splice(index, 1);
  }
  clearOilPatches() {
    while (this.oilPatches.length > 0) {
      this._removeOilPatchAt(0);
    }
  }
  /** @param {number} dt */
  updateOilPatches(dt) {
    for (let i = this.oilPatches.length - 1; i >= 0; i--) {
      const patch = this.oilPatches[i];
      patch.age += dt;
      const lifeT = patch.age / patch.duration;
      const flicker = 0.55 + Math.sin(patch.age * 14) * 0.2 + Math.sin(patch.age * 23) * 0.12;
      const fade = 1 - lifeT * 0.45;

      for (const layer of patch.layers) {
        layer.mesh.material.opacity = Math.max(0, layer.baseOpacity * flicker * fade);
        const pulse = 0.96 + Math.sin(patch.age * 7 + layer.color) * 0.04;
        layer.mesh.scale.setScalar(layer.baseScale * pulse);
      }

      patch.fireRing.material.opacity = Math.max(0, 0.32 * flicker * fade);
      const ringPulse = 0.94 + Math.sin(patch.age * 9) * 0.06;
      patch.fireRing.scale.setScalar(patch.fireRingBaseScale * ringPulse);

      for (const f of patch.flames) {
        f.mesh.position.y = 0.56 + Math.sin(patch.age * 8 + f.phase) * 0.1;
        f.mesh.material.opacity = Math.max(0, f.baseOpacity * flicker * fade);
        f.mesh.scale.setScalar(0.8 + Math.sin(patch.age * 11 + f.phase) * 0.25);
      }

      if (patch.age >= patch.duration) {
        this._removeOilPatchAt(i);
        continue;
      }
    }

    if (this.oilPatches.length === 0) return;

    for (const enemy of this.game.enemies.alive) {
      if (!enemy.alive) continue;
      const pos = enemy.mesh.position;
      let burnDps = 0;
      for (const patch of this.oilPatches) {
        const dx = pos.x - patch.x;
        const dz = pos.z - patch.z;
        if (dx * dx + dz * dz <= patch.radiusSq) {
          burnDps = Math.max(burnDps, patch.burnDps);
        }
      }
      if (burnDps <= 0) continue;
      this.game.enemies.applyBurnDamage(enemy, burnDps * dt);
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
            if (!item.sharedGeo) item.mesh.geometry?.dispose();
            item.mesh.material?.dispose();
          }
        }
        this.bursts.splice(i, 1);
      }    }
  }
}
