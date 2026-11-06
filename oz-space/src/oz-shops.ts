// 美食區的店面（只有餐飲類）：三排。
//   A 最內圈、門面朝外；B、C 在環中段背靠背，B 門面朝內、C 門面朝外。知名的品牌都放在 C（最靠外緣、遠看得到）。
// 店名都是「稍微錯開」的仿作（88度C、54嵐、McDanold's……），只靠配色和一兩個造型特徵讓人認得出來。
// 只做外觀與外框碰撞：進不去，招牌、雨遮、屋頂造型都沒有碰撞（站不上去）。
import * as THREE from 'three';
import { colorMaterial, orientedSolid, type SolidBox } from './oz-props';
import { TAU, addMesh, box, childGroup, cylinder, mapped, pixelTexture, rod, skipCollider } from './oz-kit';

type Feature = 'arches' | 'round' | 'hat' | 'donut' | 'domino' | 'bun';

interface Brand {
  /** 招牌上的字 */
  name: string;
  /** 店面寬（沿圓周，公尺）；C 排會再乘 FAMOUS_SCALE、B 排依位置縮放 */
  width: number;
  wall: number;
  sign: { bg: string; fg: string };
  /** 條紋雨遮的兩個顏色 */
  awning?: [number, number];
  feature?: Feature;
}

// 知名品牌：放在 C 排（門面朝外、最靠外緣）
const FAMOUS: Brand[] = [
  { name: "McDanold's", width: 11, wall: 0xc8232c, sign: { bg: '#c8232c', fg: '#ffc72c' }, feature: 'arches' },
  { name: 'Starbecks', width: 9, wall: 0x2b2b2b, sign: { bg: '#00704a', fg: '#ffffff' }, feature: 'round' },
  { name: '54嵐', width: 7, wall: 0xf2f2ee, sign: { bg: '#1f4e9c', fg: '#ffffff' } },
  { name: 'KFG', width: 10, wall: 0xf3efe8, sign: { bg: '#c4122f', fg: '#ffffff' }, awning: [0xc4122f, 0xffffff] },
  { name: '88度C', width: 8, wall: 0x6b3a2a, sign: { bg: '#8b2c22', fg: '#ffffff' } },
  { name: 'Mister Donat', width: 8, wall: 0xfbe9d7, sign: { bg: '#ef7d1a', fg: '#ffffff' }, feature: 'donut' },
  { name: '鼎泰風', width: 10, wall: 0x3b2a20, sign: { bg: '#2b2b2b', fg: '#d9b36c' } },
  { name: 'Pizza Hat', width: 9, wall: 0xf1e3cf, sign: { bg: '#ffffff', fg: '#c8102e' }, feature: 'hat' },
  { name: 'CaCo', width: 7, wall: 0xf7f0e6, sign: { bg: '#f08300', fg: '#ffffff' } },
  { name: 'Burger Kong', width: 10, wall: 0x5a2a17, sign: { bg: '#f5ebdc', fg: '#d62300' }, feature: 'bun' },
  { name: 'Louise Coffee', width: 8, wall: 0x1d2b3a, sign: { bg: '#1d2b3a', fg: '#ffffff' } },
  { name: 'Subwey', width: 8, wall: 0x0b6b3a, sign: { bg: '#0b6b3a', fg: '#ffc20e' }, awning: [0xffc20e, 0xffc20e] },
  { name: '二蘭拉麵', width: 8, wall: 0x2a1a14, sign: { bg: '#b50000', fg: '#ffffff' } },
  { name: "Domimo's", width: 8, wall: 0xf2f2f2, sign: { bg: '#006491', fg: '#ffffff' }, feature: 'domino' },
  { name: 'MOZ BURGER', width: 9, wall: 0xf4efe6, sign: { bg: '#ffffff', fg: '#c8102e' }, awning: [0x1f7a3a, 0x1f7a3a] },
];

