// OZ 世界的住宅區：房屋環（有街道的街區）與漂浮房屋環。
// 房屋牆面貼有窗戶的外牆（一般房屋兩層、高樓五層；牆面有橫向雨淋板、紅磚、灰泥三種），屋頂貼屋瓦、朝街的那面有門，部分房子有煙囪。
// 牆上還有立體的細節：石砌牆基、樓層腰帶、屋簷線腳、每扇窗的窗台、正背面的百葉窗與花箱、門框、門口雨遮、台階、門燈，
// 斜屋頂有屋脊蓋與兩側簷溝、煙囪有煙囪帽；高樓頂上有女兒牆、冷氣機、水塔和樓梯間。
// 房屋環由內往外是「房子、路、房子、房子、路、房子、路」（最外面那條路直接接環的外緣，外緣有欄杆）：兩條 7 m 的柏油路（白色邊線、中央虛線、斑馬線），兩側人行道
// （路緣石、行道樹、路燈、消防栓、郵筒、長椅），中間兩排房子背對背、隔一條後巷；兩條路之間有兩條沿徑向的連通道，
// 路口人行道斷開、畫斑馬線。斑馬線和路口的範圍不畫黃色中央虛線（兩種標線疊在一起會閃爍，現實中也不會疊）。房子很多，所以牆、屋頂、門、煙囪都用 InstancedMesh（Batch），街道設施合併網格。
import * as THREE from 'three';
import { nightUniform } from './oz-night';
import { Batch, addFloater, annulus, bakeByMaterial, createRng, emptyBuild, orientedSolid, shinyMaterial, type Part, type PropsBuild, type RingSpec } from './oz-props';
import {
  TAU, addMesh, box, childGroup, collectColliders, collectLights, cylinder, disposeGeometries, lambert, mapped, markChildGroups, pixelTexture, planarUv, range, rod,
  skipCollider, markCollider, markLight, type Range, type Rng, type Vec3,
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
// 剖面（從環內緣往外，m）：邊緣、一排房子的帶寬、兩排中間背對背那兩排之間的後巷
const BLOCK = { edge: 1, band: 10, alley: 2 };
// 兩條路之間的連通道：寬（柏油）、兩側人行道寬、在哪個角度（兩條相對）
const CONNECTOR = { asphalt: 7, sidewalk: 2.5, angles: [0.6, 0.6 + Math.PI] };
const CROSSWALK = { stripes: 7, stripe: 0.5, gap: 0.5, length: 3 };
const CONNECTOR_LIFT = 0.025;
// 最外圈的路：柏油外緣離環邊 edge，環邊的欄杆
const EDGE_ROAD = { edge: 0.5, railInset: 0.25, railHeight: 1.05, railPosts: 2.5 };

const WALL_COLORS = [0xf4efe6, 0xf2d9c4, 0xdfe8f0, 0xe8e0f2, 0xf6e7b8, 0xd7ecd9, 0xf3c9c9, 0xcfd6e0];
const ROOF_COLORS = [0xb5523b, 0x8a4b3a, 0x4f6d8f, 0x3f6b55, 0xc97b3c, 0x5c5470];
const DOOR_COLORS = [0x6e4a2f, 0x2f4b7c, 0x8c2f39, 0x3f6b55, 0x2b2b2b, 0xf4efe6];
const BRICK_COLORS = [0xc9785f, 0xb5654f, 0xd08c6a, 0xa65b48, 0xe0b49a];
const SHUTTER_COLORS = [0x2f4b7c, 0x3f6b55, 0x8c2f39, 0x6f9c8a, 0xf4efe6, 0x2b2b2b, 0x5c5470];
const TRIM = 0xfbf8f2;
const PLINTH_COLORS = [0x8c867d, 0x9a948b, 0x7d776f];
const PLANTER = 0x7a4f33;
const PLANTS = [0x5fa85d, 0x4f9a4c, 0x77b46f];
const ROOF_TRIM = 0x5b4a3e;
const PLINTH_SINK = 0.05;

// 外牆貼圖上的窗戶排法（和下面 drawFacade 一致，立體窗台才對得準）：上方留 FACADE_TOP 像素，
// 其下 FACADE_ROWS_PX 平均分成 rows 層，每格窗戶寬 WINDOW_SHARE.w、高 WINDOW_SHARE.h。
const TEXTURE_PX = 256;
const FACADE_TOP = 30;
const FACADE_ROWS_PX = 220;
const WINDOW_SHARE = { w: 0.5, h: 0.55 };
const FACADE_LAYOUT = { house: { columns: 3, rows: 2 }, tower: { columns: 4, rows: 5 } };
type WallStyle = 'siding' | 'brick' | 'stucco';
const HOUSE_STYLES: WallStyle[] = ['siding', 'siding', 'brick', 'stucco', 'stucco'];
const TOWER_STYLES: WallStyle[] = ['stucco', 'brick'];
const DETAIL = {
  plinth: 0.45, sill: { height: 0.07, depth: 0.18, extra: 0.16 }, band: 0.12, cornice: 0.22,
  shutterChance: 0.6, flowerChance: 0.45, step: { width: 1.5, height: 0.16, depth: 0.55 },
  canopy: { width: 1.6, depth: 0.75, thick: 0.08 }, lamp: [0.14, 0.24, 0.1] as Vec3,
};

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
// 牆面三種：雨淋板（一條條橫向木板的陰影線）、紅磚（錯縫磚塊）、灰泥（細碎斑點）。
// 窗戶：白色窗框、上下兩格的窗櫺、玻璃有天空的漸層與一道斜反光，部分窗戶拉著窗簾。
const drawWallSurface = (ctx: CanvasRenderingContext2D, style: WallStyle, rng: Rng): void => {
  ctx.fillStyle = '#f7f4ef';
  ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);
  if (style === 'siding') {
    for (let y = 0; y < TEXTURE_PX; y += 8) {
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.fillRect(0, y + 6, TEXTURE_PX, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(0, y, TEXTURE_PX, 1);
    }
  } else if (style === 'brick') {
    for (let row = 0; row < TEXTURE_PX / 8; row++) {
      for (let col = -1; col < TEXTURE_PX / 16 + 1; col++) {
        const x = col * 16 + (row % 2) * 8;
        const tone = 228 + Math.floor(rng() * 24);
        ctx.fillStyle = `rgb(${tone}, ${tone - 4}, ${tone - 8})`;
        ctx.fillRect(x + 1, row * 8 + 1, 14, 6);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let row = 0; row < TEXTURE_PX / 8; row++) ctx.fillRect(0, row * 8, TEXTURE_PX, 1);
  } else {
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(rng() * TEXTURE_PX, rng() * TEXTURE_PX, 2, 2);
    }
  }
};
const drawFacade = (columns: number, rows: number, style: WallStyle) => (ctx: CanvasRenderingContext2D): void => {
  const rng = createRng(columns * 10 + rows + style.length);
  drawWallSurface(ctx, style, rng);
  const cellW = TEXTURE_PX / columns;
  const cellH = FACADE_ROWS_PX / rows;
  const curtains = ['#f2d9c4', '#e8e0f2', '#f6e7b8', '#d7ecd9', '#f3c9c9'];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const w = cellW * WINDOW_SHARE.w;
      const h = cellH * WINDOW_SHARE.h;
      const x = col * cellW + (cellW - w) / 2;
      const y = FACADE_TOP + row * cellH + (cellH - h) / 2;
      // 磚牆的窗戶上方有一道淺色過樑
      if (style === 'brick') {
        ctx.fillStyle = '#e9e4dc';
        ctx.fillRect(x - 6, y - 9, w + 12, 6);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
      const glass = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
      glass.addColorStop(0, '#8fb2d4');
      glass.addColorStop(0.55, '#5d7fa3');
      glass.addColorStop(1, '#3d5878');
      ctx.fillStyle = glass;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.15, y + h);
      ctx.lineTo(x + w * 0.45, y);
      ctx.lineTo(x + w * 0.6, y);
      ctx.lineTo(x + w * 0.3, y + h);
      ctx.fill();
      if (rng() < 0.55) {
        ctx.fillStyle = curtains[Math.floor(rng() * curtains.length)] ?? '#f2d9c4';
        const drawn = w * (0.18 + rng() * 0.15);
        ctx.fillRect(x, y, drawn, h);
        ctx.fillRect(x + w - drawn, y, drawn, h);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
      ctx.fillRect(x, y + h * 0.4 - 1.5, w, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(x - 6, y + h + 4, w + 12, 5);
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

// ---------- 夜晚的窗戶 ----------
// 不另外加網格：外牆材質的著色器裡，照貼圖上的窗戶排法算出這個像素落在哪一扇窗，
// 再用「房子位置 + 這面牆的方向 + 第幾扇窗」當亂數，決定這扇窗晚上亮不亮、亮什麼顏色。
// 窗櫺（白色十字）不發光；白天 nightUniform 是 0，看起來和原本一樣。
const WINDOW_GLOW = { litShare: 0.42, tvShare: 0.12, warm: '1.0, 0.72, 0.38', cool: '0.62, 0.78, 1.0', strength: 0.95 };
const WINDOW_VERTEX = `#include <begin_vertex>
#ifdef USE_INSTANCING
  vWindowSeed = instanceMatrix[3].xyz + normal * 7.31;
#else
  vWindowSeed = normal * 7.31;
#endif`;
const WINDOW_FRAGMENT = `#include <emissivemap_fragment>
{
  vec2 px = vec2(vMapUv.x, 1.0 - vMapUv.y) * ${TEXTURE_PX.toFixed(1)};
  vec2 cell = vec2(${TEXTURE_PX.toFixed(1)} / WINDOW_COLUMNS, ${FACADE_ROWS_PX.toFixed(1)} / WINDOW_ROWS);
  vec2 local = vec2(px.x, px.y - ${FACADE_TOP.toFixed(1)});
  vec2 index = floor(local / cell);
  vec2 size = cell * vec2(${WINDOW_SHARE.w}, ${WINDOW_SHARE.h});
  vec2 inCell = local - index * cell - (cell - size) * 0.5;
  bool isGlass = local.y >= 0.0 && index.y < WINDOW_ROWS && all(greaterThanEqual(inCell, vec2(0.0))) && all(lessThan(inCell, size));
  bool isMullion = abs(inCell.x - size.x * 0.5) < 1.5 || abs(inCell.y - size.y * 0.4) < 1.5;
  if (isGlass && !isMullion) {
    // 種子先取整數再縮小範圍：內插後的 varying 會有極小的誤差，直接丟進 sin 會被放大成整扇窗的雜點
    vec3 seed = mod(floor(vWindowSeed * 2.0 + 0.5) + vec3(index, 0.0) * vec3(7.0, 11.0, 0.0), 251.0);
    float pick = fract(sin(dot(seed, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    if (pick < ${WINDOW_GLOW.litShare}) {
      vec3 tone = pick < ${WINDOW_GLOW.litShare * WINDOW_GLOW.tvShare} ? vec3(${WINDOW_GLOW.cool}) : vec3(${WINDOW_GLOW.warm});
      totalEmissiveRadiance += tone * (0.7 + 0.3 * fract(pick * 91.7)) * ${WINDOW_GLOW.strength} * uNight;
    }
  }
}`;
function addWindowGlow(material: THREE.MeshLambertMaterial, layout: { columns: number; rows: number }): THREE.MeshLambertMaterial {
  // 排法放在 defines：three.js 依 defines 區分著色器，同一個 onBeforeCompile 也不會把房屋和高樓的排法搞混
  material.defines = { WINDOW_COLUMNS: layout.columns.toFixed(1), WINDOW_ROWS: layout.rows.toFixed(1) };
  material.onBeforeCompile = applyWindowShader;
  return material;
}
function applyWindowShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uNight = nightUniform;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWindowSeed;').replace('#include <begin_vertex>', WINDOW_VERTEX);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWindowSeed;\nuniform float uNight;')
    .replace('#include <emissivemap_fragment>', WINDOW_FRAGMENT);
}

function createTownMaterials() {
  const roofMap = pixelTexture(128, 128, drawRoofTiles);
  roofMap.repeat.set(3, 3);
  const facade = (layout: { columns: number; rows: number }, style: WallStyle): THREE.MeshLambertMaterial =>
    addWindowGlow(mapped(pixelTexture(TEXTURE_PX, TEXTURE_PX, drawFacade(layout.columns, layout.rows, style))), layout);
  return {
    houseWalls: { siding: facade(FACADE_LAYOUT.house, 'siding'), brick: facade(FACADE_LAYOUT.house, 'brick'), stucco: facade(FACADE_LAYOUT.house, 'stucco') },
    towerWalls: { siding: facade(FACADE_LAYOUT.tower, 'stucco'), brick: facade(FACADE_LAYOUT.tower, 'brick'), stucco: facade(FACADE_LAYOUT.tower, 'stucco') },
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

interface HouseBatches {
  walls: Record<WallStyle, Batch>; towers: Record<WallStyle, Batch>; roofs: Batch; doors: Batch; chimneys: Batch;
  /** 置中的單位方塊：窗台、腰帶、線腳、門框、雨遮、台階、屋脊、簷溝、冷氣機等，顏色用實例顏色 */
  trim: Batch; lamps: Batch; tanks: Batch;
}

// 窗台、線腳、燈這些幾公分到幾十公分的細節，離鏡頭超過 DETAIL_CULL 公尺就不畫（牆、屋頂照畫，遠看房子輪廓不變）
const DETAIL_CULL = 180;

function createHouseBatches(M: TownMaterials): HouseBatches {
  const wall = facadeBox();
  const styles = (materials: Record<WallStyle, THREE.Material>): Record<WallStyle, Batch> =>
    ({ siding: new Batch(wall, materials.siding), brick: new Batch(wall, materials.brick), stucco: new Batch(wall, materials.stucco) });
  return {
    walls: styles(M.houseWalls), towers: styles(M.towerWalls),
    roofs: new Batch(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]), { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5), M.roof),
    doors: new Batch(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), M.plain),
    chimneys: new Batch(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), M.plain),
    trim: new Batch(new THREE.BoxGeometry(1, 1, 1), M.plain, DETAIL_CULL),
    lamps: new Batch(new THREE.BoxGeometry(1, 1, 1), M.lamp, DETAIL_CULL),
    tanks: new Batch(new THREE.CylinderGeometry(0.5, 0.5, 1, 14), M.plain),
  };
}

// ---------- 牆面細節 ----------
// 房子的一面牆：法線方向 (nx, nz)、這面的寬、從中心到牆面的距離。
interface Face { nx: number; nz: number; width: number; half: number }
const houseFaces = (w: number, d: number): Face[] => [
  { nx: 0, nz: 1, width: w, half: d / 2 }, { nx: 0, nz: -1, width: w, half: d / 2 },
  { nx: 1, nz: 0, width: d, half: w / 2 }, { nx: -1, nz: 0, width: d, half: w / 2 },
];
// 牆面上的一點：along 沿牆（從這面中心算）、y 離地、out 離牆面往外；size 是（沿牆、高、往外）
const facePoint = (f: Face, along: number, y: number, out: number): Vec3 =>
  f.nz !== 0 ? [along, y, f.nz * (f.half + out)] : [f.nx * (f.half + out), y, along];
const faceSize = (f: Face, sizeAlong: number, sizeY: number, sizeOut: number): Vec3 =>
  f.nz !== 0 ? [sizeAlong, sizeY, sizeOut] : [sizeOut, sizeY, sizeAlong];

interface WindowSlot { along: number; bottom: number; top: number; width: number; floor: number }
/** 外牆貼圖上每扇窗在這面牆上的位置（m）：floor 0 是一樓。 */
function windowSlots(face: Face, height: number, layout: { columns: number; rows: number }): WindowSlot[] {
  const cellH = FACADE_ROWS_PX / layout.rows;
  const slots: WindowSlot[] = [];
  for (let row = 0; row < layout.rows; row++) {
    const topPx = FACADE_TOP + row * cellH + (cellH * (1 - WINDOW_SHARE.h)) / 2;
    const bottomPx = topPx + cellH * WINDOW_SHARE.h;
    for (let col = 0; col < layout.columns; col++) {
      slots.push({
        along: ((col + 0.5) / layout.columns - 0.5) * face.width,
        bottom: (1 - bottomPx / TEXTURE_PX) * height,
        top: (1 - topPx / TEXTURE_PX) * height,
        width: (face.width / layout.columns) * WINDOW_SHARE.w,
        floor: layout.rows - 1 - row,
      });
    }
  }
  return slots;
}

/** 樓層之間的腰帶高度（m）。 */
const floorBands = (height: number, rows: number): number[] =>
  Array.from({ length: rows - 1 }, (_, k) => (1 - (FACADE_TOP + ((k + 1) * FACADE_ROWS_PX) / rows) / TEXTURE_PX) * height);

function addFacadeDetails(rng: Rng, B: HouseBatches, body: THREE.Matrix4, shape: HouseShape, door: [number, number], wallColor: number, parts: Part[]): void {
  const { width: w, height: h, depth: d, isTower } = shape;
  const at = (local: Vec3, size: Vec3, color: number, batch = B.trim): void => {
    parts.push(batch.add(onHouse(body, w, h, d, local, size), color));
  };
  const layout = isTower ? FACADE_LAYOUT.tower : FACADE_LAYOUT.house;
  // 牆基、樓層腰帶、屋簷線腳
  // 牆基往下多 PLINTH_SINK：牆的底面和牆基的底面若都在 y = 0，從下面看（漂浮房屋）兩個面搶同一個深度會閃爍
  at([0, (DETAIL.plinth - PLINTH_SINK) / 2, 0], [w + 0.1, DETAIL.plinth + PLINTH_SINK, d + 0.1], pick(rng, PLINTH_COLORS, 0x8c867d));
  for (const y of floorBands(h, layout.rows)) at([0, y, 0], [w + 0.07, DETAIL.band, d + 0.07], TRIM);
  at([0, h - DETAIL.cornice / 2, 0], [w + 0.26, DETAIL.cornice, d + 0.26], TRIM);
  const hasShutters = !isTower && rng() < DETAIL.shutterChance;
  const hasFlowers = !isTower && rng() < DETAIL.flowerChance;
  const shutterColor = pick(rng, SHUTTER_COLORS, 0x2f4b7c);
  for (const face of houseFaces(w, d)) {
    const isDoorFace = face.nx === door[0] && face.nz === door[1];
    const isBackFace = face.nx === -door[0] && face.nz === -door[1];
    for (const slot of windowSlots(face, h, layout)) {
      // 門擋到的一樓窗戶：門上方露出的那截用牆色蓋掉，中間留一扇橫向氣窗；不做窗台
      if (isDoorFace && slot.floor === 0 && Math.abs(slot.along) < DOOR.width / 2 + slot.width / 2) {
        const coverFrom = DOOR.height + 0.13;
        const coverTo = slot.top + 0.12;
        if (coverTo > coverFrom) {
          at(facePoint(face, slot.along, (coverFrom + coverTo) / 2, 0.008), faceSize(face, slot.width + 0.14, coverTo - coverFrom, 0.02), wallColor);
          at(facePoint(face, 0, DOOR.height + 0.2, 0.012), faceSize(face, DOOR.width, 0.14, 0.02), 0x3d5878);
        }
        continue;
      }
      at(facePoint(face, slot.along, slot.bottom - DETAIL.sill.height / 2, DETAIL.sill.depth / 2 - 0.02), faceSize(face, slot.width + DETAIL.sill.extra, DETAIL.sill.height, DETAIL.sill.depth), TRIM);
      if (hasShutters && (isDoorFace || isBackFace)) {
        const shutterWidth = slot.width * 0.42;
        for (const side of [-1, 1]) {
          at(facePoint(face, slot.along + side * (slot.width / 2 + shutterWidth / 2 + 0.05), (slot.bottom + slot.top) / 2, 0.03),
            faceSize(face, shutterWidth, slot.top - slot.bottom + 0.1, 0.05), shutterColor);
        }
      }
      if (hasFlowers && isDoorFace && slot.floor > 0) {
        at(facePoint(face, slot.along, slot.bottom - 0.22, 0.2), faceSize(face, slot.width + 0.05, 0.24, 0.3), PLANTER);
        at(facePoint(face, slot.along, slot.bottom - 0.05, 0.2), faceSize(face, slot.width - 0.02, 0.16, 0.26), pick(rng, PLANTS, 0x5fa85d));
      }
    }
  }
  // 門：門框、台階、雨遮（兩根托架）、門燈（door 那面）
  const doorFace = houseFaces(w, d).find((face) => face.nx === door[0] && face.nz === door[1]);
  if (!doorFace) return;
  at(facePoint(doorFace, 0, DOOR.height / 2 + 0.06, 0.01), faceSize(doorFace, DOOR.width + 0.24, DOOR.height + 0.14, 0.05), TRIM);
  at(facePoint(doorFace, 0, DETAIL.step.height / 2, DETAIL.step.depth / 2), faceSize(doorFace, DETAIL.step.width, DETAIL.step.height, DETAIL.step.depth), pick(rng, PLINTH_COLORS, 0x8c867d));
  const canopy = DETAIL.canopy;
  at(facePoint(doorFace, 0, DOOR.height + 0.32, canopy.depth / 2), faceSize(doorFace, canopy.width, canopy.thick, canopy.depth), ROOF_TRIM);
  for (const side of [-1, 1]) at(facePoint(doorFace, side * (canopy.width / 2 - 0.1), DOOR.height + 0.15, canopy.depth * 0.45), faceSize(doorFace, 0.06, 0.3, 0.06), ROOF_TRIM);
  at(facePoint(doorFace, DOOR.width / 2 + 0.35, DOOR.height * 0.85, DETAIL.lamp[2] / 2), faceSize(doorFace, DETAIL.lamp[0], DETAIL.lamp[1], DETAIL.lamp[2]), 0xffffff, B.lamps);
}

// 斜屋頂：屋脊蓋與兩側簷溝（屋脊沿自身 z）；平頂高樓：女兒牆、冷氣機、水塔、樓梯間。
function addRoofDetails(rng: Rng, B: HouseBatches, body: THREE.Matrix4, shape: HouseShape, roofHeight: number, parts: Part[]): void {
  const { width: w, height: h, depth: d, isTower } = shape;
  const at = (local: Vec3, size: Vec3, color: number, batch = B.trim): void => {
    parts.push(batch.add(onHouse(body, w, h, d, local, size), color));
  };
  if (!isTower) {
    at([0, h + roofHeight + 0.04, 0], [0.28, 0.16, d * ROOF_OVERHANG + 0.08], ROOF_TRIM);
    for (const side of [-1, 1]) at([side * (w * ROOF_OVERHANG) / 2, h - 0.02, 0], [0.14, 0.14, d * ROOF_OVERHANG], 0xd5dae0);
    return;
  }
  at([0, h + 0.25, 0], [w + 0.3, 0.5, d + 0.3], TRIM);
  at([0, h + 0.52, 0], [w - 0.3, 0.06, d - 0.3], 0x9aa1a8);
  const units = 1 + Math.floor(rng() * 2);
  for (let k = 0; k < units; k++) at([(k - 0.5) * 1.4, h + 0.9, -d * 0.25], [1.0, 0.75, 0.7], 0xd5dae0);
  at([w * 0.25, h + 1.6, d * 0.2], [1.3, 1.9, 1.3], pick(rng, [0x6b7280, 0x2f6fb0, 0xd9d3c9], 0x6b7280), B.tanks);
  at([-w * 0.28, h + 1.5, d * 0.22], [1.6, 2, 1.8], 0xcfd6e0);
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
  const style = pick(rng, isTower ? TOWER_STYLES : HOUSE_STYLES, 'stucco');
  const wallColor = style === 'brick' ? pick(rng, BRICK_COLORS, 0xc9785f) : pick(rng, WALL_COLORS, 0xffffff);
  const parts = [(isTower ? B.towers : B.walls)[style].add(body, wallColor)];
  addFacadeDetails(rng, B, body, shape, door, wallColor, parts);
  const [dx, dz] = door;
  const doorPosition: Vec3 = [dx * (width / 2 + 0.02), 0, dz * (depth / 2 + 0.02)];
  const doorSize: Vec3 = dx !== 0 ? [DOOR.depth, DOOR.height, DOOR.width] : [DOOR.width, DOOR.height, DOOR.depth];
  parts.push(B.doors.add(onHouse(body, width, height, depth, doorPosition, doorSize), pick(rng, DOOR_COLORS, 0x6e4a2f)));
  if (isTower) {
    addRoofDetails(rng, B, body, shape, 0, parts);
    return parts;
  }
  const roofHeight = Math.min(width, depth) * range(rng, ROOF_RATIO);
  const roofColor = pick(rng, ROOF_COLORS, 0xb5523b);
  parts.push(B.roofs.add(body.clone()
    .multiply(new THREE.Matrix4().makeTranslation(0, 1, 0))
    .multiply(new THREE.Matrix4().makeScale(ROOF_OVERHANG, roofHeight / height, ROOF_OVERHANG)), roofColor));
  if (rng() < CHIMNEY_CHANCE) {
    const side = rng() < 0.5 ? -1 : 1;
    const chimneyTop = height + roofHeight * 0.25 + roofHeight * 0.75 + 0.6;
    parts.push(B.chimneys.add(onHouse(body, width, height, depth, [side * width * 0.22, height + roofHeight * 0.25, depth * 0.15], [0.55, roofHeight * 0.75 + 0.6, 0.55]), 0x9c5a4a));
    parts.push(B.trim.add(onHouse(body, width, height, depth, [side * width * 0.22, chimneyTop + 0.06, depth * 0.15], [0.72, 0.12, 0.72]), 0x7d4538));
  }
  addRoofDetails(rng, B, body, shape, roofHeight, parts);
  return parts;
}

function addHouseBatches(group: THREE.Group, B: HouseBatches): void {
  for (const batch of [...Object.values(B.walls), ...Object.values(B.towers), B.roofs, B.doors, B.chimneys, B.trim, B.lamps, B.tanks]) {
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
  markLight(g, [0, 4.84, -1.05], 'street');
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

// 一段角度的環形平板（LatheGeometry 的 phi 和這裡的角度同方向：x = r sin θ、z = r cos θ）。
const arcAnnulus = (inner: number, outer: number, minY: number, maxY: number, start: number, length: number, material: THREE.Material): THREE.Mesh =>
  new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(inner, minY), new THREE.Vector2(outer, minY), new THREE.Vector2(outer, maxY), new THREE.Vector2(inner, maxY), new THREE.Vector2(inner, minY)],
    Math.max(4, Math.round((length / TAU) * 256)), start, length), material);
