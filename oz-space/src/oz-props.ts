// OZ 世界的環樣式與周圍漂浮物（先做外觀）：每種環長什麼樣子、哪裡站得上去（Disc），以及會上下飄的東西（Floater）。
// 擺放都用固定種子的亂數，每次重新整理長得一樣。大量重複的小東西（房屋、書、桌椅、碎片）用 InstancedMesh，一種形狀一次畫完。
// 設計規則：蜂窩狀六邊形一律有一格是不同顏色（見 addHexPad）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RingStyle } from './config/scene.config';

/** 圓心在原點的環形平板（inner 是 0 就是實心圓）：只管站上去和撞頭。有 arc 時只有這段角度站得住（角度 = atan2(x, z)）。 */
export interface Disc { inner: number; outer: number; minY: number; maxY: number; arc?: { start: number; length: number } }

/** 會上下飄的東西：apply(dy) 把它放到基準位置往上 dy 公尺。 */
export interface Floater {
  amplitude: number; speed: number; phase: number; apply: (dy: number) => void;
  /** 跟著飄的碰撞方塊：每格把 minY／maxY 設成基準高度 + dy，站在上面的人就跟著上下。 */
  solid?: { box: SolidBox; minY: number; maxY: number };
}

/**
 * 圓心在原點的圓形牆（例如泳池池壁）：高度 minY–maxY 之間水平方向擋。solid 是哪一側是實心的：
 * inside 是半徑以內實心（只能待在外面），outside 是半徑以外實心（只能待在裡面）。
 */
export interface RoundWall { radius: number; minY: number; maxY: number; solid: 'inside' | 'outside'; arc?: { start: number; length: number } }

/** 水平方向擋人的有向方塊（和 main.ts 的 Solid 同形狀）：中心、自身兩個水平軸的方向（單位向量）與半長、高度範圍。 */
export interface SolidBox { cx: number; cz: number; ux: number; uz: number; vx: number; vz: number; hu: number; hv: number; minY: number; maxY: number; standable?: boolean }

/** 圓心在原點的環形水域（泳池）：半徑在 inner–outer 之間、高度在 floorY–surfaceY 之間是水。 */
export interface WaterZone { inner: number; outer: number; surfaceY: number; floorY: number }

/**
 * 建出來的東西分兩組：solid 是環本體（站得上去，第三人稱鏡頭會避開），decor 是裝飾（沒有碰撞，鏡頭直接穿過，
 * 數量多時才不會每格都對幾千個物件打射線）。
 */
export interface PropsBuild { solid: THREE.Group; decor: THREE.Group; discs: Disc[]; floaters: Floater[]; walls: RoundWall[]; waters: WaterZone[]; solids: SolidBox[] }

/** 一圈環的位置與樣式。 */
export interface RingSpec { style: RingStyle; inner: number; outer: number; minY: number; maxY: number; color: number; seed: number; bobScale: number }

/** 周圍漂浮物的數量與要避開的範圍。cone.headTop 是貓頭耳尖的高度。 */
export interface FieldSpec {
  islands: number; platforms: number; hexPads: number; debris: number; clusters: number; bobScale: number; fieldRadius: number; seed: number;
  rings: { inner: number; outer: number; minY: number; maxY: number }[];
  cone: { tipY: number; topY: number; topRadius: number; headTop: number };
}

type Rng = () => number;
type Range = [number, number];
/** Batch 裡的一個實例：哪一批、第幾個、原本的矩陣（漂浮時以它為基準上下移）。 */
export interface Part { batch: Batch; index: number; base: THREE.Matrix4 }

const TAU = Math.PI * 2;
const RING_SEGMENTS = 128;

// 上下飄：兩個正弦相加，第二個的頻率是不成整數比的倍數，合起來不會規律重複，看起來像不規則的飄。
const BOB_AMPLITUDE: Range = [0.3, 1.5];   // m
const BOB_PERIOD: Range = [4, 9];          // 秒
const BOB_HARMONIC = 1.731;
const BOB_HARMONIC_SHARE = 0.3;

const PLACE_ATTEMPTS = 30;

// 破碎的環：2/3 碎掉。從兩邊斷口往缺口中間走，碎片由大漸漸變小、越來越稀、偏離越多。
const BROKEN_SHARE = 2 / 3;
const FRAGMENT_LARGE = 10;             // 斷口旁的碎片大小（m）
const FRAGMENT_SMALL = 1.5;            // 缺口正中間的碎片大小
const FRAGMENT_SPARSE = 0.55;          // 缺口正中間有這個比例的位置是空的
const FRAGMENT_DRIFT = 7;              // 缺口正中間的碎片最多偏離環面幾公尺
const FRAGMENT_TILT = 0.5;
const FRAGMENT_FLOAT_FROM = 0.12;      // 走過缺口一半的這個比例之後的碎片才飄，貼著斷口的固定不動
const JAG_POINTS = 5;                  // 斷口的鋸齒點數
const JAG_DEPTH = 4;                   // 鋸齒最多往完整段內咬幾公尺

// 全是碎塊的環
const SHARD_AREA = 40;
const SHARD_SIZE: Range = [1.5, 6];
const SHARD_THICKNESS: Range = [0.3, 1.5];
const SHARD_RISE = 3;
const SHARD_TILT = 0.5;
const SHARD_CHUNK_CHANCE = 0.2;
const SHARD_BOB = 0.6;

// 飄著的書：大小偏向小本（指數 > 1），少數是巨大的書。張開角度：0 闔上、π 攤平。
const FLYING_BOOK_AREA = 70;
const FLYING_BOOK_WIDTH: Range = [0.6, 4];
const FLYING_BOOK_SIZE_BIAS = 2;
const FLYING_BOOK_RISE = 8;
const FLYING_BOOK_TILT = 0.9;
const BOOK_ASPECT: Range = [1.3, 1.6];      // 書高 ÷ 半邊寬
const BOOK_PAGES: Range = [0.08, 0.25];     // 半邊書頁厚 ÷ 半邊寬
const BOOK_COVER = 0.03;                    // 封面厚 ÷ 半邊寬
const BOOK_STATES: { share: number; opening: Range }[] = [
  { share: 0.35, opening: [0.02, 0.05] },   // 闔上
  { share: 0.3, opening: [0.6, 1.6] },      // 半開
  { share: 0.35, opening: [2.6, 3.1] },     // 攤開
];

// 空中圖書館：環面是木地板，上面一圈圈雙面書櫃，書櫃之間是走道，每圈書櫃有幾個缺口可以穿過去。
const LIBRARY_WALLS = 4;
const LIBRARY_FLOOR = 1;
const LIBRARY_HEIGHT = 10;
const LIBRARY_LEVELS = 3;
const LIBRARY_BAY_DEPTH = 1.4;         // 單面書格深度
const LIBRARY_BACK = 0.3;              // 雙面書櫃中間的背板
const LIBRARY_TOP = 0.4;
const LIBRARY_OPENINGS = 5;            // 每圈書櫃的缺口數
const LIBRARY_OPENING_WIDTH = 4.5;
const SHELF_BOARD = 0.25;
const SHELF_BAY_WIDTH = 6;
const SHELF_DIVIDER = 0.3;
const BOOK_THICKNESS: Range = [0.18, 0.45];
const BOOK_HEIGHT: Range = [0.6, 0.92];    // 佔書格高度的比例
const BOOK_DEPTH: Range = [0.75, 0.95];    // 佔書格深度的比例
const BOOK_GAP_CHANCE = 0.05;
const BOOK_GAP: Range = [0.3, 1.2];

// 三層環
const TRIPLE_GAP = 5;
const TRIPLE_SHADE = 0.08;

