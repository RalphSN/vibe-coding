// OZ 世界的住宅區：房屋環（有街道的街區）與漂浮房屋環。
// 房屋牆面貼有窗戶的外牆（一般房屋兩層、高樓五層）、屋頂貼屋瓦、朝街的那面有門，部分房子有煙囪；
// 房屋環中間是一條 7 m 的柏油路（白色邊線、中央虛線、斑馬線），兩側人行道（路緣石、行道樹、路燈、消防栓、郵筒、長椅），
// 房屋蓋在兩側的草地上。房子很多，所以牆、屋頂、門、煙囪都用 InstancedMesh（Batch），街道設施合併網格。
import * as THREE from 'three';
import { Batch, addFloater, annulus, bakeByMaterial, createRng, emptyBuild, orientedSolid, shinyMaterial, type Part, type PropsBuild, type RingSpec } from './oz-props';
import {
  TAU, addMesh, box, childGroup, collectColliders, cylinder, disposeGeometries, lambert, mapped, markChildGroups, pixelTexture, planarUv, range, rod,
  skipCollider, markCollider, type Range, type Rng, type Vec3,
} from './oz-kit';

type Matrix6 = [number, number, number, number, number, number];

// 房屋（以人物 1.83 m 為準）
const HOUSE_WIDTH: Range = [4, 8];
const HOUSE_HEIGHT: Range = [3, 8];
const TOWER_HEIGHT: Range = [10, 18];
const TOWER_CHANCE = 0.1;              // 高樓是平頂，不加屋頂
const HOUSE_GAP: Range = [1, 3];
const HOUSE_ROW_DEPTH: Range = [5, 8];
const HOUSE_ROW_GAP: Range = [1, 2.5];
const HOUSE_EDGE = 1;
const ROOF_OVERHANG = 1.08;
const ROOF_RATIO: Range = [0.3, 0.6];
const CHIMNEY_CHANCE = 0.4;
const DOOR = { width: 0.95, height: 2.05, depth: 0.08 };
const FLOATING_HOUSE_AREA = 260;
const FLOATING_HOUSE_RISE: Range = [-6, 10];
const FLOATING_HOUSE_TILT = 0.35;
const PLACE_ATTEMPTS = 30;
// 街道剖面（從環中線往兩側，m）
const STREET = { asphalt: 3.5, sidewalk: 6, curb: 0.12, plot: 6.5, edgeLine: 3.2, dash: 3, dashGap: 3 };
const STREET_PROPS = { lampSpacing: 22, treeSpacing: 22, hydrantSpacing: 60, mailboxSpacing: 75, benchSpacing: 50, crosswalkSpacing: 95 };

const WALL_COLORS = [0xf4efe6, 0xf2d9c4, 0xdfe8f0, 0xe8e0f2, 0xf6e7b8, 0xd7ecd9, 0xf3c9c9, 0xcfd6e0];
const ROOF_COLORS = [0xb5523b, 0x8a4b3a, 0x4f6d8f, 0x3f6b55, 0xc97b3c, 0x5c5470];
const DOOR_COLORS = [0x6e4a2f, 0x2f4b7c, 0x8c2f39, 0x3f6b55, 0x2b2b2b, 0xf4efe6];

const range01 = (rng: Rng): number => rng();
const pick = <T>(rng: Rng, items: readonly T[], fallback: T): T => items[Math.floor(range01(rng) * items.length)] ?? fallback;
const polar = (r: number, theta: number): [number, number] => [r * Math.sin(theta), r * Math.cos(theta)];

function transform(x: number, y: number, z: number, yaw: number, tiltX: number, tiltZ: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, yaw, tiltZ, 'YXZ')), new THREE.Vector3(sx, sy, sz));
}
// 在房子（單位方塊縮放過的矩陣）上，用房子自己的座標放一個不跟著房子縮放的零件。
const onHouse = (body: THREE.Matrix4, w: number, h: number, d: number, local: Vec3, size: Vec3): THREE.Matrix4 =>
  body.clone()
    .multiply(new THREE.Matrix4().makeTranslation(local[0] / w, local[1] / h, local[2] / d))
    .multiply(new THREE.Matrix4().makeScale(size[0] / w, size[1] / h, size[2] / d));

