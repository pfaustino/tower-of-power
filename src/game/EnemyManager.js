import * as THREE from 'three';
import { loadModel } from './AssetLoader.js';
import { createHealthBar } from './HealthBar.js';
import { canEnemyAttack, getCrystalDrop, getEnemyAttackScale, getWaveScale } from './WaveScaling.js';
import {
  applyEnemyWaveVisual,
  collectEnemyMaterials,
  createEliteRing,
  createEnemyHitFlashOverlay,
  disposeObject3D,
  getEnemyWaveTier,
  getEnemyVisualScale,
  getWeaponModelName,
  shouldAttachWeapon,
} from './EnemyVisuals.js';
import { getTowerStats } from './TowerManager.js';

/** Min path progress between enemies (~one body length on a tile segment). */
const MIN_PATH_GAP = 0.34;

/** @type {import('three').CylinderGeometry} */
const ENEMY_BEAM_GEO = new THREE.CylinderGeometry(0.05, 0.05, 1, 5);
ENEMY_BEAM_GEO.rotateX(Math.PI / 2);

/** @param {object} p */
function releaseEnemyProjectile(p) {
  p.mesh.parent?.remove(p.mesh);
  if (p.sharedGeo) p.mesh.material?.dispose();
  else disposeObject3D(p.mesh);
}

