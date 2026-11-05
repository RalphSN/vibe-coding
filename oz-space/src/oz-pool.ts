// OZ 世界的環形游泳池：沿著圓周繞一圈的水道（8 條圓形水道），內外兩側是石材池畔。
// 水面：會折射的透明材質（MeshPhysicalMaterial transmission），波紋在著色器裡即時計算（幾道不同方向、波長的深水波相加，
// 波速照深水波公式），法線跟著波紋算，所以反光、折射都會動。池底與池壁疊上會動的光紋（caustics）。
import * as THREE from 'three';
import { annulus, bakeByMaterial, createRng, emptyBuild, getPropsEnvironment, shinyMaterial, type PropsBuild, type RingSpec } from './oz-props';

type Rng = () => number;
type Vec3 = [number, number, number];

const TAU = Math.PI * 2;
// 池子的剖面：內側池畔 deckInner、外側池畔 deckOuter；水面比池畔低 waterDrop，水深 waterDepth（跳水池的深度：潛到底時第三人稱鏡頭也會進到水裡）。
const POOL = { deckInner: 7, deckOuter: 9, waterDrop: 0.25, waterDepth: 2.5, floorSlab: 0.05, base: 0.6, lanes: 8, laneMargin: 1, laneLine: 0.25, coping: 0.35, copingLip: 0.04, copingRise: 0.03 };
const WATER_SEGMENTS = { around: 720, across: 16 };
const WALL_SEGMENTS = 512;
const DECK_TILE = 1.2;              // 池畔石板貼圖一張涵蓋幾公尺
const WATERLINE = { below: 0.2, height: 0.3, tileHeight: 0.25 };
const ROPE = { radius: 0.06, length: 0.6, tubular: 1440 };
const WAVE_TIME_SCALE = '0.55';     // 波紋時間倍率（GLSL 字面值）：泳池比海面平靜
const SUN_DIRECTION = [3, 6, 2];    // 和 main.ts 的太陽方向一樣，水面高光才對得上
const LOUNGE_SPACING = 7;           // 外側池畔：每 7 m 一組（兩張躺椅加一把陽傘）
const LADDER_SPACING = 45;
const LIFEGUARD_CHAIRS = 4;
const SHOWERS = 6;
const PLANTER_SPACING = 14;

const waterTime = { value: 0 };
/** 每格呼叫：time 是累計秒數，水面波紋和池底光紋都跟著它動。 */
export function updateWater(time: number): void {
  waterTime.value = time;
}

// ---------- 著色器片段 ----------
// 一道深水波：回傳 (高度, ∂h/∂x, ∂h/∂z)。波速 c = √(g / k)。
const WAVE_GLSL = `
vec3 ozWave(vec2 p, float t, float angle, float wavelength, float amplitude) {
  vec2 d = vec2(cos(angle), sin(angle));
  float k = 6.2831853 / wavelength;
  float phase = k * (dot(d, p) - sqrt(9.81 / k) * t);
  return vec3(amplitude * sin(phase), amplitude * k * cos(phase) * d);
}
vec3 ozWaves(vec2 p, float t) {
  return ozWave(p, t, 0.3, 4.3, 0.014) + ozWave(p, t, 1.9, 2.7, 0.010) + ozWave(p, t, 2.8, 1.6, 0.007)
       + ozWave(p, t, 4.1, 0.9, 0.004) + ozWave(p, t, 5.2, 0.55, 0.0025) + ozWave(p, t, 0.95, 0.37, 0.0015)
       + ozWave(p, t, 3.6, 0.23, 0.0009);
}
`;

// 光紋：兩層會動的 Voronoi 網格邊緣（細胞中心隨時間繞圈），先輕微扭曲座標，亮線才不會是直的。
const CAUSTIC_GLSL = `
vec2 ozHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float ozVoronoiEdge(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.45 * sin(t + 6.2831853 * ozHash2(cell + g));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}
float ozCaustic(vec2 p, float t) {
  vec2 w = p + 0.15 * vec2(sin(p.y * 2.3 + t * 0.8), cos(p.x * 2.1 - t * 0.7));
  float e1 = 1.0 - smoothstep(0.0, 0.22, ozVoronoiEdge(w, t * 0.9));
  float e2 = 1.0 - smoothstep(0.0, 0.16, ozVoronoiEdge(w * 1.6 + 3.7, -t * 1.1));
  return e1 * e1 * e1 + 0.6 * e2 * e2 * e2;
}
`;

