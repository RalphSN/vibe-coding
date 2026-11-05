// OZ 世界的環樣式與周圍漂浮物（先做外觀）：每種環長什麼樣子、哪裡站得上去（Disc），以及會上下飄的東西（Floater）。
// 擺放都用固定種子的亂數，每次重新整理長得一樣。大量重複的小東西（房屋、書、桌椅、碎片）用 InstancedMesh，一種形狀一次畫完。
// 設計規則：蜂窩狀六邊形一律有一格是不同顏色（見 addHexPad）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RingStyle } from './config/scene.config';
import { addMesh, box, childGroup, collectColliders, cylinder, disposeGeometries, mapped, markChildGroups, markCollider, pixelTexture, planarUv, rod, skipCollider, type Vec3 } from './oz-kit';

/** 圓心在原點的環形平板（inner 是 0 就是實心圓）：只管站上去和撞頭。有 arc 時只有這段角度站得住（角度 = atan2(x, z)）。 */
export interface Disc { inner: number; outer: number; minY: number; maxY: number; arc?: { start: number; length: number } }

/** 會上下飄的東西：apply(dy) 把它放到基準位置往上 dy 公尺。 */
export interface Floater {
  amplitude: number; speed: number; phase: number; apply: (dy: number) => void;
  /** 跟著飄的碰撞方塊：每格把 minY／maxY 設成基準高度 + dy，站在上面的人就跟著上下。 */
  solids?: { box: SolidBox; minY: number; maxY: number }[];
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
// 完整段上的施工現場
const BREAK_BARRIER_AT = 7;            // 紐澤西護欄離斷口幾公尺
const BREAK_BARRIER_GAP = 4;           // 護欄中間留的缺口：走得到斷口、跳得上碎片
const BREAK_RAIL_MARGIN = 9;           // 環邊欄杆在斷口前幾公尺結束
const BREAK_LAMP_SPACING = 22;
const REBAR_PER_EDGE = 18;
const RUBBLE_PER_EDGE = 26;
const CONES_PER_EDGE = 7;

// 全是碎塊的環
const SHARD_AREA = 40;
const SHARD_SIZE: Range = [1.5, 6];
const SHARD_THICKNESS: Range = [0.3, 1.5];
const SHARD_RISE = 3;
const SHARD_TILT = 0.5;
const SHARD_CHUNK_CHANCE = 0.2;
const SHARD_BOB = 0.6;
// 碎片的材質比例（其餘是霧面）：亮面金屬、半透明玻璃、會發光的水晶
const SHARD_GLOSSY_SHARE = 0.15;
const SHARD_GLASS_SHARE = 0.08;
const SHARD_CRYSTAL_SHARE = 0.07;
const SHARD_CRYSTAL_STRETCH = 2.6;

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
// 三層步道的設施
const TRIPLE_BRIDGES = 6;               // 每道空隙架幾座橋
const BRIDGE_WIDTH = 3;
const RAIL_HEIGHT = 1;
const RAIL_POST_SPACING = 2;
const FLOWER_BED_SPACING = 8;
const FLOWERS_PER_BED = 14;
const FLOWER_COLORS = [0xe63946, 0xf2c200, 0xff7ac3, 0xffffff, 0x8e44ad, 0xf4a261];
const PROMENADE_LAMP_SPACING = 18;
const PROMENADE_BENCH_SPACING = 18;
const BINOCULAR_SPACING = 45;
const BIKE_DECAL_SPACING = 25;

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
const TABLE_UMBRELLA_CHANCE = 0.35;
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
const ISLAND_TREE_SPACING = 6;         // 島上的樹大約隔幾公尺
const ISLAND_TREE_MAX = 7;
const ISLAND_TREE_HEIGHT: Range = [2.5, 5.5];
const ISLAND_BOULDERS: Range = [1, 3.99];
const TREE_COLORS = [0x4f9a4c, 0x5fa85d, 0x3f8a5f, 0x77b46f];
const BLOSSOM_COLORS = [0xf7b6c8, 0xe39b3c];
const BLOSSOM_CHANCE = 0.2;
const TRUNK_COLOR = 0x7a5a3c;
const PLATFORM_SIZE: Range = [4, 14];
const PLATFORM_THICKNESS: Range = [0.6, 2];
const PLATFORM_TILT = 0.06;
const PLATFORM_TIER_CHANCE = 0.4;      // 上面再疊一層較小平台的機率
const PLATFORM_TRIM = 0.14;            // 平台頂面的收邊厚度
const PLATFORM_POTTED_SIZE = 8;        // 這麼大以上的平台放盆栽
const PLATFORM_POTTED_SHAPES = [0, 1, 6];   // 方、圓、不規則：盆栽放在四角不會懸空
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

/**
 * 一組會飄的實例：加進飄動清單，同時加跟著飄的碰撞方塊。
 * colliders 是哪幾組實例各自算一個碰撞外框（預設整組一個）；島上的樹要和地面分開算，否則整座島的頂面會變成樹梢高。
 */
export function addFloater(build: PropsBuild, rng: Rng, scale: number, parts: Part[], colliders: Part[][] = [parts]): void {
  const floater = makeFloater(rng, scale, floatParts(parts));
  floater.solids = colliders.map((group) => {
    const box = partsSolid(group);
    build.solids.push(box);
    return { box, minY: box.minY, maxY: box.maxY };
  });
  build.floaters.push(floater);
}

/** 每格呼叫：time 是累計秒數。 */
export function updateFloaters(floaters: Floater[], time: number): void {
  for (const floater of floaters) {
    const wave = Math.sin(time * floater.speed + floater.phase) * (1 - BOB_HARMONIC_SHARE) +
      Math.sin(time * floater.speed * BOB_HARMONIC + floater.phase * 2) * BOB_HARMONIC_SHARE;
    const dy = floater.amplitude * wave;
    floater.apply(dy);
    for (const solid of floater.solids ?? []) {
      solid.box.minY = solid.minY + dy;
      solid.box.maxY = solid.maxY + dy;
    }
  }
}

// ---------- 細節材質（美食街攤位、圖書館、飄著的書） ----------
const STALL_NAMES = ['拉麵', '珍珠奶茶', '披薩', '咖哩飯', '烤肉串', '甜點', '壽司', '漢堡', '鹹酥雞', '刨冰', '咖啡', '水餃'];
const LIBRARY_SECTIONS = ['文學', '歷史', '科學', '藝術', '哲學', '地理', '音樂', '童書', '語言', '電腦'];

const drawSignText = (text: string, background: string) => (ctx: CanvasRenderingContext2D): void => {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 248, 56);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
};
function drawMenu(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#1f2a24';
  ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('MENU', 44, 16);
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(12, 28 + i * 13, 60 + ((i * 17) % 30), 3);
    ctx.fillRect(100, 28 + i * 13, 16, 3);
  }
}
const drawStripes = (a: string, b: string) => (ctx: CanvasRenderingContext2D): void => {
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? a : b;
    ctx.fillRect(i * 8, 0, 8, 8);
  }
};
// 木地板：長條木板、接縫錯開，一張 2 m
function drawPlanks(ctx: CanvasRenderingContext2D): void {
  const rng = createRng(61);
  for (let row = 0; row < 16; row++) {
    let x = -rng() * 128;
    while (x < 256) {
      const length = 64 + rng() * 96;
      const tone = Math.round((rng() - 0.5) * 30);
      ctx.fillStyle = `rgb(${196 + tone}, ${150 + tone}, ${100 + tone})`;
      ctx.fillRect(x, row * 16, length, 16);
      ctx.fillStyle = 'rgba(80, 50, 25, 0.35)';
      ctx.fillRect(x, row * 16, 1.5, 16);
      ctx.fillRect(x, row * 16 + 15, length, 1);
      x += length;
    }
  }
}
// 地毯：深紅底、金色細邊花紋
function drawCarpet(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#7a2230';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(217, 164, 65, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(32, 6);
  ctx.lineTo(58, 32);
  ctx.lineTo(32, 58);
  ctx.lineTo(6, 32);
  ctx.closePath();
  ctx.stroke();
}
// 書的封面：外框與燙金標題帶（白底，實例顏色乘上去變成各色封面）
function drawCover(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 108, 108);
  ctx.fillStyle = '#d9b45a';
  ctx.fillRect(22, 40, 84, 16);
  ctx.fillRect(34, 64, 60, 6);
}
// 書頁：一行行文字
// 草地：深淺不一的草葉點
function drawLawn(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#6aa864';
  ctx.fillRect(0, 0, 256, 256);
  const rng = createRng(71);
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = ['#5e9c58', '#77b46f', '#549050', '#82bd78'][Math.floor(rng() * 4)] ?? '#6aa864';
    ctx.fillRect(rng() * 256, rng() * 256, 1, 3);
  }
}
// 自行車道：藍灰色柏油
function drawBikePath(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#4b6378';
  ctx.fillRect(0, 0, 256, 256);
  const rng = createRng(72);
  for (let i = 0; i < 8000; i++) {
    ctx.fillStyle = ['#415769', '#56708a', '#3a4f60', '#5f7891'][Math.floor(rng() * 4)] ?? '#4b6378';
    ctx.fillRect(rng() * 256, rng() * 256, 1.5, 1.5);
  }
}
// 地上的單車圖示：白色線條畫在透明底上（車頭朝貼圖上方）
function drawBikeIcon(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 28, 18, 0, TAU);
  ctx.moveTo(82, 100);
  ctx.arc(64, 100, 18, 0, TAU);
  ctx.moveTo(64, 28);
  ctx.lineTo(64, 64);
  ctx.lineTo(64, 100);
  ctx.moveTo(48, 40);
  ctx.lineTo(80, 40);
  ctx.stroke();
}

