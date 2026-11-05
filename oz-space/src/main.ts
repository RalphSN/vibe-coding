import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

import GUI, { type Controller } from 'lil-gui';
import { CLIP_ROLES, RING_STYLES, SAVE_ENDPOINT, loadSceneConfig, type CenterConfig, type ClipRole, type RingsConfig, type SceneConfig } from './config/scene.config';
import { buildFloatingField, buildRing, updateFloaters, type Disc, type Floater, type PropsBuild } from './oz-props';
import rawSceneConfig from './config/scene.config.json' with { type: 'json' };

// ================= 0. 型別 =================
type Vec3Tuple = [number, number, number];
type KeyAction = 'forward' | 'back' | 'turnLeft' | 'turnRight' | 'strafeLeft' | 'strafeRight' | 'jump' | 'descend' | 'toggleWalk' | 'toggleBoost';
type ViewModeName = 'orbit' | 'firstPerson';
type GaitName = 'walk' | 'run';
type Direction = 'forward' | 'backward' | 'side';
type RigPose = Record<string, number>;
type CharacterPhase = 'ground' | 'jumpStart' | 'jumpLoop' | 'land' | 'blocked' | 'fly' | 'sitEnter' | 'sit' | 'sitExit';

interface Motion { velocity: number }
type RampDirection = 'north' | 'south' | 'east' | 'west';
// 看不見的碰撞斜面（世界座標）：uphill 是往上走的方向，bottom／top 是低端與高端的高度。目前空間是平的，先留著給之後的坡道。
interface Ramp { minX: number; maxX: number; minZ: number; maxZ: number; uphill: RampDirection; bottom: number; top: number }
// 每個視角模式都提供同一組介面，見「5. 視角模式」。
interface ViewMode {
  enter(): void;
  exit(): void;
  update(dt: number): void;
  setInputLocked(isLocked: boolean): void;
}
interface GaitKeys { hip: number[]; knee: number[]; foot: number[] }
interface GaitStyle {
  sideSwing: number; armSwing: number; armBias: number; elbow: number;
  elbowSwing: number; armOut: number; lean: number; twist: number;
}
interface JumpKey { spinePitch: number; hipX: number; knee: number; foot: number; shoulderX: number; shoulderZ: number; elbow: number }
// pushForward／pushSide：按著方向鍵、手的高度前方有牆時，想走的方向（角色座標的單位向量）；沒有是 0。
// pushBack：手會穿進牆多少（m），角色畫面往後退這麼多，手剛好搆到牆（碰撞位置不變）。
// findWall：推牆時給手部 IK 找每隻手要貼的牆面；沒在推是 null。isFlying：飛行模式（不算站在地上，也不算跳躍）。
interface RigMotion {
  forwardSpeed: number; sideSpeed: number; turnRate: number; isGrounded: boolean; riseRatio: number;
  pushForward: number; pushSide: number; pushBack: number; findWall: WallProbe | null; isFlying: boolean;
  climbSpeed: number;   // 飛行時實際的上升速度（m/s，下降為負）
  isSitting: boolean;   // 想坐著（按 X 坐下時 true，站起來時 false）；動畫自己播坐下、站起來的過程
}
// 從世界座標 (x, y, z) 沿水平方向 (dirX, dirZ) 往前，maxDistance 內最先碰到的牆：多遠、表面朝哪（朝外的單位向量）。
type WallProbe = (x: number, y: number, z: number, dirX: number, dirZ: number, maxDistance: number) => { distance: number; nx: number; nz: number } | null;
// 水平碰撞用的有向方塊（OBB）：中心、自身兩個水平軸的方向（單位向量）與半長、高度範圍。
// 斜牆、斜放的家具就是一整個轉了角度的方塊，不用切成小段。
interface Solid { cx: number; cz: number; ux: number; uz: number; vx: number; vz: number; hu: number; hv: number; minY: number; maxY: number }
// 圓心在原點、尖點朝下的倒圓錐：用公式算碰撞，碰撞面就是外觀的表面。頂面平台另外用 Disc 站上去。
interface Cone { tipY: number; topY: number; topRadius: number }
// 圓心在 (0, baseY, 0) 的上半球：站在球面上、水平方向擋。貓頭就是這個。
interface Dome { baseY: number; radius: number }
// 掃掠碰到的時刻（位移的比例 0–1）與表面法線（世界座標，朝外）。
interface SweepHit { t: number; nx: number; nz: number }
// 推牆時手掌在角色前方多遠、離腳底多高（m）；slack 是手部 IK 能再往前補的距離（沒有 IK 是 0）。
interface HandReach { forward: number; height: number; slack: number }
interface AvatarRig { root: THREE.Group; build(eyeHeight: number): void; animate(motion: RigMotion, dt: number): void; handReach(): HandReach }
interface Character extends AvatarRig { load(): Promise<string[]>; syncSkeletonHelper(): void }
interface PlayerPose { x: number; z: number; yaw: number; pitch: number; distance?: number; feetY?: number }

// HTML 裡一定有的元素；找不到代表 index.html 和程式不同步，直接報錯比默默壞掉好查。
function requireElement<T extends Element>(selector: string, type: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`index.html 缺少元素：${selector}`);
  return element;
}

// ================= 1. 設定 =================
// 可調數值都在 src/config/scene.config.json（型別與說明在 scene.config.ts）；lil-gui 改的就是這個物件。
// 這裡只留程式內部的常數，不是設計時會調的。
const config: SceneConfig = loadSceneConfig(rawSceneConfig);

const EPSILON = 1e-3;
const GROUND_THICKNESS = 0.2;
const GRID_CELL = 5;               // 地面格線間距（m）：空間上千公尺，1 m 一格遠看會糊成一片灰
const CENTER_SEGMENTS = 64;
const CAMERA_FAR_PER_GROUND = 2.5; // 鏡頭可視距離 = 地面邊長 × 這個比例，從空間一角看得到對角
const GRID_LIFT = 0.002;           // 格線浮在地面上這麼高，才不會和地面互相閃爍
const FENCE_HEIGHT = 3;            // 地面邊緣隱形圍欄的高度
const FENCE_THICKNESS = 0.2;
const SPAWN_SEARCH_STEP = 0.25;
const SPAWN_SEARCH_RADIUS = 2;

const COLORS = {
  ground: 0xf4f5f7, grid: 0xdfe2e6, gridMajor: 0xc9cdd3, center: 0xdde3f0, seat: 0xb9c2d6, innerEar: 0xf4a7b9,
  player: 0xff6f3c, playerFace: 0x3a2a20, playerSkin: 0xf0c39c, playerPants: 0x3d4f73, playerShoe: 0x2b2b2b,
};

const materials: Record<string, THREE.Material> = Object.fromEntries(
  Object.entries(COLORS).map(([key, color]) => [key, new THREE.MeshLambertMaterial({ color })]),
);

// 環由上往下依序用這些顏色（紅橙黃綠藍靛紫），圈數比顏色多就從頭輪。
const RING_COLORS = [0xf2545b, 0xf59a3a, 0xf2d04b, 0x6cc56b, 0x4aa8e8, 0x5b6ee1, 0xa064d9];

// ================= 2. 場景基礎 =================
// 對數深度緩衝：空間很大，鏡頭拉遠時一般深度緩衝分不出只差幾公分的面（地面和格線會互相閃爍）。
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef0f2);

// 可視距離跟著地面大小，在 rebuildScene 裡更新。
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, config.scene.groundSize * CAMERA_FAR_PER_GROUND);
camera.position.set(0, 380, 720);   // 環繞檢視第一次進來：從南邊高處斜看中央

scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(3, 6, 2);
scene.add(sun);

// world 是之後第一人稱模式也會用到的共用狀態：colliders 給垂直方向（站上去、撞頭），solids 給水平移動。
const world: {
  room: THREE.Group;
  colliders: THREE.Box3[];
  solids: Solid[];
  ramps: Ramp[];
  discs: Disc[];
  cones: Cone[];
  domes: Dome[];
  decor: THREE.Group;
  floaters: Floater[];
} = {
  room: new THREE.Group(),      // 空間裡看得到的東西（地面、之後的平台）；第三人稱鏡頭也拿它判斷有沒有被擋住
  colliders: [],
  solids: [],
  ramps: [],                    // 世界座標的碰撞斜面
  discs: [],                    // 圓心在原點的環形（或實心圓）平板：站上去、撞頭用；水平方向不擋
  cones: [],                    // 倒圓錐：水平方向擋、從下面往上撞頭
  domes: [],                    // 上半球：站上去、水平方向擋
  decor: new THREE.Group(),     // 沒有碰撞的裝飾（房屋、書、桌椅、碎片、漂浮物）；鏡頭不避開，數量多才不會每格打幾千次射線
  floaters: [],                 // 會上下飄的東西，每格更新
};
scene.add(world.room, world.decor);

// ================= 3. 空白空間（地面、隱形圍欄、碰撞） =================
function addBox(parent: THREE.Object3D, material: THREE.Material, size: Vec3Tuple, center: Vec3Tuple): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...center);
  parent.add(mesh);
  return mesh;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const wrapAngle = (rad: number): number => Math.atan2(Math.sin(rad), Math.cos(rad));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const setCursor = (cursor: string): void => { renderer.domElement.style.cursor = cursor; };

// 斜面在 (x, z) 的高度（世界座標）：沿 uphill 方向從 bottom 線性升到 top，超出範圍就用端點。
function rampHeightAt(ramp: Ramp, x: number, z: number): number {
  const along: Record<Ramp['uphill'], number> = {
    north: (ramp.maxZ - z) / (ramp.maxZ - ramp.minZ),
    south: (z - ramp.minZ) / (ramp.maxZ - ramp.minZ),
    east: (x - ramp.minX) / (ramp.maxX - ramp.minX),
    west: (ramp.maxX - x) / (ramp.maxX - ramp.minX),
  };
  return lerp(ramp.bottom, ramp.top, clamp(along[ramp.uphill], 0, 1));
}

function disposeChildren(group: THREE.Object3D): void {
  group.traverse((obj) => {
    if ('geometry' in obj && obj.geometry instanceof THREE.BufferGeometry) obj.geometry.dispose();
  });
  group.clear();
}

// 地面頂面在 y = 0，往下挖 GROUND_THICKNESS；格線浮在地面上一點點，才不會和地面互相閃爍。
function buildGround(size: number): THREE.Group {
  const group = new THREE.Group();
  addBox(group, materials.ground, [size, GROUND_THICKNESS, size], [0, -GROUND_THICKNESS / 2, 0]);
  const grid = new THREE.GridHelper(size, Math.round(size / GRID_CELL), COLORS.gridMajor, COLORS.grid);
  grid.position.y = GRID_LIFT;
  group.add(grid);
  return group;
}

// 地面四邊的隱形圍欄：只給第一人稱碰撞用，走到邊緣就停住，不會走進虛空；推牆動作也是撞這裡。
function groundFenceBoxes(size: number): THREE.Box3[] {
  const half = size / 2;
  const T = FENCE_THICKNESS;
  const box = (minX: number, minZ: number, maxX: number, maxZ: number): THREE.Box3 =>
    new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, FENCE_HEIGHT, maxZ));
  return [
    box(-half - T, -half - T, half + T, -half),
    box(-half - T, half, half + T, half + T),
    box(-half - T, -half, -half, half),
    box(half, -half, half + T, half),
  ];
}

const solidFromBox = (box: THREE.Box3): Solid => ({
  cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2, ux: 1, uz: 0, vx: 0, vz: 1,
  hu: (box.max.x - box.min.x) / 2, hv: (box.max.z - box.min.z) / 2, minY: box.min.y, maxY: box.max.y,
});

// 點 (x, z) 換到方塊自身座標（u 沿第一軸、v 沿第二軸，原點在方塊中心）。
const toSolidSpace = (s: Solid, x: number, z: number): [number, number] => [x * s.ux + z * s.uz, x * s.vx + z * s.vz];

// 圓心 (x, z)、半徑 r 的圓和方塊在水平面上有沒有重疊。
function circleOverlapsSolid(s: Solid, x: number, z: number, r: number): boolean {
  const [u, v] = toSolidSpace(s, x - s.cx, z - s.cz);
  const du = u - clamp(u, -s.hu, s.hu);
  const dv = v - clamp(v, -s.hv, s.hv);
  return du * du + dv * dv < r * r;
}

// 射線 p + d·t 和圓心 (cu, cv)、半徑 r 的圓第一次相交的 t（0–1），沒有就是 null。
function rayCircle(pu: number, pv: number, du: number, dv: number, cu: number, cv: number, r: number): number | null {
  const ou = pu - cu;
  const ov = pv - cv;
  const a = du * du + dv * dv;
  const b = 2 * (ou * du + ov * dv);
  const c = ou * ou + ov * ov - r * r;
  const disc = b * b - 4 * a * c;
  if (a === 0 || disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

// 半徑 r 的圓從 (x, z) 移動 (dx, dz)：最早在哪一刻碰到方塊、碰到的表面朝哪裡，碰不到是 null。
// 等於讓圓心這個點，對「方塊往外擴 r、四個角磨圓」的形狀打射線（Minkowski 和）：
// 先打外擴後的長方形，落點在角落區時改打那個角的圓。
// 一開始就貼著（重疊不到半徑）的方塊：往裡面走算 t = 0 撞到，往外走就放行，浮點誤差才不會讓圓慢慢陷進牆裡。
function sweepCircle(s: Solid, x: number, z: number, dx: number, dz: number, r: number): SweepHit | null {
  const [pu, pv] = toSolidSpace(s, x - s.cx, z - s.cz);
  const [du, dv] = toSolidSpace(s, dx, dz);
  const toWorld = (nu: number, nv: number, t: number): SweepHit => ({ t, nx: nu * s.ux + nv * s.vx, nz: nu * s.uz + nv * s.vz });

  const gapU = pu - clamp(pu, -s.hu, s.hu);
  const gapV = pv - clamp(pv, -s.hv, s.hv);
  const gap = Math.hypot(gapU, gapV);
  if (gap < r) {
    if (gap === 0) return null;   // 圓心已經在方塊裡：交給呼叫端當成一開始就重疊
    return gapU * du + gapV * dv < 0 ? toWorld(gapU / gap, gapV / gap, 0) : null;
  }

  let enter = 0;
  let exit = 1;
  let normalU = 0;
  let normalV = 0;
  const axes: [number, number, number, boolean][] = [[pu, du, s.hu + r, true], [pv, dv, s.hv + r, false]];
  for (const [p, d, half, isU] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(p) > half) return null;
      continue;
    }
    const t1 = (-half - p) / d;
    const t2 = (half - p) / d;
    if (Math.min(t1, t2) > enter) {
      enter = Math.min(t1, t2);
      normalU = isU ? -Math.sign(d) : 0;
      normalV = isU ? 0 : -Math.sign(d);
    }
    exit = Math.min(exit, Math.max(t1, t2));
    if (enter > exit) return null;
  }
  const hitU = pu + du * enter;
  const hitV = pv + dv * enter;
  if (Math.abs(hitU) > s.hu && Math.abs(hitV) > s.hv) {
    const cornerU = Math.sign(hitU) * s.hu;
    const cornerV = Math.sign(hitV) * s.hv;
    const t = rayCircle(pu, pv, du, dv, cornerU, cornerV, r);
    if (t === null) return null;
    return toWorld((pu + du * t - cornerU) / r, (pv + dv * t - cornerV) / r, t);
  }
  return normalU === 0 && normalV === 0 ? null : toWorld(normalU, normalV, enter);
}

// 出生點被佔了時要試的位移，由近到遠排好（格距 SPAWN_SEARCH_STEP、半徑 SPAWN_SEARCH_RADIUS 公尺），只算一次。
const SEARCH_OFFSETS = (() => {
  const n = Math.round(SPAWN_SEARCH_RADIUS / SPAWN_SEARCH_STEP);
  const offsets: { dx: number; dz: number; distance: number }[] = [];
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const distance = Math.hypot(i, j) * SPAWN_SEARCH_STEP;
      if (distance > 0 && distance <= SPAWN_SEARCH_RADIUS) offsets.push({ dx: i * SPAWN_SEARCH_STEP, dz: j * SPAWN_SEARCH_STEP, distance });
    }
  }
  return offsets.sort((a, b) => a.distance - b.distance);
})();

// 貓耳：長在頭（半球）上，從正上方往左右各偏 EAR_TILT，稍微朝前（+Z，出生點那一側）；三角錐的一面朝前，內側疊一片粉紅。
const EAR_TILT = THREE.MathUtils.degToRad(42);
const EAR_FORWARD = 0.15;
const EAR_RADIUS = 0.38;        // 耳朵底半徑、高度、埋進頭裡的深度，都是頭半徑的倍數
const EAR_HEIGHT = 0.7;
const EAR_SINK = 0.15;
const INNER_EAR_SCALE = 0.62;
const INNER_EAR_FORWARD = 0.22; // 內耳往前推（耳朵底半徑的倍數），粉紅色才露在正面
const DOME_SEGMENTS = 64;

// 中央：倒圓錐（上平下尖）上面接一個半球和兩隻耳朵，做成貓頭。
// 碰撞：圓錐側面用 Cone、半球用 Dome（都是公式計算，貼著外觀）；耳朵只有外觀。
function buildCenter(center: CenterConfig): THREE.Group {
  const group = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(center.topRadius, center.height, CENTER_SEGMENTS).rotateX(Math.PI), materials.center);
  cone.position.y = center.topY - center.height / 2;   // ConeGeometry 尖端朝上，翻過來變成上平下尖
  const head = new THREE.Mesh(new THREE.SphereGeometry(center.topRadius, DOME_SEGMENTS, DOME_SEGMENTS / 2, 0, Math.PI * 2, 0, Math.PI / 2), materials.center);
  head.position.y = center.topY;
  group.add(cone, head);
  const R = center.topRadius;
  for (const side of [-1, 1]) {
    const direction = new THREE.Vector3(side * Math.sin(EAR_TILT), Math.cos(EAR_TILT), EAR_FORWARD).normalize();
    const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    // 三個面的錐：頂點預設朝 +Z，轉半圈讓平的那一面朝前
    const ear = new THREE.Mesh(new THREE.ConeGeometry(R * EAR_RADIUS, R * EAR_HEIGHT, 3).rotateY(Math.PI).translate(0, (R * EAR_HEIGHT) / 2, 0), materials.center);
    ear.quaternion.copy(tilt);
    ear.position.copy(direction).multiplyScalar(R * (1 - EAR_SINK)).add(new THREE.Vector3(0, center.topY, 0));
    const inner = new THREE.Mesh(ear.geometry.clone().scale(INNER_EAR_SCALE, INNER_EAR_SCALE, INNER_EAR_SCALE), materials.innerEar);
    inner.position.set(0, 0, R * EAR_RADIUS * INNER_EAR_FORWARD);
    ear.add(inner);
    group.add(ear);
  }
  return group;
}

