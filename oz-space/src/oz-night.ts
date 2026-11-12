// 夜晚：星空、月亮、路燈的光暈、地面光斑與照明燈光束。都不是真的光源（不參與光照計算），
// 只是疊加上去的發光貼片，所以一千多盞燈也只多幾次繪製。白天它們全部隱藏。
// nightUniform 是共用的「夜晚程度」：0 白天、1 夜晚，切換時由 main.ts 漸變；房屋窗戶的著色器也讀它。
import * as THREE from 'three';
import type { LightKind, LightSpot } from './oz-kit';

/** 0 = 白天、1 = 夜晚；著色器直接拿這個物件當 uniform，改 value 就生效。 */
export const nightUniform = { value: 0 };
const HIDDEN_BELOW = 0.002;   // 夜晚程度低於這裡就整個不畫

// ---------- 晚上才發光的材質 ----------
// 店面玻璃、招牌、小屋窗戶：emissive 設成晚上的顏色，著色器裡再乘上 nightUniform，白天是 0、看起來和原本一樣。
// 有發光的材質不會被 bakeByMaterial 併進頂點顏色，所以會各自保留一次繪製。
const NIGHT_EMISSIVE = 'vec3 totalEmissiveRadiance = emissive;';
function applyNightEmissive(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uNight = nightUniform;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uNight;')
    .replace(NIGHT_EMISSIVE, 'vec3 totalEmissiveRadiance = emissive * uNight;');
}

/** 讓材質晚上發 color × strength 的光；有 map 時 useMap 讓招牌照自己的圖案發光。回傳同一個材質。 */
export function glowAtNight<T extends THREE.MeshLambertMaterial | THREE.MeshStandardMaterial>(material: T, color: number, strength: number, useMap = false): T {
  material.emissive.set(color).multiplyScalar(strength);
  if (useMap && material.map) material.emissiveMap = material.map;
  material.onBeforeCompile = applyNightEmissive;
  return material;
}

// ---------- 路燈 ----------
// glow：燈泡光暈半徑（m）、pool：地面光斑半徑（m）、strength：光斑中心的亮度（疊加上去的顏色比例）
const LAMP_LOOK: Record<LightKind, { glow: number; pool: number; color: number; strength: number }> = {
  street: { glow: 0.9, pool: 7, color: 0xffc77a, strength: 0.5 },
  path: { glow: 0.7, pool: 5, color: 0xffd394, strength: 0.45 },
  indoor: { glow: 0.55, pool: 1.5, color: 0xfff0c8, strength: 0.55 },
  flood: { glow: 2.6, pool: 18, color: 0xe8efff, strength: 0.3 },
};
const GLOW_MIN_SCREEN = 0.0025;   // 光暈至少佔「距離 × 這個比例」公尺，遠處的燈縮成幾個像素的亮點，不會消失或閃爍
const GLOW_TOWARD_CAMERA = 0.6;   // 光暈往鏡頭方向挪（光暈半徑的比例），不會被燈罩切掉一半
const POOL_LIFT = 0.04;           // 光斑離地面多高（m），不和地面搶深度
const BEAM_TOP_RADIUS = 0.5;      // 照明燈光束在燈頭的半徑（m）
const BEAM_BOTTOM_SHARE = 0.55;   // 光束落地的半徑 = 光斑半徑 × 這個比例
const BEAM_STRENGTH = 0.07;

// 對數深度緩衝（main.ts 的 renderer 有開）：自訂著色器也要寫一樣的深度，前後遮擋才對。
const LOGDEPTH_VERTEX_PARS = '#include <common>\n#include <logdepthbuf_pars_vertex>';
const LOGDEPTH_FRAGMENT_PARS = '#include <common>\n#include <logdepthbuf_pars_fragment>';

function glowMaterial(vertexShader: string, fragmentShader: string, side: THREE.Side = THREE.FrontSide): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uNight: nightUniform },
    vertexShader, fragmentShader, side,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// 光暈：每盞燈一張永遠面向鏡頭的方形，中心亮、往外淡；四個頂點的 position 都是燈泡中心，corner 決定往哪個角展開。
