// OZ 世界的環樣式與周圍漂浮物（先做外觀）：每種環長什麼樣子、哪裡站得上去（Disc），以及會上下飄的東西（Floater）。
// 擺放都用固定種子的亂數，每次重新整理長得一樣。大量重複的小東西（房屋、書、桌椅、碎片）用 InstancedMesh，一種形狀一次畫完。
// 設計規則：蜂窩狀六邊形一律有一格是不同顏色（見 addHexPad）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RingStyle } from './config/scene.config';
import { THEMED_ISLANDS, buildIsland } from './oz-islands';
import { RUNES, runeGeometry } from './oz-runes';
import { SHOP_LAYOUT, addBackToBackRows, addInnerShopRow } from './oz-shops';
import { glowAtNight } from './oz-night';
import { CODE_SYMBOLS, LETTERS, ZHUYIN, symbolGeometry } from './oz-symbols';
import { addMesh, box, childGroup, collectColliders, collectLights, cylinder, disposeGeometries, mapped, markChildGroups, markCollider, markLight, pixelTexture, planarUv, rod, skipCollider, type LightSpot } from './oz-kit';

/** 圓心在原點的環形平板（inner 是 0 就是實心圓）：只管站上去和撞頭。有 arc 時只有這段角度站得住（角度 = atan2(x, z)）。 */
export interface Disc { inner: number; outer: number; minY: number; maxY: number; arc?: { start: number; length: number } }

/** 會上下飄的東西：apply(dy) 把它放到基準位置往上 dy 公尺。 */
export interface Floater {
  amplitude: number; speed: number; phase: number; apply: (dy: number, time: number) => void;
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

/** 圓心在原點的環形水域（泳池）：半徑在 inner–outer 之間、高度在 floorY–surfaceY 之間是水；有 arc 時只有那段角度是水（連接兩座池的水道）。 */
export interface WaterZone { inner: number; outer: number; surfaceY: number; floorY: number; arc?: { start: number; length: number } }

/** (x, z) 在不在這個水域的範圍裡（只看水平位置）。 */
export function isInWaterZone(water: WaterZone, x: number, z: number): boolean {
  const distance = Math.hypot(x, z);
  if (distance <= water.inner || distance >= water.outer) return false;
  if (!water.arc) return true;
  return THREE.MathUtils.euclideanModulo(Math.atan2(x, z) - water.arc.start, Math.PI * 2) < water.arc.length;
}

/**
 * 建出來的東西分兩組：solid 是環本體（站得上去，第三人稱鏡頭會避開），decor 是裝飾（沒有碰撞，鏡頭直接穿過，
 * 數量多時才不會每格都對幾千個物件打射線）。
 */
/** lights：這一圈的燈（世界座標），夜晚的光暈、光斑照這份畫。 */
export interface PropsBuild { solid: THREE.Group; decor: THREE.Group; discs: Disc[]; floaters: Floater[]; walls: RoundWall[]; waters: WaterZone[]; solids: SolidBox[]; lights: LightSpot[] }

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

// 一段角度平板的不規則斷口（arcSlab 給 rng 時用）
const JAG_POINTS = 5;                  // 斷口的鋸齒點數
const JAG_DEPTH = 4;                   // 鋸齒最多往完整段內咬幾公尺

// 全是符號的環：每 SHARD_AREA 平方公尺一個；注音、程式符號各佔的比例，其餘是英文字母
const SHARD_AREA = 45;
const SHARD_SIZE: Range = [1.5, 5];
const SHARD_RISE = 3;
const SHARD_BOB = 0.6;
const SHARD_MIX = { zhuyin: 0.45, code: 0.4 };
const SHARD_SPACING = 0.9;             // 兩個符號中心至少隔（兩者大小平均 × 這個倍數），盡量不重疊
const SHARD_PLACE_TRIES = 8;

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
const LIBRARY_DESK_SPACING = 28;       // 走道上閱覽桌（和落地燈）的間隔（m）
// 檯燈：燈泡離桌面多高、桌面光斑半徑；落地燈：燈桿高、燈罩下緣半徑、地板光斑半徑
const DESK_LAMP = { drop: 0.27, pool: 0.45 };
const FLOOR_LAMP = { height: 2.3, shade: 0.32, pool: 3.5 };
const SHELF_BOARD = 0.25;
const SHELF_BAY_WIDTH = 6;
const SHELF_DIVIDER = 0.3;
const BOOK_THICKNESS: Range = [0.18, 0.45];
const BOOK_HEIGHT: Range = [0.6, 0.92];    // 佔書格高度的比例
const BOOK_DEPTH: Range = [0.75, 0.95];    // 佔書格深度的比例
const BOOK_GAP_CHANCE = 0.05;
const BOOK_GAP: Range = [0.3, 1.2];


// 美食區（由圓心往外）：A 排店（朝外）→ 街道 → 用餐區 → B 排店（朝內）＋ C 排店（朝外，背靠背）→ 用餐區 → 外緣街道。
// 用餐區被 B、C 排的通道對齊切成一格一格，每格一種桌椅，整齊排成一列一列的弧；通道兩旁一排植栽。
const FOOD_STREET = 6;                 // 街道寬（m）
const FOOD_PATCH = 0.03;               // 用餐區地面色塊的厚度：疊在環面上，和街道分得出來
const DINING_FRONTAGE = 2.5;           // 店門口到第一列桌子留的走道
const DINING_EDGE = 1;                 // 靠街道那一側留的空間
const DINING = {
  round: { row: 3.4, column: 3.4 },
  square: { row: 2.8, column: 2.6 },
  long: { row: 3.4, length: 6, column: 1.5 },
};
const AISLE_PLANTER = { spacing: 5, size: 0.8, inset: 0.6 };
const STREET_LAMP_SPACING = 16;
const ROUND_CHAIR_OFFSET = 0.95;
const SQUARE_CHAIR_OFFSET = 0.75;
const BENCH_OFFSET = 0.7;

// 周圍漂浮物：大部分聚在幾個聚集處（常態分布散開），少數零散。
// 漂浮物散在環區外面一圈：環區是最外層環的半徑再加 FIELD_RING_CLEAR（不進入環區），往外 FIELD_SPREAD 公尺內平均散落
const FIELD_RING_CLEAR = 15;
const FIELD_SPREAD = 120;
const FIELD_LOW = 15;
const FIELD_ABOVE_HEAD = 60;
const FIELD_GAP = 6;                   // 平台、蜂窩、符號彼此至少多隔這麼遠（平均散開，不擠成一團）
const FIELD_RING_MARGIN = 14;          // 和環上下至少隔多遠（含書櫃、漂浮房屋的範圍）
const FIELD_CONE_MARGIN = 5;
const FIELD_HEAD_WIDTH = 1.3;          // 貓頭（含耳朵）的水平半徑是平台半徑的幾倍
const ISLAND_RADIUS: Range = [4.5, 10];     // 自然小島；有用途的大島見 oz-islands.ts
const THEMED_PLACE_TRIES = 12;
const ISLAND_GAP = 30;                 // 島和島之間至少多留這麼遠（不聚在一起、分散開來）
const ISLAND_PLACE_TRIES = 4;
// 同心圓環平台：中間一個圓盤，外面兩圈環，彼此之間留空隙（同一個高度）
const RING_PAD = { disc: [1.6, 2.6] as Range, ring: [0.9, 1.6] as Range, gap: [0.5, 0.9] as Range, thickness: 0.4, segments: 24 };
// 方格平台：方磚排成 n × n，隨機少幾格、高低略有不同
const TILE_PAD = { cells: [3, 5.99] as Range, cell: [1.4, 2.2] as Range, spacing: 1.06, thickness: 0.45, jitter: 0.25, drop: 0.2 };
const SYMBOL_SIZE: Range = [1.6, 5];
const SYMBOL_TILT = 0.35;
const SYMBOL_SPIN: Range = [0.12, 0.35];   // 繞垂直軸慢慢轉的角速度（rad/s），方向隨機
const HEX_RADIUS: Range = [1.5, 3];
const HEX_THICKNESS = 0.5;
const HEX_JITTER = 0.3;
const HEX_SPACING = 1.06;
const HEX_DROP_CHANCE = 0.25;

const SHARD_COLORS = [0xf2545b, 0xf59a3a, 0xf2d04b, 0x6cc56b, 0x4aa8e8, 0x5b6ee1, 0xa064d9, 0xffffff, 0xe6e9f0, 0x2fd3c6, 0xff7ac3];
const BOOK_COLORS = [0x8c2f39, 0xb5523b, 0xd9a441, 0x3f6b55, 0x2f4b7c, 0x5c5470, 0x1f2a36, 0xe8dcc2, 0x7a9e7e, 0xc96f53, 0x4a6fa5, 0x9b4f96];
const PAGE_COLORS = [0xfbf8f0, 0xf4eedf, 0xfffdf7];
const TABLE_COLORS = [0xffffff, 0xf4efe6, 0xb9b2a6, 0x8a5a3b, 0x6b7280];
const CHAIR_COLORS = [0x8a5a3b, 0x2b2b2b, 0xa89f94, 0x6b7f8e, 0xc7b299, 0xe6e9f0];
const FOOD_FLOOR = 0xd9d3c9;
const AWNING_COLORS = [0xc0574f, 0xd49a4a, 0x6f9c6a, 0x5d8fb0, 0x8c6fa8, 0xc7764a];
const POT_COLORS = [0x9a8f84, 0xb8afa4, 0x857b72];
const BUSH_COLORS = [0x6cb86a, 0x5fa85d, 0x7cc576];
const PLATFORM_COLORS = [0xffffff, 0xe6e9f0, 0xdfe8f0, 0xf4efe6, 0xcfe3f7, 0xf7d9e3, 0xe0f2e9];
const PLATFORM_ACCENTS = [0x4aa8e8, 0xf2d04b, 0xff7ac3, 0x2fd3c6, 0xf59a3a, 0xf2545b];
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

// 實例很多的一批，依繞中心的角度切成 BATCH_SECTORS 塊各自一個 InstancedMesh，各自算包圍球，畫面外的那幾塊就不畫。
// 包圍球多留 BATCH_CULL_MARGIN 公尺：實例會上下飄、會轉，包圍球不跟著更新。
const BATCH_SECTOR_MIN = 1500;
const BATCH_SECTORS = 8;
const BATCH_CULL_MARGIN = 6;
// 有設 cullDistance 的小東西（果實、作物、欄杆、窗台線腳）：切得更細（DETAIL_SECTORS 塊），每塊各自依離鏡頭的距離決定畫不畫。
// 塊切細一點，鏡頭附近那幾塊才不會把整圈都帶進來。
const DETAIL_SECTOR_MIN = 200;
const DETAIL_SECTORS = 24;
/** InstancedMesh.userData 裡放「離鏡頭超過幾公尺就不畫」的鍵名；main.ts 每格依它切換 visible。 */
export const CULL_DISTANCE_KEY = 'cullDistance';

/** 同一種形狀的一批實例：先收集位置與顏色，build() 時建成 InstancedMesh（實例多時依角度分成幾塊，畫面外的不畫）。 */
export class Batch {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  private readonly matrices: THREE.Matrix4[] = [];
  private readonly colors: THREE.Color[] = [];
  /** 第 i 個實例在哪個 InstancedMesh 的第幾個 */
  private readonly slots: { mesh: THREE.InstancedMesh; index: number }[] = [];

