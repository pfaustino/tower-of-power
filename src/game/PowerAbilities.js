import * as THREE from 'three';

/** @typedef {'freeze' | 'strike' | 'overclock'} AbilityId */

export const STRIKE_RADIUS = 3.6;

/** @type {Record<AbilityId, { id: AbilityId, name: string, hotkey: string, cost: number, cooldown: number, duration?: number, blurb: string }>} */
export const ABILITY_DEFS = {
  freeze: {
    id: 'freeze',
    name: 'Freeze',
    hotkey: 'Q',
    cost: 40,
    cooldown: 16,
    duration: 4,
    blurb: 'Instant — freezes the whole lane (no aim)',
  },
  strike: {
    id: 'strike',
    name: 'Strike',
    hotkey: 'W',
    cost: 55,
    cooldown: 20,
    blurb: 'Aim — click the board to drop an orbital strike',
  },
  overclock: {
    id: 'overclock',
    name: 'Overclock',
    hotkey: 'E',
    cost: 45,
    cooldown: 18,
    duration: 6,
    blurb: 'Instant — overcharges every tower (no aim)',
  },
};

export const ABILITY_LIST = Object.values(ABILITY_DEFS);

export class PowerAbilities {
  /**
   * @param {import('./Game.js').Game} game
   */
  constructor(game) {
    this.game = game;
    /** @type {Record<AbilityId, number>} */
    this.cooldowns = { freeze: 0, strike: 0, overclock: 0 };
    this.overclockTimer = 0;
    /** @type {boolean} */
    this.strikeArmed = false;
    /** @type {THREE.Group | null} */
    this.strikeAimGhost = null;
  }

  reset() {
    this.cancelStrikeAim();
    this.cooldowns = { freeze: 0, strike: 0, overclock: 0 };
    this.overclockTimer = 0;
  }

  /** @param {number} dt */
  update(dt) {
    for (const id of /** @type {AbilityId[]} */ (['freeze', 'strike', 'overclock'])) {
      this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    }
    const wasOverclock = this.overclockTimer > 0;
    this.overclockTimer = Math.max(0, this.overclockTimer - dt);
    if (wasOverclock && this.overclockTimer <= 0) {
      for (const tower of this.game.towers.towers) {
        tower.overclocked = false;
      }
    }
  }

  /** @returns {boolean} */
  isOverclockActive() {
    return this.overclockTimer > 0;
  }

  /** @returns {boolean} */
  isStrikeArmed() {
    return this.strikeArmed;
  }

  /**
   * @param {AbilityId} id
   * @returns {{ ok: true } | { ok: false, reason: string }}
   */
  tryUse(id) {
    const def = ABILITY_DEFS[id];
    if (!def) return { ok: false, reason: 'unknown' };
    if (this.game.state !== 'playing' || this.game.paused) {
      return { ok: false, reason: 'not_playing' };
    }
    if (this.cooldowns[id] > 0) {
      return { ok: false, reason: 'cooldown' };
    }
    if (this.game.crystals < def.cost) {
      return { ok: false, reason: 'crystals' };
    }

    if (id === 'strike') {
      if (this.strikeArmed) {
        this.cancelStrikeAim();
        this.game.ui.setMessage('Strike cancelled');
        this.game.refreshHud();
        return { ok: true };
      }
      this.armStrike();
      return { ok: true };
    }

    this.game.crystals -= def.cost;
    this.cooldowns[id] = def.cooldown;

    if (id === 'freeze') this.castFreeze(def.duration ?? 4);
    else if (id === 'overclock') this.castOverclock(def.duration ?? 6);

    this.game.audio.uiClick();
    this.game.refreshHud();
    return { ok: true };
  }

  armStrike() {
    this.game.cancelPlacement();
    this.game.deselectPlacedTower();
    this.game.deselectEnemy();
    this.strikeArmed = true;
    this.ensureStrikeAimGhost();
    this.game.audio.uiClick();
    this.game.ui.setMessage('Strike armed — click the board to aim · RMB cancels');
    this.game.refreshHud();
  }

