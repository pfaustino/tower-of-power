import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'data', 'maps');

const DIRS = {
  n: { x: 0, z: -1 },
  e: { x: 1, z: 0 },
  s: { x: 0, z: 1 },
  w: { x: -1, z: 0 },
};
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };

/** @param {string[][]} grid */
function tracePathCells(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  let spawn = null;
  let end = null;
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      if (grid[z][x] === 'spawn') spawn = { x, z };
      if (grid[z][x] === 'end') end = { x, z };
    }
  }
  if (!spawn || !end) throw new Error('Map needs spawn and end cells');

  const cells = [];
  const visited = new Set();
  let cur = spawn;
  let travelDir = null;

  while (cur) {
    const key = `${cur.x},${cur.z}`;
    if (visited.has(key)) break;
    visited.add(key);
    cells.push({ ...cur });
    if (cur.x === end.x && cur.z === end.z) break;

    const neighbors = [];
    for (const [dir, d] of Object.entries(DIRS)) {
      const nx = cur.x + d.x;
      const nz = cur.z + d.z;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const cell = grid[nz][nx];
      if (cell !== 'path' && cell !== 'end') continue;
      if (visited.has(`${nx},${nz}`)) continue;
      neighbors.push({ x: nx, z: nz, dir });
    }
    if (neighbors.length === 0) break;
    let next = neighbors[0];
    if (neighbors.length > 1) {
      if (travelDir) {
        const horiz = travelDir === 'e' || travelDir === 'w';
        if (neighbors.length === 2) {
          if (horiz) {
            const along = neighbors.find((n) => n.dir === 'e' || n.dir === 'w');
            if (along) next = along;
          } else {
            const turn = neighbors.find((n) => n.dir === 'e' || n.dir === 'w');
            if (turn) next = turn;
          }
        }
        if (next === neighbors[0]) {
          const straight = neighbors.find((n) => n.dir === travelDir);
          if (straight) {
            next = straight;
          } else {
            const sameRow = (n) => n.z === cur.z;
            const sameCol = (n) => n.x === cur.x;
            if (horiz) {
              const alongRow = neighbors.find(sameRow);
              if (alongRow) next = alongRow;
            } else {
              const turnOffColumn = neighbors.find((n) => !sameCol(n));
              if (turnOffColumn) next = turnOffColumn;
            }
          }
        }
      } else {
        for (const dir of ['e', 's', 'w', 'n']) {
          const hit = neighbors.find((n) => n.dir === dir);
          if (hit) { next = hit; break; }
        }
      }
    }
    travelDir = next.dir;
    cur = { x: next.x, z: next.z };
  }

  if (cells.at(-1)?.x !== end.x || cells.at(-1)?.z !== end.z) {
    throw new Error('Path does not reach end');
  }
  return cells;
}

/** @param {number} cols @param {number} rows */
function emptyGrid(cols, rows) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 'build'));
}

/**
 * @param {number} cols
 * @param {number} rows
 * @param {[number, number][]} points ordered spawn -> end
 */
function stampPoints(cols, rows, points) {
  const grid = emptyGrid(cols, rows);
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    if (x < 0 || z < 0 || x >= cols || z >= rows) throw new Error(`Point out of bounds: ${x},${z}`);
    if (i === 0) grid[z][x] = 'spawn';
    else if (i === points.length - 1) grid[z][x] = 'end';
    else if (grid[z][x] === 'path' || grid[z][x] === 'spawn') {
      throw new Error(`Path crosses itself at ${x},${z}`);
    } else {
      grid[z][x] = 'path';
    }
  }
  return { grid, path: points.map(([x, z]) => [x, z]) };
}

/**
 * @param {number} cols
 * @param {number} rows
 * @param {[number, number][]} anchors
 */
