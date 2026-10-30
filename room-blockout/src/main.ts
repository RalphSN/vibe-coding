import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import GUI, { type Controller } from 'lil-gui';
import {
  CLIP_ROLES, FURNITURE_TYPES, SAVE_ENDPOINT, loadSceneConfig,
  type ClipRole, type FurnitureItem, type FurnitureType, type HouseConfig, type Opening, type SceneConfig, type Sizes, type Spot, type Wall,
} from './config/scene.config';
import rawSceneConfig from './config/scene.config.json' with { type: 'json' };

// ================= 0. 型別 =================
type Vec3Tuple = [number, number, number];
type SizeProp = 'width' | 'depth' | 'height';
type ClearanceSide = 'front' | 'back' | 'right' | 'left';
type StatusTone = 'ok' | 'warn' | 'bad';
type KeyAction = 'forward' | 'back' | 'turnLeft' | 'turnRight' | 'strafeLeft' | 'strafeRight' | 'jump' | 'run';
type ViewModeName = 'orbit' | 'firstPerson';
type ActionType = 'move' | 'rotate' | 'resize';
type HandleKind = 'rotate' | 'size';
type GaitName = 'walk' | 'run';
type Direction = 'forward' | 'backward' | 'side';
type RigPose = Record<string, number>;
type CharacterPhase = 'ground' | 'jumpStart' | 'jumpLoop' | 'land';

interface Preset extends Sizes { name: string }
interface ClearanceRule { sides: ClearanceSide[]; need?: 'any'; depth: number; name: string; ignoreTypes?: FurnitureType[] }
interface FurnitureSpec { limits: Record<SizeProp, [number, number]>; presets: Preset[]; clearance: ClearanceRule[] }
interface Hole { offset: number; width: number; height: number; bottom: number }
interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
interface Footprint extends Rect { corners: Spot[] }
interface KeepClearZone { label: string; maxHeight: number; rect: Rect }
interface Obstacle { issue: string; fp: Footprint; maxHeight: number }
interface ZoneRect { cx: number; cz: number; w: number; d: number }
interface ClearanceZone { side: ClearanceSide; rect: ZoneRect; blockers: string[] }
interface ClearanceEntry { key: string; item: FurnitureItem; rule: ClearanceRule; zones: ClearanceZone[]; isFailed: boolean }
interface Pose { x: number; z: number; angle: number; lift: number }
interface Motion { velocity: number }
// 每個視角模式都提供同一組介面，見「5. 視角模式」。
interface ViewMode {
  allowsEditing: boolean;
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
interface RigMotion { forwardSpeed: number; sideSpeed: number; turnRate: number; isGrounded: boolean; riseRatio: number }
interface AvatarRig { root: THREE.Group; build(eyeHeight: number): void; animate(motion: RigMotion, dt: number): void }
interface Character extends AvatarRig { load(): Promise<string[]>; syncSkeletonHelper(): void }
interface PlayerPose { x: number; z: number; yaw: number; pitch: number; distance?: number; feetY?: number }
interface ScreenPoint { x: number; y: number; isVisible: boolean }
interface Handle { id: string; kind: HandleKind; base: THREE.Vector3; outward: THREE.Vector3 }
interface HandleSprite { sprite: THREE.Sprite; handle: Handle }
interface Gizmo { group: THREE.Group; handles: HandleSprite[] }
interface HandleColors { fill: string; ring: string; arrow: string }
// 拖曳中的動作；grab*／plane／prop／dir／anchor 只有特定 type 會用到，其餘維持初始值。
interface EditorAction {
  type: ActionType;
  key: string;
  handleId: string | null;
  start: FurnitureItem;
  draft: FurnitureItem;
  issue: string | null;
  landing: Spot | null;
  isCrowded: boolean;
  limitNote: string | null;
  grabDX: number;
  grabDZ: number;
  grabAngle: number;
  grabOffset: number;
  plane: THREE.Plane | null;
  prop: 'width' | 'depth';
  dir: THREE.Vector3;
  anchor: THREE.Vector3;
}
interface Press { x: number; y: number; key: string | null }
interface EditorState {
  selectedKey: string | null;
  hoverKey: string | null;
  hotId: string | null;
  isSizeMode: boolean;
  gizmo: Gizmo | null;
  rotateCorner: [number, number];
  rotatePush: number;
  action: EditorAction | null;
  press: Press | null;
  handleScale: Map<string, number>;
}

// HTML 裡一定有的元素；找不到代表 index.html 和程式不同步，直接報錯比默默壞掉好查。
function requireElement<T extends Element>(selector: string, type: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`index.html 缺少元素：${selector}`);
  return element;
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('瀏覽器不支援 Canvas 2D，無法畫控制點貼圖');
  return ctx;
}

const isSizeProp = (value: unknown): value is SizeProp => value === 'width' || value === 'depth' || value === 'height';

// ================= 1. 設定 =================
// 可調數值都在 src/config/scene.config.json（型別與說明在 scene.config.ts）；lil-gui 改的就是這個物件。
// 這裡只留程式內部的常數（建模細節、容差、取樣數），不是設計時會調的。
const config: SceneConfig = loadSceneConfig(rawSceneConfig);

const ROTATION_STEP = 90;
const FLOOR_THICKNESS = 0.05;
const PREVIEW_LIFT = 0.004;
const EPSILON = 1e-3;
const BED_HEADBOARD = { minHeight: 0.9, aboveMattress: 0.3, thickness: 0.06 };   // 床頭板至少高出床墊 aboveMattress
const DESK_PARTS = { topThickness: 0.04, legSize: 0.05, legInset: 0.03 };
const BOOKCASE_PARTS = { board: 0.02, shelfSpacing: 0.35 };
const CHAIR_PARTS = { seatHeight: 0.45, seatThickness: 0.04, legSize: 0.04, backThickness: 0.04 };
const SOFA_PARTS = { seatRatio: 0.55, backThickness: 0.2 };   // 座面高 = 總高 × seatRatio
const TABLE_PARTS = { topThickness: 0.04, pedestal: 0.12 };
const RAILING_THICKNESS = 0.05;
const GROUND_DROP = 0.01;          // 草地比室內地板低一點，地板邊緣才看得出來
const FENCE_HEIGHT = 3;            // 草地邊緣隱形圍欄的高度
const DOOR_SWING_RATIO = 1;        // 門前淨空深度 = 門寬 × 這個值（開門半徑）
const SLIDER_CLEARANCE = 0.6;      // 拉門不用開門半徑，只留一人通過的深度
const SIZE_NAMES: Record<SizeProp, string> = { width: '寬', depth: '深', height: '高' };
const SIZE_PROPS: SizeProp[] = ['width', 'depth', 'height'];

// 每種家具的尺寸規則，數值是室內設計常用範圍（未逐條查證出處）。
// limits：每個尺寸能調的範圍；presets：標準規格（床用台灣尺數，1 尺約 30.3 cm）；
// clearance：建議留的活動空間，不夠只提醒、不擋放置。side 用家具自身座標：front 是 +Z、left 是 -X；
// need 'any' 表示列出的幾側有一側夠就好（例如靠牆的床只要一側有走道）；ignoreTypes 是可以放在裡面的家具。
const FURNITURE_SPECS: Record<FurnitureType, FurnitureSpec> = {
  bed: {
    limits: { width: [0.9, 2.0], depth: [1.88, 2.2], height: [0.25, 0.65] },
    presets: [
      { name: '單人 3×6.2 尺', width: 0.91, depth: 1.88, height: 0.45 },
      { name: '單人加大 3.5×6.2 尺', width: 1.06, depth: 1.88, height: 0.45 },
      { name: '雙人 5×6.2 尺', width: 1.52, depth: 1.88, height: 0.45 },
      { name: '雙人加大 6×6.2 尺', width: 1.82, depth: 1.88, height: 0.45 },
      { name: '特大 6×7 尺', width: 1.82, depth: 2.12, height: 0.45 },
    ],
    clearance: [{ sides: ['left', 'right'], need: 'any', depth: 0.6, name: '上下床走道' }],
  },
  desk: {
    limits: { width: [0.8, 3.5], depth: [0.45, 0.8], height: [0.68, 0.8] },
    presets: [
      { name: '小書桌 100×50', width: 1.0, depth: 0.5, height: 0.75 },
      { name: '雙人長桌 320×50', width: 3.2, depth: 0.5, height: 0.75 },
      { name: '標準 120×60', width: 1.2, depth: 0.6, height: 0.75 },
      { name: '寬桌 140×70', width: 1.4, depth: 0.7, height: 0.75 },
      { name: '工作桌 160×80', width: 1.6, depth: 0.8, height: 0.75 },
    ],
    clearance: [{ sides: ['front'], depth: 0.9, name: '拉椅空間', ignoreTypes: ['chair'] }],
  },
  // 椅子高度是椅背頂；座高固定 CHAIR_PARTS.seatHeight，下限要留得出椅背。
  chair: {
    limits: { width: [0.4, 0.7], depth: [0.4, 0.7], height: [0.75, 1.25] },
    presets: [
      { name: '餐椅型 45×45', width: 0.45, depth: 0.45, height: 0.85 },
      { name: '辦公椅 60×60', width: 0.6, depth: 0.6, height: 1.1 },
    ],
    clearance: [],
  },
  bookcase: {
    limits: { width: [0.4, 1.2], depth: [0.24, 0.45], height: [0.6, 2.4] },
    presets: [
      { name: '窄櫃 40×30×180', width: 0.4, depth: 0.3, height: 1.8 },
      { name: '標準 80×30×180', width: 0.8, depth: 0.3, height: 1.8 },
      { name: '矮櫃 80×30×90', width: 0.8, depth: 0.3, height: 0.9 },
      { name: '高櫃 80×30×220', width: 0.8, depth: 0.3, height: 2.2 },
    ],
    clearance: [{ sides: ['front'], depth: 0.6, name: '取物空間' }],
  },
  wardrobe: {
    limits: { width: [0.5, 2.4], depth: [0.55, 0.65], height: [1.8, 2.4] },
    presets: [
      { name: '單門 60×60×200', width: 0.6, depth: 0.6, height: 2.0 },
      { name: '雙門 120×60×200', width: 1.2, depth: 0.6, height: 2.0 },
      { name: '三門 180×60×200', width: 1.8, depth: 0.6, height: 2.0 },
      { name: '頂天 120×60×240', width: 1.2, depth: 0.6, height: 2.4 },
    ],
    clearance: [{ sides: ['front'], depth: 0.9, name: '開門空間' }],
  },
  // 低櫃都算流理台類：廚房檯面、洗衣台、電視櫃。
  counter: {
    limits: { width: [0.4, 4.0], depth: [0.3, 0.7], height: [0.4, 1.0] },
    presets: [
      { name: '廚房檯面 250×60×90', width: 2.5, depth: 0.6, height: 0.9 },
      { name: '洗衣台 120×60×90', width: 1.2, depth: 0.6, height: 0.9 },
      { name: '電視櫃 180×40×50', width: 1.8, depth: 0.4, height: 0.5 },
    ],
    clearance: [{ sides: ['front'], depth: 0.9, name: '操作空間' }],
  },
  island: {
    limits: { width: [0.9, 3.0], depth: [0.6, 1.2], height: [0.85, 1.1] },
    presets: [
      { name: '中島 220×80×90', width: 2.2, depth: 0.8, height: 0.9 },
      { name: '小中島 120×60×90', width: 1.2, depth: 0.6, height: 0.9 },
    ],
    clearance: [{ sides: ['front', 'back'], depth: 0.9, name: '走道', ignoreTypes: ['chair'] }],
  },
  sofa: {
    limits: { width: [0.7, 3.2], depth: [0.7, 1.1], height: [0.65, 1.0] },
    presets: [
      { name: '單人 85×85', width: 0.85, depth: 0.85, height: 0.8 },
      { name: '三人 200×85', width: 2.0, depth: 0.85, height: 0.8 },
    ],
    clearance: [{ sides: ['front'], depth: 0.45, name: '腳前空間' }],
  },
  // 衛浴設備用同一種方塊，靠尺寸區分（洗手台、淋浴間、馬桶）。
  bath: {
    limits: { width: [0.35, 1.8], depth: [0.35, 1.2], height: [0.4, 2.2] },
    presets: [
      { name: '馬桶 40×70×80', width: 0.4, depth: 0.7, height: 0.8 },
      { name: '洗手台 80×50×85', width: 0.8, depth: 0.5, height: 0.85 },
      { name: '淋浴間 90×90×200', width: 0.9, depth: 0.9, height: 2.0 },
    ],
    clearance: [{ sides: ['front'], depth: 0.6, name: '使用空間' }],
  },
  table: {
    limits: { width: [0.4, 2.0], depth: [0.4, 1.2], height: [0.4, 0.8] },
    presets: [
      { name: '邊几 60×60×50', width: 0.6, depth: 0.6, height: 0.5 },
      { name: '餐桌 120×80×75', width: 1.2, depth: 0.8, height: 0.75 },
    ],
    clearance: [],
  },
};

// 椅子用書桌的深一階橘色，看得出是一組，又能和書桌分開。
const COLORS = {
  floor: 0xd8d8d8, wall: 0xc4c4c4, deck: 0xb98a5e, grass: 0x9cc48a, railing: 0x6b5a4a, step: 0xa98058,
  bed: 0x4f86e8, desk: 0xe8a33c, chair: 0xb8741c, bookcase: 0x47a65a, wardrobe: 0x9b62d1,
  counter: 0x8a96a3, island: 0x5f6b78, sofa: 0xd9607a, bath: 0xe6eef2, table: 0xc98b5a,
  player: 0xff6f3c, playerFace: 0x3a2a20, playerSkin: 0xf0c39c, playerPants: 0x3d4f73, playerShoe: 0x2b2b2b,
};
const HIGHLIGHT_EMISSIVE = 0x2a2a2a;
const ACCENT = 0x1fb6d5;
const COLOR_OK = 0x34c759;
const COLOR_BAD = 0xff3b30;