// 頭頂（耳尖）大約多高：周圍漂浮物要避開的範圍。
const centerTopY = (center: CenterConfig): number => center.topY + center.topRadius * (1 + EAR_HEIGHT);

function centerColliders(center: CenterConfig): { cone: Cone; dome: Dome } {
  return {
    cone: { tipY: center.topY - center.height, topY: center.topY, topRadius: center.topRadius },
    dome: { baseY: center.topY, radius: center.topRadius },
  };
}

// 身體高度範圍 (bottom, top) 和上半球重疊時，球在這段裡最寬的半徑（越往上越窄，取重疊段的最低點）；沒重疊是 null。
function domeWidestRadius(dome: Dome, bottom: number, top: number): number | null {
  if (top <= dome.baseY || bottom >= dome.baseY + dome.radius) return null;
  const rise = Math.max(bottom, dome.baseY) - dome.baseY;
  return Math.sqrt(dome.radius * dome.radius - rise * rise);
}

// 身體佔的高度範圍 (bottom, top) 和倒圓錐重疊時，圓錐在這段裡最寬的半徑（倒圓錐越高越寬，取重疊段的最高點）；沒重疊是 null。
function coneWidestRadius(cone: Cone, bottom: number, top: number): number | null {
  if (top <= cone.tipY || bottom >= cone.topY) return null;
  return (cone.topRadius * (Math.min(top, cone.topY) - cone.tipY)) / (cone.topY - cone.tipY);
}

// 半徑 r 的圓從 (x, z) 移動 (dx, dz)，對圓心在原點、半徑 radius 的圓柱做掃掠（規則同 sweepCircle）。
function sweepRound(radius: number, x: number, z: number, dx: number, dz: number, r: number): SweepHit | null {
  const reach = radius + r;
  const distance = Math.hypot(x, z);
  if (distance < reach) {
    if (distance === 0) return null;
    return x * dx + z * dz < 0 ? { t: 0, nx: x / distance, nz: z / distance } : null;
  }
  const t = rayCircle(x, z, dx, dz, 0, 0, reach);
  if (t === null) return null;
  return { t, nx: (x + dx * t) / reach, nz: (z + dz * t) / reach };
}

// 倒圓錐在高度 y 的半徑：平台是 topRadius，往下線性收到尖點是 0；超出圓錐上下就是 0。
function coneRadiusAt(center: CenterConfig, y: number): number {
  return center.topRadius * clamp((y - (center.topY - center.height)) / center.height, 0, 1);
}

// 每一層環的範圍（由上往下）：頂面高度是平台往下累加每層的 gap，內緣離圓錐側面 clearance。
function ringShapes(center: CenterConfig, rings: RingsConfig): Disc[] {
  let maxY = center.topY;
  return rings.layers.map((layer) => {
    maxY -= layer.gap;
    const inner = coneRadiusAt(center, maxY) + rings.clearance;
    return { inner, outer: inner + rings.width, minY: maxY - rings.thickness, maxY };
  });
}

const RING_SEED = 1000;      // 每圈的亂數種子是 RING_SEED + 圈號，改圈的樣式不會讓其他圈重新洗牌
const FIELD_SEED = 42;
const FIELD_RADIUS_PER_GROUND = 0.4;   // 周圍漂浮物散布的半徑 = 地面邊長 × 這個比例

// 懸空的環：每層依 rings.layers 的樣式建（見 oz-props.ts），再加上周圍的漂浮物。
function buildRings(center: CenterConfig, rings: RingsConfig): PropsBuild[] {
  const { floaters } = config.scene;
  const shapes = ringShapes(center, rings);
  const builds = shapes.map((shape, i) => buildRing({
    ...shape, style: rings.layers[i]?.style ?? 'plain', color: RING_COLORS[i % RING_COLORS.length] ?? COLORS.center,
    seed: RING_SEED + i, bobScale: floaters.bobScale,
  }));
  builds.push(buildFloatingField({
    ...floaters, fieldRadius: config.scene.groundSize * FIELD_RADIUS_PER_GROUND, seed: FIELD_SEED, rings: shapes,
    cone: { tipY: center.topY - center.height, topY: center.topY, topRadius: center.topRadius, headTop: centerTopY(center) },
  }));
  return builds;
}

// 改了地面大小時重建：地面網格、圍欄碰撞一起換。之後在空間裡加平台或物件，也放進 world.room，碰撞會一起收。
function rebuildScene(): void {
  disposeChildren(world.room);
  disposeChildren(world.decor);
  const { groundSize, center, rings } = config.scene;
  const ringBuilds = buildRings(center, rings);
  world.room.add(buildGround(groundSize), buildCenter(center), ...ringBuilds.map((build) => build.solid));
  world.decor.add(...ringBuilds.map((build) => build.decor));
  world.floaters = ringBuilds.flatMap((build) => build.floaters);
  const fence = groundFenceBoxes(groundSize);
  const centerParts = centerColliders(center);
  world.colliders = fence;
  world.solids = fence.map(solidFromBox);
  world.cones = [centerParts.cone];
  world.domes = [centerParts.dome];
  world.ramps = [];
  world.discs = ringBuilds.flatMap((build) => build.discs);
  camera.far = groundSize * CAMERA_FAR_PER_GROUND;
  camera.updateProjectionMatrix();
}

// ================= 5. 視角模式 =================
// 每個模式都提供同一組介面：enter() / exit() / update(dt) / setInputLocked(bool)。
// Tab 在環繞檢視與第一人稱（可以走）之間切換，見 toggleViewMode。
function createOrbitMode(): ViewMode {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 170, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 1;
  controls.maxDistance = config.scene.groundSize;
  let savedPosition: THREE.Vector3 | null = null;   // 切回來時回到離開前的鏡頭位置
  return {
    enter() {
      if (savedPosition) camera.position.copy(savedPosition);
      controls.enabled = true;
    },
    exit() {
      savedPosition = camera.position.clone();
      controls.enabled = false;
    },
    update() { controls.update(); },
    setInputLocked(isLocked) { controls.enabled = !isLocked; },
  };
}

const ORBIT_FOV = camera.fov;
const HEAD_CLEARANCE = 0.1;      // 眼睛以上還有頭頂，門楣比這低就過不去
const SURFACE_EPSILON = 1e-4;    // 判斷「站在表面上」的容差
const MAX_SUBSTEP = 0.05;        // 每格移動切成小段（掃掠本身不會穿牆；這是讓跨台階、樓梯的高度每段都更新）
const SLIDE_ITERATIONS = 4;      // 走進牆角時：第一次沿 A 牆滑、第二次被 B 牆削掉，再多留兩次給浮點誤差
const SKIN = 0.005;              // 停在牆面前這麼遠，下一格一開始才不會卡在牆裡
const MIN_SLIDE = 1e-6;          // 剩下的位移比這短就不再算
const DOUBLE_TAP_MS = 300;       // 兩下空白鍵間隔在這之內算連按，進入飛行
const SIT_EXIT_LOCK_SECONDS = 1;  // 站起來時多久不能移動：Sitting_Exit 長 1.03 秒，提早一點放開，起步才不卡
const FLY_VERTICAL_SPEED = 3;    // 飛行時空白鍵上升、X 下降的速度（m/s）
const FLY_PITCH_DEADZONE = 10;   // 滑鼠雙鍵飛行時，鏡頭俯仰離平視不到這幾度就不升降（度）
const FLY_LAND_GRACE = 0.25;     // 剛進入飛行的這幾秒不因碰到地面解除，連按時第一下的跳躍還沒離地也不會馬上落地
const BLOCKED_SPEED_RATIO = 0.2;  // 實際速度不到想走速度的這個比例，算被擋住
const BLOCKED_DELAY = 0.1;        // 連續被擋這麼久（秒）才切到受阻，擦過牆角不會閃一下
const HAND_PROBE_MARGIN = 0.3;    // 手伸到的距離再往前多探這麼遠找牆
const HAND_GAP = 0.03;            // 手掌厚度：手骨停在牆面前這麼遠，看起來才是貼著不是穿進去

const MOUSE_LEFT = 1;            // PointerEvent.buttons 的位元
const MOUSE_RIGHT = 2;
// 第三人稱鏡頭用「彈簧臂」（spring arm）的做法：從頭往後探路，被擋住時快速拉近、障礙物離開後慢慢退回。
const CAMERA_WALL_MARGIN = 0.2;   // 平常鏡頭停在障礙物前這麼遠
const CAMERA_NEAR_GAP = 0.06;     // 硬性下限：再貼近就會看穿，所以這裡不做平滑、直接卡住
const CAMERA_PROBE_RADIUS = 0.2;  // 用 5 條平行射線模擬這麼粗的探測球，門框邊緣提早發現
const PROBE_OFFSETS: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const FOLLOW_COAST_DAMPING = 6;   // 停下來時鏡頭轉動不急停，而是這個速率衰減
const AVATAR_VISIBLE_DISTANCE = 0.4;
// 按鍵配置參考 MMORPG 常見的預設（例如魔獸世界）：A／D 轉身、Q／E 平移、拖曳滑鼠轉視角。
const KEY_ACTIONS: Record<string, KeyAction | undefined> = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'turnLeft', ArrowLeft: 'turnLeft', KeyD: 'turnRight', ArrowRight: 'turnRight',
  KeyQ: 'strafeLeft', KeyE: 'strafeRight', Space: 'jump', KeyX: 'descend', ShiftLeft: 'toggleWalk', ShiftRight: 'toggleWalk',
  KeyZ: 'toggleBoost',
};

// 臨界阻尼彈簧（和 Unity Mathf.SmoothDamp 同一套近似公式）：起步、停下都平順、不會過衝。
// motion.velocity 保存目前速度；smoothTime 約等於追到目標要的時間。減少動態效果時直接到位。
function smoothDamp(current: number, target: number, motion: Motion, smoothTime: number, dt: number): number {
  if (reducedMotion.matches) {
    motion.velocity = 0;
    return target;
  }
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (motion.velocity + omega * change) * dt;
  motion.velocity = (motion.velocity - omega * temp) * decay;
  return target + (change + temp) * decay;
}

// ---------- 方塊人角色 ----------
// 比例採風格化 5.75 頭身（卡通風 3D 遊戲常見）：頭大一點、上身長一點，比寫實的 7.5 頭身好讀。
// 單位是身高 H 的倍數；大腿＋小腿＋腳踝 = 髖關節高，站直時腳底剛好在地上。
const BODY = {
  head: 0.17, neck: 0.03, chest: 0.21, pelvis: 0.11,
  thigh: 0.22, shin: 0.22, ankle: 0.04, upperArm: 0.17, forearm: 0.14, hand: 0.08,
};
const HIP_RATIO = BODY.thigh + BODY.shin + BODY.ankle;
const EYE_RATIO = HIP_RATIO + BODY.pelvis + BODY.chest + BODY.neck + BODY.head / 2;   // 眼睛在頭的一半高
const MODEL_HEIGHT = 1.83;        // ual1-standard.glb 原本的身高（m），character.scale = 1 時
// 第一人稱的眼睛高度跟著角色身高；方塊人也用這個高度建，載入前後一樣高。
const eyeHeight = (): number => MODEL_HEIGHT * config.character.scale * EYE_RATIO;
const DEG = THREE.MathUtils.degToRad;
const REFERENCE_HEIGHT = 1.75;
const CYCLE_BASE = 0.65;          // 一個步態週期（左右各一步）走多遠：0.65 + 0.55 × 速度（m），1.75 m 身高時
const CYCLE_PER_SPEED = 0.55;     // 對應步頻：走路 1.5 m/s 約每秒 2 步、跑步 3.5 m/s 約每秒 2.7 步
const RUN_BLEND = [2, 3];         // 速度在這區間內從走路漸變成跑步（m/s）
const TURN_STEP_RATE = 0.5;       // 原地轉身時，每轉 1 弧度踏多少個週期
const BOB_SAMPLES = 16;           // 骨盆高度表每個週期取幾格
const BOB_SMOOTH_PASSES = 2;      // 換腳那格是兩條曲線取最低的尖角，跑步時特別尖；磨圓後才不會頓一下（腳底誤差約 1 cm）
const BREATH_RATE = 1.6;          // 待機呼吸（弧度/秒，約 4 秒一次）
const GAIT_SMOOTH_TIME = 0.08;
const AIR_SMOOTH_TIME = 0.1;
const LAND_SMOOTH_TIME = 0.14;
const LAND_HOLD = 0.06;           // 落地後蹲多久才開始站起來（秒）
const LAND_MIN = 0.35;            // 落地緩衝最小幅度；下落越快蹲越深
const LEAN_SMOOTH_TIME = 0.18;
const ACCEL_LEAN_PER_MS2 = 1.5;   // 每 1 m/s² 加速度前傾幾度
const MAX_ACCEL_LEAN = 8;
const BRACE_SMOOTH_TIME = 0.15;   // 受阻姿勢淡入淡出
const FLY_SMOOTH_TIME = 0.2;      // 飛行姿勢淡入淡出
const FLY_FOOT_DROOP = 45;        // 飛行時腳板往下垂幾度（腳尖朝下）
const FLY_KNEE_BEND = 8;          // 飛行時膝蓋放鬆微彎幾度
const FLY_ARM_SPREAD = 12;        // 飛行時手臂往外張幾度
const FLY_ELBOW_BEND = 15;        // 飛行時手肘多彎幾度
const BRACE_HAND_REACH = { forward: 0.3, height: 0.74 };   // 撐牆姿勢的手掌位置，以身高為 1 的比例（依關節長度估計）
const BANK_PER_TURN_SPEED = 1.2;   // 轉彎內傾：轉速（rad/s）× 速度（m/s）× 這個值 = 度
const MAX_BANK = 10;

// 步態用「關鍵姿勢＋曲線內插」（動畫教科書的走路循環）：一個週期 8 格，第 0 格是這隻腳前腳跟著地。
// 0 接觸 → 1 下沉 → 2 交錯 → 3 最高點 → 4 在後（另一腳著地）→ 5 蹬地 → 6 擺盪交錯 → 7 往前伸。
// 角度單位：度。hip 正的是往前擺；knee 負的是往後彎；foot 是腳板對地面的角度（正的是腳尖抬起）。
// 骨盆上下起伏不手調：build 時用這些姿勢算出「最低的腳底剛好踩地」的高度，烘焙成平滑的表。
const GAIT_NAMES: GaitName[] = ['walk', 'run'];
const GAIT_KEYS: Record<GaitName, GaitKeys> = {
  walk: {
    hip: [22, 16, 2, -12, -18, -8, 18, 26],
    knee: [-3, -15, -8, -5, -12, -40, -60, -20],
    foot: [14, 0, 0, 0, -15, -35, 5, 12],
  },
  run: {
    hip: [30, 15, -5, -25, -20, 10, 45, 45],
    knee: [-25, -40, -25, -15, -60, -100, -95, -45],
    foot: [5, -5, -15, -30, -20, 10, 10, 5],
  },
};
// 手臂、上身擺動在真實步態裡本來就接近正弦，用參數就夠。
const GAIT_STYLE: Record<GaitName, GaitStyle> = {
  walk: { sideSwing: 12, armSwing: 20, armBias: 3, elbow: 15, elbowSwing: 15, armOut: 6, lean: 3, twist: 7 },
  run: { sideSwing: 18, armSwing: 40, armBias: 10, elbow: 85, elbowSwing: 15, armOut: 10, lean: 10, twist: 12 },
};
// 跳躍三個關鍵姿勢，依垂直速度內插：蹬地伸展 → 最高點縮腿 → 準備落地。
const STYLE_KEYS: (keyof GaitStyle)[] = ['sideSwing', 'armSwing', 'armBias', 'elbow', 'elbowSwing', 'armOut', 'lean', 'twist'];
const GAIT_CHANNELS: (keyof GaitKeys)[] = ['hip', 'knee', 'foot'];
const JUMP_KEYS: Record<'takeoff' | 'apex' | 'landing', JumpKey> = {
  takeoff: { spinePitch: 4, hipX: -5, knee: -8, foot: -35, shoulderX: 150, shoulderZ: 10, elbow: 20 },
  apex: { spinePitch: -8, hipX: 55, knee: -95, foot: -10, shoulderX: 95, shoulderZ: 20, elbow: 40 },
  landing: { spinePitch: -2, hipX: 25, knee: -30, foot: 5, shoulderX: 40, shoulderZ: 40, elbow: 20 },
};
const LIMB_KEYS = ['hipX', 'hipZ', 'knee', 'foot', 'shoulderX', 'shoulderZ', 'elbow'];
const POSE_KEYS = ['hipsYaw', 'spinePitch', 'spineYaw', ...LIMB_KEYS.flatMap((key) => [key + 0, key + 1])];
const DIRECTIONS: Direction[] = ['forward', 'backward', 'side'];
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const sideOf = (index: number): number => (index === 0 ? -1 : 1);   // 0 = 左（-x）、1 = 右（+x）；角色面向 -z
const wrap01 = (t: number): number => ((t % 1) + 1) % 1;

// 循環的 Catmull-Rom 曲線：經過每個關鍵值，而且速度連續，關鍵格之間不會有轉折頓點。
function sampleLoop(values: number[], t: number): number {
  const n = values.length;
  const x = wrap01(t) * n;
  const i = Math.floor(x);
  const f = x - i;
  const p0 = values[(i - 1 + n) % n];
  const p1 = values[i % n];
  const p2 = values[(i + 1) % n];
  const p3 = values[(i + 2) % n];
  return 0.5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (3 * p1 - p0 - 3 * p2 + p3) * f * f * f);
}

// 循環陣列做 [1, 2, 1] / 4 平均，每做一次尖角就圓一點。
function smoothLoop(values: number[], passes: number): number[] {
  let out = values;
  for (let pass = 0; pass < passes; pass++) {
    out = out.map((value, k) => (out[(k - 1 + out.length) % out.length] + 2 * value + out[(k + 1) % out.length]) / 4);
  }
  return out;
}

function blendPose(a: RigPose, b: RigPose, t: number): RigPose {
  const out: RigPose = {};
  for (const key of POSE_KEYS) out[key] = lerp(a[key], b[key], t);
  return out;
}

