import {
  bossTypeForTier,
  waveEnemyCount,
  waveSpawnInterval,
} from './WaveScaling.js';

/**
 * Enemy mix weights by wave band.
 * @param {number} wave
 */
function compositionForWave(wave) {
  if (wave < 8) return [{ enemy: 'scout', weight: 1 }];
  if (wave < 16) {
    return [
      { enemy: 'scout', weight: 0.55 },
      { enemy: 'raider', weight: 0.45 },
    ];
  }
  if (wave < 28) {
    return [
      { enemy: 'scout', weight: 0.25 },
      { enemy: 'raider', weight: 0.35 },
      { enemy: 'tank', weight: 0.4 },
    ];
  }
  if (wave < 45) {
    return [
      { enemy: 'raider', weight: 0.3 },
      { enemy: 'tank', weight: 0.35 },
      { enemy: 'swarm', weight: 0.35 },
    ];
  }
  return [
    { enemy: 'raider', weight: 0.2 },
    { enemy: 'tank', weight: 0.35 },
    { enemy: 'swarm', weight: 0.45 },
  ];
}

/**
 * @param {number} total
 * @param {{ enemy: string, weight: number }[]} comp
 */
function distributeCount(total, comp) {
  const weightSum = comp.reduce((s, c) => s + c.weight, 0);
  const groups = comp.map((c) => ({
    enemy: c.enemy,
    count: Math.floor((c.weight / weightSum) * total),
  }));

  let assigned = groups.reduce((s, g) => s + g.count, 0);
  let i = 0;
  while (assigned < total) {
    groups[i % groups.length].count++;
    assigned++;
    i++;
  }
  return groups.filter((g) => g.count > 0);
}

/**
 * @param {number} waveNum
 */
function buildWave(waveNum) {
  const isBossWave = waveNum % 10 === 0;
  const tier = Math.ceil(waveNum / 10);
  const total = waveEnemyCount(waveNum);
  const interval = waveSpawnInterval(waveNum);
  const comp = distributeCount(total, compositionForWave(waveNum));

  const groups = comp.map((g, idx) => ({
    enemy: g.enemy,
    count: g.count,
    interval,
    delay: idx === 0 ? 0.6 : 0,
  }));

  if (isBossWave) {
    const fodderTime = total * interval + 0.6;
    groups.push({
      enemy: bossTypeForTier(tier),
      count: 1,
      interval: 0,
      delay: fodderTime + 1.2,
      isBoss: true,
    });
  }

  return {
    id: waveNum,
    label: isBossWave ? `Wave ${waveNum} — BOSS` : `Wave ${waveNum}`,
    isBossWave,
    groups,
  };
}

/**
 * @param {number} [totalWaves]
 */
export function generateWaves(totalWaves = 100) {
  const waves = [];
  for (let w = 1; w <= totalWaves; w++) {
    waves.push(buildWave(w));
  }
  return waves;
}
