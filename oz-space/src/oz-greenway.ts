// 綠道環（ring style 'greenway'，最底層）：步道、自行車道、休息區與公廁的河濱公園。
// 由內往外（設計寬 90 m，實際寬度不同時等比例縮放）：
//   內緣步道 → 林蔭綠帶 → 自行車道（內圈）→ 休憩綠地（8 處休息區，4 處有公廁）→ 自行車道（外圈）→ 林蔭綠帶 → 外緣步道。
// 每處休息區有一條徑向步道連到內外兩條步道，跨自行車道的地方畫斑馬線。
// 自行車道照台灣河濱自行車道的標線：灰色柏油、白色邊線、中央雙黃線、白色菱形、側面的單車圖示（車輪是切成四段的圓環）。
import * as THREE from 'three';
import { Batch, annulus, bakeByMaterial, colorMaterial, createRng, emptyBuild, orientedSolid, type PropsBuild, type RingSpec } from './oz-props';
import {
  TAU, addMesh, box, childGroup, collectColliders, cylinder, disposeGeometries, mapped, markChildGroups, markCollider, pixelTexture, planarUv, rod,
  skipCollider, type Rng,
} from './oz-kit';

// ---------- 版面（公尺，從內緣算起；設計寬 DESIGN_WIDTH） ----------
const DESIGN_WIDTH = 90;
const BANDS = {
  footIn: [0, 5], beltIn: [5, 17], bikeIn: [17, 25], rest: [25, 65], bikeOut: [65, 73], beltOut: [73, 84], footOut: [84, 90],
} as const satisfies Record<string, readonly [number, number]>;
type BandName = keyof typeof BANDS;
const BODY_COLOR = 0x8c9a7a;          // 環本體：沉穩的灰綠色
const REST_AREAS = 8;
const PATH_WIDTH = 3;                  // 徑向步道寬
const PLAZA_RADIUS = 9;
const SURFACE = 0.01;                  // 地面貼圖層的厚度
const RAIL = { height: 1, postSpacing: 2 };
const TREE = { spacing: 9, rowInsets: [3, 8.5] as const, clear: PATH_WIDTH / 2 + 2 };
const LANE = { edgeInset: 0.35, edgeWidth: 0.15, centerGap: 0.3, centerWidth: 0.1, iconSize: 2.4, iconSpacing: 32, diamond: [2.4, 1] as const };
const LAMP_SPACING = 20;
const BENCH_SPACING = 24;

const LAWN_COLORS = ['#5f9e57', '#6aa864', '#549050', '#77b46f'];
const CROWN_COLORS = [0x4f9a4c, 0x5fa85d, 0x3f8a5f, 0x6aa864];
const TRUNK_COLOR = 0x6e4a2f;
const BIKE_COLORS = [0xc0392b, 0x2f6fb0, 0xf2c200, 0x3f8a5f, 0x2b2b2b];

const polarX = (r: number, a: number): number => r * Math.sin(a);
const polarZ = (r: number, a: number): number => r * Math.cos(a);
const pick = <T>(rng: Rng, items: readonly T[]): T => {
  const item = items[Math.floor(rng() * items.length)] ?? items[0];
  if (item === undefined) throw new Error('綠道環：挑選的清單是空的');
  return item;
};
// angle 離 openings 裡任何一個角度在 half 弧度以內
const nearAny = (angle: number, openings: number[], half: number): boolean =>
  openings.some((opening) => Math.abs(THREE.MathUtils.euclideanModulo(angle - opening + Math.PI, TAU) - Math.PI) < half);
const anglesEvery = (radius: number, spacing: number, offset = 0): number[] => {
  const count = Math.max(1, Math.round((TAU * radius) / spacing));
  return Array.from({ length: count }, (_, i) => offset + (i / count) * TAU);
};
// 在半徑 r、角度 angle 放一組零件：自身 x 沿圓周（角度變大的方向）、z 朝外
const ringGroup = (parent: THREE.Object3D, r: number, y: number, angle: number, yaw = 0): THREE.Group =>
  childGroup(parent, [polarX(r, angle), y, polarZ(r, angle)], angle + yaw);
// 地上的標線、鋪面：放法同 ringGroup，但不擋人
const decalGroup = (parent: THREE.Object3D, r: number, y: number, angle: number): THREE.Group => {
  const group = ringGroup(parent, r, y, angle);
  skipCollider(group);
  return group;
};