// 其他餐飲：放在 A 排（最內圈）與 B 排（中段、門面朝內）
const OTHERS: Brand[] = [
  { name: '清新福全', width: 6, wall: 0xfdf3e7, sign: { bg: '#e60012', fg: '#fff100' } },
  { name: '八方雲聚', width: 7, wall: 0xf4efe6, sign: { bg: '#c8161d', fg: '#ffffff' } },
  { name: 'cana café', width: 7, wall: 0xf6efe4, sign: { bg: '#f39800', fg: '#ffffff' } },
  { name: '爭先壽司', width: 8, wall: 0xeef2f6, sign: { bg: '#004ea2', fg: '#ffffff' }, awning: [0x004ea2, 0xffffff] },
  { name: '吉野加', width: 8, wall: 0xf3e9dc, sign: { bg: '#f39800', fg: '#4a2c1a' } },
  { name: '迷客廈', width: 6, wall: 0xf2f7f2, sign: { bg: '#00a051', fg: '#ffffff' } },
  { name: '丹丹漢包', width: 8, wall: 0xfff6d6, sign: { bg: '#ffd400', fg: '#e60012' } },
  { name: '春水棠', width: 9, wall: 0x3c2a1e, sign: { bg: '#3c2a1e', fg: '#f2e6c9' } },
  { name: '麥味燈', width: 7, wall: 0xfdf6ee, sign: { bg: '#ffffff', fg: '#e2231a' }, awning: [0xe2231a, 0xffffff] },
  { name: '可不可熟成綠茶', width: 6, wall: 0x1c1c1c, sign: { bg: '#1c1c1c', fg: '#d7b46a' } },
  { name: '三商好福', width: 8, wall: 0xf4efe6, sign: { bg: '#d71920', fg: '#ffffff' } },
  { name: 'Krispy Kream', width: 7, wall: 0xf2f6f2, sign: { bg: '#006a4e', fg: '#ffffff' }, awning: [0x006a4e, 0xd2232a] },
  { name: '鬍子張', width: 8, wall: 0xfff8d9, sign: { bg: '#fff100', fg: '#d7000f' } },
  { name: '大院子', width: 6, wall: 0xf3f8ee, sign: { bg: '#7cb342', fg: '#ffffff' } },
  { name: '拉亞漢寶', width: 7, wall: 0xfff1e8, sign: { bg: '#f15a24', fg: '#ffffff' } },
  { name: '胖老爺炸雞', width: 8, wall: 0xf7eadb, sign: { bg: '#c8102e', fg: '#ffd200' } },
];

/** 店面的尺寸：深 depth（徑向）、高 height；背靠背兩排中間留 backGap；C 排每 blockShops 間留一條 passage 寬的通道。 */
export const SHOP_LAYOUT = { depth: 8, height: 5.5, backGap: 0.6, passage: 6, blockShops: 3, smallGap: 1, edge: 1 };
const FAMOUS_SCALE = 1.3;
const SHOP = { glassHeight: 2.7, signHeight: 1.1 };
const AWNING = { y: 3.25, depth: 1.4, droop: 0.35, stripe: 0.7 };
const SIGN_PX = { height: 128, perMeter: 64, font: 76 };
const FONT_FAMILY = '"Microsoft JhengHei", "PingFang TC", "Arial", sans-serif';

const glass = (): THREE.Material => colorMaterial(0x8fb4c4);
const frame = (): THREE.Material => colorMaterial(0x2f3338);

// 招牌字：店名置中，字太長就縮小字級塞進去
function signMaterial(brand: Brand, widthM: number): THREE.Material {
  const width = Math.round(widthM * SIGN_PX.perMeter);
  return mapped(pixelTexture(width, SIGN_PX.height, (ctx) => {
    ctx.fillStyle = brand.sign.bg;
    ctx.fillRect(0, 0, width, SIGN_PX.height);
    ctx.fillStyle = brand.sign.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = SIGN_PX.font;
    ctx.font = `bold ${size}px ${FONT_FAMILY}`;
    while (ctx.measureText(brand.name).width > width * 0.9 && size > 20) {
      size -= 4;
      ctx.font = `bold ${size}px ${FONT_FAMILY}`;
    }
    ctx.fillText(brand.name, width / 2, SIGN_PX.height / 2 + 4);
  }));
}

