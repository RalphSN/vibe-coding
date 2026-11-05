// OZ 運動場環裡的一整區健身房（40 × 24 m，自身 x 沿圓周、z 朝外），地上鋪橡膠地墊，分五區：
//   後排（z < 0）：左邊自由重量區（鏡牆、啞鈴架、壺鈴、藥球、可調式長椅），右邊力量區（深蹲架、舉重平台、臥推、槓片架）
//   中排（z ≈ 1.6）：器械區（滑輪夾胸、高位下拉、坐姿推胸、腿伸展、腿推機、史密斯機）與引體向上架
//   z ≈ 6：瑜伽墊、雪橇推道、跳箱、戰繩
//   前排（z ≈ 10）：有氧區（跑步機、橢圓機、飛輪、划船機、踏步機）、飲水機、毛巾架、置物櫃
// 有氧器材與大部分器械的使用者面向 -z。
// 碰撞：每件器材是一個子群組，運動場環建好這一區後用 markChildGroups 各自加外框（見 oz-sports.ts）；
// 雪橇推道整條不擋，只擋雪橇本身。
import * as THREE from 'three';
import { shinyMaterial } from './oz-props';
import {
  TAU, addMesh, box, childGroup, cylinder, flat, lambert, mapped, markBounds, markCollider, meterTexture, range, rod, skipCollider,
  speckle, sphere, strokeLine, type Rng, type Vec3,
} from './oz-kit';

/** 健身房佔的大小（沿圓周、徑向，m）。 */
export const GYM_SIZE: [number, number] = [40, 24];
const FLOOR_LIFT = 0.02;
const PLATE_RADIUS = 0.225;          // 標準槓片（bumper）直徑 450 mm
const PLATE_THICKNESS = 0.055;
const BAR = { length: 2.2, radius: 0.014, sleeveFrom: 0.72, sleeveRadius: 0.025 };   // 20 kg 奧林匹克槓：長 2.2 m
const AXIS_X: Vec3 = [0, 0, Math.PI / 2];   // 圓柱預設沿 y，轉成沿 x（槓片、滾筒）
const AXIS_Z: Vec3 = [Math.PI / 2, 0, 0];   // 轉成沿 z

