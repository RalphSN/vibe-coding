// 環周圍的漂浮島嶼。
// 每座島上面是一片平的草地，下面是一大塊不規則的土塊：越往下越窄、表面凹凸、有幾個往下垂的瘤，
// 顏色從表土、一層層土色到底部的岩層；土塊上掛著小石塊，邊緣垂著樹根。
// 大部分是自然的小島（森林、草原、石堆）；幾座比較大的有用途：停機坪、一盞路燈配一張長椅、一間小屋、露營地、池塘（有瀑布）、瞭望台。
// 一座島是一個 Group：本體一塊網格（頂點顏色）＋上面的東西依材質合併，整座一起上下飄。
// 碰撞：頂面是 TOP_STRIPS 條從中心往外、照邊緣形狀切的長條方塊（拼起來就是島的輪廓），上面每個東西各自一個方塊，
// 全部站得上去、跟著飄。頂面是平的，站的高度和看到的草地一樣。
import * as THREE from 'three';
import { bakeByMaterial, colorMaterial, orientedSolid, shinyMaterial, type SolidBox } from './oz-props';
import {
  TAU, addMesh, box, childGroup, collectColliders, cylinder, markChildGroups, markCollider, pixelTexture, range, rod, skipCollider,
  type Range, type Rng, type Vec3,
} from './oz-kit';

export type IslandTheme = 'nature' | 'helipad' | 'lampBench' | 'cottage' | 'camp' | 'pond' | 'lookout';

/** 有用途的大島：每種一座，先放（比較大，先找位置才放得下）。 */
export const THEMED_ISLANDS: { theme: IslandTheme; radius: number }[] = [
  { theme: 'helipad', radius: 19 },
  { theme: 'cottage', radius: 14 },
  { theme: 'pond', radius: 13 },
  { theme: 'camp', radius: 12 },
  { theme: 'lookout', radius: 10 },
  { theme: 'lampBench', radius: 6.5 },
];

// ---------- 島的形狀 ----------
const OUTLINE_WAVES = [{ k: 2, amp: 0.1 }, { k: 3, amp: 0.07 }, { k: 5, amp: 0.04 }, { k: 7, amp: 0.025 }];
const BODY_ANGLES = 40;
const BODY_LAYERS = 9;
const LIP = 0.5;
const TOP_RINGS = [0.18, 0.4, 0.62, 0.82, 1];                       // 草皮邊緣的厚度
const DEPTH_PER_RADIUS: Range = [0.75, 1.05];
const DEPTH_EXTRA = 2;
const LOBE_STRENGTH = 0.28;            // 往下垂的瘤有多突出
const SURFACE_NOISE = 0.16;
const DRIFT_PER_RADIUS: Range = [0.08, 0.28];   // 土塊尖端偏離中心多少
const TOP_STRIPS = 32;                 // 頂面碰撞切成幾條（越多越貼邊緣）
const TOP_STRIP_INSET = 0.99;          // 長條比邊緣短一點點，邊角才不會超出草地

const GRASS_TOP = [0x7cc576, 0x6cb86a, 0x82c47a, 0x74bd6c];
const GRASS_SIDE = 0x5a9a4f;
const TOPSOIL = 0x5e4330;
const SOIL = [0x8a6648, 0x9b7653, 0x7d5c40, 0xa5835f];
const ROCK = [0x8d857c, 0x7a726a, 0x9a9187, 0x6f6760];
const ROOT_COLOR = 0x4a3426;
const TREE_GREENS = [0x4f9a4c, 0x5fa85d, 0x3f8a5f, 0x77b46f];
const PINE_GREENS = [0x2f6b4a, 0x3a7a52, 0x2c5e43];
const BLOSSOMS = [0xf7b6c8, 0xf4a6bd, 0xe39b3c];
const FLOWERS = [0xe63946, 0xf2c200, 0xff7ac3, 0xffffff, 0x8e44ad, 0xf4a261];

interface IslandShape { radius: number; rim: (angle: number) => number; minRim: number; depth: number }
interface Footprint { x: number; z: number; r: number }
type Point = { x: number; z: number };

/** 一座島建好的結果：group 放在原點（呼叫端再移到位置），solids 是島自身座標的碰撞方塊。 */
export interface IslandBuild { group: THREE.Group; solids: SolidBox[] }

const get = <T>(items: readonly T[], i: number): T => {
  const item = items[((i % items.length) + items.length) % items.length];
  if (item === undefined) throw new Error(`漂浮島：取不到第 ${i} 項（共 ${items.length} 項）`);
  return item;
};
const pick = <T>(rng: Rng, items: readonly T[]): T => get(items, Math.floor(rng() * items.length));
const spread = (rng: Rng, half: number): number => (rng() * 2 - 1) * half;

function islandShape(rng: Rng, radius: number): IslandShape {
  const waves = OUTLINE_WAVES.map(({ k, amp }) => ({ k, amp: amp * range(rng, [0.6, 1.4]), phase: rng() * TAU }));
  const rim = (angle: number): number => radius * (1 + waves.reduce((sum, wave) => sum + wave.amp * Math.sin(wave.k * angle + wave.phase), 0));
  let minRim = Infinity;
  for (let i = 0; i < 90; i++) minRim = Math.min(minRim, rim((i / 90) * TAU));
  return { radius, rim, minRim, depth: radius * range(rng, DEPTH_PER_RADIUS) + DEPTH_EXTRA };
}

/** 島頂面在 (x, z) 的高度：頂面是平的，都是 0。 */
const surfaceY = (_shape: IslandShape, _x: number, _z: number): number => 0;

// ---------- 材質與共用幾何 ----------
const flatMaterials = new Map<number, THREE.MeshLambertMaterial>();
/** 平面著色（低多邊形）的單色材質：樹冠、石頭。 */
function flatColor(color: number): THREE.MeshLambertMaterial {
  const cached = flatMaterials.get(color);
  if (cached) return cached;
  const material = new THREE.MeshLambertMaterial({ color, flatShading: true });
  flatMaterials.set(color, material);
  return material;
}
const glow = (color: number): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color });