const materials: Record<string, THREE.Material> = Object.fromEntries(
  Object.entries(COLORS).map(([key, color]) => [key, new THREE.MeshLambertMaterial({ color })]),
);
// 滑過或選取中的家具：同色加一點自發光，看起來「亮起來」。
const litMaterials: Record<string, THREE.Material> = Object.fromEntries(
  FURNITURE_TYPES.map((type) => [type, new THREE.MeshLambertMaterial({ color: COLORS[type], emissive: HIGHLIGHT_EMISSIVE })]),
);
// 選取描邊：每個方塊外面套一個稍大、只畫背面的方塊（inverted hull），看起來像粗描邊。
materials.outline = new THREE.MeshBasicMaterial({ color: ACCENT, side: THREE.BackSide });
// 紅色＝硬規則（門窗淨空，不能放）；黃色＝建議的活動空間（擋到只提醒）。
materials.keepClear = new THREE.MeshBasicMaterial({ color: COLOR_BAD, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
materials.clearance = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.18, depthWrite: false });
materials.clearanceWarn = new THREE.MeshBasicMaterial({ color: 0xffb300, transparent: true, opacity: 0.55, depthWrite: false });

// ================= 2. 場景基礎 =================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef0f2);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
camera.position.set(9, 17, 15);

scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(3, 6, 2);
scene.add(sun);

// world 是之後第一人稱模式也會用到的共用狀態：colliders 給玩家碰撞用。
const world: {
  room: THREE.Group;
  furniture: THREE.Group;
  guides: THREE.Group;
  overlay: THREE.Group;
  editor: THREE.Group;
  colliders: THREE.Box3[];
} = {
  room: new THREE.Group(),
  furniture: new THREE.Group(),
  guides: new THREE.Group(),    // 常駐：地板格線、佔地格
  overlay: new THREE.Group(),   // 拖曳中才有：門窗淨空區
  editor: new THREE.Group(),    // 尺寸模式的控制點
  colliders: [],
};
scene.add(world.room, world.furniture, world.guides, world.overlay, world.editor);

// ================= 3. 建模（只用 Box） =================
function addBox(parent: THREE.Object3D, material: THREE.Material, size: Vec3Tuple, center: Vec3Tuple): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...center);
  parent.add(mesh);
  return mesh;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const round3 = (value: number): number => Number(value.toFixed(3));
const snapTo = (value: number, step: number): number => round3(Math.round(value / step) * step);
const normalizeDeg = (deg: number): number => ((Math.round(deg) % 360) + 360) % 360;

// 牆面在局部座標沿 X 展開；開口切成「開口左右的整面牆段＋開口上下的牆段」，所以是真的洞。
function buildWall(length: number, height: number, thickness: number, openings: Hole[]): THREE.Group {
  const wall = new THREE.Group();
  const half = length / 2;
  const addPiece = (u0: number, u1: number, y0: number, y1: number): void => {
    if (u1 - u0 < EPSILON || y1 - y0 < EPSILON) return;
    addBox(wall, materials.wall, [u1 - u0, y1 - y0, thickness], [(u0 + u1) / 2, (y0 + y1) / 2, 0]);
  };
  const holes = openings
    .map((o) => ({
      u0: clamp(o.offset - o.width / 2, -half, half),
      u1: clamp(o.offset + o.width / 2, -half, half),
      y0: clamp(o.bottom, 0, height),
      y1: clamp(o.bottom + o.height, 0, height),
    }))
    .sort((a, b) => a.u0 - b.u0);

  let cursor = -half;
  for (const hole of holes) {
    addPiece(cursor, hole.u0, 0, height);
    addPiece(Math.max(cursor, hole.u0), hole.u1, 0, hole.y0);
    addPiece(Math.max(cursor, hole.u0), hole.u1, hole.y1, height);
    cursor = Math.max(cursor, hole.u1);
  }
  addPiece(cursor, half, 0, height);
  return wall;
}

const wallLength = (wall: Wall): number => Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
const wallDirection = (wall: Wall): Spot => {
  const length = wallLength(wall) || 1;
  return { x: (wall.x2 - wall.x1) / length, z: (wall.z2 - wall.z1) / length };
};

// 牆的佔地（含兩端各多出半個牆厚，轉角才會接滿）：擺放、貼齊、活動空間都把它當障礙。
function wallRect(wall: Wall, thickness: number): Rect {
  const half = thickness / 2;
  return {
    minX: Math.min(wall.x1, wall.x2) - half, maxX: Math.max(wall.x1, wall.x2) + half,
    minZ: Math.min(wall.z1, wall.z2) - half, maxZ: Math.max(wall.z1, wall.z2) + half,
  };
}

function segmentRect(segment: { x1: number; z1: number; x2: number; z2: number }, thickness: number): Rect {
  return wallRect({ label: '', openings: [], ...segment }, thickness);
}

// 房屋範圍：所有地板與台階的外接長方形（格線、搜尋空位、草地都以它為準）。
function houseBounds(house: HouseConfig): Rect {
  const rects: Rect[] = [...house.floors, ...house.steps, ...house.walls.map((wall) => wallRect(wall, house.wallThickness))];
  return {
    minX: Math.min(...rects.map((r) => r.minX)), maxX: Math.max(...rects.map((r) => r.maxX)),
    minZ: Math.min(...rects.map((r) => r.minZ)), maxZ: Math.max(...rects.map((r) => r.maxZ)),
  };
}

const expandRect = (r: Rect, margin: number): Rect =>
  ({ minX: r.minX - margin, maxX: r.maxX + margin, minZ: r.minZ - margin, maxZ: r.maxZ + margin });

function addRectBox(parent: THREE.Object3D, material: THREE.Material, r: Rect, y0: number, y1: number): THREE.Mesh {
  return addBox(parent, material, [r.maxX - r.minX, y1 - y0, r.maxZ - r.minZ], [(r.minX + r.maxX) / 2, (y0 + y1) / 2, (r.minZ + r.maxZ) / 2]);
}

// 整間房屋：草地 → 地板（室內灰、平台木色）→ 牆（開門窗洞）→ 欄杆、台階。
// 牆、欄杆、台階的方塊標 isSolid，碰撞只收這些和家具。
function buildHouse(cfg: SceneConfig): THREE.Group {
  const { house, groundMargin } = cfg.scene;
  const T = house.wallThickness;
  const group = new THREE.Group();
  addRectBox(group, materials.grass, expandRect(houseBounds(house), groundMargin), -GROUND_DROP - FLOOR_THICKNESS, -GROUND_DROP);
  for (const floor of house.floors) {
    addRectBox(group, floor.kind === 'deck' ? materials.deck : materials.floor, floor, -FLOOR_THICKNESS, 0);
  }
  for (const spec of house.walls) {
    const length = wallLength(spec);
    const dir = wallDirection(spec);
    const toHole = (o: Opening): Hole => ({ offset: o.offset - length / 2, width: o.width, height: o.height, bottom: o.sill ?? 0 });
    const wall = buildWall(length + T, house.wallHeight, T, spec.openings.map(toHole));
    wall.position.set((spec.x1 + spec.x2) / 2, 0, (spec.z1 + spec.z2) / 2);
    // 局部 +X 沿牆的方向：往 +Z 的牆要轉 -90°。
    wall.rotation.y = -Math.atan2(dir.z, dir.x);
    wall.userData.isWall = true;
    wall.userData.isSolid = true;
    group.add(wall);
  }
  for (const railing of house.railings) {
    addRectBox(group, materials.railing, segmentRect(railing, RAILING_THICKNESS), 0, railing.height).userData.isSolid = true;
  }
  for (const step of house.steps) addRectBox(group, materials.step, step, 0, step.height).userData.isSolid = true;
  return group;
}

// 每個建構函式在「家具局部座標」作圖：原點在佔地中心的地面，背面在 -Z。
const furnitureBuilders: Record<FurnitureType, (group: THREE.Group, size: Sizes, mat: THREE.Material) => void> = {
  bed(group, { width, depth, height }, mat) {
    addBox(group, mat, [width, height, depth], [0, height / 2, 0]);
    const { thickness: ht } = BED_HEADBOARD;
    const hh = Math.max(BED_HEADBOARD.minHeight, height + BED_HEADBOARD.aboveMattress);
    addBox(group, mat, [width, hh, ht], [0, hh / 2, -depth / 2 + ht / 2]);
  },
  desk(group, { width, depth, height }, mat) {
    const { topThickness, legSize, legInset } = DESK_PARTS;
    addBox(group, mat, [width, topThickness, depth], [0, height - topThickness / 2, 0]);
    const legHeight = height - topThickness;
    const lx = width / 2 - legInset - legSize / 2;
    const lz = depth / 2 - legInset - legSize / 2;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      addBox(group, mat, [legSize, legHeight, legSize], [sx * lx, legHeight / 2, sz * lz]);
    }
  },
  bookcase(group, { width, depth, height }, mat) {
    const b = BOOKCASE_PARTS.board;
    const innerWidth = width - 2 * b;
    for (const side of [-1, 1]) addBox(group, mat, [b, height, depth], [side * (width / 2 - b / 2), height / 2, 0]);
    addBox(group, mat, [innerWidth, b, depth], [0, b / 2, 0]);
    addBox(group, mat, [innerWidth, b, depth], [0, height - b / 2, 0]);
    addBox(group, mat, [innerWidth, height - 2 * b, b], [0, height / 2, -depth / 2 + b / 2]);
    const shelfCount = Math.max(1, Math.round(height / BOOKCASE_PARTS.shelfSpacing) - 1);
    for (let i = 1; i <= shelfCount; i++) {
      addBox(group, mat, [innerWidth, b, depth - b], [0, (height * i) / (shelfCount + 1), b / 2]);
    }
  },
  wardrobe(group, { width, depth, height }, mat) {
    addBox(group, mat, [width, height, depth], [0, height / 2, 0]);
  },
  counter(group, { width, depth, height }, mat) {
    addBox(group, mat, [width, height, depth], [0, height / 2, 0]);
  },
  island(group, { width, depth, height }, mat) {
    addBox(group, mat, [width, height, depth], [0, height / 2, 0]);
  },
  sofa(group, { width, depth, height }, mat) {
    const seat = height * SOFA_PARTS.seatRatio;
    const back = Math.min(SOFA_PARTS.backThickness, depth / 2);
    addBox(group, mat, [width, seat, depth - back], [0, seat / 2, back / 2]);
    addBox(group, mat, [width, height, back], [0, height / 2, -depth / 2 + back / 2]);
  },
  bath(group, { width, depth, height }, mat) {
    addBox(group, mat, [width, height, depth], [0, height / 2, 0]);
  },
  table(group, { width, depth, height }, mat) {
    const { topThickness, pedestal } = TABLE_PARTS;
    addBox(group, mat, [width, topThickness, depth], [0, height - topThickness / 2, 0]);
    addBox(group, mat, [pedestal, height - topThickness, pedestal], [0, (height - topThickness) / 2, 0]);
  },
  chair(group, { width, depth, height }, mat) {
    const { seatThickness, legSize, backThickness } = CHAIR_PARTS;
    const seatTop = Math.min(CHAIR_PARTS.seatHeight, height);
    addBox(group, mat, [width, seatThickness, depth], [0, seatTop - seatThickness / 2, 0]);
    const legHeight = seatTop - seatThickness;
    const lx = width / 2 - legSize / 2;
    const lz = depth / 2 - legSize / 2;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      addBox(group, mat, [legSize, legHeight, legSize], [sx * lx, legHeight / 2, sz * lz]);
    }
    const backHeight = height - seatTop;
    addBox(group, mat, [width, backHeight, backThickness], [0, seatTop + backHeight / 2, -depth / 2 + backThickness / 2]);
  },
};

function buildFurnitureItem(key: string, item: FurnitureItem, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  furnitureBuilders[item.type](group, item, material);
  group.position.set(item.x, 0, item.z);
  group.rotation.y = THREE.MathUtils.degToRad(item.rotation);
  group.userData.furnitureKey = key;
  return group;
}

function addSelectionOutline(group: THREE.Group): void {
  const t = OUTLINE_THICKNESS;
  // 先複製一份清單：迴圈裡會往 group 加描邊。
  for (const mesh of [...group.children]) {
    if (!(mesh instanceof THREE.Mesh) || !(mesh.geometry instanceof THREE.BoxGeometry)) continue;
    const { width, height, depth } = mesh.geometry.parameters;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(width + 2 * t, height + 2 * t, depth + 2 * t), materials.outline);
    hull.position.copy(mesh.position);
    hull.userData.isOutline = true;
    group.add(hull);
  }
}

function disposeChildren(group: THREE.Object3D): void {
  group.traverse((obj) => {
    if ('geometry' in obj && obj.geometry instanceof THREE.BufferGeometry) obj.geometry.dispose();
  });
  group.clear();
}

// 草地四邊的隱形圍欄：只給第一人稱碰撞用，走到草地邊緣就停住，不會走進虛空。
function groundFenceBoxes(cfg: SceneConfig): THREE.Box3[] {
  const r = expandRect(houseBounds(cfg.scene.house), cfg.scene.groundMargin);
  const T = cfg.scene.house.wallThickness;
  const box = (minX: number, minZ: number, maxX: number, maxZ: number): THREE.Box3 =>
    new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, FENCE_HEIGHT, maxZ));
  return [
    box(r.minX - T, r.minZ - T, r.maxX + T, r.minZ),
    box(r.minX - T, r.maxZ, r.maxX + T, r.maxZ + T),
    box(r.minX - T, r.minZ, r.minX, r.maxZ),
    box(r.maxX, r.minZ, r.maxX + T, r.maxZ),
  ];
}