// 受阻：上身前傾、雙手往前撐牆，一腳在前一腳在後頂住。
function bracePose(): RigPose {
  const pose: RigPose = { hipsYaw: 0, spinePitch: -14, spineYaw: 0 };
  for (const i of [0, 1]) {
    const side = sideOf(i);
    const isFront = i === 0;
    Object.assign(pose, {
      ['hipX' + i]: isFront ? 18 : -18, ['hipZ' + i]: side * 3, ['knee' + i]: isFront ? -22 : -4, ['foot' + i]: isFront ? 4 : -12,
      ['shoulderX' + i]: 78, ['shoulderZ' + i]: side * 10, ['elbow' + i]: 35,
    });
  }
  return pose;
}

function idlePose(time: number): RigPose {
  const breath = Math.sin(time * BREATH_RATE);
  const pose: RigPose = { hipsYaw: 0, spinePitch: breath, spineYaw: 0 };
  for (const i of [0, 1]) {
    const side = sideOf(i);
    Object.assign(pose, {
      ['hipX' + i]: 0, ['hipZ' + i]: side * 2, ['knee' + i]: -4, ['foot' + i]: 0,
      ['shoulderX' + i]: 3, ['shoulderZ' + i]: side * (6 + breath * 0.8), ['elbow' + i]: 10,
    });
  }
  return pose;
}

// 方向權重：往前、往後、平移三組各自的比重（總和 1）。
function directionWeights(sag: number, lat: number): Record<Direction, number> {
  const weights = { forward: Math.max(0, sag), backward: Math.max(0, -sag), side: Math.abs(lat) };
  const total = weights.forward + weights.backward + weights.side || 1;
  for (const key of DIRECTIONS) weights[key] /= total;
  return weights;
}

// 一隻腳在週期 t 的姿勢。往後走 = 把走路循環倒著播；平移時腳只小幅前後擺，主要往外跨。
function legPose(
  keys: GaitKeys, t: number, weights: Record<Direction, number>, lat: number, side: number, sideSwing: number,
): { hipX: number; hipZ: number; knee: number; foot: number } {
  const ahead = { hip: sampleLoop(keys.hip, t), knee: sampleLoop(keys.knee, t), foot: sampleLoop(keys.foot, t) };
  const behind = { hip: sampleLoop(keys.hip, -t), knee: sampleLoop(keys.knee, -t), foot: sampleLoop(keys.foot, -t) };
  const mix = (key: keyof GaitKeys, sideScale: number): number => ahead[key] * weights.forward + behind[key] * weights.backward + ahead[key] * sideScale * weights.side;
  const lift = clamp((-ahead.knee - 10) / 50, 0, 1);   // 膝蓋抬越高 = 越在跨步
  // 平移時每隻腳只在自己跨步時往外張（往移動方向那隻張得大），兩腿不會交叉。
  const spread = sideSwing * lift * weights.side * (side * lat > 0 ? 1 : 0.4);
  return { hipX: mix('hip', 0.2), hipZ: side * (2 + spread), knee: mix('knee', 1), foot: mix('foot', 0.5) };
}

function gaitPose(phase: number, keys: GaitKeys, style: GaitStyle, sag: number, lat: number): RigPose {
  const weights = directionWeights(sag, lat);
  const swingSign = weights.forward - weights.backward;
  const twist = style.twist * Math.cos(Math.PI * 2 * (phase + 0.1)) * swingSign;
  const pose: RigPose = { hipsYaw: -twist * 0.5, spinePitch: -style.lean * swingSign, spineYaw: twist };
  for (const i of [0, 1]) {
    const side = sideOf(i);
    const t = phase + i * 0.5;
    const leg = legPose(keys, t, weights, lat, side, style.sideSwing);
    // 手和同側的腳反向擺：腳在前（t≈0.9）時手在後。
    const armForward = -Math.cos(Math.PI * 2 * (t + 0.1)) * swingSign;
    Object.assign(pose, {
      ['hipX' + i]: leg.hipX, ['hipZ' + i]: leg.hipZ, ['knee' + i]: leg.knee, ['foot' + i]: leg.foot,
      ['shoulderX' + i]: style.armBias + style.armSwing * armForward,
      ['shoulderZ' + i]: side * style.armOut,
      ['elbow' + i]: style.elbow + style.elbowSwing * Math.max(0, armForward),
    });
  }
  return pose;
}

// rise：1 = 剛起跳、0 = 最高點、-1 = 往下掉。三個關鍵姿勢之間平滑內插。
function airPose(rise: number): RigPose {
  const u = (1 - clamp(rise, -1, 1)) / 2;
  const [from, to, t]: [JumpKey, JumpKey, number] = u < 0.5
    ? [JUMP_KEYS.takeoff, JUMP_KEYS.apex, smoothstep(0, 0.5, u)]
    : [JUMP_KEYS.apex, JUMP_KEYS.landing, smoothstep(0.5, 1, u)];
  const value = (key: keyof JumpKey): number => lerp(from[key], to[key], t);
  const pose: RigPose = { hipsYaw: 0, spinePitch: value('spinePitch'), spineYaw: 0 };
  for (const i of [0, 1]) {
    const side = sideOf(i);
    const lead = (i === 0 ? 8 : -6) * t;   // 兩腳不完全對稱，看起來比較自然
    Object.assign(pose, {
      ['hipX' + i]: value('hipX') + lead, ['hipZ' + i]: side * 4, ['knee' + i]: value('knee'), ['foot' + i]: value('foot'),
      ['shoulderX' + i]: value('shoulderX'), ['shoulderZ' + i]: side * value('shoulderZ'), ['elbow' + i]: value('elbow'),
    });
  }
  return pose;
}

// 落地緩衝：蹲低、上身前傾，手往前平衡。疊加在地面姿勢上。
function addLandingCrouch(pose: RigPose, amount: number): void {
  pose.spinePitch -= 10 * amount;
  for (const i of [0, 1]) {
    pose['hipX' + i] += 40 * amount;
    pose['knee' + i] -= 75 * amount;
    pose['shoulderX' + i] += 15 * amount;
    pose['elbow' + i] += 15 * amount;
  }
}

// 有關節的方塊人：骨盆（下身）→ 腰 → 胸（上身）→ 脖子 → 頭；肩 → 肘 → 腕；髖 → 膝 → 踝。
// 架構照遊戲引擎的動畫系統：步態依速度混合走路／跑步、跳躍分成起跳／空中／落地三個狀態，
// 最後疊上次要動作（加速前傾、轉彎內傾、頭部保持水平）。步伐依實際移動距離推進，腳不會滑。
function createAvatarRig(): AvatarRig {
  const root = new THREE.Group();
  const tilt = new THREE.Group();   // 轉彎內傾的支點在腳底
  root.add(tilt);
  const joints: Record<'hip' | 'knee' | 'ankle' | 'shoulder' | 'elbow', THREE.Group[]> = { hip: [], knee: [], ankle: [], shoulder: [], elbow: [] };
  const soleMarkers: THREE.Group[] = [];
  const markerPos = new THREE.Vector3();
  const motions = {
    fwd: { velocity: 0 }, side: { velocity: 0 }, gait: { velocity: 0 }, air: { velocity: 0 },
    land: { velocity: 0 }, lean: { velocity: 0 }, bank: { velocity: 0 }, brace: { velocity: 0 }, fly: { velocity: 0 },
  };
  const state = {
    height: REFERENCE_HEIGHT, phase: 0, time: 0, fwd: 0, side: 0, sag: 1, lat: 0, gait: 0,
    air: 0, land: 0, landHold: 0, lastRise: 0, wasGrounded: true, lean: 0, bank: 0, brace: 0, fly: 0,
  };
  const emptyTable = (): Record<Direction, number[]> => ({ forward: [], backward: [], side: [] });
  const ground = { rest: 0, idle: 0, crouch: 0, walk: emptyTable(), run: emptyTable() };   // 烘焙好的骨盆高度
  // build() 之前先放空的關節，closure 裡不用每次檢查 undefined；isBuilt 決定能不能播動作。
  let hips = new THREE.Group();
  let spine = new THREE.Group();
  let neck = new THREE.Group();
  let isBuilt = false;

  function addJoint(parent: THREE.Object3D, position: Vec3Tuple): THREE.Group {
    const joint = new THREE.Group();
    joint.position.set(...position);
    parent.add(joint);
    return joint;
  }

  // 四肢方塊從關節往下長，轉關節時整段跟著擺。
  function addLimb(joint: THREE.Object3D, material: THREE.Material, width: number, length: number, depth: number): void {
    addBox(joint, material, [width, length, depth], [0, -length / 2, 0]);
  }

  function buildHead(parent: THREE.Object3D, H: number): void {
    const head = addJoint(parent, [0, BODY.neck * H, 0]);
    const w = 0.15 * H;
    const h = BODY.head * H;
    const d = 0.15 * H;
    addBox(head, materials.playerSkin, [w, h, d], [0, h / 2, 0]);
    addBox(head, materials.playerFace, [w + 0.01, 0.04 * H, d + 0.01], [0, h - 0.015 * H, 0]);        // 頭髮
    addBox(head, materials.playerFace, [w + 0.01, h * 0.6, 0.025 * H], [0, h * 0.65, d / 2]);         // 後腦頭髮
    addBox(head, materials.playerSkin, [0.03 * H, 0.035 * H, 0.03 * H], [0, h * 0.38, -d / 2 - 0.012 * H]);   // 鼻子
    for (const side of [-1, 1]) {
      addBox(head, materials.playerFace, [0.028 * H, 0.022 * H, 0.006], [side * 0.035 * H, h * 0.52, -d / 2 - 0.002]);
    }
  }

  function buildArm(index: number, H: number): void {
    const side = sideOf(index);
    const shoulder = addJoint(spine, [side * 0.15 * H, (BODY.chest - 0.025) * H, 0]);
    addLimb(shoulder, materials.player, 0.065 * H, BODY.upperArm * H, 0.07 * H);
    const elbow = addJoint(shoulder, [0, -BODY.upperArm * H, 0]);
    addLimb(elbow, materials.playerSkin, 0.055 * H, BODY.forearm * H, 0.058 * H);
    const wrist = addJoint(elbow, [0, -BODY.forearm * H, 0]);
    addLimb(wrist, materials.playerSkin, 0.06 * H, BODY.hand * H, 0.035 * H);
    joints.shoulder[index] = shoulder;
    joints.elbow[index] = elbow;
  }

  function buildLeg(index: number, H: number): void {
    const side = sideOf(index);
    const hip = addJoint(hips, [side * 0.055 * H, 0, 0]);
    addLimb(hip, materials.playerPants, 0.095 * H, BODY.thigh * H, 0.1 * H);
    const knee = addJoint(hip, [0, -BODY.thigh * H, 0]);
    addLimb(knee, materials.playerPants, 0.08 * H, BODY.shin * H, 0.085 * H);
    const ankle = addJoint(knee, [0, -BODY.shin * H, 0]);
    const sole = -BODY.ankle * H;
    const heel = 0.045 * H;
    const toe = 0.12 * H;
    addBox(ankle, materials.playerShoe, [0.075 * H, BODY.ankle * H, heel + toe], [0, sole / 2, (heel - toe) / 2]);
    for (const z of [heel, -toe]) soleMarkers.push(addJoint(ankle, [0, sole, z]));
    joints.hip[index] = hip;
    joints.knee[index] = knee;
    joints.ankle[index] = ankle;
  }

  function applyPose(pose: RigPose): void {
    hips.rotation.y = DEG(pose.hipsYaw);
    spine.rotation.set(DEG(pose.spinePitch), DEG(pose.spineYaw), 0);
    neck.rotation.x = -DEG(pose.spinePitch);   // 頭部保持水平：上身怎麼傾，脖子就反向補回來
    for (const i of [0, 1]) {
      joints.hip[i].rotation.set(DEG(pose['hipX' + i]), 0, DEG(pose['hipZ' + i]));
      joints.knee[i].rotation.x = DEG(pose['knee' + i]);
      // 腳踝角度由「腳板對地角度」反推，大腿、小腿怎麼擺，腳板都維持想要的角度。
      joints.ankle[i].rotation.x = DEG(pose['foot' + i] - pose['hipX' + i] - pose['knee' + i]);
      joints.shoulder[i].rotation.set(DEG(pose['shoulderX' + i]), 0, DEG(pose['shoulderZ' + i]));
      joints.elbow[i].rotation.x = DEG(pose['elbow' + i]);
    }
  }

  // 骨盆在原位時，最低的腳底離地多高（正的 = 浮在空中，骨盆要往下降這麼多）。
  function measureLowestSole(pose: RigPose): number {
    applyPose(pose);
    hips.position.y = ground.rest;
    tilt.rotation.z = 0;
    root.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const marker of soleMarkers) lowest = Math.min(lowest, marker.getWorldPosition(markerPos).y - root.position.y);
    return lowest;
  }

  // 每種步態、方向各取 16 格算出骨盆高度，執行時用平滑曲線讀表；不再每格找最低點，
  // 支撐腳換腳的那一格也不會有高度轉折（之前落地會震一下就是這個原因）。
  function bakeGroundHeights(): void {
    ground.idle = measureLowestSole(idlePose(0));
    const crouched = idlePose(0);
    addLandingCrouch(crouched, 1);
    ground.crouch = measureLowestSole(crouched) - ground.idle;
    for (const gaitName of GAIT_NAMES) {
      for (const direction of DIRECTIONS) {
        const sag = { forward: 1, backward: -1, side: 0 }[direction];
        const samples: number[] = [];
        for (let k = 0; k < BOB_SAMPLES; k++) {
          samples.push(measureLowestSole(gaitPose(k / BOB_SAMPLES, GAIT_KEYS[gaitName], GAIT_STYLE[gaitName], sag, 1 - Math.abs(sag))));
        }
        ground[gaitName][direction] = smoothLoop(samples, BOB_SMOOTH_PASSES);
      }
    }
  }

  function build(eyeHeight: number): void {
    disposeChildren(tilt);
    soleMarkers.length = 0;
    const H = eyeHeight / EYE_RATIO;
    state.height = H;
    ground.rest = HIP_RATIO * H;
    hips = addJoint(tilt, [0, ground.rest, 0]);
    addBox(hips, materials.playerPants, [0.2 * H, (BODY.pelvis + 0.03) * H, 0.12 * H], [0, ((BODY.pelvis - 0.03) / 2) * H, 0]);   // 骨盆（下身）
    spine = addJoint(hips, [0, BODY.pelvis * H, 0]);
    addBox(spine, materials.player, [0.23 * H, BODY.chest * H, 0.13 * H], [0, (BODY.chest / 2) * H, 0]);                       // 胸（上身）
    neck = addJoint(spine, [0, BODY.chest * H, 0]);
    addBox(neck, materials.playerSkin, [0.06 * H, (BODY.neck + 0.02) * H, 0.06 * H], [0, (BODY.neck / 2) * H, 0]);
    buildHead(neck, H);
    for (const i of [0, 1]) {
      buildArm(i, H);
      buildLeg(i, H);
    }
    bakeGroundHeights();
    isBuilt = true;
  }

  function groundHeight(run: number): number {
    const weights = directionWeights(state.sag, state.lat);
    const gaitHeight = (gaitName: GaitName): number => DIRECTIONS.reduce((sum, direction) => sum + weights[direction] * sampleLoop(ground[gaitName][direction], state.phase), 0);
    const moving = lerp(gaitHeight('walk'), gaitHeight('run'), run);
    return lerp(ground.idle, moving, state.gait) + ground.crouch * state.land;
  }

  function updateLocomotion(motion: RigMotion, dt: number): number {
    const previousFwd = state.fwd;
    state.fwd = smoothDamp(state.fwd, motion.forwardSpeed, motions.fwd, GAIT_SMOOTH_TIME, dt);
    state.side = smoothDamp(state.side, motion.sideSpeed, motions.side, GAIT_SMOOTH_TIME, dt);
    const speed = Math.hypot(state.fwd, state.side);
    const isTurningInPlace = speed < 0.1 && motion.turnRate !== 0;
    if (speed > 0.05) {
      state.sag = state.fwd / speed;
      state.lat = state.side / speed;
    } else if (isTurningInPlace) {
      state.sag = 1;
      state.lat = 0;
    }
    const cycleLength = (CYCLE_BASE + CYCLE_PER_SPEED * speed) * (state.height / REFERENCE_HEIGHT);
    const cyclesPerSecond = isTurningInPlace ? Math.abs(motion.turnRate) * TURN_STEP_RATE : speed / cycleLength;
    if (motion.isGrounded) state.phase = wrap01(state.phase + cyclesPerSecond * dt);
    const gaitTarget = isTurningInPlace ? 0.35 : smoothstep(0, 0.5, speed);
    state.gait = smoothDamp(state.gait, gaitTarget, motions.gait, GAIT_SMOOTH_TIME, dt);

    const accel = (state.fwd - previousFwd) / dt;
    const leanTarget = motion.isGrounded ? clamp(accel * ACCEL_LEAN_PER_MS2, -MAX_ACCEL_LEAN, MAX_ACCEL_LEAN) : 0;
    state.lean = smoothDamp(state.lean, leanTarget, motions.lean, LEAN_SMOOTH_TIME, dt);
    const bankTarget = clamp(motion.turnRate * speed * BANK_PER_TURN_SPEED, -MAX_BANK, MAX_BANK);
    state.bank = smoothDamp(state.bank, bankTarget, motions.bank, LEAN_SMOOTH_TIME, dt);
    return speed;
  }

  // 跳躍狀態：地面 → 空中（姿勢跟著垂直速度走）→ 落地緩衝（下落越快蹲越深）→ 地面。
  function updateAirborne(motion: RigMotion, dt: number): void {
    if (motion.isGrounded && !state.wasGrounded) {
      state.land = clamp(-state.lastRise, LAND_MIN, 1);
      state.landHold = LAND_HOLD;
      motions.land.velocity = 0;
    }
    if (!motion.isGrounded) state.lastRise = motion.riseRatio;
    state.wasGrounded = motion.isGrounded;
    state.landHold = Math.max(0, state.landHold - dt);
    if (state.landHold === 0) state.land = smoothDamp(state.land, 0, motions.land, LAND_SMOOTH_TIME, dt);
    state.air = smoothDamp(state.air, motion.isGrounded ? 0 : 1, motions.air, AIR_SMOOTH_TIME, dt);
  }

  // motion：forwardSpeed／sideSpeed 是實際位移換算的速度（m/s，角色座標），撞牆時是 0，腳就不會原地空踩；
  // 撞牆時改由 pushForward／pushSide 切到撐牆姿勢。
  function animate(motion: RigMotion, dt: number): void {
    if (!isBuilt || dt <= 0) return;
    state.time += dt;
    // 飛行時不踏步、不擺跳躍姿勢：當成原地站著，再把腳尖往下垂。
    const footing = motion.isFlying ? { ...motion, forwardSpeed: 0, sideSpeed: 0, turnRate: 0, isGrounded: true } : motion;
    const speed = updateLocomotion(footing, dt);
    updateAirborne(footing, dt);
    state.fly = smoothDamp(state.fly, motion.isFlying ? 1 : 0, motions.fly, FLY_SMOOTH_TIME, dt);
    const run = smoothstep(RUN_BLEND[0], RUN_BLEND[1], speed);
    const keys: GaitKeys = { hip: [], knee: [], foot: [] };
    for (const channel of GAIT_CHANNELS) keys[channel] = GAIT_KEYS.walk[channel].map((value, k) => lerp(value, GAIT_KEYS.run[channel][k], run));
    const style: GaitStyle = { ...GAIT_STYLE.walk };
    for (const key of STYLE_KEYS) style[key] = lerp(GAIT_STYLE.walk[key], GAIT_STYLE.run[key], run);
    const isPushing = motion.pushForward !== 0 || motion.pushSide !== 0;
    state.brace = smoothDamp(state.brace, isPushing ? 1 : 0, motions.brace, BRACE_SMOOTH_TIME, dt);
    const standing = blendPose(idlePose(state.time), bracePose(), state.brace);
    const grounded = blendPose(standing, gaitPose(state.phase, keys, style, state.sag, state.lat), state.gait);
    addLandingCrouch(grounded, state.land);
    const pose = blendPose(grounded, airPose(motion.riseRatio), state.air);
    pose.spinePitch -= state.lean;
    for (const i of [0, 1]) {
      pose['foot' + i] -= FLY_FOOT_DROOP * state.fly;
      pose['knee' + i] -= FLY_KNEE_BEND * state.fly;
      pose['shoulderZ' + i] += sideOf(i) * FLY_ARM_SPREAD * state.fly;
      pose['elbow' + i] += FLY_ELBOW_BEND * state.fly;
    }
    applyPose(pose);
    hips.position.y = ground.rest - groundHeight(run) * (1 - state.air);
    tilt.rotation.z = DEG(state.bank);
  }

  const handReach = (): HandReach => ({ forward: BRACE_HAND_REACH.forward * state.height, height: BRACE_HAND_REACH.height * state.height, slack: 0 });

  return { root, build, animate, handReach };
}

