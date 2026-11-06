// 田園環（ring style 'broken'）：棕色的土壤環，2/3 是完整的田園、1/3 碎掉。
// 完整那段沿圓周分成五區：森林（松樹與闊葉樹混種、灌木、石頭）、果園（一排排蘋果、橘子、檸檬樹，地上有水果箱）、
// 花田（一條條不同顏色的花、一座小風車）、農田（麥田、高麗菜、玉米、南瓜，紅色穀倉、乾草捆、稻草人）、
// 草原（野花、蜂箱、一棵大樹）。中線一條泥土步道（庭園燈、長椅），內外兩側木頭圍籬。
// 斷口是一塊塊碎土塊形狀的鋸齒（和碎片一樣的不規則輪廓），碰撞照鋸齒切；缺口裡的碎土塊越往中間越小、越稀，
// 彼此不重疊，部分上面還長著樹、灌木或花。樹、作物、碎片都用 InstancedMesh（Batch），大量也只畫幾次。
import * as THREE from 'three';
import { Batch, addFloater, bakeByMaterial, createRng, emptyBuild, orientedSolid, type Part, type PropsBuild, type RingSpec } from './oz-props';
import {
  TAU, addMesh, box, childGroup, collectColliders, cylinder, disposeGeometries, mapped, markChildGroups, markCollider, pixelTexture, planarUv, range, rod,
  skipCollider, type Range, type Rng,
} from './oz-kit';

// ---------- 版面 ----------
const BROKEN_SHARE = 1 / 3;
const SOIL = 0x7a5233;
const PATH_WIDTH = 3;
const EDGE_POINTS = 13;                 // 斷口橫跨環寬的鋸齒點數
const EDGE_DEPTH: Range = [2, 14];      // 每個鋸齒點往完整段內咬多深（m）
const EDGE_CLEAR = 17;                  // 圍籬、步道設施、分區內容離斷口至少多遠
// 沿完整段的五區（各佔的比例）
const ZONES = [
  { kind: 'forest', share: 0.27 }, { kind: 'orchard', share: 0.19 }, { kind: 'flowers', share: 0.18 },
  { kind: 'farm', share: 0.24 }, { kind: 'meadow', share: 0.12 },
] as const;
type ZoneKind = (typeof ZONES)[number]['kind'];
// 碎片
// 碎片：斷口旁 large、缺口中間 small（中間指數變小）；base 是一開始就空掉的比例、sparse 是越往中間多空的比例；step 是欄與欄、列與列的間距倍數
const FRAGMENT = { large: 16, small: 5, base: 0.05, sparse: 0.4, drift: 6, tilt: 0.35, floatFrom: 0.15, spacing: 1.05, step: [0.95, 1.2] as Range, plantChance: 0.45, thickness: 2.2 };
// 斷口處的碎裂樣式：卡在鋸齒缺口裡、半脫落（往下沉一點、歪一點）的土塊，和地面往內延伸的裂縫
const EDGE_CHUNK = { size: [3, 6.5] as Range, drop: [0.2, 1.4] as Range, tilt: 0.3 };
const CRACK = { perEdge: 7, reach: [4, 10] as Range, segment: 1.2, width: 0.12 };

const GREENS = [0x4f9a4c, 0x5fa85d, 0x3f8a5f, 0x77b46f, 0x6aa864];
const PINES = [0x2f6b4a, 0x3a7a52, 0x2c5e43];
const FLOWER_ROWS = [0xe63946, 0xf2c200, 0xff7ac3, 0xffffff, 0x8e44ad, 0xf4a261, 0x4aa8e8];
const FRUITS = [0xd62828, 0xf28c28, 0xf2d43b];
const ROCKS = [0x8d857c, 0x7a726a, 0x9a9187];
const TRUNK = 0x6e4a2f;

const polarX = (r: number, a: number): number => r * Math.sin(a);
const polarZ = (r: number, a: number): number => r * Math.cos(a);
const spread = (rng: Rng, half: number): number => (rng() * 2 - 1) * half;
const pick = <T>(rng: Rng, items: readonly T[]): T => {
  const item = items[Math.floor(rng() * items.length)] ?? items[0];
  if (item === undefined) throw new Error('田園環：挑選的清單是空的');
  return item;
};
function transform(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, tiltX = 0, tiltZ = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, yaw, tiltZ, 'YXZ')), new THREE.Vector3(sx, sy, sz));
}

// ---------- 貼圖與材質 ----------
const drawSpeckle = (base: string, colors: string[], seed: number, stroke: [number, number]) => (ctx: CanvasRenderingContext2D): void => {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const rng = createRng(seed);
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)] ?? base;
    ctx.fillRect(rng() * 256, rng() * 256, stroke[0], stroke[1]);
  }
};
// 犁過的田：深淺交錯的一條條田畦（沿貼圖的 v 方向）
function drawFurrows(ctx: CanvasRenderingContext2D): void {
  drawSpeckle('#6b4a33', ['#5e402c', '#7a5539', '#563a28'], 91, [2, 2])(ctx);
  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, y, 256, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, y + 14, 256, 4);
  }
}

let shared: ReturnType<typeof createShared> | null = null;
function createShared() {
  const flat = (color = 0xffffff): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const slab = (seed: number): THREE.BufferGeometry => {
    const rng = createRng(seed);
    const corners = 6 + Math.floor(rng() * 3);
    const points = Array.from({ length: corners }, (_, i) => {
      const angle = ((i + spread(rng, 0.3)) / corners) * TAU;
      const r = range(rng, [0.6, 1]);
      return new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r);
    });
    return new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: 1, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.5, 0);
  };
  return {
    grass: mapped(pixelTexture(256, 256, drawSpeckle('#6aa864', ['#5e9c58', '#77b46f', '#549050', '#82bd78'], 81, [1, 3]))),
    meadow: mapped(pixelTexture(256, 256, drawSpeckle('#7cb56a', ['#6ea85e', '#8cc27a', '#c9d86a', '#e4e08a'], 82, [1, 3]))),
    forest: mapped(pixelTexture(256, 256, drawSpeckle('#4f7f45', ['#46743d', '#5a8a4e', '#6b5a3c', '#3f6a38'], 83, [2, 2]))),
    furrows: mapped(pixelTexture(256, 256, drawFurrows)),
    soilTop: mapped(pixelTexture(256, 256, drawSpeckle('#7a5233', ['#6b4a2e', '#86603d', '#5e4128'], 84, [2, 2]))),
    path: mapped(pixelTexture(256, 256, drawSpeckle('#a88a66', ['#9a7d5a', '#b89a74', '#8e7352', '#c4a882'], 85, [2, 2]))),
    soilSide: new THREE.MeshLambertMaterial({ color: SOIL }),
    flat,
    trunk: new THREE.CylinderGeometry(0.6, 1, 1, 6).translate(0, 0.5, 0),
    crown: new THREE.IcosahedronGeometry(1, 1),
    blob: new THREE.IcosahedronGeometry(1, 0),
    cone: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
    thinCone: new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0),
    ball: new THREE.SphereGeometry(1, BALL_SEGMENTS[0], BALL_SEGMENTS[1]),
    rock: new THREE.DodecahedronGeometry(1, 0),
    post: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    slabs: [11, 12, 13, 14, 15, 16].map(slab),
  };
}
type Shared = ReturnType<typeof createShared>;
const getShared = (): Shared => {
  shared ??= createShared();
  return shared;
};

