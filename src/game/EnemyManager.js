import * as THREE from 'three';
import { loadModel } from './AssetLoader.js';
import { createHealthBar } from './HealthBar.js';
import { canEnemyAttack, getEnemyAttackScale, getWaveScale } from './WaveScaling.js';
import {
  applyEnemyWaveVisual,
  collectEnemyMaterials,
  createEliteRing,
  disposeObject3D,
  getEnemyWaveTier,
  getEnemyVisualScale,
  getWeaponModelName,
  shouldAttachWeapon,
} from './EnemyVisuals.js';
import { getTowerStats } from './TowerManager.js';

export class EnemyManager {
  /**
   * @param {import('./Game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.alive = [];
    this.defs = new Map();
    this.projectiles = [];
  }

  /** @param {object[]} enemyList */
  setDefs(enemyList) {
    this.defs = new Map(enemyList.map((e) => [e.id, e]));
  }

  /**
   * @param {object} def
   * @param {number} waveNumber
   * @param {boolean} isBoss
   */
  async buildEnemyVisual(def, waveNumber, isBoss) {
    const root = new THREE.Group();
    const visualScale = getEnemyVisualScale(waveNumber);
    const baseScale = (def.scale ?? 1) * (isBoss ? 1.08 : 1) * visualScale;

    const hull = await loadModel(def.model);
    hull.scale.setScalar(baseScale);
    root.add(hull);

    if (shouldAttachWeapon(waveNumber)) {
      const weaponName = getWeaponModelName(def.model);
      if (weaponName) {
        const weapon = await loadModel(weaponName);
        weapon.scale.setScalar(baseScale);
        root.add(weapon);
      }
    }

    let eliteRing = null;
    if (getEnemyWaveTier(waveNumber) >= 3 || isBoss) {
      eliteRing = createEliteRing(waveNumber, isBoss, baseScale);
      root.add(eliteRing);
    }

    const waveVisual = applyEnemyWaveVisual(root, def, waveNumber, isBoss);
    return { root, visualScale: baseScale, waveVisual, eliteRing };
  }

  /**
   * @param {string} typeId
   * @param {number} [waveNumber]
   * @param {number} [spawnProgress]
   */
  async spawn(typeId, waveNumber = 1, spawnProgress = 0) {
    const def = this.defs.get(typeId);
    if (!def) return null;

    const scale = getWaveScale(waveNumber);
    const isBoss = Boolean(def.boss);

    let hp = def.hp * scale.hp;
    let defense = Math.min(0.55, (def.defense ?? 0) + scale.defense);
    let speed = def.speed * scale.speed;
    let reward = Math.floor(def.reward * scale.reward);

    if (isBoss) {
      hp *= scale.bossHp;
      defense = Math.min(0.58, defense + scale.bossDefense);
      speed *= 0.92;
      reward = Math.floor(reward * 1.8);
    }

    const { root, visualScale, waveVisual, eliteRing } = await this.buildEnemyVisual(
      def,
      waveNumber,
      isBoss,
    );
    const wp = this.game.map.waypoints[0];
    root.position.set(wp.x, isBoss ? 0.85 : 0.6, wp.z);

    const hpBar = createHealthBar(
      isBoss
        ? { width: 1.6, height: 0.16, fillColor: 0xff66aa }
        : undefined,
    );
    hpBar.setRatio(1);

    const ramp = 1 + spawnProgress * 0.15;
    speed *= ramp;

    const attackScale = getEnemyAttackScale(waveNumber);
    const canAttack = canEnemyAttack(waveNumber);
    const bossAttackMult = isBoss ? 1.35 : 1;

    const enemy = {
      def,
      mesh: root,
      waveNumber,
      visualScale,
      waveVisual,
      eliteRing,
      hp,
      maxHp: hp,
      defense,
      speed,
      reward,
      isBoss,
      pathIndex: 0,
      pathT: 0,
      alive: true,
      hitFlash: 0,
      materials: collectEnemyMaterials(root),
      hpBar,
      canAttack,
      attackDamage: canAttack
        ? (def.attackDamage ?? 4) * attackScale * bossAttackMult
        : 0,
      attackRange: (def.attackRange ?? 4.2) * (isBoss ? 1.1 : 1),
      attackRate: (def.attackRate ?? 0.38) * (0.85 + attackScale * 0.3) * (isBoss ? 0.9 : 1),
      attackCooldown: Math.random() * 1.5,
      slowMultiplier: 1,
      slowTimer: 0,
    };
    this.group.add(root);
    this.group.add(hpBar.group);
    this.alive.push(enemy);
    this.syncHealthBarPosition(enemy);
    return enemy;
  }

  /** @param {object} enemy */
  syncHealthBarPosition(enemy) {
    const lift = (enemy.isBoss ? 1.35 : 1.05) * (enemy.visualScale ?? 1);
    enemy.hpBar.group.position.copy(enemy.mesh.position);
    enemy.hpBar.group.position.y += lift;
  }

