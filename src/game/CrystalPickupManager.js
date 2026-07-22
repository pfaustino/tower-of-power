import * as THREE from 'three';

const POP_DURATION = 0.1;
const MAGNET_DURATION = 0.75;
const _targetPos = new THREE.Vector3();

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
      } else {
        if (!p.magnetFrom) {
          p.magnetFrom = p.mesh.position.clone();
        }

        const magnetT = Math.min(1, (p.age - POP_DURATION) / MAGNET_DURATION);
        const eased = magnetT * magnetT * (3 - 2 * magnetT);
        _targetPos.set(outpost.x, 0.75, outpost.z);
        p.mesh.position.lerpVectors(p.magnetFrom, _targetPos, eased);

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
