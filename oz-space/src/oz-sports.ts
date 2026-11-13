// OZ 世界最頂層的運動場環：籃球、網球、排球（室內、沙灘）、匹克球、羽球、五人制足球、壁球、拳擊、抱石、撞球，
// 再加一整區健身房（oz-gym.ts）；環的內側是一整圈階梯觀眾席，後面立著照明燈塔，外緣是一圈矮欄杆，欄杆內側也有一排照明燈塔。
// 球類場地旁都有放球的地方（球架、球桶、羽球盒、網球推車）和球。
// 區段之間的間距一樣寬（照每個區段實際建出來的範圍算），每個間隔放四組戶外桌椅（木紋長桌、兩張長凳、黑色 X 形桌腳，桌上不放東西）。
// 尺寸照各運動的規格（FIBA、ITF、FIVB、USA Pickleball、BWF、ITTF、FIFA 室內足球、WSF、WPA）：球場線畫在 canvas 貼圖上，
// 籃框、球網、圍網、球桌做成 3D 零件；整圈的零件最後依材質合併（bakeByMaterial），每種材質只畫一次。
import * as THREE from 'three';
import { annulus, bakeByMaterial, colorMaterial, createRng, emptyBuild, shinyMaterial, type PropsBuild, type RingSpec } from './oz-props';
import { buildGym } from './oz-gym';
import {
  TAU, addMesh, box, childGroup, collectColliders, collectLights, cylinder, disposeGeometries, fillDot, flat, lambert, mapped, markChildGroups, markCollider, markLight,
  merge, meterTexture, pixelTexture, range, rod, skipCollider, speckle, sphere, strokeArc, strokeBox, strokeLine, upright, type Range, type Rng, type Vec3,
} from './oz-kit';

const COURT_LIFT = 0.02;       // 球場地面浮在環面上這麼高，才不會和環面互相閃爍
const PX_PER_M = 48;           // 球場貼圖解析度
const RING_FLOOR = 0xc5ced8;

// 籃球（FIBA）
const BB = { length: 28, width: 15, apronLength: 32, apronWidth: 19, line: 0.05, keyLength: 5.8, keyWidth: 4.9, circle: 1.8, three: 6.75, threeSide: 0.9, basket: 1.575, noCharge: 1.25 };
const HOOP = { boardFromBaseline: 1.2, boardWidth: 1.8, boardHeight: 1.05, boardBottom: 2.9, rimY: 3.05, rimRadius: 0.225, rimGap: 0.15, armY: 3.55, baseBehind: 1.3, netLength: 0.42 };
const PLANK_WIDTH = 0.15;
const PLANK_LENGTH: Range = [1, 3.5];
// 網球（ITF）：雙打場 23.77 × 10.97 m，網在網柱 1.07 m、中間 0.914 m
const TN = { length: 23.77, width: 10.97, singles: 8.23, service: 6.4, areaLength: 36.57, areaWidth: 18.29, netPost: 1.07, netCenter: 0.914, postOutside: 0.914, line: 0.05, baseline: 0.1 };
// 排球（FIVB）：網高 2.43 m（男子）
const VB = { length: 18, width: 9, apronLength: 24, apronWidth: 15, attack: 3, line: 0.05, netTop: 2.43, netHeight: 1, postOffset: 1, postHeight: 2.55 };
const BEACH = { length: 16, width: 8, pitchLength: 22, pitchWidth: 14, sand: 0.25, border: 0.2, borderHeight: 0.35 };
// 匹克球（USA Pickleball）：網在邊柱 0.914 m、中間 0.86 m；非截擊區離網 2.13 m
const PB = { length: 13.41, width: 6.1, areaLength: 18.29, areaWidth: 9.14, kitchen: 2.13, netPost: 0.914, netCenter: 0.86, postOffset: 0.3, fence: 3 };
// 羽球（BWF）：網在柱子 1.55 m、中間 1.524 m
const BD = { length: 13.4, width: 6.1, areaLength: 16.4, areaWidth: 9.1, line: 0.04, singles: 0.46, shortService: 1.98, longService: 0.76, postHeight: 1.55, netTop: 1.524, netDepth: 0.76 };
// 桌球（ITTF）
const TT = { length: 2.74, width: 1.525, height: 0.76, top: 0.025, netHeight: 0.1525, netOverhang: 0.1525, areaLength: 9, areaWidth: 4.5 };
// 五人制足球（FIFA 室內足球規則）：40 × 20 m，罰球區是以兩根球門柱為圓心、半徑 6 m 的弧接一段直線
const FS = { length: 40, width: 20, areaLength: 42, areaWidth: 22, line: 0.08, circle: 3, penalty: 6, secondPenalty: 10, goalWidth: 3, goalHeight: 2, goalDepth: 1, post: 0.08, stripe: 4 };
// 壁球（WSF）：場地 9.75 × 6.4 m；前牆出界線 4.57 m、發球線 1.78 m、底板 0.48 m；後牆（玻璃）出界線 2.13 m
const SQ = { length: 9.75, width: 6.4, wallHeight: 5.64, frontOut: 4.57, service: 1.78, tin: 0.48, backOut: 2.13, shortLine: 5.44, box: 1.6, wall: 0.2 };
// 拳擊台：圍繩內 6.1 m、台面 7.3 m 見方、台高 1 m，四條圍繩
const RING = { inside: 6.1, platform: 7.3, height: 1, ropes: [0.45, 0.8, 1.15, 1.5], post: 1.6, area: 12 };
// 抱石牆：5 片 4 m 寬、4.5 m 高的牆，各自不同角度（度，正的是往外倒的仰角牆、負的是往後躺的斜板）
const BOULDER = { panelWidth: 4, height: 4.5, angles: [0, 15, -8, 30, 5], holdsPerPanel: 28, padDepth: 4.2, padHeight: 0.35, wallZ: -2.5 };
// 撞球（WPA 9 呎）：球檯面 2.54 × 1.27 m，球直徑 57.15 mm
const POOL_TABLE = { playLength: 2.54, playWidth: 1.27, cushion: 0.05, rail: 0.12, bedY: 0.77, railTop: 0.8, ball: 0.0286 };
const PAVILION = { length: 21, width: 13, height: 4.2 };
const BALL_RADIUS = { basketball: 0.12, volleyball: 0.105, pickleball: 0.037, pingPong: 0.02, tennis: 0.033, futsal: 0.1, squash: 0.02 };
const FENCE_POST_SPACING = 3;
// 觀眾席：6 排，每排深 0.8 m、高 0.45 m；後面是 1.1 m 高的矮牆；每隔約 24 m 留一條走道
const STANDS = { rows: 6, tread: 0.8, rise: 0.45, parapet: 1.1, back: 0.25, frontGap: 0.2, seatSpacing: 0.52, aisleEvery: 24, aisleWidth: 1.3, railHeight: 1, colorBlocks: 24, segments: 360 };
const TOWER = { spacing: 48, height: 22, tilt: 0.35, reach: 26 };   // reach：夜晚光斑在燈頭前方多遠
// 外緣欄杆：離環外緣 inset 公尺，柱距 postSpacing
const OUTER_RAIL = { inset: 0.4, height: 1.1, postSpacing: 2.5 };
// 戶外桌椅組（以人物 1.83 m 為準）：長桌、兩張長凳；一個間隔放 PICNIC_SETS 組，沿徑向排成一列，間距 PICNIC_SPACING
const PICNIC = { length: 2.2, tableWidth: 0.8, tableHeight: 0.75, benchWidth: 0.34, benchHeight: 0.45, benchOffset: 0.78, plank: 0.04, leg: 0.06 };
const PICNIC_SETS = 4;
const PICNIC_SPACING = 3.4;
const PICNIC_WOOD = [0xa47a52, 0x9b7049, 0xae835a];

const BALL_COLORS = ['#f4f1e8', '#f2c200', '#1a4fb5', '#d32f2f', '#5b2a86', '#f26b1d', '#1d7a3a', '#7a1f1f', '#111111'];
const HOLD_COLORS = [0xe63946, 0xf2c200, 0x2a9d8f, 0x1f5fbf, 0x8e44ad, 0xf4a261, 0xff7ac3, 0x1b1b1b, 0xf4f4f4];
const SQUASH_RED = '#c0392b';

// ---------- 貼圖 ----------
// 楓木地板：一條條木板，長度隨機、接縫錯開，每塊深淺不同。
function drawWoodFloor(ctx: CanvasRenderingContext2D, length: number, width: number): void {
  const rng = createRng(11);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-length / 2, -width / 2, length, width);
  ctx.clip();
  ctx.strokeStyle = 'rgba(110, 70, 35, 0.25)';
  ctx.lineWidth = 0.01;
  for (let y = -width / 2; y < width / 2; y += PLANK_WIDTH) {
    let x = -length / 2 - rng() * PLANK_LENGTH[1];
    while (x < length / 2) {
      const plank = range(rng, PLANK_LENGTH);
      const tone = Math.round((rng() - 0.5) * 26);
      ctx.fillStyle = `rgb(${216 + tone}, ${164 + tone}, ${106 + tone})`;
      ctx.fillRect(x, y, plank, PLANK_WIDTH);
      ctx.strokeRect(x, y, plank, PLANK_WIDTH);
      x += plank;
    }
  }
  ctx.restore();
}

// 籃球場一端：禁區、罰球圈（禁區內半圈是虛線）、三分線（兩側直線接弧線）、無衝撞半圓、站位標記。
function drawBasketballEnd(ctx: CanvasRenderingContext2D, halfLength: number, halfWidth: number): void {
  const { line } = BB;
  const freeThrow = halfLength - BB.keyLength;
  strokeBox(ctx, freeThrow, -BB.keyWidth / 2, BB.keyLength, BB.keyWidth, line);
  strokeArc(ctx, freeThrow, 0, BB.circle - line / 2, Math.PI / 2, Math.PI * 1.5, line);
  strokeArc(ctx, freeThrow, 0, BB.circle - line / 2, -Math.PI / 2, Math.PI / 2, line, [0.375, 0.39]);
  const basketX = halfLength - BB.basket;
  const sideY = halfWidth - BB.threeSide;
  const reach = Math.sqrt(BB.three ** 2 - sideY ** 2);
  for (const y of [sideY, -sideY]) strokeLine(ctx, halfLength, y, basketX - reach, y, line);
  const angle = Math.asin(sideY / BB.three);
  strokeArc(ctx, basketX, 0, BB.three, Math.PI - angle, Math.PI + angle, line);
  strokeArc(ctx, basketX, 0, BB.noCharge, Math.PI / 2, Math.PI * 1.5, line);
  for (const distance of [1.75, 2.6, 3.45, 4.3]) {
    for (const y of [BB.keyWidth / 2, -BB.keyWidth / 2]) strokeLine(ctx, halfLength - distance, y, halfLength - distance, y + Math.sign(y) * 0.1, line);
  }
}