  /** 離鏡頭超過這個距離（公尺，量到包圍球表面）就不畫；undefined 是一直畫。 */
  readonly cullDistance: number | undefined;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material = instanceMaterial, cullDistance?: number) {
    this.geometry = geometry;
    this.material = material;
    this.cullDistance = cullDistance;
  }

  add(matrix: THREE.Matrix4, color: number): Part {
    this.matrices.push(matrix);
    this.colors.push(new THREE.Color(color));
    return { batch: this, index: this.matrices.length - 1, base: matrix };
  }

  build(): THREE.Object3D | null {
    const count = this.matrices.length;
    if (count === 0) return null;
    const sectors = this.cullDistance !== undefined
      ? (count >= DETAIL_SECTOR_MIN ? DETAIL_SECTORS : 1)
      : (count >= BATCH_SECTOR_MIN ? BATCH_SECTORS : 1);
    const members: number[][] = Array.from({ length: sectors }, () => []);
    this.matrices.forEach((matrix, i) => {
      const angle = THREE.MathUtils.euclideanModulo(Math.atan2(matrix.elements[12] ?? 0, matrix.elements[14] ?? 0), TAU);
      members[Math.min(sectors - 1, Math.floor((angle / TAU) * sectors))]?.push(i);
    });
    const meshes = members.filter((list) => list.length > 0).map((list) => {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, list.length);
      list.forEach((i, local) => {
        mesh.setMatrixAt(local, this.matrices[i] ?? new THREE.Matrix4());
        mesh.setColorAt(local, this.colors[i] ?? new THREE.Color());
        this.slots[i] = { mesh, index: local };
      });
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) mesh.boundingSphere.radius += BATCH_CULL_MARGIN;
      if (this.cullDistance !== undefined) mesh.userData[CULL_DISTANCE_KEY] = this.cullDistance;
      return mesh;
    });
    if (meshes.length === 1) return meshes[0] ?? null;
    const group = new THREE.Group();
    group.add(...meshes);
    return group;
  }

  /** 改第 index 個實例的矩陣（漂浮物每格用）。 */
  setMatrix(index: number, matrix: THREE.Matrix4): void {
    const slot = this.slots[index];
    if (!slot) return;
    slot.mesh.setMatrixAt(slot.index, matrix);
    slot.mesh.instanceMatrix.needsUpdate = true;
  }
}