  /** @param {number} dt */
  update(dt) {
    const waypoints = this.game.map.waypoints;
    if (waypoints.length < 2) return;

    const cam = this.game.camera;
    const waveActive = this.game.waves.active;

    for (let i = this.alive.length - 1; i >= 0; i--) {
      const e = this.alive[i];
      if (!e.alive) continue;

      e.hpBar.lookAtCamera(cam);
      this.syncHealthBarPosition(e);
      this.updateHitFlash(e, dt);
      this.updateSlowEffect(e, dt);
      if (e.eliteRing) e.eliteRing.rotation.z += dt * 1.8;

      if (waveActive && e.canAttack) {
        e.attackCooldown = Math.max(0, e.attackCooldown - dt);
        if (e.attackCooldown <= 0) {
          const tower = this.findTowerTarget(e);
          if (tower) {
            this.fireAtTower(e, tower);
            e.attackCooldown = 1 / e.attackRate;
          }
        }
      }

      const from = waypoints[e.pathIndex];
      const to = waypoints[Math.min(e.pathIndex + 1, waypoints.length - 1)];
      const segLen = Math.hypot(to.x - from.x, to.z - from.z) || 0.001;
      const moveSpeed = this.getMoveSpeed(e);
      const step = (moveSpeed * dt) / segLen;
      e.pathT += step;

      if (e.pathT >= 1) {
        e.pathIndex++;
        e.pathT = 0;
        if (e.pathIndex >= waypoints.length - 1) {
          this.leak(e);
          continue;
        }
      }

      const a = waypoints[e.pathIndex];
      const b = waypoints[e.pathIndex + 1];
      e.mesh.position.x = THREE.MathUtils.lerp(a.x, b.x, e.pathT);
      e.mesh.position.z = THREE.MathUtils.lerp(a.z, b.z, e.pathT);

      const dx = b.x - a.x;
      const dz = b.z - a.z;
      if (dx * dx + dz * dz > 0.0001) {
        e.mesh.rotation.y = Math.atan2(dx, dz);
      }
    }

    this.updateProjectiles(dt);
  }

  /** @param {object} enemy */
  findTowerTarget(enemy) {
    let best = null;
    let bestDist = enemy.attackRange;
    const pos = enemy.mesh.position;

    for (const tower of this.game.towers.towers) {
      if (tower.disabled || tower.hp <= 0) continue;
      const d = Math.hypot(tower.mesh.position.x - pos.x, tower.mesh.position.z - pos.z);
      if (d <= bestDist) {
        bestDist = d;
        best = tower;
      }
    }
    return best;
  }

  /**
   * @param {object} enemy
   * @param {object} tower
   */
  async fireAtTower(enemy, tower) {
    const beam = await loadModel('enemy-ufo-beam');
    const beamScale = 0.24 * (enemy.visualScale ?? 1);
    beam.scale.setScalar(beamScale);

    const origin = enemy.mesh.position.clone();
    origin.y += enemy.isBoss ? 0.75 : 0.55;
    const target = tower.mesh.position.clone();
    target.y = 0.85;
    const velocity = target.clone().sub(origin).normalize().multiplyScalar(14);

    beam.position.copy(origin);
    beam.lookAt(target);
    this.group.add(beam);

    this.projectiles.push({
      mesh: beam,
      velocity,
      damage: enemy.attackDamage,
      targetTower: tower,
      life: 2.5,
      isBeam: true,
    });
  }