function drawBasketballCourt(ctx: CanvasRenderingContext2D): void {
  const halfLength = BB.length / 2;
  const halfWidth = BB.width / 2;
  ctx.fillStyle = '#2f5d7c';
  ctx.fillRect(-BB.apronLength / 2, -BB.apronWidth / 2, BB.apronLength, BB.apronWidth);
  drawWoodFloor(ctx, BB.length, BB.width);
  ctx.fillStyle = 'rgba(178, 58, 58, 0.88)';
  for (const side of [1, -1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.fillRect(halfLength - BB.keyLength, -BB.keyWidth / 2, BB.keyLength, BB.keyWidth);
    ctx.restore();
  }
  fillDot(ctx, 0, 0, BB.circle);
  ctx.strokeStyle = '#ffffff';
  strokeBox(ctx, -halfLength, -halfWidth, BB.length, BB.width, BB.line);
  strokeLine(ctx, 0, -halfWidth, 0, halfWidth, BB.line);
  strokeArc(ctx, 0, 0, BB.circle - BB.line / 2, 0, TAU, BB.line);
  for (const side of [1, -1]) {
    ctx.save();
    ctx.scale(side, 1);
    drawBasketballEnd(ctx, halfLength, halfWidth);
    ctx.restore();
  }
  drawLogo(ctx, 1.1);
}

function drawLogo(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OZ', 0, 0);
}

// 網球場：雙打邊線、單打邊線、發球線、中央發球線、底線（較粗）與底線中點標記。
function drawTennisCourt(ctx: CanvasRenderingContext2D): void {
  const halfLength = TN.length / 2;
  const halfWidth = TN.width / 2;
  const singles = TN.singles / 2;
  const { line } = TN;
  ctx.fillStyle = '#3f8a5f';
  ctx.fillRect(-TN.areaLength / 2, -TN.areaWidth / 2, TN.areaLength, TN.areaWidth);
  ctx.fillStyle = '#3b6ea8';
  ctx.fillRect(-halfLength, -halfWidth, TN.length, TN.width);
  ctx.strokeStyle = '#ffffff';
  strokeBox(ctx, -halfLength, -halfWidth, TN.length, TN.width, line);
  for (const side of [1, -1]) {
    strokeLine(ctx, side * (halfLength - TN.baseline / 2), -halfWidth, side * (halfLength - TN.baseline / 2), halfWidth, TN.baseline);
    strokeLine(ctx, -halfLength, side * (singles - line / 2), halfLength, side * (singles - line / 2), line);
    strokeLine(ctx, side * TN.service, -singles, side * TN.service, singles, line);
    strokeLine(ctx, side * halfLength, 0, side * (halfLength - 0.1), 0, line);
  }
  strokeLine(ctx, -TN.service, 0, TN.service, 0, line);
}

function drawVolleyballCourt(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#2f6fb0';
  ctx.fillRect(-VB.apronLength / 2, -VB.apronWidth / 2, VB.apronLength, VB.apronWidth);
  ctx.fillStyle = '#e0793a';
  ctx.fillRect(-VB.length / 2, -VB.width / 2, VB.length, VB.width);
  ctx.strokeStyle = '#ffffff';
  strokeBox(ctx, -VB.length / 2, -VB.width / 2, VB.length, VB.width, VB.line);
  strokeLine(ctx, 0, -VB.width / 2, 0, VB.width / 2, VB.line);
  for (const x of [VB.attack, -VB.attack]) strokeLine(ctx, x, -VB.width / 2, x, VB.width / 2, VB.line);
}

function drawPickleballCourt(ctx: CanvasRenderingContext2D): void {
  const halfLength = PB.length / 2;
  const halfWidth = PB.width / 2;
  ctx.fillStyle = '#3d7a55';
  ctx.fillRect(-PB.areaLength / 2, -PB.areaWidth / 2, PB.areaLength, PB.areaWidth);
  ctx.fillStyle = '#2b5f91';
  ctx.fillRect(-halfLength, -halfWidth, PB.length, PB.width);
  ctx.fillStyle = '#3f86bf';   // 非截擊區（kitchen）換一個色
  ctx.fillRect(-PB.kitchen, -halfWidth, PB.kitchen * 2, PB.width);
  ctx.strokeStyle = '#ffffff';
  strokeBox(ctx, -halfLength, -halfWidth, PB.length, PB.width, 0.05);
  for (const side of [1, -1]) {
    strokeLine(ctx, side * PB.kitchen, -halfWidth, side * PB.kitchen, halfWidth, 0.05);
    strokeLine(ctx, side * PB.kitchen, 0, side * halfLength, 0, 0.05);
  }
}

function drawBadmintonCourt(ctx: CanvasRenderingContext2D): void {
  const halfLength = BD.length / 2;
  const halfWidth = BD.width / 2;
  const { line } = BD;
  ctx.fillStyle = '#4a6a8a';
  ctx.fillRect(-BD.areaLength / 2, -BD.areaWidth / 2, BD.areaLength, BD.areaWidth);
  ctx.fillStyle = '#2e7d4f';
  ctx.fillRect(-halfLength, -halfWidth, BD.length, BD.width);
  ctx.strokeStyle = '#ffffff';
  strokeBox(ctx, -halfLength, -halfWidth, BD.length, BD.width, line);
  const singles = halfWidth - BD.singles - line / 2;
  for (const y of [singles, -singles]) strokeLine(ctx, -halfLength, y, halfLength, y, line);
  for (const side of [1, -1]) {
    strokeLine(ctx, side * BD.shortService, -halfWidth, side * BD.shortService, halfWidth, line);
    const longService = side * (halfLength - BD.longService);
    strokeLine(ctx, longService, -halfWidth, longService, halfWidth, line);
    strokeLine(ctx, side * BD.shortService, 0, side * halfLength, 0, line);
  }
}

// 五人制足球場：深淺相間的人工草條紋、邊線、中線、中圈、罰球區（兩段弧接直線）、第一與第二罰球點、角球弧。
function drawFutsalPitch(ctx: CanvasRenderingContext2D): void {
  const halfLength = FS.length / 2;
  const halfWidth = FS.width / 2;
  const { line } = FS;
  ctx.fillStyle = '#2f6b44';
  ctx.fillRect(-FS.areaLength / 2, -FS.areaWidth / 2, FS.areaLength, FS.areaWidth);
  for (let i = 0; i < FS.length / FS.stripe; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#3f8f55' : '#47995e';
    ctx.fillRect(-halfLength + i * FS.stripe, -halfWidth, FS.stripe, FS.width);
  }
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  strokeBox(ctx, -halfLength, -halfWidth, FS.length, FS.width, line);
  strokeLine(ctx, 0, -halfWidth, 0, halfWidth, line);
  strokeArc(ctx, 0, 0, FS.circle - line / 2, 0, TAU, line);
  fillDot(ctx, 0, 0, 0.1);
  for (const side of [1, -1]) {
    ctx.save();
    ctx.scale(side, 1);
    const post = FS.goalWidth / 2;
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.arc(halfLength, -post, FS.penalty - line / 2, Math.PI * 1.5, Math.PI, true);
    ctx.lineTo(halfLength - FS.penalty + line / 2, post);
    ctx.arc(halfLength, post, FS.penalty - line / 2, Math.PI, Math.PI / 2, true);
    ctx.stroke();
    fillDot(ctx, halfLength - FS.penalty, 0, 0.08);
    fillDot(ctx, halfLength - FS.secondPenalty, 0, 0.08);
    for (const y of [halfWidth, -halfWidth]) strokeArc(ctx, halfLength, y, 0.25, y > 0 ? Math.PI : Math.PI / 2, y > 0 ? Math.PI * 1.5 : Math.PI, line);
    ctx.restore();
  }
}

// 壁球場地板：楓木，紅色的短線、中線與兩個發球格。前牆在 -y（貼圖上方）。
function drawSquashFloor(ctx: CanvasRenderingContext2D): void {
  const halfWidth = SQ.width / 2;
  const halfLength = SQ.length / 2;
  drawWoodFloor(ctx, SQ.width, SQ.length);
  ctx.strokeStyle = SQUASH_RED;
  const shortY = -halfLength + SQ.shortLine;
  strokeLine(ctx, -halfWidth, shortY, halfWidth, shortY, 0.05);
  strokeLine(ctx, 0, shortY, 0, halfLength, 0.05);
  for (const side of [1, -1]) strokeBox(ctx, side > 0 ? halfWidth - SQ.box : -halfWidth, shortY, SQ.box, SQ.box, 0.05);
}

// 壁球牆面：白色灰泥，紅線高度用「離地多高」換成貼圖的 y（貼圖上方是牆頂）。
const wallY = (height: number): number => SQ.wallHeight / 2 - height;
function fillPlaster(ctx: CanvasRenderingContext2D, width: number): void {
  ctx.fillStyle = '#f4f2ee';
  ctx.fillRect(-width / 2, -SQ.wallHeight / 2, width, SQ.wallHeight);
  speckle(ctx, createRng(31), width, SQ.wallHeight, 1500, ['rgba(0,0,0,0.03)'], [0.01, 0.03]);
}
function drawSquashFront(ctx: CanvasRenderingContext2D): void {
  const halfWidth = SQ.width / 2;
  fillPlaster(ctx, SQ.width);
  ctx.fillStyle = '#d9dde2';   // 底板（tin）
  ctx.fillRect(-halfWidth, wallY(SQ.tin), SQ.width, SQ.tin);
  ctx.strokeStyle = SQUASH_RED;
  for (const height of [SQ.frontOut, SQ.service, SQ.tin]) strokeLine(ctx, -halfWidth, wallY(height), halfWidth, wallY(height), 0.05);
}
// 側牆出界線：前牆那端 4.57 m 斜下到後牆那端 2.13 m；左右兩面牆貼圖的方向相反，用 frontOnRight 區分。
const drawSquashSide = (frontOnRight: boolean) => (ctx: CanvasRenderingContext2D): void => {
  const front = (frontOnRight ? 1 : -1) * SQ.length / 2;
  fillPlaster(ctx, SQ.length);
  ctx.strokeStyle = SQUASH_RED;
  strokeLine(ctx, front, wallY(SQ.frontOut), -front, wallY(SQ.backOut), 0.05);
};

// 拳擊台面：淺灰藍帆布，紅、藍角落各有三角色塊，中間是 OZ 標誌。
function drawBoxingCanvas(ctx: CanvasRenderingContext2D): void {
  const half = RING.platform / 2;
  ctx.fillStyle = '#cfd8e3';
  ctx.fillRect(-half, -half, RING.platform, RING.platform);
  ctx.fillStyle = '#c3cddb';
  ctx.fillRect(-RING.inside / 2, -RING.inside / 2, RING.inside, RING.inside);
  for (const [sx, sy, color] of [[1, 1, '#c0392b'], [-1, -1, '#2f5fa8']] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sx * half, sy * half);
    ctx.lineTo(sx * (half - 1.1), sy * half);
    ctx.lineTo(sx * half, sy * (half - 1.1));
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(47, 75, 124, 0.85)';
  fillDot(ctx, 0, 0, 1.2);
  drawLogo(ctx, 0.9);
}

function drawTableTop(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#1d4f8a';
  ctx.fillRect(-TT.length / 2, -TT.width / 2, TT.length, TT.width);
  ctx.strokeStyle = '#ffffff';
  strokeBox(ctx, -TT.length / 2, -TT.width / 2, TT.length, TT.width, 0.02);
  strokeLine(ctx, -TT.length / 2, 0, TT.length / 2, 0, 0.006);
}

// 撞球檯面：絨布加細微雜點，置球點、開球點，以及六個袋口（黑色圓）。
function drawFelt(ctx: CanvasRenderingContext2D): void {
  const length = POOL_TABLE.playLength + 0.1;
  const width = POOL_TABLE.playWidth + 0.1;
  ctx.fillStyle = '#1f7a4a';
  ctx.fillRect(-length / 2, -width / 2, length, width);
  speckle(ctx, createRng(5), length, width, 2500, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.035)'], [0.004, 0.01]);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const x of [POOL_TABLE.playLength / 4, -POOL_TABLE.playLength / 4]) fillDot(ctx, x, 0, 0.009);
  ctx.fillStyle = '#0d0d0d';
  const halfL = POOL_TABLE.playLength / 2;
  const halfW = POOL_TABLE.playWidth / 2;
  for (const [x, y, r] of [[halfL + 0.03, halfW + 0.03, 0.065], [-halfL - 0.03, halfW + 0.03, 0.065], [halfL + 0.03, -halfW - 0.03, 0.065], [-halfL - 0.03, -halfW - 0.03, 0.065], [0, halfW + 0.045, 0.06], [0, -halfW - 0.045, 0.06]] as const) {
    fillDot(ctx, x, y, r);
  }
}

function drawSand(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#e6d09e';
  ctx.fillRect(-BEACH.pitchLength / 2, -BEACH.pitchWidth / 2, BEACH.pitchLength, BEACH.pitchWidth);
  speckle(ctx, createRng(3), BEACH.pitchLength, BEACH.pitchWidth, 9000, ['#d8bf88', '#f1dfb4', '#cdb27a', '#efe2c2'], [0.03, 0.09]);
}

function drawCarpet(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#24474a';
  ctx.fillRect(-PAVILION.length / 2, -PAVILION.width / 2, PAVILION.length, PAVILION.width);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  for (let d = -PAVILION.length; d < PAVILION.length; d += 1) {
    strokeLine(ctx, d, -PAVILION.width / 2, d + PAVILION.width, PAVILION.width / 2, 0.03);
    strokeLine(ctx, d, PAVILION.width / 2, d + PAVILION.width, -PAVILION.width / 2, 0.03);
  }
}

// 籃板：半透明玻璃、白色外框與投籃方框（方框底邊比籃板底邊高 0.15 m，和籃框同高）。
function drawBackboard(ctx: CanvasRenderingContext2D): void {
  const halfW = HOOP.boardWidth / 2;
  const halfH = HOOP.boardHeight / 2;
  ctx.fillStyle = 'rgba(220, 235, 245, 0.25)';
  ctx.fillRect(-halfW, -halfH, HOOP.boardWidth, HOOP.boardHeight);
  ctx.strokeStyle = '#ffffff';
  strokeBox(ctx, -halfW, -halfH, HOOP.boardWidth, HOOP.boardHeight, 0.05);
  strokeBox(ctx, -0.295, halfH - 0.15 - 0.45, 0.59, 0.45, 0.05);
}

// 網格：透明底、網線，重複鋪。
const drawNetCell = (color: string, strand: number) => (ctx: CanvasRenderingContext2D): void => {
  ctx.clearRect(0, 0, 16, 16);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 16, strand);
  ctx.fillRect(0, 0, strand, 16);
};
// 菱形網（鐵絲圍網、籃網）
const drawDiamondMesh = (color: string, width: number) => (ctx: CanvasRenderingContext2D): void => {
  ctx.clearRect(0, 0, 32, 32);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(32, 32);
  ctx.moveTo(32, 0);
  ctx.lineTo(0, 32);
  ctx.stroke();
};
// 排球網標竿：紅白相間，每段 10 cm（1.8 m 共 18 段）
function drawAntenna(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#d9342b' : '#ffffff';
    ctx.fillRect(0, i * 2, 4, 2);
  }
}