let shared: ReturnType<typeof createShared> | null = null;
function createShared() {
  return {
    sphere: new THREE.SphereGeometry(1, 16, 12),
    ico0: new THREE.IcosahedronGeometry(1, 0),
    ico1: new THREE.IcosahedronGeometry(1, 1),
    rock: new THREE.DodecahedronGeometry(1, 0),
    tuft: new THREE.ConeGeometry(0.07, 0.45, 4).translate(0, 0.225, 0),
    body: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    helipad: new THREE.MeshLambertMaterial({ map: pixelTexture(256, 256, drawHelipad) }),
    windsock: new THREE.MeshLambertMaterial({ map: pixelTexture(8, 64, drawWindsock), side: THREE.DoubleSide }),
    roofTiles: (() => {
      const map = pixelTexture(128, 128, drawRoofTiles);
      map.repeat.set(4, 6);
      return new THREE.MeshLambertMaterial({ map, color: 0xb5523b });
    })(),
    waterfall: new THREE.MeshBasicMaterial({ map: pixelTexture(32, 256, drawWaterfall), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    pond: shinyMaterial(0x3a8fd0, 0.2, 0.12),
    glass: shinyMaterial(0x2a3e55, 0.4, 0.12),
    metal: shinyMaterial(0xc9ced4, 0.8, 0.3),
    iron: shinyMaterial(0x2e3338, 0.6, 0.45),
    warmLight: glow(0xfff1c9),
    padGreen: glow(0x7dff9a),
    padWhite: glow(0xffffff),
    flameOuter: glow(0xff8a1f),
    flameInner: glow(0xffd23f),
  };
}
type Shared = ReturnType<typeof createShared>;
function getShared(): Shared {
  shared ??= createShared();
  return shared;
}

/** 放一個縮放過的共用幾何（縮放各軸不同）。 */
function scaled(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: Vec3, scale: Vec3, rotation: Vec3 = [0, 0, 0]): THREE.Mesh {
  const mesh = addMesh(parent, geometry, material, position, rotation);
  mesh.scale.set(...scale);
  return mesh;
}

// ---------- 貼圖 ----------
// 停機坪：深灰底、白色外框虛線、黃色圓圈、白色大 H
function drawHelipad(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#5b6066';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.setLineDash([18, 12]);
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#f2c200';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(128, 128, 88, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(88, 78, 20, 100);
  ctx.fillRect(148, 78, 20, 100);
  ctx.fillRect(108, 118, 40, 20);
}
// 風向袋：橘白相間的環帶（沿著袋子的長度）
function drawWindsock(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#f26b1d' : '#f4f1ea';
    ctx.fillRect(0, (i * 64) / 5, 8, 64 / 5 + 1);
  }
}
// 屋瓦：一排排錯開的瓦片（材質顏色再染上去）
function drawRoofTiles(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 8; col++) {
      const x = col * 16 + (row % 2) * 8;
      const tone = 205 + ((row * 7 + col * 13) % 5) * 10;
      ctx.fillStyle = `rgb(${tone}, ${tone}, ${tone})`;
      ctx.fillRect(x + 1, row * 16 + 1, 14, 13);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x + 1, row * 16 + 13, 14, 2);
    }
  }
}
// 瀑布：上面濃、往下越來越透明，幾條直的水紋
function drawWaterfall(ctx: CanvasRenderingContext2D): void {
  const fade = ctx.createLinearGradient(0, 0, 0, 256);
  fade.addColorStop(0, 'rgba(225,242,255,0.95)');
  fade.addColorStop(0.6, 'rgba(200,230,250,0.55)');
  fade.addColorStop(1, 'rgba(200,230,250,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 32, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (const x of [4, 11, 19, 26]) ctx.fillRect(x, 0, 2, 200);
}

// ---------- 島的本體 ----------
// 頂面：中心點加三圈（隆起），草皮邊緣一圈，土塊 BODY_LAYERS - 1 圈往下收窄，最後一個尖端。
// 每個三角形一個顏色（低多邊形），三角形的朝向用「應該朝哪邊」決定，不用記頂點順序。
function islandBody(rng: Rng, shape: IslandShape): { mesh: THREE.Mesh; anchors: THREE.Vector3[]; lip: THREE.Vector3[] } {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  const normal = new THREE.Vector3();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, want: THREE.Vector3, hex: number): void => {
    normal.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const [p, q] = normal.dot(want) >= 0 ? [b, c] : [c, b];
    for (const v of [a, p, q]) positions.push(v.x, v.y, v.z);
    color.setHex(hex).offsetHSL(0, 0, spread(rng, 0.02));
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  };
  const angles = Array.from({ length: BODY_ANGLES }, (_, i) => (i / BODY_ANGLES) * TAU);
  const { rim, depth, radius } = shape;
  const ringAt = (make: (angle: number, i: number) => THREE.Vector3): THREE.Vector3[] => angles.map(make);
  // 頂面的圈：從邊緣往內每隔一圈錯開半格，三角形才不會排成放射狀的星形
  const step = TAU / BODY_ANGLES;
  const top = TOP_RINGS.map((f, j) => {
    const offset = (TOP_RINGS.length - 1 - j) % 2 === 1 ? step / 2 : 0;
    return angles.map((base) => {
      const angle = base + offset;
      const wobble = f < 1 ? 1 + spread(rng, 0.05) : 1;
      return new THREE.Vector3(Math.sin(angle) * rim(angle) * f * wobble, 0, Math.cos(angle) * rim(angle) * f * wobble);
    });
  });
  const lip = ringAt((angle) => new THREE.Vector3(Math.sin(angle) * rim(angle) * 1.015, -LIP, Math.cos(angle) * rim(angle) * 1.015));
  // 土塊表面的凹凸：每圈一組亂數，和左右鄰居平均過，才不會一格一格跳
  const noise = Array.from({ length: BODY_LAYERS }, () => {
    const raw = angles.map(() => spread(rng, 1));
    return raw.map((value, i) => (value * 2 + get(raw, i - 1) + get(raw, i + 1)) / 4);
  });
  const lobes = 2 + Math.floor(rng() * 2);
  const lobePhase = rng() * TAU;
  const driftAngle = rng() * TAU;
  const drift = radius * range(rng, DRIFT_PER_RADIUS);
  const centerAt = (t: number): THREE.Vector3 => new THREE.Vector3(Math.sin(driftAngle) * drift * t * t, 0, Math.cos(driftAngle) * drift * t * t);
  const soil: { ring: THREE.Vector3[]; t: number }[] = [];
  for (let k = 1; k < BODY_LAYERS; k++) {
    const t = k / BODY_LAYERS;
    const taper = (1 - t ** 1.4) ** 0.75;
    const offset = centerAt(t);
    soil.push({
      t,
      ring: ringAt((angle, i) => {
        const lobe = 1 + LOBE_STRENGTH * t * Math.max(0, Math.sin(lobes * angle + lobePhase));
        const r = rim(angle) * taper * lobe * (1 + SURFACE_NOISE * get(get(noise, k), i));
        return new THREE.Vector3(offset.x + Math.sin(angle) * r, -LIP - depth * t ** 1.1 + spread(rng, 0.3), offset.z + Math.cos(angle) * r);
      }),
    });
  }
  const tip = centerAt(1).setY(-LIP - depth * 1.04);
  const up = new THREE.Vector3(0, 1, 0);
  const center = new THREE.Vector3(0, 0, 0);
  const firstTop = get(top, 0);
  for (let i = 0; i < BODY_ANGLES; i++) tri(center, get(firstTop, i), get(firstTop, i + 1), up, pick(rng, GRASS_TOP));
  // 兩圈之間的四邊形：want 是從這一層的中心往外、稍微往下
  const band = (upper: THREE.Vector3[], lower: THREE.Vector3[], hexAt: (i: number) => number, layerCenter: THREE.Vector3, down: number): void => {
    for (let i = 0; i < BODY_ANGLES; i++) {
      const a = get(upper, i);
      const b = get(upper, i + 1);
      const c = get(lower, i + 1);
      const d = get(lower, i);
      const want = a.clone().add(c).multiplyScalar(0.5).sub(layerCenter).setY(0).normalize().setY(down);
      const hex = hexAt(i);
      tri(a, b, c, want, hex);
      tri(a, c, d, want, hex);
    }
  };
  for (let j = 1; j < top.length; j++) band(get(top, j - 1), get(top, j), () => pick(rng, GRASS_TOP), new THREE.Vector3(), 10);
  band(get(top, top.length - 1), lip, () => GRASS_SIDE, new THREE.Vector3(), 0);
  let upper = lip;
  for (const { ring, t } of soil) {
    const strata = Math.floor(t * 9 + spread(rng, 0.4));
    band(upper, ring, (i) => {
      if (t < 0.15) return TOPSOIL;
      if (t > 0.62 + 0.08 * Math.sin(i)) return pick(rng, ROCK);
      return get(SOIL, strata);
    }, centerAt(t), -0.4);
    upper = ring;
  }
  for (let i = 0; i < BODY_ANGLES; i++) tri(tip, get(upper, i), get(upper, i + 1), new THREE.Vector3(0, -1, 0), pick(rng, ROCK));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const anchors = soil.filter(({ t }) => t > 0.3 && t < 0.85).flatMap(({ ring }) => ring);
  return { mesh: new THREE.Mesh(geometry, getShared().body), anchors, lip };
}

