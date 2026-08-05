import * as THREE from 'three';

const POP_DURATION = 0.35;
const BOUNCE_DURATION = 1.5;
const MAGNET_DURATION = 1.85;
const MAGNET_START = POP_DURATION + BOUNCE_DURATION;
const _targetPos = new THREE.Vector3();
const _bezierPos = new THREE.Vector3();

export class CrystalPickupManager {
  /**
   * @param {import('./Game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.pickups = [];
  }

  /**
   * @param {THREE.Vector3} position
   * @param {number} amount
   */
  spawn(position, amount) {
    if (amount <= 0) return;

    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11 + Math.min(amount / 80, 0.06), 0),
      new THREE.MeshStandardMaterial({
        color: 0xffd966,
        emissive: 0xffaa22,
        emissiveIntensity: 0.55,
        metalness: 0.15,
        roughness: 0.35,
      }),
    );
    mesh.position.copy(position);
    mesh.position.y = Math.max(position.y, 0.55);
    mesh.castShadow = true;
    this.group.add(mesh);

    this.pickups.push({
      mesh,
      amount,
      age: 0,
      magnetFrom: null,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        2.4 + Math.random() * 0.6,
        (Math.random() - 0.5) * 1.2,
      ),
    });
  }

  /** @param {number} dt */
  update(dt) {
    const outpost = this.game.map.outpostPosition;

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.age += dt;

      if (p.age < POP_DURATION) {
        p.velocity.y -= 12 * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.position.y = Math.max(p.mesh.position.y, 0.45);
      } else if (p.age < MAGNET_START) {
        if (!p.landPos) {
          p.landPos = p.mesh.position.clone();
          p.landPos.y = Math.max(p.landPos.y, 0.45);
        }
        const bounceAge = p.age - POP_DURATION;
        const amp = 0.28 * Math.exp(-bounceAge * 1.1);
        const bounceY = Math.abs(Math.sin(bounceAge * 7.5)) * amp;
        p.mesh.position.set(p.landPos.x, p.landPos.y + bounceY, p.landPos.z);
      } else {
        if (!p.magnetFrom) {
          p.magnetFrom = p.mesh.position.clone();
          _targetPos.set(outpost.x, 0.75, outpost.z);
          const dist = p.magnetFrom.distanceTo(_targetPos);
          const arcPeak = (0.85 + dist * 0.2 + Math.random() * 0.35) * 2;
          p.magnetCtrl = new THREE.Vector3(
            (p.magnetFrom.x + outpost.x) * 0.5,
            (p.magnetFrom.y + 0.75) * 0.5 + arcPeak,
            (p.magnetFrom.z + outpost.z) * 0.5,
          );
        }

        const magnetT = Math.min(1, (p.age - MAGNET_START) / MAGNET_DURATION);
        const eased = magnetT * magnetT * (3 - 2 * magnetT);
        _targetPos.set(outpost.x, 0.75, outpost.z);
        const inv = 1 - eased;
        _bezierPos
          .copy(p.magnetFrom).multiplyScalar(inv * inv)
          .addScaledVector(p.magnetCtrl, 2 * inv * eased)
          .addScaledVector(_targetPos, eased * eased);
        p.mesh.position.copy(_bezierPos);

        if (magnetT >= 1) {
          this.game.collectCrystals(p.amount);
          this.removePickup(i);
          continue;
        }
      }

      p.mesh.rotation.y += dt * 5;
      p.mesh.rotation.x += dt * 2.5;
    }
  }

  /** @param {number} index */
  removePickup(index) {
    const p = this.pickups[index];
    this.group.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
    this.pickups.splice(index, 1);
  }

  clear() {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      this.removePickup(i);
    }
  }
}
