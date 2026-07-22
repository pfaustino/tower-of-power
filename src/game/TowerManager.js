import * as THREE from 'three';
import { loadModel } from './AssetLoader.js';
import { fitTowerModel } from './ModelFit.js';
import { createHealthBar, createLevelLabel } from './HealthBar.js';
import {
  applyTowerUpgradeVisual,
  collectTowerMaterials,
  disposeObject3D,
  getBodyModelForLevel,
  getUpgradeScale,
} from './TowerVisuals.js';

const GRAVITY = -22;

/** @param {object} tower */
export function getTowerStats(tower) {
  const def = tower.def;
  const lvl = tower.level ?? 1;
  const steps = lvl - 1;
  return {
    range: def.range + steps * 0.35,
    damage: def.damage * (1 + steps * 0.17),
    fireRate: def.fireRate * (1 + steps * 0.075),
    oilRadius: (def.oilRadius ?? 2) + steps * 0.1,
    oilDuration: def.oilDuration ?? 5,
    oilBurnDps: (def.oilBurnDps ?? 10) * (1 + steps * 0.14),
    slowPercent: def.slowPercent
      ? Math.min(0.6, def.slowPercent * (1 + steps * 0.1))
      : 0,
    slowDuration: def.slowDuration
      ? def.slowDuration * (1 + steps * 0.08)
      : 0,
  };
}

/** @param {object} tower */
export function getUpgradeCost(tower) {
  const maxLevel = tower.def.maxLevel ?? 10;
  if (tower.level >= maxLevel) return null;
  return Math.floor(tower.def.cost * (0.45 + tower.level * 0.42));
}

/** @param {object} tower */
export function getRepairCost(tower) {
  const missing = tower.maxHp - tower.hp;
  if (missing <= 0) return 0;
  return Math.max(5, Math.ceil(missing * 0.25));
}

/** @param {object[]} towers */
export function getRepairAllCost(towers) {
  let total = 0;
  for (const tower of towers) total += getRepairCost(tower);
  return total;
}

/**
 * @param {THREE.Vector3} origin
 * @param {THREE.Vector3} target
 * @param {number} gravity
 */
function solveBallisticVelocity(origin, target, gravity) {
  const g = Math.abs(gravity);
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const dy = target.y - origin.y;
  const horiz = Math.hypot(dx, dz);
  if (horiz < 0.05) {
    return new THREE.Vector3(0, 8, 0);
  }

  const angle = Math.PI / 4.2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const denom = 2 * cos * cos * (horiz * Math.tan(angle) - dy);
  let v = denom > 0.05 ? Math.sqrt((g * horiz * horiz) / denom) : 14;
  v = THREE.MathUtils.clamp(v, 9, 22);

  return new THREE.Vector3(
    (dx / horiz) * v * cos,
    v * sin,
    (dz / horiz) * v * cos,
  );
}

export class TowerManager {
  /**
   * @param {import('./Game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    this.towers = [];
    this.group = new THREE.Group();
    this.projectiles = [];
    this.placementGhost = null;
    this.rangeRing = null;
  }

  /**
   * @param {object} def
   * @param {number} [level]
   */
  async buildTowerVisual(def, level = 1) {
    const root = new THREE.Group();
    const tileSize = this.game.map.tileSize;
    const bodyName = getBodyModelForLevel(def, level);
    const base = await loadModel(def.models.base);
    const body = await loadModel(bodyName);
    const weapon = await loadModel(def.models.weapon);

    fitTowerModel(base, tileSize);
    fitTowerModel(body, tileSize);
    fitTowerModel(weapon, tileSize);

    body.position.y = 0.12;
    weapon.position.y = 0.45;
    weapon.scale.multiplyScalar(0.85);

    root.add(base, body, weapon);
    applyTowerUpgradeVisual(root, def, level);
    return { root, weapon, body, bodyName };
  }

