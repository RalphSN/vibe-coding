// 天空與夜晚：太陽、月亮的運行與天色，星空，路燈的光暈、地面光斑與照明燈光束。燈都不是真的光源（不參與光照計算），
// 只是疊加上去的發光貼片，所以幾百盞燈也只多幾次繪製。白天它們全部隱藏。
// nightUniform 是共用的「夜晚程度」：0 白天、1 夜晚，由太陽高度決定（見 computeSky）；房屋窗戶的著色器也讀它。
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
  // 水下燈先畫、再被玻璃池底與水面蓋過，只剩約三成亮：光暈與光斑要比水上的燈亮很多才看得出來
  underwater: { glow: 1.1, pool: 2.4, color: 0x6fe8ff, strength: 1.8 },
};
// 透明物件照 renderOrder 由小到大畫。一般的燈最後畫，疊在所有東西上面。
// 水下燈要比水面、玻璃池壁先畫（負的），水和玻璃再蓋上去，看起來在水裡、被水染色變暗；後畫的話會像浮在水面上。
const LAMP_ORDER = { pool: 1, beam: 2, glow: 3 };
const UNDERWATER_ORDER = { pool: -2, beam: -2, glow: -1 };
const GLOW_MIN_SCREEN = 0.0025;   // 光暈至少佔「距離 × 這個比例」公尺，遠處的燈縮成幾個像素的亮點，不會消失或閃爍
const GLOW_TOWARD_CAMERA = 0.6;   // 光暈往鏡頭方向挪（光暈半徑的比例），不會被燈罩切掉一半
const POOL_LIFT = 0.04;           // 光斑離地面多高（m），不和地面搶深度
const BEAM_TOP_RADIUS = 0.5;      // 照明燈光束在燈頭的半徑（m）
const BEAM_BOTTOM_SHARE = 0.55;   // 光束落地的半徑 = 光斑半徑 × 這個比例
const BEAM_STRENGTH = 0.07;
// 入夜時燈不是同時亮：每盞燈有自己的 seed（0–1），夜晚程度到 seed × LAMP_STAGGER 才開始亮，再過 LAMP_FADE 全亮
const LAMP_STAGGER = '0.5';
const LAMP_FADE = '0.2';

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
  attribute float seed;
  uniform float uNight;
  varying vec2 vCorner;
  varying vec3 vTint;
  varying float vOn;
  void main() {
    vOn = smoothstep(seed * ${LAMP_STAGGER}, seed * ${LAMP_STAGGER} + ${LAMP_FADE}, uNight);
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
  varying vec2 vCorner;
  varying vec3 vTint;
  varying float vOn;
  void main() {
    #include <logdepthbuf_fragment>
    float d = length(vCorner);
    if (d > 1.0) discard;
    float core = smoothstep(0.32, 0.0, d);
    float halo = pow(1.0 - d, 2.2) * 0.55;
    gl_FragColor = vec4(vTint * (core + halo) * vOn, 1.0);
  }`);

// 地面光斑：平放的方形，中心最亮、到邊緣淡到 0（平方衰減，邊緣不會有一圈硬邊）。
const poolShader = glowMaterial(`
  ${LOGDEPTH_VERTEX_PARS}
  attribute vec2 corner;
  attribute vec3 tint;
  attribute float seed;
  attribute vec2 clip;
  uniform float uNight;
  varying vec2 vCorner;
  varying vec3 vTint;
  varying float vOn;
  varying vec2 vGround;
  varying vec2 vClip;
  void main() {
    vOn = smoothstep(seed * ${LAMP_STAGGER}, seed * ${LAMP_STAGGER} + ${LAMP_FADE}, uNight);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
    vCorner = corner;
    vTint = tint;
    vGround = position.xz;   // 光斑網格放在原點、頂點就是世界座標
    vClip = clip;
  }`, `
  ${LOGDEPTH_FRAGMENT_PARS}
  varying vec2 vCorner;
  varying vec3 vTint;
  varying float vOn;
  varying vec2 vGround;
  varying vec2 vClip;
  void main() {
    #include <logdepthbuf_fragment>
    float d = length(vCorner);
    float fromCenter = length(vGround);
    // 只畫在環面上：超出這盞燈所在那一段環（離圓心 clip.x–clip.y）的部分是空中或縫隙，不畫
    if (d > 1.0 || fromCenter < vClip.x || fromCenter > vClip.y) discard;
    float falloff = 1.0 - d * d;
    gl_FragColor = vec4(vTint * falloff * falloff * vOn, 1.0);
  }`);   // 只畫朝上那面（頂點順序見 quadGeometry 的 faceUp）：從環的下方看不到光斑

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
/** 第 i 盞燈的 0–1 亂數（固定，每次重新整理一樣）：光暈和光斑用同一個，同一盞燈的兩者一起亮。 */
const lampSeed = (i: number): number => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const QUAD_INDEX = [0, 1, 2, 0, 2, 3];

// 每盞燈 4 個頂點的方形合成一個網格：光暈與光斑都是一次繪製。
// 面向鏡頭的光暈用原本的頂點順序；平放的光斑（faceUp）反過來，正面朝上。clip 是光斑的裁切範圍（離圓心的距離）。
interface QuadVertex { position: THREE.Vector3Like; tint: THREE.Color; radius: number; clip?: [number, number] }
const FACE_UP_INDEX = [0, 2, 1, 0, 3, 2];
const NO_CLIP: [number, number] = [0, 1e6];
function quadGeometry(count: number, fill: (i: number, corner: [number, number], k: number) => QuadVertex, faceUp = false): THREE.BufferGeometry {
  const positions = new Float32Array(count * 12);
  const corners = new Float32Array(count * 8);
  const tints = new Float32Array(count * 12);
  const radii = new Float32Array(count * 4);
  const seeds = new Float32Array(count * 4);
  const clips = new Float32Array(count * 8);
  const order = faceUp ? FACE_UP_INDEX : QUAD_INDEX;
  const index: number[] = [];
  for (let i = 0; i < count; i++) {
    CORNERS.forEach((corner, k) => {
      const v = i * 4 + k;
      const { position, tint, radius, clip = NO_CLIP } = fill(i, corner, k);
      positions.set([position.x, position.y, position.z], v * 3);
      corners.set(corner, v * 2);
      tints.set([tint.r, tint.g, tint.b], v * 3);
      radii[v] = radius;
      seeds[v] = lampSeed(i);
      clips.set(clip, v * 2);
    });
    index.push(...order.map((n) => i * 4 + n));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
  geometry.setAttribute('radius', new THREE.BufferAttribute(radii, 1));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('clip', new THREE.BufferAttribute(clips, 2));
  geometry.setIndex(index);
  return geometry;
}

const poolRadius = (spot: LightSpot): number => spot.poolRadius > 0 ? spot.poolRadius : LAMP_LOOK[spot.kind].pool;

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
    const cone = new THREE.CylinderGeometry(BEAM_TOP_RADIUS, poolRadius(spot) * BEAM_BOTTOM_SHARE, length, 16, 1, true);
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
 * 所有燈的夜間發光：燈泡光暈、地面光斑、照明燈的光束；水上與水下的燈各自一組，每種各一次繪製。
 * 回傳的群組每格要呼叫 updateLampVisibility（夜晚程度是 0 時整個不畫）。
 */
export function createLampLights(spots: LightSpot[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lamp-lights';
  const isUnderwater = (spot: LightSpot): boolean => spot.kind === 'underwater';
  const meshes = [...lampMeshes(spots.filter((spot) => !isUnderwater(spot)), LAMP_ORDER), ...lampMeshes(spots.filter(isUnderwater), UNDERWATER_ORDER)];
  if (meshes.length > 0) group.add(...meshes);   // add() 不帶參數會印錯誤
  return group;
}

function lampMeshes(spots: LightSpot[], order: typeof LAMP_ORDER): THREE.Mesh[] {
  if (spots.length === 0) return [];
  const tint = new THREE.Color();
  const glow = quadGeometry(spots.length, (i) => {
    const spot = spots[i] as LightSpot;
    const look = LAMP_LOOK[spot.kind];
    return { position: { x: spot.x, y: spot.y, z: spot.z }, tint: tint.set(look.color), radius: look.glow };
  });
  const pool = quadGeometry(spots.length, (i, [cx, cz]) => {
    const spot = spots[i] as LightSpot;
    const look = LAMP_LOOK[spot.kind];
    const radius = poolRadius(spot);
    return {
      position: { x: spot.poolX + cx * radius, y: spot.poolY + POOL_LIFT, z: spot.poolZ + cz * radius },
      tint: tint.set(look.color).multiplyScalar(look.strength), radius,
      clip: [spot.clipInner, Math.min(spot.clipOuter, NO_CLIP[1])],
    };
  }, true);
  // 光斑先畫、光束再畫、光暈最後：疊加混合本身不分先後，順序固定只是避免每格重新排序
  const meshes = [nightMesh(pool, poolShader, order.pool), nightMesh(glow, glowShader, order.glow)];
  const beams = beamGeometry(spots.filter((spot) => spot.kind === 'flood'));
  if (beams) meshes.push(nightMesh(beams, beamShader, order.beam));
  return meshes;
}

/** 白天整個不畫，省下透明物件的排序與繪製。 */
export function updateLampVisibility(group: THREE.Object3D): void {
  group.visible = nightUniform.value > HIDDEN_BELOW;
}

// ---------- 天體運行 ----------
// 太陽與月亮沿同一條傾斜的圓形軌道東升西落：6 時日出、12 時最高（仰角 90° − ORBIT_TILT）、18 時日落。
// 月亮在軌道上比太陽多 135°：21 時月出、23 時仰角約 27°、隔天 9 時月落。星空繞同一個轉軸轉，整個天球一起運行。
// 軌道整個繞垂直軸轉到「13 時的太陽 = 原本固定的光源方向 (3, 6, 2)」，白天的打光和以前一樣。
/** 白天、夜晚停在幾點；切換時時間從一個往前跑到另一個（白天到夜晚經過日落，夜晚到白天經過日出）。 */
export const SKY_HOURS = { day: 13, night: 23 };
const ORBIT_TILT = THREE.MathUtils.degToRad(25);
const MOON_PHASE_OFFSET = Math.PI * 0.75;
const SUN_REFERENCE = new THREE.Vector3(3, 6, 2).normalize();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const orbitStart = new THREE.Vector3(1, 0, 0);                                            // 6 時太陽所在的方向（東方地平線）
const orbitAxis = new THREE.Vector3(0, -Math.sin(ORBIT_TILT), Math.cos(ORBIT_TILT));     // 軌道轉軸（天極）
alignOrbit();

/** 太陽在軌道上的角度（弧度）：6 時 0、12 時 π/2、18 時 π。 */
function sunPhase(hour: number): number {
  return ((hour - 6) / 12) * Math.PI;
}

function alignOrbit(): void {
  const atDay = orbitStart.clone().applyAxisAngle(orbitAxis, sunPhase(SKY_HOURS.day));
  const yaw = Math.atan2(SUN_REFERENCE.x, SUN_REFERENCE.z) - Math.atan2(atDay.x, atDay.z);
  orbitStart.applyAxisAngle(WORLD_UP, yaw);
  orbitAxis.applyAxisAngle(WORLD_UP, yaw);
}

/** 這個時間太陽在天空的方向（單位向量，y 是仰角的 sin，負的是在地平線下）。 */
export function sunDirection(hour: number, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(orbitStart).applyAxisAngle(orbitAxis, sunPhase(hour));
}

/** 這個時間月亮在天空的方向。 */
export function moonDirection(hour: number, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(orbitStart).applyAxisAngle(orbitAxis, sunPhase(hour) + MOON_PHASE_OFFSET);
}

// ---------- 天色 ----------
// 依太陽高度（仰角的 sin）在幾個時段之間插值：天頂、地平線、地平線以下（雲海的霧色）、太陽光暈，
// 以及環境光與太陽光的顏色和亮度。白天的地平線就是原本的背景色，白天看起來和以前一樣。
interface SkyLook {
  zenith: THREE.Color; horizon: THREE.Color; below: THREE.Color; glow: THREE.Color; glowStrength: number;
  ambient: THREE.Color; ambientIntensity: number; sun: THREE.Color; sunIntensity: number;
}
const skyLook = (zenith: number, horizon: number, below: number, glow: number, glowStrength: number, ambient: number, ambientIntensity: number, sun: number, sunIntensity: number): SkyLook => ({
  zenith: new THREE.Color(zenith), horizon: new THREE.Color(horizon), below: new THREE.Color(below), glow: new THREE.Color(glow), glowStrength,
  ambient: new THREE.Color(ambient), ambientIntensity, sun: new THREE.Color(sun), sunIntensity,
});
// height 由高到低：白天 → 黃金時刻 → 日落 → 藍調 → 夜晚
const SKY_STOPS: { height: number; look: SkyLook }[] = [
  { height: 0.3, look: skyLook(0xdfe6f0, 0xeef0f2, 0xeef0f2, 0xffe9c2, 0.2, 0xffffff, 1.2, 0xffffff, 1.8) },
  { height: 0.12, look: skyLook(0xa9c0de, 0xf6d6b8, 0xd9c6c0, 0xffa95e, 0.55, 0xffe6cc, 1.05, 0xffd29a, 1.6) },
  { height: 0, look: skyLook(0x5a6a9c, 0xff8c55, 0x7a5a6e, 0xff7a3c, 1.3, 0xf2b9a6, 0.75, 0xff9050, 0.8) },
  { height: -0.1, look: skyLook(0x1b2246, 0x6b3f5c, 0x1a1830, 0xb34a4a, 0.5, 0x9a9ccc, 0.5, 0xff9050, 0) },
  { height: -0.25, look: skyLook(0x060a18, 0x0d1430, 0x05070f, 0x000000, 0, 0x7d90c8, 0.32, 0xff9050, 0) },
];
const MOON_LIGHT = { color: new THREE.Color(0xa9bcff), intensity: 0.35 };

/** 某個時間的天空：太陽、月亮方向，天色與光線，夜晚程度（路燈、窗戶、星星照這個亮起來）。 */
export interface SkyState {
  hour: number; sun: THREE.Vector3; moon: THREE.Vector3; look: SkyLook; night: number;
  /** 唯一那盞平行光：這一刻跟著太陽或月亮（兩者交接時亮度剛好是 0，方向換了看不出來） */
  light: { direction: THREE.Vector3; color: THREE.Color; intensity: number };
}
export function createSkyState(): SkyState {
  const first = SKY_STOPS[0] as { look: SkyLook };
  return {
    hour: SKY_HOURS.day, sun: new THREE.Vector3(), moon: new THREE.Vector3(), night: 0,
    look: skyLook(0, 0, 0, 0, 0, 0, 0, 0, 0),
    light: { direction: new THREE.Vector3(), color: first.look.sun.clone(), intensity: 0 },
  };
}

function interpolateLook(height: number, out: SkyLook): void {
  const stops = SKY_STOPS;
  const top = stops[0] as { height: number; look: SkyLook };
  const bottom = stops[stops.length - 1] as { height: number; look: SkyLook };
  let upper = top;
  let lower = top;
  if (height <= bottom.height) upper = lower = bottom;
  else if (height < top.height) {
    for (let i = 1; i < stops.length; i++) {
      const stop = stops[i] as { height: number; look: SkyLook };
      if (height >= stop.height) {
        upper = stops[i - 1] as { height: number; look: SkyLook };
        lower = stop;
        break;
      }
    }
  }
  const t = upper === lower ? 0 : (upper.height - height) / (upper.height - lower.height);
  const a = upper.look;
  const b = lower.look;
  for (const key of ['zenith', 'horizon', 'below', 'glow', 'ambient', 'sun'] as const) out[key].lerpColors(a[key], b[key], t);
  out.glowStrength = THREE.MathUtils.lerp(a.glowStrength, b.glowStrength, t);
  out.ambientIntensity = THREE.MathUtils.lerp(a.ambientIntensity, b.ambientIntensity, t);
  out.sunIntensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
}

/** 算出 hour 時的天空，寫進 out。 */
export function computeSky(hour: number, out: SkyState): SkyState {
  out.hour = hour;
  sunDirection(hour, out.sun);
  moonDirection(hour, out.moon);
  interpolateLook(out.sun.y, out.look);
  // 太陽沉到地平線下一點點，路燈開始亮；再低一些全部亮
  out.night = 1 - THREE.MathUtils.smoothstep(out.sun.y, -0.15, 0.03);
  const sunLight = out.look.sunIntensity * THREE.MathUtils.smoothstep(out.sun.y, -0.01, 0.05);
  const moonLight = MOON_LIGHT.intensity * THREE.MathUtils.smoothstep(out.moon.y, -0.01, 0.12) * out.night;
  const isSun = sunLight >= moonLight;
  out.light.direction.copy(isSun ? out.sun : out.moon);
  out.light.color.copy(isSun ? out.look.sun : MOON_LIGHT.color);
  out.light.intensity = Math.abs(sunLight - moonLight);
  return out;
}

// ---------- 天空 ----------
// 天空球、星星、月亮都跟著鏡頭移動、放大到接近可視距離，所以永遠走不到邊；
// 在不透明物件的佇列裡最先畫、不測深度也不寫深度，其他東西直接蓋在上面（透明物件在不透明之後畫，不能放那裡）。
// 天空球：天頂到地平線的漸層、地平線以下的霧色、太陽周圍與地平線上太陽那一側的暖光，太陽圓盤也畫在這裡（沉到地平線以下就被切掉）。
// 星星是點雲：一般的星散在整個球面（漂浮在空中的世界，往下看也是星空），銀河是一條帶狀、很密的小暗星。
const STAR_COUNT = 2600;
const MILKY_WAY_COUNT = 6000;
const MILKY_WAY_WIDTH = 0.11;               // 銀河帶的寬度（弧度，常態分布的標準差）
const MILKY_WAY_TILT = new THREE.Euler(0.9, 0.4, 0.2);
const SKY_RADIUS_SHARE = 0.85;              // 天空球半徑 = 鏡頭可視距離 × 這個比例
const MOON_SIZE = 0.05;                     // 月亮直徑 = 天空球半徑 × 這個比例
const SUN_RADIUS = THREE.MathUtils.degToRad(1.5);   // 太陽圓盤的視半徑（真實約 0.27°，放大才看得到）
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

export interface Sky { group: THREE.Group; update(camera: THREE.PerspectiveCamera, seconds: number, state: SkyState): void }

function skyDome(): { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> } {
  const uniforms: Record<string, THREE.IUniform> = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBelow: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() }, uGlowStrength: { value: 0 }, uSunColor: { value: new THREE.Color() },
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uBelow;
      uniform vec3 uGlow;
      uniform float uGlowStrength;
      uniform vec3 uSunColor;
      uniform vec3 uSunDirection;
      varying vec3 vDirection;
      void main() {
        vec3 d = normalize(vDirection);
        float h = d.y;
        vec3 color = h >= 0.0 ? mix(uHorizon, uZenith, pow(h, 0.5)) : mix(uHorizon, uBelow, pow(-h, 0.35));
        float toSun = dot(d, uSunDirection);
        float around = max(toSun, 0.0);
        // 地平線上、太陽那一側的暖光帶（黃昏最明顯）：離地平線越遠、方位離太陽越遠越淡
        vec2 flatView = d.xz / max(length(d.xz), 1e-4);
        vec2 flatSun = uSunDirection.xz / max(length(uSunDirection.xz), 1e-4);
        float band = exp(-abs(h) * 7.0) * pow(max(dot(flatView, flatSun), 0.0), 3.0);
        color += uGlow * uGlowStrength * (pow(around, 12.0) * 0.6 + pow(around, 200.0) * 0.6 + band * 0.7);
        // 太陽圓盤：地平線以下被切掉（留一點柔邊），看起來是沉到地平線後面
        float disc = smoothstep(${Math.cos(SUN_RADIUS * 1.15).toFixed(7)}, ${Math.cos(SUN_RADIUS * 0.85).toFixed(7)}, toSun) * smoothstep(-0.004, 0.006, h);
        color = mix(color, uSunColor, disc);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthTest: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -11;
  return { mesh, uniforms };
}

function starField(pixelRatio: number, time: THREE.IUniform): THREE.Points {
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
    depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stars.frustumCulled = false;
  stars.renderOrder = -10;
  return stars;
}

// 月亮：canvas 貼圖的方形，永遠面向鏡頭；和太陽一樣，沉到地平線以下的部分被切掉。
function moonDisc(): { mesh: THREE.Mesh; brightness: THREE.IUniform } {
  const brightness: THREE.IUniform = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: moonTexture() }, uBrightness: brightness },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldDirection;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldDirection = world.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uBrightness;
      varying vec2 vUv;
      varying vec3 vWorldDirection;
      void main() {
        vec4 texel = texture2D(uMap, vUv);
        float aboveHorizon = smoothstep(-0.004, 0.006, normalize(vWorldDirection).y);
        gl_FragColor = vec4(texel.rgb * texel.a * uBrightness * aboveHorizon, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -9;
  return { mesh, brightness };
}

/** 天空球（含太陽）、星空、銀河、月亮。每格 update 把整組移到鏡頭位置，照 state 更新天色、太陽與月亮位置、星空旋轉。 */
export function createSky(pixelRatio: number): Sky {
  const group = new THREE.Group();
  group.name = 'sky';
  const time: THREE.IUniform = { value: 0 };
  const dome = skyDome();
  const stars = starField(pixelRatio, time);
  const moon = moonDisc();
  group.add(dome.mesh, stars, moon.mesh);
  const u = dome.uniforms;
  return {
    group,
    update(camera, seconds, state) {
      const radius = camera.far * SKY_RADIUS_SHARE;
      group.position.copy(camera.position);
      dome.mesh.scale.setScalar(radius);
      const { look } = state;
      (u.uZenith?.value as THREE.Color).copy(look.zenith);
      (u.uHorizon?.value as THREE.Color).copy(look.horizon);
      (u.uBelow?.value as THREE.Color).copy(look.below);
      (u.uGlow?.value as THREE.Color).copy(look.glow);
      (u.uSunColor?.value as THREE.Color).copy(look.sun);
      (u.uSunDirection?.value as THREE.Vector3).copy(state.sun);
      if (u.uGlowStrength) u.uGlowStrength.value = look.glowStrength;
      // 星空繞天極轉：和太陽同一個轉軸、同一個角度
      stars.visible = state.night > HIDDEN_BELOW;
      stars.scale.setScalar(radius);
      stars.quaternion.setFromAxisAngle(orbitAxis, sunPhase(state.hour));
      time.value = seconds;
      moon.brightness.value = state.night;
      moon.mesh.visible = state.night > HIDDEN_BELOW && state.moon.y > -MOON_SIZE;
      moon.mesh.position.copy(state.moon).multiplyScalar(radius);
      moon.mesh.scale.setScalar(radius * MOON_SIZE);
      moon.mesh.quaternion.copy(camera.quaternion);
    },
  };
}