// 土塊上掛的小石塊、從草皮邊緣垂下來的樹根（只有外觀）。
function addUnderside(props: THREE.Group, rng: Rng, anchors: THREE.Vector3[], lip: THREE.Vector3[], radius: number): void {
  const S = getShared();
  const rocks = Math.round(3 + radius / 3);
  for (let i = 0; i < rocks; i++) {
    const at = pick(rng, anchors);
    const size = range(rng, [0.3, 0.9]) * Math.min(2, radius / 8);
    scaled(props, S.rock, flatColor(pick(rng, ROCK)), [at.x * 1.02, at.y - size * 0.5, at.z * 1.02], [size, size * range(rng, [1, 1.8]), size], [rng(), rng(), rng()]);
  }
  const roots = Math.round(4 + radius / 2);
  const root = flatColor(ROOT_COLOR);
  for (let i = 0; i < roots; i++) {
    const at = pick(rng, lip);
    const from: Vec3 = [at.x * 0.97, at.y - 0.3, at.z * 0.97];
    const mid: Vec3 = [at.x * 0.95 + spread(rng, 0.4), at.y - range(rng, [1, 2]), at.z * 0.95 + spread(rng, 0.4)];
    const end: Vec3 = [mid[0] * 0.97 + spread(rng, 0.5), mid[1] - range(rng, [0.8, 2.5]), mid[2] * 0.97 + spread(rng, 0.5)];
    rod(props, root, from, mid, 0.08, 0.05, 5);
    rod(props, root, mid, end, 0.05, 0.015, 5);
  }
}

// ---------- 擺放 ----------
// 在島頂面上找一個不和已放的東西重疊的點（reach：最遠到邊緣半徑的幾倍）。
function scatter(rng: Rng, shape: IslandShape, taken: Footprint[], r: number, reach = 0.78): Point | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = rng() * TAU;
    const distance = Math.sqrt(rng()) * reach * shape.rim(angle);
    const x = Math.sin(angle) * distance;
    const z = Math.cos(angle) * distance;
    if (taken.some((other) => Math.hypot(other.x - x, other.z - z) < other.r + r)) continue;
    taken.push({ x, z, r });
    return { x, z };
  }
  return null;
}
const groupAt = (props: THREE.Group, shape: IslandShape, point: Point, yaw = 0): THREE.Group =>
  childGroup(props, [point.x, surfaceY(shape, point.x, point.z), point.z], yaw);

// ---------- 植物與石頭 ----------
function addRoundTree(g: THREE.Group, rng: Rng, height: number, colors: number[]): void {
  skipCollider(g);
  markCollider(g, [0.45, height * 0.6, 0.45], [0, height * 0.3, 0]);
  const S = getShared();
  rod(g, flatColor(0x7a5a3c), [0, 0, 0], [0, height * 0.65, 0], height * 0.06, height * 0.035, 6);
  rod(g, flatColor(0x7a5a3c), [0, height * 0.45, 0], [height * 0.18, height * 0.7, 0.05], height * 0.025, height * 0.015, 5);
  const crown = height * 0.32;
  const main = pick(rng, colors);
  scaled(g, S.ico1, flatColor(main), [0, height * 0.78, 0], [crown, crown * 0.9, crown]);
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * TAU + rng();
    scaled(g, S.ico0, flatColor(pick(rng, colors)), [Math.sin(angle) * crown * 0.7, height * (0.68 + rng() * 0.15), Math.cos(angle) * crown * 0.7], [crown * 0.65, crown * 0.6, crown * 0.65], [rng(), rng(), 0]);
  }
}

function addPineTree(g: THREE.Group, rng: Rng, height: number): void {
  skipCollider(g);
  markCollider(g, [0.4, height * 0.5, 0.4], [0, height * 0.25, 0]);
  rod(g, flatColor(0x6b4a33), [0, 0, 0], [0, height * 0.35, 0], height * 0.045, height * 0.035, 6);
  const green = pick(rng, PINE_GREENS);
  for (let k = 0; k < 3; k++) {
    const radius = height * (0.3 - k * 0.07);
    const coneHeight = height * (0.42 - k * 0.06);
    addMesh(g, new THREE.ConeGeometry(radius, coneHeight, 7), flatColor(k === 1 ? green : get(PINE_GREENS, k)), [0, height * (0.35 + k * 0.2) + coneHeight / 2, 0], [0, rng(), 0]);
  }
}

function addBoulder(g: THREE.Group, rng: Rng, size: number): void {
  const S = getShared();
  scaled(g, S.rock, flatColor(pick(rng, ROCK)), [0, size * 0.35, 0], [size, size * range(rng, [0.55, 0.85]), size * range(rng, [0.8, 1.2])], [rng() * 0.4, rng() * TAU, 0]);
  if (rng() < 0.5) scaled(g, S.rock, flatColor(pick(rng, ROCK)), [size * 0.8, size * 0.15, size * 0.3], [size * 0.45, size * 0.35, size * 0.45], [rng(), rng(), 0]);
}

// 草叢與小花：沒有碰撞，直接放在 props 底下（不是 Group，不會產生碰撞方塊）。
function addTufts(props: THREE.Group, rng: Rng, shape: IslandShape, count: number, flowerShare: number): void {
  const S = getShared();
  for (let i = 0; i < count; i++) {
    const angle = rng() * TAU;
    const distance = Math.sqrt(rng()) * 0.92 * shape.rim(angle);
    const x = Math.sin(angle) * distance;
    const z = Math.cos(angle) * distance;
    const y = surfaceY(shape, x, z);
    if (rng() < flowerShare) {
      rod(props, flatColor(0x4f9a4c), [x, y, z], [x, y + 0.35, z], 0.015, 0.012, 4);
      scaled(props, S.ico0, flatColor(pick(rng, FLOWERS)), [x, y + 0.4, z], [0.09, 0.07, 0.09]);
      continue;
    }
    for (let blade = 0; blade < 3; blade++) {
      scaled(props, S.tuft, flatColor(pick(rng, GRASS_TOP.concat(GRASS_SIDE))), [x + spread(rng, 0.12), y, z + spread(rng, 0.12)], [1, range(rng, [0.7, 1.3]), 1], [spread(rng, 0.3), 0, spread(rng, 0.3)]);
    }
  }
}

function addTrees(props: THREE.Group, rng: Rng, shape: IslandShape, taken: Footprint[], count: number, pineShare: number): void {
  for (let i = 0; i < count; i++) {
    const spot = scatter(rng, shape, taken, 1.4);
    if (!spot) return;
    const g = groupAt(props, shape, spot, rng() * TAU);
    const height = range(rng, [3, 6.5]);
    if (rng() < pineShare) addPineTree(g, rng, height * 1.2);
    else addRoundTree(g, rng, height, rng() < 0.2 ? BLOSSOMS : TREE_GREENS);
  }
}

// ---------- 各種島 ----------
// 自然的小島：森林（樹多、有松樹）、草原（花多）、石堆（大石頭多）。
function decorateNature(props: THREE.Group, rng: Rng, shape: IslandShape, taken: Footprint[]): void {
  const kind = pick(rng, ['forest', 'forest', 'meadow', 'rocky'] as const);
  const area = Math.PI * (0.78 * shape.minRim) ** 2;
  const trees = Math.round(area / (kind === 'forest' ? 14 : kind === 'meadow' ? 55 : 70));
  const boulders = Math.max(1, Math.round(area / (kind === 'rocky' ? 18 : 90)));
  for (let i = 0; i < boulders; i++) {
    const size = range(rng, kind === 'rocky' ? [0.8, 2.2] : [0.5, 1.2]);
    const spot = scatter(rng, shape, taken, size);
    if (spot) addBoulder(groupAt(props, shape, spot, rng() * TAU), rng, size);
  }
  addTrees(props, rng, shape, taken, Math.min(14, trees), kind === 'forest' ? 0.45 : 0.15);
  addTufts(props, rng, shape, Math.min(70, Math.round(area / 2.5)), kind === 'meadow' ? 0.55 : 0.18);
}