// 球的花紋（等距圓柱投影：u 繞一圈、v 從北極到南極）
function drawBasketball(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#d4632a';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 64);
  ctx.lineTo(256, 64);
  for (const x of [64, 192]) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 128);
  }
  for (const [center, sign] of [[128, 1], [0, 1], [256, -1]] as const) {
    for (let v = 0; v <= 128; v += 4) {
      const x = center + sign * 46 * Math.sin((v / 128) * Math.PI);
      if (v === 0) ctx.moveTo(x, v);
      else ctx.lineTo(x, v);
    }
  }
  ctx.stroke();
}
function drawVolleyball(ctx: CanvasRenderingContext2D): void {
  const colors = ['#f2c200', '#1a4fb5', '#f7f7f2'];
  for (let band = 0; band < 6; band++) {
    ctx.fillStyle = colors[band % colors.length] ?? '#fff';
    ctx.beginPath();
    for (let u = 0; u <= 256; u += 8) ctx.lineTo(u, band * 21.3 + 8 * Math.sin((u / 256) * TAU * 2));
    for (let u = 256; u >= 0; u -= 8) ctx.lineTo(u, (band + 1) * 21.3 + 8 * Math.sin((u / 256) * TAU * 2));
    ctx.fill();
  }
}
// 足球：白底、黑色五角形塊（用圓點近似）
function drawSoccerBall(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#f7f7f2';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#1b1b1b';
  for (const [u, v] of [[32, 20], [96, 20], [160, 20], [224, 20], [0, 64], [64, 64], [128, 64], [192, 64], [256, 64], [32, 108], [96, 108], [160, 108], [224, 108]]) {
    fillDot(ctx, u ?? 0, v ?? 0, 13);
  }
}
// 撞球：0 是母球；1–8 全色、9–15 白底色帶；兩側各有一個白圈寫號碼。
const drawBilliardBall = (n: number) => (ctx: CanvasRenderingContext2D): void => {
  const color = BALL_COLORS[n > 8 ? n - 8 : n] ?? '#fff';
  const ivory = BALL_COLORS[0] ?? '#fff';
  ctx.fillStyle = n > 8 ? ivory : color;
  ctx.fillRect(0, 0, 128, 64);
  if (n > 8) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 18, 128, 28);
  }
  if (n === 0) return;
  for (const u of [32, 96]) {
    ctx.fillStyle = ivory;
    fillDot(ctx, u, 32, 9);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), u, 33);
  }
};

// ---------- 材質 ----------
function createMaterials() {
  const glass = shinyMaterial(0xd8eef5, 0, 0.05);
  glass.transparent = true;
  glass.opacity = 0.25;
  glass.depthWrite = false;
  return {
    white: lambert(0xffffff),
    black: lambert(0x1b1b1b),
    darkGray: lambert(0x3d4247),
    metal: shinyMaterial(0xd5dae0, 0.85, 0.3),
    darkMetal: shinyMaterial(0x2e3338, 0.6, 0.45),
    aluminum: shinyMaterial(0xc8ccd2, 0.75, 0.35),
    brass: shinyMaterial(0xc9a24a, 0.9, 0.3),
    rim: shinyMaterial(0xe0561f, 0.5, 0.35),
    glass,
    padBlue: lambert(0x2f5fa8),
    padRed: lambert(0xc0392b),
    windscreen: lambert(0x1e4d3a, { side: THREE.DoubleSide }),
    wood: lambert(0x8a5a3b),
    darkWood: lambert(0x4a2f1d),
    lightWood: lambert(0xd6b88f),
    timber: lambert(0x9c7a52),
    concrete: lambert(0xb7bcc2),
    standConcrete: lambert(0xc3c9d1, { side: THREE.DoubleSide }),
    plaster: lambert(0xeeece8),
    sand: lambert(0xd9c08c),
    strap: lambert(0x2a6fd6),
    redFloor: lambert(0x9c3b3b),
    barrier: lambert(0x1f3550),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c9 }),
    lampHood: lambert(0x1f3d2b),
    roof: lambert(0xeef1f4),
    pearl: lambert(0xf3efe6),
    cushion: lambert(0x1a6b40),
    pocket: lambert(0x111111),
    chalk: lambert(0x2c6fd6),
    rubberRed: lambert(0xc0392b),
    rubberBlack: lambert(0x222222),
    cork: lambert(0xe8dcc8),
    shuttle: lambert(0xffffff, { side: THREE.DoubleSide }),
    pickleball: lambert(0xf2d43b),
    bucket: lambert(0xf26b1d, { side: THREE.DoubleSide }),
    crate: lambert(0x2f6fb0),
    tennisBall: lambert(0xd7e64a),
    squashBall: lambert(0x1b1b1b),
    leaves: lambert(0x5fa85d, { flatShading: true }),
    trunk: lambert(0x7a5a3c),
    planter: lambert(0xb8afa4),
    mat: lambert(0x30343a),
    ringSkirt: lambert(0x1f3550),
    ropeRed: lambert(0xd03a2f),
    ropeBlue: lambert(0x2f5fa8),
    heavyBag: lambert(0x7a1f1f),
    crashPads: [0x2f4b7c, 0x56677a].map((color) => lambert(color)),
    wallPanels: [0xd9d4ca, 0xc7d3de, 0xe6dccb].map((color) => lambert(color)),
    holds: HOLD_COLORS.map((color) => lambert(color, { flatShading: true })),
    courtBasketball: mapped(meterTexture(BB.apronLength, BB.apronWidth, PX_PER_M, drawBasketballCourt)),
    courtTennis: mapped(meterTexture(TN.areaLength, TN.areaWidth, PX_PER_M, drawTennisCourt)),
    courtVolleyball: mapped(meterTexture(VB.apronLength, VB.apronWidth, PX_PER_M, drawVolleyballCourt)),
    courtPickleball: mapped(meterTexture(PB.areaLength, PB.areaWidth, PX_PER_M, drawPickleballCourt)),
    courtBadminton: mapped(meterTexture(BD.areaLength, BD.areaWidth, PX_PER_M, drawBadmintonCourt)),
    courtFutsal: mapped(meterTexture(FS.areaLength, FS.areaWidth, PX_PER_M, drawFutsalPitch)),
    squashFloor: mapped(meterTexture(SQ.width, SQ.length, 64, drawSquashFloor)),
    squashFront: mapped(meterTexture(SQ.width, SQ.wallHeight, 64, drawSquashFront)),
    squashLeft: mapped(meterTexture(SQ.length, SQ.wallHeight, 48, drawSquashSide(true))),
    squashRight: mapped(meterTexture(SQ.length, SQ.wallHeight, 48, drawSquashSide(false))),
    ringCanvas: mapped(meterTexture(RING.platform, RING.platform, 64, drawBoxingCanvas)),
    sandTop: mapped(meterTexture(BEACH.pitchLength, BEACH.pitchWidth, 24, drawSand)),
    tableTop: mapped(meterTexture(TT.length, TT.width, 150, drawTableTop)),
    felt: mapped(meterTexture(POOL_TABLE.playLength + 0.1, POOL_TABLE.playWidth + 0.1, 200, drawFelt)),
    carpet: mapped(meterTexture(PAVILION.length, PAVILION.width, 12, drawCarpet)),
    backboard: mapped(meterTexture(HOOP.boardWidth, HOOP.boardHeight, 120, drawBackboard), { transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    hoopNet: patterned('hoopNet', pixelTexture(32, 32, drawDiamondMesh('#f4f4f4', 2)), 12, 3),
    antenna: mapped(pixelTexture(4, 36, drawAntenna)),
    basketball: mapped(pixelTexture(256, 128, drawBasketball)),
    volleyball: mapped(pixelTexture(256, 128, drawVolleyball)),
    soccerBall: mapped(pixelTexture(256, 128, drawSoccerBall)),
    balls: Array.from({ length: 16 }, (_, n) => mapped(pixelTexture(128, 64, drawBilliardBall(n)))),
    netBase: pixelTexture(16, 16, drawNetCell('#151515', 2)),
    goalNetBase: pixelTexture(16, 16, drawNetCell('#f4f4f4', 2)),
    chainLinkBase: pixelTexture(32, 32, drawDiamondMesh('#a3abb3', 2.5)),
  };
}
type SportsMaterials = ReturnType<typeof createMaterials>;

let sportsMaterials: SportsMaterials | null = null;
// 貼圖要用到 document，第一次建球場時才建，之後重建場景都共用。
function getMaterials(): SportsMaterials {
  sportsMaterials ??= createMaterials();
  return sportsMaterials;
}

// 重複鋪的鏤空材質（球網、圍網）：同樣的尺寸共用一個材質，合併時才會歸成同一批。
// 用半透明混合而不是只用 alphaTest：細網格縮小後 mipmap 會把網線平均成淡淡的透明度，
// alphaTest 會整片切掉（遠處的羽球網只剩上緣白帶），混合則留下一層淡灰的網面，比較像真的。
// 不寫深度，網子後面的東西才不會被擋掉。
const patternedMaterials = new Map<string, THREE.MeshLambertMaterial>();
function patterned(key: string, base: THREE.Texture, repeatX: number, repeatY: number): THREE.MeshLambertMaterial {
  const cacheKey = `${key}:${repeatX.toFixed(2)}:${repeatY.toFixed(2)}`;
  const cached = patternedMaterials.get(cacheKey);
  if (cached) return cached;
  const map = base.clone();
  map.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;
  const material = new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, alphaTest: 0.02, side: THREE.DoubleSide });
  patternedMaterials.set(cacheKey, material);
  return material;
}
const netMaterial = (M: SportsMaterials, width: number, height: number, cell: number, base: THREE.Texture = M.netBase): THREE.MeshLambertMaterial =>
  patterned(base === M.netBase ? 'net' : 'goalNet', base, width / cell, height / cell);

// ---------- 共用設施 ----------
const courtFloor = (g: THREE.Object3D, material: THREE.Material, length: number, width: number, position: Vec3 = [0, COURT_LIFT, 0]): THREE.Mesh =>
  addMesh(g, flat(length, width), material, position);

// 長椅：椅背在 -z，坐的人面向 +z。
function addBench(g: THREE.Object3D, M: SportsMaterials, position: Vec3, length: number, yaw: number): void {
  const bench = childGroup(g, position, yaw);
  box(bench, M.wood, [length, 0.05, 0.4], [0, 0.45, 0]);
  box(bench, M.wood, [length, 0.3, 0.04], [0, 0.72, -0.2]);
  for (const x of [-length / 2 + 0.15, length / 2 - 0.15]) box(bench, M.darkMetal, [0.05, 0.45, 0.36], [x, 0.225, 0]);
}

// 戶外桌椅組：木紋板條長桌（X 形黑鐵桌腳）、兩側各一張板條長凳（ㄇ形鐵腳），桌上不放東西。長邊沿自身 x。
function addPicnicSet(g: THREE.Group, M: SportsMaterials, rng: Rng): void {
  const P = PICNIC;
  const wood = colorMaterial(PICNIC_WOOD[Math.floor(rng() * PICNIC_WOOD.length)] ?? 0xa47a52);
  const iron = M.darkMetal;
  // 桌面：5 條板條，中間留細縫
  const planks = 5;
  const plankWidth = P.tableWidth / planks;
  for (let k = 0; k < planks; k++) box(g, wood, [P.length, P.plank, plankWidth - 0.012], [0, P.tableHeight - P.plank / 2, -P.tableWidth / 2 + plankWidth * (k + 0.5)]);
  // 桌腳：兩端各一個 X 形框（兩根斜桿交叉、上橫樑、下踏腳）
  const legX = P.length / 2 - 0.25;
  const legSpread = P.tableWidth / 2 - 0.05;
  const legTop = P.tableHeight - P.plank;
  for (const x of [-legX, legX]) {
    rod(g, iron, [x, 0, -legSpread], [x, legTop, legSpread], P.leg / 2, P.leg / 2, 4);
    rod(g, iron, [x, 0, legSpread], [x, legTop, -legSpread], P.leg / 2, P.leg / 2, 4);
    box(g, iron, [P.leg, P.leg, P.tableWidth - 0.04], [x, legTop - P.leg / 2, 0]);
    box(g, iron, [P.leg, P.leg, P.tableWidth - 0.04], [x, P.leg / 2, 0]);
  }
  box(g, iron, [legX * 2, P.leg * 0.8, P.leg * 0.8], [0, legTop - P.leg, 0]);
  // 長凳：兩條板條，兩端ㄇ形鐵腳
  for (const side of [-1, 1]) {
    const z = side * P.benchOffset;
    for (const k of [-1, 1]) box(g, wood, [P.length, P.plank, P.benchWidth / 2 - 0.01], [0, P.benchHeight - P.plank / 2, z + (k * P.benchWidth) / 4]);
    for (const x of [-legX, legX]) {
      for (const dz of [-1, 1]) box(g, iron, [P.leg, P.benchHeight - P.plank, P.leg], [x, (P.benchHeight - P.plank) / 2, z + dz * (P.benchWidth / 2 - P.leg / 2)]);
      box(g, iron, [P.leg, P.leg, P.benchWidth], [x, P.benchHeight - P.plank - P.leg / 2, z]);
    }
  }
}