// 斷掉的水泥路面：淺色（材質再染上環的顏色）、伸縮縫、裂痕
function drawCrackedConcrete(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#ece8e2';
  ctx.fillRect(0, 0, 256, 256);
  const rng = createRng(81);
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = ['#e2ddd5', '#f4f1ec', '#d8d2c9'][Math.floor(rng() * 3)] ?? '#ece8e2';
    ctx.fillRect(rng() * 256, rng() * 256, 2, 2);
  }
  ctx.fillStyle = '#c4beb4';
  ctx.fillRect(0, 127, 256, 2);
  ctx.fillRect(127, 0, 2, 256);
  ctx.strokeStyle = '#8f887e';
  ctx.lineWidth = 1.5;
  for (let crack = 0; crack < 7; crack++) {
    let x = rng() * 256;
    let y = rng() * 256;
    let heading = rng() * TAU;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < 8; step++) {
      heading += (rng() - 0.5) * 1.2;
      x += Math.cos(heading) * 12;
      y += Math.sin(heading) * 12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
// 斷口前的警告牌：黃底、黑框、三角形驚嘆號、「前方斷裂」
function drawWarningSign(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#f2c200';
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = '#1f1f1f';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 150);
  ctx.beginPath();
  ctx.moveTo(60, 20);
  ctx.lineTo(100, 90);
  ctx.lineTo(20, 90);
  ctx.closePath();
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.fillStyle = '#1f1f1f';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 60, 66);
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('前方', 175, 52);
  ctx.fillText('斷裂', 175, 96);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('DANGER', 128, 132);
}

function drawPage(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#fbf8f0';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(40, 40, 40, 0.35)';
  for (let y = 14; y < 118; y += 8) ctx.fillRect(12, y, 104 - ((y * 7) % 23), 2);
}

function createDetailMaterials() {
  const signs = new Map<string, THREE.MeshLambertMaterial>();
  const stripes = new Map<string, THREE.MeshLambertMaterial>();
  return {
    stallSign: (name: string, color: number): THREE.MeshLambertMaterial => {
      const key = `${name}:${color}`;
      const cached = signs.get(key);
      if (cached) return cached;
      const material = mapped(pixelTexture(256, 64, drawSignText(name, `#${new THREE.Color(color).getHexString()}`)));
      signs.set(key, material);
      return material;
    },
    awning: (color: number): THREE.MeshLambertMaterial => {
      const key = String(color);
      const cached = stripes.get(key);
      if (cached) return cached;
      const map = pixelTexture(64, 8, drawStripes(`#${new THREE.Color(color).getHexString()}`, '#f4f1ea'));
      map.repeat.set(3, 1);
      const material = mapped(map, { side: THREE.DoubleSide });
      stripes.set(key, material);
      return material;
    },
    menu: mapped(pixelTexture(128, 96, drawMenu)),
    planks: mapped(pixelTexture(256, 256, drawPlanks)),
    carpet: mapped(pixelTexture(64, 64, drawCarpet)),
    cover: mapped(pixelTexture(128, 128, drawCover)),
    page: mapped(pixelTexture(128, 128, drawPage)),
    lawn: mapped(pixelTexture(256, 256, drawLawn)),
    bikePath: mapped(pixelTexture(256, 256, drawBikePath)),
    bikeIcon: mapped(pixelTexture(128, 128, drawBikeIcon), { transparent: true, alphaTest: 0.3 }),
    paint: colorMaterial(0xf4f4f4),
    warning: mapped(pixelTexture(256, 160, drawWarningSign)),
    hazard: mapped(pixelTexture(64, 8, drawStripes('#d23b2f', '#f4f1ea'))),
    barrier: colorMaterial(0xd9d6d0),
    trafficCone: colorMaterial(0xf26b1d),
    rebar: colorMaterial(0x7a4a32),
    rubble: colorMaterial(0xb3ada4),
    soil: colorMaterial(0x6b4a33),
    stone: colorMaterial(0xb7b0a5),
    rail: colorMaterial(0xd5dae0),
    flowers: FLOWER_COLORS.map((color) => colorMaterial(color)),
    leaves: colorMaterial(0x5fa85d),
    window: colorMaterial(0x26313b),
    counter: colorMaterial(0x8a5a3b),
    stool: colorMaterial(0x2b2b2b),
    darkMetal: colorMaterial(0x3a3f45),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c9 }),
    bankerShade: colorMaterial(0x1f6b45),
    brass: colorMaterial(0xc9a24a),
    globe: colorMaterial(0x4a8fc0),
    land: colorMaterial(0x6cc56b),
    bins: [0x1f5fbf, 0x3f8a5f, 0x6b7280].map((color) => colorMaterial(color)),
  };
}
type DetailMaterials = ReturnType<typeof createDetailMaterials>;
let detailMaterials: DetailMaterials | null = null;
// 貼圖要用到 document，第一次建這些環時才建。
function getDetailMaterials(): DetailMaterials {
  detailMaterials ??= createDetailMaterials();
  return detailMaterials;
}
// 在環上半徑 radius、角度 angle 放一組零件：自身 x 沿圓周、z 朝外（徑向）。
const ringGroup = (parent: THREE.Object3D, radius: number, y: number, angle: number, yaw = angle): THREE.Group =>
  childGroup(parent, [polarX(radius, angle), y, polarZ(radius, angle)], yaw);

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
  const slab = arcSlab(spec.inner, spec.outer, spec.minY, spec.maxY, arcStart, arcLength, mapped(pixelTexture(256, 256, drawCrackedConcrete), { color: spec.color }), rng);
  planarUv(slab.geometry, 10);
  build.solid.add(slab);
  build.discs.push({ ...fullDisc(spec), arc: { start: arcStart, length: arcLength } });
  addBreakSite(spec, build, rng, arcStart, arcLength);

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