function addParkBench(g: THREE.Group): void {
  const wood = colorMaterial(0x9c6b43);
  const iron = getShared().iron;
  for (const z of [-0.14, 0, 0.14]) box(g, wood, [1.8, 0.045, 0.12], [0, 0.46, z]);
  for (const y of [0.62, 0.76, 0.9]) box(g, wood, [1.8, 0.09, 0.03], [0, y, -0.25], [-0.15, 0, 0]);
  for (const x of [-0.78, 0.78]) {
    box(g, iron, [0.06, 0.46, 0.06], [x, 0.23, 0.17]);
    box(g, iron, [0.06, 0.95, 0.06], [x, 0.47, -0.22], [-0.15, 0, 0]);
    box(g, iron, [0.06, 0.05, 0.5], [x, 0.64, -0.02]);
  }
}

// 復古路燈：底座、細桿、橫飾、四角玻璃燈籠、尖頂。
function addVintageLamp(g: THREE.Group): void {
  const S = getShared();
  skipCollider(g);
  markCollider(g, [0.45, 4.1, 0.45], [0, 2.05, 0]);
  cylinder(g, S.iron, 0.24, 0.35, [0, 0.175, 0], 12);
  cylinder(g, S.iron, 0.15, 0.3, [0, 0.5, 0], 12);
  rod(g, S.iron, [0, 0.65, 0], [0, 3.2, 0], 0.075, 0.05, 10);
  rod(g, S.iron, [-0.35, 2.85, 0], [0.35, 2.85, 0], 0.025, 0.025, 6);
  for (const x of [-0.35, 0.35]) scaled(g, S.sphere, S.iron, [x, 2.85, 0], [0.05, 0.05, 0.05]);
  cylinder(g, S.iron, 0.2, 0.08, [0, 3.24, 0], 8);
  box(g, S.warmLight, [0.3, 0.45, 0.3], [0, 3.5, 0]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) box(g, S.iron, [0.035, 0.5, 0.035], [x * 0.16, 3.5, z * 0.16]);
  addMesh(g, new THREE.ConeGeometry(0.3, 0.3, 4), S.iron, [0, 3.88, 0], [0, Math.PI / 4, 0]);
  scaled(g, S.sphere, S.iron, [0, 4.07, 0], [0.06, 0.06, 0.06]);
}

// 一盞路燈和一張朝外看風景的長椅，旁邊一條踏腳石小路和一叢花。
function decorateLampBench(props: THREE.Group, rng: Rng, shape: IslandShape, taken: Footprint[]): void {
  const bench = childGroup(props, [0, 0, shape.minRim * 0.35], 0);
  addParkBench(bench);
  taken.push({ x: 0, z: shape.minRim * 0.35, r: 1.3 });
  addVintageLamp(childGroup(props, [1.45, 0, shape.minRim * 0.3]));
  taken.push({ x: 1.45, z: shape.minRim * 0.3, r: 0.6 });
  for (let i = 0; i < 5; i++) {
    const z = shape.minRim * 0.15 - i * 0.9;
    cylinder(props, flatColor(get(ROCK, i)), range(rng, [0.28, 0.38]), 0.08, [spread(rng, 0.25), 0.03, z], 8);
  }
  const bush = childGroup(props, [-1.7, 0, shape.minRim * 0.25]);
  scaled(bush, getShared().ico1, flatColor(0x5fa85d), [0, 0.45, 0], [0.7, 0.55, 0.7]);
  taken.push({ x: -1.7, z: shape.minRim * 0.25, r: 0.8 });
  addTrees(props, rng, shape, taken, 1, 0);
  addTufts(props, rng, shape, 30, 0.5);
}

// 直升機（原創的小型直升機）：紅色機身、玻璃罩、尾桿與尾翼、主旋翼四片、尾旋翼、起落橇。自身 +z 是機頭。
function addHelicopter(g: THREE.Group): void {
  const S = getShared();
  const red = colorMaterial(0xd2463c);
  const white = colorMaterial(0xf4f4f4);
  skipCollider(g);
  markCollider(g, [2.7, 2.6, 4.8], [0, 1.6, 0.2]);
  markCollider(g, [0.8, 1.6, 4], [0, 2.3, -4.2]);
  scaled(g, S.sphere, red, [0, 1.65, 0.2], [1.3, 1.2, 2.4]);
  scaled(g, S.sphere, white, [0, 1.35, 0.2], [1.33, 0.35, 2.43]);
  scaled(g, S.sphere, S.glass, [0, 1.95, 1.35], [1.02, 0.92, 1.25]);
  rod(g, red, [0, 1.9, -1.8], [0, 2.35, -6.2], 0.38, 0.15, 12);
  box(g, red, [0.12, 1.4, 0.8], [0, 2.9, -6.15], [0.25, 0, 0]);
  box(g, white, [1.5, 0.1, 0.5], [0, 2.35, -5.7]);
  box(g, S.iron, [0.05, 1.5, 0.12], [0.2, 2.9, -6.25]);
  box(g, S.iron, [0.05, 0.12, 1.5], [0.2, 2.9, -6.25]);
  cylinder(g, S.iron, 0.14, 0.6, [0, 3.1, 0], 8);
  cylinder(g, S.metal, 0.32, 0.18, [0, 3.45, 0], 12);
  for (let k = 0; k < 4; k++) {
    const angle = (k / 4) * TAU + 0.35;
    box(g, S.iron, [5.4, 0.06, 0.34], [Math.cos(angle) * 2.75, 3.52, -Math.sin(angle) * 2.75], [0, angle, 0]);
  }
  for (const side of [-1, 1]) {
    rod(g, S.metal, [side, 0.12, -1.8], [side, 0.12, 1.9], 0.07, 0.07, 8);
    rod(g, S.metal, [side, 0.12, 1.9], [side, 0.45, 2.3], 0.07, 0.07, 8);
    for (const z of [-0.9, 1]) rod(g, S.metal, [side, 0.12, z], [side * 0.6, 0.85, z * 0.9], 0.055, 0.055, 6);
  }
}