// 碰撞用軸對齊外框（Box3），每個方塊各算一個：桌子是桌面＋四支腳，可以鑽到底下、站上桌面。
// 斜放的家具外框會比實際大一點，blockout 階段夠用。
function collectColliders(): THREE.Box3[] {
  scene.updateMatrixWorld(true);
  const boxes = groundFenceBoxes(config);
  world.room.traverse((obj) => {
    if (obj instanceof THREE.Mesh && (obj.userData.isSolid || obj.parent?.userData.isSolid)) boxes.push(new THREE.Box3().setFromObject(obj));
  });
  world.furniture.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !obj.userData.isOutline) boxes.push(new THREE.Box3().setFromObject(obj));
  });
  return boxes;
}

const itemGroups = new Map<string, THREE.Group>();
// 畫面上看到的位置（pose）會往設定值滑過去，旋轉、拿起、放下、退回原位都有過程。
const displayPoses = new Map<string, Pose>();

const isItemLit = (key: string): boolean => key === editor.hoverKey || key === editor.selectedKey;

function applyPose(group: THREE.Object3D, pose: Pose): void {
  group.position.set(pose.x, pose.lift, pose.z);
  group.rotation.y = pose.angle;
}

function renderItem(key: string, item: FurnitureItem): void {
  const old = itemGroups.get(key);
  if (old) {
    disposeChildren(old);
    world.furniture.remove(old);
  }
  const material = isItemLit(key) ? litMaterials[item.type] : materials[item.type];
  const group = buildFurnitureItem(key, item, material);
  if (key === editor.selectedKey) {
    addSelectionOutline(group);
    group.traverse((obj) => { obj.renderOrder = RENDER_ORDER.selected; });
  }
  let pose = displayPoses.get(key);
  if (!pose) {
    pose = targetPose(key);
    displayPoses.set(key, pose);
  }
  applyPose(group, pose);
  world.furniture.add(group);
  // 重建後馬上算矩陣，下一格繪製前的點擊判定才會打在新的家具上。
  group.updateMatrixWorld(true);
  itemGroups.set(key, group);
}

function applyTint(key: string | null): void {
  if (!key) return;
  const group = itemGroups.get(key);
  if (!group) return;
  const type = config.furniture[key].type;
  const material = isItemLit(key) ? litMaterials[type] : materials[type];
  group.traverse((obj) => { if (obj instanceof THREE.Mesh && !obj.userData.isOutline) obj.material = material; });
}

function rebuildScene(): void {
  disposeChildren(world.room);
  disposeChildren(world.furniture);
  itemGroups.clear();
  world.room.add(buildHouse(config));
  for (const [key, item] of Object.entries(config.furniture)) renderItem(key, item);
  world.colliders = collectColliders();
  updateRoomGrid();
  updateFootprint();
  refreshGizmo();
  syncInputs();
  showLayoutStatus();
}

// ================= 4. 擺放規則（2D 佔地） =================
const CORNER_SIGNS: [number, number][] = [[1, 1], [1, -1], [-1, -1], [-1, 1]];

function withBounds(corners: Spot[]): Footprint {
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  return { corners, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

// 佔地是跟著 rotation 轉的長方形：四個角＋外接的軸對齊範圍（出界判定、貼齊、選單定位用）。
// 自身 X 軸在世界是 (cos, -sin)，自身 Z 軸是 (sin, cos)，和 localAxis 一致。
// orientedRect：家具自身座標裡、中心 (cx, cz)、半寬 hw、半深 hd 的長方形（活動空間也用它）。
function orientedRect(item: Spot & { rotation: number }, cx: number, cz: number, hw: number, hd: number): Footprint {
  const angle = THREE.MathUtils.degToRad(item.rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return withBounds(CORNER_SIGNS.map(([sx, sz]) => {
    const lx = cx + sx * hw;
    const lz = cz + sz * hd;
    return { x: item.x + lx * cos + lz * sin, z: item.z - lx * sin + lz * cos };
  }));
}

const getFootprint = (item: Spot & { rotation: number; width: number; depth: number }): Footprint =>
  orientedRect(item, 0, 0, item.width / 2, item.depth / 2);

const rectFootprint = (r: Rect): Footprint =>
  withBounds([{ x: r.minX, z: r.minZ }, { x: r.maxX, z: r.minZ }, { x: r.maxX, z: r.maxZ }, { x: r.minX, z: r.maxZ }]);

function projectCorners(corners: Spot[], ax: number, az: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const c of corners) {
    const d = c.x * ax + c.z * az;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return [min, max];
}

// 分離軸定理（SAT）：兩個長方形只要在任一邊的法線方向上投影不重疊，就沒有相交。剛好貼著不算重疊。
function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  if (a.minX >= b.maxX - EPSILON || a.maxX <= b.minX + EPSILON || a.minZ >= b.maxZ - EPSILON || a.maxZ <= b.minZ + EPSILON) {
    return false;
  }
  for (const { corners } of [a, b]) {
    for (let i = 0; i < 2; i++) {
      const ex = corners[i + 1].x - corners[i].x;
      const ez = corners[i + 1].z - corners[i].z;
      const length = Math.hypot(ex, ez);
      if (length < EPSILON) continue;
      const [minA, maxA] = projectCorners(a.corners, -ez / length, ex / length);
      const [minB, maxB] = projectCorners(b.corners, -ez / length, ex / length);
      if (maxA <= minB + EPSILON || maxB <= minA + EPSILON) return false;
    }
  }
  return true;
}

// 淨空區：牆的兩側都留。門留一個門寬的開門半徑、拉門留一人通過的深度（都擋所有家具）；
// 窗前留 windowClearance，只擋比窗台高的家具。
function getKeepClearZones(cfg: SceneConfig): KeepClearZone[] {
  const T = cfg.scene.house.wallThickness;
  const zones: KeepClearZone[] = [];
  for (const wall of cfg.scene.house.walls) {
    const dir = wallDirection(wall);
    const isAlongX = Math.abs(dir.x) > Math.abs(dir.z);
    for (const opening of wall.openings) {
      const depth = opening.kind === 'window' ? cfg.scene.rules.windowClearance
        : opening.kind === 'slider' ? SLIDER_CLEARANCE : opening.width * DOOR_SWING_RATIO;
      const maxHeight = opening.kind === 'window' ? opening.sill ?? 0 : 0;
      const cx = wall.x1 + dir.x * opening.offset;
      const cz = wall.z1 + dir.z * opening.offset;
      const half = opening.width / 2;
      for (const side of [-1, 1]) {
        const near = side * T / 2;
        const far = side * (T / 2 + depth);
        const [a, b] = [Math.min(near, far), Math.max(near, far)];
        const rect: Rect = isAlongX
          ? { minX: cx - half, maxX: cx + half, minZ: cz + a, maxZ: cz + b }
          : { minX: cx + a, maxX: cx + b, minZ: cz - half, maxZ: cz + half };
        zones.push({ label: opening.label, maxHeight, rect });
      }
    }
  }
  return zones;
}

// 牆、欄杆、台階的佔地：家具不能和它們重疊。
function structureRects(house: HouseConfig): Rect[] {
  return [
    ...house.walls.map((wall) => wallRect(wall, house.wallThickness)),
    ...house.railings.map((railing) => segmentRect(railing, RAILING_THICKNESS)),
    ...house.steps,
  ];
}

// 會擋住這件家具的東西：其他家具、牆（任何高度都擋）＋門窗淨空區（只擋比 maxHeight 高的家具）。
function buildObstacles(key: string, cfg: SceneConfig): Obstacle[] {
  const items = Object.entries(cfg.furniture)
    .filter(([otherKey]) => otherKey !== key)
    .map(([, other]): Obstacle => ({ issue: `和${other.label}重疊`, fp: getFootprint(other), maxHeight: -Infinity }));
  const structures = structureRects(cfg.scene.house)
    .map((rect): Obstacle => ({ issue: '撞到牆', fp: rectFootprint(rect), maxHeight: -Infinity }));
  const zones = getKeepClearZones(cfg)
    .map((zone): Obstacle => ({ issue: `擋到${zone.label}`, fp: rectFootprint(zone.rect), maxHeight: zone.maxHeight }));
  return [...items, ...structures, ...zones];
}

const isPointOnFloor = (x: number, z: number, house: HouseConfig): boolean =>
  house.floors.some((f) => x >= f.minX - EPSILON && x <= f.maxX + EPSILON && z >= f.minZ - EPSILON && z <= f.maxZ + EPSILON);

// 佔地的四個角、四邊中點和中心都要踩在某塊地板上（地板是幾個相鄰的長方形，這樣取樣就夠）。
function isOnFloor(fp: Footprint, house: HouseConfig): boolean {
  const { corners } = fp;
  const samples = [
    ...corners,
    ...corners.map((c, i) => ({ x: (c.x + corners[(i + 1) % 4].x) / 2, z: (c.z + corners[(i + 1) % 4].z) / 2 })),
    { x: (fp.minX + fp.maxX) / 2, z: (fp.minZ + fp.maxZ) / 2 },
  ];
  return samples.every((p) => isPointOnFloor(p.x, p.z, house));
}

function findPlacementIssue(key: string, candidate: FurnitureItem, cfg: SceneConfig, obstacles = buildObstacles(key, cfg)): string | null {
  const fp = getFootprint(candidate);
  if (!isOnFloor(fp, cfg.scene.house)) return '不在地板上';
  if (candidate.height > cfg.scene.house.wallHeight + EPSILON) return '比牆高';
  for (const obstacle of obstacles) {
    if (candidate.height > obstacle.maxHeight && footprintsOverlap(fp, obstacle.fp)) return obstacle.issue;
  }
  return null;
}

// 放不下時要試的位移，由近到遠排好（格距 gridSnap、半徑 SEARCH_RADIUS 公尺），只算一次。
const SEARCH_RADIUS = 2;
const SEARCH_OFFSETS = (() => {
  const step = config.scene.rules.gridSnap;
  const n = Math.round(SEARCH_RADIUS / step);
  const offsets: { dx: number; dz: number; distance: number }[] = [];
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const distance = Math.hypot(i, j) * step;
      if (distance > 0 && distance <= SEARCH_RADIUS) offsets.push({ dx: i * step, dz: j * step, distance });
    }
  }
  return offsets.sort((a, b) => a.distance - b.distance);
})();

// 找離 candidate 最近、能放的位置；找不到回傳 null。
// 先把佔地夾回房屋範圍內（拖到屋外也會落在邊上），再由近到遠試格點；
// 找到後再貼齊一次，讓家具靠緊擋住它的東西，不會留下格點造成的小縫。
function findNearestFreeSpot(key: string, candidate: FurnitureItem, cfg: SceneConfig): Spot | null {
  if (candidate.height > cfg.scene.house.wallHeight + EPSILON) return null;
  const obstacles = buildObstacles(key, cfg);
  const fp = getFootprint(candidate);
  const halfX = (fp.maxX - fp.minX) / 2;
  const halfZ = (fp.maxZ - fp.minZ) / 2;
  const bounds = houseBounds(cfg.scene.house);
  if (bounds.maxX - bounds.minX < 2 * halfX - EPSILON || bounds.maxZ - bounds.minZ < 2 * halfZ - EPSILON) return null;
  const start = {
    ...candidate,
    x: round3(clamp(candidate.x, bounds.minX + halfX, bounds.maxX - halfX)),
    z: round3(clamp(candidate.z, bounds.minZ + halfZ, bounds.maxZ - halfZ)),
  };
  const isFree = (spot: FurnitureItem): boolean => !findPlacementIssue(key, spot, cfg, obstacles);
  if (isFree(start)) return { x: start.x, z: start.z };
  for (const { dx, dz } of SEARCH_OFFSETS) {
    const spot = { ...start, x: round3(start.x + dx), z: round3(start.z + dz) };
    if (!isFree(spot)) continue;
    const snapped = { ...spot, ...snapPosition(key, spot, spot.x, spot.z) };
    return isFree(snapped) ? { x: snapped.x, z: snapped.z } : { x: spot.x, z: spot.z };
  }
  return null;
}

// --- 尺寸範圍與活動空間 ---
function clampSize(type: FurnitureType, prop: SizeProp, value: number): number {
  const [min, max] = FURNITURE_SPECS[type].limits[prop];
  return clamp(round3(value), min, max);
}

const formatRange = (type: FurnitureType, prop: SizeProp): string => FURNITURE_SPECS[type].limits[prop].map((v) => v.toFixed(2)).join('–') + ' m';

// 改尺寸時寬、高以中心為準；深度固定背面，靠牆的家具加深時才不會撞牆。
function sizePatch(item: FurnitureItem, sizes: Partial<Sizes>): Partial<FurnitureItem> {
  const patch: Partial<FurnitureItem> = { ...sizes };
  if (sizes.depth !== undefined) {
    const dir = localAxis(item.rotation, 'z');
    const shift = (sizes.depth - item.depth) / 2;
    patch.x = round3(item.x + dir.x * shift);
    patch.z = round3(item.z + dir.z * shift);
  }
  return patch;
}

// 每一側活動空間在家具自身座標裡的長方形（中心與寬深）。
const CLEARANCE_SIDES: Record<ClearanceSide, (w: number, d: number, c: number) => ZoneRect> = {
  front: (w, d, c) => ({ cx: 0, cz: (d + c) / 2, w, d: c }),
  back: (w, d, c) => ({ cx: 0, cz: -(d + c) / 2, w, d: c }),
  right: (w, d, c) => ({ cx: (w + c) / 2, cz: 0, w: c, d }),
  left: (w, d, c) => ({ cx: -(w + c) / 2, cz: 0, w: c, d }),
};
const SIDE_TEXT: Record<ClearanceSide, string> = { front: '前方', back: '後方', right: '右側', left: '左側' };
const WALL_BLOCKER = '牆';