function drawGymFloor(ctx: CanvasRenderingContext2D): void {
  const [length, width] = GYM_SIZE;
  ctx.fillStyle = '#2b2e33';
  ctx.fillRect(-length / 2, -width / 2, length, width);
  speckle(ctx, createSpeckleRng(), length, width, 14000, ['#3a4049', '#454b55', '#5b6878', '#2f6fb0', '#7f8a96'], [0.02, 0.05]);
  ctx.strokeStyle = '#f2c200';
  for (const y of [-0.6, 4.4, 8]) strokeLine(ctx, -length / 2, y, length / 2, y, 0.06);
  strokeLine(ctx, 0, -width / 2, 0, -0.6, 0.06);
}
// 地墊顆粒用固定的偽亂數（和場景種子無關），每次長得一樣
function createSpeckleRng(): Rng {
  let seed = 7;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function createGymMaterials() {
  return {
    floor: mapped(meterTexture(GYM_SIZE[0], GYM_SIZE[1], 12, drawGymFloor)),
    frame: shinyMaterial(0x2e3338, 0.6, 0.45),
    chrome: shinyMaterial(0xd5dae0, 0.9, 0.25),
    iron: shinyMaterial(0x3a3d42, 0.7, 0.5),
    mirror: shinyMaterial(0xffffff, 1, 0.03),
    accent: lambert(0x2fa3b5),
    shell: lambert(0xe6e9ee),
    pad: lambert(0x222326),
    rubber: lambert(0x1b1b1b),
    screen: new THREE.MeshBasicMaterial({ color: 0x1d3f7a }),
    plates: [0xc0392b, 0x2f5fa8, 0xf2c200, 0x3f8a5f].map((color) => lambert(color)),   // 25／20／15／10 kg（國際舉重配色）
    wood: lambert(0xc9a77c),
    turf: lambert(0x3f8f55),
    white: lambert(0xffffff),
    foam: [0xf26b1d, 0x2f5fa8, 0x3f8a5f].map((color) => lambert(color)),
    mats: [0x7b5ea7, 0x2fa3b5, 0xe07a5f, 0x6cc56b, 0x4a6fa5].map((color) => lambert(color)),
    medBalls: [0x8c2f39, 0x2f4b7c, 0xd9a441, 0x3f6b55].map((color) => lambert(color)),
    rope: lambert(0x1f2a36),
    lockers: [0x4a6fa5, 0x6b7f8e].map((color) => lambert(color)),
    water: lambert(0xa9d6e5),
  };
}
type GymMaterials = ReturnType<typeof createGymMaterials>;
let gymMaterials: GymMaterials | null = null;
function getGymMaterials(): GymMaterials {
  gymMaterials ??= createGymMaterials();
  return gymMaterials;
}

const pickMaterial = (list: THREE.Material[], index: number, fallback: THREE.Material): THREE.Material => list[index % list.length] ?? fallback;

// ---------- 有氧 ----------
function addTreadmill(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  box(t, G.shell, [0.85, 0.18, 1.95], [0, 0.09, 0]);
  box(t, G.rubber, [0.55, 0.02, 1.6], [0, 0.19, 0.1]);
  box(t, G.accent, [0.85, 0.22, 0.32], [0, 0.2, -0.82]);
  for (const sx of [1, -1]) {
    box(t, G.shell, [0.12, 0.05, 1.6], [sx * 0.34, 0.205, 0.1]);
    rod(t, G.frame, [sx * 0.36, 0.18, -0.8], [sx * 0.33, 1.25, -0.88], 0.03);
    rod(t, G.chrome, [sx * 0.33, 1.05, -0.85], [sx * 0.33, 1.05, -0.45], 0.018);
  }
  box(t, G.shell, [0.8, 0.35, 0.12], [0, 1.35, -0.9], [-0.5, 0, 0]);
  box(t, G.screen, [0.5, 0.24, 0.01], [0, 1.37, -0.835], [-0.5, 0, 0]);
}

function addElliptical(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  box(t, G.frame, [0.5, 0.1, 1.8], [0, 0.05, 0]);
  cylinder(t, G.accent, 0.32, 0.3, [0, 0.42, 0.72], 24, AXIS_X);
  for (const sx of [1, -1]) {
    rod(t, G.frame, [sx * 0.16, 0.2, 0.55], [sx * 0.16, 0.45, -0.25], 0.025);
    box(t, G.rubber, [0.14, 0.04, 0.38], [sx * 0.16, 0.4 + (sx > 0 ? 0.08 : 0), -0.05]);
    rod(t, G.chrome, [sx * 0.24, 0.35, -0.35], [sx * 0.3, 1.65, -0.6], 0.02);
  }
  rod(t, G.frame, [0, 0.1, -0.8], [0, 1.35, -0.75], 0.035);
  box(t, G.shell, [0.4, 0.25, 0.08], [0, 1.4, -0.72], [-0.4, 0, 0]);
  box(t, G.screen, [0.3, 0.16, 0.01], [0, 1.41, -0.68], [-0.4, 0, 0]);
}

function addSpinBike(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  for (const z of [-0.5, 0.5]) box(t, G.frame, [0.6, 0.06, 0.1], [0, 0.03, z]);
  rod(t, G.frame, [0, 0.06, 0.5], [0, 0.78, 0.05], 0.035);
  rod(t, G.frame, [0, 0.06, -0.5], [0, 0.62, -0.3], 0.035);
  cylinder(t, G.chrome, 0.25, 0.05, [0, 0.4, -0.35], 28, AXIS_X);
  rod(t, G.chrome, [0, 0.6, 0.15], [0, 0.95, 0.2], 0.02);
  box(t, G.pad, [0.18, 0.06, 0.27], [0, 0.98, 0.22]);
  rod(t, G.chrome, [0, 0.6, -0.3], [0, 1.08, -0.38], 0.022);
  rod(t, G.pad, [-0.24, 1.08, -0.42], [0.24, 1.08, -0.42], 0.018);
  cylinder(t, G.accent, 0.09, 0.12, [0, 0.4, 0], 16, AXIS_X);
  for (const [x, y, z] of [[0.13, 0.25, 0.05], [-0.13, 0.55, -0.05]] as const) box(t, G.rubber, [0.1, 0.03, 0.12], [x, y, z]);
}

function addRower(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  box(t, G.frame, [0.12, 0.06, 2.3], [0, 0.32, 0]);
  for (const z of [-1.1, 1.1]) {
    box(t, G.frame, [0.5, 0.05, 0.08], [0, 0.025, z]);
    box(t, G.frame, [0.06, 0.3, 0.06], [0, 0.17, z]);
  }
  cylinder(t, G.rubber, 0.3, 0.3, [0, 0.45, -1.15], 24, AXIS_X);
  box(t, G.pad, [0.32, 0.07, 0.3], [0, 0.39, 0.3]);
  for (const sx of [1, -1]) box(t, G.rubber, [0.13, 0.02, 0.3], [sx * 0.12, 0.38, -0.62], [-0.6, 0, 0]);
  rod(t, G.chrome, [-0.28, 0.55, -0.85], [0.28, 0.55, -0.85], 0.015);
  rod(t, G.frame, [0, 0.45, -1.15], [0, 0.95, -0.9], 0.02);
  box(t, G.screen, [0.2, 0.15, 0.02], [0, 0.97, -0.88], [-0.4, 0, 0]);
}

function addStairClimber(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  box(t, G.shell, [0.9, 0.25, 1.3], [0, 0.125, 0]);
  for (let k = 0; k < 4; k++) {
    box(t, G.rubber, [0.6, 0.04, 0.25], [0, 0.3 + k * 0.22, 0.45 - k * 0.25]);
    box(t, G.frame, [0.6, 0.22, 0.03], [0, 0.19 + k * 0.22, 0.32 - k * 0.25]);
  }
  for (const sx of [1, -1]) {
    rod(t, G.chrome, [sx * 0.4, 0.25, 0.5], [sx * 0.38, 1.2, -0.3], 0.022);
    rod(t, G.chrome, [sx * 0.38, 1.2, -0.3], [sx * 0.38, 1.2, 0.2], 0.022);
  }
  rod(t, G.frame, [0, 0.25, -0.6], [0, 1.35, -0.55], 0.035);
  box(t, G.screen, [0.35, 0.22, 0.02], [0, 1.42, -0.52], [-0.4, 0, 0]);
}

// ---------- 自由重量 ----------
// 啞鈴：握把加兩個六角啞鈴頭，沿 z 擺在架上。
function addDumbbell(g: THREE.Object3D, G: GymMaterials, position: Vec3, headRadius: number): void {
  const [x, y, z] = position;
  cylinder(g, G.chrome, 0.016, 0.14, [x, y, z], 10, AXIS_Z);
  const headLength = 0.05 + headRadius * 0.5;
  for (const side of [1, -1]) cylinder(g, G.rubber, headRadius, headLength, [x, y, z + side * (0.07 + headLength / 2)], 6, AXIS_Z);
}

// 兩層啞鈴架：上層放輕的、下層放重的，10 對由小到大。
function addDumbbellRack(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const length = 3.2;
  const t = childGroup(g, position);
  for (const x of [-length / 2 + 0.05, 0, length / 2 - 0.05]) box(t, G.frame, [0.06, 0.85, 0.5], [x, 0.425, 0]);
  const tiers: [number, number][] = [[0.78, -0.1], [0.45, 0.12]];
  for (const [y, z] of tiers) {
    for (const dz of [-0.1, 0.1]) box(t, G.frame, [length, 0.04, 0.04], [0, y - 0.04, z + dz]);
  }
  const pairs = 10;
  const spacing = length / (pairs / 2);
  for (let i = 0; i < pairs; i++) {
    const [y, z] = tiers[i < pairs / 2 ? 0 : 1] ?? [0.5, 0];
    const slot = i % (pairs / 2);
    const headRadius = 0.05 + i * 0.008;
    for (const offset of [-0.22, 0.22]) addDumbbell(t, G, [-length / 2 + (slot + 0.5) * spacing + offset * spacing, y + headRadius - 0.02, z], headRadius);
  }
}

// 壺鈴：鑄鐵球身加上方的提把。
function addKettlebellRack(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  for (const x of [-1, 1]) box(t, G.frame, [0.06, 0.7, 0.5], [x, 0.35, 0]);
  for (const y of [0.3, 0.68]) box(t, G.frame, [2.1, 0.04, 0.5], [0, y, 0]);
  for (let i = 0; i < 8; i++) {
    const r = 0.08 + (i % 4) * 0.015;
    const y = (i < 4 ? 0.32 : 0.7) + r;
    const x = -0.75 + (i % 4) * 0.5;
    sphere(t, G.iron, r, [x, y, 0], 14);
    addMesh(t, new THREE.TorusGeometry(r * 0.6, 0.013, 6, 16, Math.PI), G.iron, [x, y + r * 0.6, 0]);
  }
}

function addMedBallRack(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  for (const x of [-0.8, 0.8]) box(t, G.frame, [0.05, 1, 0.4], [x, 0.5, 0]);
  for (const y of [0.3, 0.7]) box(t, G.frame, [1.65, 0.04, 0.4], [0, y, 0]);
  for (let i = 0; i < 8; i++) {
    const r = 0.11 + (i % 4) * 0.015;
    sphere(t, pickMaterial(G.medBalls, i, G.pad), r, [-0.6 + (i % 4) * 0.4, (i < 4 ? 0.32 : 0.72) + r, 0], 14);
  }
}

// 可調式長椅：坐墊加可調角度的靠背（incline 弧度，0 是平躺）。
function addAdjustableBench(g: THREE.Object3D, G: GymMaterials, position: Vec3, incline: number): void {
  const t = childGroup(g, position);
  box(t, G.frame, [0.12, 0.08, 1.3], [0, 0.12, 0]);
  for (const z of [-0.6, 0.6]) box(t, G.frame, [0.5, 0.05, 0.08], [0, 0.025, z]);
  box(t, G.pad, [0.3, 0.07, 0.4], [0, 0.45, 0.35]);
  rod(t, G.frame, [0, 0.12, 0.35], [0, 0.42, 0.35], 0.025);
  const back = 0.85;
  box(t, G.pad, [0.3, 0.07, back], [0, 0.45 + (back / 2) * Math.sin(incline), 0.15 - (back / 2) * Math.cos(incline)], [incline, 0, 0]);
  rod(t, G.frame, [0, 0.12, -0.2], [0, 0.42 + 0.3 * Math.sin(incline), 0.15 - 0.4 * Math.cos(incline)], 0.025);
}

// 鏡牆：自由重量區後面一整面鏡子，上下有收邊。
function addMirrorWall(g: THREE.Object3D, G: GymMaterials): void {
  const z = -GYM_SIZE[1] / 2 + 0.1;
  addMesh(g, new THREE.PlaneGeometry(18, 2.4), G.mirror, [-10, 1.5, z]);
  for (const y of [0.28, 2.72]) box(g, G.frame, [18.1, 0.05, 0.05], [-10, y, z - 0.02]);
  box(g, G.shell, [18.4, 3, 0.1], [-10, 1.5, z - 0.08]);
  markCollider(g, [18.4, 3, 0.3], [-10, 1.5, z - 0.05]);
}

// ---------- 力量 ----------
// 奧林匹克槓：中間握把、兩端較粗的套筒，套筒上依序套槓片（plates 是槓片顏色的索引，由內往外）。
function addBarbell(g: THREE.Object3D, G: GymMaterials, center: Vec3, plates: number[]): void {
  const [x, y, z] = center;
  rod(g, G.chrome, [x - BAR.length / 2, y, z], [x + BAR.length / 2, y, z], BAR.radius, BAR.radius, 10);
  for (const side of [1, -1]) {
    rod(g, G.chrome, [x + side * BAR.sleeveFrom, y, z], [x + side * BAR.length / 2, y, z], BAR.sleeveRadius, BAR.sleeveRadius, 12);
    plates.forEach((plate, k) => {
      cylinder(g, pickMaterial(G.plates, plate, G.rubber), PLATE_RADIUS - (plate >= 3 ? 0.02 : 0), PLATE_THICKNESS, [x + side * (BAR.sleeveFrom + 0.04 + k * (PLATE_THICKNESS + 0.005)), y, z], 28, AXIS_X);
    });
  }
}

// 深蹲架：四根立柱、上下橫樑、J 掛鉤、保護槓，槓鈴掛在前面，後柱掛著備用槓片。
function addPowerRack(g: THREE.Object3D, G: GymMaterials, position: Vec3, rng: Rng): void {
  const t = childGroup(g, position);
  const half = 0.6;
  const height = 2.3;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) box(t, G.frame, [0.075, height, 0.075], [sx * half, height / 2, sz * half]);
    for (const y of [0.04, height]) box(t, G.frame, [0.075, 0.075, half * 2 + 0.08], [sx * half, y, 0]);
    box(t, G.chrome, [0.08, 0.08, 0.12], [sx * half, 1.4, -half - 0.05]);
    box(t, G.chrome, [0.05, 0.05, half * 2 + 0.1], [sx * half, 0.9, 0]);
    rod(t, G.chrome, [sx * (half + 0.04), 0.5, half], [sx * (half + 0.25), 0.5, half], 0.025);
    cylinder(t, pickMaterial(G.plates, Math.floor(rng() * 4), G.rubber), PLATE_RADIUS, PLATE_THICKNESS, [sx * (half + 0.1), 0.5, half], 28, AXIS_X);
  }
  for (const sz of [1, -1]) box(t, G.frame, [half * 2 + 0.08, 0.075, 0.075], [0, height, sz * half]);
  rod(t, G.chrome, [-half, height - 0.1, -half - 0.05], [half, height - 0.1, -half - 0.05], 0.016);
  addBarbell(t, G, [0, 1.47, -half - 0.08], rng() < 0.5 ? [0, 1] : [1]);
}