// 環狀美食街：分成幾個區，每區一種擺法，區和區之間留走道；地面用低彩度的顏色。
const FOOD_ZONES: Range = [8, 12];
const FOOD_WALKWAY = 5;                // 區和區之間的走道寬（m）
const FOOD_EDGE = 2;
const FOOD_PATCH = 0.03;               // 每區地面色塊的厚度：疊在環面上，看得出分區
const STALL_SPACING: Range = [4.2, 5.5];
const STALL_SIZE: [number, number, number] = [3.5, 2.6, 2.5];
const AWNING_DEPTH = 1.4;
const AWNING_DROOP = 0.3;
const TABLE_CLEARANCE = 2.8;           // 桌子之間至少隔多遠（中心距）
const CLUSTER_TABLES: Range = [5, 12];
const CLUSTER_SPREAD: Range = [4, 8];
const LONG_TABLE_LENGTH: Range = [5, 8];
const LONG_TABLE_ROW = 3.4;
const LONG_TABLE_COLUMN = 1.5;         // 長桌之間沿長邊方向的空隙
const PLANTERS: Range = [5, 10];
const ROUND_TABLE_CHANCE = 0.55;
const ROUND_CHAIR_OFFSET = 0.95;
const SQUARE_CHAIR_OFFSET = 0.75;
const BENCH_OFFSET = 0.7;

// 周圍漂浮物：大部分聚在幾個聚集處（常態分布散開），少數零散。
const FIELD_INNER = 20;
const FIELD_LOW = 15;
const FIELD_ABOVE_HEAD = 60;
const FIELD_RADIUS_BIAS = 1.6;         // > 1 時越靠近中央越密
const FIELD_RING_MARGIN = 14;          // 和環上下至少隔多遠（含書櫃、漂浮房屋的範圍）
const FIELD_CONE_MARGIN = 5;
const FIELD_HEAD_WIDTH = 1.3;          // 貓頭（含耳朵）的水平半徑是平台半徑的幾倍
const CLUSTER_SHARE = 0.8;
const CLUSTER_RADIUS: Range = [25, 60];
const CLUSTER_FLATNESS = 0.4;          // 聚集處上下比水平方向集中
const ISLAND_RADIUS: Range = [6, 22];
const ISLAND_TOP: Range = [1.2, 2.5];
const ISLAND_DEPTH: Range = [0.8, 1.6];    // 岩塊深度是半徑的幾倍
const ISLAND_ROCK = 0.75;
const ISLAND_TILT = 0.08;
const PLATFORM_SIZE: Range = [4, 14];
const PLATFORM_THICKNESS: Range = [0.6, 2];
const PLATFORM_TILT = 0.06;
const PLATFORM_TIER_CHANCE = 0.4;      // 上面再疊一層較小平台的機率
const PLATFORM_TIER_SCALE: Range = [0.4, 0.7];
const HEX_RADIUS: Range = [1.5, 3];
const HEX_THICKNESS = 0.5;
const HEX_JITTER = 0.3;
const HEX_SPACING = 1.06;
const HEX_DROP_CHANCE = 0.25;
const HEX_TILT = 0.1;
const DEBRIS_SIZE: Range = [0.4, 3.5];

const SHARD_COLORS = [0xf2545b, 0xf59a3a, 0xf2d04b, 0x6cc56b, 0x4aa8e8, 0x5b6ee1, 0xa064d9, 0xffffff, 0xe6e9f0, 0x2fd3c6, 0xff7ac3];
const BOOK_COLORS = [0x8c2f39, 0xb5523b, 0xd9a441, 0x3f6b55, 0x2f4b7c, 0x5c5470, 0x1f2a36, 0xe8dcc2, 0x7a9e7e, 0xc96f53, 0x4a6fa5, 0x9b4f96];
const PAGE_COLORS = [0xfbf8f0, 0xf4eedf, 0xfffdf7];
const TABLE_COLORS = [0xffffff, 0xf4efe6, 0xb9b2a6, 0x8a5a3b, 0x6b7280];
const CHAIR_COLORS = [0x8a5a3b, 0x2b2b2b, 0xa89f94, 0x6b7f8e, 0xc7b299, 0xe6e9f0];
const FOOD_FLOOR = 0xd9d3c9;
const FOOD_PATCH_COLORS = [0xcfc7ba, 0xc8ccd0, 0xd4cbbd, 0xc2c9bd, 0xd0c6c2, 0xc9c3b5];
const STALL_COLORS = [0xf4efe6, 0xe8e2d6, 0xdfe3e8, 0xefe6dc];
const AWNING_COLORS = [0xc0574f, 0xd49a4a, 0x6f9c6a, 0x5d8fb0, 0x8c6fa8, 0xc7764a];
const POT_COLORS = [0x9a8f84, 0xb8afa4, 0x857b72];
const BUSH_COLORS = [0x6cb86a, 0x5fa85d, 0x7cc576];
const GRASS_COLORS = [0x7cc576, 0x6cb86a, 0x8fd18a, 0x5fa85d];
const ROCK_COLORS = [0x9a8f84, 0x857b72, 0xa89f94];
const PLATFORM_COLORS = [0xffffff, 0xe6e9f0, 0xdfe8f0, 0xf4efe6, 0xcfe3f7, 0xf7d9e3, 0xe0f2e9];
const PLATFORM_ACCENTS = [0x4aa8e8, 0xf2d04b, 0xff7ac3, 0x2fd3c6, 0xf59a3a];
const HEX_COLORS = [0x2fd3c6, 0xf2d04b, 0xffffff, 0x4aa8e8, 0xff7ac3, 0x6cc56b];
const WOOD = 0xb08a63;
const WOOD_DARK = 0x6e5440;
const WOOD_FLOOR = 0xc9a77c;