// 鐵絲圍網：每 FENCE_POST_SPACING 一根柱子，上下橫桿，網面是鏤空貼圖；windscreen 時長邊下半部加深綠防風布。
function addFence(g: THREE.Object3D, M: SportsMaterials, length: number, width: number, height: number, windscreen: boolean): void {
  const corners: [number, number][] = [[-length / 2, -width / 2], [length / 2, -width / 2], [length / 2, width / 2], [-length / 2, width / 2]];
  corners.forEach(([x1, z1], i) => {
    const [x2, z2] = corners[(i + 1) % corners.length] ?? [x1, z1];
    const span = Math.hypot(x2 - x1, z2 - z1);
    const posts = Math.ceil(span / FENCE_POST_SPACING);
    for (let k = 0; k < posts; k++) {
      const t = k / posts;
      cylinder(g, M.darkMetal, 0.04, height, [x1 + (x2 - x1) * t, height / 2, z1 + (z2 - z1) * t], 8);
    }
    for (const y of [0.1, height]) rod(g, M.darkMetal, [x1, y, z1], [x2, y, z2], 0.025, 0.025, 6);
    const alongX = z1 === z2;
    const yaw = alongX ? 0 : Math.PI / 2;
    const center: Vec3 = [(x1 + x2) / 2, height / 2, (z1 + z2) / 2];
    addMesh(g, new THREE.PlaneGeometry(span, height), patterned('chain', M.chainLinkBase, span / 0.1, height / 0.1), center, [0, yaw, 0]);
    markCollider(g, [span, height, 0.1], center, yaw);
    if (windscreen && alongX) {
      const outward = Math.sign(z1) * 0.03;
      addMesh(g, new THREE.PlaneGeometry(span, 1.8), M.windscreen, [center[0], 0.95, center[2] + outward], [0, yaw, 0]);
    }
  });
}

// 中間會下垂的球網（網球、匹克球）：網柱處高 postHeight、正中間 centerHeight，上緣白色網帶，
// 正中間有一條往下拉的白色中帶。網面沿 z，half 是網柱到中心的距離。
function addSagNet(g: THREE.Object3D, M: SportsMaterials, x: number, z: number, half: number, postHeight: number, centerHeight: number, cell: number, postRadius: number): void {
  for (const side of [1, -1]) {
    cylinder(g, M.darkMetal, postRadius, postHeight + 0.04, [x, (postHeight + 0.04) / 2, z + side * half], 10);
    cylinder(g, M.darkMetal, postRadius * 4, 0.04, [x, 0.02, z + side * half], 14);
  }
  const geometry = new THREE.PlaneGeometry(half * 2, postHeight, 16, 1);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    if (positions.getY(i) <= 0) continue;
    const t = positions.getX(i) / half;
    positions.setY(i, positions.getY(i) - (postHeight - centerHeight) * (1 - t * t));
  }
  geometry.computeVertexNormals();
  geometry.rotateY(Math.PI / 2);
  addMesh(g, geometry, netMaterial(M, half * 2, postHeight, cell), [x, postHeight / 2, z]);
  markCollider(g, [0.1, postHeight, half * 2 + 0.1], [x, postHeight / 2, z]);
  const tape = new THREE.CatmullRomCurve3([new THREE.Vector3(x, postHeight, z - half), new THREE.Vector3(x, centerHeight, z), new THREE.Vector3(x, postHeight, z + half)]);
  addMesh(g, new THREE.TubeGeometry(tape, 24, 0.025, 6), M.white, [0, 0, 0]);
  box(g, M.white, [0.012, centerHeight, 0.05], [x, centerHeight / 2, z]);
}

// 高腳裁判椅：四支斜腳、座位、椅背、腳踏與後方梯子，面向 +z。
function addUmpireChair(g: THREE.Object3D, M: SportsMaterials, position: Vec3): void {
  const chair = childGroup(g, position);
  const height = 1.9;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) rod(chair, M.white, [sx * 0.45, 0, sz * 0.45], [sx * 0.3, height, sz * 0.3], 0.025);
    box(chair, M.white, [0.04, 0.03, 0.45], [sx * 0.32, height + 0.28, 0]);
  }
  box(chair, M.darkGray, [0.62, 0.05, 0.6], [0, height, 0]);
  box(chair, M.darkGray, [0.62, 0.55, 0.05], [0, height + 0.3, -0.3]);
  box(chair, M.white, [0.6, 0.04, 0.2], [0, height * 0.55, 0.42]);
  for (let k = 1; k <= 5; k++) box(chair, M.white, [0.5, 0.04, 0.07], [0, (k * height) / 6, -0.45 - (k / 6) * 0.1]);
}

// ---------- 籃球 ----------
// 籃架：籃板面離端線 1.2 m，籃框中心再往場內 0.375 m、高 3.05 m；支架底座在端線外，有護墊。
function addHoop(g: THREE.Object3D, M: SportsMaterials, side: number): void {
  const baseline = BB.length / 2;
  const boardX = side * (baseline - HOOP.boardFromBaseline);
  const boardY = HOOP.boardBottom + HOOP.boardHeight / 2;
  addMesh(g, new THREE.PlaneGeometry(HOOP.boardWidth, HOOP.boardHeight), M.backboard, [boardX, boardY, 0], [0, -side * Math.PI / 2, 0]);
  const frameX = boardX + side * 0.02;
  for (const y of [HOOP.boardBottom, HOOP.boardBottom + HOOP.boardHeight]) box(g, M.darkMetal, [0.04, 0.04, HOOP.boardWidth], [frameX, y, 0]);
  for (const z of [-HOOP.boardWidth / 2, HOOP.boardWidth / 2]) box(g, M.darkMetal, [0.04, HOOP.boardHeight, 0.04], [frameX, boardY, z]);
  box(g, M.padBlue, [0.07, 0.07, HOOP.boardWidth + 0.04], [boardX, HOOP.boardBottom - 0.035, 0]);
  const rimX = boardX - side * (HOOP.rimGap + HOOP.rimRadius);
  addMesh(g, new THREE.TorusGeometry(HOOP.rimRadius, 0.01, 8, 32), M.rim, [rimX, HOOP.rimY, 0], [Math.PI / 2, 0, 0]);
  box(g, M.rim, [HOOP.rimGap, 0.05, 0.14], [boardX - side * HOOP.rimGap / 2, HOOP.rimY - 0.03, 0]);
  addMesh(g, new THREE.CylinderGeometry(HOOP.rimRadius, 0.15, HOOP.netLength, 16, 1, true), M.hoopNet, [rimX, HOOP.rimY - HOOP.netLength / 2, 0]);
  const baseX = side * (baseline + HOOP.baseBehind);
  const poleX = baseX - side * 0.3;
  const armFrom = boardX + side * 0.05;
  box(g, M.darkMetal, [0.18, HOOP.armY + 0.1 - 1, 0.18], [poleX, (1 + HOOP.armY + 0.1) / 2, 0]);
  box(g, M.darkMetal, [Math.abs(poleX - armFrom), 0.12, 0.12], [(poleX + armFrom) / 2, HOOP.armY, 0]);
  rod(g, M.darkMetal, [poleX, 2.4, 0], [(poleX + armFrom) / 2, HOOP.armY, 0], 0.05);
  box(g, M.darkGray, [1, 1, 1.6], [baseX, 0.5, 0]);
  markCollider(g, [1.1, HOOP.armY, 1.6], [baseX - side * 0.1, HOOP.armY / 2, 0]);
  box(g, M.padBlue, [0.08, 0.9, 1.5], [baseX - side * 0.54, 0.5, 0]);
  box(g, M.padBlue, [0.3, 1.6, 0.3], [poleX, 1.8, 0]);
}

function buildBasketball(g: THREE.Group, M: SportsMaterials, rng: Rng): void {
  courtFloor(g, M.courtBasketball, BB.apronLength, BB.apronWidth);
  for (const side of [1, -1]) addHoop(g, M, side);
  for (const x of [-3, 3]) addBench(g, M, [x, 0, BB.apronWidth / 2 - 0.6], 3, Math.PI);
  for (let i = 0; i < 3; i++) sphere(g, M.basketball, BALL_RADIUS.basketball, [range(rng, [-12, 12]), COURT_LIFT + BALL_RADIUS.basketball, range(rng, [-6, 6])], 20);
  addBallRack(g, M, rng, M.basketball, BALL_RADIUS.basketball, [-9.5, 0, BB.apronWidth / 2 - 0.7], 0);
}

// ---------- 放球的地方 ----------
// 兩層球架：四支腳、每層兩根平行的橫桿，球卡在兩根桿子中間排成一列；最上面少一兩顆（被拿去用了）。自身 x 是長邊。
function addBallRack(g: THREE.Object3D, M: SportsMaterials, rng: Rng, ball: THREE.Material, radius: number, position: Vec3, yaw: number): void {
  const rack = childGroup(g, position, yaw);
  const length = 1.5;
  const tiers = [0.32, 0.82];
  const railGap = radius * 1.2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) rod(rack, M.metal, [sx * length / 2, 0, sz * (railGap / 2 + 0.03)], [sx * length / 2, tiers[1] ?? 0.82, sz * (railGap / 2 + 0.03)], 0.016, 0.016, 6);
  }
  const perTier = Math.floor((length - 0.1) / (radius * 2 + 0.01));
  tiers.forEach((y, tier) => {
    for (const sz of [-1, 1]) rod(rack, M.metal, [-length / 2, y, sz * railGap / 2], [length / 2, y, sz * railGap / 2], 0.012, 0.012, 6);
    for (let k = 0; k < perTier; k++) {
      if (tier === tiers.length - 1 && rng() < 0.2) continue;
      sphere(rack, ball, radius, [-length / 2 + 0.05 + radius + k * (radius * 2 + 0.01), y + radius * 0.55, 0], 16);
    }
  });
}

// 球桶：開口的塑膠桶，裡面堆滿球（匹克球、壁球這種小球）。
function addBallBucket(g: THREE.Object3D, M: SportsMaterials, ball: THREE.Material, radius: number, position: Vec3): void {
  const bucket = childGroup(g, position);
  addMesh(bucket, new THREE.CylinderGeometry(0.17, 0.14, 0.32, 16, 1, true), M.bucket, [0, 0.16, 0]);
  cylinder(bucket, M.bucket, 0.14, 0.01, [0, 0.005, 0], 16);
  addMesh(bucket, new THREE.TorusGeometry(0.17, 0.012, 6, 20).rotateX(Math.PI / 2), M.bucket, [0, 0.32, 0]);
  for (let k = 0; k < 14; k++) {
    const angle = k * 2.4;
    const ring = (k % 7) / 7;
    sphere(bucket, ball, radius, [Math.cos(angle) * 0.11 * ring, 0.28 + Math.floor(k / 7) * radius * 1.6, Math.sin(angle) * 0.11 * ring], 10);
  }
}

// 羽球盒：藍色開口小箱子，裡面直立一排排羽毛球。
function addShuttleCrate(g: THREE.Object3D, M: SportsMaterials, position: Vec3): void {
  const crate = childGroup(g, position);
  box(crate, M.crate, [0.42, 0.02, 0.3], [0, 0.01, 0]);
  for (const sx of [-1, 1]) box(crate, M.crate, [0.02, 0.18, 0.3], [sx * 0.2, 0.09, 0]);
  for (const sz of [-1, 1]) box(crate, M.crate, [0.42, 0.18, 0.02], [0, 0.09, sz * 0.14]);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      const shuttle = childGroup(crate, [-0.135 + i * 0.09, 0.02, -0.08 + j * 0.08]);
      addMesh(shuttle, new THREE.SphereGeometry(0.0125, 10, 6, 0, TAU, Math.PI / 2, Math.PI / 2), M.cork, [0, 0.0125, 0], [Math.PI, 0, 0]);
      addMesh(shuttle, new THREE.CylinderGeometry(0.033, 0.013, 0.06, 12, 1, true), M.shuttle, [0, 0.045, 0]);
    }
  }
}

// ---------- 網球 ----------
// 球籃推車：四支腳、鐵絲籃、上面堆滿球。
function addBallCart(g: THREE.Object3D, M: SportsMaterials, position: Vec3): void {
  const cart = childGroup(g, position);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) rod(cart, M.metal, [sx * 0.22, 0, sz * 0.22], [sx * 0.25, 0.85, sz * 0.25], 0.012);
  }
  box(cart, M.metal, [0.5, 0.02, 0.5], [0, 0.55, 0]);
  addMesh(cart, new THREE.CylinderGeometry(0.36, 0.3, 0.32, 4, 1, true).rotateY(Math.PI / 4), patterned('chain', M.chainLinkBase, 3, 1), [0, 0.71, 0]);
  for (let i = 0; i < 25; i++) sphere(cart, M.tennisBall, BALL_RADIUS.tennis, [((i % 5) - 2) * 0.08, 0.6 + Math.floor(i / 5) * 0.05, (Math.floor(i / 5) - 2) * 0.08], 10);
}

function buildTennis(g: THREE.Group, M: SportsMaterials, rng: Rng): void {
  courtFloor(g, M.courtTennis, TN.areaLength, TN.areaWidth);
  addSagNet(g, M, 0, 0, TN.width / 2 + TN.postOutside, TN.netPost, TN.netCenter, 0.045, 0.04);
  addUmpireChair(g, M, [0, 0, -(TN.width / 2 + TN.postOutside + 1.2)]);
  for (const x of [-2.2, 2.2]) addBench(g, M, [x, 0, TN.width / 2 + 2.6], 2, Math.PI);
  addBallCart(g, M, [TN.length / 2 + 3, 0, TN.width / 2 - 1]);
  for (let i = 0; i < 5; i++) sphere(g, M.tennisBall, BALL_RADIUS.tennis, [range(rng, [-14, 14]), COURT_LIFT + BALL_RADIUS.tennis, range(rng, [-6, 6])], 10);
}