// 果實、南瓜用的球：數千顆，每顆 10×8 段（140 個三角形）太多，7×5 段（56 個）近看也還是圓的
const BALL_SEGMENTS = [7, 5] as const;
// 小東西離鏡頭超過幾公尺就不畫（公尺，量到那一塊的包圍球表面）：果實、麥稈這種幾公分粗的，遠了連一個像素都不到
const CULL = { tiny: 120, small: 170 };

// 這一層用到的所有實例批次：每種形狀一批，顏色用實例顏色
function createBatches(S: Shared) {
  const material = S.flat();
  return {
    trunks: new Batch(S.trunk, material), crowns: new Batch(S.crown, material), blobs: new Batch(S.blob, material, CULL.small),
    cones: new Batch(S.cone, material), thin: new Batch(S.thinCone, material, CULL.tiny), balls: new Batch(S.ball, material, CULL.tiny),
    rocks: new Batch(S.rock, material, CULL.small), posts: new Batch(S.post, material, CULL.small),
    slabs: S.slabs.map((geometry) => new Batch(geometry, material)),
  };
}
type Batches = ReturnType<typeof createBatches>;

// ---------- 植物（回傳實例，碎片上的會跟著飄；樹幹另外回傳，做碰撞） ----------
interface Plant { parts: Part[]; trunk?: Part }
function addRoundTree(B: Batches, rng: Rng, x: number, y: number, z: number, height: number, colors: number[] = GREENS): Plant {
  const crown = height * 0.32;
  const trunk = B.trunks.add(transform(x, y, z, rng() * TAU, height * 0.06, height * 0.65, height * 0.06), TRUNK);
  const parts = [trunk, B.crowns.add(transform(x, y + height * 0.78, z, rng() * TAU, crown, crown * 0.9, crown), pick(rng, colors))];
  for (let k = 0; k < 2; k++) {
    const angle = rng() * TAU;
    parts.push(B.blobs.add(transform(x + Math.sin(angle) * crown * 0.7, y + height * (0.66 + rng() * 0.15), z + Math.cos(angle) * crown * 0.7, rng() * TAU, crown * 0.6, crown * 0.55, crown * 0.6), pick(rng, colors)));
  }
  return { parts, trunk };
}
function addPine(B: Batches, rng: Rng, x: number, y: number, z: number, height: number): Plant {
  const trunk = B.trunks.add(transform(x, y, z, 0, height * 0.045, height * 0.35, height * 0.045), TRUNK);
  const parts = [trunk];
  for (let k = 0; k < 3; k++) {
    const radius = height * (0.3 - k * 0.07);
    parts.push(B.cones.add(transform(x, y + height * (0.25 + k * 0.2), z, rng() * TAU, radius, height * (0.42 - k * 0.06), radius), pick(rng, PINES)));
  }
  return { parts, trunk };
}
// 果樹：矮樹幹、圓樹冠，樹冠表面掛著一顆顆水果
function addFruitTree(B: Batches, rng: Rng, x: number, y: number, z: number, fruit: number): Plant {
  const height = range(rng, [3, 3.8]);
  const crown = range(rng, [1.4, 1.8]);
  const trunk = B.trunks.add(transform(x, y, z, rng() * TAU, 0.16, height * 0.55, 0.16), TRUNK);
  const parts = [trunk, B.crowns.add(transform(x, y + height * 0.7, z, rng() * TAU, crown, crown * 0.85, crown), pick(rng, GREENS))];
  for (let k = 0; k < 10; k++) {
    const angle = rng() * TAU;
    const lift = spread(rng, 0.6);
    const reach = crown * Math.sqrt(1 - lift * lift) * 0.97;
    parts.push(B.balls.add(transform(x + Math.sin(angle) * reach, y + height * 0.7 + lift * crown * 0.85, z + Math.cos(angle) * reach, 0, 0.11, 0.11, 0.11), fruit));
  }
  return { parts, trunk };
}
function addBush(B: Batches, rng: Rng, x: number, y: number, z: number, size: number): Part {
  return B.blobs.add(transform(x, y + size * 0.5, z, rng() * TAU, size, size * 0.75, size), pick(rng, GREENS));
}
function addFlower(B: Batches, rng: Rng, x: number, y: number, z: number, color: number): Part {
  return B.blobs.add(transform(x, y + 0.35, z, rng() * TAU, 0.15, 0.12, 0.15), color);
}

// ---------- 地面 ----------
// 一段角度的環形平板（LatheGeometry 的 phi 和這裡的角度同方向：x = r sin θ、z = r cos θ）。
const arcAnnulus = (inner: number, outer: number, minY: number, maxY: number, start: number, length: number, material: THREE.Material): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(inner, minY), new THREE.Vector2(outer, minY), new THREE.Vector2(outer, maxY), new THREE.Vector2(inner, maxY), new THREE.Vector2(inner, minY)],
    Math.max(4, Math.round((length / TAU) * 256)), start, length), material);
  planarUv(mesh.geometry, 2);
  return mesh;
};

