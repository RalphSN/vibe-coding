// OZ 世界的環形 PU 跑道（在運動場與泳池之間）。由內往外：
//   步道（石板地、規律間隔的樹與路燈、每隔一段一座休息區：木格柵涼亭、長椅、小桌、販賣機、飲水台、分類垃圾桶）
//   → 鋁製路緣 → 8 條跑道（每條 1.22 m，PU 顆粒面、白色分道線、終點線、依弧長錯開的起跑線與道次號碼、起跑器、
//     每 100 m 的標記、最外道一排欄架）→ 外側人工草皮（計時鐘、終點攝影塔、距離牌、欄架堆、照明燈、外緣欄杆）。
// 跑的方向是角度增加的方向；起點／終點在角度 START_ANGLE。
import * as THREE from 'three';
import { annulus, bakeByMaterial, createRng, emptyBuild, shinyMaterial, type PropsBuild, type RingSpec } from './oz-props';
import {
  TAU, addMesh, box, childGroup, collectColliders, cylinder, disposeGeometries, flat, lambert, mapped, markChildGroups, markCollider,
  meterTexture, pixelTexture, planarUv, range, rod, skipCollider, sphere, type Rng, type Vec3,
} from './oz-kit';

const START_ANGLE = Math.PI / 2;
const SURFACE_LIFT = 0.01;           // 地面鋪面浮在環面上這麼高
const LINE_LIFT = 0.014;             // 跑道線再高一點點，才不會和鋪面閃爍
// 剖面（由內往外，m）
const PROMENADE = 13;                // 內側步道寬
const KERB = { width: 0.05, height: 0.05 };
const LANE = { width: 1.22, count: 8, line: 0.05, firstOffset: 0.3, otherOffset: 0.2 };   // 量跑距的線：第 1 道離內緣 0.3 m，其他道 0.2 m
const RUNOFF = 1;                    // 最外道外面的緩衝
const HURDLE = { height: 0.914, width: 1.18, spacing: 9.14, count: 10, firstFrom: 13.72 };   // 110 m 欄：第一欄在起跑線後 13.72 m、欄距 9.14 m
// 步道設施的間隔（沿內側步道的弧長，m）
const TREE = { spacing: 9, radius: 3 };            // 樹距、樹在步道裡離內緣多遠
const LAMP = { spacing: 18, radius: 6.5, height: 4.2 };
const REST = { spacing: 72, radius: 8.6, width: 6, depth: 4, height: 2.7 };
const VENDING = { width: 0.95, height: 1.83, depth: 0.75 };
// 外側草皮的設施
const LIGHT = { spacing: 36, height: 9, fromOuter: 1.6 };
const RAIL = { fromOuter: 0.3, posts: 2.5, heights: [0.5, 1.05] };

const TREE_KINDS = ['round', 'cone'] as const;