// 一段只擋 [start, start + length] 的環邊欄杆：柱子、扶手和一段圓形牆。
// 走路時圓形牆只擋人所在的那一側，所以中間的欄杆不會擋到隔壁環上的人。
function addArcRail(build: PropsBuild, props: THREE.Group, M: DetailMaterials, radius: number, y: number, start: number, length: number, solid: 'inside' | 'outside'): void {
  const posts = Math.max(1, Math.round((length * radius) / RAIL_POST_SPACING));
  for (let i = 0; i <= posts; i++) {
    const angle = start + (length * i) / posts;
    cylinder(props, M.rail, 0.03, RAIL_HEIGHT, [polarX(radius, angle), y + RAIL_HEIGHT / 2, polarZ(radius, angle)], 6);
  }
  for (const height of [RAIL_HEIGHT, RAIL_HEIGHT / 2]) {
    addMesh(props, new THREE.TorusGeometry(radius, height === RAIL_HEIGHT ? 0.035 : 0.02, 6, Math.max(8, Math.round(length * radius)), length).rotateX(Math.PI / 2), M.rail, [0, y + height, 0], [0, start + length - Math.PI / 2, 0]);
  }
  build.walls.push({ radius, minY: y, maxY: y + RAIL_HEIGHT, solid, arc: { start, length } });
}

// 紐澤西護欄：下寬上窄的水泥塊，上半段漆紅白斜紋。自身 z 是長邊（沿環的半徑方向排）。
function addJerseyBarrier(g: THREE.Group, M: DetailMaterials): void {
  box(g, M.barrier, [0.6, 0.35, 1.9], [0, 0.175, 0]);
  box(g, M.hazard, [0.3, 0.55, 1.9], [0, 0.62, 0]);
}

function addTrafficCone(g: THREE.Group, M: DetailMaterials): void {
  box(g, M.stool, [0.42, 0.04, 0.42], [0, 0.02, 0]);
  rod(g, M.trafficCone, [0, 0.04, 0], [0, 0.75, 0], 0.17, 0.03, 10);
  cylinder(g, M.paint, 0.115, 0.08, [0, 0.42, 0], 10);
}

// 斷口前的施工現場：每個斷口前一排紐澤西護欄（中間留缺口）、交通錐、警告牌、
// 斷面伸出來彎掉的鋼筋、散落的碎石；完整段兩側有欄杆，路燈沿內緣排，最靠近斷口的那盞歪了。
// dir 是缺口在哪個方向（+1：角度變大的那一側），自身 x 沿圓周（角度變大的方向）。
function addBreakSite(spec: RingSpec, build: PropsBuild, rng: Rng, arcStart: number, arcLength: number): void {
  const M = getDetailMaterials();
  const y = spec.maxY;
  const props = new THREE.Group();
  const middle = (spec.inner + spec.outer) / 2;
  const thickness = spec.maxY - spec.minY;
  const margin = BREAK_RAIL_MARGIN / middle;
  addArcRail(build, props, M, spec.inner + 0.15, y, arcStart + margin, arcLength - 2 * margin, 'inside');
  addArcRail(build, props, M, spec.outer - 0.15, y, arcStart + margin, arcLength - 2 * margin, 'outside');
  const lampRadius = spec.inner + 1.2;
  const lamps = Math.max(2, Math.round(((arcLength - 2 * margin) * lampRadius) / BREAK_LAMP_SPACING));
  for (let i = 0; i <= lamps; i++) {
    const g = ringGroup(props, lampRadius, y, arcStart + margin + ((arcLength - 2 * margin) * i) / lamps);
    addPromenadeLamp(g, M);
    if (i === 0) g.rotation.z = 0.35;          // 最靠近斷口的兩盞往缺口歪
    if (i === lamps) g.rotation.z = -0.35;
  }
  for (const [edge, dir] of [[arcStart, -1], [arcStart + arcLength, 1]] as const) {
    const at = (meters: number, r: number): number => edge - (dir * meters) / r;   // 從斷口往完整段走 meters 公尺
    for (let r = spec.inner + 1.2; r < spec.outer - 1; r += 2.05) {
      if (Math.abs(r - middle) < BREAK_BARRIER_GAP / 2 + 1) continue;
      addJerseyBarrier(ringGroup(props, r, y, at(BREAK_BARRIER_AT, r)), M);
    }
    for (let i = 0; i < CONES_PER_EDGE; i++) {
      const r = middle + spread(rng, BREAK_BARRIER_GAP * 1.6);
      const cone = ringGroup(props, r, y, at(BREAK_BARRIER_AT + 1.5 + rng() * 3, r));
      skipCollider(cone);
      addTrafficCone(cone, M);
    }
    const sign = ringGroup(props, middle + BREAK_BARRIER_GAP, y, at(BREAK_BARRIER_AT + 4, middle + BREAK_BARRIER_GAP));
    skipCollider(sign);
    markCollider(sign, [0.3, 2.4, 0.3], [0, 1.2, 0]);
    for (const z of [-0.6, 0.6]) rod(sign, M.darkMetal, [0, 0, z], [0, 2.4, z], 0.04);
    addMesh(sign, new THREE.PlaneGeometry(1.6, 1), M.warning, [-dir * 0.05, 1.8, 0], [0, -dir * Math.PI / 2, 0]);
    for (let i = 0; i < REBAR_PER_EDGE; i++) {
      const r = spec.inner + 1 + rng() * (spec.outer - spec.inner - 2);
      const rebarY = spec.minY + thickness * (rng() < 0.5 ? 0.3 : 0.7);
      const out = range(rng, [0.8, 2.8]);
      const from: Vec3 = [polarX(r, at(JAG_DEPTH + 0.5, r)), rebarY, polarZ(r, at(JAG_DEPTH + 0.5, r))];
      const bend: Vec3 = [polarX(r, at(-out * 0.6, r)), rebarY, polarZ(r, at(-out * 0.6, r))];
      const tipR = r + spread(rng, 0.6);
      const tip: Vec3 = [polarX(tipR, at(-out, tipR)), rebarY - range(rng, [0.2, 1.2]), polarZ(tipR, at(-out, tipR))];
      rod(props, M.rebar, from, bend, 0.05, 0.05, 5);
      rod(props, M.rebar, bend, tip, 0.05, 0.05, 5);
    }
    for (let i = 0; i < RUBBLE_PER_EDGE; i++) {
      const r = spec.inner + 1 + rng() * (spec.outer - spec.inner - 2);
      const size = range(rng, [0.15, 0.55]);
      const angle = at(JAG_DEPTH + 0.3 + rng() * 6, r);
      addMesh(props, new THREE.DodecahedronGeometry(size, 0), M.rubble, [polarX(r, angle), y + size * 0.4, polarZ(r, angle)], [rng() * TAU, rng() * TAU, 0]);
    }
  }
  markChildGroups(props);
  build.solids.push(...collectColliders(props));
  build.decor.add(bakeByMaterial(props));
  disposeGeometries(props);
}