// 環本體：外圓弧、斷口的鋸齒（一塊塊碎土塊形狀）、內圓弧、另一頭的鋸齒，擠出成平板（土壤色）。
// 回傳每個斷口的鋸齒點（半徑、咬進去的深度），碰撞照這些點切。
interface EdgeProfile { radii: number[]; depths: number[] }
function addBody(build: PropsBuild, rng: Rng, spec: RingSpec, start: number, length: number): { startEdge: EdgeProfile; endEdge: EdgeProfile } {
  const { inner, outer, minY, maxY } = spec;
  const profile = (): EdgeProfile => {
    const radii = Array.from({ length: EDGE_POINTS }, (_, k) => outer - ((outer - inner) * k) / (EDGE_POINTS - 1));
    // 大小鋸齒交錯，輪廓像好幾塊土塊擠在一起
    const depths = radii.map((_, k) => (k % 2 === 0 ? range(rng, [EDGE_DEPTH[0], EDGE_DEPTH[1] * 0.55]) : range(rng, [EDGE_DEPTH[1] * 0.45, EDGE_DEPTH[1]])));
    return { radii, depths };
  };
  const startEdge = profile();
  const endEdge = profile();
  const end = start + length;
  const point = (r: number, theta: number): THREE.Vector2 => new THREE.Vector2(polarX(r, theta), -polarZ(r, theta));
  const steps = Math.max(8, Math.ceil((length / TAU) * 256));
  const arc = (r: number, from: number, to: number): THREE.Vector2[] => Array.from({ length: steps + 1 }, (_, i) => point(r, from + ((to - from) * i) / steps));
  const startAt = (k: number): number => start + (startEdge.depths[k] ?? 0) / (startEdge.radii[k] ?? outer);
  const endAt = (k: number): number => end - (endEdge.depths[k] ?? 0) / (endEdge.radii[k] ?? outer);
  const last = EDGE_POINTS - 1;
  // 外框一圈：外圓弧（起點→終點）、終點那頭的鋸齒（由外往內）、內圓弧（終點→起點）、起點那頭的鋸齒（由內往外）
  const interior = Array.from({ length: last - 1 }, (_, i) => i + 1);
  const outline = [
    ...arc(outer, startAt(0), endAt(0)),
    ...interior.map((k) => point(endEdge.radii[k] ?? outer, endAt(k))),
    ...arc(inner, endAt(last), startAt(last)),
    ...[...interior].reverse().map((k) => point(startEdge.radii[k] ?? outer, startAt(k))),
  ];
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: maxY - minY, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, getShared().soilSide);
  mesh.position.y = minY;
  build.solid.add(mesh);
  // 碰撞：完整段扣掉最深的鋸齒用一片圓盤，鋸齒那幾公尺用一條條方塊照每段的深度切
  const maxBite = EDGE_DEPTH[1] / inner;
  build.discs.push({ inner, outer, minY, maxY, arc: { start: start + maxBite, length: length - 2 * maxBite } });
  for (const [edge, profileOf, dir] of [[start, startEdge, 1], [end, endEdge, -1]] as const) {
    for (let k = 0; k < last; k++) {
      const r0 = profileOf.radii[k] ?? outer;
      const r1 = profileOf.radii[k + 1] ?? inner;
      const rm = (r0 + r1) / 2;
      const bite = Math.max(profileOf.depths[k] ?? 0, profileOf.depths[k + 1] ?? 0);
      const near = edge + (dir * bite) / rm;
      const far = edge + dir * maxBite + dir * 0.2 / rm;
      const span = Math.abs(far - near) * rm;
      if (span <= 0.05) continue;
      const mid = (near + far) / 2;
      build.solids.push({ ...orientedSolid(polarX(rm, mid), polarZ(rm, mid), mid, span, r0 - r1, minY, maxY), standable: true });
    }
  }
  return { startEdge, endEdge };
}

// ---------- 分區內容 ----------
interface Zone { kind: ZoneKind; start: number; length: number }
// B 是環上的植物與作物（不動）；F 是碎片與斷口土塊（會飄的那些每格更新矩陣，和 B 分開，才不會每格重傳環上幾萬個實例）
interface Ctx { build: PropsBuild; B: Batches; F: Batches; props: THREE.Group; rng: Rng; spec: RingSpec; y: number; pathIn: number; pathOut: number; trunks: Part[] }

// 在區域裡（半徑 from–to、角度 a0–a1）隨機一點，避開步道
function scatterPoints(c: Ctx, zone: Zone, count: number, gap: number): { r: number; a: number }[] {
  const points: { r: number; a: number }[] = [];
  const { inner, outer } = c.spec;
  for (let attempt = 0; attempt < count * 8 && points.length < count; attempt++) {
    const r = Math.sqrt(inner * inner + c.rng() * (outer * outer - inner * inner));
    if (r < inner + 2 || r > outer - 2 || (r > c.pathIn - 1 && r < c.pathOut + 1)) continue;
    const a = zone.start + c.rng() * zone.length;
    if (points.some((p) => Math.hypot(polarX(p.r, p.a) - polarX(r, a), polarZ(p.r, p.a) - polarZ(r, a)) < gap)) continue;
    points.push({ r, a });
  }
  return points;
}
const zoneArea = (c: Ctx, zone: Zone): number => zone.length * ((c.spec.outer ** 2 - c.spec.inner ** 2) / 2);
const keep = (c: Ctx, plant: Plant): void => {
  if (plant.trunk) c.trunks.push(plant.trunk);
};

function fillForest(c: Ctx, zone: Zone): void {
  for (const p of scatterPoints(c, zone, Math.round(zoneArea(c, zone) / 22), 3.2)) {
    const x = polarX(p.r, p.a);
    const z = polarZ(p.r, p.a);
    const height = range(c.rng, [4.5, 9.5]);
    keep(c, c.rng() < 0.5 ? addPine(c.B, c.rng, x, c.y, z, height * 1.15) : addRoundTree(c.B, c.rng, x, c.y, z, height));
  }
  for (const p of scatterPoints(c, zone, Math.round(zoneArea(c, zone) / 40), 1.5)) addBush(c.B, c.rng, polarX(p.r, p.a), c.y, polarZ(p.r, p.a), range(c.rng, [0.5, 1.1]));
  for (const p of scatterPoints(c, zone, Math.round(zoneArea(c, zone) / 160), 2)) {
    const size = range(c.rng, [0.4, 1.3]);
    c.B.rocks.add(transform(polarX(p.r, p.a), c.y + size * 0.3, polarZ(p.r, p.a), c.rng() * TAU, size, size * 0.7, size), pick(c.rng, ROCKS));
  }
}