// ---------- 貼圖 ----------
// 外牆：淺色牆面（實例顏色會乘上去變成各色房子），規律的窗戶；左上角留一塊沒有窗戶的牆，頂面、底面的貼圖座標都指到那裡。
const drawFacade = (columns: number, rows: number) => (ctx: CanvasRenderingContext2D): void => {
  ctx.fillStyle = '#f7f4ef';
  ctx.fillRect(0, 0, 256, 256);
  const rng = createRng(columns * 10 + rows);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(rng() * 256, rng() * 256, 2, 2);
  }
  const cellW = 256 / columns;
  const cellH = 220 / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const w = cellW * 0.5;
      const h = cellH * 0.55;
      const x = col * cellW + (cellW - w) / 2;
      const y = 30 + row * cellH + (cellH - h) / 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
      const glass = ctx.createLinearGradient(x, y, x + w, y + h);
      glass.addColorStop(0, '#6f8fb0');
      glass.addColorStop(0.5, '#9fbbd6');
      glass.addColorStop(1, '#4f6f90');
      ctx.fillStyle = glass;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
      ctx.fillRect(x, y + h / 2 - 1.5, w, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x - 5, y + h + 3, w + 10, 4);
    }
  }
  ctx.fillStyle = '#f7f4ef';
  ctx.fillRect(0, 0, 24, 24);
};
// 屋瓦：一排排錯開的瓦片，淺灰底（實例顏色決定屋頂顏色）
function drawRoofTiles(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 8; col++) {
      const x = col * 16 + (row % 2) * 8;
      const shade = 200 + ((row * 7 + col * 13) % 5) * 10;
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      ctx.fillRect(x + 1, row * 16 + 1, 14, 13);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 1, row * 16 + 13, 14, 2);
    }
  }
}
const drawSpeckled = (base: string, colors: string[], count: number) => (ctx: CanvasRenderingContext2D): void => {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const rng = createRng(count);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)] ?? base;
    ctx.fillRect(rng() * 256, rng() * 256, 1 + rng() * 2, 1 + rng() * 2);
  }
};
function drawSidewalk(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#a7adb3';
  ctx.fillRect(0, 0, 256, 256);
  const rng = createRng(77);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = ['#d2d5d8', '#cbcfd2', '#d8dadd'][Math.floor(rng() * 3)] ?? '#d2d5d8';
      ctx.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    }
  }
}

// 牆用的單位方塊：底面在 y = 0；頂面、底面的貼圖座標指到外牆貼圖左上角沒有窗戶的那一塊。
function facadeBox(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const uv = geometry.getAttribute('uv');
  for (let i = 8; i < 16; i++) uv.setXY(i, 0.04, 0.96);   // BoxGeometry 的面順序：+x、-x、+y、-y、+z、-z，每面 4 個頂點
  return geometry;
}

