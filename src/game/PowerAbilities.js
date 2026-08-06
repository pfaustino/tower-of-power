/** @typedef {'freeze' | 'strike' | 'overclock'} AbilityId */

/** @type {Record<AbilityId, { id: AbilityId, name: string, hotkey: string, cost: number, cooldown: number, duration?: number, blurb: string }>} */
export const ABILITY_DEFS = {
  freeze: {
    id: 'freeze',
    name: 'Freeze',
    hotkey: 'Q',
    cost: 40,
    cooldown: 16,
    duration: 4,
    blurb: 'Freeze the lane — all UFOs crawl for a few seconds',
  },
  strike: {
    id: 'strike',
    name: 'Strike',
    hotkey: 'W',
    cost: 55,
    cooldown: 20,
    blurb: 'Orbital strike — heavy damage near the densest cluster',
  },
  overclock: {
    id: 'overclock',
    name: 'Overclock',
    hotkey: 'E',
    cost: 45,
    cooldown: 18,
    duration: 6,
    blurb: 'Overclock towers — faster fire and harder hits',
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
  }

  reset() {
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

    this.game.crystals -= def.cost;
    this.cooldowns[id] = def.cooldown;

    if (id === 'freeze') this.castFreeze(def.duration ?? 4);
    else if (id === 'strike') this.castStrike();
    else if (id === 'overclock') this.castOverclock(def.duration ?? 6);

    this.game.audio.uiClick();
    this.game.refreshHud();
    return { ok: true };
  }

  /** @param {number} duration */
  castFreeze(duration) {
    const enemies = this.game.enemies.alive;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.powerSlowTimer = Math.max(enemy.powerSlowTimer ?? 0, duration);
      enemy.powerSlowMultiplier = 0.28;
      this.game.effects.spawnTurretPulse(enemy.mesh.position.clone(), 1.6);
    }
    const mid = this.pathMidpoint();
    if (mid) this.game.effects.spawnTurretPulse(mid, 3.2);
    this.game.audio.abilityFreeze();
    this.game.ui.setMessage(
      enemies.length
        ? `Lane frozen! UFOs slowed for ${duration.toFixed(0)}s`
        : 'Freeze ready — no UFOs on the field',
    );
    if (enemies.length) {
      this.game.ui.showWaveAnnouncement('Freeze', 'Lane locked down', 'start', 1200);
    }
  }

  castStrike() {
    const enemies = this.game.enemies.alive.filter((e) => e.alive);
    const center = this.pickStrikeCenter(enemies);
    const radius = 3.4;
    const baseDmg = 55 + this.game.waves.waveIndex * 4;
    let hits = 0;

    this.game.effects.spawnSplash(center, radius);
    this.game.effects.spawnBeamBurst(center.clone().setY(1.2));
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
      hits += 1;
    }

    this.game.ui.setMessage(
      hits
        ? `Orbital strike! Hit ${hits} ${hits === 1 ? 'UFO' : 'UFOs'}`
        : 'Orbital strike missed — no UFOs in range',
    );
    this.game.ui.showWaveAnnouncement('Strike', 'Orbital barrage', 'start', 1200);
  }

  /** @param {number} duration */
  castOverclock(duration) {
    this.overclockTimer = duration;
    for (const tower of this.game.towers.towers) {
      if (tower.disabled || tower.hp <= 0) continue;
      tower.overclocked = true;
      this.game.towers.triggerTowerPulse(tower);
    }
    this.game.audio.abilityOverclock();
    this.game.ui.setMessage(`Towers overclocked for ${duration.toFixed(0)}s!`);
    this.game.ui.showWaveAnnouncement('Overclock', 'Weapons hot', 'start', 1200);
  }

  /**
   * @param {object[]} enemies
   * @returns {import('three').Vector3}
   */
  pickStrikeCenter(enemies) {
    // Prefer densest enemy cluster; fall back to path midpoint / outpost.
    if (enemies.length > 0) {
      let best = enemies[0];
      let bestScore = -1;
      for (const candidate of enemies) {
        let score = 0;
        for (const other of enemies) {
          const d = Math.hypot(
            candidate.mesh.position.x - other.mesh.position.x,
            candidate.mesh.position.z - other.mesh.position.z,
          );
          if (d <= 3.4) score += 1;
        }
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      return best.mesh.position.clone().setY(0.7);
    }
    const mid = this.pathMidpoint();
    if (mid) return mid;
    return this.game.map.outpostPosition.clone().setY(0.7);
  }

  /** @returns {import('three').Vector3 | null} */
  pathMidpoint() {
    const wps = this.game.map.waypoints;
    if (!wps?.length) return null;
    const mid = wps[Math.floor(wps.length / 2)];
    return mid.clone().setY(0.7);
  }
}