  /** @param {number} dt */
  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.velocity, dt);

      const tower = p.targetTower;
      if (tower && !tower.disabled && tower.hp > 0 && this.game.towers.towers.includes(tower)) {
        const dx = p.mesh.position.x - tower.mesh.position.x;
        const dz = p.mesh.position.z - tower.mesh.position.z;
        const horiz = Math.hypot(dx, dz);
        if (horiz < 1.0) {
          this.game.towers.damageTower(tower, p.damage);
          this.game.effects.spawnBeamBurst(p.mesh.position.clone());
          this.group.remove(p.mesh);
          disposeObject3D(p.mesh);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      if (p.life <= 0) {
        this.group.remove(p.mesh);
        if (p.isBeam) disposeObject3D(p.mesh);
        else {
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  clearCombat() {
    for (const enemy of [...this.alive]) {
      this.remove(enemy);
    }
    for (const p of [...this.projectiles]) {
      this.group.remove(p.mesh);
      if (p.isBeam) disposeObject3D(p.mesh);
      else {
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      }
    }
    this.projectiles = [];
  }

  /** @param {object} enemy */
  getMoveSpeed(enemy) {
    if (enemy.slowTimer > 0) {
      return enemy.speed * (enemy.slowMultiplier ?? 1);
    }
    return enemy.speed;
  }

  /** @param {object} enemy */
  isInAnySlowTowerRange(enemy) {
    const pos = enemy.mesh.position;
    for (const tower of this.game.towers.towers) {
      if (tower.disabled || tower.hp <= 0) continue;
      if (!tower.def.slowPercent) continue;
      const stats = getTowerStats(tower);
      const d = Math.hypot(
        tower.mesh.position.x - pos.x,
        tower.mesh.position.z - pos.z,
      );
      if (d <= stats.range) return true;
    }
    return false;
  }

  /** @param {object} enemy */
  clearSlow(enemy) {
    enemy.slowTimer = 0;
    enemy.slowMultiplier = 1;
    enemy.slowDuration = 0;
    if (enemy.hitFlash > 0) return;

    const wv = enemy.waveVisual;
    for (const m of enemy.materials) {
      if (!('emissive' in m)) continue;
      if (wv) {
        m.emissive.setHex(wv.emissive);
        m.emissiveIntensity = wv.emissiveIntensity;
      } else {
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
    }
  }

  /**
   * @param {object} enemy
   * @param {number} percent 0–1 fraction slowed
   * @param {number} duration seconds
   */
  applySlow(enemy, percent, duration) {
    if (!enemy.alive) return;
    if (!this.isInAnySlowTowerRange(enemy)) return;
    const mult = Math.max(0.4, 1 - THREE.MathUtils.clamp(percent, 0, 0.6));
    enemy.slowMultiplier = enemy.slowTimer > 0
      ? Math.min(enemy.slowMultiplier, mult)
      : mult;
    enemy.slowTimer = Math.max(enemy.slowTimer, duration);
    enemy.slowDuration = Math.max(enemy.slowDuration ?? 0, duration);
  }

  /** @param {object} enemy @param {number} dt */
  updateSlowEffect(enemy, dt) {
    if (!this.isInAnySlowTowerRange(enemy)) {
      if (enemy.slowTimer > 0 || enemy.slowMultiplier < 1) {
        this.clearSlow(enemy);
      }
      return;
    }

    if (enemy.slowTimer <= 0) return;

    enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
    const wv = enemy.waveVisual;
    const slowStrength = 1 - (enemy.slowMultiplier ?? 1);
    const pulse = 0.12 + Math.sin(this.game.clock.getElapsedTime() * 8) * 0.04;

    for (const m of enemy.materials) {
      if (!('emissive' in m) || enemy.hitFlash > 0) continue;
      m.emissive.setHex(0x55ccff);
      m.emissiveIntensity = (wv?.emissiveIntensity ?? 0.05) + slowStrength * 0.35 + pulse;
    }

    if (enemy.slowTimer <= 0) {
      this.clearSlow(enemy);
    }
  }

  /** @param {object} enemy @param {number} dt */
  updateHitFlash(enemy, dt) {
    if (enemy.hitFlash <= 0) return;
    enemy.hitFlash -= dt;
    const t = THREE.MathUtils.clamp(enemy.hitFlash / 0.18, 0, 1);
    const flashColor = enemy.isBoss ? 0xff2288 : 0xff5533;
    for (const m of enemy.materials) {
      m.emissive.setHex(flashColor);
      m.emissiveIntensity = t * 0.75;
    }
    if (enemy.hitFlash <= 0) {
      const wv = enemy.waveVisual;
      for (const m of enemy.materials) {
        if (!('emissive' in m)) continue;
        if (wv) {
          m.emissive.setHex(wv.emissive);
          m.emissiveIntensity = wv.emissiveIntensity;
        } else {
          m.emissive.setHex(0x000000);
          m.emissiveIntensity = 0;
        }
      }
    }
  }

  /** @param {object} enemy */
  removeEnemyMesh(enemy) {
    this.group.remove(enemy.mesh);
    disposeObject3D(enemy.mesh);
  }

  /** @param {object} enemy */
  leak(enemy) {
    enemy.alive = false;
    this.removeEnemyMesh(enemy);
    this.group.remove(enemy.hpBar.group);
    const idx = this.alive.indexOf(enemy);
    if (idx >= 0) this.alive.splice(idx, 1);
    this.game.onEnemyLeak(enemy.def, enemy.isBoss);
  }

  /** @param {object} enemy @param {number} amount @param {number} [armorPierce] */
  damage(enemy, amount, armorPierce = 0) {
    if (!enemy.alive) return;
    const defense = (enemy.defense ?? 0) * (1 - armorPierce);
    const dealt = Math.max(1, amount * (1 - defense));
    enemy.hp -= dealt;
    enemy.hitFlash = 0.18;
    enemy.hpBar.setRatio(enemy.hp / enemy.maxHp);
    this.game.effects.spawnHitFlash(enemy.mesh.position.clone());

    if (enemy.hp <= 0) {
      this.kill(enemy);
    }
  }

  /** @param {THREE.Vector3} point @param {number} radius */
  hitTest(point, radius) {
    for (const e of this.alive) {
      if (e.mesh.position.distanceTo(point) <= radius + 0.4) return e;
    }
    return null;
  }

  /** @param {object} enemy */
  kill(enemy) {
    enemy.alive = false;
    this.game.effects.spawnDeathPuff(enemy.mesh.position.clone());
    this.remove(enemy);
    this.game.onEnemyKilled(enemy);
  }

  /** @param {object} enemy */
  remove(enemy) {
    this.removeEnemyMesh(enemy);
    this.group.remove(enemy.hpBar.group);
    const idx = this.alive.indexOf(enemy);
    if (idx >= 0) this.alive.splice(idx, 1);
  }

  get count() {
    return this.alive.length;
  }
}