function findZoneBlockers(key: string, fp: Footprint, rule: ClearanceRule, furniture: Record<string, FurnitureItem>, house: HouseConfig): string[] {
  const isBlockedByStructure = !isOnFloor(fp, house) || structureRects(house).some((rect) => footprintsOverlap(fp, rectFootprint(rect)));
  const blockers = isBlockedByStructure ? [WALL_BLOCKER] : [];
  for (const [otherKey, other] of Object.entries(furniture)) {
    if (otherKey === key || rule.ignoreTypes?.includes(other.type)) continue;
    if (footprintsOverlap(fp, getFootprint(other))) blockers.push(otherKey);
  }
  return blockers;
}

// 檢查每件家具的活動空間；furniture 可以是拖曳中的草稿，所以不直接讀 config。
function getClearanceReport(furniture: Record<string, FurnitureItem>, house: HouseConfig): ClearanceEntry[] {
  const report: ClearanceEntry[] = [];
  for (const [key, item] of Object.entries(furniture)) {
    for (const rule of FURNITURE_SPECS[item.type].clearance) {
      const zones = rule.sides.map((side): ClearanceZone => {
        const rect = CLEARANCE_SIDES[side](item.width, item.depth, rule.depth);
        const fp = orientedRect(item, rect.cx, rect.cz, rect.w / 2, rect.d / 2);
        return { side, rect, blockers: findZoneBlockers(key, fp, rule, furniture, house) };
      });
      const blockedCount = zones.filter((zone) => zone.blockers.length > 0).length;
      const isFailed = rule.need === 'any' ? blockedCount === zones.length : blockedCount > 0;
      report.push({ key, item, rule, zones, isFailed });
    }
  }
  return report;
}

const involvesKey = (entry: ClearanceEntry, key: string): boolean => entry.key === key || entry.zones.some((zone) => zone.blockers.includes(key));

function clearanceMessage({ item, rule, zones }: ClearanceEntry): string {
  const sideText = zones.length > 1 ? '兩側都' : SIDE_TEXT[zones[0].side];
  const blockers = [...new Set(zones.flatMap((zone) => zone.blockers))]
    .map((blocker) => config.furniture[blocker]?.label ?? blocker);
  return `${item.label}${sideText}不到 ${Math.round(rule.depth * 100)} cm ${rule.name}（${blockers.join('、')}）`;
}

// 貼齊：佔地邊緣離牆面或其他家具的邊在 edgeSnap 內就吸過去，否則照 gridSnap 對齊。
function snapAxis(center: number, half: number, edges: number[], step: number): number {
  let bestShift: number | null = null;
  for (const edge of edges) {
    for (const side of [-1, 1]) {
      const shift = edge - (center + side * half);
      if (Math.abs(shift) < config.scene.rules.edgeSnap && (bestShift === null || Math.abs(shift) < Math.abs(bestShift))) {
        bestShift = shift;
      }
    }
  }
  return bestShift === null ? snapTo(center, step) : round3(center + bestShift);
}

// 牆和其他家具只有「並排」時才當貼齊對象（另一軸的範圍有重疊），遠處的東西不會把你吸過去。
function snapPosition(key: string, item: FurnitureItem, rawX: number, rawZ: number): Spot {
  const own = getFootprint({ ...item, x: rawX, z: rawZ });
  const reach = config.scene.rules.edgeSnap;
  const edgesX: number[] = [];
  const edgesZ: number[] = [];
  const others = Object.entries(config.furniture).filter(([otherKey]) => otherKey !== key).map(([, other]) => getFootprint(other));
  for (const fp of [...others, ...structureRects(config.scene.house)]) {
    const isAlongsideZ = fp.minZ < own.maxZ + reach && fp.maxZ > own.minZ - reach;
    const isAlongsideX = fp.minX < own.maxX + reach && fp.maxX > own.minX - reach;
    if (isAlongsideZ) edgesX.push(fp.minX, fp.maxX);
    if (isAlongsideX) edgesZ.push(fp.minZ, fp.maxZ);
  }
  const halfX = (own.maxX - own.minX) / 2;
  const halfZ = (own.maxZ - own.minZ) / 2;
  const step = config.scene.rules.gridSnap;
  return { x: snapAxis(rawX, halfX, edgesX, step), z: snapAxis(rawZ, halfZ, edgesZ, step) };
}

const statusEl = requireElement('#status', HTMLElement);
function setStatus(text: string, tone: StatusTone): void {
  statusEl.textContent = text;
  statusEl.className = tone;
}

function showLayoutStatus(): void {
  const issues = Object.entries(config.furniture)
    .map(([key, item]) => {
      const issue = findPlacementIssue(key, item, config);
      return issue && `${item.label}${issue}`;
    })
    .filter((issue): issue is string => Boolean(issue));
  if (issues.length > 0) {
    setStatus(`配置檢查：${issues.join('、')}`, 'bad');
    return;
  }
  const warnings = getClearanceReport(config.furniture, config.scene.house).filter((entry) => entry.isFailed).map(clearanceMessage);
  if (warnings.length > 0) setStatus(`活動空間提醒：${warnings.join('、')}`, 'warn');
  else setStatus('配置檢查：全部可放，活動空間足夠', 'ok');
}

