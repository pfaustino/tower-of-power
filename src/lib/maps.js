import manifest from '../../data/maps/manifest.json';
import map01 from '../../data/maps/01-crystal-outpost.json';
import map02 from '../../data/maps/02-dust-ridge.json';
import map03 from '../../data/maps/03-north-pass.json';
import map04 from '../../data/maps/04-crosswind-valley.json';
import map05 from '../../data/maps/05-broken-corridor.json';
import map06 from '../../data/maps/06-shard-pocket.json';
import map07 from '../../data/maps/07-wide-frontier.json';
import map08 from '../../data/maps/08-helix-run.json';
import map09 from '../../data/maps/09-long-march.json';
import map10 from '../../data/maps/10-final-bastion.json';

/** @typedef {{ id: string, file: string, name: string, blurb: string, order: number }} MapMeta */

/** @type {Record<string, object>} */
const MAP_DATA = {
  'crystal-outpost': map01,
  'dust-ridge': map02,
  'north-pass': map03,
  'crosswind-valley': map04,
  'broken-corridor': map05,
  'shard-pocket': map06,
  'wide-frontier': map07,
  'helix-run': map08,
  'long-march': map09,
  'final-bastion': map10,
};

/** @type {MapMeta[]} */
export const MAP_LIST = [...manifest.maps].sort((a, b) => a.order - b.order);

export const UNLOCK_WAVE_REQUIREMENT = 10;

/** @param {string} mapId */
export function getMapData(mapId) {
  const data = MAP_DATA[mapId];
  if (!data) throw new Error(`Unknown map: ${mapId}`);
  return data;
}

/** @param {string} mapId */
export function getMapMeta(mapId) {
  const meta = MAP_LIST.find((m) => m.id === mapId);
  if (!meta) throw new Error(`Unknown map: ${mapId}`);
  return meta;
}

/** @param {string} mapId */
export function getMapNumber(mapId) {
  const index = MAP_LIST.findIndex((m) => m.id === mapId);
  return index >= 0 ? index + 1 : 0;
}

/** @param {string} mapId */
export function formatMapHudTitle(mapId) {
  const meta = getMapMeta(mapId);
  return `${getMapNumber(mapId)} : ${meta.name}`;
}

/** @returns {string} */
export function getFirstMapId() {
  return MAP_LIST[0]?.id ?? 'crystal-outpost';
}

/**
 * @param {string} mapId
 * @returns {MapMeta | null}
 */
export function getNextMapMeta(mapId) {
  const index = MAP_LIST.findIndex((m) => m.id === mapId);
  if (index < 0 || index >= MAP_LIST.length - 1) return null;
  return MAP_LIST[index + 1];
}

/**
 * @param {{ mapProgress?: Record<string, { bestWaves?: number, lastSuccessfulWave?: number }> }} progress
 * @param {string} mapId
 */
export function getMapBestWaves(progress, mapId) {
  return Math.max(0, Math.floor(progress.mapProgress?.[mapId]?.bestWaves ?? 0));
}

/**
 * Most recently cleared wave on a map (continue checkpoint).
 * @param {{ mapProgress?: Record<string, { bestWaves?: number, lastSuccessfulWave?: number }> }} progress
 * @param {string} mapId
 */
export function getMapLastSuccessfulWave(progress, mapId) {
  const entry = progress.mapProgress?.[mapId];
  const last = Math.max(0, Math.floor(entry?.lastSuccessfulWave ?? 0));
  if (last > 0) return last;
  // Older saves only tracked best — treat that as the continue point.
  return getMapBestWaves(progress, mapId);
}

/**
 * @param {{ mapProgress?: Record<string, { bestWaves?: number }> }} progress
 * @param {number} mapIndex 0-based index in MAP_LIST
 */
export function isMapUnlocked(progress, mapIndex) {
  if (mapIndex <= 0) return true;
  const prev = MAP_LIST[mapIndex - 1];
  if (!prev) return false;
  return getMapBestWaves(progress, prev.id) >= UNLOCK_WAVE_REQUIREMENT;
}

/**
 * @param {{ mapProgress?: Record<string, { bestWaves?: number }> }} progress
 * @param {string} mapId
 */
export function isMapIdUnlocked(progress, mapId) {
  const index = MAP_LIST.findIndex((m) => m.id === mapId);
  if (index < 0) return false;
  return isMapUnlocked(progress, index);
}

/**
 * Updates best-waves high score and last-successful-wave checkpoint.
 * @param {{ mapProgress?: Record<string, { bestWaves?: number, lastSuccessfulWave?: number }> }} progress
 * @param {string} mapId
 * @param {number} waves Successful waves cleared (0 leaves the continue checkpoint unchanged)
 */
export function updateMapBestWaves(progress, mapId, waves) {
  const cleared = Math.max(0, Math.floor(waves));
  const prev = progress.mapProgress?.[mapId] ?? {};
  const prevBest = Math.max(0, Math.floor(prev.bestWaves ?? 0));
  const prevLast = Math.max(0, Math.floor(prev.lastSuccessfulWave ?? 0));
  const bestWaves = Math.max(prevBest, cleared);
  // Never move the continue checkpoint backward (e.g. quit before starting a continue).
  const lastSuccessfulWave = cleared > 0 ? Math.max(prevLast, cleared) : prevLast;
  if (bestWaves === prevBest && lastSuccessfulWave === prevLast) return progress;
  return {
    ...progress,
    mapProgress: {
      ...(progress.mapProgress ?? {}),
      [mapId]: { bestWaves, lastSuccessfulWave },
    },
  };
}

/**
 * @param {{ mapProgress?: Record<string, { bestWaves?: number }> }} progress
 * @param {string} mapId
 */
export function getMapUnlockHint(progress, mapId) {
  const index = MAP_LIST.findIndex((m) => m.id === mapId);
  if (index <= 0) return '';
  const prev = MAP_LIST[index - 1];
  return `Clear wave ${UNLOCK_WAVE_REQUIREMENT} on ${prev.name}`;
}