// 舉重平台：中間木板、兩側橡膠墊，地上放著上好槓片的槓鈴。
function addLiftingPlatform(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  box(t, G.wood, [1.2, 0.04, 2.4], [0, 0.02, 0]);
  for (const sx of [1, -1]) box(t, G.rubber, [0.9, 0.04, 2.4], [sx * 1.05, 0.02, 0]);
  addBarbell(t, G, [0, PLATE_RADIUS + 0.04, 0.3], [0, 0, 1]);
}

// 槓片架：底座、立柱與左右三層掛桿，掛滿各色槓片。
function addPlateTree(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  box(t, G.frame, [0.6, 0.05, 0.6], [0, 0.025, 0]);
  rod(t, G.frame, [0, 0, 0], [0, 1.3, 0], 0.035);
  [0.35, 0.75, 1.1].forEach((y, level) => {
    for (const sx of [1, -1]) {
      rod(t, G.chrome, [0, y, 0], [sx * 0.25, y + 0.06, 0], 0.02);
      for (let k = 0; k < 2; k++) cylinder(t, pickMaterial(G.plates, level + k, G.rubber), PLATE_RADIUS - level * 0.03, PLATE_THICKNESS, [sx * (0.08 + k * 0.06), y + 0.02, 0], 28, AXIS_X);
    }
  });
}