function addBatches(group: THREE.Group, batches: Batch[]): void {
  for (const batch of batches) {
    const mesh = batch.build();
    if (mesh) group.add(mesh);
  }
}

function makeFloater(rng: Rng, scale: number, apply: (dy: number, time: number) => void): Floater {
  return { amplitude: range(rng, BOB_AMPLITUDE) * scale, speed: TAU / range(rng, BOB_PERIOD), phase: rng() * TAU, apply };
}

// 一組實例一起飄（例如房屋的牆和屋頂）。
function floatParts(parts: Part[]): (dy: number) => void {
  return (dy) => {
    for (const part of parts) {
      tmpMatrix.copy(part.base);
      tmpMatrix.elements[13] += dy;
      part.batch.setMatrix(part.index, tmpMatrix);
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

/** 一組會飄的實例，碰撞方塊由呼叫端算好（世界座標、和外觀相符），跟著一起飄。 */
export function addPartsFloater(build: PropsBuild, rng: Rng, scale: number, parts: Part[], solids: SolidBox[]): void {
  const floater = makeFloater(rng, scale, floatParts(parts));
  floater.solids = solids.map((box) => {
    build.solids.push(box);
    return { box, minY: box.minY, maxY: box.maxY };
  });
  build.floaters.push(floater);
}

// 漂浮的符號：上下飄，同時繞垂直軸慢慢轉（各自的速度與方向）。碰撞方塊是符號沒歪時的外框，每格跟著轉同樣的角度。
function addSpinningSymbol(build: PropsBuild, rng: Rng, scale: number, batch: Batch, geometry: THREE.BufferGeometry, spot: Spot, size: number, hasCollider = true): void {
  const yaw0 = rng() * TAU;
  const tiltX = spread(rng, SYMBOL_TILT);
  const tiltZ = spread(rng, SYMBOL_TILT);
  const spin = range(rng, SYMBOL_SPIN) * (rng() < 0.5 ? -1 : 1);
  const part = batch.add(transform(spot.x, spot.y, spot.z, yaw0, tiltX, tiltZ, size, size, size), pick(rng, SHARD_COLORS));
  geometry.boundingBox ?? geometry.computeBoundingBox();
  const bounds = geometry.boundingBox ?? new THREE.Box3();
  const halfHeight = ((bounds.max.y - bounds.min.y) / 2) * size;
  const box: SolidBox = {
    ...orientedSolid(spot.x, spot.z, yaw0, (bounds.max.x - bounds.min.x) * size, (bounds.max.z - bounds.min.z) * size, spot.y - halfHeight, spot.y + halfHeight),
    standable: true,
  };
  const matrix = new THREE.Matrix4();
  const floater = makeFloater(rng, scale, (dy, time) => {
    const yaw = yaw0 + spin * time;
    matrix.copy(transform(spot.x, spot.y + dy, spot.z, yaw, tiltX, tiltZ, size, size, size));
    part.batch.setMatrix(part.index, matrix);
    box.ux = Math.cos(yaw);
    box.uz = -Math.sin(yaw);
    box.vx = Math.sin(yaw);
    box.vz = Math.cos(yaw);
  });
  if (hasCollider) {
    floater.solids = [{ box, minY: box.minY, maxY: box.maxY }];
    build.solids.push(box);
  }
  build.floaters.push(floater);
}

/** 一整個物件（例如一座島）一起飄：每格把 position.y 設成基準 + dy；solids 是世界座標的碰撞方塊，跟著飄。 */
export function addObjectFloater(build: PropsBuild, rng: Rng, scale: number, object: THREE.Object3D, solids: SolidBox[]): void {
  const baseY = object.position.y;
  const floater = makeFloater(rng, scale, (dy) => { object.position.y = baseY + dy; });
  floater.solids = solids.map((box) => {
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
    floater.apply(dy, time);
    for (const solid of floater.solids ?? []) {
      solid.box.minY = solid.minY + dy;
      solid.box.maxY = solid.maxY + dy;
    }
  }
}

// ---------- 細節材質（美食街攤位、圖書館、飄著的書） ----------
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
    planks: mapped(pixelTexture(256, 256, drawPlanks)),
    carpet: mapped(pixelTexture(64, 64, drawCarpet)),
    cover: mapped(pixelTexture(128, 128, drawCover)),
    page: mapped(pixelTexture(128, 128, drawPage)),
    stool: colorMaterial(0x2b2b2b),
    darkMetal: colorMaterial(0x3a3f45),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c9 }),
    // 落地燈的布燈罩：晚上從裡面透出暖光（不能用 colorMaterial 的共用材質，發光會連帶改到別的東西）
    floorShade: glowAtNight(new THREE.MeshLambertMaterial({ color: 0xefe0bf, side: THREE.DoubleSide }), 0xffc98a, 0.75),
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
  return { solid: new THREE.Group(), decor: new THREE.Group(), discs: [], floaters: [], walls: [], waters: [], solids: [], lights: [] };
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
// 單色 Lambert 零件合併後共用的材質：顏色放在頂點上（Lambert 的 color 是乘上去的，白色 × 頂點顏色 = 原本的顏色）
// 依「哪一面畫、要不要平面著色」各一個（這兩項不能放在頂點上）
const bakedColorMaterials = new Map<string, THREE.MeshLambertMaterial>();
const bakedColorMaterial = (side: THREE.Side, flatShading: boolean): THREE.MeshLambertMaterial => {
  const key = `${side}|${flatShading}`;
  const existing = bakedColorMaterials.get(key);
  if (existing) return existing;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side, flatShading });
  bakedColorMaterials.set(key, material);
  return material;
};
// 可以改成頂點顏色的材質：純色、不透明、不發光、沒有任何貼圖、沒有自訂著色器
function isPlainColor(material: THREE.Material): material is THREE.MeshLambertMaterial {
  if (!(material instanceof THREE.MeshLambertMaterial)) return false;
  return !material.map && !material.alphaMap && !material.emissiveMap && !material.lightMap && !material.aoMap && !material.envMap &&
    !material.transparent && !material.vertexColors && material.emissive.getHex() === 0 && material.opacity === 1 &&
    !material.wireframe && material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile;
}