// ---------- 貼圖 ----------
// PU 跑道：一張 1 m，磚紅底加深淺不一的橡膠顆粒
function drawPu(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#b4472f';
  ctx.fillRect(0, 0, 256, 256);
  const rng = createRng(41);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = ['#9c3a26', '#c55a40', '#8a3322', '#d06a50', '#a8432c'][Math.floor(rng() * 5)] ?? '#b4472f';
    const s = 1 + rng() * 2;
    ctx.fillRect(rng() * 256, rng() * 256, s, s);
  }
}
// 步道石板：一張 1 m，50 cm 一塊，灰色深淺不同
function drawPavers(ctx: CanvasRenderingContext2D): void {
  const rng = createRng(42);
  ctx.fillStyle = '#9da3a8';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = ['#d5d8db', '#cdd1d4', '#dadcde', '#c7cbce'][Math.floor(rng() * 4)] ?? '#d5d8db';
      ctx.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
    }
  }
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(rng() * 256, rng() * 256, 1.5, 1.5);
  }
}
// 人工草皮：一張 1 m，綠色加細碎的草葉點
function drawTurf(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#4f9a58';
  ctx.fillRect(0, 0, 256, 256);
  const rng = createRng(43);
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = ['#468f50', '#5aa664', '#3f8549', '#62ad6b'][Math.floor(rng() * 4)] ?? '#4f9a58';
    ctx.fillRect(rng() * 256, rng() * 256, 1, 3);
  }
}
// 道次號碼：白色大字畫在透明底上，平放在跑道上
const drawLaneNumber = (n: number) => (ctx: CanvasRenderingContext2D): void => {
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 0.8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 0, 0.04);
};
// 計時鐘：黑底琥珀色七段數字
function drawClock(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#111317';
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = '#ffb000';
  ctx.font = 'bold 92px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('00:47.38', 256, 92);
  ctx.fillStyle = '#7f8a96';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('OZ RUN · LAP 2', 256, 24);
}
// 距離牌：白底藍字
const drawSign = (text: string) => (ctx: CanvasRenderingContext2D): void => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#1f5fbf';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 120);
  ctx.fillStyle = '#1f5fbf';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 66);
};
// 販賣機正面的展示窗：四排飲料（瓶子與罐子），每格下面一個價格標與按鈕
const drawVendingDisplay = (seed: number) => (ctx: CanvasRenderingContext2D): void => {
  const rng = createRng(seed);
  ctx.fillStyle = '#eef6fb';
  ctx.fillRect(0, 0, 256, 320);
  const colors = ['#e63946', '#2a9d8f', '#f4a261', '#1f5fbf', '#8e44ad', '#f2c200', '#6cc56b', '#ffffff', '#222222'];
  for (let row = 0; row < 4; row++) {
    const y = 10 + row * 78;
    ctx.fillStyle = '#c9d3dc';
    ctx.fillRect(4, y + 62, 248, 4);
    for (let col = 0; col < 6; col++) {
      const x = 10 + col * 41;
      ctx.fillStyle = colors[Math.floor(rng() * colors.length)] ?? '#e63946';
      if (rng() < 0.5) {
        ctx.fillRect(x + 8, y + 6, 18, 48);          // 寶特瓶
        ctx.fillRect(x + 12, y, 10, 8);
      } else {
        ctx.fillRect(x + 5, y + 22, 24, 32);         // 鋁罐
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 4, y + 66, 26, 8);
      ctx.fillStyle = '#d62828';
      ctx.fillRect(x + 12, y + 67, 10, 6);
    }
  }
};

// ---------- 材質 ----------
function createTrackMaterials() {
  return {
    pu: mapped(pixelTexture(256, 256, drawPu)),
    pavers: mapped(pixelTexture(256, 256, drawPavers)),
    turf: mapped(pixelTexture(256, 256, drawTurf)),
    base: lambert(0x9aa1a8),
    white: lambert(0xffffff),
    yellow: lambert(0xf2c200),
    black: lambert(0x1b1b1b),
    kerb: shinyMaterial(0xd9dde2, 0.85, 0.3),
    metal: shinyMaterial(0xd5dae0, 0.85, 0.3),
    darkMetal: shinyMaterial(0x2e3338, 0.6, 0.45),
    grate: lambert(0x3a3f45),
    trunk: lambert(0x7a5a3c),
    leaves: lambert(0x5fa85d, { flatShading: true }),
    conifer: lambert(0x3f7a4a, { flatShading: true }),
    wood: lambert(0x9c7a52),
    darkWood: lambert(0x6e5440),
    concrete: lambert(0xb7bcc2),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c9 }),
    blockRed: lambert(0xc0392b),
    vending: [0xc0392b, 0x1f5fbf, 0xf4f4f4].map((color) => lambert(color)),
    vendingDisplays: [11, 12, 13].map((seed) => new THREE.MeshBasicMaterial({ map: pixelTexture(256, 320, drawVendingDisplay(seed)) })),
    bins: [0x1f5fbf, 0x3f8a5f, 0x6b7280].map((color) => lambert(color)),
    laneNumbers: Array.from({ length: LANE.count }, (_, i) => mapped(meterTexture(1, 1, 128, drawLaneNumber(i + 1)), { transparent: true, alphaTest: 0.3 })),
    clock: new THREE.MeshBasicMaterial({ map: pixelTexture(512, 160, drawClock) }),
    signs: new Map<string, THREE.MeshLambertMaterial>(),
  };
}
type TrackMaterials = ReturnType<typeof createTrackMaterials>;
let trackMaterials: TrackMaterials | null = null;
function getTrackMaterials(): TrackMaterials {
  trackMaterials ??= createTrackMaterials();
  return trackMaterials;
}
function signMaterial(M: TrackMaterials, text: string): THREE.MeshLambertMaterial {
  const cached = M.signs.get(text);
  if (cached) return cached;
  const material = mapped(pixelTexture(256, 128, drawSign(text)));
  M.signs.set(text, material);
  return material;
}