function createTownMaterials() {
  const roofMap = pixelTexture(128, 128, drawRoofTiles);
  roofMap.repeat.set(3, 3);
  return {
    house: mapped(pixelTexture(256, 256, drawFacade(3, 2))),
    tower: mapped(pixelTexture(256, 256, drawFacade(4, 5))),
    roof: mapped(roofMap),
    plain: lambert(0xffffff),
    asphalt: mapped(pixelTexture(256, 256, drawSpeckled('#4a4d52', ['#3f4246', '#56595e', '#5f6267', '#3a3c40'], 9000))),
    lawn: mapped(pixelTexture(256, 256, drawSpeckled('#6aa864', ['#5e9c58', '#77b46f', '#549050', '#82bd78'], 8000))),
    sidewalk: mapped(pixelTexture(256, 256, drawSidewalk)),
    curb: lambert(0xc3c7cb),
    paint: lambert(0xf4f4f4),
    yellowPaint: lambert(0xf2c200),
    base: lambert(0x9aa1a8),
    darkMetal: shinyMaterial(0x2e3338, 0.6, 0.45),
    metal: shinyMaterial(0xd5dae0, 0.85, 0.3),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c9 }),
    hydrant: lambert(0xc0392b),
    mailbox: lambert(0x2f6b3f),
    wood: lambert(0x9c7a52),
    trunk: lambert(0x7a5a3c),
    leaves: lambert(0x5fa85d, { flatShading: true }),
    planter: lambert(0xb8afa4),
  };
}
type TownMaterials = ReturnType<typeof createTownMaterials>;
let townMaterials: TownMaterials | null = null;
function getTownMaterials(): TownMaterials {
  townMaterials ??= createTownMaterials();
  return townMaterials;
}

interface HouseBatches { walls: Batch; towers: Batch; roofs: Batch; doors: Batch; chimneys: Batch }

function createHouseBatches(M: TownMaterials): HouseBatches {
  const wall = facadeBox();
  return {
    walls: new Batch(wall, M.house), towers: new Batch(wall, M.tower),
    roofs: new Batch(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]), { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5), M.roof),
    doors: new Batch(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), M.plain),
    chimneys: new Batch(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), M.plain),
  };
}

interface HouseShape { width: number; height: number; depth: number; isTower: boolean }

function randomHouse(rng: Rng): { width: number; height: number; isTower: boolean; turned: boolean } {
  const isTower = rng() < TOWER_CHANCE;
  return { width: range(rng, HOUSE_WIDTH), height: range(rng, isTower ? TOWER_HEIGHT : HOUSE_HEIGHT), isTower, turned: rng() < 0.5 };
}

// 一棟房子：外牆、屋瓦屋頂（高樓平頂）、門（door 給門在房子自身座標的哪一面：[x 方向, z 方向]，例如 [0, 1] 是 +z 那面）、煙囪。
function addHouse(rng: Rng, B: HouseBatches, args: Matrix6, shape: HouseShape, door: [number, number]): Part[] {
  const { width, height, depth, isTower } = shape;
  const body = transform(...args, width, height, depth);
  const parts = [(isTower ? B.towers : B.walls).add(body, pick(rng, WALL_COLORS, 0xffffff))];
  const [dx, dz] = door;
  const doorPosition: Vec3 = [dx * (width / 2 + 0.02), 0, dz * (depth / 2 + 0.02)];
  const doorSize: Vec3 = dx !== 0 ? [DOOR.depth, DOOR.height, DOOR.width] : [DOOR.width, DOOR.height, DOOR.depth];
  parts.push(B.doors.add(onHouse(body, width, height, depth, doorPosition, doorSize), pick(rng, DOOR_COLORS, 0x6e4a2f)));
  if (isTower) return parts;
  const roofHeight = Math.min(width, depth) * range(rng, ROOF_RATIO);
  const roofColor = pick(rng, ROOF_COLORS, 0xb5523b);
  parts.push(B.roofs.add(body.clone()
    .multiply(new THREE.Matrix4().makeTranslation(0, 1, 0))
    .multiply(new THREE.Matrix4().makeScale(ROOF_OVERHANG, roofHeight / height, ROOF_OVERHANG)), roofColor));
  if (rng() < CHIMNEY_CHANCE) {
    const side = rng() < 0.5 ? -1 : 1;
    parts.push(B.chimneys.add(onHouse(body, width, height, depth, [side * width * 0.22, height + roofHeight * 0.25, depth * 0.15], [0.55, roofHeight * 0.75 + 0.6, 0.55]), 0x9c5a4a));
  }
  return parts;
}

function addHouseBatches(group: THREE.Group, B: HouseBatches): void {
  for (const batch of [B.walls, B.towers, B.roofs, B.doors, B.chimneys]) {
    const mesh = batch.build();
    if (mesh) group.add(mesh);
  }
}