// 果園：沿圓周一排排果樹（每排一種水果），排和排之間是草地走道；每排頭放一個水果箱
function fillOrchard(c: Ctx, zone: Zone): void {
  const rows = [...rowRadii(c, 5)];
  rows.forEach((r, i) => {
    const fruit = FRUITS[i % FRUITS.length] ?? 0xd62828;
    const count = Math.floor((zone.length * r) / 5);
    for (let k = 0; k < count; k++) {
      const a = zone.start + ((k + 0.5) / count) * zone.length;
      keep(c, addFruitTree(c.B, c.rng, polarX(r, a), c.y, polarZ(r, a), fruit));
    }
    const crateAngle = zone.start + 2 / r;
    const crate = childGroup(c.props, [polarX(r + 1.6, crateAngle), c.y, polarZ(r + 1.6, crateAngle)], crateAngle);
    box(crate, MAT.wood, [0.6, 0.35, 0.45], [0, 0.175, 0]);
    for (let f = 0; f < 6; f++) c.B.balls.add(transform(polarX(r + 1.6, crateAngle) + spread(c.rng, 0.2), c.y + 0.4, polarZ(r + 1.6, crateAngle) + spread(c.rng, 0.15), 0, 0.11, 0.11, 0.11), fruit);
  });
}
// 步道兩側、離環邊 2 m 內的範圍，每隔 spacing 一條同心圓的半徑
function* rowRadii(c: Ctx, spacing: number): Generator<number> {
  for (let r = c.spec.inner + 2.5; r < c.pathIn - 1.5; r += spacing) yield r;
  for (let r = c.pathOut + 2.5; r < c.spec.outer - 2; r += spacing) yield r;
}

// 花田：一條條同心圓的花帶（每條一個顏色），花帶之間是土；最外側放一座風車
function fillFlowers(c: Ctx, zone: Zone): void {
  let colorIndex = 0;
  for (const r of rowRadii(c, 1.8)) {
    const color = FLOWER_ROWS[colorIndex++ % FLOWER_ROWS.length] ?? 0xe63946;
    const count = Math.floor((zone.length * r) / 0.3);
    for (let k = 0; k < count; k++) {
      const a = zone.start + ((k + c.rng() * 0.6) / count) * zone.length;
      for (const offset of [-0.25, 0.25]) addFlower(c.B, c.rng, polarX(r + offset, a), c.y, polarZ(r + offset, a), color);
    }
    c.build.decor.add(arcAnnulus(r - 0.55, r + 0.55, c.y + 0.012, c.y + 0.03, zone.start, zone.length, MAT.leaves));
  }
  c.build.decor.add(arcAnnulus(c.spec.inner, c.pathIn, c.y, c.y + 0.011, zone.start, zone.length, getShared().soilTop));
  c.build.decor.add(arcAnnulus(c.pathOut, c.spec.outer, c.y, c.y + 0.011, zone.start, zone.length, getShared().soilTop));
  const a = zone.start + zone.length / 2;
  addWindmill(childGroup(c.props, [polarX(c.spec.outer - 5, a), c.y, polarZ(c.spec.outer - 5, a)], a + Math.PI));
}

// 農田：環寬分成幾塊田（麥子、高麗菜、玉米、南瓜輪流），田之間有窄田埂；內側一座紅色穀倉、乾草捆，中間一個稻草人
function fillFarm(c: Ctx, zone: Zone): void {
  const S = getShared();
  const crops = ['wheat', 'cabbage', 'corn', 'pumpkin'] as const;
  const bands: [number, number][] = [[c.spec.inner + 2, c.pathIn - 1], [c.pathOut + 1, c.spec.outer - 2]];
  let cropIndex = 0;
  const barnAngle = zone.start + 9 / c.spec.inner;
  for (const [from, to] of bands) {
    const plots = Math.max(1, Math.round((to - from) / 9));
    const plotWidth = (to - from) / plots;
    for (let p = 0; p < plots; p++) {
      const crop = crops[cropIndex++ % crops.length] ?? 'wheat';
      const r0 = from + p * plotWidth + 0.6;
      const r1 = from + (p + 1) * plotWidth - 0.6;
      c.build.decor.add(arcAnnulus(r0, r1, c.y, c.y + 0.012, zone.start, zone.length, S.furrows));
      for (let r = r0 + 0.4; r < r1; r += crop === 'wheat' ? 0.35 : 1) {
        const spacing = crop === 'wheat' ? 0.3 : crop === 'pumpkin' ? 1.4 : 0.8;
        const count = Math.floor((zone.length * r) / spacing);
        for (let k = 0; k < count; k++) {
          const a = zone.start + ((k + c.rng() * 0.5) / count) * zone.length;
          // 穀倉那一塊不種
          if (from < c.pathIn && Math.abs(a - barnAngle) * r < 7 && r < c.spec.inner + 10) continue;
          addCrop(c, crop, polarX(r, a), polarZ(r, a));
        }
      }
    }
  }
  addBarn(childGroup(c.props, [polarX(c.spec.inner + 5.5, barnAngle), c.y, polarZ(c.spec.inner + 5.5, barnAngle)], barnAngle));
  for (let k = 0; k < 4; k++) {
    const a = barnAngle + (4 + k * 1.6) / c.spec.inner;
    const bale = childGroup(c.props, [polarX(c.spec.inner + 3, a), c.y, polarZ(c.spec.inner + 3, a)], a);
    addMesh(bale, new THREE.CylinderGeometry(0.6, 0.6, 1.1, 14).rotateZ(Math.PI / 2), MAT.straw, [0, 0.6, 0]);
  }
  const scare = zone.start + zone.length * 0.6;
  addScarecrow(childGroup(c.props, [polarX(c.pathOut + 5, scare), c.y, polarZ(c.pathOut + 5, scare)], scare));
}
function addCrop(c: Ctx, crop: 'wheat' | 'cabbage' | 'corn' | 'pumpkin', x: number, z: number): void {
  const { B, rng, y } = c;
  if (crop === 'wheat') {
    B.thin.add(transform(x, y, z, rng() * TAU, 0.05, range(rng, [0.8, 1.05]), 0.05), pick(rng, [0xd9b45a, 0xe2c26b, 0xc9a24a]));
  } else if (crop === 'cabbage') {
    B.balls.add(transform(x, y + 0.2, z, rng() * TAU, 0.28, 0.22, 0.28), pick(rng, [0x8cc27a, 0x7ab56a, 0x9fd08c]));
  } else if (crop === 'corn') {
    const height = range(rng, [1.6, 2.1]);
    B.posts.add(transform(x, y, z, rng() * TAU, 0.06, height, 0.06), 0x5f8a3c);
    B.thin.add(transform(x, y + height * 0.45, z, rng() * TAU, 0.35, 0.6, 0.06, 0.6), 0x6aa04a);
    B.balls.add(transform(x + 0.08, y + height * 0.6, z, 0, 0.06, 0.16, 0.06), 0xf2d43b);
  } else {
    const size = range(rng, [0.3, 0.45]);
    B.balls.add(transform(x, y + size * 0.6, z, rng() * TAU, size, size * 0.75, size), pick(rng, [0xf28c28, 0xe07a1f, 0xf5a03a]));
    B.blobs.add(transform(x + 0.4, y + 0.1, z + 0.2, rng() * TAU, 0.25, 0.1, 0.25), 0x5f9a4c);
  }
}