// 店面本體：牆、屋頂收邊、落地玻璃與窗框、門、招牌帶。正面是自身 +z。
// 玻璃、門、招牌各往外錯開幾公分，不和牆面同一個深度（否則會深度衝突、閃爍）。
function addShopBody(g: THREE.Group, brand: Brand, w: number): void {
  const { height: H, depth: D } = SHOP_LAYOUT;
  const front = D / 2;
  box(g, colorMaterial(brand.wall), [w, H, D], [0, H / 2, 0]);
  box(g, colorMaterial(0x4a4a4a), [w + 0.3, 0.3, D + 0.3], [0, H + 0.15, 0]);
  box(g, glass(), [w - 1, SHOP.glassHeight, 0.08], [0, 0.25 + SHOP.glassHeight / 2, front + 0.02]);
  const panes = Math.max(2, Math.round((w - 1) / 2));
  for (let k = 0; k <= panes; k++) {
    box(g, frame(), [0.08, SHOP.glassHeight, 0.06], [-(w - 1) / 2 + (k * (w - 1)) / panes, 0.25 + SHOP.glassHeight / 2, front + 0.08]);
  }
  box(g, frame(), [w - 1, 0.1, 0.06], [0, 0.25 + SHOP.glassHeight, front + 0.08]);
  box(g, frame(), [1.8, 2.5, 0.1], [-w * 0.22, 1.25, front + 0.1]);
  box(g, glass(), [1.5, 2.3, 0.04], [-w * 0.22, 1.2, front + 0.18]);
  const signY = H - 0.8;
  box(g, colorMaterial(new THREE.Color(brand.sign.bg).getHex()), [w, SHOP.signHeight, 0.3], [0, signY, front + 0.15]);
  addMesh(g, new THREE.PlaneGeometry(w * 0.94, SHOP.signHeight * 0.86), signMaterial(brand, w * 0.94), [0, signY, front + 0.33]);
}

// 條紋雨遮：一條一條斜斜往外伸
function addAwning(g: THREE.Group, w: number, colors: [number, number]): void {
  const width = w - 1;
  const awning = childGroup(g, [0, AWNING.y, SHOP_LAYOUT.depth / 2 + 0.05]);
  awning.rotation.x = AWNING.droop;
  const count = Math.max(2, Math.round(width / AWNING.stripe));
  for (let k = 0; k < count; k++) {
    box(awning, colorMaterial(colors[k % 2] ?? colors[0]), [width / count, 0.05, AWNING.depth], [-width / 2 + (k + 0.5) * (width / count), 0, AWNING.depth / 2]);
  }
}

// 速食店的立牌：店門前一根高柱、紅色牌面、兩個黃色拱門排成 m
function addArches(g: THREE.Group, w: number): void {
  const pole = childGroup(g, [w / 2 - 0.8, 0, SHOP_LAYOUT.depth / 2 + 1.6]);
  rod(pole, frame(), [0, 0, 0], [0, 7.5, 0], 0.18, 0.15, 10);
  box(pole, colorMaterial(0xc8232c), [2.8, 2.2, 0.35], [0, 8.5, 0]);
  for (const x of [-0.55, 0.55]) {
    addMesh(pole, new THREE.TorusGeometry(0.5, 0.13, 8, 20, Math.PI).scale(1, 1.6, 1), colorMaterial(0xffc72c), [x, 7.95, 0.22]);
  }
}

// 咖啡店：屋頂上立一面綠色圓牌，外圈白環
function addRoundSign(g: THREE.Group): void {
  const { height: H, depth: D } = SHOP_LAYOUT;
  const y = H + 1.8;
  rod(g, frame(), [0, H, D / 2 - 0.6], [0, y, D / 2 - 0.6], 0.08);
  addMesh(g, new THREE.CylinderGeometry(1.4, 1.4, 0.2, 32), colorMaterial(0x00704a), [0, y, D / 2 - 0.4], [Math.PI / 2, 0, 0]);
  addMesh(g, new THREE.TorusGeometry(1.1, 0.1, 8, 32), colorMaterial(0xffffff), [0, y, D / 2 - 0.27]);
  addMesh(g, new THREE.CylinderGeometry(0.55, 0.55, 0.05, 24), colorMaterial(0xffffff), [0, y, D / 2 - 0.25], [Math.PI / 2, 0, 0]);
}