// ---------- 街道設施 ----------
const onRing = (parent: THREE.Object3D, radius: number, y: number, angle: number, flip = false): THREE.Group =>
  childGroup(parent, [radius * Math.sin(angle), y, radius * Math.cos(angle)], angle + (flip ? Math.PI : 0));
const anglesEvery = (radius: number, spacing: number, offset = 0): number[] => {
  const count = Math.max(1, Math.round((TAU * radius) / spacing));
  return Array.from({ length: count }, (_, i) => offset + (i / count) * TAU);
};

function addStreetLamp(g: THREE.Group, M: TownMaterials): void {
  skipCollider(g);
  markCollider(g, [0.3, 5, 0.3], [0, 2.5, 0]);
  cylinder(g, M.darkMetal, 0.14, 0.4, [0, 0.2, 0], 10);
  rod(g, M.darkMetal, [0, 0.4, 0], [0, 4.8, 0], 0.06, 0.045, 8);
  rod(g, M.darkMetal, [0, 4.8, 0], [0, 4.95, -0.9], 0.035, 0.035, 6);
  box(g, M.darkMetal, [0.32, 0.12, 0.55], [0, 4.92, -1.05]);
  box(g, M.lamp, [0.26, 0.02, 0.45], [0, 4.85, -1.05]);
}

function addStreetTree(g: THREE.Group, M: TownMaterials, rng: Rng): void {
  skipCollider(g);
  markCollider(g, [0.5, 2.4, 0.5], [0, 1.2, 0]);
  box(g, M.planter, [1.1, 0.15, 1.1], [0, 0.075, 0]);
  rod(g, M.trunk, [0, 0, 0], [0, 2.3, 0], 0.12, 0.08, 8);
  const crown = range(rng, [1.2, 1.6]);
  addMesh(g, new THREE.IcosahedronGeometry(crown, 1), M.leaves, [0, 2.3 + crown * 0.75, 0]).scale.set(1, 0.9, 1);
}

function addHydrant(g: THREE.Group, M: TownMaterials): void {
  cylinder(g, M.hydrant, 0.12, 0.6, [0, 0.3, 0], 12);
  addMesh(g, new THREE.SphereGeometry(0.13, 12, 6, 0, TAU, 0, Math.PI / 2), M.hydrant, [0, 0.6, 0]);
  for (const side of [1, -1]) cylinder(g, M.hydrant, 0.05, 0.12, [side * 0.16, 0.4, 0], 8, [0, 0, Math.PI / 2]);
}

function addMailbox(g: THREE.Group, M: TownMaterials): void {
  rod(g, M.darkMetal, [0, 0, 0], [0, 0.9, 0], 0.035, 0.035, 6);
  box(g, M.mailbox, [0.4, 0.5, 0.35], [0, 1.15, 0]);
  addMesh(g, new THREE.CylinderGeometry(0.2, 0.2, 0.35, 12, 1, false, 0, Math.PI), M.mailbox, [0, 1.4, 0], [Math.PI / 2, 0, Math.PI / 2]);
  box(g, M.darkMetal, [0.25, 0.03, 0.01], [0, 1.25, 0.18]);
}

function addBench(g: THREE.Group, M: TownMaterials): void {
  for (const z of [-0.12, 0.02, 0.16]) box(g, M.wood, [1.8, 0.04, 0.12], [0, 0.45, z]);
  for (const y of [0.6, 0.75]) box(g, M.wood, [1.8, 0.1, 0.03], [0, y, -0.22]);
  for (const x of [-0.75, 0.75]) box(g, M.darkMetal, [0.05, 0.45, 0.42], [x, 0.225, 0]);
}