// 草原：野花、蜂箱、一棵大樹、長椅
function fillMeadow(c: Ctx, zone: Zone): void {
  for (const p of scatterPoints(c, zone, Math.round(zoneArea(c, zone) / 3), 0.5)) addFlower(c.B, c.rng, polarX(p.r, p.a), c.y, polarZ(p.r, p.a), pick(c.rng, FLOWER_ROWS));
  const a = zone.start + zone.length / 2;
  const r = c.pathOut + 8;
  keep(c, addRoundTree(c.B, c.rng, polarX(r, a), c.y, polarZ(r, a), 12));
  for (let k = 0; k < 4; k++) {
    const ha = a + (k - 1.5) * (2.2 / (c.pathIn - 5));
    addBeehive(childGroup(c.props, [polarX(c.pathIn - 5, ha), c.y, polarZ(c.pathIn - 5, ha)], ha));
  }
}

// ---------- 建物與小東西（合併網格，各自一個碰撞外框） ----------
const lambert = (color: number): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color });
const MAT = {
  wood: lambert(0x9c7a52), darkWood: lambert(0x6e5440), red: lambert(0xa8332a), white: lambert(0xf4efe6), roof: lambert(0x4a4a4a),
  straw: lambert(0xd9b45a), leaves: lambert(0x4f8a3c), cloth: lambert(0x3f6b55), iron: lambert(0x2e3338), glow: new THREE.MeshBasicMaterial({ color: 0xfff1c9 }), hive: lambert(0xf2e6c9), concrete: lambert(0xd9d6d0), cone: lambert(0xf26b1d), crack: lambert(0x3a2818),
};

// 紅色穀倉：牆、白色收邊、斜屋頂、大門與交叉木條。自身 +z 朝外（田那側）。
function addBarn(g: THREE.Group): void {
  skipCollider(g);
  markCollider(g, [7.2, 6.5, 6.2], [0, 3.25, 0]);
  box(g, MAT.red, [7, 4, 6], [0, 2, 0]);
  for (const x of [-3.5, 3.5]) box(g, MAT.white, [0.2, 4, 6.05], [x, 2, 0]);
  const slope = Math.atan2(2.4, 3.6);
  for (const side of [-1, 1]) box(g, MAT.roof, [7.6, 0.18, Math.hypot(2.4, 3.6)], [0, 4 + 1.2, side * 1.8], [side * slope, 0, 0]);
  const gable = new THREE.Shape([new THREE.Vector2(-3, 0), new THREE.Vector2(3, 0), new THREE.Vector2(0, 2.4)]);
  for (const side of [-1, 1]) addMesh(g, new THREE.ShapeGeometry(gable), MAT.red, [side * 3.51, 4, 0], [0, side * Math.PI / 2, 0]);
  box(g, MAT.white, [2.6, 3, 0.12], [0, 1.5, 3.03]);
  box(g, MAT.red, [2.3, 2.7, 0.14], [0, 1.4, 3.05]);
  for (const s of [-1, 1]) box(g, MAT.white, [0.12, 3.3, 0.16], [0, 1.4, 3.08], [0, 0, s * 0.68]);
}