const glowShader = glowMaterial(`
  ${LOGDEPTH_VERTEX_PARS}
  attribute vec2 corner;
  attribute vec3 tint;
  attribute float radius;
  varying vec2 vCorner;
  varying vec3 vTint;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    float size = max(radius, -view.z * ${GLOW_MIN_SCREEN});
    view.xy += corner * size;
    view.z += size * ${GLOW_TOWARD_CAMERA};
    gl_Position = projectionMatrix * view;
    #include <logdepthbuf_vertex>
    vCorner = corner;
    vTint = tint;
  }`, `
  ${LOGDEPTH_FRAGMENT_PARS}
  uniform float uNight;
  varying vec2 vCorner;
  varying vec3 vTint;
  void main() {
    #include <logdepthbuf_fragment>
    float d = length(vCorner);
    if (d > 1.0) discard;
    float core = smoothstep(0.32, 0.0, d);
    float halo = pow(1.0 - d, 2.2) * 0.55;
    gl_FragColor = vec4(vTint * (core + halo) * uNight, 1.0);
  }`);

// 地面光斑：平放的方形，中心最亮、到邊緣淡到 0（平方衰減，邊緣不會有一圈硬邊）。
const poolShader = glowMaterial(`
  ${LOGDEPTH_VERTEX_PARS}
  attribute vec2 corner;
  attribute vec3 tint;
  varying vec2 vCorner;
  varying vec3 vTint;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
    vCorner = corner;
    vTint = tint;
  }`, `
  ${LOGDEPTH_FRAGMENT_PARS}
  uniform float uNight;
  varying vec2 vCorner;
  varying vec3 vTint;
  void main() {
    #include <logdepthbuf_fragment>
    float d = length(vCorner);
    if (d > 1.0) discard;
    float falloff = 1.0 - d * d;
    gl_FragColor = vec4(vTint * falloff * falloff * uNight, 1.0);
  }`, THREE.DoubleSide);   // 方形的頂點順序是給面向鏡頭的光暈用的，平放時正面朝下；兩面都畫，從上面看才看得到

// 照明燈光束：開口的圓錐，燈頭端亮、往地面淡，兩面都畫。
const beamShader = glowMaterial(`
  ${LOGDEPTH_VERTEX_PARS}
  varying float vAlong;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
    vAlong = uv.y;
  }`, `
  ${LOGDEPTH_FRAGMENT_PARS}
  uniform float uNight;
  varying float vAlong;
  void main() {
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * ${BEAM_STRENGTH} * (0.25 + 0.75 * vAlong) * uNight, 1.0);
  }`, THREE.DoubleSide);

const CORNERS: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const QUAD_INDEX = [0, 1, 2, 0, 2, 3];

// 每盞燈 4 個頂點的方形合成一個網格：光暈與光斑都是一次繪製。
function quadGeometry(count: number, fill: (i: number, corner: [number, number], k: number) => { position: THREE.Vector3Like; tint: THREE.Color; radius: number }): THREE.BufferGeometry {
  const positions = new Float32Array(count * 12);
  const corners = new Float32Array(count * 8);
  const tints = new Float32Array(count * 12);
  const radii = new Float32Array(count * 4);
  const index: number[] = [];
  for (let i = 0; i < count; i++) {
    CORNERS.forEach((corner, k) => {
      const v = i * 4 + k;
      const { position, tint, radius } = fill(i, corner, k);
      positions.set([position.x, position.y, position.z], v * 3);
      corners.set(corner, v * 2);
      tints.set([tint.r, tint.g, tint.b], v * 3);
      radii[v] = radius;
    });
    index.push(...QUAD_INDEX.map((n) => i * 4 + n));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
  geometry.setAttribute('radius', new THREE.BufferAttribute(radii, 1));
  geometry.setIndex(index);
  return geometry;
}

function beamGeometry(spots: LightSpot[]): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const top = new THREE.Vector3();
  const bottom = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const spot of spots) {
    top.set(spot.x, spot.y, spot.z);
    bottom.set(spot.poolX, spot.poolY, spot.poolZ);
    const length = top.distanceTo(bottom);
    if (length < 1) continue;
    // CylinderGeometry 的 uv.y 從底部 0 到頂部 1：頂部是燈頭
    const cone = new THREE.CylinderGeometry(BEAM_TOP_RADIUS, LAMP_LOOK.flood.pool * BEAM_BOTTOM_SHARE, length, 16, 1, true);
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, top.clone().sub(bottom).normalize()));
    cone.translate((top.x + bottom.x) / 2, (top.y + bottom.y) / 2, (top.z + bottom.z) / 2);
    parts.push(cone.toNonIndexed());
    cone.dispose();
  }
  if (parts.length === 0) return null;
  const merged = new THREE.BufferGeometry();
  const total = parts.reduce((sum, part) => sum + (part.attributes.position?.count ?? 0), 0);
  const positions = new Float32Array(total * 3);
  const uvs = new Float32Array(total * 2);
  let offset = 0;
  for (const part of parts) {
    const position = part.getAttribute('position');
    const uv = part.getAttribute('uv');
    positions.set(position.array, offset * 3);
    uvs.set(uv.array, offset * 2);
    offset += position.count;
    part.dispose();
  }
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return merged;
}