// ---------- 排球 ----------
// 球網：柱子在邊線外 postOffset，網高 netHeight、上緣在 netTop；上下白帶、邊線上的白色側帶與紅白標竿。
function addVolleyNet(g: THREE.Object3D, M: SportsMaterials, courtWidth: number, groundY: number): void {
  const postZ = courtWidth / 2 + VB.postOffset;
  for (const z of [postZ, -postZ]) {
    cylinder(g, M.metal, 0.05, VB.postHeight, [0, groundY + VB.postHeight / 2, z], 12);
    cylinder(g, M.padBlue, 0.11, 1.9, [0, groundY + 0.95, z], 16);
    cylinder(g, M.darkMetal, 0.25, 0.05, [0, groundY + 0.025, z], 20);
  }
  const netWidth = courtWidth + 1;
  const netCenterY = groundY + VB.netTop - VB.netHeight / 2;
  markCollider(g, [0.3, VB.postHeight, postZ * 2 + 0.3], [0, groundY + VB.postHeight / 2, 0]);
  addMesh(g, upright(netWidth, VB.netHeight), netMaterial(M, netWidth, VB.netHeight, 0.1), [0, netCenterY, 0]);
  box(g, M.white, [0.02, 0.07, netWidth], [0, groundY + VB.netTop - 0.035, 0]);
  box(g, M.white, [0.02, 0.05, netWidth], [0, groundY + VB.netTop - VB.netHeight + 0.025, 0]);
  for (const z of [courtWidth / 2, -courtWidth / 2]) {
    box(g, M.white, [0.025, VB.netHeight, 0.05], [0, netCenterY, z]);
    cylinder(g, M.antenna, 0.01, 1.8, [0, groundY + VB.netTop - VB.netHeight + 0.9, z], 8);
  }
  for (const side of [1, -1]) rod(g, M.darkMetal, [0, groundY + VB.netTop, side * netWidth / 2], [0, groundY + VB.netTop + 0.05, side * postZ], 0.008, 0.008, 6);
}

// 排球裁判台：在網柱外側，平台高 1.6 m，有欄杆和梯子。
function addRefereeStand(g: THREE.Object3D, M: SportsMaterials, z: number, groundY: number): void {
  const height = 1.6;
  const stand = childGroup(g, [0, groundY, z]);
  for (const dx of [-0.3, 0.3]) {
    for (const dz of [-0.3, 0.3]) rod(stand, M.metal, [dx * 1.3, 0, dz * 1.3], [dx, height, dz], 0.02);
  }
  box(stand, M.darkGray, [0.7, 0.05, 0.7], [0, height, 0]);
  const corners: [number, number][] = [[-0.33, -0.33], [0.33, -0.33], [0.33, 0.33], [-0.33, 0.33]];
  corners.forEach(([x, cz], i) => {
    rod(stand, M.metal, [x, height, cz], [x, height + 0.9, cz], 0.015);
    if (i < 3) {
      const [nx, nz] = corners[i + 1] ?? [x, cz];
      rod(stand, M.metal, [x, height + 0.9, cz], [nx, height + 0.9, nz], 0.015);
    }
  });
  for (let k = 1; k <= 4; k++) box(stand, M.metal, [0.45, 0.03, 0.08], [0, (k * height) / 5, -0.55]);
  for (const x of [-0.24, 0.24]) rod(stand, M.metal, [x, 0, -0.62], [x, height, -0.4], 0.015);
}

function buildVolleyball(g: THREE.Group, M: SportsMaterials, rng: Rng): void {
  courtFloor(g, M.courtVolleyball, VB.apronLength, VB.apronWidth);
  addVolleyNet(g, M, VB.width, COURT_LIFT);
  addRefereeStand(g, M, -(VB.width / 2 + VB.postOffset + 0.9), COURT_LIFT);
  for (const x of [-4.5, 4.5]) addBench(g, M, [x, 0, VB.width / 2 + 2.4], 3, Math.PI);
  sphere(g, M.volleyball, BALL_RADIUS.volleyball, [range(rng, [-6, 6]), COURT_LIFT + BALL_RADIUS.volleyball, range(rng, [-3, 3])], 20);
  addBallRack(g, M, rng, M.volleyball, BALL_RADIUS.volleyball, [8.5, 0, VB.width / 2 + 2.4], 0);
}

// 沙灘排球：架高的沙坑（木框圍邊），場線是藍色織帶，網子和室內一樣。
function buildBeachVolleyball(g: THREE.Group, M: SportsMaterials, rng: Rng): void {
  const { pitchLength, pitchWidth, sand, border, borderHeight } = BEACH;
  box(g, M.sand, [pitchLength, sand, pitchWidth], [0, sand / 2, 0]);
  courtFloor(g, M.sandTop, pitchLength, pitchWidth, [0, sand + 0.002, 0]);
  for (const side of [1, -1]) {
    box(g, M.timber, [pitchLength + border * 2, borderHeight, border], [0, borderHeight / 2, side * (pitchWidth + border) / 2]);
    box(g, M.timber, [border, borderHeight, pitchWidth], [side * (pitchLength + border) / 2, borderHeight / 2, 0]);
  }
  const lineY = sand + 0.008;
  for (const side of [1, -1]) {
    box(g, M.strap, [BEACH.length, 0.01, 0.05], [0, lineY, side * (BEACH.width / 2 - 0.025)]);
    box(g, M.strap, [0.05, 0.01, BEACH.width], [side * (BEACH.length / 2 - 0.025), lineY, 0]);
  }
  addVolleyNet(g, M, BEACH.width, sand);
  addRefereeStand(g, M, -(BEACH.width / 2 + VB.postOffset + 0.9), sand);
  sphere(g, M.volleyball, BALL_RADIUS.volleyball, [range(rng, [-5, 5]), sand + BALL_RADIUS.volleyball * 0.8, range(rng, [-3, 3])], 20);
  addBallRack(g, M, rng, M.volleyball, BALL_RADIUS.volleyball, [pitchLength / 2 - 1.2, sand, pitchWidth / 2 - 0.8], 0);
}

// ---------- 匹克球、羽球 ----------
function buildPickleball(g: THREE.Group, M: SportsMaterials, rng: Rng): void {
  for (const cx of [-PB.areaLength / 2, PB.areaLength / 2]) {
    for (const cz of [-PB.areaWidth / 2, PB.areaWidth / 2]) {
      courtFloor(g, M.courtPickleball, PB.areaLength, PB.areaWidth, [cx, COURT_LIFT, cz]);
      addSagNet(g, M, cx, cz, PB.width / 2 + PB.postOffset, PB.netPost, PB.netCenter, 0.04, 0.03);
      for (let i = 0; i < 2; i++) sphere(g, M.pickleball, BALL_RADIUS.pickleball, [cx + range(rng, [-5, 5]), COURT_LIFT + BALL_RADIUS.pickleball, cz + range(rng, [-2.5, 2.5])], 12);
      addBallBucket(g, M, M.pickleball, BALL_RADIUS.pickleball, [cx + Math.sign(cx) * (PB.areaLength / 2 - 0.6), 0, cz + Math.sign(cz) * (PB.areaWidth / 2 - 0.6)]);
    }
  }
  addFence(g, M, PB.areaLength * 2, PB.areaWidth * 2, PB.fence, true);
}

function addBadmintonNet(g: THREE.Object3D, M: SportsMaterials, x: number, z: number): void {
  const half = BD.width / 2;
  for (const side of [1, -1]) {
    cylinder(g, M.metal, 0.02, BD.postHeight, [x, BD.postHeight / 2, z + side * half], 10);
    cylinder(g, M.darkGray, 0.22, 0.06, [x, 0.03, z + side * half], 18);
    rod(g, M.white, [x, BD.netTop, z + side * (half - 0.02)], [x, BD.postHeight - 0.01, z + side * half], 0.004, 0.004, 4);
  }
  addMesh(g, upright(BD.width, BD.netDepth), netMaterial(M, BD.width, BD.netDepth, 0.02), [x, BD.netTop - BD.netDepth / 2, z]);
  markCollider(g, [0.1, BD.postHeight, BD.width + 0.1], [x, BD.postHeight / 2, z]);
  box(g, M.white, [0.015, 0.075, BD.width], [x, BD.netTop - 0.0375, z]);
}

// 羽毛球：軟木球頭（半球）加一圈往外張開的羽毛裙，側躺在地上。
function addShuttlecock(g: THREE.Object3D, M: SportsMaterials, position: Vec3, yaw: number): void {
  const shuttle = childGroup(g, position, yaw);
  shuttle.rotation.z = Math.PI / 2 - 0.25;
  addMesh(shuttle, new THREE.SphereGeometry(0.0125, 12, 8, 0, TAU, Math.PI / 2, Math.PI / 2), M.cork, [0, 0, 0]);
  addMesh(shuttle, new THREE.CylinderGeometry(0.033, 0.013, 0.06, 16, 1, true), M.shuttle, [0, 0.03, 0]);
}

function buildBadminton(g: THREE.Group, M: SportsMaterials, rng: Rng): void {
  for (const cx of [-BD.areaLength / 2, BD.areaLength / 2]) {
    for (const cz of [-BD.areaWidth / 2, BD.areaWidth / 2]) {
      courtFloor(g, M.courtBadminton, BD.areaLength, BD.areaWidth, [cx, COURT_LIFT, cz]);
      addBadmintonNet(g, M, cx, cz);
      for (let i = 0; i < 2; i++) addShuttlecock(g, M, [cx + range(rng, [-5, 5]), COURT_LIFT + 0.03, cz + range(rng, [-2.5, 2.5])], rng() * TAU);
      addShuttleCrate(g, M, [cx + Math.sign(cx) * (BD.areaLength / 2 - 0.6), 0, cz + Math.sign(cz) * (BD.areaWidth / 2 - 0.5)]);
    }
  }
}

// ---------- 桌球 ----------
// 球拍：木板夾在紅、黑兩面膠皮之間，加一支握把。
function addPaddle(g: THREE.Object3D, M: SportsMaterials, position: Vec3, yaw: number): void {
  const paddle = childGroup(g, position, yaw);
  const layers: [THREE.Material, number][] = [[M.rubberBlack, 0.002], [M.lightWood, 0.0055], [M.rubberRed, 0.009]];
  for (const [material, y] of layers) addMesh(paddle, new THREE.CylinderGeometry(0.075, 0.075, 0.0035, 24), material, [0, y, 0]).scale.set(1, 1, 0.92);
  box(paddle, M.lightWood, [0.1, 0.024, 0.026], [0.12, 0.012, 0]);
}

function addPingPongTable(g: THREE.Object3D, M: SportsMaterials, rng: Rng, position: Vec3): void {
  const table = childGroup(g, position);
  box(table, M.tableTop, [TT.length, TT.top, TT.width], [0, TT.height - TT.top / 2, 0]);
  box(table, M.darkGray, [TT.length - 0.1, 0.05, TT.width - 0.1], [0, TT.height - TT.top - 0.025, 0]);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      rod(table, M.darkMetal, [sx * 1.05, 0.06, sz * 0.6], [sx * 0.95, TT.height - 0.08, sz * 0.62], 0.02);
      addMesh(table, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), M.black, [sx * 1.05, 0.04, sz * 0.6], [Math.PI / 2, 0, 0]);
    }
    rod(table, M.darkMetal, [sx * 1, 0.3, -0.6], [sx * 1, 0.3, 0.6], 0.015);
  }
  rod(table, M.darkMetal, [-0.95, 0.3, 0], [0.95, 0.3, 0], 0.02);
  const netWidth = TT.width + TT.netOverhang * 2;
  addMesh(table, upright(netWidth, TT.netHeight), netMaterial(M, netWidth, TT.netHeight, 0.012), [0, TT.height + TT.netHeight / 2, 0]);
  box(table, M.white, [0.01, 0.015, netWidth], [0, TT.height + TT.netHeight - 0.0075, 0]);
  for (const sz of [1, -1]) {
    box(table, M.darkGray, [0.03, TT.netHeight + 0.02, 0.03], [0, TT.height + TT.netHeight / 2, sz * netWidth / 2]);
    box(table, M.darkGray, [0.06, 0.04, 0.12], [0, TT.height - 0.01, sz * (TT.width / 2 + 0.03)]);
  }
  for (const side of [1, -1]) addPaddle(table, M, [side * range(rng, [0.5, 1.1]), TT.height, range(rng, [-0.4, 0.4])], rng() * TAU);
  sphere(table, M.white, BALL_RADIUS.pingPong, [range(rng, [-0.5, 0.5]), TT.height + BALL_RADIUS.pingPong, range(rng, [-0.5, 0.5])], 12);
}

// 擋板：長 2 m、高 0.7 m，底下兩個支腳。
function addBarrier(g: THREE.Object3D, M: SportsMaterials, position: Vec3, yaw: number): void {
  const barrier = childGroup(g, position, yaw);
  box(barrier, M.barrier, [1.96, 0.6, 0.02], [0, 0.4, 0]);
  for (const x of [-0.85, 0.85]) box(barrier, M.barrier, [0.04, 0.04, 0.35], [x, 0.02, 0]);
}