// 停機坪：圓形水泥台（H 標誌、外圈綠白燈）、直升機、風向袋、塔台小屋、油桶、照明燈。
function decorateHelipad(props: THREE.Group, rng: Rng, shape: IslandShape, taken: Footprint[]): void {
  const S = getShared();
  const padRadius = Math.min(9.5, shape.minRim * 0.62);
  const pad = childGroup(props, [0, 0, 0]);
  skipCollider(pad);
  // 圓台的碰撞：從中心往外 16 條長條，相鄰兩條在圓周上剛好接上（邊角最多超出 2%）
  const padStrip = 2 * padRadius * Math.tan(Math.PI / 16);
  for (let k = 0; k < 16; k++) {
    const angle = (k / 16) * TAU;
    markCollider(pad, [padStrip, 0.35, padRadius], [Math.sin(angle) * padRadius / 2, 0.175, Math.cos(angle) * padRadius / 2], angle);
  }
  cylinder(pad, colorMaterial(0x8c9096), padRadius, 0.35, [0, 0.175, 0], 48);
  addMesh(pad, new THREE.CircleGeometry(padRadius * 0.95, 48).rotateX(-Math.PI / 2), S.helipad, [0, 0.355, 0]);
  for (let k = 0; k < 16; k++) {
    const angle = (k / 16) * TAU;
    cylinder(pad, k % 2 === 0 ? S.padGreen : S.padWhite, 0.13, 0.16, [Math.sin(angle) * (padRadius + 0.25), 0.08, Math.cos(angle) * (padRadius + 0.25)], 8);
  }
  taken.push({ x: 0, z: 0, r: padRadius + 0.8 });
  addHelicopter(childGroup(props, [0, 0.35, 0], 0.6));
  const edge = padRadius + 2.2;
  const sock = childGroup(props, [-edge * 0.7, 0, -edge * 0.7]);
  skipCollider(sock);
  markCollider(sock, [0.3, 5.5, 0.3], [0, 2.75, 0]);
  rod(sock, S.metal, [0, 0, 0], [0, 5.4, 0], 0.07, 0.05, 8);
  addMesh(sock, new THREE.CylinderGeometry(0.4, 0.18, 2.2, 14, 1, true).rotateZ(Math.PI / 2), S.windsock, [1.15, 5.2, 0], [0, 0, -0.15]);
  taken.push({ x: -edge * 0.7, z: -edge * 0.7, r: 1 });
  // 塔台小屋：灰牆、整排窗、平屋頂、天線與小碟、門口小燈
  const hut = childGroup(props, [edge * 0.78, 0, edge * 0.35], -Math.PI / 2 - 0.4);
  box(hut, colorMaterial(0xd9dde2), [3.4, 2.7, 2.8], [0, 1.35, 0]);
  box(hut, S.glass, [3.42, 0.8, 2.82], [0, 1.9, 0]);
  box(hut, colorMaterial(0x6b7280), [3.8, 0.22, 3.2], [0, 2.81, 0]);
  box(hut, colorMaterial(0x2f4b7c), [0.95, 2.05, 0.08], [0.8, 1.02, 1.42]);
  box(hut, S.warmLight, [0.2, 0.2, 0.1], [1.5, 2.3, 1.45]);
  rod(hut, S.metal, [-1.2, 2.9, -0.8], [-1.2, 4.6, -0.8], 0.04, 0.02, 6);
  addMesh(hut, new THREE.SphereGeometry(0.45, 16, 8, 0, TAU, 0, Math.PI / 2), S.metal, [0.9, 3.05, -0.6], [-0.9, 0, 0]);
  taken.push({ x: edge * 0.78, z: edge * 0.35, r: 2.4 });
  const drums = childGroup(props, [edge * 0.55, 0, -edge * 0.65]);
  for (const [x, z] of [[0, 0], [0.65, 0.1], [0.3, 0.6]] as const) {
    cylinder(drums, colorMaterial(0xc0392b), 0.3, 0.9, [x, 0.45, z], 14);
    cylinder(drums, colorMaterial(0x8c2f26), 0.31, 0.05, [x, 0.6, z], 14);
  }
  taken.push({ x: edge * 0.55, z: -edge * 0.65, r: 1.2 });
  const flood = childGroup(props, [-edge * 0.8, 0, edge * 0.45], 2.4);
  skipCollider(flood);
  markCollider(flood, [0.3, 6, 0.3], [0, 3, 0]);
  rod(flood, S.iron, [0, 0, 0], [0, 6, 0], 0.09, 0.06, 8);
  box(flood, S.iron, [1.2, 0.1, 0.1], [0, 5.9, 0]);
  for (const x of [-0.4, 0.4]) {
    box(flood, S.iron, [0.42, 0.3, 0.25], [x, 6.1, 0.05], [0.4, 0, 0]);
    box(flood, S.warmLight, [0.36, 0.24, 0.02], [x, 6.06, 0.18], [0.4, 0, 0]);
  }
  taken.push({ x: -edge * 0.8, z: edge * 0.45, r: 0.6 });
  addTufts(props, rng, shape, 40, 0.15);
}

// 小屋的一扇窗：白窗框、深色玻璃、十字窗櫺、窗台、兩片百葉窗，前面的窗下還有花箱。窗面朝自身 +z。
function addCottageWindow(g: THREE.Group, rng: Rng, shutter: THREE.Material, hasFlowers: boolean): void {
  const S = getShared();
  const white = colorMaterial(0xfbf8f2);
  box(g, white, [1.15, 1.25, 0.1], [0, 0, 0]);
  box(g, S.glass, [0.9, 1.0, 0.12], [0, 0, 0]);
  box(g, white, [0.06, 1.0, 0.14], [0, 0, 0]);
  box(g, white, [0.9, 0.06, 0.14], [0, 0.1, 0]);
  box(g, white, [1.35, 0.08, 0.28], [0, -0.66, 0.1]);
  for (const side of [-1, 1]) {
    box(g, shutter, [0.46, 1.25, 0.06], [side * 0.84, 0, 0.03]);
    for (let k = 0; k < 5; k++) box(g, shutter, [0.4, 0.04, 0.08], [side * 0.84, -0.45 + k * 0.22, 0.05]);
  }
  if (!hasFlowers) return;
  box(g, colorMaterial(0x8a5a3b), [1.1, 0.26, 0.3], [0, -0.85, 0.2]);
  for (let k = 0; k < 7; k++) {
    scaled(g, getShared().ico0, flatColor(k % 2 === 0 ? 0x5fa85d : pick(rng, FLOWERS)), [-0.45 + k * 0.15, -0.66, 0.2 + spread(rng, 0.06)], [0.1, 0.09, 0.1]);
  }
}

// 一間小屋：石砌牆基、奶油色牆、白色牆角、瓦片斜屋頂（兩面山牆）、煙囪、門廊雨遮與門燈、帶百葉窗的窗戶。自身 +z 是正面。
function addCottage(g: THREE.Group, rng: Rng): void {
  const W = 6.2;
  const D = 5;
  const wallH = 3;
  const plinth = 0.45;
  const roofH = 2.3;
  const over = 0.45;
  const cream = colorMaterial(0xf4ead8);
  const white = colorMaterial(0xfbf8f2);
  const S = getShared();
  skipCollider(g);
  markCollider(g, [W + 0.3, plinth + wallH + roofH * 0.5, D + 0.3], [0, (plinth + wallH + roofH * 0.5) / 2, 0]);
  markCollider(g, [W + 0.6, roofH * 0.5, D * 0.5], [0, plinth + wallH + roofH * 0.75, 0]);
  box(g, colorMaterial(0x9a948b), [W + 0.3, plinth, D + 0.3], [0, plinth / 2, 0]);
  box(g, cream, [W, wallH, D], [0, plinth + wallH / 2, 0]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) box(g, white, [0.2, wallH, 0.2], [x * W / 2, plinth + wallH / 2, z * D / 2]);
  box(g, white, [W + 0.15, 0.18, D + 0.15], [0, plinth + wallH - 0.09, 0]);
  // 屋頂：屋脊沿 x，兩片斜屋面；兩端山牆是三角形
  const eaveY = plinth + wallH;
  const halfSpan = D / 2 + over;
  const slope = Math.atan2(roofH, halfSpan);
  const slopeLength = Math.hypot(roofH, halfSpan);
  for (const side of [-1, 1]) {
    box(g, S.roofTiles, [W + over * 2, 0.16, slopeLength], [0, eaveY + roofH / 2 + 0.08, side * halfSpan / 2], [side * slope, 0, 0]);
    box(g, white, [W + over * 2, 0.22, 0.12], [0, eaveY - 0.02, side * (halfSpan - 0.02)]);
  }
  box(g, colorMaterial(0x7a3b2c), [W + over * 2 + 0.05, 0.2, 0.3], [0, eaveY + roofH + 0.12, 0]);
  const gable = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, roofH * (D / 2) / halfSpan)]);
  for (const side of [-1, 1]) addMesh(g, new THREE.ShapeGeometry(gable), cream, [side * W / 2, eaveY, 0], [0, side * Math.PI / 2, 0]);
  // 山牆上的小圓窗
  for (const side of [-1, 1]) addMesh(g, new THREE.CircleGeometry(0.35, 16), S.glass, [side * (W / 2 + 0.02), eaveY + 0.8, 0], [0, side * Math.PI / 2, 0]);
  // 煙囪
  box(g, colorMaterial(0x9c5a4a), [0.75, 2.6, 0.75], [W * 0.28, eaveY + roofH * 0.55, -D * 0.18]);
  box(g, colorMaterial(0x7d4538), [0.95, 0.18, 0.95], [W * 0.28, eaveY + roofH * 0.55 + 1.35, -D * 0.18]);
  cylinder(g, colorMaterial(0xb5523b), 0.14, 0.35, [W * 0.28, eaveY + roofH * 0.55 + 1.6, -D * 0.18], 10);
  // 門：門框、門板、門把、門口台階、雨遮與兩根托架、門燈
  const front = D / 2;
  box(g, white, [1.3, 2.45, 0.1], [0, plinth + 1.2, front + 0.02]);
  box(g, colorMaterial(0x3f6b55), [1.0, 2.15, 0.12], [0, plinth + 1.07, front + 0.04]);
  for (const y of [0.55, 1.55]) box(g, colorMaterial(0x355c49), [0.75, 0.7, 0.14], [0, plinth + y, front + 0.05]);
  scaled(g, S.sphere, colorMaterial(0xc9a24a), [0.36, plinth + 1.05, front + 0.14], [0.05, 0.05, 0.05]);
  box(g, colorMaterial(0x9a948b), [1.8, plinth, 1], [0, plinth / 2, front + 0.5]);
  box(g, S.roofTiles, [1.8, 0.1, 1.1], [0, plinth + 2.75, front + 0.5], [0.3, 0, 0]);
  for (const x of [-0.75, 0.75]) rod(g, white, [x, plinth + 2.3, front + 0.05], [x, plinth + 2.68, front + 0.95], 0.04, 0.04, 5);
  box(g, S.iron, [0.16, 0.26, 0.12], [0.95, plinth + 1.9, front + 0.08]);
  box(g, S.warmLight, [0.1, 0.16, 0.06], [0.95, plinth + 1.9, front + 0.15]);
  // 窗戶：正面門的兩側、背面兩扇、兩側各一扇
  const shutter = colorMaterial(pick(rng, [0x6f9c8a, 0x4f6d8f, 0x8c5a6a]));
  const windowY = plinth + 1.65;
  for (const x of [-1.9, 1.9]) addCottageWindow(childGroup(g, [x, windowY, front + 0.05]), rng, shutter, true);
  for (const x of [-1.5, 1.5]) addCottageWindow(childGroup(g, [x, windowY, -front - 0.05], Math.PI), rng, shutter, false);
  for (const side of [-1, 1]) addCottageWindow(childGroup(g, [side * (W / 2 + 0.05), windowY, 0], side * Math.PI / 2), rng, shutter, false);
}