export class EnemyManager {
  /**
   * @param {import('./Game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.alive = [];
    this.pendingSpawns = 0;
    this.defs = new Map();
    this.projectiles = [];
    /** @type {object | null} */
    this._highlightedEnemy = null;
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

    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });

    const waveVisual = applyEnemyWaveVisual(root, def, waveNumber, isBoss);
    return { root, visualScale: baseScale, waveVisual, eliteRing };
  }

  /**
   * @param {string} typeId
   * @param {number} [waveNumber]
   */
  async spawn(typeId, waveNumber = 1) {
    const def = this.defs.get(typeId);
    if (!def) return null;

    this.pendingSpawns++;
    try {
      return await this._spawnEnemy(typeId, waveNumber, def);
    } finally {
      this.pendingSpawns--;
    }
  }

  /**
   * @param {string} typeId
   * @param {number} waveNumber
   * @param {object} def
   */
  async _spawnEnemy(typeId, waveNumber, def) {
    const scale = getWaveScale(waveNumber);
    const isBoss = Boolean(def.boss);
    const diff = this.game.settings.getDifficultyProfile();

    let hp = def.hp * scale.hp * diff.enemyHp;
    let defense = Math.min(0.55, (def.defense ?? 0) + scale.defense);
    let speed = def.speed * scale.speed * diff.enemySpeed;
    let reward = Math.floor(def.reward * scale.reward);
    const crystalDrop = getCrystalDrop(def, waveNumber, isBoss, diff);

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
    const hitFlashOverlay = createEnemyHitFlashOverlay(visualScale, isBoss);
    root.add(hitFlashOverlay.mesh);
    const wp = this.game.map.waypoints[0];
    root.position.set(wp.x, isBoss ? 0.85 : 0.6, wp.z);

    const hpBar = createHealthBar(
      isBoss
        ? { width: 1.6, height: 0.16, fillColor: 0xff66aa }
        : undefined,
    );
    hpBar.setRatio(1);

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
      crystalDrop,
      isBoss,
      pathIndex: 0,
      pathT: 0,
      alive: true,
      hitFlash: 0,
      hitFlashOverlay,
      materials: collectEnemyMaterials(root),
      hpBar,
      canAttack,
      attackDamage: canAttack
        ? (def.attackDamage ?? 4) * attackScale * bossAttackMult * diff.enemyAttack
        : 0,
      attackRange: (def.attackRange ?? 4.2) * (isBoss ? 1.1 : 1),
      attackRate: (def.attackRate ?? 0.38) * (0.85 + attackScale * 0.3) * (isBoss ? 0.9 : 1),
      attackCooldown: Math.random() * 1.5,
      attackWindup: 0,
      windupTarget: null,
      telegraphRing: null,
      slowMultiplier: 1,
      slowTimer: 0,
      powerSlowTimer: 0,
      powerSlowMultiplier: 1,
    };
    this.group.add(root);
    this.group.add(hpBar.group);
    root.userData.enemy = enemy;
    this.alive.push(enemy);
    this.syncHealthBarPosition(enemy);
    if (isBoss) {
      this.game.effects.spawnBossTelegraph(root.position.clone(), 2.4);
      this.game.audio.bossTelegraph();
      this.game.ui.setMessage(`${def.name} has entered the field — watch for attack telegraphs!`);
    }
    return enemy;
  }

  /**
   * Pick the nearest enemy along a ray (click-to-inspect).
   * @param {THREE.Raycaster} raycaster
   */
  pickWithRaycaster(raycaster) {
    const roots = [];
    for (const enemy of this.alive) {
      if (enemy.alive) roots.push(enemy.mesh);
    }
    if (!roots.length) return null;
    const hits = raycaster.intersectObjects(roots, true);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj) {
        const enemy = obj.userData?.enemy;
        if (enemy?.alive) return enemy;
        obj = obj.parent;
      }
    }

    // Fallback: nearest UFO to the click ray (small models are easy to miss).
    const maxDist = 1.6;
    let best = null;
    let bestDist = maxDist;
    const point = new THREE.Vector3();
    for (const enemy of this.alive) {
      if (!enemy.alive) continue;
      raycaster.ray.closestPointToPoint(enemy.mesh.position, point);
      const dist = point.distanceTo(enemy.mesh.position);
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    return best;
  }

  /** @param {object | null} enemy */
  setSelectionHighlight(enemy) {
    if (this._highlightedEnemy && this._highlightedEnemy !== enemy) {
      this.clearSelectionHighlight(this._highlightedEnemy);
    }
    this._highlightedEnemy = enemy ?? null;
    if (!enemy?.materials) return;
    for (const mat of enemy.materials) {
      if (!mat?.emissive) continue;
      if (mat.userData._inspectEmissive == null) {
        mat.userData._inspectEmissive = mat.emissive.getHex();
        mat.userData._inspectEmissiveIntensity = mat.emissiveIntensity ?? 0;
      }
      mat.emissive.setHex(0xff6688);
      mat.emissiveIntensity = 0.55;
    }
  }

  /** @param {object} enemy */
  clearSelectionHighlight(enemy) {
    if (!enemy?.materials) return;
    for (const mat of enemy.materials) {
      if (!mat?.emissive || mat.userData._inspectEmissive == null) continue;
      mat.emissive.setHex(mat.userData._inspectEmissive);
      mat.emissiveIntensity = mat.userData._inspectEmissiveIntensity ?? 0;
      delete mat.userData._inspectEmissive;
      delete mat.userData._inspectEmissiveIntensity;
    }
    if (this._highlightedEnemy === enemy) this._highlightedEnemy = null;
  }

  /** @param {object} enemy */
  syncHealthBarPosition(enemy) {
    const lift = (enemy.isBoss ? 1.35 : 1.05) * (enemy.visualScale ?? 1);
    enemy.hpBar.group.position.copy(enemy.mesh.position);
    enemy.hpBar.group.position.y += lift;
  }

  /** @param {object} enemy */
  getPathProgress(enemy) {
    return enemy.pathIndex + enemy.pathT;
  }

  /**
   * Nearest enemy ahead on the path — O(n log n) for the whole wave.
   * @returns {Map<object, object | null>}
   */
  buildLeaderMap() {
    /** @type {{ e: object, p: number, i: number }[]} */
    const entries = [];
    for (let i = 0; i < this.alive.length; i++) {
      const e = this.alive[i];
      if (!e.alive) continue;
      entries.push({ e, p: e.pathIndex + e.pathT, i });
    }
    entries.sort((a, b) => (b.p !== a.p ? b.p - a.p : a.i - b.i));

    const leaders = new Map();
    for (let j = 1; j < entries.length; j++) {
      leaders.set(entries[j].e, entries[j - 1].e);
    }
    return leaders;
  }

  /** @param {number} dt */
  update(dt) {
    const waypoints = this.game.map.waypoints;
    if (waypoints.length < 2) return;

    const cam = this.game.camera;
    const waveActive = this.game.waves.active;
    const leaders = this.buildLeaderMap();

    for (let i = this.alive.length - 1; i >= 0; i--) {
      const e = this.alive[i];
      if (!e.alive) continue;

      e.hpBar.lookAtCamera(cam);
      this.syncHealthBarPosition(e);
      this.updateHitFlash(e, dt);
      this.updateSlowEffect(e, dt);
      this.updatePowerSlow(e, dt);
      if (e.eliteRing) e.eliteRing.rotation.z += dt * 1.8;
      this.updateBossTelegraph(e, dt);

      if (waveActive && e.canAttack) {
        if (e.attackWindup > 0) {
          e.attackWindup = Math.max(0, e.attackWindup - dt);
          if (e.attackWindup <= 0 && e.windupTarget) {
            const target = e.windupTarget;
            this.clearBossTelegraph(e);
            if (!target.disabled && target.hp > 0 && this.game.towers.towers.includes(target)) {
              this.fireAtTower(e, target);
            }
            e.attackCooldown = 1 / e.attackRate;
            e.windupTarget = null;
          }
        } else {
          e.attackCooldown = Math.max(0, e.attackCooldown - dt);
          if (e.attackCooldown <= 0) {
            const tower = this.findTowerTarget(e);
            if (tower) {
              if (e.isBoss) {
                e.attackWindup = 0.9;
                e.windupTarget = tower;
                this.beginBossTelegraph(e, tower);
              } else {
                this.fireAtTower(e, tower);
                e.attackCooldown = 1 / e.attackRate;
              }
            }
          }
        }
      }

      const from = waypoints[e.pathIndex];
      const to = waypoints[Math.min(e.pathIndex + 1, waypoints.length - 1)];
      const segLen = Math.hypot(to.x - from.x, to.z - from.z) || 0.001;
      const moveSpeed = this.getMoveSpeed(e);
      let step = (moveSpeed * dt) / segLen;

      const leader = leaders.get(e);
      if (leader) {
        const gap = this.getPathProgress(leader) - this.getPathProgress(e);
        step = Math.min(step, Math.max(0, gap - MIN_PATH_GAP));
      }

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
  fireAtTower(enemy, tower) {
    const mat = new THREE.MeshBasicMaterial({
      color: enemy.isBoss ? 0xff3366 : 0xff6688,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(ENEMY_BEAM_GEO, mat);

    const origin = enemy.mesh.position.clone();
    origin.y += enemy.isBoss ? 0.75 : 0.55;
    const target = tower.mesh.position.clone();
    target.y = 0.85;
    const velocity = target.clone().sub(origin);
    const length = velocity.length();
    velocity.normalize().multiplyScalar(14);

    beam.position.copy(origin);
    beam.scale.set(1, 1, Math.max(0.4, length * 0.15));
    beam.lookAt(target);
    this.group.add(beam);

    this.projectiles.push({
      mesh: beam,
      sharedGeo: true,
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
          this.game.effects.spawnBeamBurst(p.mesh.position);
          releaseEnemyProjectile(p);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      if (p.life <= 0) {
        releaseEnemyProjectile(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  clearCombat() {
    for (const enemy of [...this.alive]) {
      this.remove(enemy);
    }
    for (const p of [...this.projectiles]) {
      releaseEnemyProjectile(p);
    }
    this.projectiles = [];
  }

  /** @param {object} enemy */
  getMoveSpeed(enemy) {
    let speed = enemy.speed;
    if ((enemy.powerSlowTimer ?? 0) > 0) {
      speed *= enemy.powerSlowMultiplier ?? 0.3;
    } else if (enemy.slowTimer > 0) {
      speed *= enemy.slowMultiplier ?? 1;
    }
    return speed;
  }

  /**
   * @param {object} enemy
   * @param {object} tower
   */
  beginBossTelegraph(enemy, tower) {
    this.clearBossTelegraph(enemy);
    this.game.audio.bossTelegraph();
    this.game.effects.spawnBossTelegraph(tower.mesh.position.clone(), 1.8);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.95, 28),
      new THREE.MeshBasicMaterial({
        color: 0xff2244,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(tower.mesh.position.x, 0.7, tower.mesh.position.z);
    this.group.add(ring);
    enemy.telegraphRing = ring;
    this.game.ui.setMessage(`${enemy.def.name} locking onto ${tower.def.name}!`);
  }

  /** @param {object} enemy @param {number} dt */
  updateBossTelegraph(enemy, dt) {
    const ring = enemy.telegraphRing;
    if (!ring) return;
    const pulse = 0.7 + Math.sin(this.game.clock.getElapsedTime() * 14) * 0.3;
    ring.scale.setScalar(0.85 + (1 - Math.min(1, enemy.attackWindup / 0.9)) * 0.55);
    if (ring.material) ring.material.opacity = 0.45 + pulse * 0.45;
    if (enemy.windupTarget?.mesh) {
      ring.position.x = enemy.windupTarget.mesh.position.x;
      ring.position.z = enemy.windupTarget.mesh.position.z;
    }
  }

  /** @param {object} enemy */
  clearBossTelegraph(enemy) {
    if (!enemy.telegraphRing) return;
    this.group.remove(enemy.telegraphRing);
    enemy.telegraphRing.material?.dispose?.();
    enemy.telegraphRing = null;
  }

  /** @param {object} enemy @param {number} dt */
  updatePowerSlow(enemy, dt) {
    if ((enemy.powerSlowTimer ?? 0) <= 0) return;
    enemy.powerSlowTimer = Math.max(0, enemy.powerSlowTimer - dt);
    if (enemy.hitFlash <= 0 && this.game.selectedEnemy !== enemy) {
      const pulse = 0.2 + Math.sin(this.game.clock.getElapsedTime() * 10) * 0.08;
      for (const m of enemy.materials) {
        if (!('emissive' in m)) continue;
        m.emissive.setHex(0x66eeff);
        m.emissiveIntensity = 0.35 + pulse;
      }
    }
    if (enemy.powerSlowTimer <= 0) {
      enemy.powerSlowMultiplier = 1;
      if (enemy.slowTimer <= 0) this.clearSlow(enemy);
    }
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
    if (this.game.selectedEnemy === enemy) {
      for (const m of enemy.materials) {
        if (!('emissive' in m)) continue;
        m.emissive.setHex(0xff6688);
        m.emissiveIntensity = 0.55;
      }
      return;
    }

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
    if (this.game.selectedEnemy !== enemy && enemy.hitFlash <= 0) {
      const wv = enemy.waveVisual;
      const slowStrength = 1 - (enemy.slowMultiplier ?? 1);
      const pulse = 0.12 + Math.sin(this.game.clock.getElapsedTime() * 8) * 0.04;
      for (const m of enemy.materials) {
        if (!('emissive' in m)) continue;
        m.emissive.setHex(0x55ccff);
        m.emissiveIntensity = (wv?.emissiveIntensity ?? 0.05) + slowStrength * 0.35 + pulse;
      }
    }

    if (enemy.slowTimer <= 0) {
      this.clearSlow(enemy);
    }
  }

  /** @param {object} enemy @param {number} dt */
  updateHitFlash(enemy, dt) {
    const overlay = enemy.hitFlashOverlay;
    if (enemy.hitFlash <= 0) {
      if (overlay?.mesh.visible) {
        overlay.mesh.visible = false;
        overlay.mat.opacity = 0;
      }
      return;
    }

    enemy.hitFlash -= dt;
    const t = THREE.MathUtils.clamp(enemy.hitFlash / 0.18, 0, 1);
    if (overlay) {
      overlay.mesh.visible = true;
      overlay.mat.opacity = t * 0.55;
    }

    if (enemy.hitFlash <= 0 && overlay) {
      overlay.mesh.visible = false;
      overlay.mat.opacity = 0;
    }
  }

  /** @param {object} enemy */
  removeEnemyMesh(enemy) {
    if (enemy.hitFlashOverlay) {
      enemy.mesh.remove(enemy.hitFlashOverlay.mesh);
      enemy.hitFlashOverlay.mat.dispose();
    }
    this.group.remove(enemy.mesh);
    disposeObject3D(enemy.mesh);
  }

  /** @param {object} enemy */
  leak(enemy) {
    enemy.alive = false;
    if (this.game.selectedEnemy === enemy) {
      this.game.deselectEnemy();
    } else {
      this.clearSelectionHighlight(enemy);
    }
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

    if (enemy.hp <= 0) {
      this.kill(enemy);
    }
  }

  /**
   * Damage-over-time (no per-tick minimum — avoids burn becoming ~60 DPS at 60fps).
   * @param {object} enemy
   * @param {number} amount
   */
  applyBurnDamage(enemy, amount) {
    if (!enemy.alive || amount <= 0) return;
    const defense = enemy.defense ?? 0;
    const dealt = amount * (1 - defense);
    if (dealt <= 0) return;
    enemy.hp -= dealt;
    enemy.hitFlash = Math.max(enemy.hitFlash ?? 0, 0.05);
    enemy.hpBar.setRatio(Math.max(0, enemy.hp / enemy.maxHp));
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
    const pos = enemy.mesh.position.clone();
    this.game.effects.spawnDeathPuff(pos);
    this.remove(enemy);
    this.game.onEnemyKilled(enemy, pos);
  }

  /** @param {object} enemy */
  remove(enemy) {
    this.clearBossTelegraph(enemy);
    if (this.game.selectedEnemy === enemy) {
      this.game.deselectEnemy();
    } else {
      this.clearSelectionHighlight(enemy);
    }
    this.removeEnemyMesh(enemy);
    this.group.remove(enemy.hpBar.group);
    const idx = this.alive.indexOf(enemy);
    if (idx >= 0) this.alive.splice(idx, 1);
  }

  get count() {
    return this.alive.length;
  }

  /** Enemies still on the path or loading in from the current wave spawn queue. */
  get hasOnField() {
    return this.alive.length > 0 || this.pendingSpawns > 0;
  }
}