// 整圈都是各種形狀、顏色的碎塊，沒有環面，站不上去；全部都在飄。
// 每次建環時才建：環境貼圖（反光用）要先設好
const shardMaterials = (): { glossy: THREE.Material; glass: THREE.Material; crystal: THREE.Material } => ({
  glossy: shinyMaterial(0xffffff, 0.6, 0.25),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.45, envMap: propsEnvironment, side: THREE.DoubleSide }),
  crystal: new THREE.MeshBasicMaterial({ color: 0xffffff }),
});
const crystalGeometry = new THREE.OctahedronGeometry(1, 0).scale(0.5, SHARD_CRYSTAL_STRETCH, 0.5);

function buildShardsRing(spec: RingSpec, build: PropsBuild, rng: Rng): void {
  const slabs = GEOMETRY.slabs.map((geometry) => new Batch(geometry, flatMaterial));
  const chunks = GEOMETRY.chunks.map((geometry) => new Batch(geometry, flatMaterial));
  const looks = shardMaterials();
  // 亮面和玻璃只用前兩種板子形狀，多一種材質只多兩次繪製
  const glossy = GEOMETRY.slabs.slice(0, 2).map((geometry) => new Batch(geometry, looks.glossy));
  const glass = GEOMETRY.slabs.slice(2, 4).map((geometry) => new Batch(geometry, looks.glass));
  const crystals = new Batch(crystalGeometry, looks.crystal);
  const count = Math.round((Math.PI * (spec.outer ** 2 - spec.inner ** 2)) / SHARD_AREA);
  for (let i = 0; i < count; i++) {
    const { r, theta } = randomInRing(rng, spec.inner, spec.outer);
    const size = range(rng, SHARD_SIZE);
    const y = spec.maxY + spread(rng, SHARD_RISE);
    const look = rng();
    if (look < SHARD_CRYSTAL_SHARE) {
      const crystal = transform(polarX(r, theta), y, polarZ(r, theta), rng() * TAU, spread(rng, 0.4), spread(rng, 0.4), size / 3, size / 3, size / 3);
      addFloater(build, rng, spec.bobScale * SHARD_BOB, [crystals.add(crystal, pick(rng, [0x9ff3ff, 0xffb3f0, 0xfff3a0, 0xb8ffcc]))]);
      continue;
    }
    const special = look < SHARD_CRYSTAL_SHARE + SHARD_GLASS_SHARE ? glass : look < SHARD_CRYSTAL_SHARE + SHARD_GLASS_SHARE + SHARD_GLOSSY_SHARE ? glossy : null;
    const isChunk = !special && rng() < SHARD_CHUNK_CHANCE;
    const matrix = isChunk
      ? transform(polarX(r, theta), y, polarZ(r, theta), rng() * TAU, rng() * TAU, rng() * TAU, size / 2, (size / 2) * range(rng, [0.5, 1.2]), size / 2)
      : transform(polarX(r, theta), y, polarZ(r, theta), rng() * TAU, spread(rng, SHARD_TILT), spread(rng, SHARD_TILT), size, range(rng, SHARD_THICKNESS), size * range(rng, [0.5, 1]));
    const part = pick(rng, special ?? (isChunk ? chunks : slabs)).add(matrix, pick(rng, SHARD_COLORS));
    addFloater(build, rng, spec.bobScale * SHARD_BOB, [part]);
  }
  addBatches(build.decor, [...slabs, ...chunks, ...glossy, ...glass, crystals]);
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
    pagesRight: new Batch(GEOMETRY.pagesRight, getDetailMaterials().page), pagesLeft: new Batch(GEOMETRY.pagesLeft, getDetailMaterials().page),
    coverRight: new Batch(GEOMETRY.coverRight, getDetailMaterials().cover), coverLeft: new Batch(GEOMETRY.coverLeft, getDetailMaterials().cover),
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

// 閱覽桌：木桌、兩盞綠色檯燈、兩側各兩張椅子、桌上幾本書。自身 x 沿走道。
function addReadingDesk(g: THREE.Group, M: DetailMaterials, rng: Rng): void {
  const wood = colorMaterial(WOOD);
  const dark = colorMaterial(WOOD_DARK);
  box(g, wood, [2.2, 0.06, 0.95], [0, 0.76, 0]);
  for (const x of [-1, 1]) box(g, dark, [0.08, 0.73, 0.85], [x, 0.365, 0]);
  box(g, dark, [2, 0.06, 0.06], [0, 0.25, 0]);
  for (const x of [-0.6, 0.6]) {
    cylinder(g, M.brass, 0.08, 0.02, [x, 0.8, 0], 12);
    rod(g, M.brass, [x, 0.8, 0], [x, 1.1, 0], 0.012);
    addMesh(g, new THREE.CylinderGeometry(0.11, 0.11, 0.35, 12, 1, false, 0, Math.PI), M.bankerShade, [x, 1.12, 0], [0, 0, Math.PI / 2]);
    box(g, M.lamp, [0.3, 0.01, 0.16], [x, 1.08, 0]);
  }
  for (const z of [-0.85, 0.85]) {
    for (const x of [-0.55, 0.55]) {
      const chair = childGroup(g, [x, 0, z], z > 0 ? Math.PI : 0);
      box(chair, wood, [0.45, 0.05, 0.45], [0, 0.46, 0]);
      box(chair, wood, [0.45, 0.55, 0.05], [0, 0.75, -0.21]);
      for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) box(chair, dark, [0.04, 0.46, 0.04], [lx ?? 0, 0.23, lz ?? 0]);
    }
  }
  for (let i = 0; i < 3; i++) box(g, colorMaterial(pick(rng, BOOK_COLORS)), [0.22, 0.05, 0.3], [-0.2 + i * 0.25, 0.815 + (i === 1 ? 0.05 : 0), 0.15], [0, rng() * 0.6 - 0.3, 0]);
}

// 地球儀：木底座、黃銅弧形支架、藍色球體加綠色陸塊。
function addGlobe(g: THREE.Group, M: DetailMaterials): void {
  const dark = colorMaterial(WOOD_DARK);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    rod(g, dark, [0.25 * Math.cos(a), 0, 0.25 * Math.sin(a)], [0, 0.6, 0], 0.025);
  }
  rod(g, dark, [0, 0.6, 0], [0, 0.8, 0], 0.03);
  addMesh(g, new THREE.TorusGeometry(0.33, 0.012, 6, 32, Math.PI), M.brass, [0, 1.1, 0], [0, 0, -Math.PI / 2]);
  const globe = addMesh(g, new THREE.SphereGeometry(0.3, 24, 16), M.globe, [0, 1.1, 0], [0.4, 0, 0]);
  for (const [lat, lon, size] of [[0.4, 0.5, 0.12], [-0.2, 2, 0.1], [0.9, 3.5, 0.09], [-0.6, 4.5, 0.08]] as const) {
    addMesh(globe, new THREE.SphereGeometry(size, 8, 6), M.land, [0.27 * Math.cos(lat) * Math.sin(lon), 0.27 * Math.sin(lat), 0.27 * Math.cos(lat) * Math.cos(lon)]).scale.set(1, 0.5, 1);
  }
}

