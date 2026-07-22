import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'Models', 'GLB format');
const texSrc = join(root, 'Models', 'Textures', 'variation-a.png');
const outModels = join(root, 'public', 'models');
const outModelTex = join(outModels, 'Textures');
const outTex = join(root, 'public', 'textures');

const models = [
  'tile.glb',
  'tile-dirt.glb',
  'tile-straight.glb',
  'tile-corner-round.glb',
  'tile-spawn.glb',
  'tile-end.glb',
  'tile-crystal.glb',
  'tower-round-base.glb',
  'tower-round-build-a.glb',
  'tower-round-build-c.glb',
  'tower-square-build-a.glb',
  'tower-square-build-c.glb',
  'tower-square-build-d.glb',
  'weapon-ballista.glb',
  'weapon-catapult.glb',
  'weapon-cannon.glb',
  'weapon-turret.glb',
  'enemy-ufo-a.glb',
  'enemy-ufo-b.glb',
  'enemy-ufo-c.glb',
  'enemy-ufo-d.glb',
  'enemy-ufo-a-weapon.glb',
  'enemy-ufo-b-weapon.glb',
  'enemy-ufo-c-weapon.glb',
  'enemy-ufo-d-weapon.glb',
  'enemy-ufo-beam.glb',
  'enemy-ufo-beam-burst.glb',
  'selection-a.glb',
];

mkdirSync(outModels, { recursive: true });
mkdirSync(outModelTex, { recursive: true });
mkdirSync(outTex, { recursive: true });

for (const name of models) {
  const from = join(srcDir, name);
  const to = join(outModels, name);
  if (!existsSync(from)) {
    console.warn(`skip missing: ${name}`);
    continue;
  }
  copyFileSync(from, to);
  console.log(`copied ${name}`);
}

const colormap = join(root, 'Models', 'OBJ format', 'Textures', 'colormap.png');
if (existsSync(colormap)) {
  copyFileSync(colormap, join(outModelTex, 'colormap.png'));
  copyFileSync(colormap, join(outTex, 'colormap.png'));
  console.log('copied colormap.png to models/Textures and textures/');
}
if (existsSync(texSrc)) {
  copyFileSync(texSrc, join(outTex, 'variation-a.png'));
  console.log('copied variation-a.png');
}