// ---------- 亂數與小工具 ----------
/** 固定種子的亂數（mulberry32）：同一個種子每次產生同一串數字。 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const range = (rng: Rng, [min, max]: Range): number => min + (max - min) * rng();
const spread = (rng: Rng, half: number): number => (rng() * 2 - 1) * half;
// 近似常態分布（四個均勻亂數相加），標準差約 0.58
const gaussian = (rng: Rng): number => rng() + rng() + rng() + rng() - 2;
function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error('pick：清單是空的');
  return item;
}
// 角度 θ（atan2(x, z)）、半徑 r 的水平位置
const polarX = (r: number, theta: number): number => r * Math.sin(theta);
const polarZ = (r: number, theta: number): number => r * Math.cos(theta);
const shade = (color: number, amount: number): number => new THREE.Color(color).offsetHSL(0, 0, amount).getHex();

const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpEuler = new THREE.Euler();
const tmpMatrix = new THREE.Matrix4();

// 位置、轉向（先轉 yaw 再前後左右歪）、縮放 → 矩陣。
function transform(x: number, y: number, z: number, yaw: number, tiltX: number, tiltZ: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  tmpEuler.set(tiltX, yaw, tiltZ, 'YXZ');
  return new THREE.Matrix4().compose(tmpPosition.set(x, y, z), tmpQuaternion.setFromEuler(tmpEuler), tmpScale.set(sx, sy, sz));
}

// ---------- 材質與共用形狀 ----------
// 實例顏色會乘上材質顏色，所以材質用白色。碎片類用 flatShading，邊角才看得出來。
const instanceMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
const flatMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
const colorMaterials = new Map<number, THREE.MeshLambertMaterial>();
export function colorMaterial(color: number): THREE.MeshLambertMaterial {
  const existing = colorMaterials.get(color);
  if (existing) return existing;
  const material = new THREE.MeshLambertMaterial({ color });
  colorMaterials.set(color, material);
  return material;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('合併形狀失敗：各部分的屬性不一致');
  return merged;
}
const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cylinderAt = (radius: number, h: number, y: number, segments: number): THREE.BufferGeometry => new THREE.CylinderGeometry(radius, radius, h, segments).translate(0, y, 0);
// 平面形狀擠出成水平的板子：厚 1、置中在 y = 0。
const flatPlate = (points: THREE.Vector2[]): THREE.BufferGeometry =>
  new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: 1, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.5, 0);
const outline = (coords: number[][]): THREE.Vector2[] => coords.map(([x = 0, y = 0]) => new THREE.Vector2(x, y));

// 每個形狀都是單位大小，用實例的縮放決定實際尺寸。
const GEOMETRY = (() => {
  const shapeRng = createRng(7);
  const slab = (): THREE.BufferGeometry => {
    const corners = 5 + Math.floor(shapeRng() * 4);
    return flatPlate(Array.from({ length: corners }, (_, i) => {
      const angle = ((i + spread(shapeRng, 0.3)) / corners) * TAU;
      const radius = range(shapeRng, [0.55, 1]);
      return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }));
  };
  const legs = (h: number, x: number, z: number, size: number): THREE.BufferGeometry[] =>
    [[-x, -z], [x, -z], [-x, z], [x, z]].map(([lx = 0, lz = 0]) => boxAt(size, h, size, lx, h / 2, lz));
  const ringProfile = outline([[0.55, -0.5], [1, -0.5], [1, 0.5], [0.55, 0.5], [0.55, -0.5]]);
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    baseBox: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),   // 底面在 y = 0
    // 三角形屋頂往深度方向擠出：底邊寬 1、高 1，屋脊沿 z
    roof: new THREE.ExtrudeGeometry(new THREE.Shape(outline([[-0.5, 0], [0.5, 0], [0, 1]])), { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5),
    slabs: Array.from({ length: 8 }, slab),
    chunks: [new THREE.DodecahedronGeometry(1), new THREE.IcosahedronGeometry(1), new THREE.OctahedronGeometry(1), new THREE.TetrahedronGeometry(1)],
    hex: new THREE.CylinderGeometry(1, 1, 1, 6),
    rock: new THREE.ConeGeometry(1, 1, 7).rotateX(Math.PI).translate(0, -0.5, 0),   // 尖端朝下，底面在 y = 0
    // 漂浮平台的各種形狀（都是厚 1、置中）：方、圓、三角、環、十字、L、不規則
    platforms: [
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
      new THREE.CylinderGeometry(0.6, 0.6, 1, 3),
      new THREE.LatheGeometry(ringProfile, 48).scale(0.5, 1, 0.5),
      flatPlate(outline([[-0.15, -0.5], [0.15, -0.5], [0.15, -0.15], [0.5, -0.15], [0.5, 0.15], [0.15, 0.15], [0.15, 0.5], [-0.15, 0.5], [-0.15, 0.15], [-0.5, 0.15], [-0.5, -0.15], [-0.15, -0.15]])),
      flatPlate(outline([[-0.5, -0.5], [0.5, -0.5], [0.5, -0.1], [-0.1, -0.1], [-0.1, 0.5], [-0.5, 0.5]])),
      slab(),
    ],
    // 書的半邊：鉸鏈（書脊）在原點、沿 z；右半邊往 +x、左半邊往 -x。書頁在 y 0–1，封面在 y -1–0。
    pagesRight: new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0),
    pagesLeft: new THREE.BoxGeometry(1, 1, 1).translate(-0.5, 0.5, 0),
    coverRight: new THREE.BoxGeometry(1, 1, 1).translate(0.5, -0.5, 0),
    coverLeft: new THREE.BoxGeometry(1, 1, 1).translate(-0.5, -0.5, 0),
    chair: merge([boxAt(0.45, 0.05, 0.45, 0, 0.45, 0), boxAt(0.45, 0.5, 0.05, 0, 0.72, -0.2), ...legs(0.45, 0.19, 0.19, 0.04)]),
    roundTable: merge([cylinderAt(0.6, 0.05, 0.75, 24), cylinderAt(0.05, 0.72, 0.36, 8), cylinderAt(0.3, 0.03, 0.015, 16)]),
    squareTable: merge([boxAt(1.2, 0.05, 0.8, 0, 0.75, 0), ...legs(0.72, 0.55, 0.35, 0.05)]),
    // 長桌、長椅沿 x 方向，用實例的 x 縮放決定長度
    longTable: merge([boxAt(1, 0.05, 0.9, 0, 0.75, 0), boxAt(0.04, 0.72, 0.8, -0.42, 0.36, 0), boxAt(0.04, 0.72, 0.8, 0.42, 0.36, 0)]),
    bench: merge([boxAt(1, 0.05, 0.35, 0, 0.45, 0), boxAt(0.04, 0.45, 0.3, -0.44, 0.225, 0), boxAt(0.04, 0.45, 0.3, 0.44, 0.225, 0)]),
    pot: new THREE.CylinderGeometry(1, 0.8, 1, 16).translate(0, 0.5, 0),
    bush: new THREE.IcosahedronGeometry(1, 1),
  };
})();

/** 同一種形狀的一批實例：先收集位置與顏色，build() 時一次建成 InstancedMesh。 */
export class Batch {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  mesh: THREE.InstancedMesh | null = null;
  private readonly matrices: THREE.Matrix4[] = [];
  private readonly colors: THREE.Color[] = [];

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material = instanceMaterial) {
    this.geometry = geometry;
    this.material = material;
  }

  add(matrix: THREE.Matrix4, color: number): Part {
    this.matrices.push(matrix);
    this.colors.push(new THREE.Color(color));
    return { batch: this, index: this.matrices.length - 1, base: matrix };
  }

  build(): THREE.InstancedMesh | null {
    if (this.matrices.length === 0) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.matrices.length);
    this.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    this.colors.forEach((color, i) => mesh.setColorAt(i, color));
    mesh.frustumCulled = false;   // 實例會上下飄，整批的包圍球不會跟著更新；一批一次繪製，不裁切也不貴
    this.mesh = mesh;
    return mesh;
  }
}

function addBatches(group: THREE.Group, batches: Batch[]): void {
  for (const batch of batches) {
    const mesh = batch.build();
    if (mesh) group.add(mesh);
  }
}

function makeFloater(rng: Rng, scale: number, apply: (dy: number) => void): Floater {
  return { amplitude: range(rng, BOB_AMPLITUDE) * scale, speed: TAU / range(rng, BOB_PERIOD), phase: rng() * TAU, apply };
}