// ---------- 材質 ----------
// 會折射的水面：transmission 讓池底、池壁透過水面看得到，attenuation 讓越深越偏藍綠；法線由波紋即時計算。
function createWaterMaterial(): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.04, transmission: 1, thickness: POOL.waterDepth, ior: 1.333,
    attenuationColor: new THREE.Color(0x3fb0c4), attenuationDistance: 2.4, specularIntensity: 1,
    envMap: getPropsEnvironment(), envMapIntensity: 1.2,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOzTime = waterTime;
    const header = `#include <common>\nuniform float uOzTime;\nvarying vec3 vOzWorld;\n${WAVE_GLSL}`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', header)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y += ozWaves((modelMatrix * vec4(transformed, 1.0)).xz, uOzTime * ${WAVE_TIME_SCALE}).x;`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvOzWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', header)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 ozSlope = ozWaves(vOzWorld.xz, uOzTime * ${WAVE_TIME_SCALE});
        normal = normalize((viewMatrix * vec4(normalize(vec3(-ozSlope.y, 1.0, -ozSlope.z)), 0.0)).xyz);`);
  };
  return material;
}

// 從水下往上看的水面：折射水面只朝上，從下面看不到，所以另外疊一層朝下的半透明水面。
// 跟著同樣的波紋起伏，波紋斜的地方暗、平的地方亮，看起來是水面在晃。標成透明物件，不會被畫進折射圖。
function createUndersideMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: 0x9fe3ee, transparent: true, opacity: 0.8, side: THREE.BackSide, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOzTime = waterTime;
    const header = `#include <common>\nuniform float uOzTime;\nvarying vec3 vOzWorld;\n${WAVE_GLSL}`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', header)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y += ozWaves((modelMatrix * vec4(transformed, 1.0)).xz, uOzTime * ${WAVE_TIME_SCALE}).x;`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvOzWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', header)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 ozSlope = ozWaves(vOzWorld.xz, uOzTime * ${WAVE_TIME_SCALE});
        diffuseColor.rgb *= mix(0.7, 1.3, clamp(1.0 - 5.0 * length(ozSlope.yz), 0.0, 1.0));`);
  };
  return material;
}

// 水面以下的池底、池壁：在原本的打光上加一層會動的光紋，越接近水面越亮，水面以上沒有。
function causticMaterial(waterY: number, parameters: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial(parameters);
  const waterLevel = { value: waterY };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOzTime = waterTime;
    shader.uniforms.uOzWaterY = waterLevel;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOzWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvOzWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uOzTime;\nuniform float uOzWaterY;\nvarying vec3 vOzWorld;\n${CAUSTIC_GLSL}`)
      .replace('#include <opaque_fragment>', `
        float ozDepth = uOzWaterY - vOzWorld.y;
        float ozBelow = smoothstep(0.0, 0.08, ozDepth) * mix(1.0, 0.65, clamp(ozDepth / 2.0, 0.0, 1.0));
        vec2 ozP = vOzWorld.xz * 0.9 + vec2(vOzWorld.y * 0.7, -vOzWorld.y * 0.5);
        outgoingLight += diffuseColor.rgb * ozCaustic(ozP, uOzTime * 0.8) * 0.45 * ozBelow;
        #include <opaque_fragment>`);
  };
  return material;
}

// ---------- 貼圖 ----------
function pixelTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`建立泳池貼圖失敗：瀏覽器不支援 2D canvas（${width} × ${height} px）`);
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// 一格格的方磚：每塊顏色略有不同，磚縫一條條。cells 是一張貼圖裡一邊有幾塊。
function drawTiles(ctx: CanvasRenderingContext2D, rng: Rng, width: number, height: number, columns: number, rows: number, colors: string[], grout: string, groutPx: number): void {
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, width, height);
  const w = width / columns;
  const h = height / rows;
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      ctx.fillStyle = colors[Math.floor(rng() * colors.length)] ?? grout;
      ctx.fillRect(i * w + groutPx / 2, j * h + groutPx / 2, w - groutPx, h - groutPx);
    }
  }
}