/**
 * 把 source 底下的網格依材質合併，每種材質一次繪製；單色 Lambert 的零件再跨顏色合成一個（顏色放頂點上），
 * 一圈常有幾十種顏色的零件，這樣只剩一兩次繪製。
 */
export function bakeByMaterial(source: THREE.Object3D): THREE.Group {
  source.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const original: THREE.Material = object.material;
    const geometry = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).applyMatrix4(object.matrixWorld);
    const isPlain = isPlainColor(original);
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && (isPlain || name !== 'uv')) geometry.deleteAttribute(name);
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    let material = original;
    if (isPlain) {
      const { r, g, b } = original.color;
      const count = geometry.attributes.position?.count ?? 0;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) colors.set([r, g, b], i * 3);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      material = bakedColorMaterial(original.side, original.flatShading);
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

// 整圈都是漂浮的立體符號（注音、程式符號、少量英文字母），沒有環面；上下飄、慢慢轉，只有外觀沒有碰撞。
function pickShardSymbol(rng: Rng): string {
  const roll = rng();
  if (roll < SHARD_MIX.zhuyin) return pick(rng, ZHUYIN);
  if (roll < SHARD_MIX.zhuyin + SHARD_MIX.code) return pick(rng, CODE_SYMBOLS);
  return pick(rng, LETTERS);
}

function buildShardsRing(spec: RingSpec, build: PropsBuild, rng: Rng): void {
  const batches = new Map<string, Batch>();
  const placed: { x: number; z: number; size: number }[] = [];
  const count = Math.round((Math.PI * (spec.outer ** 2 - spec.inner ** 2)) / SHARD_AREA);
  for (let i = 0; i < count; i++) {
    const text = pickShardSymbol(rng);
    const geometry = symbolGeometry(text);
    if (!geometry) continue;
    const size = range(rng, SHARD_SIZE);
    for (let attempt = 0; attempt < SHARD_PLACE_TRIES; attempt++) {
      const { r, theta } = randomInRing(rng, spec.inner + size / 2, spec.outer - size / 2);
      const x = polarX(r, theta);
      const z = polarZ(r, theta);
      if (placed.some((other) => Math.hypot(other.x - x, other.z - z) < ((other.size + size) / 2) * SHARD_SPACING)) continue;
      placed.push({ x, z, size });
      let batch = batches.get(text);
      if (!batch) {
        batch = new Batch(geometry, instanceMaterial);
        batches.set(text, batch);
      }
      addSpinningSymbol(build, rng, spec.bobScale * SHARD_BOB, batch, geometry, { x, y: spec.maxY + spread(rng, SHARD_RISE), z }, size, false);
      break;
    }
  }
  addBatches(build.decor, [...batches.values()]);
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
    // 背板只到頂板底下：背板頂面和頂板頂面若在同一高度，兩個面搶同一個深度，中線會閃爍（深度衝突）
    arcSlab(center - LIBRARY_BACK / 2, center + LIBRARY_BACK / 2, floorY, floorY + LIBRARY_HEIGHT - LIBRARY_TOP, start, length, colorMaterial(WOOD_DARK)),
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
    // 光斑落在桌面（離燈 DESK_LAMP.drop）；半徑小於半張桌子，不會伸出桌緣浮在半空中
    markLight(g, [x, 1.06, 0], 'indoor', DESK_LAMP.drop, 0, DESK_LAMP.pool);
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

// 復古落地燈：圓形底座、黃銅燈桿、布燈罩（晚上透光）、燈罩下的燈泡。
function addFloorLamp(g: THREE.Group, M: DetailMaterials): void {
  const { height, shade } = FLOOR_LAMP;
  cylinder(g, colorMaterial(WOOD_DARK), 0.22, 0.04, [0, 0.02, 0], 16);
  rod(g, M.brass, [0, 0.04, 0], [0, height, 0], 0.02);
  addMesh(g, new THREE.CylinderGeometry(shade * 0.7, shade, 0.4, 20, 1, true), M.floorShade, [0, height + 0.05, 0]);
  addMesh(g, new THREE.SphereGeometry(0.07, 10, 6), M.lamp, [0, height - 0.05, 0]);
  markLight(g, [0, height - 0.05, 0], 'path', height - 0.05, 0, FLOOR_LAMP.pool);
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
    // 先決定每個缺口的中心（各自隨機偏一點），書櫃從一個缺口填到下一個缺口：
    // 若改成「起點隨機、長度固定」，相鄰兩段會重疊，端點的分類牌會卡進隔壁書櫃裡
    const openings = Array.from({ length: LIBRARY_OPENINGS }, (_, k) => offset + k * segment + spread(rng, segment * 0.15));
    for (let k = 0; k < LIBRARY_OPENINGS; k++) {
      const start = (openings[k] ?? 0) + openingAngle / 2;
      const nextOpening = (openings[(k + 1) % LIBRARY_OPENINGS] ?? 0) + (k + 1 === LIBRARY_OPENINGS ? TAU : 0);
      const length = nextOpening - openingAngle / 2 - start;
      addShelfSegment(rng, build, center, maxY, start, length, dividers, books);
      // 兩端的分類牌（面向缺口）、書櫃兩面各一把梯子
      const label = LIBRARY_SECTIONS[(wall * LIBRARY_OPENINGS + k) % LIBRARY_SECTIONS.length] ?? '書';
      for (const [end, facing] of [[start, -1], [start + length, 1]] as const) {
        // 端點的隔板以端點為中心、往外凸半個隔板厚；分類牌要掛在隔板外面，否則被埋在隔板裡
        const plaque = ringGroup(props, center, maxY + 2.6, end + (facing * (SHELF_DIVIDER / 2 + 0.05)) / center);
        box(plaque, M.stallSign(label, WOOD_DARK), [0.04, 0.5, 2], [0, 0, 0]);
      }
      const half = LIBRARY_BAY_DEPTH + LIBRARY_BACK / 2;
      for (const side of [1, -1]) {
        const angle = start + length * (0.3 + rng() * 0.4);
        addLadder(ringGroup(props, center + side * (half + 0.9), maxY, angle, angle + (side > 0 ? Math.PI : 0)));
      }
    }
  }
  // 走道：地毯，每隔約 28 m 一張閱覽桌；落地燈也是每 28 m 一盞，和閱覽桌錯開半格（兩側的走道沒有閱覽桌，只有燈）
  for (let k = 0; k <= LIBRARY_WALLS; k++) {
    const middle = inner + aisle * (k + 0.5) + wallDepth * k;
    const carpet = annulus(middle - 1.1, middle + 1.1, maxY + 0.01, maxY + 0.02, M.carpet);
    planarUv(carpet.geometry, 0.8);
    build.decor.add(carpet);
    const desks = Math.max(3, Math.round((TAU * middle) / LIBRARY_DESK_SPACING));
    for (let d = 0; d < desks; d++) addFloorLamp(ringGroup(props, middle, maxY + 0.02, (d / desks) * TAU), M);
    if (k === 0 || k === LIBRARY_WALLS) continue;
    for (let d = 0; d < desks; d++) {
      const angle = ((d + 0.5) / desks) * TAU;
      addReadingDesk(ringGroup(props, middle, maxY + 0.02, angle), M, rng);
      if (d % 3 === 0) addGlobe(ringGroup(props, middle, maxY + 0.02, angle + 2.2 / middle), M);
    }
  }
  addBatches(build.decor, [dividers, books]);
  markChildGroups(props);
  build.solids.push(...collectColliders(props));
  build.lights.push(...collectLights(props));
  build.decor.add(bakeByMaterial(props));
  disposeGeometries(props);
}