// 一組實例一起飄（例如房屋的牆和屋頂）。
function floatParts(parts: Part[]): (dy: number) => void {
  return (dy) => {
    for (const part of parts) {
      const mesh = part.batch.mesh;
      if (!mesh) continue;
      tmpMatrix.copy(part.base);
      tmpMatrix.elements[13] += dy;
      mesh.setMatrixAt(part.index, tmpMatrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
}

// 漂浮物的碰撞：一組實例在世界座標裡的外框（不轉的方塊，斜放的東西外框會大一點），頂面站得上去。
// 每個形狀先算一次單位幾何的外框，再用實例的矩陣換到世界座標。
const partBox = new THREE.Box3();
function partsSolid(parts: Part[]): SolidBox {
  const bounds = new THREE.Box3();
  for (const part of parts) {
    part.batch.geometry.boundingBox ?? part.batch.geometry.computeBoundingBox();
    const box = part.batch.geometry.boundingBox;
    if (box) bounds.union(partBox.copy(box).applyMatrix4(part.base));
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  return { cx: center.x, cz: center.z, ux: 1, uz: 0, vx: 0, vz: 1, hu: size.x / 2, hv: size.z / 2, minY: bounds.min.y, maxY: bounds.max.y, standable: true };
}

/** 一組會飄的實例：加進飄動清單，同時加一個跟著飄的碰撞方塊。 */
export function addFloater(build: PropsBuild, rng: Rng, scale: number, parts: Part[]): void {
  const floater = makeFloater(rng, scale, floatParts(parts));
  const box = partsSolid(parts);
  floater.solid = { box, minY: box.minY, maxY: box.maxY };
  build.floaters.push(floater);
  build.solids.push(box);
}

/** 每格呼叫：time 是累計秒數。 */
export function updateFloaters(floaters: Floater[], time: number): void {
  for (const floater of floaters) {
    const wave = Math.sin(time * floater.speed + floater.phase) * (1 - BOB_HARMONIC_SHARE) +
      Math.sin(time * floater.speed * BOB_HARMONIC + floater.phase * 2) * BOB_HARMONIC_SHARE;
    const dy = floater.amplitude * wave;
    floater.apply(dy);
    if (floater.solid) {
      floater.solid.box.minY = floater.solid.minY + dy;
      floater.solid.box.maxY = floater.solid.maxY + dy;
    }
  }
}

// ---------- 環本體 ----------
// 有厚度的完整環形平板：截面是長方形，繞 Y 軸轉一圈。
export function annulus(inner: number, outer: number, minY: number, maxY: number, material: THREE.Material): THREE.Mesh {
  const profile = outline([[inner, minY], [outer, minY], [outer, maxY], [inner, maxY], [inner, minY]]);
  return new THREE.Mesh(new THREE.LatheGeometry(profile, RING_SEGMENTS), material);
}

// 只有一段角度的環形平板；給 rng 時兩端是不規則的斷口。Shape 畫在 xy 平面，轉成水平後 (x, y) 會變成世界的 (x, -z)。
function arcSlab(inner: number, outer: number, minY: number, maxY: number, start: number, length: number, material: THREE.Material, rng?: Rng): THREE.Mesh {
  const point = (r: number, theta: number): THREE.Vector2 => new THREE.Vector2(polarX(r, theta), -polarZ(r, theta));
  const steps = Math.max(4, Math.ceil((length / TAU) * RING_SEGMENTS));
  const jag = (from: number, to: number, edge: number, inward: number): THREE.Vector2[] => (rng
    ? Array.from({ length: JAG_POINTS }, (_, k) => {
      const r = from + ((to - from) * (k + 1)) / (JAG_POINTS + 1);
      return point(r, edge + (inward * rng() * JAG_DEPTH) / r);
    })
    : []);
  const end = start + length;
  const points = [
    ...Array.from({ length: steps + 1 }, (_, i) => point(outer, start + (length * i) / steps)),
    ...jag(outer, inner, end, -1),
    ...Array.from({ length: steps + 1 }, (_, i) => point(inner, end - (length * i) / steps)),
    ...jag(inner, outer, start, 1),
  ];
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: maxY - minY, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = minY;
  return mesh;
}

// 有向方塊碰撞：中心 (cx, cz)、轉 yaw（和 Object3D.rotation.y 同方向）、自身 x 方向長 sizeX、z 方向長 sizeZ。
export function orientedSolid(cx: number, cz: number, yaw: number, sizeX: number, sizeZ: number, minY: number, maxY: number): SolidBox {
  return { cx, cz, ux: Math.cos(yaw), uz: -Math.sin(yaw), vx: Math.sin(yaw), vz: Math.cos(yaw), hu: sizeX / 2, hv: sizeZ / 2, minY, maxY };
}

const fullDisc = (spec: RingSpec): Disc => ({ inner: spec.inner, outer: spec.outer, minY: spec.minY, maxY: spec.maxY });

export function emptyBuild(): PropsBuild {
  return { solid: new THREE.Group(), decor: new THREE.Group(), discs: [], floaters: [], walls: [], waters: [], solids: [] };
}

// 金屬類材質要反射天空才像金屬：環境貼圖由 main.ts 建好後設定一次（setPropsEnvironment），之後建的材質都會用到。
let propsEnvironment: THREE.Texture | null = null;
/** 設定金屬、水面材質反射用的環境貼圖；要在第一次建場景之前呼叫。 */
export function setPropsEnvironment(texture: THREE.Texture): void {
  propsEnvironment = texture;
}
/** 會反射環境的材質（金屬、亮面塑膠）。 */
export function shinyMaterial(color: number, metalness: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, envMap: propsEnvironment });
}
/** 目前的環境貼圖（水面材質用）。 */
export const getPropsEnvironment = (): THREE.Texture | null => propsEnvironment;

/**
 * 把一群靜態網格依材質合併成少數幾個網格：細節多的場景（球場、泳池設施）有上千個小零件，
 * 合併後每種材質只畫一次。網格的縮放不能是負的（合併時不會翻轉面的方向）。
 */
export function bakeByMaterial(source: THREE.Object3D): THREE.Group {
  source.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const material: THREE.Material = object.material;
    const geometry = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).applyMatrix4(object.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
    }
    const list = buckets.get(material) ?? [];
    list.push(geometry);
    buckets.set(material, list);
  });
  const baked = new THREE.Group();
  for (const [material, list] of buckets) {
    const merged = mergeGeometries(list);
    if (!merged) throw new Error(`合併網格失敗：材質 ${material.type} 的零件屬性不一致`);
    list.forEach((geometry) => geometry.dispose());
    baked.add(new THREE.Mesh(merged, material));
  }
  return baked;
}

function addPlainSlab(spec: RingSpec, build: PropsBuild, color = spec.color): void {
  build.solid.add(annulus(spec.inner, spec.outer, spec.minY, spec.maxY, colorMaterial(color)));
  build.discs.push(fullDisc(spec));
}

// 環範圍內隨機一點（面積均勻）。
function randomInRing(rng: Rng, inner: number, outer: number): { r: number; theta: number } {
  return { r: Math.sqrt(inner * inner + rng() * (outer * outer - inner * inner)), theta: rng() * TAU };
}

// ---------- 破碎的環 ----------
// 1/3 是完整的環（站得住），2/3 碎掉：從兩邊斷口往缺口中間，一欄一欄沿著環寬鋪碎片，
// 走得越遠（progress 0 → 1）碎片越小、越稀、偏離環面越多也越歪；離開斷口一小段之後的碎片會飄。
function buildBrokenRing(spec: RingSpec, build: PropsBuild, rng: Rng): void {
  const gapLength = TAU * BROKEN_SHARE;
  const gapStart = rng() * TAU;
  const arcStart = gapStart + gapLength;
  const arcLength = TAU - gapLength;
  build.solid.add(arcSlab(spec.inner, spec.outer, spec.minY, spec.maxY, arcStart, arcLength, colorMaterial(spec.color), rng));
  build.discs.push({ ...fullDisc(spec), arc: { start: arcStart, length: arcLength } });

  const batches = GEOMETRY.slabs.map((geometry) => new Batch(geometry, flatMaterial));
  const thickness = spec.maxY - spec.minY;
  const middleRadius = (spec.inner + spec.outer) / 2;
  const halfGap = (gapLength / 2) * middleRadius;   // 斷口到缺口中間的弧長（m）
  for (const side of [1, -1]) {
    const edge = side > 0 ? gapStart : gapStart + gapLength;
    let traveled = 0;
    while (traveled < halfGap) {
      const progress = traveled / halfGap;
      const size = FRAGMENT_LARGE * (FRAGMENT_SMALL / FRAGMENT_LARGE) ** progress;
      for (let r = spec.inner + size / 2; r < spec.outer - size / 4; r += size * range(rng, [0.9, 1.25])) {
        if (rng() < progress * FRAGMENT_SPARSE) continue;
        const theta = edge + (side * (traveled + size / 2 + spread(rng, size * 0.25))) / r;
        const y = spec.maxY - thickness / 2 + spread(rng, progress * FRAGMENT_DRIFT);
        const tilt = progress * FRAGMENT_TILT;
        const fragmentThickness = thickness * (progress < 0.3 ? 1 : range(rng, [0.5, 1]));
        const matrix = transform(polarX(r, theta), y, polarZ(r, theta), rng() * TAU, spread(rng, tilt), spread(rng, tilt),
          size * range(rng, [0.8, 1.1]), fragmentThickness, size * range(rng, [0.8, 1.1]));
        const part = pick(rng, batches).add(matrix, shade(spec.color, spread(rng, 0.06)));
        if (progress > FRAGMENT_FLOAT_FROM) addFloater(build, rng, spec.bobScale, [part]);
        else build.solids.push(partsSolid([part]));
      }
      traveled += size * range(rng, [0.9, 1.2]);
    }
  }
  addBatches(build.decor, batches);
}