// 泳池磁磚：一張 1 m，25 cm 一塊
const drawPoolTile = (ctx: CanvasRenderingContext2D): void =>
  drawTiles(ctx, createRng(21), 256, 256, 4, 4, ['#e8f4f7', '#dff0f4', '#ebf6f8', '#d6ecf1'], '#a7c6ce', 3);
// 水線磁磚：深藍小馬賽克，一張 1 m × 0.25 m
const drawWaterline = (ctx: CanvasRenderingContext2D): void =>
  drawTiles(ctx, createRng(22), 256, 64, 40, 10, ['#1f4f8f', '#235aa0', '#1b4580', '#2a6ab0'], '#d9e3ea', 1);
// 池畔石板：一張 1.2 m，60 cm 一塊，表面有細微斑點
function drawDeck(ctx: CanvasRenderingContext2D): void {
  const rng = createRng(23);
  drawTiles(ctx, rng, 256, 256, 2, 2, ['#e7dccb', '#e2d6c3', '#ebe1d1', '#ddd0bc'], '#b9ad9a', 4);
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(120, 100, 80, 0.08)' : 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(rng() * 256, rng() * 256, 1.5, 1.5);
  }
}
// 水道繩的浮球：一張 0.6 m 有 5 顆，每顆中間亮、兩端暗，球和球之間有縫，看起來是一顆顆的。
const drawRope = (colors: string[]) => (ctx: CanvasRenderingContext2D): void => {
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(0, 0, 160, 16);
  colors.forEach((color, i) => {
    const gradient = ctx.createLinearGradient(i * 32, 0, i * 32 + 32, 0);
    gradient.addColorStop(0, 'rgba(0,0,0,0.45)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = color;
    ctx.fillRect(i * 32 + 2, 0, 28, 16);
    ctx.fillStyle = gradient;
    ctx.fillRect(i * 32 + 2, 0, 28, 16);
  });
};
// 陽傘布：16 片，兩色相間
const drawCanopy = (a: string, b: string) => (ctx: CanvasRenderingContext2D): void => {
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? a : b;
    ctx.fillRect(i * 8, 0, 8, 8);
  }
};

function repeated(base: THREE.Texture, x: number, y: number): THREE.Texture {
  const texture = base.clone();
  texture.repeat.set(x, y);
  texture.needsUpdate = true;
  return texture;
}