// 披薩店：紅色四角屋頂（像一頂帽子）
function addHatRoof(g: THREE.Group, w: number): void {
  const roof = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(w + 1, 2.6, SHOP_LAYOUT.depth + 1);
  addMesh(g, roof, colorMaterial(0xc8102e), [0, SHOP_LAYOUT.height + 0.32 + 1.3, 0]);
}

// 甜甜圈店：屋頂上立一個大甜甜圈
function addDonut(g: THREE.Group): void {
  const y = SHOP_LAYOUT.height + 1.9;
  rod(g, frame(), [0, SHOP_LAYOUT.height, 0], [0, y - 1.1, 0], 0.1);
  addMesh(g, new THREE.TorusGeometry(1.1, 0.5, 12, 28), colorMaterial(0xd9a066), [0, y, 0.6]);
  addMesh(g, new THREE.TorusGeometry(1.1, 0.42, 10, 28, Math.PI * 1.1), colorMaterial(0xf28cb8), [0, y, 0.82], [0, 0, Math.PI * 0.95]);
}

// 披薩外送店：屋頂上一塊骨牌，上半紅、下半藍，白色圓點
function addDomino(g: THREE.Group): void {
  const tile = childGroup(g, [0, SHOP_LAYOUT.height + 1.5, SHOP_LAYOUT.depth / 2 - 0.8]);
  tile.rotation.z = 0.35;
  box(tile, colorMaterial(0xe31837), [1.3, 1.1, 0.35], [0, 0.56, 0]);
  box(tile, colorMaterial(0x006491), [1.3, 1.1, 0.35], [0, -0.56, 0]);
  for (const [x, dotY] of [[0, 0.56], [-0.3, -0.3], [0.3, -0.8]] as const) {
    addMesh(tile, new THREE.CylinderGeometry(0.15, 0.15, 0.04, 16), colorMaterial(0xffffff), [x, dotY, 0.19], [Math.PI / 2, 0, 0]);
  }
}

// 漢堡店：屋頂上一個漢堡（上下兩片麵包夾一圈藍色字帶）
function addBun(g: THREE.Group): void {
  const burger = childGroup(g, [0, SHOP_LAYOUT.height + 0.32, 0.5]);
  cylinder(burger, colorMaterial(0xf2a33a), 1.6, 0.5, [0, 0.25, 0], 24);
  cylinder(burger, colorMaterial(0x1f5fa8), 1.7, 0.35, [0, 0.67, 0], 24);
  addMesh(burger, new THREE.SphereGeometry(1.6, 24, 8, 0, TAU, 0, Math.PI / 2).scale(1, 0.6, 1), colorMaterial(0xf2a33a), [0, 0.85, 0]);
}

function addFeature(g: THREE.Group, brand: Brand, w: number): void {
  if (brand.feature === 'arches') addArches(g, w);
  else if (brand.feature === 'round') addRoundSign(g);
  else if (brand.feature === 'hat') addHatRoof(g, w);
  else if (brand.feature === 'donut') addDonut(g);
  else if (brand.feature === 'domino') addDomino(g);
  else if (brand.feature === 'bun') addBun(g);
}

/**
 * 在中心半徑 center、角度 theta 放一間店；outward 為 true 時門面朝外，否則朝圓心。
 * 外框方塊擋人（進不去）。
 */
function placeShop(props: THREE.Group, solids: SolidBox[], brand: Brand, width: number, center: number, theta: number, outward: boolean, floorY: number): void {
  const x = center * Math.sin(theta);
  const z = center * Math.cos(theta);
  const yaw = outward ? theta : theta + Math.PI;
  const shop = childGroup(props, [x, floorY, z], yaw);
  skipCollider(shop);
  addShopBody(shop, brand, width);
  if (brand.awning) addAwning(shop, width, brand.awning);
  addFeature(shop, brand, width);
  solids.push(orientedSolid(x, z, yaw, width, SHOP_LAYOUT.depth, floorY, floorY + SHOP_LAYOUT.height + 0.3));
}