// ---------- glTF 角色（Quaternius UAL1 Standard，CC0） ----------
// 用沒有根運動的版本：角色怎麼移動由程式決定，動畫只負責原地的姿勢。
const MODEL_URL = new URL('../assets/models/ual1-standard.glb', import.meta.url).href;
const ONCE_ROLES: ClipRole[] = ['jumpStart', 'jumpLand', 'sitEnter', 'sitExit'];
const LOCOMOTION_ROLES: ClipRole[] = ['walk', 'run', 'sprint'];
const SIT_PHASES: CharacterPhase[] = ['sitEnter', 'sit', 'sitExit'];
// 坐下動畫是坐椅子（Sitting_Idle_Loop 骨盆離地約 0.54 m、在腳後方 0.33 m），空地上會像坐在空氣上，
// 所以坐著時在屁股底下放一塊方塊稿座椅。尺寸是模型原始比例（m），跟著模型一起縮放、轉向。
const SEAT_SIZE: Vec3Tuple = [0.42, 0.48, 0.4];
const SEAT_CENTER: Vec3Tuple = [0, 0.24, -0.36];
const MODEL_FACING = Math.PI;      // 模型面向 +Z，遊戲裡角色面向 -Z
const IDLE_SPEED = 0.1;            // 低於這個速度（m/s）算站著
const BLOCKED_TIME_SCALE = 0.6;    // 推牆動畫放慢一點，看起來是頂著推不動，不是在走
const HAND_BONES = ['hand_l', 'hand_r'];
const ARM_CHAINS: [string, string, string][] = [['upperarm_l', 'lowerarm_l', 'hand_l'], ['upperarm_r', 'lowerarm_r', 'hand_r']];
const IK_SMOOTH_TIME = 0.12;       // 手部 IK 淡入淡出
const IK_MIN_WEIGHT = 1e-3;
const IK_REACH_MARGIN = 0.15;      // 手臂伸直的長度再往前多探這麼遠找牆
const FOOT_CHAINS: [string, string][] = [['foot_l', 'ball_l'], ['foot_r', 'ball_r']];
const LEG_CHAINS: [string, string, string][] = [['thigh_l', 'calf_l', 'foot_l'], ['thigh_r', 'calf_r', 'foot_r']];
// 漂浮姿勢（疊在站立動畫上）參考 NASA 失重的「中性身體姿勢」（neutral body posture）：髖、膝微屈、腳尖往下、
// 手臂往前外側浮起、手肘彎；但這裡有重力感，所以四肢仍往下垂。左右刻意不對稱（一腳膝蓋彎多一點），才不像立正。
const FLOAT_LEG_REACH = [0.92, 0.955];     // 腳踝離髖關節的距離 / 腿長（左、右），越小膝蓋越彎
const FLOAT_LEG_FORWARD = [0.07, 0.02];    // 腳踝在髖關節前方多少（m）
const FLOAT_FEET_INWARD = 0.03;            // 兩腳往中間收多少（m）
const FLOAT_ARM_REACH = 0.84;              // 手離肩膀的距離 / 手臂長
const FLOAT_ARM_OUTWARD = 0.17;            // 手往外張多少（m）
const FLOAT_ARM_FORWARD = 0.1;             // 手在肩膀前方多少（m）
const FLOAT_BOB = 0.03;                    // 漂浮時上下浮動的幅度（m）
const FLOAT_BOB_RATE = 2.4;                // 浮動速度（弧度/秒，約 2.6 秒一次）
const FLOAT_LIMB_LAG = 0.5;                // 手腳跟著身體浮動慢多少相位（弧度）：身體先動、四肢後到，看起來是垂著的
const FLOAT_SWAY = 0.02;                   // 兩腳各自前後輕晃的幅度（m）
const FLOAT_SWAY_RATES = [0.9, 1.3];       // 兩腳晃動的速度（弧度/秒），不同步才不像機械
const FLY_LEAN_MAX = 18;                   // 往前（後）飛時身體從骨盆往行進方向傾的最大角度（度），往側邊飛時一半
const FLY_LEAN_SPEED = 6;                  // 水平速度到這裡（m/s）就傾到最大
const FLY_LEAN_SMOOTH_TIME = 0.35;
const FLY_CRUISE_SMOOTH_TIME = 0.3;        // 漂浮 ↔ 飛行的過渡：水平速度先平滑過再拿去算前傾、四肢後拖、腿伸直；位移本身是瞬間到速，直接用會一格就跳到飛行姿勢
const FLY_LEG_FOLLOW = 0.85;               // 前傾時腿跟著身體轉的比例：1 是腿和軀幹成一直線，0 是腿永遠垂直往下
const FLY_ARM_FOLLOW = 0.5;                // 手跟著身體轉的比例（比腿垂得直）
const FLY_CRUISE_LEG_STRETCH = 0.02;       // 全速飛時腿再伸直多少（reach 增加）
const FLY_DRAG = 0.03;                     // 手腳被風往後帶：水平速度 × 這個秒數 = 往後偏多少（m）
const FLY_DRAG_MAX = 0.15;
const FLY_ARM_DRAG_SHARE = 0.5;            // 手被帶的比例（比腳輕）
const FLY_CLIMB_LEG_STRETCH = 0.015;       // 往上飛時腿被拉直多少（reach 增加）
const FLY_CLIMB_KNEE_TUCK = 0.07;          // 往下飛時膝蓋縮多少（reach 減少）
const FLY_CLIMB_ARM_LIFT = 0.1;            // 往下飛時手往上浮多少（reach 減少）
const FLY_CLIMB_ARM_SPREAD = 0.06;         // 往下飛時手再往外張多少（m）
const FLY_CLIMB_SMOOTH_TIME = 0.3;
const FLOAT_REACH_MAX = 0.97;              // 加上浮動、風阻後，目標最遠只到鏈長的這個比例，膝蓋、手肘不會鎖直
const FLY_TOE_ANGLE = 70;         // 飛行時腳掌往下垂：腳踝到腳尖和水平面的夾角（度）；站立時約 31°
const IK_SLACK = 0.08;             // 有手部 IK 時身體少退這麼多，手肘留彎度，斜著推時遠的那隻手也搆得到
const IK_STRETCH_LIMIT = 1e-3;     // 手臂不完全伸直，留一點彎度，手肘才不會在伸直附近翻來翻去
const PUSH_BACK_SMOOTH_TIME = 0.15;
const CLIP_END_EPSILON = 1e-3;
const PHASE_FOOT_BONE = 'ball_l';  // 用左腳尖找步伐週期的起點
const PHASE_PROBE_SAMPLES = 48;
// 方向扭轉（orientation warping）：骨盆轉向移動方向，脊椎三節依比例轉回來，上半身維持朝前。
const PELVIS_BONE = 'pelvis';
const SPINE_COUNTER: [string, number][] = [['spine_01', 0.4], ['spine_02', 0.3], ['spine_03', 0.3]];
const WORLD_UP = new THREE.Vector3(0, 1, 0);
type AnimSlot = 'locomotion' | 'jumpStart' | 'jumpLoop' | 'jumpLand' | 'blocked' | 'fly' | 'sitEnter' | 'sitLoop' | 'sitExit';
const ANIM_SLOTS: AnimSlot[] = ['locomotion', 'jumpStart', 'jumpLoop', 'jumpLand', 'blocked', 'fly', 'sitEnter', 'sitLoop', 'sitExit'];
const SLOT_OF_PHASE: Record<CharacterPhase, AnimSlot> = {
  ground: 'locomotion', jumpStart: 'jumpStart', jumpLoop: 'jumpLoop', land: 'jumpLand', blocked: 'blocked', fly: 'fly',
  sitEnter: 'sitEnter', sit: 'sitLoop', sitExit: 'sitExit',
};
const SLOT_OF_ROLE: Record<ClipRole, AnimSlot> = {
  idle: 'locomotion', walk: 'locomotion', run: 'locomotion', sprint: 'locomotion', jumpStart: 'jumpStart', jumpLoop: 'jumpLoop', jumpLand: 'jumpLand', blocked: 'blocked', fly: 'fly',
  sitEnter: 'sitEnter', sitLoop: 'sitLoop', sitExit: 'sitExit',
};
type LocomotionWeights = Record<'idle' | 'walk' | 'run' | 'sprint', number>;

// 找出「左腳踩到最前面」在動畫裡的位置（0–1），當成步伐週期的 0。
// 走路和跑步都從這裡對齊，混合時兩段才會同一隻腳一起落地，不會互相抵消成小碎步。
function measurePhaseOffset(model: THREE.Object3D, clip: THREE.AnimationClip): number {
  const foot = model.getObjectByName(PHASE_FOOT_BONE);
  if (!foot) return 0;
  const probe = new THREE.AnimationMixer(model);
  probe.clipAction(clip).play();
  const point = new THREE.Vector3();
  let bestForward = -Infinity;
  let bestPhase = 0;
  for (let i = 0; i < PHASE_PROBE_SAMPLES; i++) {
    const t = i / PHASE_PROBE_SAMPLES;
    probe.setTime(t * clip.duration);
    model.updateMatrixWorld(true);
    const forward = model.worldToLocal(foot.getWorldPosition(point)).z;
    if (forward > bestForward) {
      bestForward = forward;
      bestPhase = t;
    }
  }
  probe.stopAllAction();
  probe.uncacheRoot(model);
  return bestPhase;
}

// 推牆動畫裡兩手平均伸到最前面的那一格：手在模型前方多遠、多高（模型原始尺寸，還沒乘縮放）。
// 用複製出來的骨架量，不動到畫面上那隻角色的骨頭（mixer 只在值改變時才寫回骨頭，量完會留下錯的姿勢）。
function measureHandReach(model: THREE.Object3D, clip: THREE.AnimationClip): HandReach | null {
  const copy = cloneSkinned(model);
  copy.rotation.set(0, 0, 0);
  copy.scale.setScalar(1);
  const hands = HAND_BONES.map((name) => copy.getObjectByName(name));
  if (hands.some((hand) => !hand)) return null;
  const probe = new THREE.AnimationMixer(copy);
  probe.clipAction(clip).play();
  const point = new THREE.Vector3();
  let best: HandReach | null = null;
  for (let i = 0; i < PHASE_PROBE_SAMPLES; i++) {
    probe.setTime((i / PHASE_PROBE_SAMPLES) * clip.duration);
    copy.updateMatrixWorld(true);
    let forward = 0;
    let height = 0;
    for (const hand of hands) {
      hand?.getWorldPosition(point);
      forward += point.z / hands.length;
      height += point.y / hands.length;
    }
    if (!best || forward > best.forward) best = { forward, height, slack: 0 };
  }
  probe.stopAllAction();
  return best;
}

// 兩骨鏈（手臂：上臂、前臂、手；腿：大腿、小腿、腳踝）；restore 是 IK 改之前的姿勢（mixer 只在值改變時才寫回骨頭，下一格要先還原）。
interface LimbChain {
  upper: THREE.Object3D; lower: THREE.Object3D; hand: THREE.Object3D;
  restoreUpper: THREE.Quaternion; restoreLower: THREE.Quaternion;
  target: THREE.Vector3; hasTarget: boolean; isApplied: boolean;
}

function findLimbChains(root: THREE.Object3D, names: [string, string, string][]): LimbChain[] {
  const chains: LimbChain[] = [];
  for (const [upperName, lowerName, handName] of names) {
    const upper = root.getObjectByName(upperName);
    const lower = root.getObjectByName(lowerName);
    const hand = root.getObjectByName(handName);
    if (!upper || !lower || !hand) return [];
    chains.push({
      upper, lower, hand, restoreUpper: new THREE.Quaternion(), restoreLower: new THREE.Quaternion(),
      target: new THREE.Vector3(), hasTarget: false, isApplied: false,
    });
  }
  return chains;
}

const ikShoulder = new THREE.Vector3();
const ikElbow = new THREE.Vector3();
const ikHand = new THREE.Vector3();
const ikGoal = new THREE.Vector3();
const ikDir = new THREE.Vector3();
const ikPole = new THREE.Vector3();
const ikFrom = new THREE.Vector3();
const ikTo = new THREE.Vector3();
const ikParent = new THREE.Quaternion();
const ikTurn = new THREE.Quaternion();
const IK_FALLBACK_POLE = new THREE.Vector3(0, -1, 0);
const floatForward = new THREE.Vector3();
const floatSide = new THREE.Vector3();
const floatCenter = new THREE.Vector3();
const floatPole = new THREE.Vector3();
const floatRight = new THREE.Vector3();
const floatDrag = new THREE.Vector3();
const floatOffset = new THREE.Vector3();   // 這一格手腳被風往後帶的方向與距離（世界座標）
const leanAxis = new THREE.Vector3();
const leanTurn = new THREE.Quaternion();
const leanRollTurn = new THREE.Quaternion();
const leanLocal = new THREE.Quaternion();
const floatDown = new THREE.Vector3();     // 四肢往下垂的方向：漂浮時是正下方，前傾時跟著身體往後轉
const floatTilt = new THREE.Quaternion();

// 把骨頭繞自己的關節轉，讓世界座標裡的方向 from 轉成 to：local' = parent⁻¹ · 轉動 · parent · local。
function turnBone(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  if (!bone.parent || from.lengthSq() === 0 || to.lengthSq() === 0) return;
  bone.parent.getWorldQuaternion(ikParent);
  ikTurn.setFromUnitVectors(from.normalize(), to.normalize());
  ikTurn.premultiply(ikParent.clone().invert()).multiply(ikParent);
  bone.quaternion.premultiply(ikTurn);
  bone.updateMatrixWorld(true);
}

// 兩骨 IK：上臂 a、前臂 b 長度已知，肩膀到目標距離 c，用餘弦定理算手肘位置，
// 手肘往 pole 凸出（沒給就沿用動畫原本彎的方向）；先轉上臂讓手肘到位，再轉前臂讓手到目標。
function solveTwoBoneIk(chain: LimbChain, goal: THREE.Vector3, pole?: THREE.Vector3): void {
  chain.upper.getWorldPosition(ikShoulder);
  chain.lower.getWorldPosition(ikElbow);
  chain.hand.getWorldPosition(ikHand);
  const a = ikShoulder.distanceTo(ikElbow);
  const b = ikElbow.distanceTo(ikHand);
  ikDir.subVectors(goal, ikShoulder);
  const c = clamp(ikDir.length(), Math.abs(a - b) + IK_STRETCH_LIMIT, a + b - IK_STRETCH_LIMIT);
  if (a === 0 || b === 0 || ikDir.lengthSq() === 0) return;
  ikDir.normalize();
  if (pole) ikPole.copy(pole);
  else ikPole.subVectors(ikElbow, ikShoulder);
  ikPole.addScaledVector(ikDir, -ikPole.dot(ikDir));
  if (ikPole.lengthSq() < 1e-8) ikPole.copy(IK_FALLBACK_POLE).addScaledVector(ikDir, -IK_FALLBACK_POLE.dot(ikDir));
  ikPole.normalize();
  const cosA = clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1);
  const elbowGoal = ikShoulder.clone().addScaledVector(ikDir, a * cosA).addScaledVector(ikPole, a * Math.sqrt(1 - cosA * cosA));
  turnBone(chain.upper, ikFrom.subVectors(ikElbow, ikShoulder), ikTo.subVectors(elbowGoal, ikShoulder));
  chain.lower.getWorldPosition(ikElbow);
  chain.hand.getWorldPosition(ikHand);
  const handGoal = ikShoulder.clone().addScaledVector(ikDir, c);
  turnBone(chain.lower, ikFrom.subVectors(ikHand, ikElbow), ikTo.subVectors(handGoal, ikElbow));
}

// 一隻腳的腳踝與腳尖骨頭；restore 是疊上下垂之前的姿勢（理由同 LimbChain）。
interface FootChain { foot: THREE.Object3D; ball: THREE.Object3D; restore: THREE.Quaternion; isApplied: boolean }