function lambert(color: number, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

function createPoolMaterials() {
  return {
    water: createWaterMaterial(),
    waterUnderside: createUndersideMaterial(),
    tile: pixelTexture(256, 256, drawPoolTile),
    waterline: pixelTexture(256, 64, drawWaterline),
    deck: new THREE.MeshLambertMaterial({ map: pixelTexture(256, 256, drawDeck) }),
    coping: lambert(0xf2efe8),
    concrete: lambert(0xb7bcc2),
    chrome: shinyMaterial(0xe8ecf0, 1, 0.15),
    frame: lambert(0xf4f4f4),
    cushions: [0x3fa7a3, 0x2f4b7c, 0xf4efe6, 0xe07a5f].map((color) => lambert(color)),
    towels: [0xff7ac3, 0x4aa8e8, 0xf59a3a, 0xffffff, 0x6cc56b].map((color) => lambert(color)),
    canopies: [['#ffffff', '#2fa3b5'], ['#ffffff', '#e07a5f'], ['#f2d04b', '#ffffff']].map(([a = '#fff', b = '#000']) =>
      new THREE.MeshLambertMaterial({ map: pixelTexture(128, 8, drawCanopy(a, b)), side: THREE.DoubleSide })),
    umbrellaBase: lambert(0x3d4247),
    lifeguard: lambert(0xffffff),
    lifeRing: lambert(0xe8452c),
    redCanopy: new THREE.MeshLambertMaterial({ map: pixelTexture(128, 8, drawCanopy('#e8452c', '#ffffff')), side: THREE.DoubleSide }),
    grate: lambert(0x55595e),
    planter: lambert(0xb8afa4),
    leaves: lambert(0x5fa85d, { flatShading: true }),
    ropes: [['#d93a2b', '#ffffff', '#d93a2b', '#ffffff', '#d93a2b'], ['#1f5fbf', '#1f5fbf', '#ffffff', '#1f5fbf', '#1f5fbf'], ['#f2c200', '#1f5fbf', '#f2c200', '#1f5fbf', '#f2c200']]
      .map((colors) => pixelTexture(160, 16, drawRope(colors))),
  };
}
type PoolMaterials = ReturnType<typeof createPoolMaterials>;
let poolMaterials: PoolMaterials | null = null;
// 貼圖要用到 document、水面要用到環境貼圖，第一次建泳池時才建，之後共用。
function getPoolMaterials(): PoolMaterials {
  poolMaterials ??= createPoolMaterials();
  return poolMaterials;
}

// ---------- 幾何小工具 ----------
function addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: Vec3, rotation: Vec3 = [0, 0, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}
const box = (parent: THREE.Object3D, material: THREE.Material, size: Vec3, position: Vec3, rotation?: Vec3): THREE.Mesh =>
  addMesh(parent, new THREE.BoxGeometry(...size), material, position, rotation);
function rod(parent: THREE.Object3D, material: THREE.Material, from: Vec3, to: Vec3, radius: number, segments = 8): THREE.Mesh {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh);
  return mesh;
}
function childGroup(parent: THREE.Object3D, position: Vec3, yaw = 0): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  group.rotation.y = yaw;
  parent.add(group);
  return group;
}
// 在環上半徑 radius、角度 angle 的位置放一組東西：自身 z 朝外（徑向）、x 沿圓周。flip 時轉半圈，z 改朝圓心。
const placeOnRing = (parent: THREE.Object3D, radius: number, y: number, angle: number, flip = false): THREE.Group =>
  childGroup(parent, [radius * Math.sin(angle), y, radius * Math.cos(angle)], angle + (flip ? Math.PI : 0));

// 水平面的貼圖座標改成世界座標（公尺 / tileSize），磁磚、石板在整圈上才會一樣大、不會被拉長。
function planarUv(geometry: THREE.BufferGeometry, tileSize: number): void {
  const positions = geometry.getAttribute('position');
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = positions.getX(i) / tileSize;
    uv[i * 2 + 1] = positions.getZ(i) / tileSize;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// 圓筒池壁：只有側面。朝哪一面由材質的 side 決定：內側池壁用 FrontSide（面朝外，水在它外面），外側池壁用 BackSide。
function poolWall(radius: number, bottom: number, height: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, WALL_SEGMENTS, 1, true), material);
  mesh.position.y = bottom + height / 2;
  return mesh;
}

// ---------- 池畔設施 ----------
// 不鏽鋼扶梯：兩根扶手從水裡往上、彎過池邊、插進池畔；水裡三階踏板。自身 z = 0 是池壁，-z 是水、+z 是池畔，y = 0 是池畔面。
function addLadder(g: THREE.Object3D, M: PoolMaterials): void {
  for (const x of [-0.28, 0.28]) {
    const curve = new THREE.CatmullRomCurve3([[x, -1.25, -0.16], [x, 0.55, -0.16], [x, 0.9, -0.02], [x, 0.92, 0.18], [x, 0.6, 0.4], [x, 0, 0.42]].map(([px = 0, py = 0, pz = 0]) => new THREE.Vector3(px, py, pz)));
    addMesh(g, new THREE.TubeGeometry(curve, 40, 0.022, 8), M.chrome, [0, 0, 0]);
    addMesh(g, new THREE.CylinderGeometry(0.045, 0.045, 0.012, 16), M.chrome, [x, 0.006, 0.42]);
  }
  for (const y of [-0.35, -0.65, -0.95]) box(g, M.chrome, [0.56, 0.03, 0.09], [0, y, -0.11]);
}