// 書櫃梯：兩根斜靠在書櫃正面的木梯腳加橫桿，底部離書櫃 0.9 m、頂端靠在 4 m 高。自身 z 朝書櫃。
function addLadder(g: THREE.Group): void {
  skipCollider(g);
  const wood = colorMaterial(WOOD);
  for (const x of [-0.25, 0.25]) rod(g, wood, [x, 0, 0], [x, 4, 0.85], 0.025);
  for (let k = 1; k < 12; k++) {
    const t = k / 12;
    rod(g, wood, [-0.25, 4 * t, 0.85 * t], [0.25, 4 * t, 0.85 * t], 0.015);
  }
}

// 環面是木地板，上面 LIBRARY_WALLS 圈雙面書櫃，書櫃之間和內外兩側是走道；每圈書櫃在不同角度開幾個缺口，可以穿到隔壁走道。
// 走道鋪地毯，每隔一段一張閱覽桌（有些旁邊放地球儀），書櫃前斜靠著梯子，書櫃兩端掛分類牌。
function buildLibraryRing(spec: RingSpec, build: PropsBuild, rng: Rng): void {
  const { inner, outer, maxY } = spec;
  const M = getDetailMaterials();
  build.solid.add(annulus(inner, outer, maxY - LIBRARY_FLOOR, maxY, colorMaterial(WOOD_FLOOR)));
  const floor = annulus(inner, outer, maxY, maxY + 0.01, M.planks);
  planarUv(floor.geometry, 2);
  build.decor.add(floor);
  build.discs.push({ inner, outer, minY: maxY - LIBRARY_FLOOR, maxY });
  const wallDepth = 2 * LIBRARY_BAY_DEPTH + LIBRARY_BACK;
  const aisle = (outer - inner - LIBRARY_WALLS * wallDepth) / (LIBRARY_WALLS + 1);
  const dividers = new Batch(GEOMETRY.box);
  const books = new Batch(GEOMETRY.box);
  const props = new THREE.Group();
  for (let wall = 0; wall < LIBRARY_WALLS; wall++) {
    const center = inner + aisle * (wall + 1) + wallDepth * (wall + 0.5);
    const openingAngle = LIBRARY_OPENING_WIDTH / center;
    const offset = rng() * TAU;
    const segment = TAU / LIBRARY_OPENINGS;
    for (let k = 0; k < LIBRARY_OPENINGS; k++) {
      const start = offset + k * segment + openingAngle / 2 + spread(rng, segment * 0.15);
      const length = segment - openingAngle;
      addShelfSegment(rng, build, center, maxY, start, length, dividers, books);
      // 兩端的分類牌（面向缺口）、書櫃兩面各一把梯子
      const label = LIBRARY_SECTIONS[(wall * LIBRARY_OPENINGS + k) % LIBRARY_SECTIONS.length] ?? '書';
      for (const [end, facing] of [[start, -1], [start + length, 1]] as const) {
        const plaque = ringGroup(props, center, maxY + 2.6, end + (facing * 0.06) / center);
        box(plaque, M.stallSign(label, WOOD_DARK), [0.04, 0.5, 2], [0, 0, 0]);
      }
      const half = LIBRARY_BAY_DEPTH + LIBRARY_BACK / 2;
      for (const side of [1, -1]) {
        const angle = start + length * (0.3 + rng() * 0.4);
        addLadder(ringGroup(props, center + side * (half + 0.9), maxY, angle, angle + (side > 0 ? Math.PI : 0)));
      }
    }
  }
  // 走道：地毯，每隔約 28 m 一張閱覽桌
  for (let k = 0; k <= LIBRARY_WALLS; k++) {
    const middle = inner + aisle * (k + 0.5) + wallDepth * k;
    const carpet = annulus(middle - 1.1, middle + 1.1, maxY + 0.01, maxY + 0.02, M.carpet);
    planarUv(carpet.geometry, 0.8);
    build.decor.add(carpet);
    if (k === 0 || k === LIBRARY_WALLS) continue;
    const desks = Math.max(3, Math.round((TAU * middle) / 28));
    for (let d = 0; d < desks; d++) {
      const angle = ((d + 0.5) / desks) * TAU;
      addReadingDesk(ringGroup(props, middle, maxY + 0.02, angle), M, rng);
      if (d % 3 === 0) addGlobe(ringGroup(props, middle, maxY + 0.02, angle + 2.2 / middle), M);
    }
  }
  addBatches(build.decor, [dividers, books]);
  markChildGroups(props);
  build.solids.push(...collectColliders(props));
  build.decor.add(bakeByMaterial(props));
  disposeGeometries(props);
}

// 同一高度的內、中、外三層細環，各自站得上去；顏色是環色的深淺變化。
// 一圈上每隔 spacing 公尺的角度
const anglesEvery = (radius: number, spacing: number, offset = 0): number[] => {
  const count = Math.max(1, Math.round((TAU * radius) / spacing));
  return Array.from({ length: count }, (_, i) => offset + (i / count) * TAU);
};
// angle 離 openings 裡任何一個角度在 half 弧度以內
const nearAny = (angle: number, openings: number[], half: number): boolean =>
  openings.some((opening) => Math.abs(THREE.MathUtils.euclideanModulo(angle - opening + Math.PI, TAU) - Math.PI) < half);

// 環邊欄杆：每 RAIL_POST_SPACING 一根柱子、頂端一圈扶手，openings（橋的角度）前後留開口；
// 碰撞是一段段只擋那幾段角度的圓形牆，人不會從環邊掉下去，但走得上橋。solid 是哪一側實心（inside：半徑以內）；
// 走路時圓形牆只擋人所在的那一側，所以中間兩道欄杆不會擋到隔壁環上的人。
function addEdgeRail(build: PropsBuild, props: THREE.Group, M: DetailMaterials, radius: number, y: number, openings: number[], solid: 'inside' | 'outside'): void {
  const half = (BRIDGE_WIDTH / 2 + 0.3) / radius;
  for (const angle of anglesEvery(radius, RAIL_POST_SPACING)) {
    if (!nearAny(angle, openings, half)) cylinder(props, M.rail, 0.03, RAIL_HEIGHT, [polarX(radius, angle), y + RAIL_HEIGHT / 2, polarZ(radius, angle)], 6);
  }
  const sorted = [...openings].sort((a, b) => a - b);
  const segments: [number, number][] = sorted.length === 0 ? [[0, TAU]] : sorted.map((opening, i) => {
    const next = sorted[(i + 1) % sorted.length] ?? opening;
    const start = opening + half;
    const end = (i + 1 < sorted.length ? next : next + TAU) - half;
    return [start, end - start];
  });
  for (const [start, length] of segments) {
    // TorusGeometry 從 +x 開始逆時針；轉成水平後再繞 y 轉，讓這段落在 [start, start + length]
    addMesh(props, new THREE.TorusGeometry(radius, 0.035, 6, Math.max(8, Math.round(length * radius)), length).rotateX(Math.PI / 2), M.rail, [0, y + RAIL_HEIGHT, 0], [0, start + length - Math.PI / 2, 0]);
    build.walls.push({ radius, minY: y, maxY: y + RAIL_HEIGHT, solid, arc: { start, length } });
  }
}