// 在環上半徑 radius、角度 angle 放一組東西：自身 x 沿跑的方向（切線）、z 朝外（徑向）。flip 時轉半圈（z 朝圓心）。
const onRing = (parent: THREE.Object3D, radius: number, y: number, angle: number, flip = false): THREE.Group =>
  childGroup(parent, [radius * Math.sin(angle), y, radius * Math.cos(angle)], angle + (flip ? Math.PI : 0));
// 一圈上每隔 spacing 公尺的角度
const anglesEvery = (radius: number, spacing: number, offset = 0): number[] => {
  const count = Math.max(1, Math.round((TAU * radius) / spacing));
  return Array.from({ length: count }, (_, i) => offset + (i / count) * TAU);
};

// ---------- 跑道 ----------
interface TrackLayout { y: number; laneInner: number; laneOuter: number; surfaceOuter: number; measure: (lane: number) => number }

// 白色分道線、終點線、錯開的起跑線與道次號碼、每 100 m 的黃色標記。
function addLaneMarkings(build: PropsBuild, props: THREE.Group, M: TrackMaterials, L: TrackLayout): void {
  const lineY = L.y + LINE_LIFT;
  for (let k = 0; k <= LANE.count; k++) {
    const r = L.laneInner + k * LANE.width;
    build.decor.add(annulus(r - LANE.line / 2, r + LANE.line / 2, lineY - 0.004, lineY, M.white));
  }
  // 終點線：橫跨八道
  const finish = onRing(props, (L.laneInner + L.laneOuter) / 2, lineY, START_ANGLE);
  box(finish, M.white, [0.05, 0.004, L.laneOuter - L.laneInner], [0, -0.002, 0]);
  // 跑一圈時每一道從不同角度起跑，跑的距離才都等於第 1 道一圈：外道往前錯開 2π(1 - r1 / ri)
  const first = L.measure(0);
  for (let lane = 0; lane < LANE.count; lane++) {
    const r = L.measure(lane);
    const start = START_ANGLE + TAU * (1 - first / r);
    const center = L.laneInner + (lane + 0.5) * LANE.width;
    const startLine = onRing(props, center, lineY, start);
    box(startLine, M.white, [0.05, 0.004, LANE.width - LANE.line], [0, -0.002, 0]);
    // 道次號碼在起跑線後方 1.5 m，字頭朝跑的方向
    addMesh(props, flat(0.9, 0.9), M.laneNumbers[lane] ?? M.white, [center * Math.sin(start - 1.5 / center), lineY + 0.001, center * Math.cos(start - 1.5 / center)], [0, start - Math.PI / 2, 0]);
    addStartingBlock(onRing(props, center, L.y + SURFACE_LIFT, start - 0.6 / center), M);
  }
  // 第 1 道每 100 m 一個黃色標記（畫在內側分道線上）
  const ticks = Math.floor((TAU * first) / 100);
  for (let k = 1; k <= ticks; k++) {
    const tick = onRing(props, L.laneInner + 0.15, lineY, START_ANGLE + (k * 100) / first);
    box(tick, M.yellow, [0.3, 0.004, 0.3], [0, -0.002, 0]);
  }
}