function stampPath(cols, rows, anchors) {
  /** @type {[number, number][]} */
  const points = [];

  for (let i = 0; i < anchors.length; i++) {
    const [ax, az] = anchors[i];
    if (i === 0) {
      points.push([ax, az]);
      continue;
    }
    const [px, pz] = points[points.length - 1];
    let x = px;
    let z = pz;
    while (x !== ax) {
      x += x < ax ? 1 : -1;
      points.push([x, z]);
    }
    while (z !== az) {
      z += z < az ? 1 : -1;
      points.push([x, z]);
    }
  }

  return stampPoints(cols, rows, points);
}

/**
 * Horizontal switchbacks with buildable lanes between roads.
 * @param {number} cols
 * @param {number} rows
 * @param {number} inset
 * @param {number} laneGap buildable rows between path rows (1–4)
 */
function stampSerpentine(cols, rows, inset = 1, laneGap = 1) {
  if (laneGap < 1 || laneGap > 4) throw new Error(`laneGap must be 1–4, got ${laneGap}`);
  const left = inset;
  const right = cols - 1 - inset;
  const top = inset;
  const bottom = rows - 1 - inset;
  const step = 1 + laneGap;
  /** @type {[number, number][]} */
  const points = [];
  let lane = 0;
  for (let z = top; z <= bottom; z += step) {
    const leftToRight = lane % 2 === 0;
    if (leftToRight) {
      for (let x = left; x <= right; x++) points.push([x, z]);
    } else {
      for (let x = right; x >= left; x--) points.push([x, z]);
    }

    const nextZ = z + step;
    if (nextZ <= bottom) {
      const connectX = leftToRight ? right : left;
      for (let cz = z + 1; cz < nextZ; cz++) {
        points.push([connectX, cz]);
      }
    }
    lane++;
  }
  if (lane < 2) throw new Error(`Serpentine needs ≥2 lanes (${cols}x${rows}, gap ${laneGap})`);
  return stampPoints(cols, rows, points);
}

/**
 * Inward spiral with buildable rings between path coils.
 * @param {number} cols
 * @param {number} rows
 * @param {number} inset
 * @param {number} ringGap buildable cells between spiral rings (1–4)
 */
function stampSpiral(cols, rows, inset = 1, ringGap = 1) {
  if (ringGap < 1 || ringGap > 4) throw new Error(`ringGap must be 1–4, got ${ringGap}`);
  let minX = inset;
  let minZ = inset;
  let maxX = cols - 1 - inset;
  let maxZ = rows - 1 - inset;
  /** @type {[number, number][]} */
  const points = [];

  while (maxX - minX >= 2 && maxZ - minZ >= 2) {
    for (let x = minX; x <= maxX; x++) points.push([x, minZ]);
    for (let z = minZ + 1; z <= maxZ; z++) points.push([maxX, z]);
    for (let x = maxX - 1; x >= minX; x--) points.push([x, maxZ]);
    for (let z = maxZ - 1; z > minZ; z--) points.push([minX, z]);

    const nextMinX = minX + 1 + ringGap;
    const nextMinZ = minZ + 1 + ringGap;
    const nextMaxX = maxX - 1 - ringGap;
    const nextMaxZ = maxZ - 1 - ringGap;
    if (nextMaxX - nextMinX < 2 || nextMaxZ - nextMinZ < 2) break;

    // Single-tile corridor through the build band; stop just before next ring.
    for (let x = minX + 1; x <= nextMinX; x++) points.push([x, minZ + 1]);
    for (let z = minZ + 2; z < nextMinZ; z++) points.push([nextMinX, z]);

    minX = nextMinX;
    minZ = nextMinZ;
    maxX = nextMaxX;
    maxZ = nextMaxZ;
  }

  return stampPoints(cols, rows, points);
}

/**
 * Climbing shelves: horizontal runs with vertical connectors and build gaps.
 * @param {number} cols
 * @param {number} rows
 * @param {number} inset
 * @param {number} laneGap buildable rows between shelves (1–4)
 */