// 臥推架：平躺長椅、兩根立柱掛槓鈴。
function addBenchPress(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  box(t, G.frame, [0.15, 0.3, 1.1], [0, 0.15, 0.1]);
  box(t, G.pad, [0.3, 0.08, 1.2], [0, 0.44, 0.1]);
  for (const sx of [1, -1]) {
    box(t, G.frame, [0.07, 1.2, 0.07], [sx * 0.55, 0.6, -0.55]);
    box(t, G.frame, [0.07, 0.05, 0.6], [sx * 0.55, 0.025, -0.4]);
    box(t, G.chrome, [0.08, 0.06, 0.1], [sx * 0.55, 1.08, -0.5]);
  }
  addBarbell(t, G, [0, 1.12, -0.5], [1]);
}

// ---------- 器械 ----------
// 配重片塔：鐵框裡一疊配重片、兩根導桿。
function addWeightStack(g: THREE.Object3D, G: GymMaterials, position: Vec3, height = 2.2): void {
  const [x, , z] = position;
  for (const sx of [1, -1]) box(g, G.frame, [0.06, height, 0.06], [x + sx * 0.2, height / 2, z]);
  box(g, G.frame, [0.46, 0.06, 0.12], [x, height, z]);
  for (let k = 0; k < 12; k++) box(g, G.iron, [0.3, 0.045, 0.1], [x, 0.1 + k * 0.05, z]);
  for (const sx of [1, -1]) rod(g, G.chrome, [x + sx * 0.1, 0.05, z], [x + sx * 0.1, height - 0.1, z], 0.008, 0.008, 6);
}