// 起跑器：沿跑的方向一根鋁軌，上面兩片可調角度的腳踏板（前低後高）。
function addStartingBlock(g: THREE.Group, M: TrackMaterials): void {
  box(g, M.metal, [0.75, 0.04, 0.1], [0, 0.02, 0]);
  for (const [x, z, tilt] of [[0.12, -0.12, 0.7], [-0.15, 0.12, 0.9]] as const) {
    box(g, M.blockRed, [0.08, 0.2, 0.15], [x, 0.1, z], [0, 0, tilt]);
    rod(g, M.metal, [x, 0.03, z], [x - 0.08, 0.03, z], 0.01, 0.01, 6);
  }
}

// 欄架：兩隻 L 形底腳、兩根立柱、上面黑白相間的橫板，面向跑來的方向。
function addHurdle(g: THREE.Group, M: TrackMaterials): void {
  const half = HURDLE.width / 2;
  for (const z of [-half, half]) {
    box(g, M.metal, [0.7, 0.03, 0.04], [0.35, 0.015, z]);
    box(g, M.metal, [0.04, HURDLE.height - 0.07, 0.04], [0, (HURDLE.height - 0.07) / 2, z]);
  }
  box(g, M.white, [0.02, 0.07, HURDLE.width], [0, HURDLE.height - 0.035, 0]);
  for (const z of [-0.35, 0, 0.35]) box(g, M.black, [0.022, 0.071, 0.12], [0, HURDLE.height - 0.035, z]);
}

// 最外道擺一排欄架（從終點線往後數），外側草皮上再堆一疊備用的。
function addHurdles(props: THREE.Group, M: TrackMaterials, L: TrackLayout): void {
  const lane = LANE.count - 1;
  const center = L.laneInner + (lane + 0.5) * LANE.width;
  for (let k = 0; k < HURDLE.count; k++) {
    const distance = HURDLE.firstFrom + k * HURDLE.spacing;
    addHurdle(onRing(props, center, L.y + SURFACE_LIFT, START_ANGLE + distance / center), M);
  }
  const stack = onRing(props, L.surfaceOuter + 2.5, L.y + SURFACE_LIFT, START_ANGLE + 30 / L.surfaceOuter);
  for (let k = 0; k < 6; k++) addHurdle(childGroup(stack, [k * 0.12, 0, 0]), M);
}

// ---------- 步道 ----------
// 行道樹：鐵製樹穴格柵、樹幹，樹冠圓的與尖的輪流。
function addTree(g: THREE.Group, M: TrackMaterials, kind: (typeof TREE_KINDS)[number], rng: Rng): void {
  skipCollider(g);
  markCollider(g, [0.6, 2.5, 0.6], [0, 1.25, 0]);
  box(g, M.grate, [1.2, 0.02, 1.2], [0, 0.01, 0]);
  rod(g, M.trunk, [0, 0, 0], [0, 2.4, 0], 0.13, 0.09, 8);
  if (kind === 'round') {
    const crown = range(rng, [1.5, 1.8]);
    addMesh(g, new THREE.IcosahedronGeometry(crown, 1), M.leaves, [0, 2.4 + crown * 0.75, 0]).scale.set(1, 0.9, 1);
    return;
  }
  for (const [y, r, h] of [[2.2, 1.5, 2.2], [3.3, 1.15, 1.9], [4.3, 0.75, 1.6]] as const) addMesh(g, new THREE.ConeGeometry(r, h, 8), M.conifer, [0, y + h / 2, 0]);
}

// 路燈：細桿加燈罩，燈罩朝步道兩側都亮。
function addLamp(g: THREE.Group, M: TrackMaterials): void {
  skipCollider(g);
  markCollider(g, [0.3, LAMP.height, 0.3], [0, LAMP.height / 2, 0]);
  cylinder(g, M.concrete, 0.18, 0.25, [0, 0.125, 0], 12);
  rod(g, M.darkMetal, [0, 0.25, 0], [0, LAMP.height, 0], 0.06, 0.045, 10);
  cylinder(g, M.darkMetal, 0.28, 0.12, [0, LAMP.height + 0.06, 0], 16);
  cylinder(g, M.lamp, 0.24, 0.03, [0, LAMP.height - 0.01, 0], 16);
}