function findFootChains(root: THREE.Object3D): FootChain[] {
  const chains: FootChain[] = [];
  for (const [footName, ballName] of FOOT_CHAINS) {
    const foot = root.getObjectByName(footName);
    const ball = root.getObjectByName(ballName);
    if (!foot || !ball) return [];
    chains.push({ foot, ball, restore: new THREE.Quaternion(), isApplied: false });
  }
  return chains;
}

const toeHeel = new THREE.Vector3();
const toeTip = new THREE.Vector3();
const toeFrom = new THREE.Vector3();
const toeTo = new THREE.Vector3();

// 腳踝轉到腳跟→腳尖往下傾 FLY_TOE_ANGLE 度（水平方向維持動畫原本的朝向），weight 0–1 和動畫混合。
function droopFoot(chain: FootChain, weight: number): void {
  chain.foot.getWorldPosition(toeHeel);
  chain.ball.getWorldPosition(toeTip);
  toeFrom.subVectors(toeTip, toeHeel);
  const length = toeFrom.length();
  const horizontal = Math.hypot(toeFrom.x, toeFrom.z);
  if (length === 0 || horizontal === 0) return;
  const angle = DEG(FLY_TOE_ANGLE);
  toeTo.set((toeFrom.x / horizontal) * Math.cos(angle), -Math.sin(angle), (toeFrom.z / horizontal) * Math.cos(angle));
  toeTo.multiplyScalar(length).lerp(toeFrom, 1 - weight);
  turnBone(chain.foot, toeFrom, toeTo);
}