// ================= 5. 視角模式 =================
// 每個模式都提供同一組介面：enter() / exit() / update(dt) / setInputLocked(bool) / allowsEditing。
// Tab 在環繞（可編輯）與第一人稱（只能看、走）之間切換，見 toggleViewMode。
function createOrbitMode(): ViewMode {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.8, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 1;
  controls.maxDistance = 30;
  let savedPosition: THREE.Vector3 | null = null;   // 切回來時回到離開前的鏡頭位置
  return {
    allowsEditing: true,
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
const MAX_SUBSTEP = 0.05;        // 每格移動切成小段，速度調高也不會穿過 0.1 m 的牆

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
  KeyQ: 'strafeLeft', KeyE: 'strafeRight', Space: 'jump', ShiftLeft: 'run', ShiftRight: 'run',
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
    land: { velocity: 0 }, lean: { velocity: 0 }, bank: { velocity: 0 },
  };
  const state = {
    height: REFERENCE_HEIGHT, phase: 0, time: 0, fwd: 0, side: 0, sag: 1, lat: 0, gait: 0,
    air: 0, land: 0, landHold: 0, lastRise: 0, wasGrounded: true, lean: 0, bank: 0,
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

  // motion：forwardSpeed／sideSpeed 是實際位移換算的速度（m/s，角色座標），撞牆時是 0，腳就不會原地空踩。
  function animate(motion: RigMotion, dt: number): void {
    if (!isBuilt || dt <= 0) return;
    state.time += dt;
    const speed = updateLocomotion(motion, dt);
    updateAirborne(motion, dt);
    const run = smoothstep(RUN_BLEND[0], RUN_BLEND[1], speed);
    const keys: GaitKeys = { hip: [], knee: [], foot: [] };
    for (const channel of GAIT_CHANNELS) keys[channel] = GAIT_KEYS.walk[channel].map((value, k) => lerp(value, GAIT_KEYS.run[channel][k], run));
    const style: GaitStyle = { ...GAIT_STYLE.walk };
    for (const key of STYLE_KEYS) style[key] = lerp(GAIT_STYLE.walk[key], GAIT_STYLE.run[key], run);
    const grounded = blendPose(idlePose(state.time), gaitPose(state.phase, keys, style, state.sag, state.lat), state.gait);
    addLandingCrouch(grounded, state.land);
    const pose = blendPose(grounded, airPose(motion.riseRatio), state.air);
    pose.spinePitch -= state.lean;
    applyPose(pose);
    hips.position.y = ground.rest - groundHeight(run) * (1 - state.air);
    tilt.rotation.z = DEG(state.bank);
  }

  return { root, build, animate };
}

// ---------- glTF 角色（Quaternius UAL1 Standard，CC0） ----------
// 用沒有根運動的版本：角色怎麼移動由程式決定，動畫只負責原地的姿勢。
const MODEL_URL = new URL('../assets/models/ual1-standard.glb', import.meta.url).href;
const ONCE_ROLES: ClipRole[] = ['jumpStart', 'jumpLand'];
const LOCOMOTION_ROLES: ClipRole[] = ['walk', 'run'];
const MODEL_FACING = Math.PI;      // 模型面向 +Z，遊戲裡角色面向 -Z
const IDLE_SPEED = 0.1;            // 低於這個速度（m/s）算站著
const CLIP_END_EPSILON = 1e-3;
const PHASE_FOOT_BONE = 'ball_l';  // 用左腳尖找步伐週期的起點
const PHASE_PROBE_SAMPLES = 48;
// 方向扭轉（orientation warping）：骨盆轉向移動方向，脊椎三節依比例轉回來，上半身維持朝前。
const PELVIS_BONE = 'pelvis';
const SPINE_COUNTER: [string, number][] = [['spine_01', 0.4], ['spine_02', 0.3], ['spine_03', 0.3]];
const WORLD_UP = new THREE.Vector3(0, 1, 0);
type AnimSlot = 'locomotion' | 'jumpStart' | 'jumpLoop' | 'jumpLand';
const ANIM_SLOTS: AnimSlot[] = ['locomotion', 'jumpStart', 'jumpLoop', 'jumpLand'];
const SLOT_OF_PHASE: Record<CharacterPhase, AnimSlot> = { ground: 'locomotion', jumpStart: 'jumpStart', jumpLoop: 'jumpLoop', land: 'jumpLand' };
const SLOT_OF_ROLE: Record<ClipRole, AnimSlot> = {
  idle: 'locomotion', walk: 'locomotion', run: 'locomotion', jumpStart: 'jumpStart', jumpLoop: 'jumpLoop', jumpLand: 'jumpLand',
};

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

// 模型載入前（或載入失敗時）先用方塊人，介面和方塊人一樣，第一人稱模式不用知道是哪一個。
// 架構照遊戲引擎的動畫狀態機：
// - 地面：一維混合空間（blend space），依速度在走路、跑步兩個節點之間插值，兩段共用同一個步伐週期；
// - 跳躍：起跳（播一次）→ 空中（循環，起跳播完還沒落地才會用到）→ 落地（播一次，蹲夠久就能被走路打斷）；
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
  const slotWeights: Record<AnimSlot, number> = { locomotion: 1, jumpStart: 0, jumpLoop: 0, jumpLand: 0 };
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
      action.timeScale = LOCOMOTION_ROLES.includes(role) ? 0 : 1;
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

  // 混合空間：blend 0 是走路原速、1 是跑步原速，中間的速度兩段按比例混。
  // 一個週期走的距離也跟著插值，所以腳不滑；往後退時週期倒著走。回傳站立／走路／跑步各自的權重。
  function updateLocomotion(motion: RigMotion, speed: number, dt: number): Record<'idle' | 'walk' | 'run', number> {
    const c = config.character;
    const blend = clamp((speed - c.clipSpeeds.walk) / (c.clipSpeeds.run - c.clipSpeeds.walk), 0, 1);
    const walk = actionFor('walk');
    const run = actionFor('run');
    const cycleLength = lerp(c.clipSpeeds.walk * walk.getClip().duration, c.clipSpeeds.run * run.getClip().duration, blend);
    const direction = motion.forwardSpeed < -IDLE_SPEED ? -1 : 1;
    cycle = wrap01(cycle + (direction * speed * dt) / cycleLength);
    for (const action of [walk, run]) action.time = wrap01(cycle + phaseOffset(action.getClip())) * action.getClip().duration;
    const fade = c.fadeSeconds;
    const step = fade > 0 ? dt / fade : 1;
    moveBlend = speed >= IDLE_SPEED ? Math.min(1, moveBlend + step) : Math.max(0, moveBlend - step);
    return { idle: 1 - moveBlend, walk: moveBlend * (1 - blend), run: moveBlend * blend };
  }

  // 下拉選單換掉的舊動作權重歸零，免得還混在姿勢裡。
  function applyWeights(locomotion: Record<'idle' | 'walk' | 'run', number>): void {
    const weights = new Map<THREE.AnimationAction, number>();
    for (const role of CLIP_ROLES) {
      const share = role === 'idle' || role === 'walk' || role === 'run' ? locomotion[role] : 1;
      const action = actionFor(role);
      weights.set(action, (weights.get(action) ?? 0) + slotWeights[SLOT_OF_ROLE[role]] * share);
    }
    for (const action of usedActions) action.setEffectiveWeight(weights.get(action) ?? 0);
  }

  // 移動方向在角色座標裡偏離正前（或正後）多少，身體就轉多少（上限 maxMoveTurn）；停下來轉回正面，空中維持不動。
  // 轉的角度先給下半身（上限 legTurnLimit，上半身仍朝前），超過的部分才轉整個模型。
  function updateFacing(motion: RigMotion, speed: number, dt: number): void {
    const c = config.character;
    let target = phase === 'ground' ? 0 : facing;
    if (phase === 'ground' && speed >= IDLE_SPEED) {
      const isBackward = motion.forwardSpeed < -IDLE_SPEED;
      const angle = isBackward
        ? Math.atan2(motion.sideSpeed, -motion.forwardSpeed)
        : -Math.atan2(motion.sideSpeed, motion.forwardSpeed);
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

  function animateModel(motion: RigMotion, dt: number): void {
    phaseTime += dt;
    if (motion.isGrounded !== wasGrounded) {
      if (motion.isGrounded) enterPhase('land', 'jumpLand');
      else enterPhase('jumpStart', 'jumpStart');
      wasGrounded = motion.isGrounded;
    }
    if (phase === 'jumpStart' && isFinished('jumpStart')) enterPhase('jumpLoop', 'jumpLoop');
    const speed = Math.hypot(motion.forwardSpeed, motion.sideSpeed);
    const canLeaveLanding = isFinished('jumpLand') || (phaseTime >= config.character.landLockSeconds && speed > IDLE_SPEED);
    if (phase === 'land' && canLeaveLanding) phase = 'ground';
    fadeSlots(SLOT_OF_PHASE[phase], dt);
    applyWeights(updateLocomotion(motion, speed, dt));
    updateFacing(motion, speed, dt);
  }

  function animate(motion: RigMotion, dt: number): void {
    if (!mixer) {
      block.animate(motion, dt);
      return;
    }
    if (dt <= 0) return;
    animateModel(motion, dt);
    undoOrientationWarp();
    mixer.update(dt);
    applyOrientationWarp();
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
    clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
    for (const role of LOCOMOTION_ROLES) phaseOffset(clips.get(config.character.clips[role]) ?? gltf.animations[0]);
    root.remove(block.root);
    root.add(model);
    skeletonHelper = new THREE.SkeletonHelper(model);
    skeletonHelper.visible = false;
    scene.add(skeletonHelper);
    mixer = new THREE.AnimationMixer(model);
    applyWeights({ idle: 1, walk: 0, run: 0 });
    return names;
  }

  // SkeletonHelper 要直接放在 scene 底下（它自己換算世界座標），所以跟著角色顯示與否要每格同步。
  function syncSkeletonHelper(): void {
    if (skeletonHelper) skeletonHelper.visible = config.character.showSkeleton && root.visible;
  }

  return { root, build, animate, load, syncSkeletonHelper };
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

  const isHeld = (action: KeyAction): boolean => [...heldCodes].some((code) => KEY_ACTIONS[code] === action);
  const isGrounded = (): boolean => isOnGround;
  const bodyHeight = (): number => eyeHeight() + HEAD_CLEARANCE;
  // 水平方向會擋的：頂面高過「能自動跨上的高度」、底面低於頭頂的方塊。
  const blocksBody = (box: THREE.Box3): boolean =>
    box.max.y > feetY + config.character.stepHeight && box.min.y < feetY + bodyHeight();
  const overlapsAt = (box: THREE.Box3, x: number, z: number): boolean =>
    x + config.character.radius > box.min.x && x - config.character.radius < box.max.x && z + config.character.radius > box.min.z && z - config.character.radius < box.max.z;
  const isFree = (x: number, z: number): boolean => !world.colliders.some((box) => blocksBody(box) && overlapsAt(box, x, z));
  const dismissHint = (): void => { hint.hidden = true; };

  // 先走 X 再走 Z，撞到就停在表面、另一軸照走，貼著牆能沿牆滑。
  // 一開始就重疊的方塊不擋（例如在環繞模式把家具搬到玩家身上），才走得出來。
  function slide(dx: number, dz: number): void {
    const p = body;
    const solids = world.colliders.filter((box) => blocksBody(box) && !overlapsAt(box, p.x, p.z));
    let x = p.x + dx;
    for (const box of solids) {
      if (overlapsAt(box, x, p.z)) x = dx > 0 ? box.min.x - config.character.radius - EPSILON : box.max.x + config.character.radius + EPSILON;
    }
    let z = p.z + dz;
    for (const box of solids) {
      if (overlapsAt(box, x, z)) z = dz > 0 ? box.min.z - config.character.radius - EPSILON : box.max.z + config.character.radius + EPSILON;
    }
    p.x = x;
    p.z = z;
  }

  // 站在 scene.spawn（預設是入口台階前、面向大門）；那裡被佔了就找最近的空位（和擺家具共用搜尋順序）。
  function findSpawn(): PlayerPose {
    const { x, z, facing } = config.scene.spawn;
    const offset = [{ dx: 0, dz: 0 }, ...SEARCH_OFFSETS].find(({ dx, dz }) => isFree(x + dx, z + dz)) ?? { dx: 0, dz: 0 };
    return { x: x + offset.dx, z: z + offset.dz, yaw: DEG(facing), pitch: 0 };
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
    if (action === 'jump' && isGrounded()) {
      velocityY = Math.sqrt(2 * config.character.gravity * config.character.jumpHeight);
      isOnGround = false;
    }
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
      const hit = cameraRay.intersectObjects([world.room, world.furniture], true)[0];
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
    return height;
  }

  // 往上時最先碰到的底面（頭頂上方、這一格會穿過的），沒有就是 Infinity。
  function ceilingHeight(x: number, z: number, fromHead: number, toHead: number): number {
    let height = Infinity;
    for (const box of world.colliders) {
      if (box.min.y >= fromHead - SURFACE_EPSILON && box.min.y < toHead && box.min.y < height && overlapsAt(box, x, z)) height = box.min.y;
    }
    return height;
  }

  // 垂直方向：站著時跟著腳下的表面上下（差在 stepHeight 內直接貼過去，像走樓梯），
  // 腳下突然空掉就開始掉；在空中受重力，落到表面就停，往上撞到底面就不再上升。
  function updateVertical(dt: number): void {
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

  // 實際位移轉成角色座標的前後／左右速度，交給方塊人決定步伐。
  function animateAvatar(dx: number, dz: number, turn: number, dt: number): void {
    if (dt <= 0) return;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    rig.animate({
      forwardSpeed: (-sin * dx - cos * dz) / dt,
      sideSpeed: (cos * dx - sin * dz) / dt,
      turnRate: turn * DEG(config.character.turnSpeed),
      isGrounded: isGrounded(),
      riseRatio: velocityY / Math.sqrt(2 * config.character.gravity * config.character.jumpHeight),
    }, dt);
  }

  function walk(forward: number, right: number, dt: number): void {
    const length = Math.hypot(right, forward);
    if (length === 0) return;
    dismissHint();
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const speed = isHeld('run') ? config.character.runSpeed : config.character.walkSpeed;
    const step = (speed * dt) / length;
    const dx = (-sin * forward + cos * right) * step;
    const dz = (-cos * forward - sin * right) * step;
    const substeps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_SUBSTEP));
    for (let i = 0; i < substeps; i++) slide(dx / substeps, dz / substeps);
  }

  return {
    allowsEditing: false,
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
      targetDistance = pose.distance ?? 0;
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
      const forward = clamp(Number(isHeld('forward')) - Number(isHeld('back')) + Number(isBothHeld), -1, 1);
      right = clamp(right, -1, 1);

      // 鍵盤轉身時鏡頭同步轉（沒抓著畫面時），不經過平滑；平滑只負責收回左鍵轉開的那段角度。
      const turnDelta = turn * THREE.MathUtils.degToRad(config.character.turnSpeed) * dt;
      yaw += turnDelta;
      if (mouseButtons === 0) cameraYaw += turnDelta;
      const startX = body.x;
      const startZ = body.z;
      walk(forward, right, dt);
      updateVertical(dt);
      animateAvatar(body.x - startX, body.z - startZ, turn, dt);
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

// ================= 6. 編輯器：選取 → 移動／旋轉／尺寸 =================
const OUTLINE_THICKNESS = 0.018;
const ROTATION_COARSE = 15;          // Q / E、拖旋轉鈕時按住 Shift
const ROTATION_MAGNET_DEG = 4;       // 自由旋轉時，離 45° 的倍數這麼近就吸過去，方便轉回正
const ROTATION_MAGNET_STEP = 45;
const RENDER_ORDER = { footprint: 5, selected: 6, handle: 10 } as const;
const GRID_CELL = 0.5;
const FOOTPRINT_CELL = 0.25;
const GRID_OPACITY = 0.35;
const LIFT_HEIGHT = 0.12;            // 拖曳時「拿起來」的高度
const MOTION_SPEED = 16;             // 越大滑得越快（指數趨近）
const HANDLE_PX = 30;                // 尺寸控制點在螢幕上的直徑
const HANDLE_GAP_PX = 8;             // 控制點和家具表面的距離
const HANDLE_HOT_SCALE = 1.18;
const HANDLE_EASE = 0.3;
const SIZE_STEP = 0.05;
const SIZE_STEP_FINE = 0.01;
const CLICK_TOLERANCE_PX = 5;
const NUDGE_FINE = config.scene.rules.gridSnap;
const NUDGE_COARSE = 0.25;
const BAR_GAP_PX = 18;
const VIEWPORT_MARGIN_PX = 8;
const READOUT_OFFSET_PX = 16;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const editor: EditorState = {
  selectedKey: null,
  hoverKey: null,
  hotId: null,          // 滑鼠底下或正在拖的控制點
  isSizeMode: false,
  gizmo: null,
  rotateCorner: [1, 1], // 旋轉鈕掛在哪個角（自身座標的正負號），見 placeRotateHandle
  rotatePush: 1,
  action: null,         // { type: 'move' | 'rotate' | 'resize', key, start, draft, handleId, issue, landing, ... }
  press: null,          // 按下但還沒判定是點擊還是拖曳視角
  handleScale: new Map(),
};

const ui = {
  actionbar: requireElement('#actionbar', HTMLElement),
  bar: requireElement('#actionbar .bar', HTMLElement),
  barName: requireElement('#actionbar .name', HTMLElement),
  sizeButton: requireElement('[data-action="size"]', HTMLElement),
  sizePanel: requireElement('.size-panel', HTMLElement),
  sizeRows: [...document.querySelectorAll('.size-row')].filter((row): row is HTMLElement => row instanceof HTMLElement),
  angleInput: requireElement('.angle input', HTMLInputElement),
  presetSelect: requireElement('.preset-row select', HTMLSelectElement),
  hint: requireElement('#hint', HTMLElement),
  readout: requireElement('#readout', HTMLElement),
};

// 尺寸列（.size-row）用 data-prop 標出它管哪個尺寸。
function sizePropOf(element: Element): SizeProp | null {
  const row = element.closest('.size-row');
  const prop = row instanceof HTMLElement ? row.dataset.prop : undefined;
  return isSizeProp(prop) ? prop : null;
}

const currentItemData = (): FurnitureItem | null =>
  editor.action?.draft ?? (editor.selectedKey ? config.furniture[editor.selectedKey] : null);

const isHot = (id: string): boolean => id === (editor.action?.handleId ?? editor.hotId);

// --- 貼圖：格線（地板與佔地格共用畫法）、尺寸控制點 ---
function createTileTexture(fillAlpha: number): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = get2dContext(canvas);
  ctx.fillStyle = `rgba(255, 255, 255, ${fillAlpha})`;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

// 圓形底＋雙向箭頭；箭頭方向每格依控制點在螢幕上的方向轉（sprite 的 material.rotation）。
function createHandleTexture({ fill, ring, arrow }: HandleColors): THREE.CanvasTexture {
  const size = 96;
  const c = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = get2dContext(canvas);
  ctx.beginPath();
  ctx.arc(c, c, 40, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.strokeStyle = arrow;
  ctx.fillStyle = arrow;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c - 16, c);
  ctx.lineTo(c + 16, c);
  ctx.stroke();
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(c + dir * 28, c);
    ctx.lineTo(c + dir * 14, c - 13);
    ctx.lineTo(c + dir * 14, c + 13);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 旋轉鈕：圓形底＋四分之三圈的弧形箭頭。
function createRotateTexture({ fill, ring, arrow }: HandleColors): THREE.CanvasTexture {
  const size = 96;
  const c = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = get2dContext(canvas);
  ctx.beginPath();
  ctx.arc(c, c, 40, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = ring;
  ctx.stroke();
  const radius = 20;
  const endAngle = -Math.PI * 0.25;
  ctx.strokeStyle = arrow;
  ctx.fillStyle = arrow;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(c, c, radius, Math.PI * 0.25, Math.PI * 1.75);
  ctx.stroke();
  // 箭頭頂點在弧的終點、沿切線方向（順時針畫，所以切線是角度 +90°）
  const tipX = c + radius * Math.cos(endAngle);
  const tipY = c + radius * Math.sin(endAngle);
  const tangent = endAngle + Math.PI / 2;
  const back = 15;
  const spread = 10;
  ctx.beginPath();
  ctx.moveTo(tipX + Math.cos(tangent) * 6, tipY + Math.sin(tangent) * 6);
  ctx.lineTo(tipX - Math.cos(tangent) * back + Math.cos(endAngle) * spread, tipY - Math.sin(tangent) * back + Math.sin(endAngle) * spread);
  ctx.lineTo(tipX - Math.cos(tangent) * back - Math.cos(endAngle) * spread, tipY - Math.sin(tangent) * back - Math.sin(endAngle) * spread);
  ctx.closePath();
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const HANDLE_STYLE = {
  normal: { fill: '#ffffff', ring: '#1fb6d5', arrow: '#0b3a45' },
  hot: { fill: '#1fb6d5', ring: '#ffffff', arrow: '#ffffff' },
};
const handleTextures: Record<HandleKind, Record<'normal' | 'hot', THREE.CanvasTexture>> = {
  size: { normal: createHandleTexture(HANDLE_STYLE.normal), hot: createHandleTexture(HANDLE_STYLE.hot) },
  rotate: { normal: createRotateTexture(HANDLE_STYLE.normal), hot: createRotateTexture(HANDLE_STYLE.hot) },
};
const handleTexture = (handle: Handle): THREE.CanvasTexture => handleTextures[handle.kind][isHot(handle.id) ? 'hot' : 'normal'];

// --- 常駐導引：地板格線、佔地格 ---
const roomGrid = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0x55606b, map: createTileTexture(0), transparent: true, opacity: 0, depthWrite: false }),
);
roomGrid.rotation.x = -Math.PI / 2;
roomGrid.position.y = PREVIEW_LIFT / 2;
roomGrid.visible = false;

// 佔地格不做深度測試、畫在其他家具之後，拖到床上時紅格才看得到；選取中的家具再畫在它之後。
const footprintFill = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: ACCENT, map: createTileTexture(0.28), transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }),
);
footprintFill.rotation.x = -Math.PI / 2;
footprintFill.renderOrder = RENDER_ORDER.footprint;
const footprintBorder = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
  new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false }),
);
footprintBorder.rotation.x = -Math.PI / 2;
footprintBorder.renderOrder = RENDER_ORDER.footprint;
const footprint = new THREE.Group();
footprint.add(footprintFill, footprintBorder);
footprint.visible = false;
const clearanceZones = new THREE.Group();
world.guides.add(roomGrid, footprint, clearanceZones);