function addBench(g: THREE.Object3D, M: TrackMaterials, position: Vec3, length: number, yaw: number): void {
  const bench = childGroup(g, position, yaw);
  for (const z of [-0.12, 0.02, 0.16]) box(bench, M.wood, [length, 0.04, 0.12], [0, 0.45, z]);
  for (const y of [0.6, 0.75]) box(bench, M.wood, [length, 0.1, 0.03], [0, y, -0.22]);
  for (const x of [-length / 2 + 0.15, length / 2 - 0.15]) box(bench, M.darkMetal, [0.05, 0.45, 0.42], [x, 0.225, 0]);
}

// 販賣機：機身、發光的展示窗、選擇按鈕列、投幣口與取物口，正面朝 +z。
function addVendingMachine(g: THREE.Object3D, M: TrackMaterials, position: Vec3, variant: number): void {
  const vm = childGroup(g, position);
  const { width, height, depth } = VENDING;
  box(vm, M.vending[variant % M.vending.length] ?? M.white, [width, height, depth], [0, height / 2, 0]);
  box(vm, M.vendingDisplays[variant % M.vendingDisplays.length] ?? M.lamp, [width - 0.12, 1.05, 0.02], [-0.04, 1.12, depth / 2 + 0.005]);
  box(vm, M.darkMetal, [0.12, 0.5, 0.02], [width / 2 - 0.1, 1.1, depth / 2 + 0.006]);
  for (let k = 0; k < 6; k++) box(vm, M.white, [0.05, 0.03, 0.01], [width / 2 - 0.1, 0.92 + k * 0.07, depth / 2 + 0.017]);
  box(vm, M.black, [0.6, 0.2, 0.06], [-0.04, 0.32, depth / 2 - 0.02]);
  box(vm, M.metal, [width - 0.04, 0.06, depth - 0.04], [0, height + 0.03, 0]);
  box(vm, M.black, [width, 0.06, depth], [0, 0.03, 0]);
}

// 休息區：木格柵涼亭（四柱、兩根主樑、一排格柵），底下兩張面向跑道的長椅和小圓桌；
// 涼亭一側兩台販賣機，另一側飲水台與三色分類垃圾桶。正面（+z）朝跑道。
function addRestArea(g: THREE.Group, M: TrackMaterials, rng: Rng): void {
  skipCollider(g);
  const { width, depth, height } = REST;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      box(g, M.darkWood, [0.15, height, 0.15], [sx * (width / 2 - 0.2), height / 2, sz * (depth / 2 - 0.2)]);
      markCollider(g, [0.25, height, 0.25], [sx * (width / 2 - 0.2), height / 2, sz * (depth / 2 - 0.2)]);
    }
  }
  for (const sz of [1, -1]) box(g, M.darkWood, [width, 0.18, 0.12], [0, height + 0.09, sz * (depth / 2 - 0.2)]);
  for (let x = -width / 2 + 0.2; x <= width / 2 - 0.2 + 1e-6; x += 0.4) box(g, M.wood, [0.06, 0.12, depth + 0.3], [x, height + 0.24, 0]);
  for (const x of [-1.4, 1.4]) addBench(g, M, [x, 0, 0.9], 1.8, 0);
  const table = childGroup(g, [0, 0, -0.6]);
  cylinder(table, M.wood, 0.45, 0.05, [0, 0.74, 0], 20);
  rod(table, M.darkMetal, [0, 0, 0], [0, 0.72, 0], 0.04);
  cylinder(table, M.darkMetal, 0.25, 0.03, [0, 0.015, 0], 16);
  for (let k = 0; k < 2; k++) addVendingMachine(g, M, [-(width / 2 + 0.7 + k * 1.05), 0, 0.3], Math.floor(rng() * 3) + k);
  const fountain = childGroup(g, [width / 2 + 0.7, 0, 0.6]);
  cylinder(fountain, M.concrete, 0.18, 0.9, [0, 0.45, 0], 12);
  cylinder(fountain, M.metal, 0.26, 0.08, [0, 0.94, 0], 16);
  M.bins.forEach((material, k) => {
    const bin = childGroup(g, [width / 2 + 0.5 + k * 0.5, 0, -0.9]);
    cylinder(bin, material, 0.2, 0.85, [0, 0.425, 0], 14);
    cylinder(bin, M.darkMetal, 0.21, 0.04, [0, 0.87, 0], 14);
  });
  // 涼亭整組不加外框（底下要走得進去），裡面的長椅、桌子、販賣機、飲水台、垃圾桶各自加
  markChildGroups(g);
}