// ---------- 環狀美食區 ----------
interface FoodBatches { roundTables: Batch; squareTables: Batch; chairs: Batch; longTables: Batch; benches: Batch; pots: Batch; bushes: Batch }
type TableKind = 'round' | 'square' | 'long';
const TABLE_KINDS: TableKind[] = ['round', 'square', 'long'];
// 一格用餐區：半徑 inner–outer，角度在兩條通道中線 from–to 之間（每一列再扣掉通道寬）
interface DiningCell { inner: number; outer: number; from: number; to: number; y: number; tableColor: number; chairColor: number; umbrella: number | null }

// 在 inner–outer 之間排幾列，列距 spacing，整組置中
function rowRadii(inner: number, outer: number, spacing: number): number[] {
  const rows = Math.floor((outer - inner) / spacing);
  const offset = (outer - inner - rows * spacing) / 2;
  return Array.from({ length: rows }, (_, i) => inner + offset + spacing * (i + 0.5));
}

// 半徑 r 這一列可以放東西的角度：兩條通道之間，扣掉通道寬；每個位置間隔 spacing 公尺（弧長），整列置中
function arcSlots(cell: DiningCell, r: number, spacing: number, size: number): number[] {
  const start = cell.from + SHOP_LAYOUT.passage / 2 / r;
  const end = cell.to - SHOP_LAYOUT.passage / 2 / r;
  const usable = (end - start) * r - size;
  if (usable < 0) return [];
  const count = Math.floor(usable / spacing) + 1;
  const middle = (start + end) / 2;
  return Array.from({ length: count }, (_, i) => middle + ((i - (count - 1) / 2) * spacing) / r);
}

// 桌傘：配重底座、桿子、八片條紋傘布。
function addTableUmbrella(g: THREE.Group, M: DetailMaterials, color: number): void {
  skipCollider(g);
  rod(g, M.darkMetal, [0, 0, 0], [0, 2.4, 0], 0.025);
  addMesh(g, new THREE.ConeGeometry(1.3, 0.4, 8, 1, true), M.awning(color), [0, 2.25, 0]);
}

// 椅子放在離 (x, z) offset 公尺、direction 方向的位置，面向中心
function addChairFacing(batches: FoodBatches, cell: DiningCell, x: number, z: number, direction: number, offset: number): void {
  batches.chairs.add(transform(x + polarX(offset, direction), cell.y, z + polarZ(offset, direction), direction + Math.PI, 0, 0, 1, 1, 1), cell.chairColor);
}

// 圓桌：四張椅子斜放成 X；有 umbrella 顏色時每桌一支傘
function addRoundTables(batches: FoodBatches, cell: DiningCell, solids: SolidBox[], props: THREE.Group): void {
  const { row, column } = DINING.round;
  for (const r of rowRadii(cell.inner, cell.outer, row)) {
    for (const theta of arcSlots(cell, r, column, column)) {
      const x = polarX(r, theta);
      const z = polarZ(r, theta);
      batches.roundTables.add(transform(x, cell.y, z, theta, 0, 0, 1, 1, 1), cell.tableColor);
      solids.push(orientedSolid(x, z, theta, 1.25, 1.25, cell.y, cell.y + 0.8));
      for (let k = 0; k < 4; k++) addChairFacing(batches, cell, x, z, theta + Math.PI / 4 + (k * Math.PI) / 2, ROUND_CHAIR_OFFSET);
      if (cell.umbrella !== null) addTableUmbrella(childGroup(props, [x, cell.y, z]), getDetailMaterials(), cell.umbrella);
    }
  }
}

// 方桌：長邊沿圓周，兩張椅子一內一外
function addSquareTables(batches: FoodBatches, cell: DiningCell, solids: SolidBox[]): void {
  const { row, column } = DINING.square;
  for (const r of rowRadii(cell.inner, cell.outer, row)) {
    for (const theta of arcSlots(cell, r, column, column)) {
      const x = polarX(r, theta);
      const z = polarZ(r, theta);
      batches.squareTables.add(transform(x, cell.y, z, theta, 0, 0, 1, 1, 1), cell.tableColor);
      solids.push(orientedSolid(x, z, theta, 1.25, 0.85, cell.y, cell.y + 0.8));
      for (const direction of [theta, theta + Math.PI]) addChairFacing(batches, cell, x, z, direction, SQUARE_CHAIR_OFFSET);
    }
  }
}

// 長桌：沿圓周一段一段，內外兩側各一張長椅
function addLongTables(batches: FoodBatches, cell: DiningCell, solids: SolidBox[]): void {
  const { row, length, column } = DINING.long;
  for (const r of rowRadii(cell.inner, cell.outer, row)) {
    for (const theta of arcSlots(cell, r, length + column, length)) {
      const x = polarX(r, theta);
      const z = polarZ(r, theta);
      batches.longTables.add(transform(x, cell.y, z, theta, 0, 0, length, 1, 1), cell.tableColor);
      solids.push(orientedSolid(x, z, theta, length, BENCH_OFFSET * 2 + 0.35, cell.y, cell.y + 0.8));
      for (const side of [1, -1]) {
        batches.benches.add(transform(x + polarX(side * BENCH_OFFSET, theta), cell.y, z + polarZ(side * BENCH_OFFSET, theta), theta, 0, 0, length, 1, 1), cell.chairColor);
      }
    }
  }
}