// 模型載入前（或載入失敗時）先用方塊人，介面和方塊人一樣，第一人稱模式不用知道是哪一個。
// 架構照遊戲引擎的動畫狀態機：
// - 地面：一維混合空間（blend space），依速度在走路、跑步兩個節點之間插值，兩段共用同一個步伐週期；
// - 跳躍：起跳（播一次）→ 空中（循環，起跳播完還沒落地才會用到）→ 落地（播一次，蹲夠久就能被走路打斷）；
// - 受阻：在地面按著方向鍵卻被擋住（例如撞牆）時播推牆循環，身體轉向想走的方向；放開或轉離牆面就回到地面；
// - 飛行：播站立循環、腳尖往下垂（骨頭疊在動畫上）；解除時碰到地面就播落地，還在空中就接空中循環；
// - 狀態之間用權重淡入淡出，權重總和永遠是 1（three.js 不足 1 的部分會混進 T-pose）。
// 平移沒有專用動畫：身體轉向移動方向（orient to movement），播一般的走跑。
function createCharacter(): Character {
  const root = new THREE.Group();
  const block = createAvatarRig();
  root.add(block.root);
  let model: THREE.Object3D | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let skeletonHelper: THREE.SkeletonHelper | null = null;
  let clips = new Map<string, THREE.AnimationClip>();
  const usedActions = new Set<THREE.AnimationAction>();
  const phaseOffsets = new Map<THREE.AnimationClip, number>();
  const handReaches = new Map<THREE.AnimationClip, HandReach | null>();
  const pushBackMotion = { velocity: 0 };
  const pushDir = { forward: 1, side: 0 };   // 最後一次推的方向，放開後沿原方向退回原位
  let pushBack = 0;
  let armChains: LimbChain[] = [];
  let legChains: LimbChain[] = [];
  let floatTime = 0;
  let ikWeight = 0;
  const ikMotion = { velocity: 0 };
  let footChains: FootChain[] = [];
  let flyWeight = 0;
  const flyMotion = { velocity: 0 };
  let leanPitch = 0;   // 往前傾為正（弧度）
  let leanRoll = 0;    // 往右傾為正（弧度）
  let climbBlend = 0;  // -1 往下飛 … 1 往上飛
  let cruiseForward = 0;   // 平滑過的水平速度（m/s，角色座標）：漂浮姿勢和飛行姿勢之間照這個漸變
  let cruiseSide = 0;
  const cruiseForwardMotion = { velocity: 0 };
  const cruiseSideMotion = { velocity: 0 };
  const leanPitchMotion = { velocity: 0 };
  const leanRollMotion = { velocity: 0 };
  const climbMotion = { velocity: 0 };
  let pelvisBone: THREE.Object3D | null = null;
  const leanRestore = new THREE.Quaternion();
  let isLeanApplied = false;
  const slotWeights: Record<AnimSlot, number> = { locomotion: 1, jumpStart: 0, jumpLoop: 0, jumpLand: 0, blocked: 0, fly: 0, sitEnter: 0, sitLoop: 0, sitExit: 0 };
  let seat: THREE.Mesh | null = null;
  const facingMotion = { velocity: 0 };
  let phase: CharacterPhase = 'ground';
  let phaseTime = 0;
  let wasGrounded = true;
  let moveBlend = 0;   // 0 = 站立、1 = 走跑
  let cycle = 0;       // 走跑共用的步伐週期（0–1）
  let facing = 0;      // 身體偏離角色面向的總角度（弧度）＝ 整個模型轉的 ＋ 下半身扭的
  let legWarp = 0;     // 其中由下半身扭轉負責的部分
  let warpBones: { bone: THREE.Object3D; share: number; restore: THREE.Quaternion }[] = [];
  let isWarpApplied = false;
  const warpAxis = new THREE.Vector3();
  const warpTurn = new THREE.Quaternion();
  const parentRotation = new THREE.Quaternion();

  function scaleModel(): void {
    model?.scale.setScalar(config.character.scale);
  }

  function build(height: number): void {
    block.build(height);
    scaleModel();
  }

  // 走跑的時間由步伐週期決定（timeScale 0、每格自己設 time）；其他照常由 mixer 推進。
  function actionFor(role: ClipRole): THREE.AnimationAction {
    const name = config.character.clips[role];
    const clip = clips.get(name);
    if (!mixer || !clip) throw new Error(`找不到動畫片段「${name}」（${role}）`);
    const action = mixer.clipAction(clip);
    if (!usedActions.has(action)) {
      const isOnce = ONCE_ROLES.includes(role);
      action.setLoop(isOnce ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = isOnce;
      action.timeScale = LOCOMOTION_ROLES.includes(role) ? 0 : role === 'blocked' ? BLOCKED_TIME_SCALE : 1;
      action.setEffectiveWeight(0);
      action.play();
      usedActions.add(action);
    }
    return action;
  }

  const isFinished = (role: ClipRole): boolean => {
    const action = actionFor(role);
    return action.time >= action.getClip().duration - CLIP_END_EPSILON;
  };

  function phaseOffset(clip: THREE.AnimationClip): number {
    const cached = phaseOffsets.get(clip);
    if (cached !== undefined) return cached;
    const offset = model ? measurePhaseOffset(model, clip) : 0;
    phaseOffsets.set(clip, offset);
    return offset;
  }

  function enterPhase(next: CharacterPhase, role: ClipRole): void {
    phase = next;
    phaseTime = 0;
    actionFor(role).reset();
  }

  // 每個狀態的權重以 fadeSeconds 從 0 走到 1，其他往 0 走，最後正規化成總和 1。
  function fadeSlots(active: AnimSlot, dt: number): void {
    const fade = config.character.fadeSeconds;
    const step = fade > 0 ? dt / fade : 1;
    for (const slot of ANIM_SLOTS) {
      slotWeights[slot] = slot === active ? Math.min(1, slotWeights[slot] + step) : Math.max(0, slotWeights[slot] - step);
    }
    const total = ANIM_SLOTS.reduce((sum, slot) => sum + slotWeights[slot], 0);
    for (const slot of ANIM_SLOTS) slotWeights[slot] /= total;
  }

  // 混合空間：三個節點是走路、跑步、衝刺的原速，速度落在兩個節點之間就那兩段按比例混。
  // 一個週期走的距離也跟著插值，所以腳不滑；比衝刺原速還快（Z 加速）時週期照實際速度加快，腳步跟上。
  // 往後退時週期倒著走。回傳站立／走路／跑步／衝刺各自的權重。
  function updateLocomotion(motion: RigMotion, speed: number, dt: number): LocomotionWeights {
    const { clipSpeeds, fadeSeconds } = config.character;
    const walk = actionFor('walk');
    const run = actionFor('run');
    const sprint = actionFor('sprint');
    const runBlend = clamp((speed - clipSpeeds.walk) / (clipSpeeds.run - clipSpeeds.walk), 0, 1);
    const sprintBlend = clamp((speed - clipSpeeds.run) / (clipSpeeds.sprint - clipSpeeds.run), 0, 1);
    const stride = (action: THREE.AnimationAction, clipSpeed: number): number => clipSpeed * action.getClip().duration;
    const cycleLength = sprintBlend > 0
      ? lerp(stride(run, clipSpeeds.run), stride(sprint, clipSpeeds.sprint), sprintBlend)
      : lerp(stride(walk, clipSpeeds.walk), stride(run, clipSpeeds.run), runBlend);
    const direction = motion.forwardSpeed < -IDLE_SPEED ? -1 : 1;
    cycle = wrap01(cycle + (direction * speed * dt) / cycleLength);
    for (const action of [walk, run, sprint]) action.time = wrap01(cycle + phaseOffset(action.getClip())) * action.getClip().duration;
    const step = fadeSeconds > 0 ? dt / fadeSeconds : 1;
    moveBlend = speed >= IDLE_SPEED ? Math.min(1, moveBlend + step) : Math.max(0, moveBlend - step);
    return {
      idle: 1 - moveBlend,
      walk: moveBlend * (1 - runBlend),
      run: moveBlend * runBlend * (1 - sprintBlend),
      sprint: moveBlend * sprintBlend,
    };
  }

  // 下拉選單換掉的舊動作權重歸零，免得還混在姿勢裡。
  function applyWeights(locomotion: LocomotionWeights): void {
    const weights = new Map<THREE.AnimationAction, number>();
    for (const role of CLIP_ROLES) {
      const share = role === 'idle' || role === 'walk' || role === 'run' || role === 'sprint' ? locomotion[role] : 1;
      const action = actionFor(role);
      weights.set(action, (weights.get(action) ?? 0) + slotWeights[SLOT_OF_ROLE[role]] * share);
    }
    for (const action of usedActions) action.setEffectiveWeight(weights.get(action) ?? 0);
  }

  // 移動方向在角色座標裡偏離正前（或正後）多少，身體就轉多少（上限 maxMoveTurn）；停下來或跳起來都轉回正面，
  // 側移時起跳，下半身不會維持扭向側邊的姿勢。
  // 轉的角度先給下半身（上限 legTurnLimit，上半身仍朝前），超過的部分才轉整個模型。
  function updateFacing(motion: RigMotion, speed: number, dt: number): void {
    const c = config.character;
    const isPushing = phase === 'blocked';
    const fwd = isPushing ? motion.pushForward : motion.forwardSpeed;
    const side = isPushing ? motion.pushSide : motion.sideSpeed;
    let target = 0;
    if ((phase === 'ground' && speed >= IDLE_SPEED) || isPushing) {
      const isBackward = fwd < -IDLE_SPEED;
      const angle = isBackward ? Math.atan2(side, -fwd) : -Math.atan2(side, fwd);
      target = clamp(angle, -DEG(c.maxMoveTurn), DEG(c.maxMoveTurn));
    }
    facing = smoothDamp(facing, target, facingMotion, c.turnToMoveSeconds, dt);
    legWarp = warpBones.length > 0 ? clamp(facing, -DEG(c.legTurnLimit), DEG(c.legTurnLimit)) : 0;
    if (model) model.rotation.y = MODEL_FACING + facing - legWarp;
  }

  // 疊在動畫姿勢之上（mixer.update 之後）：每根骨頭繞世界的垂直軸轉。
  // 垂直軸換到父骨頭座標裡算；父骨頭本身也只繞垂直軸轉，所以先後順序不影響這個軸。
  function applyOrientationWarp(): void {
    if (!model || legWarp === 0) return;
    model.updateMatrixWorld(true);
    for (const { bone, share, restore } of warpBones) {
      if (!bone.parent) continue;
      restore.copy(bone.quaternion);
      bone.parent.getWorldQuaternion(parentRotation);
      warpAxis.copy(WORLD_UP).applyQuaternion(parentRotation.invert());
      bone.quaternion.premultiply(warpTurn.setFromAxisAngle(warpAxis, legWarp * share));
    }
    isWarpApplied = true;
  }

  // mixer 只在動畫值和上一格不同時才寫回骨頭（PropertyMixer.apply 的最佳化），
  // 不先還原的話，值沒變的那幾格扭轉會一直疊上去。
  function undoOrientationWarp(): void {
    if (!isWarpApplied) return;
    for (const { bone, restore } of warpBones) bone.quaternion.copy(restore);
    isWarpApplied = false;
  }

  // 骨頭名稱是 Unreal Mannequin 的；換成沒有這些骨頭的模型時不扭轉，只轉整個身體。
  function findWarpBones(root: THREE.Object3D): { bone: THREE.Object3D; share: number; restore: THREE.Quaternion }[] {
    const pelvis = root.getObjectByName(PELVIS_BONE);
    const spine = SPINE_COUNTER.map(([name, share]) => ({ bone: root.getObjectByName(name), share: -share }));
    if (!pelvis || spine.some(({ bone }) => !bone)) return [];
    return [{ bone: pelvis, share: 1 }, ...spine.flatMap(({ bone, share }) => (bone ? [{ bone, share }] : []))]
      .map(({ bone, share }) => ({ bone, share, restore: new THREE.Quaternion() }));
  }

  // 坐下：坐下動畫播完接坐著的循環；不想坐了就從目前的階段播站起來，播完回到站立。
  function updateSitPhase(motion: RigMotion): void {
    const isSitPhase = SIT_PHASES.includes(phase);
    if (motion.isSitting && motion.isGrounded && !isSitPhase && (phase === 'ground' || phase === 'land')) enterPhase('sitEnter', 'sitEnter');
    else if (phase === 'sitEnter' && isFinished('sitEnter')) enterPhase('sit', 'sitLoop');
    if (!motion.isSitting && (phase === 'sitEnter' || phase === 'sit')) enterPhase('sitExit', 'sitExit');
    else if (phase === 'sitExit' && isFinished('sitExit')) phase = 'ground';
    if (seat) seat.visible = SIT_PHASES.includes(phase);
  }

  function animateModel(motion: RigMotion, dt: number): void {
    phaseTime += dt;
    if (motion.isFlying) {
      if (phase !== 'fly') enterPhase('fly', 'fly');
      wasGrounded = false;
    } else if (phase === 'fly') {
      if (motion.isGrounded) enterPhase('land', 'jumpLand');
      else enterPhase('jumpLoop', 'jumpLoop');
      wasGrounded = motion.isGrounded;
    }
    if (motion.isGrounded !== wasGrounded) {
      if (motion.isGrounded) enterPhase('land', 'jumpLand');
      else enterPhase('jumpStart', 'jumpStart');
      wasGrounded = motion.isGrounded;
    }
    if (phase === 'jumpStart' && isFinished('jumpStart')) enterPhase('jumpLoop', 'jumpLoop');
    updateSitPhase(motion);
    const speed = Math.hypot(motion.forwardSpeed, motion.sideSpeed);
    const canLeaveLanding = isFinished('jumpLand') || (phaseTime >= config.character.landLockSeconds && speed > IDLE_SPEED);
    if (phase === 'land' && canLeaveLanding) phase = 'ground';
    const isPushing = motion.isGrounded && (motion.pushForward !== 0 || motion.pushSide !== 0);
    if (phase === 'ground' && isPushing) enterPhase('blocked', 'blocked');
    else if (phase === 'blocked' && !isPushing) phase = 'ground';
    fadeSlots(SLOT_OF_PHASE[phase], dt);
    applyWeights(updateLocomotion(motion, speed, dt));
    updateFacing(motion, speed, dt);
  }

  // 角色座標裡往前是 -Z、往右是 +X，往後退就是反方向。
  function applyPushBack(motion: RigMotion, dt: number): void {
    if (motion.pushForward !== 0 || motion.pushSide !== 0) Object.assign(pushDir, { forward: motion.pushForward, side: motion.pushSide });
    pushBack = smoothDamp(pushBack, motion.pushBack, pushBackMotion, PUSH_BACK_SMOOTH_TIME, dt);
    (model ?? block.root).position.set(-pushDir.side * pushBack, 0, pushDir.forward * pushBack);
  }

  function handReach(): HandReach {
    const clip = clips.get(config.character.clips.blocked);
    if (!model || !clip) return block.handReach();
    if (!handReaches.has(clip)) handReaches.set(clip, measureHandReach(model, clip));
    const reach = handReaches.get(clip);
    const scale = config.character.scale;
    return reach ? { forward: reach.forward * scale, height: reach.height * scale, slack: armChains.length > 0 ? IK_SLACK : 0 } : block.handReach();
  }

  // 從肩膀沿手伸出去的水平方向、在動畫裡手的高度找牆；找到就把目標設在牆面前 HAND_GAP。
  function findHandTarget(chain: LimbChain, findWall: WallProbe): boolean {
    chain.upper.getWorldPosition(ikShoulder);
    chain.lower.getWorldPosition(ikElbow);
    chain.hand.getWorldPosition(ikHand);
    const dirX = ikHand.x - ikShoulder.x;
    const dirZ = ikHand.z - ikShoulder.z;
    const length = Math.hypot(dirX, dirZ);
    if (length < EPSILON) return false;
    const armLength = ikShoulder.distanceTo(ikElbow) + ikElbow.distanceTo(ikHand);
    const hit = findWall(ikShoulder.x, ikHand.y, ikShoulder.z, dirX / length, dirZ / length, armLength + IK_REACH_MARGIN);
    if (!hit) return false;
    chain.target.set(
      ikShoulder.x + (dirX / length) * hit.distance + hit.nx * HAND_GAP,
      ikHand.y,
      ikShoulder.z + (dirZ / length) * hit.distance + hit.nz * HAND_GAP,
    );
    return true;
  }

  // 疊在動畫（與方向扭轉）之上：推牆時每隻手各自找牆面貼上去，權重淡入淡出；那隻手前面沒有牆就維持動畫。
  // 離開推牆時用最後一次的目標淡出。
  function applyHandIk(findWall: WallProbe | null, dt: number): void {
    const wantsIk = phase === 'blocked' && findWall !== null;
    ikWeight = smoothDamp(ikWeight, wantsIk ? 1 : 0, ikMotion, IK_SMOOTH_TIME, dt);
    if (!model || armChains.length === 0 || ikWeight < IK_MIN_WEIGHT) return;
    model.updateMatrixWorld(true);
    for (const chain of armChains) {
      if (wantsIk && findWall) chain.hasTarget = findHandTarget(chain, findWall);
      if (!chain.hasTarget) continue;
      chain.restoreUpper.copy(chain.upper.quaternion);
      chain.restoreLower.copy(chain.lower.quaternion);
      chain.isApplied = true;
      solveTwoBoneIk(chain, ikGoal.copy(chain.hand.getWorldPosition(ikHand)).lerp(chain.target, ikWeight));
    }
  }

  // 目標點相對於鏈根（髖、肩）：往下 reach × 鏈長，再加上往前、往外（outward 正的是離開身體中線）、往上 lift，
  // 最後被風往後帶 drag × floatDrag。
  function floatGoal(chain: LimbChain, reach: number, forward: number, outward: number, lift: number, drag: number): THREE.Vector3 {
    chain.upper.getWorldPosition(ikShoulder);
    chain.lower.getWorldPosition(ikElbow);
    chain.hand.getWorldPosition(ikHand);
    const length = ikShoulder.distanceTo(ikElbow) + ikElbow.distanceTo(ikHand);
    floatSide.subVectors(ikShoulder, floatCenter).addScaledVector(floatForward, -floatSide.dot(floatForward));
    floatSide.y = 0;
    if (floatSide.lengthSq() > 0) floatSide.normalize();
    ikGoal.copy(ikShoulder)
      .addScaledVector(floatDown, reach * length)
      .addScaledVector(floatForward, forward)
      .addScaledVector(floatSide, outward)
      .addScaledVector(WORLD_UP, lift)
      .addScaledVector(floatDrag, -drag);
    floatOffset.subVectors(ikGoal, ikShoulder);
    if (floatOffset.length() > FLOAT_REACH_MAX * length) ikGoal.copy(ikShoulder).addScaledVector(floatOffset, (FLOAT_REACH_MAX * length) / floatOffset.length());
    return ikGoal.lerp(ikHand, 1 - flyWeight);
  }

  // 飛行時身體從骨盆往水平行進方向傾（世界座標的轉軸換到骨盆父骨頭座標裡算），腿和手之後用 IK 往下垂，
  // 所以身體前傾時四肢自然落在後面。
  function applyFlyLean(): void {
    if (!model || !pelvisBone?.parent || Math.abs(leanPitch) + Math.abs(leanRoll) < IK_MIN_WEIGHT) return;
    model.updateMatrixWorld(true);
    model.getWorldDirection(floatForward).setY(0).normalize();
    leanRestore.copy(pelvisBone.quaternion);
    leanAxis.crossVectors(WORLD_UP, floatForward);   // 繞這個軸轉正角度，頭往前
    leanTurn.setFromAxisAngle(leanAxis, leanPitch);
    leanTurn.multiply(leanRollTurn.setFromAxisAngle(floatForward, leanRoll));   // 繞前方轉正角度，頭往右
    pelvisBone.parent.getWorldQuaternion(parentRotation);
    leanLocal.copy(parentRotation).invert().multiply(leanTurn).multiply(parentRotation);
    pelvisBone.quaternion.premultiply(leanLocal);
    isLeanApplied = true;
  }

  function undoFlyLean(): void {
    if (!isLeanApplied || !pelvisBone) return;
    pelvisBone.quaternion.copy(leanRestore);
    isLeanApplied = false;
  }

  // 四肢往下垂的方向跟著身體前傾轉 share 的比例。前傾角度是平滑過的，所以腿從垂直往下慢慢擺到身體後方。
  function tiltFloatDown(share: number): void {
    leanAxis.crossVectors(WORLD_UP, floatForward);
    floatTilt.setFromAxisAngle(leanAxis, leanPitch * share);
    floatTilt.multiply(leanRollTurn.setFromAxisAngle(floatForward, leanRoll * share));
    floatDown.set(0, -1, 0).applyQuaternion(floatTilt);
  }

  // 飛行時把站立動畫改成漂浮：腿併攏往下、膝蓋往前微彎；手往外張、手肘往後微彎。手臂若正在推牆 IK 就不動。
  // 次級動態：四肢浮動慢身體半拍、兩腳各自輕晃、被風往後帶；往上飛腿拉直，往下飛膝蓋縮、手往上浮。
  // 往前飛：腿跟著身體前傾擺到後方並伸直，和漂浮姿勢之間照平滑過的速度漸變。
  function applyFloatPose(): void {
    if (!model || flyWeight < IK_MIN_WEIGHT) return;
    model.updateMatrixWorld(true);
    model.getWorldDirection(floatForward).setY(0).normalize();
    model.getWorldPosition(floatCenter);
    floatRight.crossVectors(floatForward, WORLD_UP);
    floatDrag.copy(floatForward).multiplyScalar(cruiseForward).addScaledVector(floatRight, cruiseSide).multiplyScalar(FLY_DRAG);
    if (floatDrag.length() > FLY_DRAG_MAX) floatDrag.setLength(FLY_DRAG_MAX);
    const isCalm = reducedMotion.matches;
    const bobPhase = floatTime * FLOAT_BOB_RATE;
    const lag = isCalm ? 0 : FLOAT_BOB * (Math.sin(bobPhase - FLOAT_LIMB_LAG) - Math.sin(bobPhase));
    const rising = Math.max(0, climbBlend);
    const falling = Math.max(0, -climbBlend);
    const cruise = clamp(Math.hypot(cruiseForward, cruiseSide) / FLY_LEAN_SPEED, 0, 1);
    floatPole.copy(floatForward);
    tiltFloatDown(FLY_LEG_FOLLOW);
    legChains.forEach((chain, i) => {
      chain.restoreUpper.copy(chain.upper.quaternion);
      chain.restoreLower.copy(chain.lower.quaternion);
      chain.isApplied = true;
      const reach = FLOAT_LEG_REACH[i] + rising * FLY_CLIMB_LEG_STRETCH - falling * FLY_CLIMB_KNEE_TUCK + cruise * FLY_CRUISE_LEG_STRETCH;
      const sway = isCalm ? 0 : FLOAT_SWAY * Math.sin(floatTime * FLOAT_SWAY_RATES[i] + i * 2);
      solveTwoBoneIk(chain, floatGoal(chain, reach, FLOAT_LEG_FORWARD[i] + sway, -FLOAT_FEET_INWARD, lag, 1), floatPole);
    });
    floatPole.copy(floatForward).negate();
    tiltFloatDown(FLY_ARM_FOLLOW);
    for (const chain of armChains) {
      if (chain.isApplied) continue;
      chain.restoreUpper.copy(chain.upper.quaternion);
      chain.restoreLower.copy(chain.lower.quaternion);
      chain.isApplied = true;
      const reach = FLOAT_ARM_REACH - falling * FLY_CLIMB_ARM_LIFT;
      const outward = FLOAT_ARM_OUTWARD + falling * FLY_CLIMB_ARM_SPREAD;
      solveTwoBoneIk(chain, floatGoal(chain, reach, FLOAT_ARM_FORWARD, outward, lag, FLY_ARM_DRAG_SHARE), floatPole);
    }
  }

  function applyFootDroop(): void {
    if (!model || footChains.length === 0 || flyWeight < IK_MIN_WEIGHT) return;
    model.updateMatrixWorld(true);
    for (const chain of footChains) {
      chain.restore.copy(chain.foot.quaternion);
      chain.isApplied = true;
      droopFoot(chain, flyWeight);
    }
  }

  function undoFootDroop(): void {
    for (const chain of footChains) {
      if (!chain.isApplied) continue;
      chain.foot.quaternion.copy(chain.restore);
      chain.isApplied = false;
    }
  }

  function undoLimbIk(chains: LimbChain[]): void {
    for (const chain of chains) {
      if (!chain.isApplied) continue;
      chain.upper.quaternion.copy(chain.restoreUpper);
      chain.lower.quaternion.copy(chain.restoreLower);
      chain.isApplied = false;
    }
  }

  function animate(motion: RigMotion, dt: number): void {
    if (dt > 0) {
      applyPushBack(motion, dt);
      flyWeight = smoothDamp(flyWeight, motion.isFlying ? 1 : 0, flyMotion, FLY_SMOOTH_TIME, dt);
      floatTime += dt;
      const bob = reducedMotion.matches ? 0 : FLOAT_BOB * Math.sin(floatTime * FLOAT_BOB_RATE);
      (model ?? block.root).position.y = bob * flyWeight;
      cruiseForward = smoothDamp(cruiseForward, motion.isFlying ? motion.forwardSpeed : 0, cruiseForwardMotion, FLY_CRUISE_SMOOTH_TIME, dt);
      cruiseSide = smoothDamp(cruiseSide, motion.isFlying ? motion.sideSpeed : 0, cruiseSideMotion, FLY_CRUISE_SMOOTH_TIME, dt);
      const lean = (speed: number): number => clamp(speed / FLY_LEAN_SPEED, -1, 1) * DEG(FLY_LEAN_MAX);
      leanPitch = smoothDamp(leanPitch, lean(cruiseForward), leanPitchMotion, FLY_LEAN_SMOOTH_TIME, dt);
      leanRoll = smoothDamp(leanRoll, lean(cruiseSide) / 2, leanRollMotion, FLY_LEAN_SMOOTH_TIME, dt);
      const climb = motion.isFlying ? clamp(motion.climbSpeed / FLY_VERTICAL_SPEED, -1, 1) : 0;
      climbBlend = smoothDamp(climbBlend, climb, climbMotion, FLY_CLIMB_SMOOTH_TIME, dt);
    }
    if (!mixer) {
      block.animate(motion, dt);
      return;
    }
    if (dt <= 0) return;
    animateModel(motion, dt);
    undoFootDroop();
    undoLimbIk(legChains);
    undoLimbIk(armChains);
    undoFlyLean();
    undoOrientationWarp();
    mixer.update(dt);
    applyOrientationWarp();
    applyFlyLean();
    applyHandIk(motion.findWall, dt);
    applyFloatPose();
    applyFootDroop();
  }

  async function load(): Promise<string[]> {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    const names = gltf.animations.map((clip) => clip.name);
    const missing = CLIP_ROLES.map((role) => config.character.clips[role]).filter((name) => !names.includes(name));
    if (missing.length > 0) throw new Error(`${MODEL_URL} 裡沒有這些動畫片段：${missing.join('、')}`);
    model = gltf.scene;
    model.rotation.y = MODEL_FACING;
    scaleModel();
    warpBones = findWarpBones(model);
    armChains = findLimbChains(model, ARM_CHAINS);
    legChains = findLimbChains(model, LEG_CHAINS);
    pelvisBone = model.getObjectByName(PELVIS_BONE) ?? null;
    footChains = findFootChains(model);
    seat = addBox(model, materials.seat, SEAT_SIZE, SEAT_CENTER);
    seat.visible = false;
    clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
    for (const role of LOCOMOTION_ROLES) phaseOffset(clips.get(config.character.clips[role]) ?? gltf.animations[0]);
    root.remove(block.root);
    root.add(model);
    skeletonHelper = new THREE.SkeletonHelper(model);
    skeletonHelper.visible = false;
    scene.add(skeletonHelper);
    mixer = new THREE.AnimationMixer(model);
    applyWeights({ idle: 1, walk: 0, run: 0, sprint: 0 });
    return names;
  }

  // SkeletonHelper 要直接放在 scene 底下（它自己換算世界座標），所以跟著角色顯示與否要每格同步。
  function syncSkeletonHelper(): void {
    if (skeletonHelper) skeletonHelper.visible = config.character.showSkeleton && root.visible;
  }

  return { root, build, animate, handReach, load, syncSkeletonHelper };
}

// 第一人稱與第三人稱是同一個模式：鏡頭距離 0 是第一人稱，滾輪拉遠就從背後看到方塊角色。
function createFirstPersonMode(): ViewMode {
  const canvas = renderer.domElement;
  const body = new THREE.Vector3();   // 腳底中心的 x、z（高度用 feetY）
  const head = new THREE.Vector3();
  const lookDir = new THREE.Vector3();
  const cameraRay = new THREE.Raycaster();
  const rig = character;
  const avatar = rig.root;
  avatar.visible = false;
  scene.add(avatar);
  let avatarEyeHeight: number | null = null;
  let targetDistance = 0;               // 滾輪設定的距離
  let zoomDistance = 0;                 // 平滑後的滾輪距離
  let obstructionArm = config.camera.maxDistance;   // 障礙物允許的最遠距離（平滑後）
  const zoomMotion = { velocity: 0 };
  const armMotion = { velocity: 0 };
  const followMotion = { velocity: 0 };
  const pitchMotion = { velocity: 0 };
  const distanceMotion = { velocity: 0 };
  const sideDir = new THREE.Vector3();
  const upDir = new THREE.Vector3();
  const backDir = new THREE.Vector3();
  const probeOrigin = new THREE.Vector3();
  const hint = requireElement('#fp-hint', HTMLElement);
  const heldCodes = new Set<string>();
  const view = new THREE.Euler(0, 0, 0, 'YXZ');
  let isActive = false;
  let yaw = 0;            // 角色面向（移動方向）
  let cameraYaw = 0;      // 鏡頭水平方向；第一人稱時永遠等於 yaw
  let pitch = 0;
  let feetY = 0;
  let velocityY = 0;
  let isOnGround = true;
  let mouseButtons = 0;
  let lastPointer: { x: number; y: number } | null = null;
  let savedPose: PlayerPose | null = null;   // 上次離開時站的位置與朝向，再進來時接著走
  let isWalking = false;  // 預設跑步；按一下 Shift 切成走路，再按一下切回來
  let isBoosted = false;  // 按一下 Z 加速（跑步 × boost.run、飛行 × boost.fly），再按一下切回來
  let isSitting = false;  // 按 X 坐下（不在飛行時），再按 X 或按方向鍵、空白鍵站起來
  let standUpLock = 0;    // 站起來動畫還在播的秒數，這段時間不能移動
  let blockedSeconds = 0;  // 按著方向鍵卻幾乎沒移動，持續了多久
  let isFlying = false;
  let flySeconds = 0;      // 這次飛行已經飛了多久
  let flyClimbSpeed = 0;   // 這一格實際上升的速度（m/s），給漂浮姿勢用
  let lastJumpPress = -Infinity;   // 上一次按下空白鍵的時間（event.timeStamp，毫秒），判斷連按

  const isHeld = (action: KeyAction): boolean => [...heldCodes].some((code) => KEY_ACTIONS[code] === action);
  // 這一刻的移動速度（m/s）：走路不加速；飛行用加速倍率 boost.fly，地面跑步用 boost.run。
  const moveSpeed = (): number => {
    const { walkSpeed, runSpeed, boost } = config.character;
    if (isWalking) return isFlying && isBoosted ? walkSpeed * boost.fly : walkSpeed;
    if (!isBoosted) return runSpeed;
    return runSpeed * (isFlying ? boost.fly : boost.run);
  };
  const flyVerticalSpeed = (): number => FLY_VERTICAL_SPEED * (isBoosted ? config.character.boost.fly : 1);
  const isGrounded = (): boolean => isOnGround;
  const bodyHeight = (): number => eyeHeight() + HEAD_CLEARANCE;
  // 水平方向會擋的：頂面高過「能自動跨上的高度」、底面低於頭頂的方塊。
  const blocksBody = (solid: Solid): boolean =>
    solid.maxY > feetY + config.character.stepHeight && solid.minY < feetY + bodyHeight();
  // 站上去、撞頭用的腳印是方形（軸對齊方塊）；水平移動用圓形，見 slide。
  const overlapsAt = (box: THREE.Box3, x: number, z: number): boolean =>
    x + config.character.radius > box.min.x && x - config.character.radius < box.max.x && z + config.character.radius > box.min.z && z - config.character.radius < box.max.z;
  // 腳印（圓）有沒有碰到圓盤：離圓心的距離加減半徑落在內外緣之間。
  // 只有一段角度的圓盤（破碎的環）：圓心的角度要落在那段裡，腳印半徑換成角度當寬容。
  const overlapsDisc = (disc: Disc, x: number, z: number): boolean => {
    const distance = Math.hypot(x, z);
    if (distance + config.character.radius <= disc.inner || distance - config.character.radius >= disc.outer) return false;
    if (!disc.arc || distance === 0) return true;
    const fromStart = THREE.MathUtils.euclideanModulo(Math.atan2(x, z) - disc.arc.start, Math.PI * 2);
    const slack = config.character.radius / distance;
    return fromStart < disc.arc.length + slack || fromStart > Math.PI * 2 - slack;
  };
  // 這一刻會水平擋住身體的圓形障礙（倒圓錐、半球）半徑；腳底 stepHeight 以下的部分跨得上去，不算。
  const blockingRoundRadii = (): number[] => {
    const bottom = feetY + config.character.stepHeight;
    const top = feetY + bodyHeight();
    return [
      ...world.cones.map((cone) => coneWidestRadius(cone, bottom, top)),
      ...world.domes.map((dome) => domeWidestRadius(dome, bottom, top)),
    ].filter((radius): radius is number => radius !== null);
  };
  const isFree = (x: number, z: number): boolean =>
    !world.solids.some((solid) => blocksBody(solid) && circleOverlapsSolid(solid, x, z, config.character.radius)) &&
    !blockingRoundRadii().some((radius) => Math.hypot(x, z) < radius + config.character.radius);
  const dismissHint = (): void => { hint.hidden = true; };

  // collide-and-slide：腳印是圓（從上往下看的膠囊體）。沿位移掃掠，碰到就停在表面前 SKIN，
  // 剩下的位移去掉朝牆的分量、貼著牆面繼續走，最多 SLIDE_ITERATIONS 次。牆角會被推開繞過去，斜牆也滑得順。
  // 圓心已經在方塊裡的不擋（例如改設定後物件長在玩家身上），才走得出來。
  function slide(dx: number, dz: number): void {
    const r = config.character.radius;
    const solids = world.solids.filter((solid) => blocksBody(solid) && !circleOverlapsSolid(solid, body.x, body.z, 0));
    const coneRadii = blockingRoundRadii().filter((radius) => Math.hypot(body.x, body.z) >= radius);
    let restX = dx;
    let restZ = dz;
    for (let i = 0; i < SLIDE_ITERATIONS; i++) {
      const length = Math.hypot(restX, restZ);
      if (length < MIN_SLIDE) return;
      let hit: SweepHit | null = null;
      for (const solid of solids) {
        const candidate = sweepCircle(solid, body.x, body.z, restX, restZ, r);
        if (candidate && (!hit || candidate.t < hit.t)) hit = candidate;
      }
      for (const radius of coneRadii) {
        const candidate = sweepRound(radius, body.x, body.z, restX, restZ, r);
        if (candidate && (!hit || candidate.t < hit.t)) hit = candidate;
      }
      if (!hit) {
        body.x += restX;
        body.z += restZ;
        return;
      }
      const travel = Math.max(0, hit.t - SKIN / length);
      body.x += restX * travel;
      body.z += restZ * travel;
      restX *= 1 - travel;
      restZ *= 1 - travel;
      const into = restX * hit.nx + restZ * hit.nz;
      if (into < 0) {
        restX -= into * hit.nx;
        restZ -= into * hit.nz;
      }
    }
  }

  // 站在 scene.spawn（預設在第一圈環上、面向北看著中央）；那裡被佔了就找最近的空位。
  // 高度是那個位置最高的表面：環和平台懸在空中，從地面開始的話會掉在環底下。
  function findSpawn(): PlayerPose {
    const { x, z, facing } = config.scene.spawn;
    const offset = [{ dx: 0, dz: 0 }, ...SEARCH_OFFSETS].find(({ dx, dz }) => isFree(x + dx, z + dz)) ?? { dx: 0, dz: 0 };
    const spawnX = x + offset.dx;
    const spawnZ = z + offset.dz;
    return { x: spawnX, z: spawnZ, yaw: DEG(facing), pitch: 0, feetY: supportHeight(spawnX, spawnZ, Infinity) };
  }

  // 快速連按兩下進入飛行（第一下照常起跳）；飛行中空白鍵改成上升，由 updateFlying 讀按住的鍵。
  // 按住不放的 repeat 不算連按，但站在地上時照舊可以一直跳。
  // X 在飛行時是下降（updateFlying 讀按住的鍵），站在地上時切換坐下／站起來。
  function toggleSit(): void {
    if (isFlying) return;
    if (isSitting) {
      standUp();
      return;
    }
    if (!isOnGround || standUpLock > 0) return;
    isSitting = true;
  }

  function standUp(): void {
    if (!isSitting) return;
    isSitting = false;
    standUpLock = SIT_EXIT_LOCK_SECONDS;
  }

  function onJumpKey(event: KeyboardEvent): void {
    if (isSitting || standUpLock > 0) {
      standUp();
      return;
    }
    const isDoubleTap = !event.repeat && event.timeStamp - lastJumpPress < DOUBLE_TAP_MS;
    if (!event.repeat) lastJumpPress = isDoubleTap ? -Infinity : event.timeStamp;
    if (isFlying) return;
    if (isDoubleTap) {
      isFlying = true;
      flySeconds = 0;
      isOnGround = false;
      velocityY = 0;
      return;
    }
    if (!isGrounded()) return;
    velocityY = Math.sqrt(2 * config.character.gravity * config.character.jumpHeight);
    isOnGround = false;
  }

  function onKeyChange(event: KeyboardEvent): void {
    const action = KEY_ACTIONS[event.code];
    if (!isActive || !action) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    event.preventDefault();
    if (event.type === 'keyup') {
      heldCodes.delete(event.code);
      return;
    }
    heldCodes.add(event.code);
    // 按住不放時瀏覽器會連續送 keydown（repeat），只認第一下，不然會一直來回切換
    if (action === 'toggleWalk' && !event.repeat) isWalking = !isWalking;
    if (action === 'toggleBoost' && !event.repeat) isBoosted = !isBoosted;
    if (action === 'descend' && !event.repeat) toggleSit();
    if (action === 'jump') onJumpKey(event);
    dismissHint();
  }

  // 拖曳畫面轉視角（左右鍵都可以）；buttons 記住目前按著哪些鍵，右鍵會讓 A／D 變平移。
  const isThirdPerson = (): boolean => targetDistance > 0;
  // 第三人稱只按左鍵：只轉鏡頭、角色面向不變，可以繞到前面看角色正面。
  // 有按右鍵（或第一人稱）：角色跟著鏡頭轉，移動方向也跟著改。
  const isOrbitingCamera = (): boolean => isThirdPerson() && (mouseButtons & MOUSE_LEFT) !== 0 && (mouseButtons & MOUSE_RIGHT) === 0;

  // 剛按下右鍵時，角色先轉到鏡頭看的方向，之後拖曳就一起轉。
  function setMouseButtons(buttons: number): void {
    const isRightPressed = (buttons & MOUSE_RIGHT) !== 0 && (mouseButtons & MOUSE_RIGHT) === 0;
    mouseButtons = buttons;
    if (isRightPressed) yaw = cameraYaw;
  }

  // 位移用 clientX／Y 自己算：movementX 在部分瀏覽器和合成事件裡可能沒有值，會讓視角變成 NaN。
  function onPointerDown(event: PointerEvent): void {
    if (!isActive) return;
    setMouseButtons(event.buttons);
    lastPointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    setCursor('grabbing');
    dismissHint();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!isActive) return;
    setMouseButtons(event.buttons);
    if (!mouseButtons || !lastPointer) return;
    const deltaYaw = -(event.clientX - lastPointer.x) * config.camera.lookSensitivity;
    if (isOrbitingCamera()) {
      cameraYaw += deltaYaw;
    } else {
      yaw += deltaYaw;
      cameraYaw = yaw;
    }
    pitch = clamp(pitch - (event.clientY - lastPointer.y) * config.camera.lookSensitivity, -DEG(config.camera.maxPitch), DEG(config.camera.maxPitch));
    lastPointer = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: PointerEvent): void {
    if (!isActive) return;
    setMouseButtons(event.buttons);
    if (mouseButtons) return;
    lastPointer = null;
    setCursor('grab');
  }

  addEventListener('keydown', onKeyChange);
  addEventListener('keyup', onKeyChange);
  addEventListener('blur', () => {
    heldCodes.clear();
    mouseButtons = 0;
  });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', (event) => { if (isActive) event.preventDefault(); });

  // 角色身高跟著眼睛高度；改設定時整個重建。
  function buildAvatar(): void {
    rig.build(eyeHeight());
    avatarEyeHeight = eyeHeight();
  }

  function zoom(deltaY: number): void {
    let next = targetDistance + deltaY * config.camera.zoomPerWheel;
    if (deltaY > 0 && targetDistance === 0) next = config.camera.thirdPerson.distance;   // 從第一人稱往後滾，一格就到預設距離
    else if (deltaY > 0) next = Math.max(next, config.camera.minDistance);
    else if (next < config.camera.minDistance) next = 0;
    targetDistance = clamp(next, 0, config.camera.maxDistance);
    distanceMotion.velocity = 0;
  }

  canvas.addEventListener('wheel', (event) => {
    if (!isActive) return;
    event.preventDefault();
    zoom(event.deltaY);
    dismissHint();
  }, { passive: false });

  // 停止追目標時不急停：速度按 FOLLOW_COAST_DAMPING 衰減，數值再滑一小段。
  function coast(value: number, motion: Motion, dt: number): number {
    motion.velocity *= Math.exp(-FOLLOW_COAST_DAMPING * dt);
    return value + motion.velocity * dt;
  }

  // 滑鼠沒抓著畫面時：
  // - 第一人稱往前走 → 視線平滑回到水平（被拖去看天空或地板時）；
  // - 第三人稱移動或轉身 → 鏡頭水平方向平滑轉回角色背後；
  // - 第三人稱往前走 → 距離與俯仰角也平滑回到 config.camera.thirdPerson 的預設。
  function followCharacter(dt: number, isMoving: boolean, isMovingForward: boolean): void {
    const motions = [followMotion, pitchMotion, distanceMotion];
    if (!isThirdPerson()) {
      cameraYaw = yaw;
      followMotion.velocity = 0;
      distanceMotion.velocity = 0;
      if (mouseButtons === 0 && isMovingForward) pitch = smoothDamp(pitch, 0, pitchMotion, config.camera.resetSmoothTime, dt);
      else if (mouseButtons === 0) pitch = clamp(coast(pitch, pitchMotion, dt), -DEG(config.camera.maxPitch), DEG(config.camera.maxPitch));
      else pitchMotion.velocity = 0;
      return;
    }
    if (mouseButtons !== 0) {
      for (const motion of motions) motion.velocity = 0;
      return;
    }
    if (isMoving) cameraYaw = smoothDamp(cameraYaw, cameraYaw + wrapAngle(yaw - cameraYaw), followMotion, config.camera.followSmoothTime, dt);
    else cameraYaw = coast(cameraYaw, followMotion, dt);
    if (isMovingForward) {
      const preset = config.camera.thirdPerson;
      pitch = smoothDamp(pitch, THREE.MathUtils.degToRad(preset.pitch), pitchMotion, config.camera.resetSmoothTime, dt);
      targetDistance = smoothDamp(targetDistance, preset.distance, distanceMotion, config.camera.resetSmoothTime, dt);
    } else {
      pitch = clamp(coast(pitch, pitchMotion, dt), -DEG(config.camera.maxPitch), DEG(config.camera.maxPitch));
      targetDistance = clamp(coast(targetDistance, distanceMotion, dt), config.camera.minDistance, config.camera.maxDistance);
    }
  }

  // 從支點往鏡頭方向打 5 條平行射線（中心＋上下左右）。
  // center 是鏡頭本身那條視線（超過它才會看穿）；nearest 是 5 條裡最近的（用來提早、平滑地拉近）。
  function probeObstruction(maxDistance: number): { center: number; nearest: number } {
    sideDir.set(1, 0, 0).applyQuaternion(camera.quaternion);
    upDir.set(0, 1, 0).applyQuaternion(camera.quaternion);
    backDir.copy(lookDir).negate();
    const result = { center: Infinity, nearest: Infinity };
    for (const [sx, sy] of PROBE_OFFSETS) {
      probeOrigin.copy(head).addScaledVector(sideDir, sx * CAMERA_PROBE_RADIUS).addScaledVector(upDir, sy * CAMERA_PROBE_RADIUS);
      cameraRay.set(probeOrigin, backDir);
      cameraRay.far = maxDistance;
      const hit = cameraRay.intersectObjects([world.room], true)[0];
      if (!hit) continue;
      result.nearest = Math.min(result.nearest, hit.distance);
      if (sx === 0 && sy === 0) result.center = hit.distance;
    }
    return result;
  }

  // 鏡頭在支點正後方（沿視線反方向）。第三人稱時支點抬到頭頂上方，視線越過角色；越近抬得越少，切換時不會跳。
  // 距離 = min(滾輪距離, 障礙物允許距離)，兩者各自平滑；只有中心視線快要看穿時才硬性卡住，
  // 旁邊的探測線擦到門框只會平滑拉近，不會一格內跳到第一人稱。
  function placeCamera(dt: number): void {
    zoomDistance = smoothDamp(zoomDistance, targetDistance, zoomMotion, config.camera.zoomSmoothTime, dt);
    const lift = config.camera.thirdPerson.height * Math.min(1, zoomDistance / config.camera.minDistance);
    head.set(body.x, feetY + eyeHeight() + lift, body.z);
    camera.quaternion.setFromEuler(view.set(pitch, cameraYaw, 0));
    lookDir.set(0, 0, -1).applyQuaternion(camera.quaternion);

    const probe = zoomDistance > 0 ? probeObstruction(config.camera.maxDistance + CAMERA_WALL_MARGIN) : { center: Infinity, nearest: Infinity };
    const armTarget = Math.min(config.camera.maxDistance, probe.nearest - CAMERA_WALL_MARGIN);
    const smoothTime = armTarget < obstructionArm ? config.camera.obstructSmoothTime : config.camera.releaseSmoothTime;
    obstructionArm = smoothDamp(obstructionArm, armTarget, armMotion, smoothTime, dt);
    const hardLimit = probe.center - CAMERA_NEAR_GAP;
    if (obstructionArm > hardLimit) {
      obstructionArm = hardLimit;
      armMotion.velocity = 0;
    }
    const distance = clamp(Math.min(zoomDistance, obstructionArm), 0, config.camera.maxDistance);

    camera.position.copy(head).addScaledVector(lookDir, -distance);
    if (avatarEyeHeight !== eyeHeight()) buildAvatar();
    avatar.position.set(body.x, feetY, body.z);
    avatar.rotation.y = yaw;
    avatar.visible = distance > AVATAR_VISIBLE_DISTANCE;
  }

  // 腳底範圍內、頂面不高於 maxTop 的最高表面（地面是 0）：站得上去的地方。
  function supportHeight(x: number, z: number, maxTop: number): number {
    let height = 0;
    for (const box of world.colliders) {
      if (box.max.y <= maxTop + SURFACE_EPSILON && box.max.y > height && overlapsAt(box, x, z)) height = box.max.y;
    }
    // 樓梯的斜面：腳底範圍碰到就用中心點的高度，走起來是連續爬升，不會一階一階彈。
    const r = config.character.radius;
    for (const ramp of world.ramps) {
      if (x + r <= ramp.minX || x - r >= ramp.maxX || z + r <= ramp.minZ || z - r >= ramp.maxZ) continue;
      const rampTop = rampHeightAt(ramp, x, z);
      if (rampTop <= maxTop + SURFACE_EPSILON && rampTop > height) height = rampTop;
    }
    for (const disc of world.discs) {
      if (disc.maxY <= maxTop + SURFACE_EPSILON && disc.maxY > height && overlapsDisc(disc, x, z)) height = disc.maxY;
    }
    // 半球：腳印（圓）最靠近球心那一點下面的球面最高。
    for (const dome of world.domes) {
      const reach = Math.max(0, Math.hypot(x, z) - r);
      if (reach >= dome.radius) continue;
      const domeTop = dome.baseY + Math.sqrt(dome.radius * dome.radius - reach * reach);
      if (domeTop <= maxTop + SURFACE_EPSILON && domeTop > height) height = domeTop;
    }
    return height;
  }

  // 往上時最先碰到的底面（頭頂上方、這一格會穿過的），沒有就是 Infinity。
  function ceilingHeight(x: number, z: number, fromHead: number, toHead: number): number {
    let height = Infinity;
    for (const box of world.colliders) {
      if (box.min.y >= fromHead - SURFACE_EPSILON && box.min.y < toHead && box.min.y < height && overlapsAt(box, x, z)) height = box.min.y;
    }
    for (const disc of world.discs) {
      if (disc.minY >= fromHead - SURFACE_EPSILON && disc.minY < toHead && disc.minY < height && overlapsDisc(disc, x, z)) height = disc.minY;
    }
    // 倒圓錐的底面是斜的：頭頂（圓）最先碰到的是靠圓錐那一側的邊緣，離圓心 distance - radius 的那一點。
    for (const cone of world.cones) {
      const reach = Math.max(0, Math.hypot(x, z) - config.character.radius);
      if (reach >= cone.topRadius) continue;
      const surfaceY = cone.tipY + (reach / cone.topRadius) * (cone.topY - cone.tipY);
      if (surfaceY >= fromHead - SURFACE_EPSILON && surfaceY < toHead && surfaceY < height) height = surfaceY;
    }
    return height;
  }

  // 垂直方向：站著時跟著腳下的表面上下（差在 stepHeight 內直接貼過去，像走樓梯），
  // 腳下突然空掉就開始掉；在空中受重力，落到表面就停，往上撞到底面就不再上升。
  // 飛行：沒有重力，空白鍵往上（撞到天花板停住）、X 往下。腳底碰到站得上去的表面（往下降到，
  // 或平飛時腳下的高度差在 stepHeight 內）就解除飛行站上去，角色播落地動作；往上飛時碰到只把腳墊高。
  function updateFlying(dt: number): void {
    flySeconds += dt;
    velocityY = 0;
    const rise = (Number(isHeld('jump')) - Number(isHeld('descend'))) * flyVerticalSpeed() + mouseFlyRise();
    const climb = Math.sign(rise);
    const previous = feetY;
    const nextY = feetY + rise * dt;
    if (climb > 0) {
      const ceiling = ceilingHeight(body.x, body.z, feetY + bodyHeight(), nextY + bodyHeight());
      feetY = Math.max(previous, Math.min(nextY, ceiling - bodyHeight()));
    } else {
      feetY = nextY;
    }
    flyClimbSpeed = dt > 0 ? (feetY - previous) / dt : 0;
    const support = supportHeight(body.x, body.z, previous + config.character.stepHeight);
    if (support < feetY) return;
    feetY = support;
    if (climb > 0 || (climb === 0 && flySeconds < FLY_LAND_GRACE)) return;
    isFlying = false;
    isOnGround = true;
  }

  // 滑鼠左右鍵一起按著往前飛時，順著鏡頭的俯仰升降：往上看就往上、往下看就往下（m/s）。
  // 平視的角度第一人稱是 0、第三人稱是預設俯角；離平視 FLY_PITCH_DEADZONE 內不升降，平飛時不會慢慢飄。
  function mouseFlyRise(): number {
    if ((mouseButtons & MOUSE_LEFT) === 0 || (mouseButtons & MOUSE_RIGHT) === 0) return 0;
    const level = isThirdPerson() ? DEG(config.camera.thirdPerson.pitch) : 0;
    const offset = pitch - level;
    const tilt = Math.sign(offset) * Math.max(0, Math.abs(offset) - DEG(FLY_PITCH_DEADZONE));
    return moveSpeed() * Math.sin(tilt);
  }

  function updateVertical(dt: number): void {
    if (isFlying) {
      updateFlying(dt);
      return;
    }
    const { stepHeight, gravity } = config.character;
    if (isOnGround) {
      const support = supportHeight(body.x, body.z, feetY + stepHeight);
      if (support >= feetY - stepHeight) {
        feetY = support;
        return;
      }
      isOnGround = false;
      velocityY = 0;
    }
    velocityY -= gravity * dt;
    const nextY = feetY + velocityY * dt;
    if (velocityY > 0) {
      const ceiling = ceilingHeight(body.x, body.z, feetY + bodyHeight(), nextY + bodyHeight());
      feetY = Math.min(nextY, ceiling - bodyHeight());
      if (ceiling < Infinity && nextY + bodyHeight() >= ceiling) velocityY = 0;
      return;
    }
    const support = supportHeight(body.x, body.z, feetY);
    if (nextY <= support) {
      feetY = support;
      velocityY = 0;
      isOnGround = true;
      return;
    }
    feetY = nextY;
  }

  // 半徑 0 的掃掠就是射線；斜牆也量得準。推牆判斷和手部 IK 共用。
  const findWall: WallProbe = (x, y, z, dirX, dirZ, maxDistance) => {
    let nearest: { distance: number; nx: number; nz: number } | null = null;
    for (const solid of world.solids) {
      if (y < solid.minY || y > solid.maxY) continue;
      const hit = sweepCircle(solid, x, z, dirX * maxDistance, dirZ * maxDistance, 0);
      if (hit && (!nearest || hit.t * maxDistance < nearest.distance)) nearest = { distance: hit.t * maxDistance, nx: hit.nx, nz: hit.nz };
    }
    for (const cone of world.cones) {
      if (y < cone.tipY || y > cone.topY) continue;
      const radius = (cone.topRadius * (y - cone.tipY)) / (cone.topY - cone.tipY);
      const hit = sweepRound(radius, x, z, dirX * maxDistance, dirZ * maxDistance, 0);
      if (hit && (!nearest || hit.t * maxDistance < nearest.distance)) nearest = { distance: hit.t * maxDistance, nx: hit.nx, nz: hit.nz };
    }
    return nearest;
  };

  // 被擋住時，在推牆動畫手的高度往前探：有牆面才推，手往後退到剛好貼著；
  // 手的高度是空的（窗洞、只到腰的欄杆或矮家具）就不推，維持站著。
  function pushTarget(push: { forward: number; right: number } | null): { forward: number; right: number; back: number } | null {
    if (!push) return null;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const dirX = -sin * push.forward + cos * push.right;
    const dirZ = -cos * push.forward - sin * push.right;
    const reach = rig.handReach();
    const hit = findWall(body.x, feetY + reach.height, body.z, dirX, dirZ, reach.forward + HAND_PROBE_MARGIN);
    if (!hit) return null;
    return { ...push, back: Math.max(0, reach.forward + HAND_GAP - reach.slack - hit.distance) };
  }

  // 實際位移轉成角色座標的前後／左右速度，交給方塊人決定步伐。
  // push 是被擋住時想走的方向（角色座標：forward 往前、right 往右）與畫面要往後退多少，沒被擋住是 null。
  function animateAvatar(dx: number, dz: number, turn: number, push: { forward: number; right: number; back: number } | null, dt: number): void {
    if (dt <= 0) return;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    rig.animate({
      forwardSpeed: (-sin * dx - cos * dz) / dt,
      sideSpeed: (cos * dx - sin * dz) / dt,
      turnRate: turn * DEG(config.character.turnSpeed),
      isGrounded: isGrounded(),
      riseRatio: velocityY / Math.sqrt(2 * config.character.gravity * config.character.jumpHeight),
      pushForward: push?.forward ?? 0,
      pushSide: push?.right ?? 0,
      pushBack: push?.back ?? 0,
      findWall: push ? findWall : null,
      isFlying,
      climbSpeed: isFlying ? flyClimbSpeed : 0,
      isSitting,
    }, dt);
  }

  // 有方向輸入、站在地上，實際速度卻遠低於想走的速度，連續 BLOCKED_DELAY 秒就回傳想走的方向。
  function detectPush(forward: number, right: number, moved: number, dt: number): { forward: number; right: number } | null {
    const length = Math.hypot(forward, right);
    const intended = moveSpeed();
    const isStuck = length > 0 && isOnGround && dt > 0 && moved / dt < intended * BLOCKED_SPEED_RATIO;
    blockedSeconds = isStuck ? blockedSeconds + dt : 0;
    return blockedSeconds >= BLOCKED_DELAY ? { forward: forward / length, right: right / length } : null;
  }

  function walk(forward: number, right: number, dt: number): void {
    const length = Math.hypot(right, forward);
    if (length === 0) return;
    dismissHint();
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const step = (moveSpeed() * dt) / length;
    const dx = (-sin * forward + cos * right) * step;
    const dz = (-cos * forward - sin * right) * step;
    const substeps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_SUBSTEP));
    for (let i = 0; i < substeps; i++) slide(dx / substeps, dz / substeps);
  }

  return {
    enter() {
      isActive = true;
      feetY = savedPose?.feetY ?? 0;
      const pose = savedPose && isFree(savedPose.x, savedPose.z) ? savedPose : findSpawn();
      ({ yaw, pitch } = pose);
      cameraYaw = yaw;
      feetY = pose.feetY ?? 0;
      velocityY = 0;
      isOnGround = false;   // 第一格由 updateVertical 找腳下的表面，落在正確的高度
      body.set(pose.x, 0, pose.z);
      targetDistance = pose.distance ?? config.camera.thirdPerson.distance;   // 第一次進來用第三人稱預設距離
      zoomDistance = targetDistance;
      obstructionArm = config.camera.maxDistance;
      for (const motion of [zoomMotion, armMotion, followMotion, pitchMotion, distanceMotion]) motion.velocity = 0;
      placeCamera(0);
      camera.fov = config.camera.firstPersonFov;
      camera.updateProjectionMatrix();
      hint.hidden = false;
      setCursor('grab');
    },
    exit() {
      isActive = false;
      savedPose = { x: body.x, z: body.z, yaw, pitch, distance: targetDistance, feetY };
      avatar.visible = false;
      heldCodes.clear();
      mouseButtons = 0;
      hint.hidden = true;
      camera.fov = ORBIT_FOV;
      camera.updateProjectionMatrix();
      setCursor('');
    },
    update(dt: number) {
      const isRightHeld = (mouseButtons & MOUSE_RIGHT) !== 0;
      const isBothHeld = isRightHeld && (mouseButtons & MOUSE_LEFT) !== 0;
      const isTurnLeftHeld = isHeld('turnLeft');
      const isTurnRightHeld = isHeld('turnRight');
      // 按住右鍵時 A／D 改成平移，和轉視角的滑鼠不打架。
      const turn = isRightHeld ? 0 : Number(isTurnLeftHeld) - Number(isTurnRightHeld);
      let right = Number(isHeld('strafeRight')) - Number(isHeld('strafeLeft'));
      if (isRightHeld) right += Number(isTurnRightHeld) - Number(isTurnLeftHeld);
      let forward = clamp(Number(isHeld('forward')) - Number(isHeld('back')) + Number(isBothHeld), -1, 1);
      right = clamp(right, -1, 1);
      // 坐著時按方向鍵就站起來；站起來的動畫播完前原地不動。
      if (isSitting && (forward !== 0 || right !== 0 || turn !== 0)) standUp();
      standUpLock = Math.max(0, standUpLock - dt);
      if (isSitting || standUpLock > 0) {
        forward = 0;
        right = 0;
      }

      // 鍵盤轉身時鏡頭同步轉（沒抓著畫面時），不經過平滑；平滑只負責收回左鍵轉開的那段角度。
      const turnDelta = (isSitting || standUpLock > 0 ? 0 : turn) * THREE.MathUtils.degToRad(config.character.turnSpeed) * dt;
      yaw += turnDelta;
      if (mouseButtons === 0) cameraYaw += turnDelta;
      const startX = body.x;
      const startZ = body.z;
      walk(forward, right, dt);
      updateVertical(dt);
      const push = pushTarget(detectPush(forward, right, Math.hypot(body.x - startX, body.z - startZ), dt));
      animateAvatar(body.x - startX, body.z - startZ, turn, push, dt);
      followCharacter(dt, turn !== 0 || forward !== 0 || right !== 0, forward > 0);
      placeCamera(dt);
    },
    setInputLocked() {},
  };
}