// 花圃：石框、泥土、一叢叢小花。
function addFlowerBed(g: THREE.Group, M: DetailMaterials, rng: Rng): void {
  box(g, M.stone, [2.6, 0.35, 1.5], [0, 0.175, 0]);
  box(g, M.soil, [2.4, 0.04, 1.3], [0, 0.36, 0]);
  for (let i = 0; i < FLOWERS_PER_BED; i++) {
    const x = (rng() - 0.5) * 2.1;
    const z = (rng() - 0.5) * 1.0;
    rod(g, M.leaves, [x, 0.36, z], [x, 0.55, z], 0.01, 0.01, 4);
    addMesh(g, new THREE.IcosahedronGeometry(0.07, 0), M.flowers[Math.floor(rng() * M.flowers.length)] ?? M.paint, [x, 0.58, z]);
  }
}

// 單車：兩個輪子、車架、坐墊和把手，停在停車架旁。自身 x 是車身方向。
function addBicycle(g: THREE.Group, M: DetailMaterials, color: number): void {
  const frame = colorMaterial(color);
  for (const x of [-0.5, 0.5]) addMesh(g, new THREE.TorusGeometry(0.33, 0.025, 6, 20), M.stool, [x, 0.35, 0]);
  rod(g, frame, [-0.5, 0.35, 0], [-0.05, 0.75, 0], 0.02);
  rod(g, frame, [-0.05, 0.75, 0], [0.4, 0.75, 0], 0.02);
  rod(g, frame, [0.4, 0.75, 0], [0.5, 0.35, 0], 0.02);
  rod(g, frame, [-0.05, 0.75, 0], [0, 0.35, 0], 0.02);
  rod(g, frame, [0, 0.35, 0], [-0.5, 0.35, 0], 0.015);
  box(g, M.stool, [0.22, 0.05, 0.1], [-0.08, 0.86, 0]);
  rod(g, M.darkMetal, [0.42, 0.75, 0], [0.42, 0.95, 0], 0.015);
  rod(g, M.darkMetal, [0.42, 0.95, -0.25], [0.42, 0.95, 0.25], 0.015);
}

// 投幣望遠鏡：柱子上一個雙筒鏡身，朝環外看出去（自身 +z）。
function addBinoculars(g: THREE.Group, M: DetailMaterials): void {
  rod(g, M.darkMetal, [0, 0, 0], [0, 1.1, 0], 0.06);
  box(g, colorMaterial(0x2f6fb0), [0.36, 0.22, 0.3], [0, 1.25, 0]);
  for (const x of [-0.09, 0.09]) cylinder(g, M.darkMetal, 0.06, 0.25, [x, 1.28, 0.25], 10, [Math.PI / 2, 0, 0]);
}

function addPromenadeLamp(g: THREE.Group, M: DetailMaterials): void {
  skipCollider(g);
  markCollider(g, [0.3, 3.6, 0.3], [0, 1.8, 0]);
  rod(g, M.darkMetal, [0, 0, 0], [0, 3.5, 0], 0.05, 0.04, 8);
  addMesh(g, new THREE.SphereGeometry(0.2, 12, 8), M.lamp, [0, 3.65, 0]);
  cylinder(g, M.darkMetal, 0.22, 0.05, [0, 3.88, 0], 12);
}

function addPromenadeBench(g: THREE.Group, M: DetailMaterials): void {
  const wood = colorMaterial(WOOD);
  for (const z of [-0.12, 0.02, 0.16]) box(g, wood, [1.8, 0.04, 0.12], [0, 0.45, z]);
  for (const y of [0.6, 0.75]) box(g, wood, [1.8, 0.1, 0.03], [0, y, -0.22]);
  for (const x of [-0.75, 0.75]) box(g, M.darkMetal, [0.05, 0.45, 0.42], [x, 0.225, 0]);
}

// 同一高度的內、中、外三層細環，各自站得上去：
//   內圈是花園（草地、石框花圃），中圈是自行車道（邊線、中央虛線、單車圖示、停車架與單車），
//   外圈是木棧道（長椅朝外看風景、路燈、投幣望遠鏡）。三圈之間每 60° 一座木橋，所有環邊都有欄杆（橋口除外）。
function buildTripleRing(spec: RingSpec, build: PropsBuild, rng: Rng): void {
  const M = getDetailMaterials();
  const width = (spec.outer - spec.inner - 2 * TRIPLE_GAP) / 3;
  const y = spec.maxY;
  const props = new THREE.Group();
  const innerOf = (k: number): number => spec.inner + k * (width + TRIPLE_GAP);
  const bridges = [0, 1].map((gap) => Array.from({ length: TRIPLE_BRIDGES }, (_, j) => ((j + (gap === 0 ? 0 : 0.5)) / TRIPLE_BRIDGES) * TAU));
  const surfaces = [M.lawn, M.bikePath, M.planks];
  for (let k = 0; k < 3; k++) {
    const inner = innerOf(k);
    const outer = inner + width;
    build.solid.add(annulus(inner, outer, spec.minY, y, colorMaterial(shade(spec.color, (k - 1) * TRIPLE_SHADE))));
    build.discs.push({ inner, outer, minY: spec.minY, maxY: y });
    const surface = annulus(inner, outer, y, y + 0.01, surfaces[k] ?? M.paint);
    planarUv(surface.geometry, 2);
    build.decor.add(surface);
    addEdgeRail(build, props, M, inner + 0.15, y, k === 0 ? [] : bridges[k - 1] ?? [], 'inside');
    addEdgeRail(build, props, M, outer - 0.15, y, k === 2 ? [] : bridges[k] ?? [], 'outside');
  }
  // 內圈花園：中線上每隔一段一座花圃
  const garden = innerOf(0) + width / 2;
  for (const angle of anglesEvery(garden, FLOWER_BED_SPACING)) {
    if (!nearAny(angle, bridges[0] ?? [], 3 / garden)) addFlowerBed(ringGroup(props, garden, y, angle), M, rng);
  }
  // 中圈自行車道：兩側白色邊線、中央白色虛線、地上的單車圖示，幾處停車架停著單車
  const lane = innerOf(1);
  for (const r of [lane + 0.6, lane + width - 0.6]) build.decor.add(annulus(r - 0.06, r + 0.06, y + 0.01, y + 0.016, M.paint));
  for (const angle of anglesEvery(lane + width / 2, 4)) box(ringGroup(props, lane + width / 2, y + 0.013, angle), M.paint, [2, 0.006, 0.12], [0, 0, 0]);
  for (const angle of anglesEvery(lane + width / 2, BIKE_DECAL_SPACING, 0.03)) {
    for (const side of [-1, 1]) {
      const r = lane + width / 2 + side * 2.4;
      addMesh(props, flat2(1.4, 1.4), M.bikeIcon, [polarX(r, angle), y + 0.014, polarZ(r, angle)], [0, angle + (side > 0 ? -Math.PI / 2 : Math.PI / 2), 0]);
    }
  }
  for (const angle of anglesEvery(lane + width / 2, 120, 0.2)) {
    const rack = ringGroup(props, lane + width - 1.2, y, angle);
    for (let b = 0; b < 4; b++) {
      addMesh(rack, new THREE.TorusGeometry(0.35, 0.025, 6, 16, Math.PI), M.rail, [b * 0.9 - 1.35, 0, 0], [0, Math.PI / 2, 0]);
      if (b % 3 !== 2) addBicycle(childGroup(rack, [b * 0.9 - 1.35, 0, 0], Math.PI / 2), M, pick(rng, [0xc0392b, 0x2f6fb0, 0xf2c200, 0x3f8a5f, 0x2b2b2b]));
    }
  }
  // 外圈木棧道：外緣長椅朝外看風景、內緣路燈、投幣望遠鏡
  const deck = innerOf(2);
  for (const angle of anglesEvery(deck + width - 1.4, PROMENADE_BENCH_SPACING, 0.02)) addPromenadeBench(ringGroup(props, deck + width - 1.4, y, angle), M);
  for (const angle of anglesEvery(deck + 1, PROMENADE_LAMP_SPACING, 0.05)) addPromenadeLamp(ringGroup(props, deck + 1, y, angle), M);
  for (const angle of anglesEvery(deck + width - 0.8, BINOCULAR_SPACING, 0.25)) addBinoculars(ringGroup(props, deck + width - 0.8, y, angle), M);
  // 木橋：兩道空隙各 TRIPLE_BRIDGES 座，橋面和環面同高、可以走，兩側欄杆
  for (let gap = 0; gap < 2; gap++) {
    const from = innerOf(gap) + width - 0.2;
    const to = innerOf(gap + 1) + 0.2;
    for (const angle of bridges[gap] ?? []) {
      const half = BRIDGE_WIDTH / 2 / ((from + to) / 2);
      build.decor.add(arcSlab(from, to, y - 0.35, y + 0.01, angle - half, half * 2, colorMaterial(WOOD)));
      build.discs.push({ inner: from, outer: to, minY: y - 0.35, maxY: y + 0.01, arc: { start: angle - half, length: half * 2 } });
      for (const side of [-1, 1]) {
        const edge = angle + side * half;
        const a: Vec3 = [polarX(from, edge), y + RAIL_HEIGHT, polarZ(from, edge)];
        const b: Vec3 = [polarX(to, edge), y + RAIL_HEIGHT, polarZ(to, edge)];
        rod(props, M.rail, a, b, 0.035, 0.035, 6);
        for (const t of [0, 0.5, 1]) cylinder(props, M.rail, 0.03, RAIL_HEIGHT, [a[0] + (b[0] - a[0]) * t, y + RAIL_HEIGHT / 2, a[2] + (b[2] - a[2]) * t], 6);
      }
    }
  }
  markChildGroups(props);
  build.solids.push(...collectColliders(props));
  build.decor.add(bakeByMaterial(props));
  disposeGeometries(props);
}