// 通道兩旁一排植栽（盆子加一團綠葉），從 inner 排到 outer
function addAislePlanters(batches: FoodBatches, solids: SolidBox[], passage: number, inner: number, outer: number, y: number): void {
  const { spacing, size, inset } = AISLE_PLANTER;
  const potHeight = size * 0.9;
  for (let r = inner + size; r <= outer - size; r += spacing) {
    for (const side of [-1, 1]) {
      const theta = passage + (side * (SHOP_LAYOUT.passage / 2 - inset)) / r;
      const x = polarX(r, theta);
      const z = polarZ(r, theta);
      batches.pots.add(transform(x, y, z, theta, 0, 0, size, potHeight, size), POT_COLORS[0] ?? 0x9a8f84);
      batches.bushes.add(transform(x, y + potHeight + size * 0.6, z, theta, 0, 0, size * 1.1, size * 0.9, size * 1.1), BUSH_COLORS[1] ?? 0x5fa85d);
      solids.push(orientedSolid(x, z, theta, size * 2, size * 2, y, y + potHeight + size * 1.4));
    }
  }
}

// 街道上一圈路燈（每 STREET_LAMP_SPACING 公尺一盞，雙燈頭），每隔一盞旁邊一組分類垃圾桶
function addStreetLamps(props: THREE.Group, r: number, y: number, start: number): void {
  const M = getDetailMaterials();
  const count = Math.round((TAU * r) / STREET_LAMP_SPACING);
  for (let i = 0; i < count; i++) {
    const angle = start + (i * TAU) / count;
    const lamp = ringGroup(props, r, y, angle);
    skipCollider(lamp);
    markCollider(lamp, [0.3, 4.2, 0.3], [0, 2.1, 0]);
    markLight(lamp, [0, 4.1, 0], 'street');
    rod(lamp, M.darkMetal, [0, 0, 0], [0, 4.2, 0], 0.06, 0.045, 8);
    for (const side of [-1, 1]) {
      rod(lamp, M.darkMetal, [0, 4.1, 0], [side * 0.6, 4.25, 0], 0.025, 0.025, 6);
      addMesh(lamp, new THREE.SphereGeometry(0.16, 12, 8), M.lamp, [side * 0.6, 4.1, 0]);
    }
    if (i % 2 === 0) M.bins.forEach((material, k) => cylinder(ringGroup(props, r, y, angle + (1.2 + k * 0.5) / r), material, 0.2, 0.85, [0, 0.425, 0], 14));
  }
}

function buildFoodCourtRing(spec: RingSpec, build: PropsBuild, rng: Rng): void {
  addPlainSlab(spec, build, FOOD_FLOOR);
  const batches: FoodBatches = {
    roundTables: new Batch(GEOMETRY.roundTable), squareTables: new Batch(GEOMETRY.squareTable), chairs: new Batch(GEOMETRY.chair),
    longTables: new Batch(GEOMETRY.longTable), benches: new Batch(GEOMETRY.bench), pots: new Batch(GEOMETRY.pot), bushes: new Batch(GEOMETRY.bush, flatMaterial),
  };
  const props = new THREE.Group();
  const y = spec.maxY;
  const start = rng() * TAU;
  const { depth, backGap } = SHOP_LAYOUT;
  // 半徑由內往外：A 排店 → 街道 → 用餐區 1 → B＋C 排店 → 用餐區 2 → 外緣街道；兩塊用餐區一樣深
  const innerFront = addInnerShopRow(props, build.solids, spec.inner, y, start);
  const diningStart = innerFront + FOOD_STREET;
  const diningEnd = spec.outer - FOOD_STREET;
  const diningDepth = (diningEnd - diningStart - depth * 2 - backGap) / 2;
  const passages = addBackToBackRows(props, build.solids, diningStart + diningDepth + depth + backGap / 2, y, start);
  const areas = [
    { from: diningStart, to: diningStart + diningDepth, tablesFrom: diningStart + DINING_EDGE, tablesTo: diningStart + diningDepth - DINING_FRONTAGE, floor: 0xcfc7ba },
    { from: diningEnd - diningDepth, to: diningEnd, tablesFrom: diningEnd - diningDepth + DINING_FRONTAGE, tablesTo: diningEnd - DINING_EDGE, floor: 0xc9c3b5 },
  ];
  const tableY = y + FOOD_PATCH;
  areas.forEach((area, band) => {
    build.decor.add(annulus(area.from, area.to, y, tableY, colorMaterial(area.floor)));
    passages.forEach((passage, k) => {
      const next = passages[(k + 1) % passages.length] ?? passage;
      const cell: DiningCell = {
        inner: area.tablesFrom, outer: area.tablesTo, from: passage, to: next <= passage ? next + TAU : next, y: tableY,
        tableColor: TABLE_COLORS[k % TABLE_COLORS.length] ?? 0xffffff, chairColor: CHAIR_COLORS[k % CHAIR_COLORS.length] ?? 0x8a5a3b,
        umbrella: band === 1 ? (AWNING_COLORS[k % AWNING_COLORS.length] ?? null) : null,
      };
      const kind = TABLE_KINDS[(k + band) % TABLE_KINDS.length];
      if (kind === 'round') addRoundTables(batches, cell, build.solids, props);
      else if (kind === 'square') addSquareTables(batches, cell, build.solids);
      else addLongTables(batches, cell, build.solids);
      addAislePlanters(batches, build.solids, passage, area.tablesFrom, area.tablesTo, tableY);
    });
  });
  addStreetLamps(props, diningStart - 0.6, y, start);
  addStreetLamps(props, spec.outer - 0.8, y, start);
  addBatches(build.decor, Object.values(batches));
  markChildGroups(props);
  build.solids.push(...collectColliders(props));
  build.lights.push(...collectLights(props));
  build.decor.add(bakeByMaterial(props));
  disposeGeometries(props);
}

/** 依樣式建出一圈環。 */
export function buildRing(spec: RingSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  switch (spec.style) {
    case 'plain': addPlainSlab(spec, build); break;
    case 'floatingBooks': buildFloatingBooksRing(spec, build, rng); break;
    case 'shards': buildShardsRing(spec, build, rng); break;
    case 'bookshelf': buildLibraryRing(spec, build, rng); break;
    case 'restaurant': buildFoodCourtRing(spec, build, rng); break;
    case 'courts':
    case 'broken':
    case 'track':
    case 'houses':
    case 'floatingHouses':
    case 'pool':
    case 'greenway':
      throw new Error(`環樣式 ${spec.style} 由 oz-sports.ts／oz-track.ts／oz-pool.ts／oz-town.ts 建，main.ts 會直接分派過去`);
  }
  return build;
}