function addCableCrossover(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  for (const sx of [1, -1]) {
    addWeightStack(t, G, [sx * 1.8, 0, 0], 2.4);
    box(t, G.accent, [0.12, 2.4, 0.12], [sx * 1.55, 1.2, 0.15]);
    cylinder(t, G.chrome, 0.06, 0.04, [sx * 1.48, 1.6, 0.15], 16, AXIS_X);
    rod(t, G.rubber, [sx * 1.48, 1.55, 0.15], [sx * 1.3, 1.2, 0.35], 0.006, 0.006, 4);
    box(t, G.pad, [0.12, 0.04, 0.04], [sx * 1.3, 1.18, 0.35]);
  }
  box(t, G.frame, [3.9, 0.12, 0.12], [0, 2.45, 0]);
  rod(t, G.chrome, [-0.8, 2.3, 0.15], [0.8, 2.3, 0.15], 0.016);
}

function addLatPulldown(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  box(t, G.frame, [0.12, 0.45, 0.12], [0, 0.225, 0.2]);
  box(t, G.pad, [0.4, 0.07, 0.4], [0, 0.48, 0.2]);
  cylinder(t, G.pad, 0.06, 0.45, [0, 0.72, 0.02], 14, AXIS_X);
  addWeightStack(t, G, [0, 0, -0.45]);
  rod(t, G.frame, [0, 2.2, -0.45], [0, 2.25, 0.15], 0.04);
  rod(t, G.rubber, [0, 2.2, 0.15], [0, 1.9, 0.15], 0.006, 0.006, 4);
  rod(t, G.chrome, [-0.6, 1.9, 0.15], [0.6, 1.9, 0.15], 0.016);
}