// 柏油路、人行道、草地鋪面與路緣石，路面白色邊線、中央虛線與斑馬線。
function addStreetSurfaces(build: PropsBuild, props: THREE.Group, M: TownMaterials, spec: RingSpec, middle: number): void {
  const { maxY } = spec;
  const layer = (from: number, to: number, top: number, material: THREE.Material, tile: number): void => {
    const mesh = annulus(from, to, maxY, top, material);
    planarUv(mesh.geometry, tile);
    build.decor.add(mesh);
  };
  layer(spec.inner, middle - STREET.sidewalk, maxY + 0.01, M.lawn, 2);
  layer(middle + STREET.sidewalk, spec.outer, maxY + 0.01, M.lawn, 2);
  layer(middle - STREET.asphalt, middle + STREET.asphalt, maxY + 0.01, M.asphalt, 2);
  for (const side of [-1, 1]) {
    const [a, b] = side < 0 ? [middle - STREET.sidewalk, middle - STREET.asphalt] : [middle + STREET.asphalt, middle + STREET.sidewalk];
    layer(a, b, maxY + STREET.curb, M.sidewalk, 2);
    build.discs.push({ inner: a, outer: b, minY: maxY, maxY: maxY + STREET.curb });
    const curbAt = side < 0 ? b : a;
    build.decor.add(annulus(curbAt - 0.08, curbAt + 0.08, maxY, maxY + STREET.curb + 0.02, M.curb));
    const edge = middle + side * STREET.edgeLine;
    build.decor.add(annulus(edge - 0.06, edge + 0.06, maxY + 0.01, maxY + 0.016, M.paint));
  }
  const dashes = Math.floor((TAU * middle) / (STREET.dash + STREET.dashGap));
  for (let i = 0; i < dashes; i++) {
    const g = onRing(props, middle, maxY + 0.013, (i / dashes) * TAU);
    box(g, M.yellowPaint, [STREET.dash, 0.006, 0.12], [0, 0, 0]);
  }
  for (const angle of anglesEvery(middle, STREET_PROPS.crosswalkSpacing, 0.2)) {
    const g = onRing(props, middle, maxY + 0.013, angle);
    for (let k = 0; k < 7; k++) box(g, M.paint, [3, 0.006, 0.5], [0, 0, -STREET.asphalt + 0.5 + k * 1]);
  }
}

// 人行道上的設施：兩側每隔一段路燈與行道樹交錯，消防栓、郵筒、長椅分散在其間。
function addStreetFurniture(props: THREE.Group, M: TownMaterials, rng: Rng, spec: RingSpec, middle: number): void {
  const y = spec.maxY + STREET.curb;
  for (const side of [-1, 1]) {
    const r = middle + side * (STREET.sidewalk - 0.9);
    const flip = side > 0;   // 外側人行道的設施轉半圈，正面朝街
    for (const angle of anglesEvery(r, STREET_PROPS.lampSpacing)) addStreetLamp(onRing(props, r, y, angle, !flip), M);
    for (const angle of anglesEvery(r, STREET_PROPS.treeSpacing, STREET_PROPS.treeSpacing / 2 / r)) addStreetTree(onRing(props, r, y, angle), M, rng);
    for (const angle of anglesEvery(r, STREET_PROPS.hydrantSpacing, 0.05 * side)) addHydrant(onRing(props, middle + side * (STREET.asphalt + 0.5), y, angle), M);
    for (const angle of anglesEvery(r, STREET_PROPS.mailboxSpacing, 0.11 * side)) addMailbox(onRing(props, middle + side * (STREET.asphalt + 0.6), y, angle, flip), M);
    for (const angle of anglesEvery(r, STREET_PROPS.benchSpacing, 0.08 + 0.03 * side)) addBench(onRing(props, middle + side * (STREET.sidewalk - 0.5), y, angle, flip), M);
  }
}