// 水平的平面（地上的圖示）
const flat2 = (width: number, depth: number): THREE.BufferGeometry => new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2);

// ---------- 環狀美食街 ----------
interface FoodBatches { roundTables: Batch; squareTables: Batch; chairs: Batch; longTables: Batch; benches: Batch; stalls: Batch; awnings: Batch; pots: Batch; bushes: Batch }
// 一個分區：角度範圍、半徑範圍與地面高度；occupied 記錄已經放了東西的位置，避免重疊。
interface FoodZone { start: number; end: number; inner: number; outer: number; y: number; occupied: { x: number; z: number; radius: number }[]; solids: SolidBox[]; props: THREE.Group }

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
    if (rng() < TABLE_UMBRELLA_CHANCE) addTableUmbrella(childGroup(zone.props, [x, zone.y, z]), getDetailMaterials(), pick(rng, AWNING_COLORS));
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

// 桌傘：配重底座、桿子、八片條紋傘布。
function addTableUmbrella(g: THREE.Group, M: DetailMaterials, color: number): void {
  skipCollider(g);
  rod(g, M.darkMetal, [0, 0, 0], [0, 2.4, 0], 0.025);
  addMesh(g, new THREE.ConeGeometry(1.3, 0.4, 8, 1, true), M.awning(color), [0, 2.25, 0]);
}

// 一個攤位：機身、服務窗、木頭櫃台與彩色櫃台面板、條紋遮雨棚、寫著攤名的招牌、黑板菜單、櫃台前三張吧台椅。正面是自身 +z。
function addStall(g: THREE.Group, M: DetailMaterials, rng: Rng, bodyColor: number, awningColor: number): void {
  const [width, height, depth] = STALL_SIZE;
  box(g, colorMaterial(bodyColor), [width, height, depth], [0, height / 2, 0]);
  box(g, M.window, [width * 0.72, 1, 0.04], [0, 1.45, depth / 2 + 0.01]);
  box(g, M.counter, [width * 0.86, 0.08, 0.55], [0, 1.02, depth / 2 + 0.22]);
  box(g, colorMaterial(awningColor), [width * 0.86, 0.98, 0.05], [0, 0.49, depth / 2 + 0.47]);
  const awning = childGroup(g, [0, height, depth / 2]);
  awning.rotation.x = AWNING_DROOP;
  box(awning, M.awning(awningColor), [width * 1.08, 0.05, AWNING_DEPTH], [0, 0, AWNING_DEPTH / 2]);
  box(g, M.stallSign(pick(rng, STALL_NAMES), awningColor), [width * 0.9, 0.55, 0.08], [0, height + 0.45, depth / 2 - 0.1]);
  box(g, M.menu, [0.7, 0.5, 0.03], [width * 0.36, 1.75, depth / 2 + 0.03]);
  for (const x of [-0.9, 0, 0.9]) {
    const stool = childGroup(g, [x, 0, depth / 2 + 1.05]);
    cylinder(stool, M.stool, 0.17, 0.05, [0, 0.72, 0], 12);
    rod(stool, M.darkMetal, [0, 0, 0], [0, 0.7, 0], 0.03);
    cylinder(stool, M.darkMetal, 0.18, 0.03, [0, 0.015, 0], 12);
  }
}