// ---------- 周圍的漂浮物 ----------
interface Spot { x: number; y: number; z: number }

// 這個位置會不會碰到環、圓錐、貓頭，或是太低、太遠。
function isFieldBlocked(spec: FieldSpec, x: number, y: number, z: number, size: number): boolean {
  const { cone } = spec;
  const r = Math.hypot(x, z);
  const { inner, outer } = fieldShell(spec);
  if (r - size < inner || r + size > outer || y < FIELD_LOW + size) return true;
  const nearRing = spec.rings.some((ring) =>
    r > ring.inner - size && r < ring.outer + size && y > ring.minY - FIELD_RING_MARGIN - size && y < ring.maxY + FIELD_RING_MARGIN + size);
  if (nearRing) return true;
  if (y < cone.tipY - size || y > cone.headTop + size) return false;
  const width = y > cone.topY
    ? cone.topRadius * FIELD_HEAD_WIDTH
    : cone.topRadius * Math.min(1, Math.max(0, (y - cone.tipY) / (cone.topY - cone.tipY)));
  return r < width + size + FIELD_CONE_MARGIN;
}

// 漂浮物散布的那一圈（水平半徑）：內緣是最外層環再往外 FIELD_RING_CLEAR，外緣再往外 FIELD_SPREAD（不超過 fieldRadius）。
function fieldShell(spec: FieldSpec): { inner: number; outer: number } {
  const inner = Math.max(0, ...spec.rings.map((ring) => ring.outer)) + FIELD_RING_CLEAR;
  return { inner, outer: Math.min(spec.fieldRadius, inner + FIELD_SPREAD) };
}

// 隨機一個漂浮物的位置：在那一圈裡按面積平均（越外圈越多，密度一樣），高度也平均。
function randomFieldPoint(rng: Rng, spec: FieldSpec): Spot {
  const { inner, outer } = fieldShell(spec);
  const r = Math.sqrt(inner * inner + rng() * (outer * outer - inner * inner));
  const theta = rng() * TAU;
  return { x: polarX(r, theta), y: range(rng, [FIELD_LOW, spec.cone.headTop + FIELD_ABOVE_HEAD]), z: polarZ(r, theta) };
}

// 找一個不碰到環、圓錐、其他漂浮物的位置；試 PLACE_ATTEMPTS 次都找不到就放棄這一個。
function findFieldSpot(rng: Rng, spec: FieldSpec, size: number, placed: (Spot & { size: number })[], extraGap = FIELD_GAP): Spot | null {
  for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
    const spot = randomFieldPoint(rng, spec);
    if (isFieldBlocked(spec, spot.x, spot.y, spot.z, size)) continue;
    if (placed.some((other) => Math.hypot(other.x - spot.x, other.y - spot.y, other.z - spot.z) < other.size + size + extraGap)) continue;
    placed.push({ ...spot, size });
    return spot;
  }
  return null;
}

// 蜂窩狀六邊形平面：|q|、|p|、|q + p| 都不超過 rings 的軸座標格子組成一個大六邊形，隨機少幾格。
// 設計規則：一定有一格是不同顏色。
// 每格的碰撞：正六邊形剛好是三個轉了 0°、60°、120° 的矩形（寬 = 對邊距、深 = 外接圓半徑）疊起來，和外觀完全相符。
function addHexPad(rng: Rng, hexes: Batch, pad: THREE.Matrix4, cell: number, rings: number, solids: SolidBox[]): Part[] {
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
    const world = pad.clone().multiply(local);
    const center = new THREE.Vector3().setFromMatrixPosition(world);
    const yaw = new THREE.Euler().setFromRotationMatrix(pad, 'YXZ').y;
    for (const turn of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      solids.push({ ...orientedSolid(center.x, center.z, yaw + turn, Math.sqrt(3) * cell, cell, center.y - HEX_THICKNESS / 2, center.y + HEX_THICKNESS / 2), standable: true });
    }
    return hexes.add(world, tileColor);
  });
}

// 一個圓盤（半徑 radius）的碰撞：從圓心往外 DISC_STRIPS 條長條，相鄰兩條在圓周上剛好接上，邊角最多超出圓 2%。
const DISC_STRIPS = 16;
function discSolids(x: number, z: number, radius: number, minY: number, maxY: number): SolidBox[] {
  const width = 2 * radius * Math.tan(Math.PI / DISC_STRIPS);
  return Array.from({ length: DISC_STRIPS }, (_, k) => {
    const angle = (k / DISC_STRIPS) * TAU;
    // yaw = angle 時自身 z 朝外（徑向）
    return { ...orientedSolid(x + Math.sin(angle) * radius / 2, z + Math.cos(angle) * radius / 2, angle, width, radius, minY, maxY), standable: true };
  });
}

// 一圈環（內半徑 inner、外半徑 outer）的碰撞：沿圓周切成 RING_PAD.segments 段切線方向的長方塊，
// 每段在環的中線剛好接上，空隙那一側不會多出來（差不到環寬的 7%）。
function annulusSolids(x: number, z: number, inner: number, outer: number, minY: number, maxY: number): SolidBox[] {
  const middle = (inner + outer) / 2;
  const length = 2 * middle * Math.tan(Math.PI / RING_PAD.segments);
  return Array.from({ length: RING_PAD.segments }, (_, k) => {
    const angle = (k / RING_PAD.segments) * TAU;
    // yaw = angle 時自身 z 朝外（徑向）、自身 x 沿切線
    return { ...orientedSolid(x + Math.sin(angle) * middle, z + Math.cos(angle) * middle, angle, length, outer - inner, minY, maxY), standable: true };
  });
}