// 躺椅：白色框架、可調的椅背往 +z 立起來（背對泳池），坐墊顏色隨機，有些上面放了毛巾。
function addLounger(g: THREE.Object3D, M: PoolMaterials, rng: Rng): void {
  const cushion = M.cushions[Math.floor(rng() * M.cushions.length)] ?? M.frame;
  box(g, M.frame, [0.7, 0.06, 1.95], [0, 0.32, 0]);
  for (const x of [-0.3, 0.3]) {
    for (const z of [-0.85, 0.85]) box(g, M.frame, [0.05, 0.3, 0.05], [x, 0.15, z]);
  }
  box(g, cushion, [0.62, 0.07, 1.3], [0, 0.385, -0.3]);
  const tilt = 0.75;
  const backLength = 0.65;
  box(g, cushion, [0.62, 0.07, backLength], [0, 0.385 + (backLength / 2) * Math.sin(tilt), 0.35 + (backLength / 2) * Math.cos(tilt)], [-tilt, 0, 0]);
  for (const x of [-0.33, 0.33]) rod(g, M.frame, [x, 0.33, 0.35], [x, 0.33 + 0.6 * Math.sin(tilt), 0.35 + 0.6 * Math.cos(tilt)], 0.018, 6);
  if (rng() < 0.4) {
    const towel = M.towels[Math.floor(rng() * M.towels.length)] ?? M.frame;
    box(g, towel, [0.55, 0.012, 0.9], [0, 0.427, -0.35], [0, (rng() - 0.5) * 0.25, 0]);
  }
}

// 陽傘：配重底座、桿子、16 片條紋傘布。
function addUmbrella(g: THREE.Object3D, M: PoolMaterials, rng: Rng): void {
  const canopy = M.canopies[Math.floor(rng() * M.canopies.length)] ?? M.redCanopy;
  addMesh(g, new THREE.CylinderGeometry(0.28, 0.3, 0.08, 16), M.umbrellaBase, [0, 0.04, 0]);
  rod(g, M.chrome, [0, 0, 0], [0, 2.5, 0], 0.02);
  addMesh(g, new THREE.ConeGeometry(1.5, 0.45, 16, 1, true), canopy, [0, 2.32, 0]);
  addMesh(g, new THREE.SphereGeometry(0.04, 10, 6), M.chrome, [0, 2.56, 0]);
}

// 救生員高腳椅：面向泳池（-z），椅背後面掛救生圈，上面有一把紅白小傘，後方是梯子。
function addLifeguardChair(g: THREE.Object3D, M: PoolMaterials): void {
  const height = 1.9;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) rod(g, M.lifeguard, [sx * 0.45, 0, sz * 0.45], [sx * 0.3, height, sz * 0.3], 0.03);
    box(g, M.lifeguard, [0.05, 0.03, 0.5], [sx * 0.35, height + 0.25, 0]);
  }
  box(g, M.lifeguard, [0.7, 0.05, 0.6], [0, height, 0]);
  box(g, M.lifeguard, [0.7, 0.6, 0.05], [0, height + 0.3, 0.3]);
  for (let k = 1; k <= 5; k++) box(g, M.lifeguard, [0.6, 0.04, 0.08], [0, (k * height) / 6, 0.45 - (k / 6) * 0.15]);
  addMesh(g, new THREE.TorusGeometry(0.28, 0.06, 8, 24), M.lifeRing, [0, height + 0.3, 0.36]);
  rod(g, M.chrome, [0, height + 0.6, 0.32], [0, height + 2, 0.32], 0.02);
  addMesh(g, new THREE.ConeGeometry(0.9, 0.3, 16, 1, true), M.redCanopy, [0, height + 1.9, 0.32]);
}

// 淋浴柱：不鏽鋼立柱、往前伸的蓮蓬頭、地上的排水格柵。
function addShower(g: THREE.Object3D, M: PoolMaterials): void {
  rod(g, M.chrome, [0, 0, 0], [0, 2.3, 0], 0.04);
  rod(g, M.chrome, [0, 2.25, 0], [0, 2.3, -0.35], 0.02);
  addMesh(g, new THREE.CylinderGeometry(0.1, 0.06, 0.04, 16), M.chrome, [0, 2.27, -0.38]);
  box(g, M.grate, [0.7, 0.01, 0.7], [0, 0.005, -0.3]);
}