// 3 × 2 個桌球區：紅色運動地板，區和區之間用擋板隔開（相鄰兩區共用一排擋板）。
function buildTableTennis(g: THREE.Group, M: SportsMaterials, rng: Rng): void {
  const columns = [-TT.areaLength, 0, TT.areaLength];
  const rows = [-TT.areaWidth / 2, TT.areaWidth / 2];
  for (const cx of columns) {
    for (const cz of rows) {
      courtFloor(g, M.redFloor, TT.areaLength - 0.4, TT.areaWidth - 0.2, [cx, COURT_LIFT, cz]);
      addPingPongTable(g, M, rng, [cx, COURT_LIFT, cz]);
    }
    for (const lineZ of [-TT.areaWidth, 0, TT.areaWidth]) {
      for (const dx of [-3, -1, 1, 3]) addBarrier(g, M, [cx + dx, COURT_LIFT, lineZ], 0);
    }
  }
  for (const lineX of [-1.5, -0.5, 0.5, 1.5].map((k) => k * TT.areaLength)) {
    for (const cz of rows) {
      for (const dz of [-1.05, 1.05]) addBarrier(g, M, [lineX, COURT_LIFT, cz + dz], Math.PI / 2);
    }
  }
}

// ---------- 五人制足球 ----------
// 球門：3 × 2 m，白色門柱與橫樑；後面是往下加深的網框，背網、側網、頂網都是白色網子。
function addFutsalGoal(g: THREE.Object3D, M: SportsMaterials, side: number): void {
  const x = side * (FS.length / 2 + FS.post / 2);
  const half = FS.goalWidth / 2;
  const back = side * (FS.length / 2 + FS.goalDepth);
  const topBack = side * (FS.length / 2 + FS.goalDepth * 0.8);
  for (const z of [-half, half]) {
    box(g, M.white, [FS.post, FS.goalHeight, FS.post], [x, FS.goalHeight / 2, z]);
    rod(g, M.white, [x, 0.02, z], [back, 0.02, z], 0.02, 0.02, 6);
    rod(g, M.white, [x, FS.goalHeight - 0.02, z], [topBack, FS.goalHeight - 0.02, z], 0.02, 0.02, 6);
    rod(g, M.white, [topBack, FS.goalHeight - 0.02, z], [back, 0.02, z], 0.02, 0.02, 6);
  }
  box(g, M.white, [FS.post, FS.post, FS.goalWidth + FS.post], [x, FS.goalHeight - FS.post / 2, 0]);
  rod(g, M.white, [back, 0.02, -half], [back, 0.02, half], 0.02, 0.02, 6);
  const goalNet = (w: number, h: number): THREE.MeshLambertMaterial => netMaterial(M, w, h, 0.12, M.goalNetBase);
  const backMid = (back + topBack) / 2;
  markCollider(g, [FS.goalDepth + FS.post, FS.goalHeight, FS.goalWidth + FS.post], [(x + back) / 2, FS.goalHeight / 2, 0]);
  addMesh(g, upright(FS.goalWidth, FS.goalHeight), goalNet(FS.goalWidth, FS.goalHeight), [backMid, FS.goalHeight / 2, 0], [0, 0, side * Math.atan2(FS.goalDepth * 0.2, FS.goalHeight)]);
  for (const z of [-half, half]) addMesh(g, new THREE.PlaneGeometry(FS.goalDepth, FS.goalHeight), goalNet(FS.goalDepth, FS.goalHeight), [(x + back) / 2, FS.goalHeight / 2, z]);
  addMesh(g, flat(FS.goalDepth * 0.8, FS.goalWidth), goalNet(FS.goalDepth * 0.8, FS.goalWidth), [(x + topBack) / 2, FS.goalHeight, 0]);
}

function buildFutsal(g: THREE.Group, M: SportsMaterials, rng: Rng): void {
  courtFloor(g, M.courtFutsal, FS.areaLength, FS.areaWidth);
  for (const side of [1, -1]) addFutsalGoal(g, M, side);
  for (const x of [-4, 4]) addBench(g, M, [x, 0, FS.areaWidth / 2 - 0.4], 3, Math.PI);
  for (let i = 0; i < 2; i++) sphere(g, M.soccerBall, BALL_RADIUS.futsal, [range(rng, [-15, 15]), COURT_LIFT + BALL_RADIUS.futsal, range(rng, [-7, 7])], 20);
  addBallRack(g, M, rng, M.soccerBall, BALL_RADIUS.futsal, [9.5, 0, FS.areaWidth / 2 - 0.5], 0);
}

// ---------- 壁球 ----------
// 一面壁球場：前牆在 -z，左右側牆，後面是 2.13 m 高的玻璃牆；牆面內側貼上畫了紅線的貼圖。
function addSquashCourt(g: THREE.Object3D, M: SportsMaterials, rng: Rng, centerX: number): void {
  const court = childGroup(g, [centerX, 0, 0]);
  skipCollider(court);
  const halfLength = SQ.length / 2;
  const halfWidth = SQ.width / 2;
  const door = 1.6;
  markCollider(court, [SQ.width + SQ.wall * 2, SQ.wallHeight, SQ.wall], [0, SQ.wallHeight / 2, -halfLength - SQ.wall / 2]);
  for (const side of [1, -1]) markCollider(court, [SQ.wall, SQ.wallHeight, SQ.length], [side * (halfWidth + SQ.wall / 2), SQ.wallHeight / 2, 0]);
  markCollider(court, [SQ.width - door, SQ.backOut, 0.1], [-door / 2, SQ.backOut / 2, halfLength + 0.02]);
  courtFloor(court, M.squashFloor, SQ.width, SQ.length);
  box(court, M.plaster, [SQ.width + SQ.wall * 2, SQ.wallHeight, SQ.wall], [0, SQ.wallHeight / 2, -halfLength - SQ.wall / 2]);
  addMesh(court, new THREE.PlaneGeometry(SQ.width, SQ.wallHeight), M.squashFront, [0, SQ.wallHeight / 2, -halfLength + 0.005]);
  for (const side of [1, -1]) {
    box(court, M.plaster, [SQ.wall, SQ.wallHeight, SQ.length], [side * (halfWidth + SQ.wall / 2), SQ.wallHeight / 2, 0]);
    addMesh(court, new THREE.PlaneGeometry(SQ.length, SQ.wallHeight), side < 0 ? M.squashLeft : M.squashRight, [side * (halfWidth - 0.005), SQ.wallHeight / 2, 0], [0, -side * Math.PI / 2, 0]);
  }
  box(court, M.glass, [SQ.width, SQ.backOut, 0.03], [0, SQ.backOut / 2, halfLength + 0.015]);
  for (const x of [-halfWidth, 0.9, halfWidth]) box(court, M.darkMetal, [0.04, SQ.backOut, 0.05], [x, SQ.backOut / 2, halfLength + 0.03]);
  box(court, M.darkMetal, [SQ.width, 0.05, 0.05], [0, SQ.backOut, halfLength + 0.03]);
  // 球拍：橢圓框（壓扁的圓環）、拍頸與握把，靠在牆邊
  const racket = childGroup(court, [range(rng, [-2.5, 2.5]), 0.012, range(rng, [0, 3])], rng() * TAU);
  addMesh(racket, new THREE.TorusGeometry(0.1, 0.008, 6, 24), M.darkGray, [0, 0, 0], [Math.PI / 2, 0, 0]).scale.set(1, 1.3, 1);
  box(racket, M.black, [0.03, 0.02, 0.3], [0, 0, 0.27]);
  sphere(court, M.squashBall, BALL_RADIUS.squash, [range(rng, [-2.5, 2.5]), COURT_LIFT + BALL_RADIUS.squash, range(rng, [-3, 3])], 10);
}

// 兩面相鄰的壁球場，後面玻璃牆外是兩階看台長椅。
function buildSquash(g: THREE.Group, M: SportsMaterials, rng: Rng): void {
  const offset = SQ.width / 2 + SQ.wall / 2;
  for (const side of [1, -1]) addSquashCourt(g, M, rng, side * offset);
  addBallBucket(g, M, M.squashBall, BALL_RADIUS.squash * 2, [SQ.width + 0.1, 0, SQ.length / 2 + 0.6]);
  for (const [z, y] of [[SQ.length / 2 + 1, 0], [SQ.length / 2 + 2, 0.4]] as const) {
    if (y > 0) {
      box(g, M.concrete, [SQ.width * 2 + 0.6, y, 1], [0, y / 2, z]);
      markCollider(g, [SQ.width * 2 + 0.6, y, 1], [0, y / 2, z]);
    }
    for (const side of [1, -1]) addBench(g, M, [side * offset, y, z], 4, Math.PI);
  }
}

// ---------- 拳擊 ----------
function buildBoxing(g: THREE.Group, M: SportsMaterials): void {
  const H = RING.height;
  const post = RING.inside / 2 + 0.15;
  courtFloor(g, M.mat, RING.area, RING.area);
  box(g, M.ringSkirt, [RING.platform, H, RING.platform], [0, H / 2, 0]);
  markCollider(g, [RING.platform, H + RING.post, RING.platform], [0, (H + RING.post) / 2, 0]);
  addMesh(g, flat(RING.platform, RING.platform), M.ringCanvas, [0, H + 0.002, 0]);
  const corners: [number, number, THREE.Material][] = [[post, post, M.padRed], [-post, post, M.white], [-post, -post, M.padBlue], [post, -post, M.white]];
  const ropeColors = [M.ropeRed, M.white, M.ropeBlue, M.ropeRed];
  corners.forEach(([x, z, pad], i) => {
    cylinder(g, M.metal, 0.07, RING.post, [x, H + RING.post / 2, z], 12);
    box(g, pad, [0.24, 1.3, 0.24], [x * 0.98, H + 0.85, z * 0.98]);
    const [nx, nz] = corners[(i + 1) % corners.length] ?? [x, z];
    RING.ropes.forEach((height, k) => rod(g, ropeColors[k] ?? M.white, [x, H + height, z], [nx, H + height, nz], 0.025, 0.025, 8));
    box(g, M.white, [0.05, RING.ropes[RING.ropes.length - 1] ?? 1.5, 0.05], [(x + nx) / 2, H + 0.8, (z + nz) / 2]);
  });
  // 紅、藍兩角的台階與角落凳子
  for (const [sx, sz] of [[1, 1], [-1, -1]]) {
    for (let step = 0; step < 3; step++) {
      const depth = 0.3;
      box(g, M.darkGray, [1, (step + 1) * (H / 3), depth], [(sx ?? 1) * (post - 0.8), ((step + 1) * (H / 3)) / 2, (sz ?? 1) * (RING.platform / 2 + depth * (3 - step) - depth / 2)]);
    }
    const stool = childGroup(g, [(sx ?? 1) * (post - 0.45), H, (sz ?? 1) * (post - 0.45)]);
    cylinder(stool, M.black, 0.18, 0.05, [0, 0.55, 0], 16);
    for (let leg = 0; leg < 3; leg++) {
      const a = (leg / 3) * TAU;
      rod(stool, M.metal, [0.18 * Math.cos(a), 0, 0.18 * Math.sin(a)], [0.1 * Math.cos(a), 0.53, 0.1 * Math.sin(a)], 0.012);
    }
  }
  // 沙包架：門型鐵架掛三個沙包；旁邊一座速度球台
  const gantryZ = RING.area / 2 - 1;
  for (const x of [-4, 4]) {
    box(g, M.darkMetal, [0.12, 3.2, 0.12], [x, 1.6, gantryZ]);
    markCollider(g, [0.2, 3.2, 0.2], [x, 1.6, gantryZ]);
  }
  box(g, M.darkMetal, [8.2, 0.15, 0.15], [0, 3.2, gantryZ]);
  for (const x of [-2.5, 0, 2.5]) {
    rod(g, M.metal, [x, 3.15, gantryZ], [x, 2.3, gantryZ], 0.01, 0.01, 4);
    cylinder(g, M.heavyBag, 0.18, 1.15, [x, 1.7, gantryZ], 16);
    markCollider(g, [0.4, 1.2, 0.4], [x, 1.7, gantryZ]);
  }
  box(g, M.darkMetal, [0.12, 2.6, 0.12], [5.2, 1.3, gantryZ]);
  markCollider(g, [0.8, 2.6, 0.7], [5.2, 1.3, gantryZ - 0.2]);
  box(g, M.wood, [0.7, 0.06, 0.6], [5.2, 2.1, gantryZ - 0.3]);
  addMesh(g, new THREE.SphereGeometry(0.1, 12, 8), M.heavyBag, [5.2, 1.88, gantryZ - 0.35]).scale.set(1, 1.4, 1);
}