const character = createCharacter();
const viewModes: Record<ViewModeName, ViewMode> = { orbit: createOrbitMode(), firstPerson: createFirstPersonMode() };
let activeMode: ViewMode | null = null;
let activeModeName: ViewModeName = 'orbit';
// 啟動時 setViewMode('orbit') 之後一定有值；在那之前沒有任何輸入或畫格會用到。
const currentMode = (): ViewMode => activeMode ?? viewModes.orbit;
function setViewMode(name: ViewModeName): void {
  activeMode?.exit();
  activeMode = viewModes[name];
  activeModeName = name;
  activeMode.enter();
  for (const list of document.querySelectorAll('[data-view]')) {
    if (list instanceof HTMLElement) list.hidden = list.dataset.view !== name;
  }
}

// ================= 7. Inspector（lil-gui） =================
// 仿 Unity Inspector：分成場景／角色／鏡頭三組，改的就是 config（也就是 scene.config.json 的內容）。
// 「儲存」只在 vite dev 有（寫回 JSON 的外掛在 vite.config.ts），打包後整段被移除。
const SAVE_FEEDBACK_MS = 1500;
const CLIP_ROLE_NAMES: Record<ClipRole, string> = {
  idle: '站立', walk: '走路', run: '跑步', sprint: '衝刺', jumpStart: '起跳', jumpLoop: '空中', jumpLand: '落地', blocked: '受阻', fly: '飛行',
  sitEnter: '坐下', sitLoop: '坐著', sitExit: '站起來',
};
let clipNames: string[] = [];
// 「還原預設」回到上次儲存的內容（還沒存過就是開頁面時讀到的 JSON）。
let savedSnapshot: SceneConfig = structuredClone(config);

