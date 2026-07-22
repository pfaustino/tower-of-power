const DIRS = {
  n: { x: 0, z: -1 },
  e: { x: 1, z: 0 },
  s: { x: 0, z: 1 },
  w: { x: -1, z: 0 },
};

const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };

/** @type {Map<string, { entry: string | null, exit: string | null }>} */
let pathFlow = new Map();

/**
 * Trace grid cells along the path from spawn to end.
 * @param {string[][]} grid
 */
export function tracePathCells(grid) {
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
  let prevDir = null;

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
      if (cell !== 'path' && cell !== 'end' && !(nx === end.x && nz === end.z)) continue;
      if (visited.has(`${nx},${nz}`)) continue;
      neighbors.push({ x: nx, z: nz, dir });
    }

    if (neighbors.length === 0) break;

    let next = neighbors[0];
    if (neighbors.length > 1 && prevDir) {
      const straight = neighbors.find((n) => n.dir === prevDir);
      if (straight) next = straight;
    }

    prevDir = OPPOSITE[next.dir];
    cur = { x: next.x, z: next.z };
  }

  return cells;
}

/**
 * @param {{ x: number, z: number }} from
 * @param {{ x: number, z: number }} to
 */
function directionBetween(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx === 1) return 'e';
  if (dx === -1) return 'w';
  if (dz === 1) return 's';
  if (dz === -1) return 'n';
  return null;
}

/**
 * Cache entry/exit flow for each path cell.
 * @param {string[][]} grid
 */
export function buildPathFlow(grid) {
  pathFlow = new Map();
  const cells = tracePathCells(grid);

  for (let i = 0; i < cells.length; i++) {
    const cur = cells[i];
    const prev = cells[i - 1];
    const next = cells[i + 1];
    const moveIn = prev ? directionBetween(prev, cur) : null;
    const moveOut = next ? directionBetween(cur, next) : null;
    const entry = moveIn ? OPPOSITE[moveIn] : null;
    const exit = moveOut;
    pathFlow.set(`${cur.x},${cur.z}`, { entry, exit });
  }
}

/**
 * @param {number} x
 * @param {number} z
 */
function getFlow(x, z) {
  return pathFlow.get(`${x},${z}`) ?? { entry: null, exit: null };
}

/**
 * Build ordered waypoints from spawn to end along path cells.
 * @param {string[][]} grid
 * @param {number} tileSize
 */
export function buildPath(grid, tileSize) {
  buildPathFlow(grid);
  return tracePathCells(grid).map((c) => ({
    x: (c.x + 0.5) * tileSize,
    z: (c.z + 0.5) * tileSize,
  }));
}

/**
 * @param {string[][]} grid
 * @param {number} x
 * @param {number} z
 */
export function isBuildable(grid, x, z) {
  const cell = grid[z]?.[x];
  return cell === 'build' || cell === 'crystal';
}

/**
 * @param {string[][]} grid
 * @param {number} x
 * @param {number} z
 */
function pathNeighbors(grid, x, z) {
  const isPath = (cx, cz) => {
    const c = grid[cz]?.[cx];
    return c === 'path' || c === 'spawn' || c === 'end';
  };
  return {
    n: isPath(x, z - 1),
    s: isPath(x, z + 1),
    e: isPath(x + 1, z),
    w: isPath(x - 1, z),
  };
}

/**
 * Pick Kenney tile model name for a path cell.
 * @param {string[][]} grid
 * @param {number} x
 * @param {number} z
 */
export function tileModelForCell(grid, x, z) {
  const cell = grid[z][x];
  if (cell === 'spawn') return 'tile-spawn';
  if (cell === 'end') return 'tile-end';
  if (cell === 'crystal') return 'tile-crystal';
  if (cell === 'build') return 'tile-dirt';
  if (cell !== 'path') return null;

  const { n, s, e, w } = pathNeighbors(grid, x, z);
  const count = [n, s, e, w].filter(Boolean).length;

  if (count === 2 && ((n && s) || (e && w))) return 'tile-straight';
  if (count === 2) return 'tile-corner-round';
  return 'tile-straight';
}

/**
 * Kenney tile-straight default: road runs East–West.
 * @param {boolean} n
 * @param {boolean} s
 * @param {boolean} e
 * @param {boolean} w
 */
function straightRotation(n, s, e, w) {
  if (e && w) return Math.PI / 2;
  if (n && s) return Math.PI;
  return 0;
}

/**
 * Kenney tile-corner-round default: road curves from South to East.
 * @param {string | null} entry
 * @param {string | null} exit
 */
function cornerRotation(entry, exit) {
  const flow = `${entry ?? ''}${exit ?? ''}`;
  const map = {
    se: 0,
    es: Math.PI,
    ws: Math.PI / 2,
    sw: Math.PI / 2,
    nw: 0,
    wn: Math.PI,
    en: -Math.PI / 2,
    ne: -Math.PI / 2,
  };
  return (map[flow] ?? 0) + Math.PI;
}

/**
 * Kenney tile-spawn default: opening faces East.
 * @param {string | null} exit
 */
function spawnRotation(exit) {
  const map = { e: 0, w: Math.PI, n: Math.PI / 2, s: -Math.PI / 2 };
  return (map[exit ?? ''] ?? 0) - Math.PI / 2;
}

/**
 * Kenney tile-end default: opening faces East.
 * @param {string | null} entry
 */
function endRotation(entry) {
  const map = { e: 0, w: Math.PI, n: Math.PI / 2, s: -Math.PI / 2 };
  return (map[entry ?? ''] ?? 0) - Math.PI / 2;
}

/**
 * @param {string[][]} grid
 * @param {number} x
 * @param {number} z
 * @param {number} tileSize
 */
export function tileRotation(grid, x, z, tileSize) {
  const model = tileModelForCell(grid, x, z);
  const { n, s, e, w } = pathNeighbors(grid, x, z);

  if (model === 'tile-straight') return straightRotation(n, s, e, w);

  const { entry, exit } = getFlow(x, z);
  if (model === 'tile-spawn') return spawnRotation(exit);
  if (model === 'tile-corner-round') return cornerRotation(entry, exit);
  if (model === 'tile-end') return endRotation(entry);
  return 0;
}

export { DIRS };