// ---------- 抱石 ----------
// 5 片不同角度的牆：每片從底邊往上轉，正角度是往攀爬者那側倒（仰角）；牆上隨機分布彩色岩點與幾個大的三角凸塊，
// 前面鋪滿厚護墊。
function buildBouldering(g: THREE.Group, M: SportsMaterials, rng: Rng): void {
  const { panelWidth, height, angles, holdsPerPanel, padDepth, padHeight, wallZ } = BOULDER;
  const total = panelWidth * angles.length;
  const chunkShapes = [new THREE.DodecahedronGeometry(1), new THREE.IcosahedronGeometry(1), new THREE.OctahedronGeometry(1)];
  angles.forEach((degrees, i) => {
    const panel = childGroup(g, [-total / 2 + panelWidth * (i + 0.5), 0, wallZ]);
    panel.rotation.x = THREE.MathUtils.degToRad(degrees);
    skipCollider(panel);
    markCollider(g, [panelWidth, height, 0.3], [-total / 2 + panelWidth * (i + 0.5), height / 2, wallZ - 0.1]);
    box(panel, M.wallPanels[i % M.wallPanels.length] ?? M.plaster, [panelWidth - 0.04, height, 0.2], [0, height / 2, -0.1]);
    for (let k = 0; k < holdsPerPanel; k++) {
      const size = range(rng, [0.07, 0.22]);
      const shape = chunkShapes[Math.floor(rng() * chunkShapes.length)] ?? chunkShapes[0];
      if (!shape) continue;
      const hold = addMesh(panel, shape.clone(), M.holds[Math.floor(rng() * M.holds.length)] ?? M.white,
        [range(rng, [-panelWidth / 2 + 0.25, panelWidth / 2 - 0.25]), range(rng, [0.3, height - 0.25]), size * 0.3], [rng() * TAU, rng() * TAU, rng() * TAU]);
      hold.scale.set(size, size, size * 0.55);
    }
    for (let k = 0; k < 2; k++) {
      const volume = addMesh(panel, new THREE.CylinderGeometry(0.5, 0.5, 0.35, 3), M.holds[Math.floor(rng() * M.holds.length)] ?? M.white,
        [range(rng, [-1.2, 1.2]), range(rng, [1, height - 1]), 0.12], [Math.PI / 2, 0, rng() * TAU]);
      volume.scale.set(1, 1, 0.7);
    }
  });
  const pads = Math.round(total / 2);
  for (let i = 0; i < pads; i++) {
    box(g, M.crashPads[i % M.crashPads.length] ?? M.mat, [2 - 0.03, padHeight, padDepth], [-total / 2 + 1 + i * 2, padHeight / 2, wallZ + padDepth / 2]);
  }
  addBench(g, M, [-6, 0, wallZ + padDepth + 1.2], 3, Math.PI);
  addBench(g, M, [6, 0, wallZ + padDepth + 1.2], 3, Math.PI);
  cylinder(g, M.white, 0.12, 0.2, [0, padHeight + 0.1, wallZ + padDepth - 0.3], 12);
}

// ---------- 撞球 ----------
// 球桿：握把（深色木頭）接球桿前段（淺色楓木），越往前越細。
function addCue(g: THREE.Object3D, M: SportsMaterials, butt: Vec3, tip: Vec3): void {
  const joint: Vec3 = [butt[0] + (tip[0] - butt[0]) * 0.45, butt[1] + (tip[1] - butt[1]) * 0.45, butt[2] + (tip[2] - butt[2]) * 0.45];
  rod(g, M.darkWood, butt, joint, 0.015, 0.011, 10);
  rod(g, M.lightWood, joint, tip, 0.011, 0.0065, 10);
}

// 球：一半的球檯是剛排好的三角陣（8 號在第三排中間），另一半是打到一半散開的。
function addBilliardBalls(t: THREE.Object3D, M: SportsMaterials, rng: Rng): void {
  const R = POOL_TABLE.ball;
  const y = POOL_TABLE.bedY + R;
  const halfL = POOL_TABLE.playLength / 2 - 0.08;
  const halfW = POOL_TABLE.playWidth / 2 - 0.08;
  if (rng() < 0.5) {
    const rack = [1, 10, 2, 9, 8, 11, 3, 12, 4, 13, 14, 5, 15, 6, 7];
    const footX = POOL_TABLE.playLength / 4;
    let index = 0;
    for (let row = 0; row < 5; row++) {
      for (let j = 0; j <= row; j++) {
        const material = M.balls[rack[index] ?? 1] ?? M.white;
        index += 1;
        sphere(t, material, R, [footX + row * R * Math.sqrt(3) * 1.01, y, (j - row / 2) * 2 * R * 1.01], 16);
      }
    }
    sphere(t, M.balls[0] ?? M.white, R, [-POOL_TABLE.playLength / 4, y, 0], 16);
    addCue(t, M, [-1.9, POOL_TABLE.railTop + 0.03, 0.05], [-0.75, POOL_TABLE.bedY + 0.02, 0.02]);
    return;
  }
  const placed: [number, number][] = [];
  for (let n = 0; n < 16; n++) {
    if (n > 0 && rng() < 0.3) continue;
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = range(rng, [-halfL, halfL]);
      const z = range(rng, [-halfW, halfW]);
      if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < R * 2.2)) continue;
      placed.push([x, z]);
      sphere(t, M.balls[n] ?? M.white, R, [x, y, z], 16);
      break;
    }
  }
  // 沒在用的三角框放在檯面一角
  const corner: Vec3 = [POOL_TABLE.playLength / 2 - 0.35, POOL_TABLE.bedY + 0.012, POOL_TABLE.playWidth / 2 - 0.3];
  const side = 0.33;
  const points: Vec3[] = [[corner[0], corner[1], corner[2] - side / 2], [corner[0] + side * 0.87, corner[1], corner[2]], [corner[0], corner[1], corner[2] + side / 2]];
  points.forEach((point, i) => rod(t, M.wood, point, points[(i + 1) % points.length] ?? point, 0.012, 0.012, 6));
  addCue(t, M, [-0.9, POOL_TABLE.bedY + 0.016, -0.45], [0.5, POOL_TABLE.bedY + 0.008, -0.25]);
}

// 9 呎撞球檯：絨布檯面（畫了袋口）、六段綠色庫邊、木頭檯邊上的 18 顆貝殼鑽石點、
// 六個黑色袋口與四角黃銅護角、檯身與六支檯腳、球、球桿與巧克。
function addBilliardTable(g: THREE.Object3D, M: SportsMaterials, rng: Rng, position: Vec3): void {
  const T = POOL_TABLE;
  const t = childGroup(g, position);
  const halfL = T.playLength / 2;
  const halfW = T.playWidth / 2;
  const outerL = T.playLength + 2 * (T.cushion + T.rail);
  const outerW = T.playWidth + 2 * (T.cushion + T.rail);
  box(t, M.felt, [T.playLength + 0.1, 0.05, T.playWidth + 0.1], [0, T.bedY - 0.025, 0]);
  const cushionY = T.railTop - 0.025;
  const longCushion = halfL - 0.17;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) box(t, M.cushion, [longCushion, 0.04, T.cushion], [sx * (0.07 + longCushion / 2), cushionY, sz * (halfW + T.cushion / 2)]);
    box(t, M.cushion, [T.cushion, 0.04, T.playWidth - 0.2], [sx * (halfL + T.cushion / 2), cushionY, 0]);
  }
  const railZ = halfW + T.cushion + T.rail / 2;
  const railX = halfL + T.cushion + T.rail / 2;
  for (const s of [1, -1]) {
    box(t, M.wood, [outerL, 0.06, T.rail], [0, T.railTop - 0.03, s * railZ]);
    box(t, M.wood, [T.rail, 0.06, T.playWidth + 2 * T.cushion], [s * railX, T.railTop - 0.03, 0]);
  }
  for (const sx of [1, -1]) {
    for (const k of [1, 2, 3]) {
      for (const sz of [1, -1]) cylinder(t, M.pearl, 0.009, 0.004, [sx * k * T.playLength / 8, T.railTop + 0.001, sz * railZ], 10);
    }
    for (const k of [-1, 0, 1]) cylinder(t, M.pearl, 0.009, 0.004, [sx * railX, T.railTop + 0.001, k * T.playWidth / 4], 10);
  }
  const pockets: [number, number][] = [[halfL + 0.02, halfW + 0.02], [-halfL - 0.02, halfW + 0.02], [halfL + 0.02, -halfW - 0.02], [-halfL - 0.02, -halfW - 0.02], [0, halfW + 0.035], [0, -halfW - 0.035]];
  for (const [px, pz] of pockets) cylinder(t, M.pocket, 0.068, 0.12, [px, T.railTop - 0.058, pz], 16);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) box(t, M.brass, [0.09, 0.064, 0.09], [sx * (outerL / 2 - 0.045), T.railTop - 0.031, sz * (outerW / 2 - 0.045)]);
  }
  box(t, M.darkWood, [outerL - 0.06, 0.2, outerW - 0.06], [0, T.railTop - 0.16, 0]);
  for (const lx of [-halfL + 0.1, 0, halfL - 0.1]) {
    for (const sz of [1, -1]) {
      box(t, M.darkWood, [0.16, 0.54, 0.16], [lx, 0.27, sz * halfW]);
      box(t, M.darkWood, [0.22, 0.05, 0.22], [lx, 0.025, sz * halfW]);
    }
  }
  addBilliardBalls(t, M, rng);
  box(t, M.chalk, [0.022, 0.022, 0.022], [range(rng, [-1, 1]), T.railTop + 0.011, railZ]);
}

// 吊燈：深綠燈罩、發光的燈面、黃銅邊，兩根吊桿接到屋頂。
function addLamp(g: THREE.Object3D, M: SportsMaterials, x: number, z: number, ceiling: number): void {
  const y = POOL_TABLE.bedY + 0.95;
  box(g, M.lampHood, [2, 0.2, 0.55], [x, y + 0.1, z]);
  box(g, M.lamp, [1.9, 0.02, 0.45], [x, y - 0.005, z]);
  markLight(g, [x, y - 0.02, z], 'indoor', 0.95);
  box(g, M.brass, [2.04, 0.03, 0.59], [x, y + 0.2, z]);
  for (const dx of [-0.8, 0.8]) rod(g, M.darkMetal, [x + dx, y + 0.2, z], [x + dx, ceiling, z], 0.008, 0.008, 6);
}

// 球桿架：靠在柱子內側的木板，插著 5 支球桿。
function addCueRack(g: THREE.Object3D, M: SportsMaterials, x: number, z: number, inward: number): void {
  box(g, M.wood, [0.6, 1.4, 0.04], [x, 1.2, z + inward * 0.15]);
  markCollider(g, [0.6, 1.5, 0.15], [x, 0.75, z + inward * 0.18]);
  for (const dx of [-0.24, -0.12, 0, 0.12, 0.24]) addCue(g, M, [x + dx, 0.05, z + inward * 0.22], [x + dx, 1.5, z + inward * 0.19]);
}

// 撞球亭：地毯、木柱、屋頂，3 × 2 張球檯，每張上方一盞吊燈。
function buildBilliards(g: THREE.Group, M: SportsMaterials, rng: Rng): void {
  const { length, width, height } = PAVILION;
  courtFloor(g, M.carpet, length, width);
  const postX = [-length / 2 + 0.7, -length / 6, length / 6, length / 2 - 0.7];
  const postZ = width / 2 - 0.5;
  for (const x of postX) {
    for (const s of [1, -1]) {
      box(g, M.darkWood, [0.25, height, 0.25], [x, height / 2, s * postZ]);
      markCollider(g, [0.3, height, 0.3], [x, height / 2, s * postZ]);
    }
  }
  for (const s of [1, -1]) {
    box(g, M.darkWood, [length - 1.2, 0.3, 0.3], [0, height - 0.15, s * postZ]);
    box(g, M.darkWood, [0.3, 0.3, width - 1], [s * (length / 2 - 0.7), height - 0.15, 0]);
  }
  box(g, M.roof, [length, 0.3, width], [0, height + 0.15, 0]);
  for (const cx of [-6.4, 0, 6.4]) {
    for (const cz of [-2.9, 2.9]) {
      addBilliardTable(g, M, rng, [cx, COURT_LIFT, cz]);
      addLamp(g, M, cx, cz, height);
    }
  }
  addCueRack(g, M, postX[1] ?? 0, postZ, -1);
  addCueRack(g, M, postX[2] ?? 0, -postZ, 1);
}

// ---------- 區段配置 ----------
type SectionKind = 'basketball' | 'tennis' | 'volleyball' | 'beachVolleyball' | 'pickleball' | 'badminton' | 'tableTennis'
  | 'futsal' | 'squash' | 'boxing' | 'bouldering' | 'billiards' | 'gym';
type SectionBuilder = (g: THREE.Group, M: SportsMaterials, rng: Rng) => void;
const SECTION_BUILDERS: Record<SectionKind, SectionBuilder> = {
  basketball: buildBasketball, tennis: buildTennis, volleyball: buildVolleyball, beachVolleyball: buildBeachVolleyball,
  pickleball: buildPickleball, badminton: buildBadminton, tableTennis: buildTableTennis, futsal: buildFutsal, squash: buildSquash,
  boxing: (g, M) => buildBoxing(g, M), bouldering: buildBouldering, billiards: buildBilliards, gym: (g, _M, rng) => buildGym(g, rng),
};
// 沿圓周的順序（從角度 gap / 2 開始排，出生點前面是最後一個間隔的桌椅）。
const SECTION_ORDER: SectionKind[] = [
  // 排球（三座室內、一座沙灘）排在一起
  'basketball', 'tennis', 'volleyball', 'volleyball', 'volleyball', 'beachVolleyball', 'pickleball', 'gym', 'badminton',
  'futsal', 'squash', 'boxing', 'bouldering', 'billiards', 'tennis', 'basketball', 'badminton', 'pickleball',
];

// 直的區段放在彎的環上，內緣兩角會比圓弧多凸出去；用內緣半徑算左右兩邊各佔多少角度，區段之間的間隔才一樣寬、不重疊。
function sectionExtent(g: THREE.Group, center: number): { left: number; right: number } {
  const bounds = new THREE.Box3().setFromObject(g);
  const innerRadius = center + bounds.min.z;
  return { left: Math.atan(-bounds.min.x / innerRadius), right: Math.atan(bounds.max.x / innerRadius) };
}