const angleGap = (a: number, b: number): number => Math.abs(THREE.MathUtils.euclideanModulo(a - b + Math.PI, TAU) - Math.PI);
// 一圈上除了 openings 前後各 half 弧度以外的各段：[起點, 長度]
function arcsBetween(openings: number[], half: number): [number, number][] {
  if (openings.length === 0) return [[0, TAU]];
  const sorted = [...openings].sort((a, b) => a - b);
  return sorted.map((opening, i) => {
    const next = (sorted[(i + 1) % sorted.length] ?? opening) + (i + 1 < sorted.length ? 0 : TAU);
    return [opening + half, next - opening - 2 * half];
  });
}

// 一條路（中線半徑 middle）：柏油、兩側路緣石與人行道（連通道路口斷開）、白色邊線、黃色中央虛線、斑馬線。
// junctionSide：連通道從這條路的哪一側接進來（+1 外側、-1 內側，0 沒有路口），那一側的人行道在路口斷開。
// sidewalkSides：哪幾側有人行道（最外圈的路只有內側）。
function addStreet(build: PropsBuild, props: THREE.Group, M: TownMaterials, y: number, middle: number, junctionSide: number, sidewalkSides: number[] = [-1, 1]): number[] {
  const junctions = junctionSide === 0 ? [] : CONNECTOR.angles;
  const layer = (mesh: THREE.Mesh): void => {
    planarUv(mesh.geometry, 2);
    build.decor.add(mesh);
  };
  layer(annulus(middle - STREET.asphalt, middle + STREET.asphalt, y, y + 0.01, M.asphalt));
  const junctionHalf = (CONNECTOR.asphalt / 2 + CONNECTOR.sidewalk) / middle;
  for (const side of [-1, 1]) {
    const edge = middle + side * STREET.edgeLine;
    build.decor.add(annulus(edge - 0.06, edge + 0.06, y + 0.01, y + 0.016, M.paint));
    if (!sidewalkSides.includes(side)) continue;
    const [a, b] = side < 0 ? [middle - STREET.sidewalk, middle - STREET.asphalt] : [middle + STREET.asphalt, middle + STREET.sidewalk];
    const openings = side === junctionSide ? junctions : [];
    for (const [start, length] of arcsBetween(openings, junctionHalf)) {
      layer(arcAnnulus(a, b, y, y + STREET.curb, start, length, M.sidewalk));
      build.discs.push(openings.length === 0 ? { inner: a, outer: b, minY: y, maxY: y + STREET.curb } : { inner: a, outer: b, minY: y, maxY: y + STREET.curb, arc: { start, length } });
      const curbAt = side < 0 ? b : a;
      build.decor.add(arcAnnulus(curbAt - 0.08, curbAt + 0.08, y, y + STREET.curb + 0.02, start, length, M.curb));
    }
  }
  // 斑馬線：每隔一段一道，路口兩側再各一道；黃色虛線避開斑馬線和路口
  const crosswalks = anglesEvery(middle, STREET_PROPS.crosswalkSpacing, 0.2)
    .filter((angle) => junctions.every((junction) => angleGap(angle, junction) > (junctionHalf + 0.15)));
  for (const junction of junctions) {
    for (const side of [-1, 1]) crosswalks.push(junction + side * (junctionHalf + CROSSWALK.length / 2 / middle + 0.5 / middle));
  }
  for (const angle of crosswalks) {
    const g = onRing(props, middle, y + 0.013, angle);
    for (let k = 0; k < CROSSWALK.stripes; k++) box(g, M.paint, [CROSSWALK.length, 0.006, CROSSWALK.stripe], [0, 0, -STREET.asphalt + 0.5 + k * (CROSSWALK.stripe + CROSSWALK.gap)]);
  }
  const keepClear = (angle: number): boolean =>
    crosswalks.some((walk) => angleGap(angle, walk) < (CROSSWALK.length / 2 + STREET.dash / 2 + 0.3) / middle) ||
    junctions.some((junction) => angleGap(angle, junction) < junctionHalf);
  const dashes = Math.floor((TAU * middle) / (STREET.dash + STREET.dashGap));
  for (let i = 0; i < dashes; i++) {
    const angle = (i / dashes) * TAU;
    if (keepClear(angle)) continue;
    box(onRing(props, middle, y + 0.013, angle), M.yellowPaint, [STREET.dash, 0.006, 0.12], [0, 0, 0]);
  }
  return crosswalks;
}