// 整圈都是各種形狀、顏色的碎塊，沒有環面，站不上去；全部都在飄。
function buildShardsRing(spec: RingSpec, build: PropsBuild, rng: Rng): void {
  const slabs = GEOMETRY.slabs.map((geometry) => new Batch(geometry, flatMaterial));
  const chunks = GEOMETRY.chunks.map((geometry) => new Batch(geometry, flatMaterial));
  const count = Math.round((Math.PI * (spec.outer ** 2 - spec.inner ** 2)) / SHARD_AREA);
  for (let i = 0; i < count; i++) {
    const { r, theta } = randomInRing(rng, spec.inner, spec.outer);
    const size = range(rng, SHARD_SIZE);
    const y = spec.maxY + spread(rng, SHARD_RISE);
    const isChunk = rng() < SHARD_CHUNK_CHANCE;
    const matrix = isChunk
      ? transform(polarX(r, theta), y, polarZ(r, theta), rng() * TAU, rng() * TAU, rng() * TAU, size / 2, (size / 2) * range(rng, [0.5, 1.2]), size / 2)
      : transform(polarX(r, theta), y, polarZ(r, theta), rng() * TAU, spread(rng, SHARD_TILT), spread(rng, SHARD_TILT), size, range(rng, SHARD_THICKNESS), size * range(rng, [0.5, 1]));
    const part = pick(rng, isChunk ? chunks : slabs).add(matrix, pick(rng, SHARD_COLORS));
    addFloater(build, rng, spec.bobScale * SHARD_BOB, [part]);
  }
  addBatches(build.decor, [...slabs, ...chunks]);
}

// ---------- 飄著的書 ----------
interface BookBatches { pagesRight: Batch; pagesLeft: Batch; coverRight: Batch; coverLeft: Batch }

// 一本書：兩個半邊各自繞書脊轉，opening 是兩半之間的角度（0 闔上、π 攤平）。
// 兩個鉸鏈各離書脊中心半個書頁厚，闔上時書頁夾在兩片封面中間。
function addBook(rng: Rng, books: BookBatches, base: THREE.Matrix4, width: number, opening: number): Part[] {
  const height = width * range(rng, BOOK_ASPECT);
  const pages = width * range(rng, BOOK_PAGES);
  const cover = width * BOOK_COVER;
  const coverColor = pick(rng, BOOK_COLORS);
  const pageColor = pick(rng, PAGE_COLORS);
  const fold = (Math.PI - opening) / 2;
  const parts: Part[] = [];
  for (const side of [1, -1]) {
    const half = base.clone()
      .multiply(new THREE.Matrix4().makeTranslation(side * pages, 0, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(side * fold));
    const [pageBatch, coverBatch] = side > 0 ? [books.pagesRight, books.coverRight] : [books.pagesLeft, books.coverLeft];
    parts.push(pageBatch.add(half.clone().multiply(new THREE.Matrix4().makeScale(width * 0.97, pages, height * 0.96)), pageColor));
    parts.push(coverBatch.add(half.clone().multiply(new THREE.Matrix4().makeScale(width, cover, height)), coverColor));
  }
  return parts;
}

function pickBookOpening(rng: Rng): number {
  let roll = rng();
  for (const state of BOOK_STATES) {
    if (roll < state.share) return range(rng, state.opening);
    roll -= state.share;
  }
  return range(rng, BOOK_STATES[0]?.opening ?? [0, 0]);
}

// 沒有環面，整層都是不規則漂浮的書：有的攤開、有的半開、有的闔上，大小不一，全都在飄。
function buildFloatingBooksRing(spec: RingSpec, build: PropsBuild, rng: Rng): void {
  const books: BookBatches = {
    pagesRight: new Batch(GEOMETRY.pagesRight), pagesLeft: new Batch(GEOMETRY.pagesLeft),
    coverRight: new Batch(GEOMETRY.coverRight), coverLeft: new Batch(GEOMETRY.coverLeft),
  };
  const count = Math.round((Math.PI * (spec.outer ** 2 - spec.inner ** 2)) / FLYING_BOOK_AREA);
  for (let i = 0; i < count; i++) {
    const { r, theta } = randomInRing(rng, spec.inner, spec.outer);
    const width = FLYING_BOOK_WIDTH[0] + (FLYING_BOOK_WIDTH[1] - FLYING_BOOK_WIDTH[0]) * rng() ** FLYING_BOOK_SIZE_BIAS;
    const base = transform(polarX(r, theta), spec.maxY + spread(rng, FLYING_BOOK_RISE), polarZ(r, theta), rng() * TAU, spread(rng, FLYING_BOOK_TILT), spread(rng, FLYING_BOOK_TILT), 1, 1, 1);
    const parts = addBook(rng, books, base, width, pickBookOpening(rng));
    addFloater(build, rng, spec.bobScale, parts);
  }
  addBatches(build.decor, [books.pagesRight, books.pagesLeft, books.coverRight, books.coverLeft]);
}

// ---------- 空中圖書館 ----------
// 書櫃的一面：沿著 [start, start + length] 每 SHELF_BAY_WIDTH 一格，隔板之間一排排放書。
// front 是書櫃正面的半徑，inward 是往書櫃裡面（背板）的方向（+1／-1）。
interface ShelfFace { front: number; inward: number; start: number; length: number; floorY: number; levelHeight: number }

function addShelfFace(rng: Rng, face: ShelfFace, dividers: Batch, books: Batch): void {
  const centerRadius = face.front + (face.inward * LIBRARY_BAY_DEPTH) / 2;
  const backRadius = face.front + face.inward * LIBRARY_BAY_DEPTH;
  const bays = Math.max(1, Math.round((face.length * centerRadius) / SHELF_BAY_WIDTH));
  const bayAngle = face.length / bays;
  const dividerAngle = SHELF_DIVIDER / 2 / centerRadius;
  const shelfHeight = face.levelHeight * LIBRARY_LEVELS;
  for (let bay = 0; bay <= bays; bay++) {
    const theta = face.start + bay * bayAngle;
    dividers.add(transform(polarX(centerRadius, theta), face.floorY + shelfHeight / 2, polarZ(centerRadius, theta), theta, 0, 0, SHELF_DIVIDER, shelfHeight, LIBRARY_BAY_DEPTH), WOOD_DARK);
    if (bay === bays) break;
    for (let level = 0; level < LIBRARY_LEVELS; level++) {
      const floorY = face.floorY + level * face.levelHeight + SHELF_BOARD;
      let angle = theta + dividerAngle;
      for (;;) {
        if (rng() < BOOK_GAP_CHANCE) angle += range(rng, BOOK_GAP) / centerRadius;
        const thickness = range(rng, BOOK_THICKNESS);
        if (angle + thickness / centerRadius > theta + bayAngle - dividerAngle) break;
        const middle = angle + thickness / 2 / centerRadius;
        const height = (face.levelHeight - SHELF_BOARD) * range(rng, BOOK_HEIGHT);
        const depth = LIBRARY_BAY_DEPTH * range(rng, BOOK_DEPTH);
        const radius = backRadius - (face.inward * depth) / 2;
        books.add(transform(polarX(radius, middle), floorY + height / 2, polarZ(radius, middle), middle, 0, 0, thickness, height, depth), pick(rng, BOOK_COLORS));
        angle += thickness / centerRadius;
      }
    }
  }
}

// 一圈雙面書櫃在 [start, start + length] 的一段：中間背板、頂板、層板，兩面都放書。
function addShelfSegment(rng: Rng, build: PropsBuild, center: number, floorY: number, start: number, length: number, dividers: Batch, books: Batch): void {
  const half = LIBRARY_BAY_DEPTH + LIBRARY_BACK / 2;
  const levelHeight = (LIBRARY_HEIGHT - LIBRARY_TOP) / LIBRARY_LEVELS;
  const wood = colorMaterial(WOOD);
  build.solid.add(
    arcSlab(center - LIBRARY_BACK / 2, center + LIBRARY_BACK / 2, floorY, floorY + LIBRARY_HEIGHT, start, length, colorMaterial(WOOD_DARK)),
    arcSlab(center - half, center + half, floorY + LIBRARY_HEIGHT - LIBRARY_TOP, floorY + LIBRARY_HEIGHT, start, length, wood),
  );
  for (let level = 0; level < LIBRARY_LEVELS; level++) {
    const y = floorY + level * levelHeight;
    build.decor.add(arcSlab(center - half, center + half, y, y + SHELF_BOARD, start, length, wood));
  }
  addShelfFace(rng, { front: center + half, inward: -1, start, length, floorY, levelHeight }, dividers, books);
  addShelfFace(rng, { front: center - half, inward: 1, start, length, floorY, levelHeight }, dividers, books);
  // 碰撞：書櫃外側那面擋住外面的走道、內側那面擋住裡面的走道，都只擋這一段角度（缺口可以穿過）；兩端再加端板，不會從側面走進書櫃
  const arc = { start, length };
  const top = floorY + LIBRARY_HEIGHT;
  build.walls.push({ radius: center + half, minY: floorY, maxY: top, solid: 'inside', arc }, { radius: center - half, minY: floorY, maxY: top, solid: 'outside', arc });
  for (const end of [start, start + length]) build.solids.push(orientedSolid(polarX(center, end), polarZ(center, end), end, 0.3, half * 2, floorY, top));
}

// 環面是木地板，上面 LIBRARY_WALLS 圈雙面書櫃，書櫃之間和內外兩側是走道；每圈書櫃在不同角度開幾個缺口，可以穿到隔壁走道。
function buildLibraryRing(spec: RingSpec, build: PropsBuild, rng: Rng): void {
  const { inner, outer, maxY } = spec;
  build.solid.add(annulus(inner, outer, maxY - LIBRARY_FLOOR, maxY, colorMaterial(WOOD_FLOOR)));
  build.discs.push({ inner, outer, minY: maxY - LIBRARY_FLOOR, maxY });
  const wallDepth = 2 * LIBRARY_BAY_DEPTH + LIBRARY_BACK;
  const aisle = (outer - inner - LIBRARY_WALLS * wallDepth) / (LIBRARY_WALLS + 1);
  const dividers = new Batch(GEOMETRY.box);
  const books = new Batch(GEOMETRY.box);
  for (let wall = 0; wall < LIBRARY_WALLS; wall++) {
    const center = inner + aisle * (wall + 1) + wallDepth * (wall + 0.5);
    const openingAngle = LIBRARY_OPENING_WIDTH / center;
    const offset = rng() * TAU;
    const segment = TAU / LIBRARY_OPENINGS;
    for (let k = 0; k < LIBRARY_OPENINGS; k++) {
      const start = offset + k * segment + openingAngle / 2 + spread(rng, segment * 0.15);
      const length = segment - openingAngle;
      addShelfSegment(rng, build, center, maxY, start, length, dividers, books);
    }
  }
  addBatches(build.decor, [dividers, books]);
}

// 同一高度的內、中、外三層細環，各自站得上去；顏色是環色的深淺變化。
function buildTripleRing(spec: RingSpec, build: PropsBuild): void {
  const width = (spec.outer - spec.inner - 2 * TRIPLE_GAP) / 3;
  for (let k = 0; k < 3; k++) {
    const inner = spec.inner + k * (width + TRIPLE_GAP);
    build.solid.add(annulus(inner, inner + width, spec.minY, spec.maxY, colorMaterial(shade(spec.color, (k - 1) * TRIPLE_SHADE))));
    build.discs.push({ inner, outer: inner + width, minY: spec.minY, maxY: spec.maxY });
  }
}

// ---------- 環狀美食街 ----------
interface FoodBatches { roundTables: Batch; squareTables: Batch; chairs: Batch; longTables: Batch; benches: Batch; stalls: Batch; awnings: Batch; pots: Batch; bushes: Batch }
// 一個分區：角度範圍、半徑範圍與地面高度；occupied 記錄已經放了東西的位置，避免重疊。
interface FoodZone { start: number; end: number; inner: number; outer: number; y: number; occupied: { x: number; z: number; radius: number }[]; solids: SolidBox[] }

function isInZone(zone: FoodZone, x: number, z: number, margin: number): boolean {
  const r = Math.hypot(x, z);
  if (r < zone.inner + margin || r > zone.outer - margin) return false;
  const angle = THREE.MathUtils.euclideanModulo(Math.atan2(x, z) - zone.start, TAU);
  return angle > margin / r && angle < zone.end - zone.start - margin / r;
}

// 在分區裡找一個不和其他東西重疊的位置；near 有給時在那附近（常態分布）找。
function findZoneSpot(rng: Rng, zone: FoodZone, radius: number, near?: { x: number; z: number; spread: number }): { x: number; z: number } | null {
  for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
    let x: number;
    let z: number;
    if (near) {
      x = near.x + gaussian(rng) * near.spread;
      z = near.z + gaussian(rng) * near.spread;
    } else {
      const r = range(rng, [zone.inner, zone.outer]);
      const theta = range(rng, [zone.start, zone.end]);
      x = polarX(r, theta);
      z = polarZ(r, theta);
    }
    if (!isInZone(zone, x, z, radius)) continue;
    if (zone.occupied.some((other) => Math.hypot(other.x - x, other.z - z) < other.radius + radius)) continue;
    zone.occupied.push({ x, z, radius });
    return { x, z };
  }
  return null;
}