// 在環上 angle 的位置放一組設施：自身 x 沿圓周（切線）、z 朝外（徑向）。
const placeOnRing = (parent: THREE.Object3D, radius: number, y: number, angle: number): THREE.Group =>
  childGroup(parent, [radius * Math.sin(angle), y, radius * Math.cos(angle)], angle);

// ---------- 觀眾席 ----------
// 階梯看台的剖面（半徑, 高度），逆時針繞一圈（LatheGeometry 才會面朝外）。inward 是看台往後升高的方向（內側看台 -1、外側 +1）。
function standProfile(front: number, inward: number, baseY: number): THREE.Vector2[] {
  const { rows, tread, rise, parapet, back } = STANDS;
  const depth = rows * tread;
  const top = rows * rise + parapet;
  const point = (r: number, y: number): THREE.Vector2 => new THREE.Vector2(r, baseY + y);
  const steps: THREE.Vector2[] = [];
  for (let k = 0; k < rows; k++) {
    const stepFront = front + inward * k * tread;
    steps.push(point(stepFront, (k + 1) * rise), point(stepFront + inward * tread, (k + 1) * rise));
  }
  const backInner = front + inward * depth;
  const backOuter = backInner + inward * back;
  if (inward < 0) {
    return [point(backOuter, 0), point(front, 0), ...steps, point(backInner, top), point(backOuter, top), point(backOuter, 0)];
  }
  return [point(front, 0), point(backOuter, 0), point(backOuter, top), point(backInner, top), ...steps.reverse(), point(front, 0)];
}

// 一整圈座椅（InstancedMesh，顏色依角度分區漸變），每隔 aisleEvery 留一條走道並加一根斜扶手。
function addStandSeats(group: THREE.Group, M: SportsMaterials, front: number, inward: number, baseY: number): void {
  const { rows, tread, rise, seatSpacing, aisleEvery, aisleWidth, colorBlocks } = STANDS;
  const seatGeometry = merge([
    new THREE.BoxGeometry(0.44, 0.06, 0.4).translate(0, 0.42, 0.02),
    new THREE.BoxGeometry(0.44, 0.42, 0.05).translate(0, 0.66, -0.18),
    new THREE.BoxGeometry(0.08, 0.4, 0.08).translate(0, 0.2, 0),
  ], '觀眾席座椅');
  const aisles = Math.max(4, Math.round((TAU * front) / aisleEvery));
  const matrices: THREE.Matrix4[] = [];
  const colors: THREE.Color[] = [];
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  for (let k = 0; k < rows; k++) {
    const radius = front + inward * (k * tread + tread * 0.6);
    const count = Math.floor((TAU * radius) / seatSpacing);
    const aisleHalf = aisleWidth / 2 / radius;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU;
      const fromAisle = Math.abs(THREE.MathUtils.euclideanModulo(angle * aisles / TAU + 0.5, 1) - 0.5) * TAU / aisles;
      if (fromAisle < aisleHalf) continue;
      position.set(radius * Math.sin(angle), baseY + (k + 1) * rise, radius * Math.cos(angle));
      // 內側看台的人面向外（+徑向），外側看台面向內
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle + (inward < 0 ? 0 : Math.PI));
      matrices.push(new THREE.Matrix4().compose(position, rotation, unit));
      colors.push(new THREE.Color().setHSL(Math.floor((angle / TAU) * colorBlocks) / colorBlocks, 0.45, 0.48));
    }
  }
  const seats = new THREE.InstancedMesh(seatGeometry, M.white, matrices.length);
  matrices.forEach((matrix, i) => seats.setMatrixAt(i, matrix));
  colors.forEach((color, i) => seats.setColorAt(i, color));
  group.add(seats);
}

// 照明燈塔：一根高桿、六格燈頭往下斜照；facingOut 時燈頭朝外（+徑向），否則朝圓心。
// raised：塔的底座比球場地面高多少（看台頂上的塔），夜晚光斑要落在球場上。
function addLightTower(props: THREE.Group, M: SportsMaterials, radius: number, baseY: number, angle: number, facingOut: boolean, raised = 0): void {
  const tower = childGroup(props, [radius * Math.sin(angle), baseY, radius * Math.cos(angle)], angle + (facingOut ? 0 : Math.PI));
  skipCollider(tower);
  markCollider(tower, [0.6, TOWER.height, 0.6], [0, TOWER.height / 2, 0]);
  markLight(tower, [0, TOWER.height, 0.5], 'flood', TOWER.height + raised, TOWER.reach + raised);
  rod(tower, M.metal, [0, 0, 0], [0, TOWER.height, 0], 0.3, 0.18, 10);
  const head = childGroup(tower, [0, TOWER.height, 0.3]);
  head.rotation.x = TOWER.tilt;
  box(head, M.darkMetal, [3, 1.8, 0.35], [0, 0, 0]);
  for (const x of [-1, 0, 1]) {
    for (const y of [-0.45, 0.45]) box(head, M.lamp, [0.8, 0.7, 0.02], [x * 0.95, y, 0.19]);
  }
}

// 走道扶手、前緣欄杆與看台後方的照明燈塔（零件會再合併）。
function addStandFixtures(props: THREE.Group, M: SportsMaterials, front: number, inward: number, baseY: number): void {
  const { rows, tread, rise, aisleEvery, railHeight, back } = STANDS;
  const depth = rows * tread;
  const aisles = Math.max(4, Math.round((TAU * front) / aisleEvery));
  for (let a = 0; a < aisles; a++) {
    const angle = (a / aisles) * TAU;
    const at = (r: number, y: number): Vec3 => [r * Math.sin(angle), baseY + y, r * Math.cos(angle)];
    rod(props, M.aluminum, at(front + inward * 0.2, rise + 0.9), at(front + inward * (depth - 0.2), rows * rise + 0.9), 0.025, 0.025, 6);
  }
  addMesh(props, new THREE.TorusGeometry(front - inward * 0.05, 0.03, 6, 720).rotateX(Math.PI / 2), M.aluminum, [0, baseY + railHeight, 0]);
  const towerRadius = front + inward * (depth + back / 2);
  const towerBase = baseY + rows * rise + STANDS.parapet;
  const towers = Math.max(4, Math.round((TAU * towerRadius) / TOWER.spacing));
  for (let t = 0; t < towers; t++) addLightTower(props, M, towerRadius, towerBase, ((t + 0.5) / towers) * TAU, inward < 0, towerBase - baseY);
}

// 看台的碰撞：每一排的踏面是一圈站得住的環（Disc），每一排前緣的立面是一圈圓形牆（每階 0.45 m，比自動跨上的高度高，要跳）；
// 最後一圈是後面的矮牆。走道上每一階前面多一個半階（0.225 m），可以一路走上去。半階同時畫出來。
function addStandCollision(build: PropsBuild, props: THREE.Group, M: SportsMaterials, front: number, inward: number, baseY: number): void {
  const { rows, tread, rise, parapet, aisleEvery, aisleWidth } = STANDS;
  const solid = inward < 0 ? 'inside' : 'outside';
  const edge = (k: number): number => front + inward * k * tread;
  for (let k = 0; k < rows; k++) {
    const [a, b] = [edge(k), edge(k + 1)];
    build.discs.push({ inner: Math.min(a, b), outer: Math.max(a, b), minY: baseY, maxY: baseY + (k + 1) * rise });
  }
  for (let k = 0; k <= rows; k++) {
    build.walls.push({ radius: edge(k), minY: baseY, maxY: baseY + (k < rows ? (k + 1) * rise : rows * rise + parapet), solid });
  }
  const aisles = Math.max(4, Math.round((TAU * front) / aisleEvery));
  for (let a = 0; a < aisles; a++) {
    const angle = (a / aisles) * TAU;
    for (let k = 0; k < rows; k++) {
      // 第 k 階立面前面（球場那一側）半個踏面深的半階，站在下一層（地面或前一排）上
      const near = edge(k);
      const far = near - inward * (tread / 2);
      const halfAngle = aisleWidth / 2 / near;
      const top = k * rise + rise / 2;
      build.discs.push({ inner: Math.min(near, far), outer: Math.max(near, far), minY: baseY, maxY: baseY + top, arc: { start: angle - halfAngle, length: halfAngle * 2 } });
      const center = (near + far) / 2;
      box(props, M.standConcrete, [aisleWidth, rise / 2, tread / 2], [center * Math.sin(angle), baseY + k * rise + rise / 4, center * Math.cos(angle)], [0, angle, 0]);
    }
  }
}

// 外緣一圈矮欄杆：柱子、上下兩道扶手；碰撞是一道圓形牆（只能待在裡面）。
function addOuterRail(build: PropsBuild, props: THREE.Group, M: SportsMaterials, radius: number, y: number): void {
  const posts = Math.round((TAU * radius) / OUTER_RAIL.postSpacing);
  for (let k = 0; k < posts; k++) {
    const angle = (k / posts) * TAU;
    box(props, M.aluminum, [0.06, OUTER_RAIL.height, 0.06], [radius * Math.sin(angle), y + OUTER_RAIL.height / 2, radius * Math.cos(angle)], [0, angle, 0]);
  }
  for (const [height, tube] of [[OUTER_RAIL.height, 0.035], [OUTER_RAIL.height * 0.5, 0.02]] as const) {
    addMesh(props, new THREE.TorusGeometry(radius, tube, 6, 720).rotateX(Math.PI / 2), M.aluminum, [0, y + height, 0]);
  }
  build.walls.push({ radius, minY: y, maxY: y + OUTER_RAIL.height, solid: 'outside' });
}

// 兩個區段之間的間隔：中線上沿徑向排一列戶外桌椅，長邊沿圓周。
function addPicnicRow(props: THREE.Group, M: SportsMaterials, rng: Rng, center: number, y: number, angle: number): void {
  for (let k = 0; k < PICNIC_SETS; k++) {
    const radius = center + (k - (PICNIC_SETS - 1) / 2) * PICNIC_SPACING;
    const set = placeOnRing(props, radius, y, angle);
    addPicnicSet(set, M, rng);
  }
}

/** 最頂層的運動場環：環面整圈站得住，球場與健身房沿圓周排滿（間隔一樣寬、每個間隔四組戶外桌椅），內側一整圈觀眾席，外緣欄杆。 */
export function buildCourtsRing(spec: RingSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  const M = getMaterials();
  build.solid.add(annulus(spec.inner, spec.outer, spec.minY, spec.maxY, colorMaterial(RING_FLOOR)));
  build.discs.push({ inner: spec.inner, outer: spec.outer, minY: spec.minY, maxY: spec.maxY });
  const standDepth = STANDS.rows * STANDS.tread + STANDS.back;
  const standFront = spec.inner + standDepth + STANDS.frontGap;
  const railRadius = spec.outer - OUTER_RAIL.inset;
  // 區段放在觀眾席前緣到外緣欄杆之間的正中間
  const center = (standFront + railRadius) / 2;
  const sections = SECTION_ORDER.map((kind) => {
    const g = new THREE.Group();
    SECTION_BUILDERS[kind](g, M, rng);
    return { kind, g, ...sectionExtent(g, center) };
  });
  const used = sections.reduce((sum, section) => sum + section.left + section.right, 0);
  const gap = (TAU - used) / sections.length;
  if (gap < 0) throw new Error(`運動場環放不下所有區段：區段中心半徑 ${center.toFixed(1)} m，區段需要 ${used.toFixed(2)} 弧度（一圈 ${TAU.toFixed(2)}）`);
  const props = new THREE.Group();
  // 從角度 gap / 2 開始排，最後一個間隔的正中間剛好是角度 0：出生點（scene.spawn）前面是一列桌椅，不是球場
  let angle = gap / 2;
  for (const section of sections) {
    const middleAngle = angle + section.left;
    section.g.position.set(center * Math.sin(middleAngle), spec.maxY, center * Math.cos(middleAngle));
    section.g.rotation.y = middleAngle;
    props.add(section.g);
    markChildGroups(section.g);
    addPicnicRow(props, M, rng, center, spec.maxY, middleAngle + section.right + gap / 2);
    angle = middleAngle + section.right + gap;
  }
  build.decor.add(new THREE.Mesh(new THREE.LatheGeometry(standProfile(standFront, -1, spec.maxY), STANDS.segments), M.standConcrete));
  addStandSeats(build.decor, M, standFront, -1, spec.maxY);
  addStandFixtures(props, M, standFront, -1, spec.maxY);
  addStandCollision(build, props, M, standFront, -1, spec.maxY);
  addOuterRail(build, props, M, railRadius, spec.maxY);
  // 外緣欄杆內側一排照明燈塔，燈頭朝球場（和內側燈塔錯開半格）
  const outerTowers = Math.max(4, Math.round((TAU * railRadius) / TOWER.spacing));
  for (let k = 0; k < outerTowers; k++) addLightTower(props, M, railRadius - 0.8, spec.maxY, (k / outerTowers) * TAU, false);
  build.solids.push(...collectColliders(props));
  build.lights.push(...collectLights(props));
  build.decor.add(bakeByMaterial(props));
  disposeGeometries(props);
  return build;
}