function addChestPress(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  box(t, G.frame, [0.12, 0.45, 0.12], [0, 0.225, 0.2]);
  box(t, G.pad, [0.45, 0.08, 0.45], [0, 0.48, 0.2]);
  box(t, G.pad, [0.45, 0.65, 0.08], [0, 0.88, -0.05]);
  addWeightStack(t, G, [0, 0, -0.5]);
  for (const sx of [1, -1]) {
    rod(t, G.accent, [sx * 0.35, 1.6, -0.3], [sx * 0.35, 1.1, 0.35], 0.03);
    rod(t, G.pad, [sx * 0.35, 1.1, 0.35], [sx * 0.2, 1.1, 0.4], 0.02);
  }
}

function addLegExtension(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  box(t, G.frame, [0.12, 0.45, 0.6], [0, 0.225, 0]);
  box(t, G.pad, [0.45, 0.08, 0.45], [0, 0.5, 0]);
  box(t, G.pad, [0.45, 0.6, 0.08], [0, 0.85, -0.25], [-0.15, 0, 0]);
  cylinder(t, G.pad, 0.06, 0.45, [0, 0.33, 0.32], 14, AXIS_X);
  rod(t, G.accent, [0.3, 0.5, 0.05], [0.3, 0.33, 0.32], 0.03);
  addWeightStack(t, G, [0.65, 0, -0.2], 1.6);
}

// 45° 腿推機：躺椅、斜向軌道、腳踏板滑車，兩側槓片插桿上放了槓片。
function addLegPress(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  box(t, G.frame, [1, 0.15, 2.2], [0, 0.075, 0]);
  box(t, G.pad, [0.5, 0.08, 0.5], [0, 0.45, 0.7]);
  box(t, G.pad, [0.5, 0.08, 0.7], [0, 0.75, 0.95], [-0.9, 0, 0]);
  for (const sx of [1, -1]) rod(t, G.chrome, [sx * 0.35, 0.3, 0.3], [sx * 0.35, 1.6, -0.9], 0.03);
  box(t, G.accent, [0.85, 0.6, 0.06], [0, 1.05, -0.4], [-0.8, 0, 0]);
  for (const sx of [1, -1]) {
    rod(t, G.chrome, [sx * 0.43, 1.0, -0.35], [sx * 0.7, 1.0, -0.35], 0.025);
    cylinder(t, pickMaterial(G.plates, 1, G.rubber), PLATE_RADIUS, PLATE_THICKNESS, [sx * 0.55, 1.0, -0.35], 28, AXIS_X);
  }
}

// 史密斯機：外框加兩根垂直導桿，槓鈴只能沿導桿上下；中間放一張平椅。
function addSmithMachine(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  const height = 2.3;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) box(t, G.frame, [0.075, height, 0.075], [sx * 1, height / 2, sz * 0.5]);
    rod(t, G.chrome, [sx * 0.85, 0.1, 0], [sx * 0.85, height - 0.05, 0], 0.02);
    box(t, G.frame, [0.075, 0.075, 1.08], [sx * 1, height, 0]);
  }
  for (const sz of [1, -1]) box(t, G.frame, [2.08, 0.075, 0.075], [0, height, sz * 0.5]);
  addBarbell(t, G, [0, 1.2, 0], [1]);
  addAdjustableBench(t, G, [0, 0, 0.3], 0);
}