function addWindmill(g: THREE.Group): void {
  skipCollider(g);
  markCollider(g, [3.2, 9, 3.2], [0, 4.5, 0]);
  addMesh(g, new THREE.CylinderGeometry(1.1, 1.7, 8, 8), MAT.white, [0, 4, 0]);
  addMesh(g, new THREE.ConeGeometry(1.5, 1.8, 8), MAT.darkWood, [0, 8.9, 0]);
  box(g, MAT.darkWood, [0.9, 1.6, 0.12], [0, 0.8, 1.55]);
  const hub = childGroup(g, [0, 7.4, 1.4]);
  hub.rotation.z = 0.4;
  cylinder(hub, MAT.iron, 0.25, 0.4, [0, 0, 0], 10, [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 4; k++) {
    const blade = childGroup(hub, [0, 0, 0.15]);
    blade.rotation.z = (k * Math.PI) / 2;
    box(blade, MAT.wood, [0.15, 4.2, 0.08], [0, 2.2, 0]);
    box(blade, MAT.white, [0.9, 3.4, 0.04], [0.5, 2.5, 0.02]);
  }
}

function addScarecrow(g: THREE.Group): void {
  skipCollider(g);
  markCollider(g, [0.4, 2.2, 0.4], [0, 1.1, 0]);
  rod(g, MAT.darkWood, [0, 0, 0], [0, 2, 0], 0.05, 0.05, 6);
  rod(g, MAT.darkWood, [-0.8, 1.5, 0], [0.8, 1.5, 0], 0.04, 0.04, 6);
  box(g, MAT.cloth, [0.6, 0.7, 0.3], [0, 1.35, 0]);
  addMesh(g, new THREE.SphereGeometry(0.22, 12, 8), MAT.straw, [0, 1.95, 0]);
  addMesh(g, new THREE.ConeGeometry(0.4, 0.35, 12), MAT.straw, [0, 2.2, 0]);
}

function addBeehive(g: THREE.Group): void {
  box(g, MAT.darkWood, [0.6, 0.3, 0.6], [0, 0.15, 0]);
  for (let k = 0; k < 3; k++) box(g, MAT.hive, [0.55, 0.25, 0.5], [0, 0.42 + k * 0.26, 0]);
  box(g, MAT.white, [0.65, 0.06, 0.6], [0, 1.2, 0]);
}

function addLantern(g: THREE.Group): void {
  skipCollider(g);
  markCollider(g, [0.25, 1.6, 0.25], [0, 0.8, 0]);
  rod(g, MAT.iron, [0, 0, 0], [0, 1.4, 0], 0.04, 0.03, 6);
  box(g, MAT.glow, [0.22, 0.28, 0.22], [0, 1.55, 0]);
  addMesh(g, new THREE.ConeGeometry(0.2, 0.18, 4), MAT.iron, [0, 1.78, 0], [0, Math.PI / 4, 0]);
}

function addGardenBench(g: THREE.Group): void {
  for (const z of [-0.12, 0.02, 0.16]) box(g, MAT.wood, [1.6, 0.04, 0.12], [0, 0.45, z]);
  for (const y of [0.6, 0.75]) box(g, MAT.wood, [1.6, 0.1, 0.03], [0, y, -0.22]);
  for (const x of [-0.7, 0.7]) box(g, MAT.iron, [0.05, 0.45, 0.42], [x, 0.225, 0]);
}

// 木頭圍籬：沿半徑 radius 從 start 到 start + length，柱子加兩道橫木；碰撞是一段圓形牆
function addFence(c: Ctx, radius: number, start: number, length: number, solid: 'inside' | 'outside'): void {
  const posts = Math.max(2, Math.round((length * radius) / 2.4));
  for (let k = 0; k <= posts; k++) {
    const a = start + (length * k) / posts;
    c.B.posts.add(transform(polarX(radius, a), c.y, polarZ(radius, a), a, 0.12, 1.1, 0.12), 0x7a5a3c);
  }
  for (const height of [0.45, 0.9]) {
    addMesh(c.props, new THREE.TorusGeometry(radius, 0.05, 4, Math.max(8, Math.round(length * radius / 2)), length).rotateX(Math.PI / 2), MAT.wood, [0, c.y + height, 0], [0, start + length - Math.PI / 2, 0]);
  }
  c.build.walls.push({ radius, minY: c.y, maxY: c.y + 1.1, solid, arc: { start, length } });
}

// ---------- 碎片 ----------
// 不動的碎片：每組實例算一個世界座標的外框（站得上去），不放進飄動清單，每格不用更新矩陣。
const partBounds = new THREE.Box3();
function addStatic(build: PropsBuild, colliders: Part[][]): void {
  for (const group of colliders) {
    const bounds = new THREE.Box3();
    for (const part of group) {
      part.batch.geometry.boundingBox ?? part.batch.geometry.computeBoundingBox();
      const geometryBounds = part.batch.geometry.boundingBox;
      if (geometryBounds) bounds.union(partBounds.copy(geometryBounds).applyMatrix4(part.base));
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    build.solids.push({ ...orientedSolid(center.x, center.z, 0, size.x, size.z, bounds.min.y, bounds.max.y), standable: true });
  }
}
// 缺口裡的碎土塊：從兩邊斷口往中間，越來越小、越稀、偏離越多；彼此不重疊（以外接圓檢查）。
// 每塊是土塊加一層草皮，部分上面長樹、灌木或花；貼著斷口的幾塊不動，其餘上下飄（樹跟著一起飄）。
function addFragments(c: Ctx, gapStart: number, gapLength: number): void {
  const { spec, rng } = c;
  const middle = (spec.inner + spec.outer) / 2;
  const halfGap = (gapLength / 2) * middle;
  const placed: { x: number; y: number; z: number; r: number }[] = [];
  for (const side of [1, -1]) {
    const edge = side > 0 ? gapStart : gapStart + gapLength;
    let traveled = 2;
    while (traveled < halfGap) {
      const progress = traveled / halfGap;
      const size = FRAGMENT.large * (FRAGMENT.small / FRAGMENT.large) ** progress;
      for (let r = spec.inner + size / 2; r < spec.outer - size / 3; r += size * range(rng, FRAGMENT.step)) {
        if (rng() < FRAGMENT.base + progress * FRAGMENT.sparse) continue;
        const theta = edge + (side * (traveled + size / 2 + spread(rng, size * 0.2))) / r;
        const y = spec.maxY - FRAGMENT.thickness / 2 + spread(rng, progress * FRAGMENT.drift);
        const x = polarX(r, theta);
        const z = polarZ(r, theta);
        const reach = size * 0.55;
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r + reach) * FRAGMENT.spacing && Math.abs(p.y - y) < 4)) continue;
        placed.push({ x, y, z, r: reach });
        addFragment(c, x, y, z, size, progress);
      }
      traveled += size * range(rng, FRAGMENT.step);
    }
  }
}
function addFragment(c: Ctx, x: number, y: number, z: number, size: number, progress: number): void {
  const { F: B, rng, spec } = c;
  const batch = pick(rng, B.slabs);
  const yaw = rng() * TAU;
  const tilt = progress * FRAGMENT.tilt;
  const tiltX = spread(rng, tilt);
  const tiltZ = spread(rng, tilt);
  const top = y + FRAGMENT.thickness / 2;
  const soil = batch.add(transform(x, y, z, yaw, size * 0.5, FRAGMENT.thickness, size * 0.5, tiltX, tiltZ), SOIL);
  const turf = batch.add(transform(x, top + 0.05, z, yaw, size * 0.47, 0.12, size * 0.47, tiltX, tiltZ), pick(rng, [0x6aa864, 0x77b46f, 0x5fa85d]));
  const parts = [soil, turf];
  const colliders: Part[][] = [[soil, turf]];
  if (rng() < FRAGMENT.plantChance && Math.abs(tiltX) + Math.abs(tiltZ) < 0.25) {
    const kind = rng();
    if (kind < 0.45 && size > 4) {
      const plant = rng() < 0.5 ? addPine(B, rng, x, top + 0.1, z, range(rng, [3, 5.5])) : addRoundTree(B, rng, x, top + 0.1, z, range(rng, [3, 5]));
      parts.push(...plant.parts);
      if (plant.trunk) colliders.push([plant.trunk]);
    } else if (kind < 0.75) {
      for (let k = 0; k < 3; k++) parts.push(addBush(B, rng, x + spread(rng, size * 0.2), top + 0.1, z + spread(rng, size * 0.2), range(rng, [0.4, 0.8])));
    } else {
      for (let k = 0; k < 14; k++) parts.push(addFlower(B, rng, x + spread(rng, size * 0.25), top + 0.1, z + spread(rng, size * 0.25), pick(rng, FLOWER_ROWS)));
    }
  }
  if (progress > FRAGMENT.floatFrom) addFloater(c.build, rng, spec.bobScale, parts, colliders);
  else addStatic(c.build, colliders);
}