// 一組桌椅：圓桌配 4 張椅子、方桌配 2 張，椅子面向桌子（椅背在椅子的 -z）。
function addTableSet(rng: Rng, batches: FoodBatches, zone: FoodZone, x: number, z: number): void {
  const yaw = rng() * TAU;
  const chairColor = pick(rng, CHAIR_COLORS);
  const addChair = (direction: number, offset: number): void => {
    batches.chairs.add(transform(x + polarX(offset, direction), zone.y, z + polarZ(offset, direction), direction + Math.PI, 0, 0, 1, 1, 1), chairColor);
  };
  if (rng() < ROUND_TABLE_CHANCE) {
    batches.roundTables.add(transform(x, zone.y, z, yaw, 0, 0, 1, 1, 1), pick(rng, TABLE_COLORS));
    zone.solids.push(orientedSolid(x, z, yaw, 1.25, 1.25, zone.y, zone.y + 0.8));
    for (let k = 0; k < 4; k++) addChair(yaw + (k * Math.PI) / 2 + spread(rng, 0.2), ROUND_CHAIR_OFFSET);
  } else {
    batches.squareTables.add(transform(x, zone.y, z, yaw, 0, 0, 1, 1, 1), pick(rng, TABLE_COLORS));
    zone.solids.push(orientedSolid(x, z, yaw, 1.25, 0.85, zone.y, zone.y + 0.8));
    for (const side of [0, Math.PI]) addChair(yaw + side, SQUARE_CHAIR_OFFSET);
  }
}

// 幾團桌椅聚在一起，團和團之間是空地。
function addTableClusters(rng: Rng, batches: FoodBatches, zone: FoodZone, clusters: number): void {
  for (let c = 0; c < clusters; c++) {
    const center = findZoneSpot(rng, zone, 0);
    if (!center) continue;
    zone.occupied.pop();   // 只是找團的中心，不佔位置
    const spreadRadius = range(rng, CLUSTER_SPREAD);
    const tables = Math.round(range(rng, CLUSTER_TABLES));
    for (let t = 0; t < tables; t++) {
      const spot = findZoneSpot(rng, zone, TABLE_CLEARANCE / 2, { ...center, spread: spreadRadius });
      if (spot) addTableSet(rng, batches, zone, spot.x, spot.z);
    }
  }
}

// 攤位：沿著環的外緣（或內緣）一排，正面朝向分區中間；攤位上方有往前斜的遮雨棚。
function addStallRow(rng: Rng, batches: FoodBatches, zone: FoodZone, radius: number, facing: number): void {
  const [width, height, depth] = STALL_SIZE;
  const awningColor = pick(rng, AWNING_COLORS);
  let along = zone.start * radius + width;
  while (along < zone.end * radius - width) {
    const theta = along / radius;
    const x = polarX(radius, theta);
    const z = polarZ(radius, theta);
    // 攤位正面是自身的 +z；朝外緣的攤位轉向圓心（facing = π），朝內緣的轉向外面（facing = 0）
    const body = transform(x, zone.y, z, theta + facing, 0, 0, width, height, depth);
    batches.stalls.add(body, pick(rng, STALL_COLORS));
    zone.solids.push(orientedSolid(x, z, theta + facing, width, depth, zone.y, zone.y + height + 0.4));
    const awning = body.clone()
      .multiply(new THREE.Matrix4().makeTranslation(0, 1, 0.5))
      .multiply(new THREE.Matrix4().makeRotationX(AWNING_DROOP))
      .multiply(new THREE.Matrix4().makeScale(1.08, 0.05, AWNING_DEPTH / depth))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.5));
    batches.awnings.add(awning, rng() < 0.3 ? pick(rng, AWNING_COLORS) : awningColor);
    zone.occupied.push({ x, z, radius: width / 2 + 1 });
    along += range(rng, STALL_SPACING);
  }
}