// 攤位：沿著環的外緣（或內緣）一排，正面朝向分區中間。
function addStallRow(rng: Rng, _batches: FoodBatches, zone: FoodZone, radius: number, facing: number): void {
  const [width, height, depth] = STALL_SIZE;
  const awningColor = pick(rng, AWNING_COLORS);
  let along = zone.start * radius + width;
  while (along < zone.end * radius - width) {
    const theta = along / radius;
    const x = polarX(radius, theta);
    const z = polarZ(radius, theta);
    // 攤位正面是自身的 +z；朝外緣的攤位轉向圓心（facing = π），朝內緣的轉向外面（facing = 0）
    const stall = childGroup(zone.props, [x, zone.y, z], theta + facing);
    skipCollider(stall);   // 攤位本體用下面的有向方塊擋；吧台椅很矮
    addStall(stall, getDetailMaterials(), rng, pick(rng, STALL_COLORS), rng() < 0.3 ? pick(rng, AWNING_COLORS) : awningColor);
    zone.solids.push(orientedSolid(x, z, theta + facing, width, depth, zone.y, zone.y + height + 0.4));
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
  const props = new THREE.Group();
  const M = getDetailMaterials();
  const zoneCount = Math.round(range(rng, FOOD_ZONES));
  const weights = Array.from({ length: zoneCount }, () => range(rng, [0.6, 1.4]));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const middleRadius = (spec.inner + spec.outer) / 2;
  const walkway = FOOD_WALKWAY / middleRadius;
  let angle = rng() * TAU;
  let previous: FoodZoneKind | null = null;
  for (const weight of weights) {
    const span = (weight / total) * TAU;
    const zone: FoodZone = { start: angle + walkway / 2, end: angle + span - walkway / 2, inner: spec.inner + FOOD_EDGE, outer: spec.outer - FOOD_EDGE, y: spec.maxY + FOOD_PATCH, occupied: [], solids: build.solids, props };
    // 分區之間的走道：內外兩側各一盞路燈與一組分類垃圾桶
    for (const r of [spec.inner + 3, spec.outer - 3]) {
      const lamp = ringGroup(props, r, spec.maxY, angle);
      skipCollider(lamp);
      markCollider(lamp, [0.3, 4.2, 0.3], [0, 2.1, 0]);
      rod(lamp, M.darkMetal, [0, 0, 0], [0, 4.2, 0], 0.06, 0.045, 8);
      for (const side of [-1, 1]) {
        rod(lamp, M.darkMetal, [0, 4.1, 0], [side * 0.6, 4.25, 0], 0.025, 0.025, 6);
        addMesh(lamp, new THREE.SphereGeometry(0.16, 12, 8), M.lamp, [side * 0.6, 4.1, 0]);
      }
      M.bins.forEach((material, k) => cylinder(ringGroup(props, r, spec.maxY, angle + (1.2 + k * 0.5) / r), material, 0.2, 0.85, [0, 0.425, 0], 14));
    }
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
  markChildGroups(props);
  build.solids.push(...collectColliders(props));
  build.decor.add(bakeByMaterial(props));
  disposeGeometries(props);
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
    case 'triple': buildTripleRing(spec, build, rng); break;
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

const trunkGeometry = new THREE.CylinderGeometry(0.7, 1, 1, 6).translate(0, 0.5, 0);

/** 環周圍的漂浮物：島嶼（有樹和石頭）、各種形狀的平台（有收邊與盆栽）、蜂窩狀六邊形平面、零碎小塊；大多聚在幾處，全部都在飄。 */
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
  const trunks = new Batch(trunkGeometry, flatMaterial);
  const crowns = new Batch(GEOMETRY.bush, flatMaterial);
  const pots = new Batch(GEOMETRY.pot, flatMaterial);
  const float = (parts: Part[], colliders?: Part[][]): void => addFloater(build, rng, spec.bobScale, parts, colliders);

  for (let i = 0; i < spec.islands; i++) {
    const radius = range(rng, ISLAND_RADIUS);
    const spot = findFieldSpot(rng, spec, radius, placed, clusters);
    if (!spot) continue;
    const top = range(rng, ISLAND_TOP);
    const turn: [number, number, number] = [rng() * TAU, spread(rng, ISLAND_TILT), spread(rng, ISLAND_TILT)];
    const ground = [
      pick(rng, grass).add(transform(spot.x, spot.y - top / 2, spot.z, ...turn, radius, top, radius), pick(rng, GRASS_COLORS)),
      rocks.add(transform(spot.x, spot.y - top, spot.z, ...turn, radius * ISLAND_ROCK, radius * range(rng, ISLAND_DEPTH), radius * ISLAND_ROCK), pick(rng, ROCK_COLORS)),
    ];
    // 島上的東西放在島頂面的座標系裡（跟著島一起歪），各自一個碰撞外框
    const surface = transform(spot.x, spot.y, spot.z, ...turn, 1, 1, 1);
    const onIsland = (x: number, z: number, local: THREE.Matrix4): THREE.Matrix4 => surface.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0, z)).multiply(local);
    const extras: Part[][] = [];
    const trees = Math.min(ISLAND_TREE_MAX, Math.round((Math.PI * (radius * 0.45) ** 2) / ISLAND_TREE_SPACING ** 2));
    for (let t = 0; t < trees; t++) {
      const angle = rng() * TAU;
      const distance = Math.sqrt(rng()) * radius * 0.45;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const height = range(rng, ISLAND_TREE_HEIGHT);
      const crown = height * 0.45;
      const trunk = trunks.add(onIsland(x, z, new THREE.Matrix4().makeScale(height * 0.07, height, height * 0.07)), TRUNK_COLOR);
      const color = rng() < BLOSSOM_CHANCE ? pick(rng, BLOSSOM_COLORS) : pick(rng, TREE_COLORS);
      const leaves = [
        crowns.add(onIsland(x, z, transform(0, height, 0, rng() * TAU, 0, 0, crown, crown * 0.9, crown)), color),
        crowns.add(onIsland(x, z, transform(spread(rng, crown * 0.5), height - crown * 0.5, spread(rng, crown * 0.5), rng() * TAU, 0, 0, crown * 0.7, crown * 0.6, crown * 0.7)), shade(color, -0.05)),
      ];
      ground.push(trunk, ...leaves);
      extras.push([trunk]);
    }
    const boulders = Math.floor(range(rng, ISLAND_BOULDERS));
    for (let b = 0; b < boulders; b++) {
      const angle = rng() * TAU;
      const distance = (0.25 + rng() * 0.35) * radius;
      const size = range(rng, [0.4, 1.2]);
      const boulder = pick(rng, chunks).add(onIsland(Math.cos(angle) * distance, Math.sin(angle) * distance, transform(0, size * 0.4, 0, rng() * TAU, rng(), rng(), size, size * 0.7, size)), pick(rng, ROCK_COLORS));
      ground.push(boulder);
      extras.push([boulder]);
    }
    float(ground, [ground.slice(0, 2), ...extras]);
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
    const depth = size * range(rng, [0.7, 1.3]);
    const color = pick(rng, PLATFORM_COLORS);
    const parts = [batch.add(base.clone().multiply(new THREE.Matrix4().makeScale(size, thickness, depth)), color)];
    // 頂面收邊：同形狀、大一點點、薄薄一層深一階的顏色，平台邊緣看得出厚度
    const trim = batch.add(base.clone().multiply(new THREE.Matrix4().makeTranslation(0, thickness / 2 - PLATFORM_TRIM / 2 + 0.01, 0)).multiply(new THREE.Matrix4().makeScale(size * 1.03, PLATFORM_TRIM, depth * 1.03)), shade(color, -0.12));
    const colliders: Part[][] = [[...parts, trim]];
    parts.push(trim);
    const hasTier = rng() < PLATFORM_TIER_CHANCE;
    if (!hasTier && size >= PLATFORM_POTTED_SIZE && PLATFORM_POTTED_SHAPES.includes(shape)) {
      for (const [px, pz] of [[0.3, 0.3], [-0.3, -0.3]] as const) {
        const at = base.clone().multiply(new THREE.Matrix4().makeTranslation(px * size, thickness / 2, pz * depth));
        const pot = pots.add(at.clone().multiply(new THREE.Matrix4().makeScale(0.45, 0.7, 0.45)), pick(rng, POT_COLORS));
        const bush = crowns.add(at.clone().multiply(transform(0, 1.2, 0, rng() * TAU, 0, 0, 0.7, 0.6, 0.7)), pick(rng, BUSH_COLORS));
        parts.push(pot, bush);
        colliders.push([pot, bush]);
      }
    }
    if (hasTier) {
      const tier = size * range(rng, PLATFORM_TIER_SCALE);
      const tierMatrix = base.clone()
        .multiply(new THREE.Matrix4().makeTranslation(spread(rng, (size - tier) / 3), thickness, spread(rng, (size - tier) / 3)))
        .multiply(new THREE.Matrix4().makeScale(tier, thickness, tier));
      const tierPart = batch.add(tierMatrix, pick(rng, PLATFORM_ACCENTS));
      parts.push(tierPart);
      colliders.push([tierPart]);
    }
    float(parts, colliders);
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

  addBatches(build.decor, [...grass, rocks, ...platforms, hexes, ...chunks, trunks, crowns, pots]);
  return build;
}