function stampStaircase(cols, rows, inset = 1, laneGap = 2) {
  // Shelf climb is a serpentine — same build-gap rules, different fantasy name.
  return stampSerpentine(cols, rows, inset, laneGap);
}

/**
 * Diagonal stair with wide landings so wedges of build tiles sit beside the path.
 * @param {number} cols
 * @param {number} rows
 * @param {number} inset
 * @param {number} run horizontal tiles per landing
 * @param {number} rise vertical tiles between landings
 */
function stampDiagonalStair(cols, rows, inset = 1, run = 3, rise = 2) {
  const left = inset;
  const right = cols - 1 - inset;
  const top = inset;
  const bottom = rows - 1 - inset;
  /** @type {[number, number][]} */
  const anchors = [[left, bottom]];
  let x = left;
  let z = bottom;
  for (let guard = 0; guard < 64 && (x < right || z > top); guard++) {
    const nx = Math.min(right, x + run);
    const nz = Math.max(top, z - rise);
    if (nx === x && nz === z) break;
    if (nx !== x) {
      x = nx;
      anchors.push([x, z]);
    }
    if (nz !== z) {
      z = nz;
      anchors.push([x, z]);
    }
  }
  return stampPath(cols, rows, anchors);
}

/** @param {string[][]} grid @param {number} x @param {number} z */
function setCrystal(grid, x, z) {
  if (grid[z]?.[x] === 'build') {
    grid[z][x] = 'crystal';
    return;
  }
  for (let rz = 0; rz < grid.length; rz++) {
    for (let rx = 0; rx < grid[0].length; rx++) {
      if (grid[rz][rx] === 'build') {
        grid[rz][rx] = 'crystal';
        return;
      }
    }
  }
  throw new Error('No build tile for crystal');
}

