import * as THREE from 'three';

/**
 * Horizontal billboard HP bar facing the camera.
 * @param {object} [options]
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {number} [options.fillColor]
 */
export function createHealthBar(options = {}) {
  const BAR_W = options.width ?? 0.9;
  const BAR_H = options.height ?? 0.1;
  const fillColor = options.fillColor ?? 0x55ee77;

  const group = new THREE.Group();
  group.renderOrder = 900;

  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(BAR_W, BAR_H),
    new THREE.MeshBasicMaterial({ color: 0x2a0a0a, depthTest: false, transparent: true, opacity: 0.9 }),
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(BAR_W * 0.96, BAR_H * 0.72),
    new THREE.MeshBasicMaterial({ color: fillColor, depthTest: false, transparent: true, opacity: 0.95 }),
  );
  fill.position.z = 0.001;

  group.add(bg, fill);

  const fillWidth = BAR_W * 0.96;

  return {
    group,
    setRatio(ratio) {
      const clamped = THREE.MathUtils.clamp(ratio, 0, 1);
      fill.scale.x = clamped;
      fill.position.x = (-fillWidth / 2) + (fillWidth * clamped) / 2;
      if (!options.fillColor) {
        fill.material.color.setHex(
          clamped > 0.5 ? 0x55ee77 : clamped > 0.25 ? 0xffcc44 : 0xff5555,
        );
      } else {
        fill.material.color.setHex(
          clamped > 0.5 ? fillColor : clamped > 0.25 ? 0xffcc44 : 0xff5555,
        );
      }
    },
    lookAtCamera(cam) {
      group.quaternion.copy(cam.quaternion);
    },
  };
}

/** @deprecated use createHealthBar */
export function createEnemyHealthBar() {
  return createHealthBar();
}

/**
 * Billboard level badge for placed towers.
 * @param {number} [initialLevel]
 */
export function createLevelLabel(initialLevel = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const draw = (level) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 20, 40, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#5ce1ff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#f0f6fc';
    ctx.font = 'bold 30px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), 32, 34);
  };

  draw(initialLevel);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.48, 0.48, 1);
  sprite.renderOrder = 902;

  return {
    sprite,
    setLevel(level) {
      draw(level);
      tex.needsUpdate = true;
    },
    lookAtCamera(cam) {
      sprite.quaternion.copy(cam.quaternion);
    },
  };
}