// 長桌區：整區用同一個隨機方向排成幾列長桌，兩側是長椅；出了分區的不放。
function addLongTables(rng: Rng, batches: FoodBatches, zone: FoodZone): void {
  const middleAngle = (zone.start + zone.end) / 2;
  const middleRadius = (zone.inner + zone.outer) / 2;
  const cx = polarX(middleRadius, middleAngle);
  const cz = polarZ(middleRadius, middleAngle);
  const yaw = rng() * TAU;
  const ux = Math.cos(yaw);
  const uz = -Math.sin(yaw);   // 長桌沿自身 x 軸，轉 yaw 後的方向
  const vx = Math.sin(yaw);
  const vz = Math.cos(yaw);
  const reach = zone.outer - zone.inner;
  const color = pick(rng, TABLE_COLORS);
  for (let row = -reach; row <= reach; row += LONG_TABLE_ROW) {
    let column = -reach;
    while (column <= reach) {
      const length = range(rng, LONG_TABLE_LENGTH);
      const along = column + length / 2;
      const x = cx + ux * along + vx * row;
      const z = cz + uz * along + vz * row;
      column += length + LONG_TABLE_COLUMN;
      if (!isInZone(zone, x + (ux * length) / 2, z + (uz * length) / 2, 1) || !isInZone(zone, x - (ux * length) / 2, z - (uz * length) / 2, 1)) continue;
      if (zone.occupied.some((other) => Math.hypot(other.x - x, other.z - z) < other.radius + length / 2)) continue;
      batches.longTables.add(transform(x, zone.y, z, yaw, 0, 0, length, 1, 1), color);
      zone.solids.push(orientedSolid(x, z, yaw, length, BENCH_OFFSET * 2 + 0.35, zone.y, zone.y + 0.8));
      for (const side of [1, -1]) {
        batches.benches.add(transform(x + vx * side * BENCH_OFFSET, zone.y, z + vz * side * BENCH_OFFSET, yaw, 0, 0, length, 1, 1), pick(rng, CHAIR_COLORS));
      }
    }
  }
}

// 植栽：盆子加一團綠葉。
function addPlanters(rng: Rng, batches: FoodBatches, zone: FoodZone, count: number): void {
  for (let i = 0; i < count; i++) {
    const size = range(rng, [0.5, 1.2]);
    const spot = findZoneSpot(rng, zone, size + 0.5);
    if (!spot) continue;
    const potHeight = size * 0.9;
    batches.pots.add(transform(spot.x, zone.y, spot.z, 0, 0, 0, size, potHeight, size), pick(rng, POT_COLORS));
    zone.solids.push(orientedSolid(spot.x, spot.z, 0, size * 2, size * 2, zone.y, zone.y + potHeight + size * 1.4));
    batches.bushes.add(transform(spot.x, zone.y + potHeight + size * 0.6, spot.z, rng() * TAU, 0, 0, size * 1.1, size * 0.9, size * 1.1), pick(rng, BUSH_COLORS));
  }
}

type FoodZoneKind = 'stalls' | 'clusters' | 'longTables' | 'plaza';
const FOOD_ZONE_KINDS: FoodZoneKind[] = ['stalls', 'clusters', 'longTables', 'plaza'];

// 環狀美食街：分成大小不一的幾區，每區一種擺法（攤位街、桌椅群、長桌區、植栽廣場），區和區之間留走道；
// 每區地面疊一片低彩度的色塊，看得出分區。
function buildFoodCourtRing(spec: RingSpec, build: PropsBuild, rng: Rng): void {
  addPlainSlab(spec, build, FOOD_FLOOR);
  const batches: FoodBatches = {
    roundTables: new Batch(GEOMETRY.roundTable), squareTables: new Batch(GEOMETRY.squareTable), chairs: new Batch(GEOMETRY.chair),
    longTables: new Batch(GEOMETRY.longTable), benches: new Batch(GEOMETRY.bench),
    stalls: new Batch(GEOMETRY.baseBox), awnings: new Batch(GEOMETRY.baseBox), pots: new Batch(GEOMETRY.pot), bushes: new Batch(GEOMETRY.bush, flatMaterial),
  };
  const zoneCount = Math.round(range(rng, FOOD_ZONES));
  const weights = Array.from({ length: zoneCount }, () => range(rng, [0.6, 1.4]));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const middleRadius = (spec.inner + spec.outer) / 2;
  const walkway = FOOD_WALKWAY / middleRadius;
  let angle = rng() * TAU;
  let previous: FoodZoneKind | null = null;
  for (const weight of weights) {
    const span = (weight / total) * TAU;
    const zone: FoodZone = { start: angle + walkway / 2, end: angle + span - walkway / 2, inner: spec.inner + FOOD_EDGE, outer: spec.outer - FOOD_EDGE, y: spec.maxY + FOOD_PATCH, occupied: [], solids: build.solids };
    angle += span;
    build.decor.add(arcSlab(zone.inner, zone.outer, spec.maxY, zone.y, zone.start, zone.end - zone.start, colorMaterial(pick(rng, FOOD_PATCH_COLORS))));
    // 相鄰兩區不要同一種
    const kind: FoodZoneKind = pick(rng, FOOD_ZONE_KINDS.filter((candidate) => candidate !== previous));
    previous = kind;
    if (kind === 'stalls') {
      addStallRow(rng, batches, zone, zone.outer - STALL_SIZE[2] / 2 - 0.5, Math.PI);
      if (rng() < 0.5) addStallRow(rng, batches, zone, zone.inner + STALL_SIZE[2] / 2 + 0.5, 0);
      addTableClusters(rng, batches, zone, 2);
    } else if (kind === 'clusters') {
      addTableClusters(rng, batches, zone, 3 + Math.floor(rng() * 2));
      addPlanters(rng, batches, zone, 3);
    } else if (kind === 'longTables') {
      addLongTables(rng, batches, zone);
    } else {
      addPlanters(rng, batches, zone, Math.round(range(rng, PLANTERS)));
      addTableClusters(rng, batches, zone, 1);
    }
  }
  addBatches(build.decor, Object.values(batches));
}

/** 依樣式建出一圈環。 */
export function buildRing(spec: RingSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  switch (spec.style) {
    case 'plain': addPlainSlab(spec, build); break;
    case 'broken': buildBrokenRing(spec, build, rng); break;
    case 'floatingBooks': buildFloatingBooksRing(spec, build, rng); break;
    case 'shards': buildShardsRing(spec, build, rng); break;
    case 'bookshelf': buildLibraryRing(spec, build, rng); break;
    case 'triple': buildTripleRing(spec, build); break;
    case 'restaurant': buildFoodCourtRing(spec, build, rng); break;
    case 'courts':
    case 'track':
    case 'houses':
    case 'floatingHouses':
    case 'pool':
      throw new Error(`環樣式 ${spec.style} 由 oz-sports.ts／oz-track.ts／oz-pool.ts／oz-town.ts 建，main.ts 會直接分派過去`);
  }
  return build;
}

// ---------- 周圍的漂浮物 ----------
interface Spot { x: number; y: number; z: number }
interface Cluster extends Spot { radius: number }

// 這個位置會不會碰到環、圓錐、貓頭，或是太低、太遠。
function isFieldBlocked(spec: FieldSpec, x: number, y: number, z: number, size: number): boolean {
  const { cone } = spec;
  const r = Math.hypot(x, z);
  if (r < FIELD_INNER || r > spec.fieldRadius || y < FIELD_LOW + size) return true;
  const nearRing = spec.rings.some((ring) =>
    r > ring.inner - size && r < ring.outer + size && y > ring.minY - FIELD_RING_MARGIN - size && y < ring.maxY + FIELD_RING_MARGIN + size);
  if (nearRing) return true;
  if (y < cone.tipY - size || y > cone.headTop + size) return false;
  const width = y > cone.topY
    ? cone.topRadius * FIELD_HEAD_WIDTH
    : cone.topRadius * Math.min(1, Math.max(0, (y - cone.tipY) / (cone.topY - cone.tipY)));
  return r < width + size + FIELD_CONE_MARGIN;
}