function addPlanter(g: THREE.Object3D, M: PoolMaterials, rng: Rng): void {
  const size = 0.6 + rng() * 0.4;
  box(g, M.planter, [size * 1.6, 0.6, size * 1.6], [0, 0.3, 0]);
  addMesh(g, new THREE.IcosahedronGeometry(size, 1), M.leaves, [0, 0.6 + size * 0.7, 0]);
}

// 池畔的東西都沿著圓周每隔一段放一個：回傳每個的角度（從 offset 開始，間隔換成角度）。
function anglesAround(radius: number, spacing: number, offset: number): number[] {
  const count = Math.max(1, Math.floor((TAU * radius) / spacing));
  return Array.from({ length: count }, (_, i) => offset + (i / count) * TAU);
}

function addDeckProps(props: THREE.Object3D, M: PoolMaterials, rng: Rng, poolIn: number, poolOut: number, deckY: number): void {
  const loungeRadius = poolOut + POOL.coping + 2.3;
  // 每組兩張躺椅並排，中間空隙的椅背那一端插一把陽傘
  for (const angle of anglesAround(loungeRadius, LOUNGE_SPACING, 0)) {
    for (const offset of [-0.6, 0.6]) addLounger(placeOnRing(props, loungeRadius, deckY, angle + offset / loungeRadius), M, rng);
    addUmbrella(placeOnRing(props, loungeRadius + 0.6, deckY, angle), M, rng);
  }
  for (const angle of anglesAround(poolOut, (TAU * poolOut) / LIFEGUARD_CHAIRS, TAU / 8)) addLifeguardChair(placeOnRing(props, poolOut + 1.3, deckY, angle), M);
  for (const angle of anglesAround(poolOut, LADDER_SPACING, 0.05)) addLadder(placeOnRing(props, poolOut, deckY, angle), M);
  for (const angle of anglesAround(poolIn, LADDER_SPACING, 0.12)) addLadder(placeOnRing(props, poolIn, deckY, angle, true), M);
  for (const angle of anglesAround(poolIn, (TAU * poolIn) / SHOWERS, 0.3)) addShower(placeOnRing(props, poolIn - 2.5, deckY, angle, true), M);
  for (const angle of anglesAround(poolIn - 4.5, PLANTER_SPACING, 0)) addPlanter(placeOnRing(props, poolIn - 4.5, deckY, angle), M, rng);
}

/**
 * 環形游泳池：內外兩側是石材池畔，中間一圈水道（8 條圓形水道、水道繩、池底水道線）。
 * 碰撞：兩側池畔與池底站得住；池壁從池底到池畔水平方向擋（掉進池子要飛出來）。
 */
