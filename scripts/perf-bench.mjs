/** Micro-benchmark hot paths (no Three.js). */

function buildLeaderMap(alive) {
  const entries = [];
  for (let i = 0; i < alive.length; i++) {
    const e = alive[i];
    entries.push({ e, p: e.pathIndex + e.pathT, i });
  }
  entries.sort((a, b) => (b.p !== a.p ? b.p - a.p : a.i - b.i));
  const leaders = new Map();
  for (let j = 1; j < entries.length; j++) {
    leaders.set(entries[j].e, entries[j - 1].e);
  }
  return leaders;
}

function getLeaderAhead(alive, enemy) {
  const myProgress = enemy.pathIndex + enemy.pathT;
  const myIndex = alive.indexOf(enemy);
  let leader = null;
  let leaderProgress = Infinity;
  let leaderIndex = Infinity;
  for (let i = 0; i < alive.length; i++) {
    const other = alive[i];
    if (other === enemy) continue;
    const progress = other.pathIndex + other.pathT;
    const tiedOnPath = Math.abs(progress - myProgress) <= 1e-4;
    const isAhead = progress > myProgress + 1e-4 || (tiedOnPath && i < myIndex);
    if (!isAhead) continue;
    const isCloser =
      progress < leaderProgress - 1e-4 ||
      (Math.abs(progress - leaderProgress) <= 1e-4 && i < leaderIndex);
    if (!isCloser) continue;
    leaderProgress = progress;
    leaderIndex = i;
    leader = other;
  }
  return leader;
}

const alive = Array.from({ length: 15 }, (_, i) => ({
  pathIndex: Math.floor(i / 3),
  pathT: (i % 3) * 0.25,
}));

const ITERS = 200_000;
console.log(`Enemies: ${alive.length}, iters: ${ITERS}`);

let t0 = performance.now();
for (let n = 0; n < ITERS; n++) {
  buildLeaderMap(alive);
}
console.log(`buildLeaderMap (1x/frame): ${((performance.now() - t0) / ITERS * 60 * 1000).toFixed(2)} ms/frame @60fps`);

t0 = performance.now();
for (let n = 0; n < ITERS; n++) {
  for (const e of alive) getLeaderAhead(alive, e);
}
console.log(`getLeaderAhead x15 (old): ${((performance.now() - t0) / ITERS * 60 * 1000).toFixed(2)} ms/frame @60fps`);