function updateRoomGrid(): void {
  const bounds = houseBounds(config.scene.house);
  const W = bounds.maxX - bounds.minX;
  const D = bounds.maxZ - bounds.minZ;
  roomGrid.position.set((bounds.minX + bounds.maxX) / 2, roomGrid.position.y, (bounds.minZ + bounds.maxZ) / 2);
  roomGrid.scale.set(W, D, 1);
  roomGrid.material.map?.repeat.set(W / GRID_CELL, D / GRID_CELL);
}

// 佔地格畫在「放開後會落下的位置」：游標處放不下時，它會跳到最近的空位，家具本體還跟著游標。
function updateFootprint(): void {
  const item = currentItemData();
  footprint.visible = Boolean(item);
  // 活動空間要在提早 return 前更新：取消選取時也得收掉選取中那件的淺黃區域。
  updateClearanceZones();
  if (!item) return;
  const action = editor.action;
  const landing = action?.landing ?? item;
  footprint.position.set(landing.x, PREVIEW_LIFT, landing.z);
  footprint.rotation.y = THREE.MathUtils.degToRad(item.rotation);
  footprint.scale.set(item.width, 1, item.depth);
  footprintFill.material.map?.repeat.set(item.width / FOOTPRINT_CELL, item.depth / FOOTPRINT_CELL);
  let color = ACCENT;
  if (action) color = action.landing ? COLOR_OK : COLOR_BAD;
  footprintFill.material.color.setHex(color);
  footprintBorder.material.color.setHex(color);
}

// 目前的家具配置；拖曳中那件換成放開後的樣子（草稿＋落點）。
function liveFurniture(): Record<string, FurnitureItem> {
  const action = editor.action;
  if (!action) return config.furniture;
  return { ...config.furniture, [action.key]: { ...action.draft, ...(action.landing ?? {}) } };
}

// 黃色活動空間：不夠的一律顯示（深黃）；選取中的家具連夠的也顯示（淺黃），讓人知道要留多少。
function updateClearanceZones(): void {
  disposeChildren(clearanceZones);
  const activeKey = editor.action?.key ?? editor.selectedKey;
  for (const entry of getClearanceReport(liveFurniture(), config.scene.house)) {
    if (!entry.isFailed && entry.key !== activeKey) continue;
    const { item, zones, isFailed } = entry;
    const group = new THREE.Group();
    group.position.set(item.x, PREVIEW_LIFT * 0.75, item.z);
    group.rotation.y = THREE.MathUtils.degToRad(item.rotation);
    for (const { rect } of zones) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rect.w, rect.d), isFailed ? materials.clearanceWarn : materials.clearance);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(rect.cx, 0, rect.cz);
      group.add(mesh);
    }
    clearanceZones.add(group);
  }
}

// --- 動畫：家具滑向目標、地板格線淡入淡出 ---
function targetPose(key: string): Pose {
  const action = editor.action;
  const item = action?.key === key ? action.draft : config.furniture[key];
  const isLifted = action?.key === key && action.type === 'move';
  return {
    x: item.x,
    z: item.z,
    angle: THREE.MathUtils.degToRad(item.rotation),
    lift: isLifted ? LIFT_HEIGHT : 0,
  };
}

const wrapAngle = (rad: number): number => Math.atan2(Math.sin(rad), Math.cos(rad));

function animateItems(dt: number): void {
  const ease = reducedMotion.matches ? 1 : 1 - Math.exp(-MOTION_SPEED * dt);
  for (const [key, group] of itemGroups) {
    const target = targetPose(key);
    const pose = displayPoses.get(key);
    if (!pose) continue;
    // 拖控制點改尺寸時，被拖的那一面要黏著游標，不能慢半拍。
    const isResizing = editor.action?.key === key && editor.action.type === 'resize';
    const k = isResizing ? 1 : ease;
    pose.x += (target.x - pose.x) * k;
    pose.z += (target.z - pose.z) * k;
    pose.lift += (target.lift - pose.lift) * k;
    pose.angle += wrapAngle(target.angle - pose.angle) * k;
    applyPose(group, pose);
  }
}

function animateGuides(dt: number): void {
  const target = editor.selectedKey ? GRID_OPACITY : 0;
  const ease = reducedMotion.matches ? 1 : 1 - Math.exp(-MOTION_SPEED * dt);
  roomGrid.material.opacity += (target - roomGrid.material.opacity) * ease;
  roomGrid.visible = roomGrid.material.opacity > 0.01;
}

// --- 控制點（sprite：永遠面向鏡頭、螢幕上固定大小） ---
// 旋轉鈕選取後就有；尺寸控制點只在尺寸模式出現。
function buildGizmo(item: FurnitureItem, withSizeHandles: boolean): Gizmo {
  const { width: w, depth: d, height: h } = item;
  const group = new THREE.Group();
  group.position.set(item.x, 0, item.z);
  group.rotation.y = THREE.MathUtils.degToRad(item.rotation);
  const handles: HandleSprite[] = [];
  // 高度控制點從頂面中心往上推，推到家具在畫面上的最上緣之外（見 heightHandleOffset）。
  // 旋轉鈕的 base / outward 每格依 rotateCorner 更新（見 updateHandles）。
  const specs: { id: string; kind: HandleKind; base: Vec3Tuple; outward: Vec3Tuple }[] = [
    { id: 'rot', kind: 'rotate', base: [0, 0, 0], outward: [1, 0, 0] },
  ];
  if (withSizeHandles) {
    specs.push(
      { id: 'x+', kind: 'size', base: [w / 2, h / 2, 0], outward: [1, 0, 0] },
      { id: 'x-', kind: 'size', base: [-w / 2, h / 2, 0], outward: [-1, 0, 0] },
      { id: 'z+', kind: 'size', base: [0, h / 2, d / 2], outward: [0, 0, 1] },
      { id: 'z-', kind: 'size', base: [0, h / 2, -d / 2], outward: [0, 0, -1] },
      { id: 'y+', kind: 'size', base: [0, h, 0], outward: [0, 1, 0] },
    );
  }
  for (const spec of specs) {
    const handle: Handle = {
      id: spec.id,
      kind: spec.kind,
      base: new THREE.Vector3(...spec.base),
      outward: new THREE.Vector3(...spec.outward),
    };
    const material = new THREE.SpriteMaterial({ map: handleTexture(handle), depthTest: false, sizeAttenuation: false });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = RENDER_ORDER.handle;
    group.add(sprite);
    handles.push({ sprite, handle });
  }
  return { group, handles };
}

// 拿起來移動時不顯示控制點，放下後再出現。
function refreshGizmo(): void {
  world.editor.traverse((obj) => { if (obj instanceof THREE.Sprite) obj.material.dispose(); });
  disposeChildren(world.editor);
  editor.gizmo = null;
  const item = currentItemData();
  if (!item || editor.action?.type === 'move') return;
  editor.gizmo = buildGizmo(item, editor.isSizeMode);
  world.editor.add(editor.gizmo.group);
  updateOverlay();
}

function refreshHandleTextures(): void {
  if (!editor.gizmo) return;
  for (const { sprite, handle } of editor.gizmo.handles) sprite.material.map = handleTexture(handle);
}

// --- 射線與座標換算 ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmpVec = new THREE.Vector3();

function aimRay(event: PointerEvent): void {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
}

function pickFurnitureKey(): string | null {
  let obj: THREE.Object3D | null | undefined = raycaster.intersectObjects(world.furniture.children, true)[0]?.object;
  while (obj && !obj.userData.furnitureKey) obj = obj.parent;
  const key: unknown = obj?.userData.furnitureKey;
  return typeof key === 'string' ? key : null;
}

function pickHandleId(): string | null {
  const gizmo = editor.gizmo;
  if (!gizmo) return null;
  const hit = raycaster.intersectObjects(gizmo.handles.map(({ sprite }) => sprite), false)[0];
  return gizmo.handles.find(({ sprite }) => sprite === hit?.object)?.handle.id ?? null;
}

const intersectPlane = (plane: THREE.Plane): THREE.Vector3 | null => raycaster.ray.intersectPlane(plane, new THREE.Vector3());

function toScreen(worldPoint: THREE.Vector3): ScreenPoint {
  const v = worldPoint.clone().project(camera);
  const canvas = renderer.domElement;
  return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight, isVisible: v.z < 1 };
}

function worldPerPixel(distance: number): number {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  return (2 * distance * Math.tan(fov / 2)) / renderer.domElement.clientHeight;
}

// 家具自身 X / Z 軸在世界座標的方向（rotation 是從上往下看的逆時針角度）。
function localAxis(rotationDeg: number, axis: 'x' | 'z'): THREE.Vector3 {
  const angle = THREE.MathUtils.degToRad(rotationDeg);
  return axis === 'x'
    ? new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle))
    : new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
}

// 控制點方向在螢幕上的角度（逆時針、y 朝上），給箭頭旋轉和游標樣式用。
function screenAngleOf(worldFrom: THREE.Vector3, worldDir: THREE.Vector3): number {
  const from = toScreen(worldFrom);
  const to = toScreen(worldFrom.clone().add(worldDir));
  return Math.atan2(-(to.y - from.y), to.x - from.x);
}

// --- 游標樣式 ---
function resizeCursor(handleId: string): string {
  const sprite = editor.gizmo?.handles.find(({ handle }) => handle.id === handleId)?.sprite;
  if (!sprite) return '';
  const deg = ((THREE.MathUtils.radToDeg(sprite.material.rotation) % 180) + 180) % 180;
  if (deg < 22.5 || deg >= 157.5) return 'ew-resize';
  if (deg < 67.5) return 'nesw-resize';
  if (deg < 112.5) return 'ns-resize';
  return 'nwse-resize';
}

function cursorFor(handleId: string | null, furnitureKey: string | null): string {
  if (handleId === 'rot') return 'grab';
  if (handleId) return resizeCursor(handleId);
  if (furnitureKey && furnitureKey === editor.selectedKey) return 'grab';
  if (furnitureKey) return 'pointer';
  return '';
}

const setCursor = (cursor: string): void => { renderer.domElement.style.cursor = cursor; };

// --- 選取與浮動選單 ---
function select(key: string | null): void {
  if (editor.action) return;
  const previous = editor.selectedKey;
  editor.selectedKey = key;
  editor.hotId = null;
  if (!key) editor.isSizeMode = false;
  if (previous) renderItem(previous, config.furniture[previous]);
  if (key) renderItem(key, config.furniture[key]);
  if (key) revealFurnitureFolder(key);
  refreshGizmo();
  updateFootprint();
  syncActionBar();
  showLayoutStatus();
}

function toggleSizeMode(): void {
  if (!editor.selectedKey) return;
  editor.isSizeMode = !editor.isSizeMode;
  refreshGizmo();
  syncActionBar();
}

function syncActionBar(): void {
  const key = editor.selectedKey;
  const isShown = Boolean(key) && !editor.action;
  ui.actionbar.classList.toggle('visible', isShown);
  ui.actionbar.inert = !isShown;
  ui.hint.classList.toggle('visible', isShown);
  if (!key) return;
  ui.barName.textContent = config.furniture[key].label;
  ui.sizeButton.setAttribute('aria-pressed', String(editor.isSizeMode));
  ui.sizePanel.hidden = !editor.isSizeMode;
  syncInputs();
  updateOverlay();
}

const CUSTOM_PRESET = 'custom';

function syncPresetSelect(item: FurnitureItem): void {
  const { presets } = FURNITURE_SPECS[item.type];
  const select = ui.presetSelect;
  if (select.dataset.type !== item.type) {
    const custom = new Option('自訂', CUSTOM_PRESET);
    custom.disabled = true;
    select.replaceChildren(...presets.map((preset, index) => new Option(preset.name, String(index))), custom);
    select.dataset.type = item.type;
  }
  const index = presets.findIndex((preset) => SIZE_PROPS.every((prop) => Math.abs(preset[prop] - item[prop]) < EPSILON));
  select.value = index >= 0 ? String(index) : CUSTOM_PRESET;
}

function syncInputs(): void {
  const key = editor.selectedKey;
  if (!key) return;
  const item = config.furniture[key];
  for (const row of ui.sizeRows) {
    const input = row.querySelector('input');
    const prop = row.dataset.prop;
    if (!input || !isSizeProp(prop)) continue;
    const [min, max] = FURNITURE_SPECS[item.type].limits[prop];
    input.min = String(min);
    input.max = String(max);
    input.title = `範圍 ${formatRange(item.type, prop)}`;
    if (document.activeElement !== input) input.value = item[prop].toFixed(2);
  }
  syncPresetSelect(item);
  if (document.activeElement !== ui.angleInput) ui.angleInput.value = String(config.furniture[key].rotation);
}

function updateHover(): void {
  const handleId = pickHandleId();
  if (handleId !== editor.hotId) {
    editor.hotId = handleId;
    refreshHandleTextures();
  }
  const key = handleId ? null : pickFurnitureKey();
  if (key !== editor.hoverKey) {
    const previous = editor.hoverKey;
    editor.hoverKey = key;
    applyTint(previous);
    applyTint(key);
  }
  setCursor(cursorFor(handleId, key));
}