// 連通道：沿徑向從內側那條路接到外側那條路；柏油、兩側人行道（高起一點，站得住）、白色邊線、黃色中央虛線，兩頭各一道斑馬線。
function addConnector(build: PropsBuild, props: THREE.Group, M: TownMaterials, y: number, from: number, to: number, angle: number): void {
  const length = to - from;
  const g = onRing(props, (from + to) / 2, y, angle);
  skipCollider(g);
  // 柏油比草地（+0.01）高一點、標線再高一點，才不會和草地互相閃爍
  box(g, M.asphalt, [CONNECTOR.asphalt, CONNECTOR_LIFT, length + 0.2], [0, CONNECTOR_LIFT / 2, 0]);
  for (const side of [-1, 1]) {
    const x = side * (CONNECTOR.asphalt / 2 + CONNECTOR.sidewalk / 2);
    const walkLength = length - 2 * (STREET.sidewalk - STREET.asphalt);
    box(g, M.sidewalk, [CONNECTOR.sidewalk, STREET.curb, walkLength], [x, STREET.curb / 2, 0]);
    box(g, M.curb, [0.16, STREET.curb + 0.02, walkLength], [side * (CONNECTOR.asphalt / 2 + 0.08), (STREET.curb + 0.02) / 2, 0]);
    box(g, M.paint, [0.12, 0.006, length - 2 * CROSSWALK.length], [side * (CONNECTOR.asphalt / 2 - 0.3), CONNECTOR_LIFT + 0.004, 0]);
    const center = new THREE.Vector3(x, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    const mid = (from + to) / 2;
    build.solids.push({ ...orientedSolid(mid * Math.sin(angle) + center.x, mid * Math.cos(angle) + center.z, angle, CONNECTOR.sidewalk, walkLength, y, y + STREET.curb), standable: true });
  }
  // 黃色中央虛線：避開兩頭的斑馬線
  const usable = length - 2 * (CROSSWALK.length + 1);
  const count = Math.floor(usable / (STREET.dash + STREET.dashGap));
  for (let k = 0; k < count; k++) {
    const z = -usable / 2 + (k + 0.5) * (usable / count);
    box(g, M.yellowPaint, [0.12, 0.006, STREET.dash], [0, CONNECTOR_LIFT + 0.004, z]);
  }
  for (const end of [-1, 1]) {
    const z = end * (length / 2 - CROSSWALK.length / 2 - 0.3);
    for (let k = 0; k < CROSSWALK.stripes; k++) box(g, M.paint, [CROSSWALK.stripe, 0.006, CROSSWALK.length], [-CONNECTOR.asphalt / 2 + 0.5 + k * (CROSSWALK.stripe + CROSSWALK.gap), CONNECTOR_LIFT + 0.004, z]);
  }
}

// 人行道上的設施：兩側每隔一段路燈與行道樹交錯，消防栓、郵筒、長椅分散在其間；路口與斑馬線附近不放。
function addStreetFurniture(props: THREE.Group, M: TownMaterials, rng: Rng, y: number, middle: number, crosswalks: number[], sides: number[] = [-1, 1]): void {
  const top = y + STREET.curb;
  for (const side of sides) {
    const r = middle + side * (STREET.sidewalk - 0.9);
    const flip = side > 0;   // 外側人行道的設施轉半圈，正面朝街
    const clear = (angle: number): boolean =>
      CONNECTOR.angles.every((junction) => angleGap(angle, junction) * r > CONNECTOR.asphalt / 2 + CONNECTOR.sidewalk + 1.5) &&
      crosswalks.every((walk) => angleGap(angle, walk) * r > CROSSWALK.length / 2 + 1);
    const place = (radius: number, spacing: number, offset: number, add: (angle: number) => void): void => {
      for (const angle of anglesEvery(radius, spacing, offset)) if (clear(angle)) add(angle);
    };
    place(r, STREET_PROPS.lampSpacing, 0, (angle) => addStreetLamp(onRing(props, r, top, angle, !flip), M));
    place(r, STREET_PROPS.treeSpacing, STREET_PROPS.treeSpacing / 2 / r, (angle) => addStreetTree(onRing(props, r, top, angle), M, rng));
    place(r, STREET_PROPS.hydrantSpacing, 0.05 * side, (angle) => addHydrant(onRing(props, middle + side * (STREET.asphalt + 0.5), top, angle), M));
    place(r, STREET_PROPS.mailboxSpacing, 0.11 * side, (angle) => addMailbox(onRing(props, middle + side * (STREET.asphalt + 0.6), top, angle, flip), M));
    place(r, STREET_PROPS.benchSpacing, 0.08 + 0.03 * side, (angle) => addBench(onRing(props, middle + side * (STREET.sidewalk - 0.5), top, angle, flip), M));
  }
}

// 一帶房子：從 from 排到 to（一排或兩排），門朝 toStreet 那一側（+1 朝外、-1 朝內）；avoid 的角度範圍不蓋（連通道）。
function addHouseBand(rng: Rng, B: HouseBatches, build: PropsBuild, y: number, from: number, to: number, toStreet: number, avoid: number[]): void {
  let rowStart = from;
  while (to - rowStart > HOUSE_ROW_DEPTH[0] / 2) {
    const rowDepth = Math.min(range(rng, HOUSE_ROW_DEPTH), to - rowStart);
    const rowRadius = rowStart + rowDepth / 2;
    const avoidHalf = (CONNECTOR.asphalt / 2 + CONNECTOR.sidewalk + 1) / rowRadius;
    let along = rng() * HOUSE_GAP[1];
    for (;;) {
      const house = randomHouse(rng);
      if (along + house.width > TAU * rowRadius) break;
      const theta = (along + house.width / 2) / rowRadius;
      const halfWidth = house.width / 2 / rowRadius;
      if (avoid.some((angle) => angleGap(theta, angle) < avoidHalf + halfWidth)) {
        along += house.width + range(rng, HOUSE_GAP);
        continue;
      }
      const depth = rowDepth - rng() * 1.5;
      const yaw = theta + (house.turned ? Math.PI / 2 : 0);
      const [sizeX, sizeZ] = house.turned ? [depth, house.width] : [house.width, depth];
      // 門朝街：沒轉的房子自身 z 是徑向，轉 90° 的房子自身 x 是 -徑向
      const door: [number, number] = house.turned ? [-toStreet, 0] : [0, toStreet];
      const [x, z] = polar(rowRadius, theta);
      addHouse(rng, B, [x, y, z, yaw, 0, 0], { width: sizeX, height: house.height, depth: sizeZ, isTower: house.isTower }, door);
      build.solids.push(orientedSolid(x, z, yaw, sizeX, sizeZ, y, y + house.height + Math.min(sizeX, sizeZ)));
      along += house.width + range(rng, HOUSE_GAP);
    }
    rowStart += rowDepth + range(rng, HOUSE_ROW_GAP);
  }
}

// 環外緣的欄杆：柱子、上下兩道扶手；碰撞是一道圓形牆（只能待在裡面）。
function addEdgeRail(build: PropsBuild, props: THREE.Group, M: TownMaterials, radius: number, y: number): void {
  for (const angle of anglesEvery(radius, EDGE_ROAD.railPosts)) {
    box(props, M.metal, [0.06, EDGE_ROAD.railHeight, 0.06], [radius * Math.sin(angle), y + EDGE_ROAD.railHeight / 2, radius * Math.cos(angle)], [0, angle, 0]);
  }
  for (const [height, tube] of [[EDGE_ROAD.railHeight, 0.035], [EDGE_ROAD.railHeight / 2, 0.025]] as const) {
    addMesh(props, new THREE.TorusGeometry(radius, tube, 6, 1024).rotateX(Math.PI / 2), M.metal, [0, y + height, 0]);
  }
  build.walls.push({ radius, minY: y, maxY: y + EDGE_ROAD.railHeight, solid: 'outside' });
}

/** 房屋環：由內往外「房子、路、房子、房子、路、房子、路」，內側兩條路之間兩條連通道，最外圈的路接環的外緣。 */
export function buildHousesRing(spec: RingSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  const M = getTownMaterials();
  const { inner, outer, maxY } = spec;
  build.solid.add(annulus(inner, outer, spec.minY, maxY, M.base));
  build.discs.push({ inner, outer, minY: spec.minY, maxY });
  const streetA = inner + BLOCK.edge + BLOCK.band + STREET.plot;
  const middle = streetA + STREET.plot + BLOCK.band + BLOCK.alley / 2;
  const streetB = middle + BLOCK.alley / 2 + BLOCK.band + STREET.plot;
  const streetC = outer - EDGE_ROAD.edge - STREET.asphalt;
  // 草地：路以外的地方
  for (const [from, to] of [[inner, streetA - STREET.sidewalk], [streetA + STREET.sidewalk, streetB - STREET.sidewalk], [streetB + STREET.sidewalk, streetC - STREET.sidewalk]] as const) {
    const lawn = annulus(from, to, maxY, maxY + 0.01, M.lawn);
    planarUv(lawn.geometry, 2);
    build.decor.add(lawn);
  }
  const props = new THREE.Group();
  const crosswalksA = addStreet(build, props, M, maxY, streetA, 1);
  const crosswalksB = addStreet(build, props, M, maxY, streetB, -1);
  for (const angle of CONNECTOR.angles) addConnector(build, props, M, maxY, streetA + STREET.asphalt, streetB - STREET.asphalt, angle);
  addStreetFurniture(props, M, rng, maxY, streetA, crosswalksA);
  addStreetFurniture(props, M, rng, maxY, streetB, crosswalksB);
  // 最外圈的路：只有內側人行道，柏油外面到環邊是一窄條路肩，環邊一圈欄杆
  const crosswalksC = addStreet(build, props, M, maxY, streetC, 0, [-1]);
  addStreetFurniture(props, M, rng, maxY, streetC, crosswalksC, [-1]);
  const shoulder = annulus(streetC + STREET.asphalt, outer, maxY, maxY + 0.01, M.asphalt);
  planarUv(shoulder.geometry, 2);
  build.decor.add(shoulder);
  addEdgeRail(build, props, M, outer - EDGE_ROAD.railInset, maxY);

  const B = createHouseBatches(M);
  addHouseBand(rng, B, build, maxY, inner + BLOCK.edge, streetA - STREET.plot, 1, []);
  addHouseBand(rng, B, build, maxY, streetA + STREET.plot, middle - BLOCK.alley / 2, -1, CONNECTOR.angles);
  addHouseBand(rng, B, build, maxY, middle + BLOCK.alley / 2, streetB - STREET.plot, 1, CONNECTOR.angles);
  addHouseBand(rng, B, build, maxY, streetB + STREET.plot, streetC - STREET.plot, -1, []);
  addHouseBatches(build.decor, B);
  markChildGroups(props);
  build.solids.push(...collectColliders(props));
  build.lights.push(...collectLights(props));
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