const MAP_DEFS = [
  // LOCKED: Crystal Outpost layout is final.
  {
    id: 'crystal-outpost',
    file: '01-crystal-outpost.json',
    name: 'Crystal Outpost',
    blurb: 'A simple L-shaped lane — perfect for your first defense.',
    startCrystals: 74,
    startLives: 20,
    build: () => {
      const { grid, path } = stampPath(20, 9, [[1, 1], [15, 1], [15, 6]]);
      setCrystal(grid, 3, 4);
      return { grid, path };
    },
  },
  // Build gaps (1–4) set defense density: 1 = cramped, 4 = fortress rows.
  // LOCKED: Dust Ridge layout is final — do not change gap/size without review.
  {
    id: 'dust-ridge',
    file: '02-dust-ridge.json',
    name: 'Dust Ridge',
    blurb: 'Four switchbacks with 2-row build lanes — room to dig in.',
    startCrystals: 78,
    startLives: 20,
    build: () => {
      // gap 2: comfortable early defense
      const { grid, path } = stampSerpentine(24, 14, 1, 2);
      setCrystal(grid, 11, 3);
      return { grid, path };
    },
  },
  {
    id: 'north-pass',
    file: '03-north-pass.json',
    name: 'North Pass',
    blurb: 'A diagonal climb with wide landings — build in the wedges.',
    startCrystals: 80,
    startLives: 19,
    build: () => {
      const { grid, path } = stampDiagonalStair(20, 16, 1, 3, 2);
      setCrystal(grid, 4, 12);
      return { grid, path };
    },
  },
  {
    id: 'crosswind-valley',
    file: '04-crosswind-valley.json',
    name: 'Crosswind Valley',
    blurb: 'Long beats, only 1 build row between lanes — tight placement.',
    startCrystals: 82,
    startLives: 19,
    build: () => {
      // gap 1: scarce tower slots between roads
      const { grid, path } = stampSerpentine(28, 13, 1, 1);
      setCrystal(grid, 13, 2);
      return { grid, path };
    },
  },
  {
    id: 'broken-corridor',
    file: '05-broken-corridor.json',
    name: 'Broken Corridor',
    blurb: 'A spiral with 2-tile build bands between coils.',
    startCrystals: 84,
    startLives: 18,
    build: () => {
      const { grid, path } = stampSpiral(22, 16, 1, 2);
      setCrystal(grid, 10, 8);
      return { grid, path };
    },
  },
  {
    id: 'shard-pocket',
    file: '06-shard-pocket.json',
    name: 'Shard Pocket',
    blurb: 'Cramped spiral — 1-tile build rings, sharp turns.',
    startCrystals: 86,
    startLives: 18,
    build: () => {
      const { grid, path } = stampSpiral(16, 16, 1, 1);
      setCrystal(grid, 7, 8);
      return { grid, path };
    },
  },
  {
    id: 'wide-frontier',
    file: '07-wide-frontier.json',
    name: 'Wide Frontier',
    blurb: 'Three long lanes with 4-row build belts — fortress density.',
    startCrystals: 88,
    startLives: 17,
    build: () => {
      // gap 4: maximum between-lane tower capacity
      const { grid, path } = stampSerpentine(32, 16, 1, 4);
      setCrystal(grid, 15, 3);
      return { grid, path };
    },
  },
  {
    id: 'helix-run',
    file: '08-helix-run.json',
    name: 'Helix Run',
    blurb: 'Climbing shelves with 3-row build terraces.',
    startCrystals: 90,
    startLives: 17,
    build: () => {
      const { grid, path } = stampStaircase(24, 18, 1, 3);
      setCrystal(grid, 11, 5);
      return { grid, path };
    },
  },
  {
    id: 'long-march',
    file: '09-long-march.json',
    name: 'Long March',
    blurb: 'Endurance switchbacks with 2-row build lanes across a vast strip.',
    startCrystals: 92,
    startLives: 16,
    build: () => {
      const { grid, path } = stampSerpentine(36, 18, 1, 2);
      setCrystal(grid, 17, 3);
      return { grid, path };
    },
  },
  {
    id: 'final-bastion',
    file: '10-final-bastion.json',
    name: 'Final Bastion',
    blurb: 'Rim sweep then dive — 3-row courtyards for heavy batteries.',
    startCrystals: 95,
    startLives: 16,
    build: () => {
      // Outer rim, 3-row inner pocket, then approach the keep
      const { grid, path } = stampPath(26, 18, [
        [1, 8],
        [8, 8],
        [8, 2],
        [24, 2],
        [24, 15],
        [8, 15],
        [8, 12],
        [22, 12],
        [22, 9],
        [12, 9],
      ]);
      setCrystal(grid, 14, 5);
      return { grid, path };
    },
  },
];

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const manifest = {
  maps: MAP_DEFS.map(({ id, file, name, blurb }, index) => ({
    id,
    file,
    name,
    blurb,
    order: index + 1,
  })),
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

/** @param {string[][]} grid */
function buildGapStats(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const isP = (c) => c === 'path' || c === 'spawn' || c === 'end';
  /** @type {number[]} */
  const gaps = [];
  for (let x = 0; x < cols; x++) {
    let lastPath = -1;
    for (let z = 0; z < rows; z++) {
      if (!isP(grid[z][x])) continue;
      if (lastPath >= 0) {
        const gap = z - lastPath - 1;
        if (gap > 0) gaps.push(gap);
      }
      lastPath = z;
    }
  }
  if (!gaps.length) return 'no vertical gaps';
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  return `build gaps ${min}–${max}`;
}

for (const def of MAP_DEFS) {
  const { grid, path: pathOrder } = def.build();
  tracePathCells(grid);
  const payload = {
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    tileSize: 2,
    startCrystals: def.startCrystals,
    startLives: def.startLives,
    grid,
    path: pathOrder,
  };
  fs.writeFileSync(path.join(outDir, def.file), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${def.file} (${grid[0].length}x${grid.length}, path ${pathOrder.length}, ${buildGapStats(grid)})`);
}

console.log('All maps validated and written.');