// 隨機一個漂浮物的位置：大部分在某個聚集處附近，少數在整個範圍內隨機。
function randomFieldPoint(rng: Rng, spec: FieldSpec, clusters: Cluster[]): Spot {
  if (clusters.length > 0 && rng() < CLUSTER_SHARE) {
    const cluster = pick(rng, clusters);
    return {
      x: cluster.x + gaussian(rng) * cluster.radius,
      y: cluster.y + gaussian(rng) * cluster.radius * CLUSTER_FLATNESS,
      z: cluster.z + gaussian(rng) * cluster.radius,
    };
  }
  const r = FIELD_INNER + (spec.fieldRadius - FIELD_INNER) * rng() ** FIELD_RADIUS_BIAS;
  const theta = rng() * TAU;
  return { x: polarX(r, theta), y: range(rng, [FIELD_LOW, spec.cone.headTop + FIELD_ABOVE_HEAD]), z: polarZ(r, theta) };
}

// 找一個不碰到環、圓錐、其他漂浮物的位置；試 PLACE_ATTEMPTS 次都找不到就放棄這一個。
function findFieldSpot(rng: Rng, spec: FieldSpec, size: number, placed: (Spot & { size: number })[], clusters: Cluster[]): Spot | null {
  for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
    const spot = randomFieldPoint(rng, spec, clusters);
    if (isFieldBlocked(spec, spot.x, spot.y, spot.z, size)) continue;
    if (placed.some((other) => Math.hypot(other.x - spot.x, other.y - spot.y, other.z - spot.z) < other.size + size)) continue;
    placed.push({ ...spot, size });
    return spot;
  }
  return null;
}

// 蜂窩狀六邊形平面：|q|、|p|、|q + p| 都不超過 rings 的軸座標格子組成一個大六邊形，隨機少幾格。
// 設計規則：一定有一格是不同顏色。
function addHexPad(rng: Rng, hexes: Batch, pad: THREE.Matrix4, cell: number, rings: number): Part[] {
  // CylinderGeometry 六邊形的尖角朝 ±z，邊垂直 x 軸，所以鄰格在 x 軸和 60° 方向上，不用再轉。
  const step = Math.sqrt(3) * cell * HEX_SPACING;
  const tiles: [number, number][] = [];
  for (let q = -rings; q <= rings; q++) {
    for (let p = -rings; p <= rings; p++) {
      if (Math.abs(q + p) > rings) continue;
      if ((q !== 0 || p !== 0) && rng() < HEX_DROP_CHANCE) continue;
      tiles.push([q, p]);
    }
  }
  const color = pick(rng, HEX_COLORS);
  const accent = pick(rng, HEX_COLORS.filter((candidate) => candidate !== color));
  const accentIndex = Math.floor(rng() * tiles.length);
  return tiles.map(([q, p], i) => {
    const local = transform(step * (q + p / 2), spread(rng, HEX_JITTER), (step * p * Math.sqrt(3)) / 2, 0, 0, 0, cell, HEX_THICKNESS, cell);
    const tileColor = i === accentIndex ? accent : shade(color, spread(rng, 0.05));
    return hexes.add(pad.clone().multiply(local), tileColor);
  });
}

/** 環周圍的漂浮物：島嶼、各種形狀的平台、蜂窩狀六邊形平面、零碎小塊；大多聚在幾處，全部都在飄。 */
export function buildFloatingField(spec: FieldSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  const placed: (Spot & { size: number })[] = [];
  const clusters: Cluster[] = [];
  for (let i = 0; i < spec.clusters; i++) {
    const radius = range(rng, CLUSTER_RADIUS);
    const center = findFieldSpot(rng, spec, radius / 2, [], []);
    if (center) clusters.push({ ...center, radius });
  }
  const grass = GEOMETRY.slabs.map((geometry) => new Batch(geometry, flatMaterial));
  const rocks = new Batch(GEOMETRY.rock, flatMaterial);
  const platforms = GEOMETRY.platforms.map((geometry) => new Batch(geometry, flatMaterial));
  const hexes = new Batch(GEOMETRY.hex, flatMaterial);
  const chunks = GEOMETRY.chunks.map((geometry) => new Batch(geometry, flatMaterial));
  const float = (parts: Part[]): void => addFloater(build, rng, spec.bobScale, parts);

  for (let i = 0; i < spec.islands; i++) {
    const radius = range(rng, ISLAND_RADIUS);
    const spot = findFieldSpot(rng, spec, radius, placed, clusters);
    if (!spot) continue;
    const top = range(rng, ISLAND_TOP);
    const turn: [number, number, number] = [rng() * TAU, spread(rng, ISLAND_TILT), spread(rng, ISLAND_TILT)];
    float([
      pick(rng, grass).add(transform(spot.x, spot.y - top / 2, spot.z, ...turn, radius, top, radius), pick(rng, GRASS_COLORS)),
      rocks.add(transform(spot.x, spot.y - top, spot.z, ...turn, radius * ISLAND_ROCK, radius * range(rng, ISLAND_DEPTH), radius * ISLAND_ROCK), pick(rng, ROCK_COLORS)),
    ]);
  }

  for (let i = 0; i < spec.platforms; i++) {
    const size = range(rng, PLATFORM_SIZE);
    const spot = findFieldSpot(rng, spec, size / 2, placed, clusters);
    if (!spot) continue;
    const shape = Math.floor(rng() * platforms.length);
    const batch = platforms[shape];
    if (!batch) continue;
    const thickness = range(rng, PLATFORM_THICKNESS);
    const base = transform(spot.x, spot.y, spot.z, rng() * TAU, spread(rng, PLATFORM_TILT), spread(rng, PLATFORM_TILT), 1, 1, 1);
    const parts = [batch.add(base.clone().multiply(new THREE.Matrix4().makeScale(size, thickness, size * range(rng, [0.7, 1.3]))), pick(rng, PLATFORM_COLORS))];
    if (rng() < PLATFORM_TIER_CHANCE) {
      const tier = size * range(rng, PLATFORM_TIER_SCALE);
      const tierMatrix = base.clone()
        .multiply(new THREE.Matrix4().makeTranslation(spread(rng, (size - tier) / 3), thickness, spread(rng, (size - tier) / 3)))
        .multiply(new THREE.Matrix4().makeScale(tier, thickness, tier));
      parts.push(batch.add(tierMatrix, pick(rng, PLATFORM_ACCENTS)));
    }
    float(parts);
  }

  for (let i = 0; i < spec.hexPads; i++) {
    const cell = range(rng, HEX_RADIUS);
    const rings = rng() < 0.5 ? 1 : 2;
    const spot = findFieldSpot(rng, spec, Math.sqrt(3) * cell * HEX_SPACING * (rings + 0.5), placed, clusters);
    if (!spot) continue;
    const pad = transform(spot.x, spot.y, spot.z, rng() * TAU, spread(rng, HEX_TILT), spread(rng, HEX_TILT), 1, 1, 1);
    float(addHexPad(rng, hexes, pad, cell, rings));
  }

  for (let i = 0; i < spec.debris; i++) {
    const size = range(rng, DEBRIS_SIZE);
    const spot = findFieldSpot(rng, spec, size, placed, clusters);
    if (!spot) continue;
    const matrix = transform(spot.x, spot.y, spot.z, rng() * TAU, rng() * TAU, rng() * TAU, size * range(rng, [0.6, 1.4]), size * range(rng, [0.6, 1.4]), size * range(rng, [0.6, 1.4]));
    float([pick(rng, chunks).add(matrix, pick(rng, [...SHARD_COLORS, ...ROCK_COLORS]))]);
  }

  addBatches(build.decor, [...grass, rocks, ...platforms, hexes, ...chunks]);
  return build;
}