// ---------- 功能訓練 ----------
function addPullUpRig(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  const height = 2.6;
  for (const x of [-3, -1, 1, 3]) {
    for (const z of [-1, 1]) box(t, G.frame, [0.08, height, 0.08], [x, height / 2, z]);
  }
  for (const z of [-1, 1]) box(t, G.frame, [6.08, 0.08, 0.08], [0, height, z]);
  for (const x of [-2, 0, 2]) rod(t, G.chrome, [x, height - 0.05, -1], [x, height - 0.05, 1], 0.016);
  for (const z of [-0.25, 0.25]) {
    box(t, G.rubber, [0.03, 0.9, 0.01], [-2.5, height - 0.45, z]);
    addMesh(t, new THREE.TorusGeometry(0.1, 0.015, 8, 20), G.wood, [-2.5, height - 1, z]);
  }
}

// 跳箱：三個不同高度的軟跳箱。
function addPlyoBoxes(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  [0.75, 0.6, 0.45].forEach((height, i) => box(t, pickMaterial(G.foam, i, G.pad), [0.9, height, 0.6], [i * 1.1 - 1.1, height / 2, 0]));
}

// 戰繩：一根柱子當錨點，繩子對折成兩股在地上蜿蜒。
function addBattleRopes(g: THREE.Object3D, G: GymMaterials, anchor: Vec3, length: number): void {
  const [x, , z] = anchor;
  box(g, G.frame, [0.2, 0.6, 0.2], [x, 0.3, z]);
  markCollider(g, [0.3, 0.6, 0.3], [x, 0.3, z]);
  for (const side of [1, -1]) {
    const points = Array.from({ length: 12 }, (_, i) => {
      const t = i / 11;
      return new THREE.Vector3(x - t * length, 0.05, z + side * (0.15 + 0.2 * t) + 0.12 * Math.sin(t * TAU * 1.5));
    });
    addMesh(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.025, 6), G.rope, [0, 0, 0]);
  }
}

// 伸展區：一排瑜伽墊，旁邊放滾筒和小啞鈴。
function addYogaMats(g: THREE.Object3D, G: GymMaterials, position: Vec3, rng: Rng): void {
  const t = childGroup(g, position);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.9;
    box(t, pickMaterial(G.mats, i, G.pad), [0.6, 0.006, 1.8], [x, 0.003, 0]);
    if (rng() < 0.6) cylinder(t, pickMaterial(G.foam, i, G.pad), 0.075, 0.9, [x, 0.075, 1.15], 14, AXIS_X);
    if (rng() < 0.5) addDumbbell(t, G, [x + 0.15, 0.06, -0.7], 0.05);
  }
}

// 雪橇推道：一條人工草皮跑道（白色邊線、每 2 m 一條刻度），起點放一台推雪橇。
function addSledTrack(g: THREE.Object3D, G: GymMaterials, position: Vec3, length: number): void {
  const t = childGroup(g, position);
  skipCollider(t);
  box(t, G.turf, [length, 0.015, 2.2], [0, 0.008, 0]);
  for (const z of [-1.05, 1.05]) box(t, G.white, [length, 0.017, 0.05], [0, 0.009, z]);
  for (let x = -length / 2 + 2; x < length / 2; x += 2) box(t, G.white, [0.05, 0.017, 2.1], [x, 0.009, 0]);
  const sled = childGroup(t, [-length / 2 + 1, 0.015, 0]);
  box(sled, G.iron, [0.9, 0.06, 0.7], [0, 0.03, 0]);
  for (const z of [-0.2, 0.2]) {
    rod(sled, G.frame, [0.3, 0.06, z], [0.4, 1.1, z], 0.025);
    rod(sled, G.chrome, [0.4, 1.1, z], [0.6, 1.1, z], 0.02);
  }
  rod(sled, G.chrome, [0, 0.06, 0], [0, 0.4, 0], 0.025);
  for (let k = 0; k < 2; k++) cylinder(sled, pickMaterial(G.plates, k, G.rubber), PLATE_RADIUS, PLATE_THICKNESS, [0, 0.1 + k * 0.06, 0], 28);
  markBounds(sled);
}