// ---------- 貼圖與材質 ----------
function drawSpeckle(base: string, colors: string[], seed: number): (ctx: CanvasRenderingContext2D) => void {
  return (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    const rng = createRng(seed);
    for (let i = 0; i < 7000; i++) {
      ctx.fillStyle = colors[Math.floor(rng() * colors.length)] ?? base;
      ctx.fillRect(rng() * 256, rng() * 256, 1.5, 1.5);
    }
  };
}
// 步道地磚：錯縫的長方形磚，一張 2 m
function drawPavers(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#cfc6b8';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#b3a998';
  ctx.lineWidth = 3;
  for (let row = 0; row < 8; row++) {
    ctx.strokeRect(-1, row * 32, 258, 32);
    for (let col = 0; col < 5; col++) ctx.strokeRect(col * 64 + (row % 2) * 32, row * 32, 64, 32);
  }
}
// 地上的單車圖示（側面）：車輪是切成四段的白色圓環，戴安全帽的騎士；貼圖上方是騎乘方向
function drawBikeIcon(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 15;
  for (const cx of [68, 188]) {
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(cx, 176, 44, (k * Math.PI) / 2 + Math.PI / 4 + 0.22, ((k + 1) * Math.PI) / 2 + Math.PI / 4 - 0.22);
      ctx.stroke();
    }
  }
  const line = (width: number, points: [number, number][]): void => {
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  };
  line(12, [[68, 176], [126, 174], [108, 116], [176, 110], [188, 176]]);
  line(12, [[126, 174], [176, 110]]);
  line(24, [[114, 108], [148, 72]]);            // 身體
  line(12, [[150, 76], [178, 104]]);            // 手臂
  line(16, [[114, 112], [150, 134], [128, 174]]); // 腿
  ctx.beginPath();
  ctx.arc(160, 50, 20, Math.PI, 0);             // 安全帽
  ctx.fill();
  line(8, [[136, 50], [186, 50]]);
  ctx.beginPath();
  ctx.arc(160, 58, 12, 0, TAU);                 // 頭
  ctx.fill();
}
// 白底（或指定底色）上的一行字：公廁門牌、招牌
function drawLabel(text: string, bg: string, fg: string, width: number, height: number): (ctx: CanvasRenderingContext2D) => void {
  return (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = fg;
    ctx.font = `bold ${Math.round(height * 0.62)}px "Microsoft JhengHei", "PingFang TC", "Arial", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2 + 2);
  };
}
// 園區地圖看板：綠底、幾圈環狀的路
function drawMap(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#e9f1e2';
  ctx.fillRect(0, 0, 192, 128);
  ctx.strokeStyle = '#2f6b4a';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 188, 124);
  for (const [r, color] of [[50, '#cfc6b8'], [40, '#6b6f73'], [26, '#6b6f73']] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(96, 64, r, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(130, 40, 6, 0, TAU);
  ctx.fill();
}

interface GreenwayMaterials {
  lawn: THREE.Material; pavers: THREE.Material; asphalt: THREE.Material; plaza: THREE.Material; path: THREE.Material;
  white: THREE.Material; yellow: THREE.Material; bikeIcon: THREE.Material; rail: THREE.Material; darkMetal: THREE.Material;
  lamp: THREE.Material; wood: THREE.Material; roof: THREE.Material; toiletWall: THREE.Material; door: THREE.Material;
  men: THREE.Material; women: THREE.Material; wc: THREE.Material; map: THREE.Material; water: THREE.Material; stone: THREE.Material;
}
let materials: GreenwayMaterials | null = null;
function getMaterials(): GreenwayMaterials {
  materials ??= {
    lawn: mapped(pixelTexture(256, 256, drawSpeckle('#64a35c', LAWN_COLORS, 101))),
    pavers: mapped(pixelTexture(256, 256, drawPavers)),
    asphalt: mapped(pixelTexture(256, 256, drawSpeckle('#62666a', ['#585c60', '#6c7074', '#52565a', '#73777b'], 102))),
    plaza: colorMaterial(0xd8d0c4),
    path: colorMaterial(0xcfc6b8),
    white: colorMaterial(0xf4f4f0),
    yellow: colorMaterial(0xf2c200),
    bikeIcon: mapped(pixelTexture(256, 256, drawBikeIcon), { transparent: true, alphaTest: 0.4 }),
    rail: colorMaterial(0xd5dae0),
    darkMetal: colorMaterial(0x3a3f45),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c9 }),
    wood: colorMaterial(0xb08a63),
    roof: colorMaterial(0x5b6770),
    toiletWall: colorMaterial(0xe8e2d6),
    door: colorMaterial(0x6e5440),
    men: mapped(pixelTexture(128, 128, drawLabel('男', '#1f5fbf', '#ffffff', 128, 128))),
    women: mapped(pixelTexture(128, 128, drawLabel('女', '#d23b4f', '#ffffff', 128, 128))),
    wc: mapped(pixelTexture(256, 64, drawLabel('公廁 WC', '#2f6b4a', '#ffffff', 256, 64))),
    map: mapped(pixelTexture(192, 128, drawMap)),
    water: colorMaterial(0x7fc4e0),
    stone: colorMaterial(0xb7b0a5),
  };
  return materials;
}

// ---------- 地面與邊緣 ----------
interface Layout { radius: (band: BandName, at: 0 | 1) => number; mid: (band: BandName) => number; y: number }

function addSurfaces(build: PropsBuild, L: Layout, M: GreenwayMaterials): void {
  const surfaces: [BandName, THREE.Material, number][] = [
    ['footIn', M.pavers, 2], ['beltIn', M.lawn, 4], ['bikeIn', M.asphalt, 4], ['rest', M.lawn, 4],
    ['bikeOut', M.asphalt, 4], ['beltOut', M.lawn, 4], ['footOut', M.pavers, 2],
  ];
  for (const [band, material, tile] of surfaces) {
    const surface = annulus(L.radius(band, 0), L.radius(band, 1), L.y, L.y + SURFACE, material);
    planarUv(surface.geometry, tile);
    build.decor.add(surface);
  }
}

// 環邊欄杆：每 RAIL.postSpacing 一根柱子、頂端一圈扶手；碰撞是整圈的圓形牆（solid 是哪一側實心）
function addRail(build: PropsBuild, props: THREE.Group, M: GreenwayMaterials, radius: number, y: number, solid: 'inside' | 'outside'): void {
  for (const angle of anglesEvery(radius, RAIL.postSpacing)) {
    cylinder(props, M.rail, 0.03, RAIL.height, [polarX(radius, angle), y + RAIL.height / 2, polarZ(radius, angle)], 6);
  }
  addMesh(props, new THREE.TorusGeometry(radius, 0.035, 6, Math.round(radius * 2)).rotateX(Math.PI / 2), M.rail, [0, y + RAIL.height, 0]);
  build.walls.push({ radius, minY: y, maxY: y + RAIL.height, solid });
}

// ---------- 自行車道標線 ----------
// 圓周上的一條細線（白色邊線、黃色中線）：薄薄一圈，疊在柏油上
function addLaneLine(build: PropsBuild, r: number, width: number, y: number, material: THREE.Material): void {
  build.decor.add(annulus(r - width / 2, r + width / 2, y + SURFACE, y + SURFACE + 0.006, material));
}

// 白色菱形外框：長軸沿車道（自身 x），四條細長方塊圍成
function addDiamond(g: THREE.Group, M: GreenwayMaterials): void {
  const [length, width] = LANE.diamond;
  const corners: [number, number][] = [[length / 2, 0], [0, width / 2], [-length / 2, 0], [0, -width / 2]];
  corners.forEach(([x0, z0], i) => {
    const [x1, z1] = corners[(i + 1) % corners.length] ?? [x0, z0];
    box(g, M.white, [Math.hypot(x1 - x0, z1 - z0) + 0.1, 0.006, 0.12], [(x0 + x1) / 2, 0, (z0 + z1) / 2], [0, Math.atan2(-(z1 - z0), x1 - x0), 0]);
  });
}

// 一條雙向自行車道：兩側白色邊線、中央雙黃線，每個車道每隔一段一個單車圖示，圖示之間一個菱形；crossings 的角度畫斑馬線、不放圖示
function addBikeLane(build: PropsBuild, props: THREE.Group, M: GreenwayMaterials, r0: number, r1: number, y: number, crossings: number[]): void {
  const center = (r0 + r1) / 2;
  for (const r of [r0 + LANE.edgeInset, r1 - LANE.edgeInset]) addLaneLine(build, r, LANE.edgeWidth, y, M.white);
  for (const side of [-1, 1]) addLaneLine(build, center + (side * LANE.centerGap) / 2, LANE.centerWidth, y, M.yellow);
  const icon = new THREE.PlaneGeometry(LANE.iconSize, LANE.iconSize).rotateX(-Math.PI / 2);
  for (const side of [-1, 1]) {
    const r = center + (side * (r1 - r0)) / 4;
    const spacing = LANE.iconSpacing / r;
    for (const angle of anglesEvery(r, LANE.iconSpacing, side * 0.01)) {
      if (nearAny(angle, crossings, 6 / r)) continue;
      // 內側車道往角度變大的方向騎、外側相反；圖示上方朝騎乘方向
      addMesh(decalGroup(props, r, y + 0.02, angle), icon, M.bikeIcon, [0, 0, 0], [0, side < 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
      if (!nearAny(angle + spacing / 2, crossings, 6 / r)) addDiamond(decalGroup(props, r, y + 0.016, angle + spacing / 2), M);
    }
  }
  // 斑馬線：橫條沿車道方向（自身 x），一條一條排過整個路寬
  for (const angle of crossings) {
    for (let r = r0 + 0.6; r <= r1 - 0.6; r += 1) box(decalGroup(props, r, y + 0.022, angle), M.white, [PATH_WIDTH, 0.006, 0.5], [0, 0, 0]);
  }
}

// ---------- 樹與徑向步道 ----------
function addTreeRows(build: PropsBuild, rng: Rng, L: Layout, crossings: number[]): void {
  const trunks = new Batch(new THREE.CylinderGeometry(0.18, 0.26, 1, 6).translate(0, 0.5, 0), colorMaterial(0xffffff));
  const crowns = new Batch(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
  (['beltIn', 'beltOut'] as const).forEach((band) => {
    TREE.rowInsets.forEach((inset, row) => {
      const r = L.radius(band, 0) + inset;
      for (const angle of anglesEvery(r, TREE.spacing, row * (TREE.spacing / 2 / r))) {
        if (nearAny(angle, crossings, TREE.clear / r)) continue;
        const x = polarX(r, angle);
        const z = polarZ(r, angle);
        const height = 2.6 + rng() * 0.8;
        const crown = 1.8 + rng() * 0.5;
        trunks.add(new THREE.Matrix4().compose(new THREE.Vector3(x, L.y, z), new THREE.Quaternion(), new THREE.Vector3(1, height, 1)), TRUNK_COLOR);
        crowns.add(new THREE.Matrix4().compose(new THREE.Vector3(x, L.y + height + crown * 0.6, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * TAU, 0)), new THREE.Vector3(crown, crown * 0.9, crown)), pick(rng, CROWN_COLORS));
        build.solids.push(orientedSolid(x, z, angle, 0.5, 0.5, L.y, L.y + height));
      }
    });
  });
  for (const batch of [trunks, crowns]) {
    const object = batch.build();
    if (object) build.decor.add(object);
  }
}

// 徑向步道：綠地上一條淺色鋪面（跨自行車道的地方是斑馬線，不鋪）
function addRadialPath(props: THREE.Group, M: GreenwayMaterials, angle: number, from: number, to: number, y: number): void {
  if (to <= from) return;
  box(decalGroup(props, (from + to) / 2, y + 0.012, angle), M.path, [PATH_WIDTH, 0.01, to - from], [0, 0, 0]);
}

// ---------- 設施 ----------
function addLamp(g: THREE.Group, M: GreenwayMaterials): void {
  skipCollider(g);
  markCollider(g, [0.3, 3.6, 0.3], [0, 1.8, 0]);
  rod(g, M.darkMetal, [0, 0, 0], [0, 3.5, 0], 0.05, 0.04, 8);
  addMesh(g, new THREE.SphereGeometry(0.2, 12, 8), M.lamp, [0, 3.65, 0]);
  cylinder(g, M.darkMetal, 0.22, 0.05, [0, 3.88, 0], 12);
}

// 長椅：坐的人面向自身 +z
function addBench(g: THREE.Group, M: GreenwayMaterials): void {
  for (const z of [-0.12, 0.02, 0.16]) box(g, M.wood, [1.8, 0.04, 0.12], [0, 0.45, z]);
  for (const y of [0.6, 0.75]) box(g, M.wood, [1.8, 0.1, 0.03], [0, y, -0.22]);
  for (const x of [-0.75, 0.75]) box(g, M.darkMetal, [0.05, 0.45, 0.42], [x, 0.225, 0]);
}

// 涼亭：四根柱子、四角屋頂，裡面兩張相對的長椅；只有柱子和長椅擋人
function addPavilion(g: THREE.Group, M: GreenwayMaterials): void {
  skipCollider(g);
  const half = 2.3;
  for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]] as const) {
    cylinder(g, M.wood, 0.12, 2.8, [x, 1.4, z], 8);
    markCollider(g, [0.3, 2.8, 0.3], [x, 1.4, z]);
  }
  box(g, M.wood, [half * 2 + 0.6, 0.2, half * 2 + 0.6], [0, 2.9, 0]);
  addMesh(g, new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(half * 2 + 1.4, 1.6, half * 2 + 1.4), M.roof, [0, 3.0 + 0.8, 0]);
  for (const side of [-1, 1]) {
    const bench = childGroup(g, [0, 0, side * 1.3], side > 0 ? Math.PI : 0);
    addBench(bench, M);
    markCollider(g, [1.9, 0.8, 0.5], [0, 0.4, side * 1.3]);
  }
}

// 公廁：一棟小房子，正面（自身 +z）兩扇門，門上男／女牌，屋簷上「公廁 WC」
function addToilet(g: THREE.Group, M: GreenwayMaterials): void {
  const [w, h, d] = [5.6, 3.2, 4];
  box(g, M.toiletWall, [w, h, d], [0, h / 2, 0]);
  box(g, M.roof, [w + 0.8, 0.25, d + 0.8], [0, h + 0.12, 0]);
  addMesh(g, new THREE.PlaneGeometry(2.4, 0.6), M.wc, [0, h - 0.45, d / 2 + 0.02]);
  for (const [x, sign] of [[-1.4, M.men], [1.4, M.women]] as const) {
    box(g, M.door, [1.1, 2.2, 0.08], [x, 1.1, d / 2 + 0.03]);
    addMesh(g, new THREE.PlaneGeometry(0.5, 0.5), sign, [x, 2.55, d / 2 + 0.02]);
  }
  box(g, M.rail, [w - 0.6, 0.35, 0.06], [0, h - 1.05, d / 2 + 0.02]);
}

function addFountain(g: THREE.Group, M: GreenwayMaterials): void {
  cylinder(g, M.stone, 0.18, 0.9, [0, 0.45, 0], 12);
  cylinder(g, M.stone, 0.35, 0.12, [0, 0.96, 0], 16);
  cylinder(g, M.water, 0.28, 0.02, [0, 1.03, 0], 16);
}

function addMapBoard(g: THREE.Group, M: GreenwayMaterials): void {
  for (const x of [-0.9, 0.9]) rod(g, M.darkMetal, [x, 0, 0], [x, 2.1, 0], 0.05);
  box(g, M.darkMetal, [2.0, 1.3, 0.08], [0, 1.45, 0]);
  addMesh(g, new THREE.PlaneGeometry(1.85, 1.15), M.map, [0, 1.45, 0.05]);
}

// 單車停車架：一排 U 型架，停幾台單車（自身 x 是車身方向）
function addBikeRack(g: THREE.Group, M: GreenwayMaterials, rng: Rng): void {
  for (let b = 0; b < 5; b++) {
    const z = b * 0.9 - 1.8;
    addMesh(g, new THREE.TorusGeometry(0.35, 0.025, 6, 16, Math.PI), M.rail, [0, 0, z]);
    if (b % 3 === 2) continue;
    const frame = colorMaterial(pick(rng, BIKE_COLORS));
    for (const x of [-0.5, 0.5]) addMesh(g, new THREE.TorusGeometry(0.33, 0.025, 6, 20), M.darkMetal, [x, 0.35, z + 0.15]);
    rod(g, frame, [-0.5, 0.35, z + 0.15], [-0.05, 0.75, z + 0.15], 0.02);
    rod(g, frame, [-0.05, 0.75, z + 0.15], [0.4, 0.75, z + 0.15], 0.02);
    rod(g, frame, [0.4, 0.75, z + 0.15], [0.5, 0.35, z + 0.15], 0.02);
    rod(g, frame, [-0.05, 0.75, z + 0.15], [0, 0.35, z + 0.15], 0.02);
    box(g, M.darkMetal, [0.22, 0.05, 0.1], [-0.08, 0.86, z + 0.15]);
  }
}

// 一處休息區：圓形鋪面廣場，中間偏內是涼亭，hasToilet 時外側一座公廁（否則兩張長椅），還有飲水機、地圖看板、停車架、路燈
function addRestArea(props: THREE.Group, M: GreenwayMaterials, rng: Rng, r: number, angle: number, y: number, hasToilet: boolean): void {
  const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
  const radial = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  const at = (x: number, z: number, yaw = 0): THREE.Group => {
    const p = tangent.clone().multiplyScalar(x).add(radial.clone().multiplyScalar(z)).add(new THREE.Vector3(polarX(r, angle), y, polarZ(r, angle)));
    return childGroup(props, [p.x, p.y, p.z], angle + yaw);
  };
  addMesh(props, new THREE.CylinderGeometry(PLAZA_RADIUS, PLAZA_RADIUS, 0.02, 48), M.plaza, [polarX(r, angle), y + SURFACE + 0.006, polarZ(r, angle)]);
  addPavilion(at(-3, -2), M);
  if (hasToilet) addToilet(at(4.2, 2, -Math.PI / 2), M);
  else for (const z of [0.5, 3]) addBench(at(5, z, -Math.PI / 2), M);
  addFountain(at(-1.5, 6), M);
  addMapBoard(at(-5.5, 4.5, Math.PI / 4), M);
  addBikeRack(at(4.5, -6), M, rng);
  for (const x of [-7, 7]) addLamp(at(x, -3), M);
}

// ---------- 組合 ----------
/** 綠道環：步道、兩圈自行車道、休憩綠地（休息區、公廁），內外兩緣有欄杆。 */
export function buildGreenwayRing(spec: RingSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  const M = getMaterials();
  const scale = (spec.outer - spec.inner) / DESIGN_WIDTH;
  const L: Layout = {
    radius: (band, at) => spec.inner + BANDS[band][at] * scale,
    mid: (band) => spec.inner + ((BANDS[band][0] + BANDS[band][1]) / 2) * scale,
    y: spec.maxY,
  };
  const y = spec.maxY;
  build.solid.add(annulus(spec.inner, spec.outer, spec.minY, y, colorMaterial(BODY_COLOR)));
  build.discs.push({ inner: spec.inner, outer: spec.outer, minY: spec.minY, maxY: y });
  addSurfaces(build, L, M);
  const props = new THREE.Group();
  addRail(build, props, M, spec.inner + 0.15, y, 'inside');
  addRail(build, props, M, spec.outer - 0.15, y, 'outside');
  const start = rng() * TAU;
  const crossings = Array.from({ length: REST_AREAS }, (_, k) => start + (k * TAU) / REST_AREAS);
  addBikeLane(build, props, M, L.radius('bikeIn', 0), L.radius('bikeIn', 1), y, crossings);
  addBikeLane(build, props, M, L.radius('bikeOut', 0), L.radius('bikeOut', 1), y, crossings);
  addTreeRows(build, rng, L, crossings);
  const plazaRadius = L.mid('rest');
  crossings.forEach((angle, k) => {
    addRadialPath(props, M, angle, L.radius('beltIn', 0), L.radius('beltIn', 1), y);
    addRadialPath(props, M, angle, L.radius('rest', 0), plazaRadius - PLAZA_RADIUS, y);
    addRadialPath(props, M, angle, plazaRadius + PLAZA_RADIUS, L.radius('rest', 1), y);
    addRadialPath(props, M, angle, L.radius('beltOut', 0), L.radius('beltOut', 1), y);
    addRestArea(props, M, rng, plazaRadius, angle, y, k % 2 === 0);
  });
  const footIn = L.radius('footIn', 1) - 0.5;
  for (const angle of anglesEvery(footIn, LAMP_SPACING)) addLamp(ringGroup(props, footIn, y, angle), M);
  const footOut = L.radius('footOut', 0) + 0.5;
  for (const angle of anglesEvery(footOut, LAMP_SPACING, 0.01)) addLamp(ringGroup(props, footOut, y, angle), M);
  const benchRadius = spec.outer - 1.4;
  for (const angle of anglesEvery(benchRadius, BENCH_SPACING, 0.02)) addBench(ringGroup(props, benchRadius, y, angle), M);
  markChildGroups(props);
  build.solids.push(...collectColliders(props));
  build.decor.add(bakeByMaterial(props));
  disposeGeometries(props);
  return build;
}