// 地面大小在這裡調；之後加的空間設定也放這組。
function addSceneGroup(panel: GUI): void {
  const group = panel.addFolder('場景');
  group.add(config.scene, 'groundSize', 200, 3000, 50).name('地面邊長（m）').onChange(rebuildScene);
  const center = group.addFolder('中央倒圓錐');
  center.add(config.scene.center, 'topRadius', 10, 200, 1).name('平台半徑（m）').onChange(rebuildScene);
  center.add(config.scene.center, 'topY', 10, 400, 1).name('平台高度（m）').onChange(rebuildScene);
  center.add(config.scene.center, 'height', 10, 300, 1).name('錐高（m）').onChange(rebuildScene);
  const rings = group.addFolder('懸空同心環');
  rings.add(config.scene.rings, 'clearance', 0, 200, 1).name('離圓錐距離（m）').onChange(rebuildScene);
  rings.add(config.scene.rings, 'width', 5, 100, 1).name('每圈寬（m）').onChange(rebuildScene);
  rings.add(config.scene.rings, 'thickness', 0.5, 20, 0.5).name('厚度（m）').onChange(rebuildScene);
  config.scene.rings.layers.forEach((layer, i) => {
    const folder = rings.addFolder(`第 ${i + 1} 層`);
    folder.add(layer, 'style', RING_STYLES).name('樣式').onChange(rebuildScene);
    folder.add(layer, 'gap', 2, 80, 1).name('離上一層（m）').onChange(rebuildScene);
    folder.close();
  });
  const floaters = group.addFolder('周圍漂浮物');
  floaters.add(config.scene.floaters, 'clusters', 0, 20, 1).name('聚集處').onChange(rebuildScene);
  floaters.add(config.scene.floaters, 'islands', 0, 80, 1).name('島嶼').onChange(rebuildScene);
  floaters.add(config.scene.floaters, 'platforms', 0, 80, 1).name('平台').onChange(rebuildScene);
  floaters.add(config.scene.floaters, 'hexPads', 0, 80, 1).name('蜂窩平面').onChange(rebuildScene);
  floaters.add(config.scene.floaters, 'debris', 0, 400, 10).name('零碎小塊').onChange(rebuildScene);
  floaters.add(config.scene.floaters, 'bobScale', 0, 3, 0.1).name('飄動幅度倍率').onChange(rebuildScene);
  group.close();
}

// 動畫名稱要等模型載入後才知道有哪些，下拉選單晚一點才加；重建面板時用記下來的名單。
function addClipControllers(parent: GUI): void {
  if (clipNames.length === 0) return;
  const clips = parent.addFolder('動畫片段');
  for (const role of CLIP_ROLES) clips.add(config.character.clips, role, clipNames).name(CLIP_ROLE_NAMES[role]);
  clips.close();
}

let animationFolder: GUI | null = null;

function addCharacterGroup(panel: GUI): void {
  const c = config.character;
  const group = panel.addFolder('角色');
  group.add(c, 'scale', 0.5, 1.5, 0.01).name('縮放');
  group.add(c, 'radius', 0.1, 0.45, 0.01).name('碰撞半徑（m）');
  group.add(c, 'stepHeight', 0, 0.6, 0.01).name('自動跨上高度（m）');
  group.add(c, 'walkSpeed', 0.5, 4, 0.1).name('走路（m/s）');
  group.add(c, 'runSpeed', 1, 8, 0.1).name('跑步（m/s）');
  group.add(c.boost, 'run', 1, 10, 0.5).name('Z 加速：跑步倍率');
  group.add(c.boost, 'fly', 1, 20, 0.5).name('Z 加速：飛行倍率');
  group.add(c, 'turnSpeed', 60, 360, 10).name('轉身（度/秒）');
  group.add(c, 'jumpHeight', 0.1, 1.5, 0.05).name('跳躍高度（m）');
  group.add(c, 'gravity', 1, 30, 0.1).name('重力（m/s²）');
  group.add(c, 'turnToMoveSeconds', 0.02, 1, 0.01).name('轉向移動方向（秒）');
  group.add(c, 'maxMoveTurn', 0, 90, 1).name('轉向上限（度）');
  group.add(c, 'legTurnLimit', 0, 90, 1).name('下半身轉向上限（度）');
  animationFolder = group.addFolder('動畫');
  animationFolder.add(c, 'fadeSeconds', 0, 1, 0.05).name('過渡（秒）');
  animationFolder.add(c.clipSpeeds, 'walk', 0.3, 3, 0.01).name('走路動畫原速（m/s）');
  animationFolder.add(c.clipSpeeds, 'run', 1, 8, 0.01).name('跑步動畫原速（m/s）');
  animationFolder.add(c.clipSpeeds, 'sprint', 2, 15, 0.01).name('衝刺動畫原速（m/s）');
  animationFolder.add(c, 'landLockSeconds', 0, 1.2, 0.05).name('落地硬直（秒）');
  animationFolder.add(c, 'showSkeleton').name('顯示骨架');
  addClipControllers(animationFolder);
  group.close();
}

function applyFirstPersonFov(): void {
  if (activeModeName !== 'firstPerson') return;
  camera.fov = config.camera.firstPersonFov;
  camera.updateProjectionMatrix();
}

function addCameraGroup(panel: GUI): void {
  const cam = config.camera;
  const group = panel.addFolder('鏡頭');
  const preset = group.addFolder('第三人稱預設視角');
  preset.add(cam.thirdPerson, 'distance', cam.minDistance, cam.maxDistance, 0.1).name('距離（m）');
  preset.add(cam.thirdPerson, 'pitch', -45, 20, 1).name('俯仰（度）');
  preset.add(cam.thirdPerson, 'height', 0, 0.6, 0.05).name('鏡頭高度（m）');
  group.add(cam, 'firstPersonFov', 40, 100, 1).name('第一人稱視角（度）').onChange(applyFirstPersonFov);
  group.add(cam, 'lookSensitivity', 0.001, 0.01, 0.0005).name('滑鼠靈敏度');
  group.add(cam, 'maxPitch', 30, 89, 1).name('俯仰上限（度）');
  group.add(cam, 'zoomPerWheel', 0.001, 0.01, 0.0005).name('滾輪縮放');
  group.add(cam, 'minDistance', 0.5, 3, 0.1).name('最近距離（m）');
  group.add(cam, 'maxDistance', 2, 10, 0.1).name('最遠距離（m）');
  const smoothing = group.addFolder('平滑時間（秒）');
  smoothing.add(cam, 'zoomSmoothTime', 0.01, 1, 0.01).name('滾輪縮放');
  smoothing.add(cam, 'obstructSmoothTime', 0.01, 0.5, 0.01).name('被擋住拉近');
  smoothing.add(cam, 'releaseSmoothTime', 0.05, 2, 0.05).name('障礙離開退回');
  smoothing.add(cam, 'followSmoothTime', 0.05, 2, 0.05).name('轉回角色背後');
  smoothing.add(cam, 'resetSmoothTime', 0.05, 2, 0.05).name('回到預設視角');
  smoothing.close();
  group.close();
}

/**
 * 把目前的 config 寫回 scene.config.json（只有 vite dev 有這個端點）。
 * @throws 伺服器回應不是 2xx 時，訊息帶狀態碼與伺服器說明。
 */
async function saveConfig(): Promise<void> {
  const response = await fetch(SAVE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config, null, 2),
  });
  if (!response.ok) throw new Error(`儲存 scene.config.json 失敗：HTTP ${response.status} ${await response.text()}`);
  savedSnapshot = structuredClone(config);
}

function flashName(controller: Controller, text: string, original: string): void {
  controller.name(text);
  setTimeout(() => controller.name(original), SAVE_FEEDBACK_MS);
}

// 整份換掉後重建面板：控制項綁的是舊物件，原地改值比逐欄同步單純。
function restoreDefaults(): void {
  Object.assign(config, structuredClone(savedSnapshot));
  gui.destroy();
  gui = buildInspector();
  rebuildScene();
  applyFirstPersonFov();
}

function addFileButtons(panel: GUI): void {
  if (import.meta.env.DEV) {
    const label = '儲存';
    const actions = {
      save: (): void => {
        saveConfig()
          .then(() => flashName(saveButton, '已儲存', label))
          .catch((error: unknown) => {
            console.error(error);
            flashName(saveButton, '儲存失敗（看 console）', label);
          });
      },
    };
    const saveButton = panel.add(actions, 'save').name(label);
  }
  panel.add({ restore: restoreDefaults }, 'restore').name('還原預設');
}

function buildInspector(): GUI {
  const panel = new GUI({ title: 'Inspector' });
  addFileButtons(panel);
  addSceneGroup(panel);
  addCharacterGroup(panel);
  addCameraGroup(panel);
  if (innerWidth < 768) panel.close();
  return panel;
}

// Tab 切換環繞檢視／第一人稱。只在焦點不在按鈕等控制項上時攔 Tab，用鍵盤在 Inspector 裡移動焦點仍然可以。
function toggleViewMode(): void {
  setViewMode(activeModeName === 'orbit' ? 'firstPerson' : 'orbit');
}

addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  if (event.target !== document.body && event.target !== renderer.domElement) return;
  event.preventDefault();
  toggleViewMode();
});

// ================= 8. 啟動 =================
let gui = buildInspector();
character.load()
  .then((names) => {
    clipNames = names;
    if (animationFolder) addClipControllers(animationFolder);
  })
  .catch((error: unknown) => console.error(`角色模型載入失敗（${MODEL_URL}），繼續用方塊人：`, error));
// 開頁面時是第三人稱。先進一次環繞檢視：它的 exit() 會關掉 OrbitControls、記下俯瞰的鏡頭位置，按 Tab 才回得到。
// 場景建好（碰撞體就位）之後才進人物模式，出生點才找得到空位。
setViewMode('orbit');
rebuildScene();
setViewMode('firstPerson');

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const MAX_FRAME_DT = 0.1;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), MAX_FRAME_DT);
  currentMode().update(dt);
  updateFloaters(world.floaters, clock.elapsedTime);
  character.syncSkeletonHelper();
  renderer.render(scene, camera);
});