// 一間店在「最窄那一側」的半徑上佔的角度：店是長方形，靠圓心那一側的角最先撞到隔壁
const spanAt = (width: number, tightRadius: number): number => 2 * Math.atan(width / 2 / tightRadius);

/**
 * A 排：環內緣一整圈店面，門面朝外，從 OTHERS 依序取。
 * 店背面貼著內緣（留 edge 公尺）；剩下的角度平均分給店與店之間。
 * @returns 店面正面的半徑（店門口的街道從這裡開始）
 */
export function addInnerShopRow(props: THREE.Group, solids: SolidBox[], inner: number, floorY: number, startAngle: number): number {
  const back = inner + SHOP_LAYOUT.edge;
  const center = back + SHOP_LAYOUT.depth / 2;
  const minGap = SHOP_LAYOUT.smallGap / back;
  const chosen: Brand[] = [];
  let used = 0;
  for (let i = 0; ; i++) {
    const brand = OTHERS[i % OTHERS.length];
    if (!brand) break;
    const span = spanAt(brand.width, back);
    if (used + span + minGap > TAU) break;
    chosen.push(brand);
    used += span + minGap;
  }
  const gap = minGap + (TAU - used) / chosen.length;
  let angle = startAngle;
  for (const brand of chosen) {
    const span = spanAt(brand.width, back);
    placeShop(props, solids, brand, brand.width, center, angle + span / 2, true, floorY);
    angle += span + gap;
  }
  return center + SHOP_LAYOUT.depth / 2;
}

/**
 * B、C 兩排背靠背：中線半徑 middle，C（外側，知名品牌，放大 FAMOUS_SCALE）門面朝外、B（內側）門面朝內。
 * 每 blockShops 間一組，組和組之間留一條通道（兩側的用餐區走得通）；B 和 C 用同一個角度格子，B 的寬度依半徑縮小。
 * @returns 每條通道中線的角度（用餐區的走道對齊這些角度）
 */
export function addBackToBackRows(props: THREE.Group, solids: SolidBox[], middle: number, floorY: number, startAngle: number): number[] {
  const { depth, backGap, passage, blockShops, smallGap } = SHOP_LAYOUT;
  const outerBack = middle + backGap / 2;
  const innerBack = middle - backGap / 2;
  const innerFront = innerBack - depth;
  // 先排出完整的幾組（角度）；放不下下一組就停，剩下的角度平均加到每條通道
  const blocks: { brands: Brand[]; spans: number[] }[] = [];
  let used = 0;
  let cursor = 0;
  for (;;) {
    const brands = Array.from({ length: blockShops }, (_, k) => FAMOUS[(cursor + k) % FAMOUS.length]).filter((brand): brand is Brand => brand !== undefined);
    const spans = brands.map((brand) => spanAt(brand.width * FAMOUS_SCALE, outerBack));
    const blockAngle = spans.reduce((sum, span) => sum + span, 0) + (smallGap * (blockShops - 1)) / outerBack + passage / innerFront;
    if (used + blockAngle > TAU) break;
    blocks.push({ brands, spans });
    used += blockAngle;
    cursor += blockShops;
  }
  const passageAngle = passage / innerFront + (TAU - used) / Math.max(1, blocks.length);
  const passages: number[] = [];
  let angle = startAngle;
  let other = 0;
  for (const block of blocks) {
    block.brands.forEach((brand, k) => {
      const span = block.spans[k] ?? 0;
      const theta = angle + span / 2;
      placeShop(props, solids, brand, brand.width * FAMOUS_SCALE, outerBack + depth / 2, theta, true, floorY);
      const innerBrand = OTHERS[(other++ + 5) % OTHERS.length];
      if (innerBrand) placeShop(props, solids, innerBrand, 2 * innerFront * Math.tan(span / 2) - 0.2, innerBack - depth / 2, theta, false, floorY);
      angle += span + (k < block.brands.length - 1 ? smallGap / outerBack : 0);
    });
    passages.push(angle + passageAngle / 2);
    angle += passageAngle;
  }
  return passages;
}