  cancelStrikeAim() {
    this.strikeArmed = false;
    if (this.strikeAimGhost) {
      this.game.effects.group.remove(this.strikeAimGhost);
      this.strikeAimGhost.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose?.();
          obj.material?.dispose?.();
        }
      });
      this.strikeAimGhost = null;
    }
  }

  ensureStrikeAimGhost() {
    if (this.strikeAimGhost) return;
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(STRIKE_RADIUS * 0.82, STRIKE_RADIUS, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff6633,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.62;
    const inner = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.7, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffee88,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.64;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.35, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff9944,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.y = 4.2;
    group.add(ring, inner, beam);
    group.visible = false;
    this.game.effects.group.add(group);
    this.strikeAimGhost = group;
  }

  /**
   * @param {number} worldX
   * @param {number} worldZ
   */
  updateStrikeAim(worldX, worldZ) {
    if (!this.strikeArmed) return;
    this.ensureStrikeAimGhost();
    const g = this.strikeAimGhost;
    if (!g) return;
    g.visible = true;
    g.position.set(worldX, 0, worldZ);
    const t = this.game.clock.getElapsedTime();
    g.rotation.y = t * 1.8;
    const pulse = 1 + Math.sin(t * 10) * 0.04;
    g.scale.setScalar(pulse);
  }

  /**
   * @param {number} worldX
   * @param {number} worldZ
   * @returns {boolean}
   */
  confirmStrike(worldX, worldZ) {
    if (!this.strikeArmed) return false;
    const def = ABILITY_DEFS.strike;
    if (this.cooldowns.strike > 0) {
      this.cancelStrikeAim();
      return false;
    }
    if (this.game.crystals < def.cost) {
      this.game.ui.setMessage(`Need ${def.cost} crystals for Strike`);
      this.cancelStrikeAim();
      return false;
    }

    this.game.crystals -= def.cost;
    this.cooldowns.strike = def.cooldown;
    this.cancelStrikeAim();
    this.castStrikeAt(worldX, worldZ);
    this.game.refreshHud();
    return true;
  }

  /** @param {number} duration */
  castFreeze(duration) {
    const enemies = this.game.enemies.alive;
    const wps = this.game.map.waypoints ?? [];

    this.game.effects.spawnFreezeNova(wps);
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.powerSlowTimer = Math.max(enemy.powerSlowTimer ?? 0, duration);
      enemy.powerSlowMultiplier = 0.28;
      this.game.effects.spawnFreezeHit(enemy.mesh.position.clone());
    }

    this.game.audio.abilityFreeze();
    this.game.ui.setMessage(
      enemies.length
        ? `Lane frozen! UFOs slowed for ${duration.toFixed(0)}s`
        : 'Freeze cast — no UFOs on the field',
    );
    this.game.ui.showWaveAnnouncement('Freeze', 'Lane locked down', 'start', 1400);
  }

  /**
   * @param {number} worldX
   * @param {number} worldZ
   */
  castStrikeAt(worldX, worldZ) {
    const center = new THREE.Vector3(worldX, 0.7, worldZ);
    const enemies = this.game.enemies.alive.filter((e) => e.alive);
    const radius = STRIKE_RADIUS;
    const baseDmg = 55 + this.game.waves.waveIndex * 4;
    let hits = 0;

    this.game.effects.spawnOrbitalStrike(center, radius);
    this.game.audio.abilityStrike();

    for (const enemy of enemies) {
      const d = Math.hypot(
        enemy.mesh.position.x - center.x,
        enemy.mesh.position.z - center.z,
      );
      if (d > radius) continue;
      const falloff = 1 - (d / radius) * 0.45;
      const bossMult = enemy.isBoss ? 0.65 : 1;
      this.game.enemies.damage(enemy, baseDmg * falloff * bossMult, 0.15);
      this.game.effects.spawnStrikeHit(enemy.mesh.position.clone());
      hits += 1;
    }

    this.game.ui.setMessage(
      hits
        ? `Orbital strike! Hit ${hits} ${hits === 1 ? 'UFO' : 'UFOs'}`
        : 'Orbital strike landed — no UFOs in the blast',
    );
    this.game.ui.showWaveAnnouncement('Strike', 'Orbital barrage', 'start', 1400);
  }

  /** @param {number} duration */
  castOverclock(duration) {
    this.overclockTimer = duration;
    const towers = this.game.towers.towers.filter((t) => !t.disabled && t.hp > 0);
    for (const tower of towers) {
      tower.overclocked = true;
      this.game.effects.spawnOverclockBurst(tower.mesh.position.clone());
      this.game.towers.triggerTowerPulse(tower);
    }
    this.game.audio.abilityOverclock();
    this.game.ui.setMessage(
      towers.length
        ? `Towers overclocked for ${duration.toFixed(0)}s!`
        : 'Overclock cast — build towers to feel the boost',
    );
    this.game.ui.showWaveAnnouncement('Overclock', 'Weapons hot', 'start', 1400);
  }
}