// ---------- 外側草皮 ----------
// 外側草皮上的東西都用 flip 擺放：自身 +z 朝圓心，也就是朝跑道。
// 計時鐘：兩支腳撐著的黑色看板，面向跑道。
function addClock(g: THREE.Group, M: TrackMaterials): void {
  for (const x of [-1.3, 1.3]) box(g, M.darkMetal, [0.1, 2.2, 0.1], [x, 1.1, 0.05]);
  box(g, M.darkMetal, [3.1, 1.05, 0.2], [0, 2.6, 0.05]);
  addMesh(g, new THREE.PlaneGeometry(2.9, 0.9), M.clock, [0, 2.6, 0.16]);
}

// 終點攝影塔：鐵架、攝影平台與小屋頂，鏡頭對準終點線。
function addFinishTower(g: THREE.Group, M: TrackMaterials): void {
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) rod(g, M.metal, [sx * 0.6, 0, sz * 0.6], [sx * 0.4, 3, sz * 0.4], 0.04);
  }
  box(g, M.darkMetal, [1.1, 0.08, 1.1], [0, 3, 0]);
  box(g, M.black, [0.3, 0.25, 0.45], [0, 3.25, 0.2]);
  cylinder(g, M.black, 0.08, 0.2, [0, 3.25, 0.5], 12, [Math.PI / 2, 0, 0]);
  box(g, M.white, [1.3, 0.05, 1.3], [0, 4.1, 0]);
  for (const sx of [1, -1]) box(g, M.metal, [0.04, 1.05, 0.04], [sx * 0.5, 3.55, -0.5]);
}

// 距離牌：一根柱子上一塊白底藍字的牌子，面向跑道。
function addSign(g: THREE.Group, M: TrackMaterials, text: string): void {
  rod(g, M.darkMetal, [0, 0, 0], [0, 1.8, 0], 0.04);
  box(g, M.white, [0.84, 0.44, 0.05], [0, 1.8, 0]);
  addMesh(g, new THREE.PlaneGeometry(0.8, 0.4), signMaterial(M, text), [0, 1.8, 0.03]);
}

// 照明燈：高桿頂端一排 LED 燈頭，朝跑道往下照。
function addFloodLight(g: THREE.Group, M: TrackMaterials): void {
  skipCollider(g);
  markCollider(g, [0.4, LIGHT.height, 0.4], [0, LIGHT.height / 2, 0]);
  rod(g, M.metal, [0, 0, 0], [0, LIGHT.height, 0], 0.12, 0.08, 10);
  const head = childGroup(g, [0, LIGHT.height, 0.25]);
  head.rotation.x = 0.4;
  box(head, M.darkMetal, [1.4, 0.35, 0.2], [0, 0, 0]);
  for (const x of [-0.45, 0, 0.45]) box(head, M.lamp, [0.38, 0.25, 0.02], [x, 0, 0.11]);
}