// 同心圓環平台：中間一個圓盤、外面兩圈環，彼此之間是空的（可以從縫掉下去）；三塊顏色深淺交錯，一定有一塊是不同顏色。
// 回傳一個 Group（原點在平台中心），碰撞方塊是世界座標。
function addRingPad(rng: Rng, spot: Spot, solids: SolidBox[]): THREE.Group {
  const group = new THREE.Group();
  group.position.set(spot.x, spot.y, spot.z);
  const color = pick(rng, PLATFORM_COLORS);
  const accent = pick(rng, PLATFORM_ACCENTS);
  const accentPiece = Math.floor(rng() * 3);
  const half = RING_PAD.thickness / 2;
  const pieceColor = (k: number): number => (k === accentPiece ? accent : shade(color, k % 2 === 0 ? 0 : -0.14));
  const disc = range(rng, RING_PAD.disc);
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(disc, disc, RING_PAD.thickness, 48), colorMaterial(pieceColor(0))));
  solids.push(...discSolids(spot.x, spot.z, disc, spot.y - half, spot.y + half));
  let inner = disc;
  for (let k = 1; k <= 2; k++) {
    inner += range(rng, RING_PAD.gap);
    const outer = inner + range(rng, RING_PAD.ring);
    group.add(annulus(inner, outer, -half, half, colorMaterial(pieceColor(k))));
    solids.push(...annulusSolids(spot.x, spot.z, inner, outer, spot.y - half, spot.y + half));
    inner = outer;
  }
  return group;
}

// 方格平台：n × n 塊方磚，中間那塊一定在，其他隨機少幾塊、高低略有不同；一定有一塊是不同顏色。每塊自己的碰撞。
function addTilePad(rng: Rng, tiles: Batch, spot: Spot, solids: SolidBox[]): Part[] {
  const n = Math.floor(range(rng, TILE_PAD.cells));
  const cell = range(rng, TILE_PAD.cell);
  const step = cell * TILE_PAD.spacing;
  const yaw = rng() * TAU;
  const color = pick(rng, HEX_COLORS);
  const accent = pick(rng, HEX_COLORS.filter((candidate) => candidate !== color));
  const cells: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const isCenter = i === Math.floor(n / 2) && j === Math.floor(n / 2);
      if (!isCenter && rng() < TILE_PAD.drop) continue;
      cells.push([i - (n - 1) / 2, j - (n - 1) / 2]);
    }
  }
  const accentIndex = Math.floor(rng() * cells.length);
  return cells.map(([i, j], index) => {
    const x = spot.x + Math.cos(yaw) * i * step + Math.sin(yaw) * j * step;
    const z = spot.z - Math.sin(yaw) * i * step + Math.cos(yaw) * j * step;
    const y = spot.y + spread(rng, TILE_PAD.jitter);
    solids.push({ ...orientedSolid(x, z, yaw, cell, cell, y - TILE_PAD.thickness / 2, y + TILE_PAD.thickness / 2), standable: true });
    return tiles.add(transform(x, y, z, yaw, 0, 0, cell, TILE_PAD.thickness, cell), index === accentIndex ? accent : shade(color, spread(rng, 0.05)));
  });
}

/**
 * 環周圍的漂浮物：島嶼（見 oz-islands.ts，分散在整個範圍）、同心圓環（圓盤＋兩圈環，中間有空隙）與方格平台、
 * 蜂窩狀六邊形平面、立體符號（見 oz-symbols.ts，會慢慢轉）；平台和符號大多聚在幾處，全部都在飄。
 */
export function buildFloatingField(spec: FieldSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  const placed: (Spot & { size: number })[] = [];
  const hexes = new Batch(GEOMETRY.hex, flatMaterial);
  const tiles = new Batch(GEOMETRY.box, flatMaterial);
  const symbols = new Map<string, Batch>();

  // 島嶼：有用途的大島先放，再放自然的小島；不跟著聚集處、彼此多留 ISLAND_GAP，分散在整個範圍
  const islands = [...THEMED_ISLANDS, ...Array.from({ length: spec.islands }, () => ({ theme: 'nature' as const, radius: range(rng, ISLAND_RADIUS) }))];
  for (const { theme, radius } of islands) {
    const tries = theme === 'nature' ? ISLAND_PLACE_TRIES : THEMED_PLACE_TRIES;
    let spot: Spot | null = null;
    for (let attempt = 0; attempt < tries && !spot; attempt++) spot = findFieldSpot(rng, spec, radius, placed, ISLAND_GAP);
    if (!spot) continue;
    const island = buildIsland(rng, theme, radius);
    island.group.position.set(spot.x, spot.y, spot.z);
    build.decor.add(island.group);
    const at = spot;
    addObjectFloater(build, rng, spec.bobScale, island.group, island.solids.map((solid) => ({ ...solid, cx: solid.cx + at.x, cz: solid.cz + at.z, minY: solid.minY + at.y, maxY: solid.maxY + at.y })));
  }

  // 平台：一半是同心圓環、一半是方格，都是平的，碰撞和外觀相符
  for (let i = 0; i < spec.platforms; i++) {
    const isRing = i % 2 === 0;
    const ringPadRadius = RING_PAD.disc[1] + 2 * (RING_PAD.gap[1] + RING_PAD.ring[1]);
    const spot = findFieldSpot(rng, spec, isRing ? ringPadRadius : TILE_PAD.cell[1] * TILE_PAD.cells[1] * 0.75, placed);
    if (!spot) continue;
    const solids: SolidBox[] = [];
    if (isRing) {
      const pad = addRingPad(rng, spot, solids);
      build.decor.add(pad);
      addObjectFloater(build, rng, spec.bobScale, pad, solids);
      continue;
    }
    addPartsFloater(build, rng, spec.bobScale, addTilePad(rng, tiles, spot, solids), solids);
  }

  for (let i = 0; i < spec.hexPads; i++) {
    const cell = range(rng, HEX_RADIUS);
    const rings = rng() < 0.5 ? 1 : 2;
    const spot = findFieldSpot(rng, spec, Math.sqrt(3) * cell * HEX_SPACING * (rings + 0.5), placed);
    if (!spot) continue;
    const pad = transform(spot.x, spot.y, spot.z, rng() * TAU, 0, 0, 1, 1, 1);
    const solids: SolidBox[] = [];
    const parts = addHexPad(rng, hexes, pad, cell, rings, solids);
    addPartsFloater(build, rng, spec.bobScale, parts, solids);
  }

  // 漂浮的盧恩符文：大多直立、稍微歪，上下飄的同時繞垂直軸慢慢轉
  for (let i = 0; i < spec.debris; i++) {
    const text = pick(rng, RUNES);
    const geometry = runeGeometry(text);
    const size = range(rng, SYMBOL_SIZE);
    const spot = findFieldSpot(rng, spec, size, placed);
    if (!spot) continue;
    let batch = symbols.get(text);
    if (!batch) {
      batch = new Batch(geometry, instanceMaterial);
      symbols.set(text, batch);
    }
    addSpinningSymbol(build, rng, spec.bobScale, batch, geometry, spot, size);
  }

  addBatches(build.decor, [hexes, tiles, ...symbols.values()]);
  return build;
}