// --- 直接套用（選單、步進器、鍵盤）：不合規則就不套用 ---
function updateGuiDisplay(): void {
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

// canRelocate：旋轉後原地放不下時，改放到最近的空位（尺寸、微移不搬，直接不套用）。
function tryUpdate(key: string, patch: Partial<FurnitureItem>, canRelocate = false): boolean {
  const item = config.furniture[key];
  const candidate = { ...item, ...patch };
  const issue = findPlacementIssue(key, candidate, config);
  const spot = issue && canRelocate ? findNearestFreeSpot(key, candidate, config) : null;
  if (issue && !spot) {
    setStatus(`${item.label}：${issue}，沒有套用`, 'bad');
    return false;
  }
  Object.assign(item, candidate, spot);
  rebuildScene();
  updateGuiDisplay();
  if (spot) setStatus(`${item.label}原地${issue}，已移到最近的空位`, 'ok');
  return true;
}

function setSelectedRotation(deg: number): void {
  const key = editor.selectedKey;
  if (key) tryUpdate(key, { rotation: normalizeDeg(deg) }, true);
}

function rotateSelected(deltaDeg: number): void {
  if (editor.selectedKey) setSelectedRotation(config.furniture[editor.selectedKey].rotation + deltaDeg);
}

// 自由旋轉：1° 為單位，接近 45° 的倍數時吸過去；按住 Shift 改成每 15° 一格。
function snapRotation(deg: number, isCoarse: boolean): number {
  if (isCoarse) return normalizeDeg(Math.round(deg / ROTATION_COARSE) * ROTATION_COARSE);
  const nearest = Math.round(deg / ROTATION_MAGNET_STEP) * ROTATION_MAGNET_STEP;
  return normalizeDeg(Math.abs(deg - nearest) <= ROTATION_MAGNET_DEG ? nearest : deg);
}

// 游標相對家具中心的角度，和 rotation 同一套約定（從上往下看逆時針、0° 指向 +X）。
const pointerAngleDeg = (center: Spot, point: Spot): number => THREE.MathUtils.radToDeg(Math.atan2(-(point.z - center.z), point.x - center.x));

// 超出範圍的值停在上下限，並告訴使用者範圍是多少。
function resizeSelected(prop: SizeProp, value: number): void {
  const key = editor.selectedKey;
  if (!key) return;
  const item = config.furniture[key];
  const size = clampSize(item.type, prop, value);
  if (!tryUpdate(key, sizePatch(item, { [prop]: size }))) {
    syncInputs();
    return;
  }
  if (size !== round3(value)) {
    setStatus(`${item.label}${SIZE_NAMES[prop]}的範圍是 ${formatRange(item.type, prop)}，已停在 ${size.toFixed(2)} m`, 'warn');
  }
}

// 套用標準規格：放不下時移到最近的空位（tryUpdate 會寫狀態）。
function applyPreset(index: number): void {
  const key = editor.selectedKey;
  if (!key) return;
  const item = config.furniture[key];
  const preset = FURNITURE_SPECS[item.type].presets[index];
  if (!preset) return;
  const { width, depth, height } = preset;
  const patch = sizePatch(item, { width, depth, height });
  if (!tryUpdate(key, patch, true)) {
    syncInputs();
    return;
  }
  const isRelocated = item.x !== patch.x || item.z !== patch.z;
  if (!isRelocated) setStatus(`${item.label}改成${preset.name}`, 'ok');
}

function nudgeSelected(event: KeyboardEvent): boolean {
  const step = event.shiftKey ? NUDGE_COARSE : NUDGE_FINE;
  const moves: Record<string, [number, number] | undefined> = {
    ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
  };
  const move = moves[event.key];
  const key = editor.selectedKey;
  if (!move || !key) return false;
  const item = config.furniture[key];
  tryUpdate(key, { x: round3(item.x + move[0]), z: round3(item.z + move[1]) });
  return true;
}

// --- 拖曳動作：移動（拿起來）／改尺寸 ---
function beginAction(type: ActionType, handleId: string | null, event: PointerEvent): void {
  const key = editor.selectedKey;
  if (!key) return;
  const item = config.furniture[key];
  const action: EditorAction = {
    type, key, handleId, start: { ...item }, draft: { ...item }, issue: null, landing: null, isCrowded: false, limitNote: null,
    grabDX: 0, grabDZ: 0, grabAngle: 0, grabOffset: 0, plane: null, prop: 'width', dir: new THREE.Vector3(), anchor: new THREE.Vector3(),
  };

  if (type === 'move') {
    const floorPoint = intersectPlane(floorPlane);
    if (!floorPoint) return;
    action.grabDX = item.x - floorPoint.x;
    action.grabDZ = item.z - floorPoint.z;
  } else if (type === 'rotate') {
    const floorPoint = intersectPlane(floorPlane);
    if (!floorPoint) return;
    action.grabAngle = pointerAngleDeg(item, floorPoint) - item.rotation;
  } else if (handleId === 'y+') {
    // 改高度：用一面通過家具、面向鏡頭的垂直平面來讀滑鼠高度。
    const normal = camera.position.clone().sub(new THREE.Vector3(item.x, 0, item.z)).setY(0);
    if (normal.lengthSq() < EPSILON) normal.set(0, 0, 1);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), new THREE.Vector3(item.x, item.height, item.z));
    const hit = intersectPlane(plane);
    if (!hit) return;
    action.plane = plane;
    action.grabOffset = item.height - hit.y;
  } else if (handleId) {
    // 改寬或深：拖的那一面跟著滑鼠，對面固定不動。
    const axis = handleId[0] === 'x' ? 'x' : 'z';
    const prop = axis === 'x' ? 'width' : 'depth';
    const dir = localAxis(item.rotation, axis).multiplyScalar(handleId[1] === '+' ? 1 : -1);
    const anchor = new THREE.Vector3(item.x, 0, item.z).addScaledVector(dir, -item[prop] / 2);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -item.height / 2);
    const hit = intersectPlane(plane);
    if (!hit) return;
    Object.assign(action, { plane, prop, dir, anchor });
    action.grabOffset = item[prop] - hit.setY(0).sub(anchor).dot(dir);
  }

  editor.action = action;
  editor.press = null;
  currentMode().setInputLocked(true);
  renderer.domElement.setPointerCapture(event.pointerId);
  if (type !== 'resize') setCursor('grabbing');
  if (type === 'move') refreshGizmo();
  syncActionBar();
  showKeepClearZones();
  applyDraft(event);
}

function updateAction(event: PointerEvent): void {
  const a = editor.action;
  if (!a) return;
  const d = a.draft;
  const { sizeSnap } = config.scene.rules;

  if (a.type === 'move') {
    const p = intersectPlane(floorPlane);
    if (!p) return;
    Object.assign(d, snapPosition(a.key, d, p.x + a.grabDX, p.z + a.grabDZ));
  } else if (a.type === 'rotate') {
    const p = intersectPlane(floorPlane);
    if (!p) return;
    d.rotation = snapRotation(pointerAngleDeg(a.start, p) - a.grabAngle, event.shiftKey);
  } else if (a.handleId === 'y+') {
    const p = a.plane && intersectPlane(a.plane);
    if (!p) return;
    d.height = clampDraftSize(a, 'height', snapTo(p.y + a.grabOffset, sizeSnap));
  } else {
    const p = a.plane && intersectPlane(a.plane);
    if (!p) return;
    const size = clampDraftSize(a, a.prop, snapTo(p.setY(0).sub(a.anchor).dot(a.dir) + a.grabOffset, sizeSnap));
    d[a.prop] = size;
    d.x = round3(a.anchor.x + (a.dir.x * size) / 2);
    d.z = round3(a.anchor.z + (a.dir.z * size) / 2);
  }
  applyDraft(event);
}

// 拖控制點改尺寸：超過範圍就停在上下限，讀數標出「上限／下限」。
function clampDraftSize(action: EditorAction, prop: SizeProp, raw: number): number {
  const size = clampSize(action.draft.type, prop, raw);
  action.limitNote = null;
  if (raw > size) action.limitNote = '上限';
  else if (raw < size) action.limitNote = '下限';
  return size;
}

const RELOCATE_NOTE = '放開會移到最近的空位';
const CROWDED_NOTE = '活動空間不足';

function showReadout(event: PointerEvent): void {
  const a = editor.action;
  if (!a) return;
  const parts: string[] = [];
  if (a.type === 'resize') {
    const prop = a.handleId === 'y+' ? 'height' : a.prop;
    parts.push(`${SIZE_NAMES[prop]} ${a.draft[prop].toFixed(2)} m${a.limitNote ? `（${a.limitNote}）` : ''}`);
  }
  if (a.type === 'rotate') parts.push(`${a.draft.rotation}°`);
  if (a.issue) parts.push(a.landing ? RELOCATE_NOTE : a.issue);
  if (a.landing && a.isCrowded) parts.push(CROWDED_NOTE);
  const text = parts.join('・');
  ui.readout.textContent = text;
  ui.readout.classList.toggle('visible', Boolean(text));
  ui.readout.classList.toggle('bad', !a.landing);
  ui.readout.classList.toggle('warn', Boolean(a.landing) && a.isCrowded);
  ui.readout.style.transform = `translate(${event.clientX + READOUT_OFFSET_PX}px, ${event.clientY + READOUT_OFFSET_PX}px)`;
}

// landing：放開後實際落下的位置。移動、旋轉放不下時找最近的空位；改尺寸放不下就是 null（放開會退回）。
function applyDraft(event: PointerEvent): void {
  const a = editor.action;
  if (!a) return;
  const d = a.draft;
  a.issue = findPlacementIssue(a.key, d, config);
  if (!a.issue) a.landing = { x: d.x, z: d.z };
  else a.landing = a.type === 'resize' ? null : findNearestFreeSpot(a.key, d, config);
  const crowded = getClearanceReport(liveFurniture(), config.scene.house).filter((entry) => entry.isFailed && involvesKey(entry, a.key));
  a.isCrowded = crowded.length > 0;
  if (a.type === 'resize') renderItem(a.key, d);
  if (a.type !== 'move') refreshGizmo();
  updateFootprint();
  showReadout(event);
  const label = config.furniture[a.key].label;
  if (a.issue) setStatus(`${label}：${a.issue}${a.landing ? `，${RELOCATE_NOTE}` : '，放開會退回'}`, a.landing ? 'ok' : 'bad');
  else if (a.isCrowded) setStatus(`${label}：可以放，但${crowded.map(clearanceMessage).join('、')}`, 'warn');
  else setStatus(`${label}：可以放`, 'ok');
}

function endAction(shouldCommit: boolean): void {
  if (!editor.action) return;
  const { key, draft, issue, landing } = editor.action;
  const item = config.furniture[key];
  editor.action = null;
  currentMode().setInputLocked(false);
  disposeChildren(world.overlay);
  ui.readout.classList.remove('visible');
  const isCommitted = shouldCommit && Boolean(landing);
  if (isCommitted) Object.assign(item, draft, landing);
  rebuildScene();
  syncActionBar();
  if (isCommitted) updateGuiDisplay();
  if (isCommitted && issue) setStatus(`${item.label}原處${issue}，已移到最近的空位`, 'ok');
  else if (!isCommitted && shouldCommit) setStatus(`${item.label}放不下（${issue}），已退回`, 'bad');
}

function showKeepClearZones(): void {
  for (const { rect } of getKeepClearZones(config)) {
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(rect.maxX - rect.minX, rect.maxZ - rect.minZ), materials.keepClear);
    zone.rotation.x = -Math.PI / 2;
    zone.position.set((rect.minX + rect.maxX) / 2, PREVIEW_LIFT / 2, (rect.minZ + rect.maxZ) / 2);
    world.overlay.add(zone);
  }
}

// --- 指標事件 ---
function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !currentMode().allowsEditing) return;
  aimRay(event);
  const handleId = pickHandleId();
  if (handleId) {
    beginAction(handleId === 'rot' ? 'rotate' : 'resize', handleId, event);
    return;
  }
  const key = pickFurnitureKey();
  if (key && key === editor.selectedKey) {
    beginAction('move', null, event);
    return;
  }
  // 沒選取的家具或空白處：放開時沒移動才算點擊；有移動就交給 OrbitControls 環繞。
  editor.press = { x: event.clientX, y: event.clientY, key };
}

function onPointerMove(event: PointerEvent): void {
  aimRay(event);
  if (editor.action) updateAction(event);
  else if (currentMode().allowsEditing) updateHover();
}

function onPointerUp(event: PointerEvent): void {
  if (editor.action) {
    endAction(true);
    updateHover();
    return;
  }
  const press = editor.press;
  editor.press = null;
  if (!press) return;
  const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
  if (moved <= CLICK_TOLERANCE_PX) select(press.key);
  updateHover();
}

// 進第一人稱前先收掉編輯狀態：拖到一半的取消、選取與滑過的高亮清掉。
function toggleViewMode(): void {
  if (editor.action) endAction(false);
  select(null);
  const hovered = editor.hoverKey;
  editor.hoverKey = null;
  applyTint(hovered);
  setCursor('');
  setViewMode(activeModeName === 'orbit' ? 'firstPerson' : 'orbit');
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  // 只在焦點不在按鈕等控制項上時攔 Tab，用鍵盤在選單間移動焦點仍然可以。
  if (event.key === 'Tab' && (event.target === document.body || event.target === renderer.domElement)) {
    event.preventDefault();
    toggleViewMode();
    return;
  }
  if (!currentMode().allowsEditing) return;
  if (event.key === 'Escape') {
    if (editor.action) endAction(false);
    else select(null);
    return;
  }
  if (!editor.selectedKey || editor.action) return;
  const key = event.key.toLowerCase();
  if (key === 'r') rotateSelected(event.shiftKey ? ROTATION_STEP : -ROTATION_STEP);
  else if (key === '.') rotateSelected(-ROTATION_STEP);
  else if (key === ',') rotateSelected(ROTATION_STEP);
  else if (key === 'q') rotateSelected(event.shiftKey ? 1 : ROTATION_COARSE);
  else if (key === 'e') rotateSelected(event.shiftKey ? -1 : -ROTATION_COARSE);
  else if (key === 's') toggleSizeMode();
  else if (nudgeSelected(event)) event.preventDefault();
}