function nightMesh(geometry: THREE.BufferGeometry, material: THREE.Material, renderOrder: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;   // 一個網格涵蓋整圈，算包圍球沒有意義
  mesh.renderOrder = renderOrder;
  return mesh;
}

/**
 * 所有燈的夜間發光：燈泡光暈、地面光斑、照明燈的光束，各一次繪製。
 * 回傳的群組每格要呼叫 updateLampVisibility（夜晚程度是 0 時整個不畫）。
 */
export function createLampLights(spots: LightSpot[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lamp-lights';
  if (spots.length === 0) return group;
  const tint = new THREE.Color();
  const glow = quadGeometry(spots.length, (i) => {
    const spot = spots[i] as LightSpot;
    const look = LAMP_LOOK[spot.kind];
    return { position: { x: spot.x, y: spot.y, z: spot.z }, tint: tint.set(look.color), radius: look.glow };
  });
  const pool = quadGeometry(spots.length, (i, [cx, cz]) => {
    const spot = spots[i] as LightSpot;
    const look = LAMP_LOOK[spot.kind];
    return {
      position: { x: spot.poolX + cx * look.pool, y: spot.poolY + POOL_LIFT, z: spot.poolZ + cz * look.pool },
      tint: tint.set(look.color).multiplyScalar(look.strength), radius: look.pool,
    };
  });
  // 光斑先畫、光束再畫、光暈最後：疊加混合本身不分先後，順序固定只是避免每格重新排序
  group.add(nightMesh(pool, poolShader, 1), nightMesh(glow, glowShader, 3));
  const beams = beamGeometry(spots.filter((spot) => spot.kind === 'flood'));
  if (beams) group.add(nightMesh(beams, beamShader, 2));
  return group;
}

/** 白天整個不畫，省下透明物件的排序與繪製。 */
export function updateLampVisibility(group: THREE.Object3D): void {
  group.visible = nightUniform.value > HIDDEN_BELOW;
}

// ---------- 星空 ----------
// 星星是點雲：一般的星散在整個球面（漂浮在空中的世界，往下看也是星空），銀河是一條帶狀、很密的小暗星。
// 天空球跟著鏡頭移動、放大到接近可視距離，所以永遠走不到邊；最先畫、不測深度也不寫深度，其他東西直接蓋在上面。
const STAR_COUNT = 2600;
const MILKY_WAY_COUNT = 6000;
const MILKY_WAY_WIDTH = 0.11;               // 銀河帶的寬度（弧度，常態分布的標準差）
const MILKY_WAY_TILT = new THREE.Euler(0.9, 0.4, 0.2);
const SKY_RADIUS_SHARE = 0.85;              // 天空球半徑 = 鏡頭可視距離 × 這個比例
const MOON_DIRECTION = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
const MOON_SIZE = 0.05;                      // 月亮直徑 = 天空球半徑 × 這個比例
const STAR_COLORS = [0xffffff, 0xdfe8ff, 0xfff1d6, 0xcfdcff, 0xffe2c4];

// 固定種子的亂數（mulberry32），每次重新整理星星位置一樣
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDirection(random: () => number, out: THREE.Vector3): THREE.Vector3 {
  const y = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const ring = Math.sqrt(1 - y * y);
  return out.set(ring * Math.cos(angle), y, ring * Math.sin(angle));
}

function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(random(), 1e-6))) * Math.cos(Math.PI * 2 * random());
}