  /** @param {THREE.Object3D} root */
  applyGhostMaterial(root) {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.material) return;
      const m = obj.material.clone();
      m.transparent = true;
      m.opacity = 0.52;
      if ('emissive' in m) {
        m.emissive = m.emissive?.clone?.() ?? new THREE.Color(0x000000);
        m.emissiveIntensity = 0;
      }
      obj.material = m;
    });
  }

  /** @param {object} def */
  async showPlacementGhost(def) {
    this.hidePlacementGhost();
    const { root } = await this.buildTowerVisual(def);
    this.applyGhostMaterial(root);
    this.placementGhost = root;
    this.placementGhost.visible = false;
    this.group.add(root);
  }

  hidePlacementGhost() {
    if (!this.placementGhost) return;
    this.group.remove(this.placementGhost);
    this.placementGhost.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) obj.material.dispose();
    });
    this.placementGhost = null;
  }

  /**
   * @param {number} gx
   * @param {number} gz
   * @param {boolean} valid
   */
  updatePlacementGhost(gx, gz, valid) {
    if (!this.placementGhost) return;
    if (gx < 0 || gz < 0) {
      this.placementGhost.visible = false;
      return;
    }
    this.placementGhost.visible = true;
    const world = this.game.map.gridToWorld(gx, gz);
    this.placementGhost.position.copy(world);
    this.placementGhost.position.y = 0;
    const tint = valid ? 0x44ff88 : 0xff4444;
    const intensity = valid ? 0.12 : 0.32;
    this.placementGhost.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material && 'emissive' in obj.material) {
        obj.material.emissive.setHex(tint);
        obj.material.emissiveIntensity = intensity;
      }
    });
  }

  /**
   * @param {object} def
   * @param {number} gx
   * @param {number} gz
   */
  async place(def, gx, gz) {
    const { root, weapon, body, bodyName } = await this.buildTowerVisual(def, 1);

    const world = this.game.map.gridToWorld(gx, gz);
    root.position.copy(world);
    root.position.y = 0;

    this.group.add(root);
    this.game.map.occupy(gx, gz);

    const hpBar = createHealthBar({ width: 0.85, height: 0.1, fillColor: 0x5ce1ff });
    hpBar.setRatio(1);
    this.group.add(hpBar.group);

    const levelLabel = createLevelLabel(1);
    this.group.add(levelLabel.sprite);

    const tower = {
      def,
      gx,
      gz,
      mesh: root,
      cooldown: 0,
      weapon,
      weaponBaseScale: weapon.scale.x,
      bodyMesh: body,
      bodyName,
      level: 1,
      hp: def.maxHp ?? 100,
      maxHp: def.maxHp ?? 100,
      hpBar,
      levelLabel,
      hitFlash: 0,
      materials: [],
      disabled: false,
    };
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) tower.materials.push(obj.material);
    });
    this.syncTowerOverlays(tower);
    this.syncTowerHpBarVisibility(tower);
    this.towers.push(tower);
    return tower;
  }

  /** @param {object} tower */
  async refreshTowerVisuals(tower) {
    await this.swapTowerBodyIfNeeded(tower);
    applyTowerUpgradeVisual(tower.mesh, tower.def, tower.level);
    tower.materials = collectTowerMaterials(tower.mesh);
    if (tower.disabled) {
      this.setTowerInertVisual(tower, true);
    }
    this.syncTowerOverlays(tower);
  }

  /** @param {object} tower */
  async swapTowerBodyIfNeeded(tower) {
    const bodyName = getBodyModelForLevel(tower.def, tower.level);
    if (tower.bodyName === bodyName) return;

    const tileSize = this.game.map.tileSize;
    const newBody = await loadModel(bodyName);
    fitTowerModel(newBody, tileSize);
    newBody.position.y = 0.12;

    if (tower.bodyMesh) {
      tower.mesh.remove(tower.bodyMesh);
      disposeObject3D(tower.bodyMesh);
    }

    tower.mesh.add(newBody);
    tower.bodyMesh = newBody;
    tower.bodyName = bodyName;
  }

  /** @param {object} tower */
  syncTowerOverlays(tower) {
    if (!tower.mesh) return;
    const pos = tower.mesh.position;
    const scale = getUpgradeScale(tower.level, tower.def.maxLevel ?? 10);
    tower.hpBar.group.position.set(pos.x, pos.y + 1.55 * scale, pos.z);
    tower.levelLabel.sprite.position.set(pos.x, pos.y + 1.15 * scale, pos.z);
    tower.levelLabel.sprite.scale.set(0.48 * scale, 0.48 * scale, 1);
  }

  /** @param {object} tower */
  syncTowerHpBarVisibility(tower) {
    tower.hpBar.group.visible = tower.hp < tower.maxHp;
  }

  /**
   * @param {number} gx
   * @param {number} gz
   */
  pickAt(gx, gz) {
    return this.towers.find((t) => t.gx === gx && t.gz === gz) ?? null;
  }

  ensureRangeRing() {
    if (this.rangeRing) return;

    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x5ce1ff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 64), fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.renderOrder = 10;

    const edgeMat = new THREE.MeshBasicMaterial({
      color: 0x8ef4ff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), edgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.renderOrder = 11;

    this.rangeRing = new THREE.Group();
    this.rangeRing.frustumCulled = false;
    this.rangeRing.add(fill, edge);
    this.rangeRing.visible = false;
    this.game.scene.add(this.rangeRing);
  }

  /** @param {object | null} tower */
  showRangeRing(tower) {
    this.ensureRangeRing();
    if (!tower) {
      this.rangeRing.visible = false;
      return;
    }
    const stats = getTowerStats(tower);
    const radius = stats.range;
    const world = new THREE.Vector3();
    tower.mesh.getWorldPosition(world);
    this.rangeRing.position.set(world.x, 0.14, world.z);
    this.rangeRing.scale.set(radius, 1, radius);
    this.rangeRing.visible = true;
  }

  hideRangeRing() {
    if (this.rangeRing) this.rangeRing.visible = false;
  }

  /** @param {object | null} tower */
  setSelectionHighlight(tower) {
    for (const t of this.towers) {
      const active = t === tower;
      t.mesh.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) || !obj.material || !('emissive' in obj.material)) return;
        if (!obj.userData.baseEmissive) {
          obj.userData.baseEmissive = obj.material.emissive.getHex();
          obj.userData.baseEmissiveIntensity = obj.material.emissiveIntensity ?? 0;
        }
        if (active) {
          obj.material.emissive.setHex(0x5ce1ff);
          obj.material.emissiveIntensity = 0.22;
        } else {
          obj.material.emissive.setHex(obj.userData.baseEmissive);
          obj.material.emissiveIntensity = obj.userData.baseEmissiveIntensity;
        }
      });
    }
  }

  /** @param {object} tower */
  async upgrade(tower) {
    const maxLevel = tower.def.maxLevel ?? 10;
    if (tower.level >= maxLevel) return false;
    tower.level += 1;
    tower.maxHp = Math.floor((tower.def.maxHp ?? 100) * (1 + (tower.level - 1) * 0.11));
    tower.hp = Math.min(tower.maxHp, tower.hp + Math.floor(tower.maxHp * 0.2));
    await this.refreshTowerVisuals(tower);
    tower.levelLabel.setLevel(tower.level);
    tower.hpBar.setRatio(tower.hp / tower.maxHp);
    this.syncTowerHpBarVisibility(tower);
    return true;
  }

  /** @param {object} tower */
  repair(tower) {
    if (tower.hp >= tower.maxHp && !tower.disabled) return false;
    tower.hp = tower.maxHp;
    if (tower.disabled) {
      tower.disabled = false;
      this.setTowerInertVisual(tower, false);
    }
    applyTowerUpgradeVisual(tower.mesh, tower.def, tower.level);
    tower.materials = collectTowerMaterials(tower.mesh);
    tower.hpBar.setRatio(1);
    this.syncTowerHpBarVisibility(tower);
    return true;
  }

  /**
   * @param {object} tower
   * @param {boolean} inert
   */
  setTowerInertVisual(tower, inert) {
    tower.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.material) return;
      if (inert) {
        if (!obj.userData.inertSaved) {
          obj.userData.inertSaved = {
            opacity: obj.material.opacity ?? 1,
            transparent: obj.material.transparent ?? false,
            emissive: obj.material.emissive?.getHex?.() ?? 0,
            emissiveIntensity: obj.material.emissiveIntensity ?? 0,
          };
        }
        obj.material.transparent = true;
        obj.material.opacity = 0.42;
        if ('emissive' in obj.material) {
          obj.material.emissive.setHex(0x111122);
          obj.material.emissiveIntensity = 0.05;
        }
      } else {
        const saved = obj.userData.inertSaved;
        if (!saved) return;
        obj.material.opacity = saved.opacity;
        obj.material.transparent = saved.transparent;
        if ('emissive' in obj.material) {
          obj.material.emissive.setHex(saved.emissive);
          obj.material.emissiveIntensity = saved.emissiveIntensity;
        }
        delete obj.userData.inertSaved;
      }
    });
  }

  /** @param {object} tower */
  disableTower(tower) {
    if (tower.disabled) return;
    tower.disabled = true;
    tower.hp = 0;
    tower.cooldown = 0;
    tower.hpBar.setRatio(0);
    tower.hpBar.group.visible = true;
    this.setTowerInertVisual(tower, true);
    this.game.ui.setMessage(`${tower.def.name} disabled — repair to restore`);
  }

  /**
   * @param {object} tower
   * @param {number} amount
   */
  damageTower(tower, amount) {
    if (!tower || tower.disabled || tower.hp <= 0) return;
    tower.hp = Math.max(0, tower.hp - amount);
    tower.hitFlash = 0.2;
    tower.hpBar.setRatio(tower.hp / tower.maxHp);
    this.syncTowerHpBarVisibility(tower);
    this.game.effects.spawnHitFlash(tower.mesh.position.clone());
    if (tower.hp <= 0) this.disableTower(tower);
  }

  /**
   * @param {object} tower
   * @param {{ silent?: boolean }} [options]
   */
  destroyTower(tower, options = {}) {
    const silent = options.silent ?? false;
    if (this.game.selectedPlacedTower === tower) {
      this.game.deselectPlacedTower();
    }
    const pos = tower.mesh.position.clone();
    this.group.remove(tower.mesh);
    this.group.remove(tower.hpBar.group);
    this.group.remove(tower.levelLabel.sprite);
    tower.mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      }
    });
    this.game.map.free(tower.gx, tower.gz);
    const idx = this.towers.indexOf(tower);
    if (idx >= 0) this.towers.splice(idx, 1);
    if (!silent) {
      this.game.effects.spawnDeathPuff(pos);
      this.game.ui.setMessage(`${tower.def.name} destroyed!`);
    }
  }

  /** @param {object} tower */
  triggerTowerPulse(tower) {
    tower.pulseAnim = { age: 0, duration: 0.22 };
    const stats = getTowerStats(tower);
    const pos = tower.mesh.position.clone();
    this.game.effects.spawnTurretPulse(pos, stats.range * 0.9);
  }

  /** @param {object} tower @param {number} dt */
  updateTowerPulse(tower, dt) {
    if (!tower.pulseAnim || !tower.weapon) return;

    tower.pulseAnim.age += dt;
    const t = tower.pulseAnim.age / tower.pulseAnim.duration;
    const kick = Math.sin(Math.min(t, 1) * Math.PI);
    const base = tower.weaponBaseScale ?? tower.weapon.scale.x;
    tower.weapon.scale.setScalar(base * (1 + kick * 0.2));

    tower.weapon.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.material || !('emissive' in obj.material)) return;
      obj.material.emissive.setHex(0x55eeff);
      obj.material.emissiveIntensity = kick * 0.65;
    });

    if (tower.pulseAnim.age >= tower.pulseAnim.duration) {
      tower.pulseAnim = null;
      tower.weapon.scale.setScalar(base);
      tower.weapon.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) || !obj.material || !('emissive' in obj.material)) return;
        if (obj.userData.baseEmissive !== undefined) {
          obj.material.emissive.setHex(obj.userData.baseEmissive);
          obj.material.emissiveIntensity = obj.userData.baseEmissiveIntensity ?? 0;
        } else {
          obj.material.emissive.setHex(0x000000);
          obj.material.emissiveIntensity = 0;
        }
      });
    }
  }

  /** @param {object} tower @param {number} dt */
  updateTowerHitFlash(tower, dt) {
    if (tower.hitFlash <= 0) return;
    tower.hitFlash -= dt;
    const t = THREE.MathUtils.clamp(tower.hitFlash / 0.2, 0, 1);
    for (const m of tower.materials) {
      if (!('emissive' in m)) continue;
      m.emissive.setHex(0xff5533);
      m.emissiveIntensity = t * 0.65;
    }
    if (tower.hitFlash <= 0) {
      for (const m of tower.materials) {
        if (!('emissive' in m)) continue;
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
    }
  }

  /**
   * Predict where an enemy will be after flightTime seconds.
   * @param {object} enemy
   * @param {number} flightTime
   */
  predictEnemyPosition(enemy, flightTime) {
    const wps = this.game.map.waypoints;
    let idx = enemy.pathIndex;
    let t = enemy.pathT;
    let remaining = (enemy.speed ?? enemy.def.speed) * flightTime;

    while (remaining > 0 && idx < wps.length - 1) {
      const a = wps[idx];
      const b = wps[idx + 1];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z) || 0.001;
      const segRem = (1 - t) * segLen;
      if (remaining <= segRem) {
        t += remaining / segLen;
        remaining = 0;
      } else {
        remaining -= segRem;
        idx++;
        t = 0;
      }
    }

    const a = wps[Math.min(idx, wps.length - 2)];
    const b = wps[Math.min(idx + 1, wps.length - 1)];
    return new THREE.Vector3(
      THREE.MathUtils.lerp(a.x, b.x, t),
      0.6,
      THREE.MathUtils.lerp(a.z, b.z, t),
    );
  }

  /** @param {number} dt */
  update(dt) {
    const selected = this.game.selectedPlacedTower;
    if (selected?.mesh && !selected.disabled) {
      this.showRangeRing(selected);
    } else {
      this.hideRangeRing();
    }

    const cam = this.game.camera;
    for (const tower of this.towers) {
      if (tower.hpBar.group.visible) {
        tower.hpBar.lookAtCamera(cam);
      }
      tower.levelLabel.lookAtCamera(cam);
      this.syncTowerOverlays(tower);
      this.updateTowerHitFlash(tower, dt);
      this.updateTowerPulse(tower, dt);

      if (tower.disabled || tower.hp <= 0) continue;

      tower.cooldown = Math.max(0, tower.cooldown - dt);
      const stats = getTowerStats(tower);
      const target = this.findTarget(tower, stats.range);
      if (!target) continue;

      const dir = new THREE.Vector3()
        .subVectors(target.mesh.position, tower.mesh.position)
        .setY(0);
      if (dir.lengthSq() > 0.01) {
        tower.weapon.rotation.y = Math.atan2(dir.x, dir.z);
      }

      if (tower.cooldown <= 0) {
        this.fire(tower, target, stats);
        tower.cooldown = tower.def.attackType === 'oil'
          ? (tower.def.oilCooldown ?? 5)
          : 1 / stats.fireRate;
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      p.velocity.y += (p.gravity ?? 0) * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.life -= dt;

      const canHit = p.age >= (p.minAge ?? 0.1);
      const splash = p.splashRadius ?? 0;
      const isBallistic = (p.gravity ?? 0) !== 0;
      const isOil = p.attackType === 'oil';

      let shouldExplode = false;
      let directHit = null;

      if (canHit) {
        directHit = this.game.enemies.hitTest(p.mesh.position, p.size + 0.3);
        if (directHit) shouldExplode = true;

        if (isBallistic && p.aimPoint) {
          const distAim = Math.hypot(
            p.mesh.position.x - p.aimPoint.x,
            p.mesh.position.z - p.aimPoint.z,
          );
          const descending = p.velocity.y < 0;
          if (descending && distAim < 0.85 && p.mesh.position.y < 1.1) {
            shouldExplode = true;
          }
          if (!isOil && descending && splash > 0 && this.anyEnemyInSplash(p.mesh.position, splash * 0.9)) {
            shouldExplode = true;
          }
        } else if (!isBallistic) {
          const hitGround = p.mesh.position.y <= (p.groundY ?? 0.25);
          if (hitGround) shouldExplode = true;
        }
      }

      if (shouldExplode) {
        this.explodeProjectile(p, directHit);
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.life <= 0) {
        if (isBallistic && splash > 0) this.explodeProjectile(p, null);
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  /**
   * @param {THREE.Vector3} point
   * @param {number} radius
   */
  anyEnemyInSplash(point, radius) {
    for (const enemy of this.game.enemies.alive) {
      const d = Math.hypot(
        enemy.mesh.position.x - point.x,
        enemy.mesh.position.z - point.z,
      );
      if (d <= radius) return true;
    }
    return false;
  }

  /** @param {object} p @param {object | null} directHit */
  explodeProjectile(p, directHit) {
    if (p.attackType === 'oil') {
      const pos = p.mesh.position;
      this.game.effects.spawnOilPatch(
        pos.x,
        pos.z,
        p.oilRadius ?? 2,
        p.oilDuration ?? 5,
        p.oilBurnDps ?? 10,
      );
      this.game.audio?.impact('oil');
      return;
    }

    const splash = p.splashRadius ?? 0;
    const pierce = p.armorPierce ?? 0;
    const kind = p.attackType ?? (splash > 0 ? 'ballistic' : 'direct');
    this.game.audio?.impact(kind);

    if (splash > 0) {
      this.game.effects.spawnSplash(p.mesh.position.clone(), splash);
    }

    if (splash <= 0) {
      if (directHit) {
        this.game.enemies.damage(directHit, p.damage, pierce);
        this.applyProjectileSlow(directHit, p);
      }
      return;
    }

    for (const enemy of this.game.enemies.alive) {
      const d = Math.hypot(
        enemy.mesh.position.x - p.mesh.position.x,
        enemy.mesh.position.z - p.mesh.position.z,
      );
      if (d <= splash) {
        const mult = 1 - (d / splash) * 0.35;
        this.game.enemies.damage(enemy, p.damage * mult, pierce);
        this.applyProjectileSlow(enemy, p);
      }
    }
  }

  /**
   * @param {object} enemy
   * @param {object} projectile
   */
  applyProjectileSlow(enemy, projectile) {
    const percent = projectile.slowPercent ?? 0;
    const duration = projectile.slowDuration ?? 0;
    if (percent > 0 && duration > 0) {
      this.game.enemies.applySlow(enemy, percent, duration);
    }
  }

  /** @param {object} tower @param {number} range */
  findTarget(tower, range) {
    let best = null;
    let bestScore = -1;
    const pos = tower.mesh.position;

    for (const enemy of this.game.enemies.alive) {
      const d = pos.distanceTo(enemy.mesh.position);
      if (d > range) continue;
      const score = enemy.pathIndex * 1000 + enemy.pathT;
      if (score > bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  /** @param {object} tower @param {object} target @param {{ damage: number }} stats */
  fire(tower, target, stats) {
    const def = tower.def;
    const attackType = def.attackType ?? (def.splashRadius ? 'ballistic' : 'direct');
    const isBallistic = attackType === 'ballistic' || attackType === 'oil';
    this.game.audio?.shoot(attackType === 'oil' ? 'oil' : attackType);

    if (attackType === 'turret') {
      this.triggerTowerPulse(tower);
    }

    const size = def.projectileSize ?? 0.12;
    const geo = new THREE.SphereGeometry(size, 8, 8);
    const emissive = attackType === 'oil' ? 0x331100
      : isBallistic ? 0x553300
        : attackType === 'turret' ? 0x113355
          : 0x443300;
    const mat = new THREE.MeshStandardMaterial({
      color: def.projectileColor ?? 0xffe566,
      emissive,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(tower.mesh.position);
    mesh.position.y = 0.85;
    this.group.add(mesh);

    let velocity;
    let aimPoint = null;

    if (isBallistic) {
      const dist = Math.hypot(
        target.mesh.position.x - mesh.position.x,
        target.mesh.position.z - mesh.position.z,
      );
      const flightTime = THREE.MathUtils.clamp(dist / 7, 0.45, 1.5);
      aimPoint = this.predictEnemyPosition(target, flightTime);
      if (attackType === 'oil') {
        aimPoint.y = 0.55;
      }
      velocity = solveBallisticVelocity(mesh.position, aimPoint, GRAVITY);
    } else {
      const toTarget = new THREE.Vector3().subVectors(target.mesh.position, mesh.position);
      velocity = toTarget.normalize().multiplyScalar(def.projectileSpeed);
    }

    this.projectiles.push({
      mesh,
      velocity,
      gravity: isBallistic ? GRAVITY : 0,
      damage: stats.damage,
      splashRadius: def.splashRadius ?? 0,
      armorPierce: def.armorPierce ?? 0,
      oilRadius: stats.oilRadius,
      oilDuration: stats.oilDuration,
      oilBurnDps: stats.oilBurnDps,
      slowPercent: stats.slowPercent ?? 0,
      slowDuration: stats.slowDuration ?? 0,
      attackType,
      aimPoint,
      size,
      life: 4,
      age: 0,
      minAge: 0.15,
      groundY: 0.2,
    });
  }
}