/** 環形 PU 跑道：整圈站得住；步道、跑道、外側草皮各自鋪面，外緣有欄杆（會擋，不會掉下去）。 */
export function buildTrackRing(spec: RingSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  const M = getTrackMaterials();
  const { inner, outer, minY, maxY } = spec;
  const kerbInner = inner + PROMENADE;
  const laneInner = kerbInner + KERB.width;
  const laneOuter = laneInner + LANE.count * LANE.width;
  const surfaceOuter = laneOuter + RUNOFF;
  const layout: TrackLayout = {
    y: maxY, laneInner, laneOuter, surfaceOuter,
    measure: (lane) => laneInner + lane * LANE.width + (lane === 0 ? LANE.firstOffset : LANE.otherOffset),
  };

  build.solid.add(annulus(inner, outer, minY, maxY, M.base));
  build.discs.push({ inner, outer, minY, maxY });
  const surfaces: [number, number, THREE.Material, number][] = [[inner, kerbInner, M.pavers, 1], [laneInner, surfaceOuter, M.pu, 1], [surfaceOuter, outer, M.turf, 1]];
  for (const [from, to, material, tile] of surfaces) {
    const layer = annulus(from, to, maxY, maxY + SURFACE_LIFT, material);
    planarUv(layer.geometry, tile);
    build.decor.add(layer);
  }
  build.decor.add(annulus(kerbInner, laneInner, maxY, maxY + KERB.height, M.kerb));

  const props = new THREE.Group();
  addLaneMarkings(build, props, M, layout);
  addHurdles(props, M, layout);

  // 步道：休息區之間規律地種樹、立路燈（休息區那一段不種）
  const restAngles = anglesEvery(inner + REST.radius, REST.spacing, START_ANGLE + Math.PI);
  const restHalf = (REST.width / 2 + 3) / (inner + REST.radius);
  const nearRest = (angle: number): boolean => restAngles.some((a) => Math.abs(THREE.MathUtils.euclideanModulo(angle - a + Math.PI, TAU) - Math.PI) < restHalf);
  anglesEvery(inner + TREE.radius, TREE.spacing).forEach((angle, i) => {
    if (!nearRest(angle)) addTree(onRing(props, inner + TREE.radius, maxY, angle), M, TREE_KINDS[i % TREE_KINDS.length] ?? 'round', rng);
  });
  for (const angle of anglesEvery(inner + LAMP.radius, LAMP.spacing, LAMP.spacing / 2 / (inner + LAMP.radius))) {
    if (!nearRest(angle)) addLamp(onRing(props, inner + LAMP.radius, maxY, angle), M);
  }
  for (const angle of restAngles) addRestArea(onRing(props, inner + REST.radius, maxY, angle), M, rng);

  // 外側草皮：終點的計時鐘與攝影塔、每 100 m 的距離牌、照明燈、外緣欄杆
  addClock(onRing(props, surfaceOuter + 4, maxY, START_ANGLE + 6 / surfaceOuter, true), M);
  addFinishTower(onRing(props, surfaceOuter + 2.2, maxY, START_ANGLE, true), M);
  const first = layout.measure(0);
  for (let k = 1; k <= Math.floor((TAU * first) / 100); k++) {
    addSign(onRing(props, surfaceOuter + 1.2, maxY, START_ANGLE + (k * 100) / first, true), M, `${k * 100} m`);
  }
  for (const angle of anglesEvery(outer - LIGHT.fromOuter, LIGHT.spacing, 0.01)) addFloodLight(onRing(props, outer - LIGHT.fromOuter, maxY, angle, true), M);
  const railRadius = outer - RAIL.fromOuter;
  for (const angle of anglesEvery(railRadius, RAIL.posts)) {
    const top = RAIL.heights[RAIL.heights.length - 1] ?? 1;
    cylinder(props, M.metal, 0.025, top, [railRadius * Math.sin(angle), maxY + top / 2, railRadius * Math.cos(angle)], 6);
  }
  for (const height of RAIL.heights) addMesh(props, new THREE.TorusGeometry(railRadius, 0.025, 6, 1024).rotateX(Math.PI / 2), M.metal, [0, maxY + height, 0]);
  build.walls.push({ radius: railRadius, minY: maxY, maxY: maxY + (RAIL.heights[RAIL.heights.length - 1] ?? 1), solid: 'outside' });

  // 小東西：休息區桌上幾瓶水
  for (const angle of restAngles) {
    const r = inner + REST.radius - 0.6;
    sphere(props, M.white, 0.035, [r * Math.sin(angle), maxY + 0.8, r * Math.cos(angle)], 8);
  }

  markChildGroups(props);
  build.solids.push(...collectColliders(props));
  build.decor.add(bakeByMaterial(props));
  disposeGeometries(props);
  return build;
}