// 白色尖頭木柵欄：從 a 到 b 一段，每 0.4 m 一根，兩條橫木。
function addPicketFence(props: THREE.Group, a: Point, b: Point): void {
  const g = new THREE.Group();
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  g.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
  props.add(g);
  skipCollider(g);
  markCollider(g, [length, 1, 0.15], [0, 0.5, 0]);
  const white = colorMaterial(0xfbf8f2);
  for (const y of [0.3, 0.7]) box(g, white, [length, 0.08, 0.05], [0, y, -0.04]);
  const pickets = Math.max(2, Math.round(length / 0.4));
  for (let i = 0; i <= pickets; i++) {
    const x = -length / 2 + (length * i) / pickets;
    box(g, white, [0.09, 0.85, 0.035], [x, 0.425, 0]);
    addMesh(g, new THREE.ConeGeometry(0.065, 0.14, 4), white, [x, 0.92, 0], [0, Math.PI / 4, 0]);
  }
}

// 小屋島：一間小屋、白色柵欄圍出前院（正面留門）、踏腳石小路、信箱、花圃、院子裡一棵樹。
function decorateCottage(props: THREE.Group, rng: Rng, shape: IslandShape, taken: Footprint[]): void {
  addCottage(childGroup(props, [0, 0, -1]), rng);
  taken.push({ x: 0, z: -1, r: 4.6 });
  const hx = Math.min(7.5, shape.minRim * 0.72);
  const hz = Math.min(6.5, shape.minRim * 0.62);
  const gate = 0.8;
  const corners: [Point, Point][] = [
    [{ x: -hx, z: -hz }, { x: hx, z: -hz }],
    [{ x: hx, z: -hz }, { x: hx, z: hz }],
    [{ x: -hx, z: hz }, { x: -hx, z: -hz }],
    [{ x: hx, z: hz }, { x: gate, z: hz }],
    [{ x: -gate, z: hz }, { x: -hx, z: hz }],
  ];
  for (const [a, b] of corners) {
    addPicketFence(props, a, b);
    // 柵欄沿線也算佔用，樹和石頭才不會長在柵欄上
    const marks = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.2);
    for (let k = 0; k <= marks; k++) taken.push({ x: a.x + ((b.x - a.x) * k) / marks, z: a.z + ((b.z - a.z) * k) / marks, r: 0.5 });
  }
  for (let i = 0; i < 5; i++) {
    const z = 2.6 + i * ((hz - 2.4) / 5);
    cylinder(props, flatColor(get(ROCK, i)), range(rng, [0.3, 0.4]), 0.08, [spread(rng, 0.15), 0.03, z], 8);
  }
  taken.push({ x: 0, z: (hz + 2.4) / 2, r: 0.8 }, { x: 0, z: hz, r: 1 });
  const mailbox = childGroup(props, [gate + 0.6, 0, hz + 0.5], Math.PI);
  rod(mailbox, colorMaterial(0x6e4a2f), [0, 0, 0], [0, 1, 0], 0.05, 0.05, 6);
  box(mailbox, colorMaterial(0x2f4b7c), [0.42, 0.32, 0.55], [0, 1.15, 0]);
  addMesh(mailbox, new THREE.CylinderGeometry(0.21, 0.21, 0.55, 12, 1, false, 0, Math.PI), colorMaterial(0x2f4b7c), [0, 1.31, 0], [Math.PI / 2, Math.PI / 2, 0]);
  box(mailbox, colorMaterial(0xc0392b), [0.04, 0.25, 0.08], [0.23, 1.3, 0.15]);
  for (const side of [-1, 1]) {
    const bed = childGroup(props, [side * 3.4, 0, 1.9]);
    box(bed, colorMaterial(0x6b4a33), [1.6, 0.2, 0.7], [0, 0.1, 0]);
    for (let k = 0; k < 8; k++) scaled(bed, getShared().ico0, flatColor(pick(rng, FLOWERS)), [-0.65 + k * 0.18, 0.3, spread(rng, 0.2)], [0.11, 0.1, 0.11]);
    taken.push({ x: side * 3.4, z: 1.9, r: 1 });
  }
  addTrees(props, rng, shape, taken, 3, 0.3);
  addTufts(props, rng, shape, 45, 0.35);
}