renderer.domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerup', onPointerUp);
renderer.domElement.addEventListener('pointercancel', () => editor.action && endAction(false));
renderer.domElement.addEventListener('pointerleave', () => {
  if (editor.action) return;
  const previous = editor.hoverKey;
  editor.hoverKey = null;
  applyTint(previous);
});
addEventListener('keydown', onKeyDown);

// --- 浮動選單與尺寸面板 ---
ui.bar.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const action = event.target.closest('button')?.dataset.action;
  if (action === 'rotate-ccw') rotateSelected(ROTATION_STEP);
  else if (action === 'rotate-cw') rotateSelected(-ROTATION_STEP);
  else if (action === 'size') toggleSizeMode();
  else if (action === 'done') select(null);
});

ui.angleInput.addEventListener('change', () => {
  const value = Number(ui.angleInput.value);
  if (Number.isFinite(value)) setSelectedRotation(value);
  syncInputs();
});

ui.angleInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') ui.angleInput.blur();
  if (event.key === 'Escape' && editor.selectedKey) {
    ui.angleInput.value = String(config.furniture[editor.selectedKey].rotation);
    ui.angleInput.blur();
  }
});

ui.presetSelect.addEventListener('change', () => {
  if (editor.selectedKey) applyPreset(Number(ui.presetSelect.value));
});

ui.sizePanel.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('[data-step]');
  if (!(button instanceof HTMLElement) || !editor.selectedKey) return;
  const prop = sizePropOf(button);
  if (!prop) return;
  const step = (event.shiftKey ? SIZE_STEP_FINE : SIZE_STEP) * Number(button.dataset.step);
  resizeSelected(prop, config.furniture[editor.selectedKey][prop] + step);
});

ui.sizePanel.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;   // 規格選單的 change 也會冒泡到這裡，由它自己的監聽器處理
  const value = Number(input.value);
  if (!editor.selectedKey || !Number.isFinite(value)) {
    syncInputs();
    return;
  }
  const prop = sizePropOf(input);
  if (prop) resizeSelected(prop, value);
});

ui.sizePanel.addEventListener('keydown', (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.key === 'Enter') event.target.blur();
  const prop = sizePropOf(event.target);
  if (event.key === 'Escape' && editor.selectedKey && prop) {
    event.target.value = config.furniture[editor.selectedKey][prop].toFixed(2);
    event.target.blur();
  }
});

// --- 每格更新：控制點與浮動選單跟著家具 ---
const MIN_UP_PX_PER_METER = 20;      // 鏡頭幾乎正上方時，往上推多少都看不出來，就不再加大

// 高度控制點要往上推多少公尺，才會在畫面上落在家具最上緣之上。
function heightHandleOffset(topCenterWorld: THREE.Vector3): number {
  const item = currentItemData();
  if (!item) return 0;
  const { corners } = getFootprint(item);
  const topY = toScreen(topCenterWorld).y;
  let boxTopY = topY;
  for (const c of corners) boxTopY = Math.min(boxTopY, toScreen(new THREE.Vector3(c.x, topCenterWorld.y, c.z)).y);
  const targetY = boxTopY - HANDLE_PX / 2 - HANDLE_GAP_PX;
  const upPxPerMeter = Math.max(MIN_UP_PX_PER_METER, topY - toScreen(topCenterWorld.clone().setY(topCenterWorld.y + 1)).y);
  return Math.max(0, (topY - targetY) / upPxPerMeter);
}

const handleGapWorld = (worldPoint: THREE.Vector3): number => worldPerPixel(camera.position.distanceTo(worldPoint)) * (HANDLE_PX / 2 + HANDLE_GAP_PX);
const ROTATE_PUSH_STEPS = [1, 2, 3];   // 角落太擠時，旋轉鈕沿對角線再往外推幾倍
const HANDLE_CLEARANCE_PX = HANDLE_PX + 4;

// 旋轉鈕掛在地面角落：優先畫面上最右上的角（避開下方的選單），但不能和尺寸控制點疊在一起；
// 四個角都太擠就再往外推。拖曳中固定不換位置，游標才不會抓空。
function placeRotateHandle(gizmo: THREE.Group, handle: Handle, occupied: ScreenPoint[]): number {
  const item = currentItemData();
  if (!item) return editor.rotatePush;
  const { width, depth } = item;
  if (editor.action?.type !== 'rotate') {
    let best: { score: number; corner: [number, number]; push: number } | null = null;
    for (const push of ROTATE_PUSH_STEPS) {
      for (const [sx, sz] of CORNER_SIGNS) {
        const base = new THREE.Vector3((sx * width) / 2, 0, (sz * depth) / 2);
        const outward = new THREE.Vector3(sx, 0, sz).normalize();
        const offset = handleGapWorld(gizmo.localToWorld(base.clone())) * push;
        const p = toScreen(gizmo.localToWorld(base.clone().addScaledVector(outward, offset)));
        const clearance = Math.min(Infinity, ...occupied.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
        const score = p.x - p.y;
        if (clearance >= HANDLE_CLEARANCE_PX && (!best || score > best.score)) best = { score, corner: [sx, sz], push };
      }
      if (best) break;
    }
    editor.rotateCorner = best?.corner ?? editor.rotateCorner;
    editor.rotatePush = best?.push ?? ROTATE_PUSH_STEPS[ROTATE_PUSH_STEPS.length - 1];
  }
  const [sx, sz] = editor.rotateCorner;
  handle.base.set((sx * width) / 2, 0, (sz * depth) / 2);
  handle.outward.set(sx, 0, sz).normalize();
  return editor.rotatePush;
}

function updateHandles({ group: gizmo, handles }: Gizmo): void {
  gizmo.updateMatrixWorld(true);
  const fovFactor = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / renderer.domElement.clientHeight;
  // 先放尺寸控制點，旋轉鈕最後放，才知道要避開哪裡。
  const sorted = [...handles].sort((a, b) => Number(a.handle.kind === 'rotate') - Number(b.handle.kind === 'rotate'));
  const occupied: ScreenPoint[] = [];
  for (const { sprite, handle } of sorted) {
    const push = handle.kind === 'rotate' ? placeRotateHandle(gizmo, handle, occupied) : 1;
    const { id, kind, base, outward } = handle;
    const target = isHot(id) ? HANDLE_HOT_SCALE : 1;
    const current = editor.handleScale.get(id) ?? 1;
    const next = reducedMotion.matches ? target : current + (target - current) * HANDLE_EASE;
    editor.handleScale.set(id, next);
    const baseWorld = gizmo.localToWorld(tmpVec.copy(base));
    const offset = id === 'y+' ? heightHandleOffset(baseWorld) : handleGapWorld(baseWorld) * push;
    sprite.position.copy(base).addScaledVector(outward, offset);
    const size = HANDLE_PX * next * fovFactor;
    sprite.scale.set(size, size, 1);
    const outwardWorld = outward.clone().transformDirection(gizmo.matrixWorld);
    sprite.material.rotation = kind === 'rotate' ? 0 : screenAngleOf(baseWorld.clone(), outwardWorld);
    occupied.push(toScreen(gizmo.localToWorld(sprite.position.clone())));
  }
  // 控制點剛改了位置與大小，馬上重算矩陣，同一個事件裡的射線判定才不會用到舊值。
  gizmo.updateMatrixWorld(true);
}

// 選單放在家具在螢幕上的最下緣之下；下面放不下就改放上面。
function placeActionBar(item: FurnitureItem): void {
  if (!ui.actionbar.classList.contains('visible')) return;
  const points: ScreenPoint[] = [];
  for (const c of getFootprint(item).corners) {
    for (const y of [0, item.height]) points.push(toScreen(new THREE.Vector3(c.x, y, c.z)));
  }
  const center = toScreen(new THREE.Vector3(item.x, item.height / 2, item.z));
  const barWidth = ui.actionbar.offsetWidth;
  const barHeight = ui.actionbar.offsetHeight;
  const bottomY = Math.max(...points.map((p) => p.y));
  const topY = Math.min(...points.map((p) => p.y));
  let top = bottomY + BAR_GAP_PX;
  if (top + barHeight > innerHeight - VIEWPORT_MARGIN_PX) top = topY - BAR_GAP_PX - barHeight;
  top = clamp(top, VIEWPORT_MARGIN_PX, innerHeight - barHeight - VIEWPORT_MARGIN_PX);
  const left = clamp(center.x - barWidth / 2, VIEWPORT_MARGIN_PX, innerWidth - barWidth - VIEWPORT_MARGIN_PX);
  ui.actionbar.style.transform = `translate(${left}px, ${top}px)`;
}

function updateOverlay(): void {
  const item = currentItemData();
  if (!item) return;
  if (editor.gizmo) updateHandles(editor.gizmo);
  placeActionBar(item);
}

// ================= 7. Inspector（lil-gui） =================
// 仿 Unity Inspector：分成場景／家具／角色／鏡頭四組，改的就是 config（也就是 scene.config.json 的內容）。
// 「儲存」只在 vite dev 有（寫回 JSON 的外掛在 vite.config.ts），打包後整段被移除。
const SAVE_FEEDBACK_MS = 1500;
const CLIP_ROLE_NAMES: Record<ClipRole, string> = {
  idle: '站立', walk: '走路', run: '跑步', jumpStart: '起跳', jumpLoop: '空中', jumpLand: '落地',
};
const furnitureFolders = new Map<string, GUI>();
let furnitureGroup: GUI | null = null;
let clipNames: string[] = [];
// 「還原預設」回到上次儲存的內容（還沒存過就是開頁面時讀到的 JSON）。
let savedSnapshot: SceneConfig = structuredClone(config);

const OPENING_KIND_NAMES: Record<Opening['kind'], string> = { door: '門', slider: '拉門', window: '窗' };

function addOpeningFolder(parent: GUI, wall: Wall, opening: Opening): void {
  const folder = parent.addFolder(`${opening.label}（${OPENING_KIND_NAMES[opening.kind]}）`);
  folder.add(opening, 'offset', 0, wallLength(wall), 0.05).name('離牆起點（m）').onChange(rebuildScene);
  folder.add(opening, 'width', 0.3, 4, 0.05).name('寬').onChange(rebuildScene);
  folder.add(opening, 'height', 0.3, 2.6, 0.05).name('高').onChange(rebuildScene);
  if ('sill' in opening) folder.add(opening, 'sill', 0, 2, 0.05).name('離地').onChange(rebuildScene);
  folder.close();
}

// 牆與地板的形狀只在 scene.config.json 改；這裡調牆高、牆厚與每個門窗。
function addSceneGroup(panel: GUI): void {
  const { house, rules } = config.scene;
  const group = panel.addFolder('場景');
  const structure = group.addFolder('房屋');
  structure.add(house, 'wallHeight', 2, 4, 0.05).name('牆高').onChange(rebuildScene);
  structure.add(house, 'wallThickness', 0.05, 0.4, 0.01).name('牆厚').onChange(rebuildScene);
  structure.add(config.scene, 'groundMargin', 1, 10, 0.5).name('草地外擴（m）').onChange(rebuildScene);
  const openings = group.addFolder('門窗');
  for (const wall of house.walls) {
    for (const opening of wall.openings) addOpeningFolder(openings, wall, opening);
  }
  openings.close();
  const snap = group.addFolder('編輯吸附');
  snap.add(rules, 'gridSnap', 0.01, 0.5, 0.01).name('格線（m）');
  snap.add(rules, 'edgeSnap', 0, 0.5, 0.01).name('貼邊距離（m）');
  snap.add(rules, 'sizeSnap', 0.005, 0.1, 0.005).name('尺寸步進（m）');
  snap.add(rules, 'windowClearance', 0, 1, 0.05).name('窗前淨空（m）').onChange(rebuildScene);
  snap.close();
}

function addFurnitureGroup(panel: GUI): void {
  furnitureGroup = panel.addFolder('家具');
  furnitureFolders.clear();
  for (const [key, item] of Object.entries(config.furniture)) {
    const folder = furnitureGroup.addFolder(item.label);
    const { limits } = FURNITURE_SPECS[item.type];
    folder.add(item, 'x', -6, 6, 0.05).name('位置 X').onChange(rebuildScene);
    folder.add(item, 'z', -6, 6, 0.05).name('位置 Z').onChange(rebuildScene);
    folder.add(item, 'rotation', 0, 359, 1).name('旋轉（度）').onChange(rebuildScene);
    for (const prop of SIZE_PROPS) {
      const [min, max] = limits[prop];
      folder.add(item, prop, min, max, 0.01).name(SIZE_NAMES[prop]).onChange(rebuildScene);
    }
    folder.close();
    furnitureFolders.set(key, folder);
  }
  furnitureGroup.close();
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
  select(null);
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
  addFurnitureGroup(panel);
  addCharacterGroup(panel);
  addCameraGroup(panel);
  if (innerWidth < 768) panel.close();
  return panel;
}

// 點選家具時只展開那件的分組，其他收起來，並捲到看得到的地方。
function revealFurnitureFolder(key: string): void {
  const target = furnitureFolders.get(key);
  if (!target || !furnitureGroup) return;
  gui.open();
  furnitureGroup.open();
  for (const folder of furnitureFolders.values()) folder.open(folder === target);
  target.domElement.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

// ================= 8. 啟動 =================
let gui = buildInspector();
character.load()
  .then((names) => {
    clipNames = names;
    if (animationFolder) addClipControllers(animationFolder);
  })
  .catch((error: unknown) => console.error(`角色模型載入失敗（${MODEL_URL}），繼續用方塊人：`, error));
setViewMode('orbit');
rebuildScene();

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
  animateItems(dt);
  animateGuides(dt);
  character.syncSkeletonHelper();
  updateOverlay();
  renderer.render(scene, camera);
});