/** 房屋環：中間一條有人行道的街，兩側草地上一排排房子（門朝街）。 */
export function buildHousesRing(spec: RingSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  const M = getTownMaterials();
  build.solid.add(annulus(spec.inner, spec.outer, spec.minY, spec.maxY, M.base));
  build.discs.push({ inner: spec.inner, outer: spec.outer, minY: spec.minY, maxY: spec.maxY });
  const middle = (spec.inner + spec.outer) / 2;
  const props = new THREE.Group();
  addStreetSurfaces(build, props, M, spec, middle);
  addStreetFurniture(props, M, rng, spec, middle);

  const B = createHouseBatches(M);
  const sides: [number, number, number][] = [[spec.inner + HOUSE_EDGE, middle - STREET.plot, 1], [middle + STREET.plot, spec.outer - HOUSE_EDGE, -1]];
  for (const [from, to, toStreet] of sides) {
    let rowStart = from;
    while (to - rowStart > HOUSE_ROW_DEPTH[0] / 2) {
      const rowDepth = Math.min(range(rng, HOUSE_ROW_DEPTH), to - rowStart);
      const rowRadius = rowStart + rowDepth / 2;
      let along = rng() * HOUSE_GAP[1];
      for (;;) {
        const house = randomHouse(rng);
        if (along + house.width > TAU * rowRadius) break;
        const theta = (along + house.width / 2) / rowRadius;
        const depth = rowDepth - rng() * 1.5;
        const yaw = theta + (house.turned ? Math.PI / 2 : 0);
        const [sizeX, sizeZ] = house.turned ? [depth, house.width] : [house.width, depth];
        // 門朝街：沒轉的房子自身 z 是徑向，轉 90° 的房子自身 x 是 -徑向
        const door: [number, number] = house.turned ? [-toStreet, 0] : [0, toStreet];
        const [x, z] = polar(rowRadius, theta);
        addHouse(rng, B, [x, spec.maxY, z, yaw, 0, 0], { width: sizeX, height: house.height, depth: sizeZ, isTower: house.isTower }, door);
        build.solids.push(orientedSolid(x, z, yaw, sizeX, sizeZ, spec.maxY, spec.maxY + house.height + Math.min(sizeX, sizeZ)));
        along += house.width + range(rng, HOUSE_GAP);
      }
      rowStart += rowDepth + range(rng, HOUSE_ROW_GAP);
    }
  }
  addHouseBatches(build.decor, B);
  markChildGroups(props);
  build.solids.push(...collectColliders(props));
  build.decor.add(bakeByMaterial(props));
  disposeGeometries(props);
  return build;
}

/** 漂浮房屋環：沒有環面，房屋（同樣的外牆、屋瓦、門、煙囪）歪歪斜斜地漂著，會上下飄、站得上去。 */
export function buildFloatingHousesRing(spec: RingSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  const B = createHouseBatches(getTownMaterials());
  const count = Math.round((Math.PI * (spec.outer ** 2 - spec.inner ** 2)) / FLOATING_HOUSE_AREA);
  const placed: { x: number; z: number; size: number }[] = [];
  for (let i = 0; i < count; i++) {
    const house = randomHouse(rng);
    const depth = range(rng, HOUSE_WIDTH);
    const size = Math.max(house.width, depth);
    for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
      const r = Math.sqrt((spec.inner + size / 2) ** 2 + rng() * ((spec.outer - size / 2) ** 2 - (spec.inner + size / 2) ** 2));
      const [x, z] = polar(r, rng() * TAU);
      if (placed.some((other) => Math.hypot(other.x - x, other.z - z) < (other.size + size) / 2)) continue;
      placed.push({ x, z, size });
      const tilt = (): number => (rng() * 2 - 1) * FLOATING_HOUSE_TILT;
      const args: Matrix6 = [x, spec.maxY + range(rng, FLOATING_HOUSE_RISE), z, rng() * TAU, tilt(), tilt()];
      addFloater(build, rng, spec.bobScale, addHouse(rng, B, args, { width: house.width, height: house.height, depth, isTower: house.isTower }, [0, 1]));
      break;
    }
  }
  addHouseBatches(build.decor, B);
  return build;
}