// ---------- 設施 ----------
function addAmenities(g: THREE.Object3D, G: GymMaterials, position: Vec3): void {
  const t = childGroup(g, position);
  // 飲水機
  box(t, G.shell, [0.5, 1, 0.4], [0, 0.5, 0]);
  box(t, G.chrome, [0.4, 0.05, 0.3], [0, 1.02, 0.02]);
  cylinder(t, G.water, 0.13, 0.45, [0, 1.3, -0.05], 16);
  // 毛巾架
  box(t, G.frame, [0.9, 1.2, 0.4], [1.3, 0.6, 0], undefined);
  for (let k = 0; k < 6; k++) box(t, G.white, [0.35, 0.06, 0.3], [1.1 + (k % 2) * 0.4, 0.35 + Math.floor(k / 2) * 0.3, 0.02]);
  // 置物櫃：一排 16 格
  for (let i = 0; i < 16; i++) {
    const x = 2.6 + i * 0.4;
    box(t, pickMaterial(G.lockers, i, G.shell), [0.39, 1.8, 0.5], [x, 0.9, 0.05]);
    box(t, G.frame, [0.01, 1.7, 0.01], [x + 0.195, 0.9, -0.2]);
    box(t, G.chrome, [0.02, 0.1, 0.02], [x + 0.13, 1.1, -0.21]);
  }
}

/** 健身房（40 × 24 m）：自身 x 沿圓周、z 朝外，原點在中心。 */
export function buildGym(g: THREE.Group, rng: Rng): void {
  const G = getGymMaterials();
  const [length, width] = GYM_SIZE;
  addMesh(g, flat(length, width), G.floor, [0, FLOOR_LIFT, 0]);
  addMirrorWall(g, G);
  // 自由重量區
  addDumbbellRack(g, G, [-15, 0, -10.8]);
  addDumbbellRack(g, G, [-10.8, 0, -10.8]);
  addKettlebellRack(g, G, [-6.6, 0, -10.8]);
  addMedBallRack(g, G, [-3, 0, -10.8]);
  [-17, -14, -11, -8, -5].forEach((x, i) => addAdjustableBench(g, G, [x, 0, -7.2], [0.4, 0, 1.2, 0, 0.7][i] ?? 0));
  // 力量區
  for (const x of [3, 7.2, 11.4, 15.6]) addPowerRack(g, G, [x, 0, -9.6], rng);
  addPlateTree(g, G, [19, 0, -10.6]);
  addPlateTree(g, G, [1.2, 0, -6]);
  for (const x of [5.5, 10.5]) addLiftingPlatform(g, G, [x, 0, -4.2]);
  for (const x of [15.2, 18.4]) addBenchPress(g, G, [x, 0, -4.2]);
  // 器械區
  addCableCrossover(g, G, [-15.5, 0, 1.6]);
  addLatPulldown(g, G, [-10.5, 0, 1.6]);
  addChestPress(g, G, [-7.5, 0, 1.6]);
  addLegExtension(g, G, [-4.5, 0, 1.6]);
  addLegPress(g, G, [-0.5, 0, 1.6]);
  addSmithMachine(g, G, [4.5, 0, 1.6]);
  addPullUpRig(g, G, [14, 0, 1.6]);
  // 功能訓練區
  addYogaMats(g, G, [-16.5, 0, 6.1], rng);
  addSledTrack(g, G, [-2.5, 0, 6.1], 16);
  addPlyoBoxes(g, G, [8.6, 0, 6.1]);
  addBattleRopes(g, G, [19.3, 0, 6.1], 7);
  // 有氧區
  for (let i = 0; i < 6; i++) addTreadmill(g, G, [-18.5 + i * 1.25, 0, 10]);
  for (let i = 0; i < 4; i++) addElliptical(g, G, [-10.6 + i * 1.3, 0, 10]);
  for (let i = 0; i < 6; i++) addSpinBike(g, G, [-4.8 + i * 1, 0, 10]);
  for (let i = 0; i < 4; i++) addRower(g, G, [1.8 + i * 1, 0, 10]);
  for (const x of [6.6, 7.9]) addStairClimber(g, G, [x, 0, 10]);
  addAmenities(g, G, [9.6, 0, 11.2]);
  // 散在地上的幾顆藥球
  for (let i = 0; i < 3; i++) sphere(g, pickMaterial(G.medBalls, i, G.pad), 0.13, [range(rng, [-14, -4]), 0.15, range(rng, [-5.5, -3])], 14);
}