function starGeometry(): THREE.BufferGeometry {
  const random = seededRandom(20261113);
  const total = STAR_COUNT + MILKY_WAY_COUNT;
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const phases = new Float32Array(total);
  const direction = new THREE.Vector3();
  const color = new THREE.Color();
  const band = new THREE.Quaternion().setFromEuler(MILKY_WAY_TILT);
  for (let i = 0; i < total; i++) {
    const isBand = i >= STAR_COUNT;
    if (isBand) {
      const angle = random() * Math.PI * 2;
      const offset = gaussian(random) * MILKY_WAY_WIDTH;
      direction.set(Math.cos(angle) * Math.cos(offset), Math.sin(offset), Math.sin(angle) * Math.cos(offset)).applyQuaternion(band);
    } else {
      randomDirection(random, direction);
    }
    positions.set([direction.x, direction.y, direction.z], i * 3);
    // 亮星少、暗星多：大小取次方，大部分落在小的那端
    const brightness = isBand ? 0.25 + random() * 0.35 : 0.35 + Math.pow(random(), 3) * 0.65;
    color.set(STAR_COLORS[Math.floor(random() * STAR_COLORS.length)] ?? 0xffffff).multiplyScalar(brightness);
    colors.set([color.r, color.g, color.b], i * 3);
    sizes[i] = isBand ? 1 + random() * 0.8 : 1.2 + Math.pow(random(), 4) * 2.6;
    phases[i] = random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('tint', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  return geometry;
}

// 月亮：canvas 畫的圓盤，邊緣微暗、幾塊淡淡的月海。
function moonTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('建立月亮貼圖失敗：瀏覽器不支援 canvas 2d');
  const half = size / 2;
  const disc = ctx.createRadialGradient(half * 0.85, half * 0.85, half * 0.1, half, half, half * 0.9);
  disc.addColorStop(0, '#fffaf0');
  disc.addColorStop(0.8, '#e8e2d2');
  disc.addColorStop(1, '#b9b3a6');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(half, half, half * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120, 118, 112, 0.35)';
  for (const [x, y, r] of [[0.42, 0.4, 0.16], [0.62, 0.55, 0.11], [0.5, 0.7, 0.09], [0.7, 0.35, 0.07]] as const) {
    ctx.beginPath();
    ctx.arc(x * size, y * size, r * size, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface NightSky { group: THREE.Group; update(camera: THREE.PerspectiveCamera, time: number): void }

/** 星空、銀河、月亮。每格 update 把天空球移到鏡頭位置、更新閃爍時間；白天不畫。 */
export function createNightSky(pixelRatio: number): NightSky {
  const group = new THREE.Group();
  group.name = 'night-sky';
  const time = { value: 0 };
  const stars = new THREE.Points(starGeometry(), new THREE.ShaderMaterial({
    uniforms: { uNight: nightUniform, uTime: time, uPixelRatio: { value: pixelRatio } },
    vertexShader: `
      attribute vec3 tint;
      attribute float size;
      attribute float phase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vTint;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        float twinkle = 0.8 + 0.2 * sin(uTime * (1.3 + fract(phase) * 1.7) + phase);
        gl_PointSize = size * twinkle * uPixelRatio;
        vTint = tint * twinkle;
      }`,
    fragmentShader: `
      uniform float uNight;
      varying vec3 vTint;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float alpha = smoothstep(0.5, 0.1, d);
        gl_FragColor = vec4(vTint * alpha * uNight, 1.0);
      }`,
    // 不透明的佇列裡最先畫、不測深度：之後所有東西都蓋在上面（透明物件的佇列在不透明之後，會被它們蓋過，所以不能放那裡）
    depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stars.frustumCulled = false;
  stars.renderOrder = -10;
  const moonMaterial = new THREE.MeshBasicMaterial({ map: moonTexture(), depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), moonMaterial);
  moon.frustumCulled = false;
  moon.renderOrder = -9;
  group.add(stars, moon);
  return {
    group,
    update(camera, seconds) {
      group.visible = nightUniform.value > HIDDEN_BELOW;
      if (!group.visible) return;
      const radius = camera.far * SKY_RADIUS_SHARE;
      group.position.copy(camera.position);
      stars.scale.setScalar(radius);
      moon.position.copy(MOON_DIRECTION).multiplyScalar(radius);
      moon.scale.setScalar(radius * MOON_SIZE);
      moon.quaternion.copy(camera.quaternion);
      moonMaterial.color.setScalar(nightUniform.value);
      time.value = seconds;
    },
  };
}