// 露營地：A 字帳篷（含營釘與營繩）、營火（石圈、木柴、火焰）、兩根圓木椅、樹墩上的提燈、冰桶、幾棵松樹。
function decorateCamp(props: THREE.Group, rng: Rng, shape: IslandShape, taken: Footprint[]): void {
  const S = getShared();
  const fire = childGroup(props, [0, 0, 0.5]);
  skipCollider(fire);
  for (let k = 0; k < 9; k++) {
    const angle = (k / 9) * TAU;
    scaled(fire, S.rock, flatColor(pick(rng, ROCK)), [Math.sin(angle) * 0.75, 0.12, Math.cos(angle) * 0.75], [0.22, 0.16, 0.2], [rng(), rng(), 0]);
  }
  for (let k = 0; k < 4; k++) {
    const angle = (k / 4) * TAU + 0.4;
    rod(fire, flatColor(0x6b4a33), [Math.sin(angle) * 0.5, 0.05, Math.cos(angle) * 0.5], [0, 0.6, 0], 0.07, 0.05, 6);
  }
  addMesh(fire, new THREE.ConeGeometry(0.35, 0.9, 7), S.flameOuter, [0, 0.5, 0]);
  addMesh(fire, new THREE.ConeGeometry(0.2, 0.6, 7), S.flameInner, [0.05, 0.4, 0.05]);
  taken.push({ x: 0, z: 0.5, r: 1.1 });
  for (const angle of [0.6, 2.4]) {
    const log = childGroup(props, [Math.sin(angle) * 2.1, 0, 0.5 + Math.cos(angle) * 2.1], angle);
    addMesh(log, new THREE.CylinderGeometry(0.25, 0.25, 1.8, 10).rotateZ(Math.PI / 2), flatColor(0x7a5a3c), [0, 0.25, 0]);
    for (const x of [-0.9, 0.9]) addMesh(log, new THREE.CircleGeometry(0.24, 10).rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2), colorMaterial(0xc9a77c), [x + Math.sign(x) * 0.005, 0.25, 0]);
    taken.push({ x: Math.sin(angle) * 2.1, z: 0.5 + Math.cos(angle) * 2.1, r: 1 });
  }
  // 帳篷：屋脊沿 x，前面（+z）開口垂著兩片門簾
  const tent = childGroup(props, [-0.5, 0, -3.2], 0.2);
  const orange = colorMaterial(0xf26b1d);
  const halfWidth = 1.4;
  const ridge = 1.8;
  const slant = Math.hypot(halfWidth, ridge);
  const lean = Math.atan2(halfWidth, ridge);
  for (const side of [-1, 1]) box(tent, orange, [0.05, slant, 2.8], [side * halfWidth / 2, ridge / 2, 0], [0, 0, side * lean]);
  box(tent, colorMaterial(0x3f6b55), [halfWidth * 2.2, 0.03, 3], [0, 0.015, 0]);
  addMesh(tent, new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-halfWidth, 0), new THREE.Vector2(halfWidth, 0), new THREE.Vector2(0, ridge)])), colorMaterial(0xd85a12), [0, 0, -1.4], [0, Math.PI, 0]);
  for (const side of [-1, 1]) {
    addMesh(tent, new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(side * 0.7, 0), new THREE.Vector2(0, ridge)])), colorMaterial(0xd85a12), [side * 0.05, 0, 1.38], [0, side > 0 ? 0.5 : -0.5, 0]);
  }
  for (const z of [-1.45, 1.45]) rod(tent, S.metal, [0, 0, z], [0, ridge + 0.15, z], 0.03, 0.03, 6);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    rod(tent, colorMaterial(0xf4f1ea), [0, ridge + 0.1, z * 1.45], [x * 2.1, 0.05, z * 2.1], 0.01, 0.01, 4);
    rod(tent, S.metal, [x * 2.1, 0, z * 2.1], [x * 2.1, 0.2, z * 2.1], 0.02, 0.02, 4);
  }
  taken.push({ x: -0.5, z: -3.2, r: 2.5 });
  const stump = childGroup(props, [2.4, 0, -1.6]);
  addMesh(stump, new THREE.CylinderGeometry(0.35, 0.42, 0.55, 10), flatColor(0x7a5a3c), [0, 0.275, 0]);
  addMesh(stump, new THREE.CircleGeometry(0.34, 10).rotateX(-Math.PI / 2), colorMaterial(0xc9a77c), [0, 0.553, 0]);
  box(stump, S.iron, [0.2, 0.04, 0.2], [0, 0.58, 0]);
  box(stump, S.warmLight, [0.15, 0.22, 0.15], [0, 0.72, 0]);
  addMesh(stump, new THREE.ConeGeometry(0.14, 0.12, 4), S.iron, [0, 0.89, 0], [0, Math.PI / 4, 0]);
  taken.push({ x: 2.4, z: -1.6, r: 0.6 });
  const cooler = childGroup(props, [-2.6, 0, 1.6], 0.5);
  box(cooler, colorMaterial(0x2f6fb0), [0.75, 0.42, 0.45], [0, 0.21, 0]);
  box(cooler, colorMaterial(0xf4f4f4), [0.78, 0.08, 0.48], [0, 0.46, 0]);
  taken.push({ x: -2.6, z: 1.6, r: 0.6 });
  addTrees(props, rng, shape, taken, 6, 0.85);
  addTufts(props, rng, shape, 40, 0.2);
}

// 池塘島：石頭圍的池塘（荷葉、一朵荷花、蘆葦）、伸進水裡的小木棧橋、朝池塘的長椅、
// 一條小溪流到島邊，從邊緣落下一道瀑布。
function decoratePond(props: THREE.Group, rng: Rng, shape: IslandShape, taken: Footprint[]): void {
  const S = getShared();
  const pondRadius = Math.min(5, shape.minRim * 0.42);
  addMesh(props, new THREE.CircleGeometry(pondRadius, 40).rotateX(-Math.PI / 2), S.pond, [0, 0.04, 0]);
  for (let k = 0; k < 26; k++) {
    const angle = (k / 26) * TAU + spread(rng, 0.05);
    if (Math.abs(angle - Math.PI / 2) < 0.18) continue;   // 溪流的出口
    const size = range(rng, [0.3, 0.55]);
    scaled(props, S.rock, flatColor(pick(rng, ROCK)), [Math.sin(angle) * (pondRadius + 0.1), 0.08, Math.cos(angle) * (pondRadius + 0.1)], [size, size * 0.55, size], [rng(), rng(), 0]);
  }
  for (let k = 0; k < 7; k++) {
    const angle = rng() * TAU;
    const distance = Math.sqrt(rng()) * pondRadius * 0.75;
    addMesh(props, new THREE.CylinderGeometry(0.4, 0.4, 0.02, 12, 1, false, 0.3, TAU - 0.5), colorMaterial(0x4f9a4c), [Math.sin(angle) * distance, 0.06, Math.cos(angle) * distance], [0, rng() * TAU, 0]);
    if (k === 0) scaled(props, S.ico1, flatColor(0xff9ec4), [Math.sin(angle) * distance, 0.15, Math.cos(angle) * distance], [0.16, 0.12, 0.16]);
  }
  for (let k = 0; k < 14; k++) {
    const angle = -2.3 + spread(rng, 0.45);
    const r = pondRadius * range(rng, [0.82, 1.05]);
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    const height = range(rng, [0.9, 1.6]);
    rod(props, flatColor(0x6f9c4a), [x, 0, z], [x + spread(rng, 0.08), height, z + spread(rng, 0.08)], 0.02, 0.012, 4);
    if (k % 2 === 0) scaled(props, S.sphere, flatColor(0x6b4a33), [x, height * 0.85, z], [0.05, 0.16, 0.05]);
  }
  taken.push({ x: 0, z: 0, r: pondRadius + 0.5 });
  // 棧橋：從池邊（-z）伸進水裡
  const dock = childGroup(props, [0, 0, -pondRadius + 0.6], 0);
  skipCollider(dock);
  markCollider(dock, [1.3, 0.3, 3], [0, 0.15, 0.2]);
  for (let k = 0; k < 10; k++) box(dock, colorMaterial(k % 2 === 0 ? 0xb08a63 : 0xa47f59), [1.3, 0.08, 0.28], [0, 0.26, -1.1 + k * 0.3]);
  for (const [x, z] of [[-0.6, -1.2], [0.6, -1.2], [-0.6, 1.6], [0.6, 1.6]] as const) cylinder(dock, colorMaterial(0x7a5a3c), 0.07, 0.6, [x, 0.1, z], 8);
  taken.push({ x: 0, z: -pondRadius + 0.6, r: 1.5 });
  const bench = childGroup(props, [-(pondRadius + 1.8) * 0.7, 0, (pondRadius + 1.8) * 0.7], Math.PI * 0.75);
  addParkBench(bench);
  taken.push({ x: -(pondRadius + 1.8) * 0.7, z: (pondRadius + 1.8) * 0.7, r: 1.2 });
  // 小溪與瀑布：往 +x 流到島邊
  const edgeX = shape.rim(Math.PI / 2);
  const streamLength = edgeX - pondRadius + 0.4;
  box(props, S.pond, [streamLength, 0.04, 1.1], [pondRadius - 0.2 + streamLength / 2, 0.03, 0]);
  for (let k = 0; k < 10; k++) {
    const x = pondRadius + (k / 10) * (streamLength - 0.6);
    for (const side of [-1, 1]) scaled(props, S.rock, flatColor(pick(rng, ROCK)), [x, 0.06, side * 0.7], [0.25, 0.15, 0.25], [rng(), rng(), 0]);
  }
  taken.push({ x: (pondRadius + edgeX) / 2, z: 0, r: 1 });
  const fallHeight = shape.depth * 0.9;
  addMesh(props, new THREE.PlaneGeometry(1.2, fallHeight), S.waterfall, [edgeX + 0.35, -fallHeight / 2 + 0.05, 0], [0, Math.PI / 2, 0]);
  addMesh(props, new THREE.PlaneGeometry(1.0, fallHeight * 0.85), S.waterfall, [edgeX + 0.6, -fallHeight * 0.85 / 2, 0.05], [0, Math.PI / 2, 0]);
  addTrees(props, rng, shape, taken, 3, 0.2);
  addTufts(props, rng, shape, 45, 0.4);
}