// 斷口的碎裂樣式：每一段鋸齒的缺口裡卡一塊半脫落的土塊（往下沉、歪一點，上面還有草皮），
// 地面從斷口往內拉幾道之字形的深色裂縫。dir 是往完整段的方向（+1 角度變大）。
function addBreakEdge(c: Ctx, edge: number, dir: number, profile: EdgeProfile): void {
  const { F: B, rng, spec } = c;
  for (let k = 0; k < profile.radii.length - 1; k++) {
    const r0 = profile.radii[k] ?? spec.outer;
    const r1 = profile.radii[k + 1] ?? spec.inner;
    const rm = (r0 + r1) / 2;
    const bite = ((profile.depths[k] ?? 0) + (profile.depths[k + 1] ?? 0)) / 2;
    const size = Math.min(range(rng, EDGE_CHUNK.size), Math.abs(r0 - r1) * 1.1);
    // 土塊中心在缺口裡（斷口和鋸齒之間），一半卡在環本體上
    const theta = edge + (dir * Math.max(0.5, bite - size * 0.35)) / rm;
    const x = polarX(rm + spread(rng, 1.5), theta);
    const z = polarZ(rm + spread(rng, 1.5), theta);
    const y = spec.maxY - FRAGMENT.thickness / 2 - range(rng, EDGE_CHUNK.drop);
    const batch = pick(rng, B.slabs);
    const yaw = rng() * TAU;
    const tiltX = spread(rng, EDGE_CHUNK.tilt);
    const tiltZ = spread(rng, EDGE_CHUNK.tilt);
    const soil = batch.add(transform(x, y, z, yaw, size * 0.5, FRAGMENT.thickness, size * 0.5, tiltX, tiltZ), SOIL);
    const turf = batch.add(transform(x, y + FRAGMENT.thickness / 2 + 0.05, z, yaw, size * 0.47, 0.12, size * 0.47, tiltX, tiltZ), pick(rng, [0x6aa864, 0x77b46f, 0x5fa85d]));
    const parts = [soil, turf];
    if (rng() < 0.4) parts.push(addBush(B, rng, x, y + FRAGMENT.thickness / 2 + 0.1, z, range(rng, [0.4, 0.8])));
    addStatic(c.build, [[soil, turf]]);
  }
  for (let k = 0; k < CRACK.perEdge; k++) {
    let r = spec.inner + 2 + rng() * (spec.outer - spec.inner - 4);
    let along = 0.3;
    const reach = range(rng, CRACK.reach);
    let heading = spread(rng, 0.8);
    while (along < reach) {
      heading += spread(rng, 0.7);
      const step = CRACK.segment;
      const nextAlong = along + Math.cos(heading) * step;
      const nextR = r + Math.sin(heading) * step;
      const a0 = edge + (dir * along) / r;
      const a1 = edge + (dir * nextAlong) / nextR;
      const from = new THREE.Vector3(polarX(r, a0), spec.maxY + 0.02, polarZ(r, a0));
      const to = new THREE.Vector3(polarX(nextR, a1), spec.maxY + 0.02, polarZ(nextR, a1));
      const middle = from.clone().add(to).multiplyScalar(0.5);
      const crack = addMesh(c.props, new THREE.BoxGeometry(CRACK.width * (1 - along / reach) + 0.04, 0.02, from.distanceTo(to) + 0.05), MAT.crack, [middle.x, middle.y, middle.z]);
      crack.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      along = Math.max(along + 0.4, nextAlong);
      r = Math.min(spec.outer - 1, Math.max(spec.inner + 1, nextR));
    }
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
// 紅白斜紋（護欄上半段）
function drawHazard(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#d23b2f' : '#f4f1ea';
    ctx.fillRect(i * 8, 0, 8, 8);
  }
}
let warningMaterials: { sign: THREE.MeshLambertMaterial; hazard: THREE.MeshLambertMaterial } | null = null;
function getWarningMaterials(): { sign: THREE.MeshLambertMaterial; hazard: THREE.MeshLambertMaterial } {
  warningMaterials ??= { sign: mapped(pixelTexture(256, 160, drawWarningSign)), hazard: mapped(pixelTexture(64, 8, drawHazard)) };
  return warningMaterials;
}

// 斷口前的施工警告：離斷口 WARNING.at 公尺一排紐澤西護欄（步道那段留缺口，走得到斷口），護欄前後幾支交通錐，
// 步道兩側各一面「前方斷裂」警告牌，面向走過來的人。dir 是往完整段的方向（+1 角度變大）。
const WARNING = { at: 15, barrierLength: 1.9, opening: 4, cones: 8 };
function addWarningSite(c: Ctx, edge: number, dir: number): void {
  const { props, rng, spec, y } = c;
  const W = getWarningMaterials();
  const middle = (spec.inner + spec.outer) / 2;
  const at = (meters: number, radius: number): number => edge + (dir * meters) / radius;
  for (let r = spec.inner + 1.2; r < spec.outer - 1; r += WARNING.barrierLength + 0.15) {
    if (Math.abs(r - middle) < WARNING.opening / 2 + 0.8) continue;
    const g = childGroup(props, [polarX(r, at(WARNING.at, r)), y, polarZ(r, at(WARNING.at, r))], at(WARNING.at, r));
    box(g, MAT.concrete, [0.6, 0.35, WARNING.barrierLength], [0, 0.175, 0]);
    box(g, W.hazard, [0.3, 0.55, WARNING.barrierLength], [0, 0.62, 0]);
  }
  for (let k = 0; k < WARNING.cones; k++) {
    const r = middle + spread(rng, WARNING.opening * 1.8);
    const g = childGroup(props, [polarX(r, at(WARNING.at - 1.5 - rng() * 2.5, r)), y, polarZ(r, at(WARNING.at - 1.5 - rng() * 2.5, r))]);
    skipCollider(g);
    box(g, MAT.iron, [0.42, 0.04, 0.42], [0, 0.02, 0]);
    rod(g, MAT.cone, [0, 0.04, 0], [0, 0.75, 0], 0.17, 0.03, 10);
    cylinder(g, MAT.white, 0.115, 0.08, [0, 0.42, 0], 10);
  }
  for (const side of [-1, 1]) {
    const r = middle + side * (WARNING.opening / 2 + 1.2);
    const angle = at(WARNING.at + 3, r);
    const sign = childGroup(props, [polarX(r, angle), y, polarZ(r, angle)], angle);
    skipCollider(sign);
    markCollider(sign, [0.3, 2.4, 1.4], [0, 1.2, 0]);
    for (const z of [-0.6, 0.6]) rod(sign, MAT.iron, [0, 0, z], [0, 2.4, z], 0.04, 0.04, 6);
    // 自身 x 沿圓周（角度變大的方向）；牌面朝走過來的人（往完整段那一側）
    addMesh(sign, new THREE.PlaneGeometry(1.6, 1), W.sign, [dir * 0.05, 1.8, 0], [0, dir * Math.PI / 2, 0]);
  }
}

/** 田園環：土壤色的環，2/3 是分區的田園（森林、果園、花田、農田、草原）、1/3 碎成飄著的土塊。 */
export function buildGardenRing(spec: RingSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  const S = getShared();
  const B = createBatches(S);
  const F = createBatches(S);
  const gapLength = TAU * BROKEN_SHARE;
  const gapStart = rng() * TAU;
  const start = gapStart + gapLength;
  const length = TAU - gapLength;
  const edges = addBody(build, rng, spec, start, length);
  const middle = (spec.inner + spec.outer) / 2;
  const pathIn = middle - PATH_WIDTH / 2;
  const pathOut = middle + PATH_WIDTH / 2;
  const props = new THREE.Group();
  const c: Ctx = { build, B, F, props, rng, spec, y: spec.maxY, pathIn, pathOut, trunks: [] };

  // 地面：步道與各區的草地（花田、農田自己鋪土）；斷口附近 EDGE_CLEAR 公尺是普通草地
  const clear = EDGE_CLEAR / spec.inner;
  const usable = length - 2 * clear;
  build.decor.add(arcAnnulus(pathIn, pathOut, spec.maxY, spec.maxY + 0.015, start + clear, usable, S.path));
  let cursor = start + clear;
  const zones: Zone[] = ZONES.map(({ kind, share }) => {
    const zone = { kind, start: cursor, length: usable * share };
    cursor += zone.length;
    return zone;
  });
  for (const zone of zones) {
    const ground = zone.kind === 'forest' ? S.forest : zone.kind === 'meadow' ? S.meadow : S.grass;
    if (zone.kind !== 'flowers') {
      for (const [from, to] of [[spec.inner, pathIn], [pathOut, spec.outer]] as const) build.decor.add(arcAnnulus(from, to, spec.maxY, spec.maxY + 0.01, zone.start, zone.length, ground));
    }
  }
  // 斷口附近：草地延伸到鋸齒（鋸齒處的草地在環本體上，用土壤頂面接起來）
  // 草地要停在最深的鋸齒之內（不然會蓋過缺口、懸在空中）：起點那頭從 start + 咬深開始，終點那頭到 end - 咬深為止
  // 拆成幾圈：每圈用自己的內半徑算「咬深」換成的角度，外圈才不會空出一大片土
  const bands = 6;
  for (let k = 0; k < bands; k++) {
    const from = spec.inner + ((spec.outer - spec.inner) * k) / bands;
    const to = spec.inner + ((spec.outer - spec.inner) * (k + 1)) / bands;
    const bite = (EDGE_DEPTH[1] + 0.5) / from;
    build.decor.add(arcAnnulus(from, to, spec.maxY, spec.maxY + 0.01, start + bite, clear - bite, S.meadow));
    build.decor.add(arcAnnulus(from, to, spec.maxY, spec.maxY + 0.01, start + length - clear, clear - bite, S.meadow));
  }

  const fill: Record<ZoneKind, (c: Ctx, zone: Zone) => void> = { forest: fillForest, orchard: fillOrchard, flowers: fillFlowers, farm: fillFarm, meadow: fillMeadow };
  for (const zone of zones) fill[zone.kind](c, zone);

  // 步道：兩側每 20 m 一盞庭園燈，每 45 m 一張長椅
  for (let a = start + clear; a < start + clear + usable; a += 20 / middle) {
    for (const side of [-1, 1]) addLantern(childGroup(props, [polarX(middle + side * (PATH_WIDTH / 2 + 0.4), a), spec.maxY, polarZ(middle + side * (PATH_WIDTH / 2 + 0.4), a)]));
  }
  for (let a = start + clear + 10 / middle; a < start + clear + usable; a += 45 / middle) {
    addGardenBench(childGroup(props, [polarX(pathIn - 0.8, a), spec.maxY, polarZ(pathIn - 0.8, a)], a));
  }
  // 圍籬：內外兩側，斷口前 EDGE_CLEAR 停
  addFence(c, spec.inner + 0.3, start + clear, usable, 'inside');
  addFence(c, spec.outer - 0.3, start + clear, usable, 'outside');

  addFragments(c, gapStart, gapLength);
  addBreakEdge(c, start, 1, edges.startEdge);
  addBreakEdge(c, start + length, -1, edges.endEdge);
  addWarningSite(c, start, 1);
  addWarningSite(c, start + length, -1);

  // 樹幹的碰撞（樹冠在頭上不擋）
  for (const trunk of c.trunks) {
    const position = new THREE.Vector3().setFromMatrixPosition(trunk.base);
    const scale = new THREE.Vector3().setFromMatrixScale(trunk.base);
    build.solids.push(orientedSolid(position.x, position.z, 0, scale.x * 2, scale.z * 2, position.y, position.y + scale.y));
  }
  for (const batch of [B, F].flatMap((set) => [set.trunks, set.crowns, set.blobs, set.cones, set.thin, set.balls, set.rocks, set.posts, ...set.slabs])) {
    const mesh = batch.build();
    if (mesh) build.decor.add(mesh);
  }
  markChildGroups(props);
  build.solids.push(...collectColliders(props));
  build.decor.add(bakeByMaterial(props));
  disposeGeometries(props);
  return build;
}