export function buildPoolRing(spec: RingSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  const M = getPoolMaterials();
  const { inner, outer, maxY } = spec;
  const poolIn = inner + POOL.deckInner;
  const poolOut = outer - POOL.deckOuter;
  const waterY = maxY - POOL.waterDrop;
  const floorY = waterY - POOL.waterDepth;
  const bottomY = floorY - POOL.base;

  const decks = [annulus(inner, poolIn, bottomY, maxY, M.deck), annulus(poolOut, outer, bottomY, maxY, M.deck)];
  decks.forEach((deck) => planarUv(deck.geometry, DECK_TILE));
  const floor = annulus(poolIn, poolOut, floorY - POOL.floorSlab, floorY, causticMaterial(waterY, { map: M.tile }));
  planarUv(floor.geometry, 1);
  build.solid.add(...decks, floor, annulus(poolIn, poolOut, bottomY, floorY - POOL.floorSlab, M.concrete));
  build.discs.push(
    { inner, outer: poolIn, minY: bottomY, maxY },
    { inner: poolOut, outer, minY: bottomY, maxY },
    { inner: poolIn, outer: poolOut, minY: bottomY, maxY: floorY },
  );
  build.walls.push(
    { radius: poolIn, minY: floorY, maxY, solid: 'inside' },
    { radius: poolOut, minY: floorY, maxY, solid: 'outside' },
  );
  build.waters.push({ inner: poolIn, outer: poolOut, surfaceY: waterY, floorY });

  // 池壁磁磚（貼圖沿圓周每公尺重複一次）、水線上的深藍馬賽克帶、池邊的白色收邊石
  const wallHeight = maxY - floorY;
  for (const [radius, side] of [[poolIn + 0.005, THREE.FrontSide], [poolOut - 0.005, THREE.BackSide]] as const) {
    const around = TAU * radius;
    build.decor.add(
      poolWall(radius, floorY, wallHeight, causticMaterial(waterY, { map: repeated(M.tile, around, wallHeight), side })),
      poolWall(radius + (side === THREE.FrontSide ? 0.003 : -0.003), waterY - WATERLINE.below, WATERLINE.height,
        causticMaterial(waterY, { map: repeated(M.waterline, around, WATERLINE.height / WATERLINE.tileHeight), side })),
    );
  }
  build.solid.add(
    annulus(poolIn - POOL.coping, poolIn + POOL.copingLip, maxY - 0.1, maxY + POOL.copingRise, M.coping),
    annulus(poolOut - POOL.copingLip, poolOut + POOL.coping, maxY - 0.1, maxY + POOL.copingRise, M.coping),
  );

  // 水道：池底的深藍水道線，水面上的浮球水道繩
  const laneWidth = (poolOut - poolIn - 2 * POOL.laneMargin) / POOL.lanes;
  const laneLine = causticMaterial(waterY, { color: 0x1d3f7a });
  for (let lane = 0; lane < POOL.lanes; lane++) {
    const center = poolIn + POOL.laneMargin + (lane + 0.5) * laneWidth;
    build.decor.add(annulus(center - POOL.laneLine / 2, center + POOL.laneLine / 2, floorY, floorY + 0.012, laneLine));
  }
  for (let k = 0; k <= POOL.lanes; k++) {
    const radius = poolIn + POOL.laneMargin + k * laneWidth;
    const base = M.ropes[k === 0 || k === POOL.lanes ? 0 : k % 2 === 0 ? 1 : 2] ?? M.tile;
    // transparent：水面折射是先把不透明物件畫成一張圖再扭曲，浮在水面上的繩子若是不透明，會在水下多出一條倒影；
    // 標成透明物件就不會被畫進那張圖（opacity 仍是 1，看起來不透明）。
    const rope = new THREE.Mesh(
      new THREE.TorusGeometry(radius, ROPE.radius, 6, ROPE.tubular).rotateX(Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: repeated(base, (TAU * radius) / ROPE.length, 1), transparent: true }),
    );
    rope.position.y = waterY + 0.015;
    build.decor.add(rope);
  }

  const water = new THREE.Mesh(new THREE.RingGeometry(poolIn, poolOut, WATER_SEGMENTS.around, WATER_SEGMENTS.across).rotateX(-Math.PI / 2), M.water);
  water.position.y = waterY;
  const underside = new THREE.Mesh(water.geometry, M.waterUnderside);
  underside.position.y = waterY;
  build.decor.add(water, underside);

  const props = new THREE.Group();
  addDeckProps(props, M, rng, poolIn, poolOut, maxY);
  build.decor.add(bakeByMaterial(props));
  props.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
  return build;
}

/**
 * 給金屬、水面反射用的天空環境貼圖：上面藍、地平線淡、下面灰，太陽方向一個很亮的點（水面高光就是它）。
 * 只設定在需要反射的材質上，不改 scene.environment，角色模型的打光才不會跟著變。
 */
export function createSkyEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const sky = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vDirection;\nvoid main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDirection;
      void main() {
        vec3 d = normalize(vDirection);
        vec3 horizon = vec3(0.86, 0.89, 0.92);
        vec3 zenith = vec3(0.32, 0.55, 0.82);
        vec3 ground = vec3(0.62, 0.64, 0.66);
        vec3 color = d.y > 0.0 ? mix(horizon, zenith, pow(d.y, 0.55)) : mix(horizon, ground, pow(-d.y, 0.4));
        float sun = pow(max(dot(d, normalize(vec3(${SUN_DIRECTION.join('.0, ')}.0))), 0.0), 900.0);
        gl_FragColor = vec4(color + vec3(1.0, 0.96, 0.88) * sun * 30.0, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
  sky.add(dome);
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(sky, 0, 0.1, 10);
  generator.dispose();
  dome.geometry.dispose();
  material.dispose();
  return target.texture;
}