// 瞭望台：四根柱子、斜撐、離地 4.5 m 的平台（三面欄杆、正面爬梯）、四角錐屋頂與小旗、平台上的望遠鏡；
// 底下有指路牌和長椅。
function decorateLookout(props: THREE.Group, rng: Rng, shape: IslandShape, taken: Footprint[]): void {
  const S = getShared();
  const wood = colorMaterial(0x9c7a52);
  const dark = colorMaterial(0x6e5440);
  const deckY = 4.5;
  const half = 1.5;
  const tower = childGroup(props, [0, 0, 0], rng() * TAU);
  skipCollider(tower);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    box(tower, dark, [0.22, deckY + 2.2, 0.22], [x * half, (deckY + 2.2) / 2, z * half]);
    markCollider(tower, [0.25, deckY, 0.25], [x * half, deckY / 2, z * half]);
  }
  for (const side of [-1, 1]) {
    rod(tower, dark, [-half, 0.3, side * half], [half, deckY - 0.3, side * half], 0.06, 0.06, 5);
    rod(tower, dark, [side * half, 0.3, -half], [side * half, deckY - 0.3, half], 0.06, 0.06, 5);
  }
  for (let k = 0; k < 8; k++) box(tower, wood, [half * 2 + 0.4, 0.12, 0.42], [0, deckY, -half - 0.1 + k * 0.43]);
  markCollider(tower, [half * 2 + 0.4, 0.2, half * 2 + 0.4], [0, deckY - 0.04, 0]);
  for (const [dx, dz] of [[0, -1], [-1, 0], [1, 0]] as const) {
    const length = half * 2;
    const sizeRail: Vec3 = dx === 0 ? [length, 0.07, 0.07] : [0.07, 0.07, length];
    for (const y of [0.5, 1]) box(tower, wood, sizeRail, [dx * half, deckY + y, dz * half]);
    markCollider(tower, dx === 0 ? [length, 1, 0.15] : [0.15, 1, length], [dx * half, deckY + 0.55, dz * half]);
  }
  for (const x of [-0.35, 0.35]) box(tower, dark, [0.08, deckY + 1, 0.08], [x, (deckY + 1) / 2, half + 0.25]);
  for (let k = 1; k <= Math.floor(deckY / 0.35); k++) box(tower, wood, [0.7, 0.06, 0.06], [0, k * 0.35, half + 0.25]);
  addMesh(tower, new THREE.ConeGeometry(half * 1.65, 1.6, 4), colorMaterial(0x8a4b3a), [0, deckY + 2.2 + 0.8, 0], [0, Math.PI / 4, 0]);
  rod(tower, S.iron, [0, deckY + 3.6, 0], [0, deckY + 4.6, 0], 0.03, 0.03, 5);
  addMesh(tower, new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshLambertMaterial({ color: 0xf2545b, side: THREE.DoubleSide }), [0.3, deckY + 4.4, 0]);
  // 望遠鏡：三腳架、鏡筒朝外斜上
  const scope = childGroup(tower, [0.6, deckY + 0.06, -0.6], -0.8);
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * TAU;
    rod(scope, S.iron, [Math.sin(angle) * 0.35, 0, Math.cos(angle) * 0.35], [0, 1.1, 0], 0.025, 0.02, 5);
  }
  addMesh(scope, new THREE.CylinderGeometry(0.09, 0.12, 0.9, 12), colorMaterial(0x2f4b7c), [0, 1.25, 0.15], [1.2, 0, 0]);
  taken.push({ x: 0, z: 0, r: half + 1.4 });
  // 指路牌
  const sign = childGroup(props, [half + 2.2, 0, half + 1.2], rng() * TAU);
  skipCollider(sign);
  markCollider(sign, [0.2, 2.4, 0.2], [0, 1.2, 0]);
  rod(sign, dark, [0, 0, 0], [0, 2.4, 0], 0.06, 0.06, 6);
  for (const [y, yaw] of [[2.1, 0.3], [1.75, 2.2], [1.4, -1.6]] as const) {
    const arrow = new THREE.Shape([new THREE.Vector2(0, -0.13), new THREE.Vector2(0.8, -0.13), new THREE.Vector2(0.98, 0), new THREE.Vector2(0.8, 0.13), new THREE.Vector2(0, 0.13)]);
    addMesh(sign, new THREE.ExtrudeGeometry(arrow, { depth: 0.04, bevelEnabled: false }), colorMaterial(pick(rng, [0xc9a77c, 0xb08a63, 0xd9b98f])), [0, y, -0.02], [0, yaw, 0]);
  }
  taken.push({ x: half + 2.2, z: half + 1.2, r: 0.6 });
  const bench = childGroup(props, [-(half + 2.4), 0, half + 0.6], -0.6);
  addParkBench(bench);
  taken.push({ x: -(half + 2.4), z: half + 0.6, r: 1.2 });
  addTrees(props, rng, shape, taken, 4, 0.5);
  addTufts(props, rng, shape, 35, 0.3);
}

const DECORATE: Record<IslandTheme, (props: THREE.Group, rng: Rng, shape: IslandShape, taken: Footprint[]) => void> = {
  nature: decorateNature,
  helipad: decorateHelipad,
  lampBench: decorateLampBench,
  cottage: decorateCottage,
  camp: decorateCamp,
  pond: decoratePond,
  lookout: decorateLookout,
};

// 頂面碰撞：每條從中心往外到邊緣，長度取這一條涵蓋的角度裡最窄的邊緣半徑，寬度剛好讓相鄰的長條在邊緣接上。
function topSolids(shape: IslandShape): SolidBox[] {
  const half = Math.PI / TOP_STRIPS;
  return Array.from({ length: TOP_STRIPS }, (_, k) => {
    const angle = (k / TOP_STRIPS) * TAU;
    const reach = Math.min(shape.rim(angle - half), shape.rim(angle), shape.rim(angle + half)) * TOP_STRIP_INSET;
    const width = 2 * reach * Math.tan(half);
    // 自身 z 沿徑向：yaw = angle 時 z 軸指向 (sin angle, cos angle)
    return { ...orientedSolid(Math.sin(angle) * reach / 2, Math.cos(angle) * reach / 2, angle, width, reach, -LIP - shape.depth * 0.45, 0), standable: true };
  });
}

/** 島的頂面最高點離 group 原點多高（給擺放位置用：group 原點就是草地邊緣的高度）。 */
export function islandDepth(radius: number): number {
  return radius * DEPTH_PER_RADIUS[1] + DEPTH_EXTRA + LIP;
}

/** 建一座島（在原點）：本體、上面的東西、碰撞方塊（島自身座標）。 */
export function buildIsland(rng: Rng, theme: IslandTheme, radius: number): IslandBuild {
  const shape = islandShape(rng, radius);
  const group = new THREE.Group();
  const body = islandBody(rng, shape);
  group.add(body.mesh);
  const props = new THREE.Group();
  addUnderside(props, rng, body.anchors, body.lip, radius);
  DECORATE[theme](props, rng, shape, []);
  markChildGroups(props);
  const solids: SolidBox[] = collectColliders(props).map((solid) => ({ ...solid, standable: true }));
  group.add(bakeByMaterial(props));
  solids.push(...topSolids(shape));
  return { group, solids };
}
