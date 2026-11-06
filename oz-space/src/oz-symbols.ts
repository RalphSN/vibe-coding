// 符號環上漂浮的立體符號：注音符號、程式語言會用到的符號、少量英文字母（周圍的盧恩符文另外畫，見 oz-runes.ts）。
// 不用另外載字型檔：用瀏覽器的字型把符號畫在 canvas 上，沿著筆畫的外框描出輪廓（包含字裡的洞），再擠出成有斜角的立體字。
// 每個符號的幾何只做一次（快取），之後用 InstancedMesh 大量擺放。
import * as THREE from 'three';

/** 注音符號（37 個） */
export const ZHUYIN: readonly string[] = [
  'ㄅ', 'ㄆ', 'ㄇ', 'ㄈ', 'ㄉ', 'ㄊ', 'ㄋ', 'ㄌ', 'ㄍ', 'ㄎ', 'ㄏ', 'ㄐ', 'ㄑ', 'ㄒ', 'ㄓ', 'ㄔ', 'ㄕ', 'ㄖ', 'ㄗ', 'ㄘ', 'ㄙ',
  'ㄚ', 'ㄛ', 'ㄜ', 'ㄝ', 'ㄞ', 'ㄟ', 'ㄠ', 'ㄡ', 'ㄢ', 'ㄣ', 'ㄤ', 'ㄥ', 'ㄦ', 'ㄧ', 'ㄨ', 'ㄩ',
];
/** 程式語言常見的符號與運算子 */
export const CODE_SYMBOLS: readonly string[] = [
  '{ }', '[ ]', '( )', '< >', '</>', ';', '=', '==', '===', '!=', '=>', '->', '&&', '||', '!', '?', ':', '::',
  '//', '/* */', '#', '$', '@', '&', '|', '%', '^', '~', '++', '--', '+=', '<=', '>=', '...', '\\', '_', '"', "'",
];
/** 英文字母 */
export const LETTERS: readonly string[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const EM_PX = 80;                 // 一個字在 canvas 上畫多大（像素）；輪廓的精細度
const PAD_PX = 10;
const DEPTH_PX = 16;              // 擠出厚度
const BEVEL_PX = 2;
const SMOOTHING = 3;              // Chaikin 平滑次數：把像素的鋸齒邊磨圓
// 磨圓之後再把幾乎在同一直線上的點拿掉（Douglas–Peucker，誤差 SIMPLIFY_PX 像素內）：
// 不簡化的話一個字上萬個三角形，一圈幾百個字就有幾百萬個
const SIMPLIFY_PX = 0.9;
const FONT = `bold ${EM_PX}px "Microsoft JhengHei", "PingFang TC", "Consolas", "Menlo", "Arial", sans-serif`;

type Point = [number, number];

// 把符號畫成黑白遮罩（true 是筆畫）。
function glyphMask(text: string): { mask: boolean[][]; width: number; height: number } | null {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error(`建立符號失敗：瀏覽器不支援 2D canvas（符號 ${text}）`);
  probe.font = FONT;
  const width = Math.min(640, Math.ceil(probe.measureText(text).width) + PAD_PX * 2);
  const height = Math.ceil(EM_PX * 1.4) + PAD_PX * 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`建立符號失敗：瀏覽器不支援 2D canvas（符號 ${text}）`);
  ctx.font = FONT;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  const data = ctx.getImageData(0, 0, width, height).data;
  let filled = 0;
  const mask = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    const on = (data[(y * width + x) * 4 + 3] ?? 0) > 127;
    if (on) filled++;
    return on;
  }));
  return filled > 0 ? { mask, width, height } : null;
}

// 沿著筆畫邊界描出封閉輪廓：每個筆畫格子露在外面的邊都記成一段有方向的邊（筆畫永遠在左手邊），再首尾相接。
// 同一個頂點接了兩段邊時（兩格只有對角相碰）優先左轉，兩格才會分開成兩圈，不會描成 8 字形。
function traceLoops(mask: boolean[][], width: number, height: number): Point[][] {
  const on = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && (mask[y]?.[x] ?? false);
  const edges = new Map<string, Point[]>();
  const add = (from: Point, to: Point): void => {
    const key = `${from[0]},${from[1]}`;
    const list = edges.get(key) ?? [];
    list.push(to);
    edges.set(key, list);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!on(x, y)) continue;
      // 數學座標：y 往上；這一格是 [x, x+1] × [b, b+1]
      const b = height - y - 1;
      const t = b + 1;
      if (!on(x, y + 1)) add([x, b], [x + 1, b]);
      if (!on(x + 1, y)) add([x + 1, b], [x + 1, t]);
      if (!on(x, y - 1)) add([x + 1, t], [x, t]);
      if (!on(x - 1, y)) add([x, t], [x, b]);
    }
  }
  const loops: Point[][] = [];
  for (const [startKey, targets] of edges) {
    while (targets.length > 0) {
      const start = startKey.split(',').map(Number) as Point;
      const loop: Point[] = [start];
      let previous = start;
      let current = targets.pop() ?? start;
      while (current[0] !== start[0] || current[1] !== start[1]) {
        loop.push(current);
        const options = edges.get(`${current[0]},${current[1]}`) ?? [];
        if (options.length === 0) break;
        const dx = current[0] - previous[0];
        const dy = current[1] - previous[1];
        // 左轉的方向是 (-dy, dx)
        let index = options.findIndex(([nx, ny]) => nx - current[0] === -dy && ny - current[1] === dx);
        if (index < 0) index = 0;
        const next = options.splice(index, 1)[0] ?? start;
        previous = current;
        current = next;
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
}

// 拿掉直線中間多餘的點，再用 Chaikin 切角把階梯狀的像素邊磨圓。
function smooth(loop: Point[]): Point[] {
  let points = loop.filter((point, i) => {
    const before = loop[(i + loop.length - 1) % loop.length] ?? point;
    const after = loop[(i + 1) % loop.length] ?? point;
    return (point[0] - before[0]) * (after[1] - point[1]) - (point[1] - before[1]) * (after[0] - point[0]) !== 0;
  });
  for (let pass = 0; pass < SMOOTHING; pass++) {
    const next: Point[] = [];
    points.forEach((point, i) => {
      const after = points[(i + 1) % points.length] ?? point;
      next.push([point[0] * 0.75 + after[0] * 0.25, point[1] * 0.75 + after[1] * 0.25], [point[0] * 0.25 + after[0] * 0.75, point[1] * 0.25 + after[1] * 0.75]);
    });
    points = next;
  }
  return simplifyLoop(points, SIMPLIFY_PX);
}

// 點到線段 ab 的距離
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// Douglas–Peucker：保留離首尾連線超過 tolerance 的最遠點，兩邊各自遞迴
function simplifyLine(points: Point[], tolerance: number): Point[] {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 3) return points;
  let farthest = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceToSegment(points[i] ?? first, first, last);
    if (distance > farthest) {
      farthest = distance;
      index = i;
    }
  }
  if (farthest <= tolerance) return [first, last];
  return [...simplifyLine(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplifyLine(points.slice(index), tolerance)];
}

// 封閉輪廓：從第一點和離它最遠的點切成兩段各自簡化
function simplifyLoop(loop: Point[], tolerance: number): Point[] {
  const start = loop[0];
  if (!start || loop.length < 8) return loop;
  let split = 0;
  let farthest = 0;
  loop.forEach((point, i) => {
    const distance = Math.hypot(point[0] - start[0], point[1] - start[1]);
    if (distance > farthest) {
      farthest = distance;
      split = i;
    }
  });
  const firstHalf = simplifyLine(loop.slice(0, split + 1), tolerance);
  const secondHalf = simplifyLine([...loop.slice(split), start], tolerance);
  return [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
}

const signedArea = (loop: Point[]): number =>
  loop.reduce((sum, [x, y], i) => {
    const [nx, ny] = loop[(i + 1) % loop.length] ?? [x, y];
    return sum + x * ny - nx * y;
  }, 0) / 2;

function contains(loop: Point[], [px, py]: Point): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i] ?? [0, 0];
    const [xj, yj] = loop[j] ?? [0, 0];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const toVectors = (loop: Point[]): THREE.Vector2[] => loop.map(([x, y]) => new THREE.Vector2(x, y));

const cache = new Map<string, THREE.BufferGeometry | null>();

/**
 * 一個符號的立體幾何：高約 1（以字的大小為準）、置中在原點、厚度沿 z。
 * 瀏覽器沒有這個字的字型（畫不出來）時回傳 null，呼叫端跳過它。
 */
export function symbolGeometry(text: string): THREE.BufferGeometry | null {
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  const glyph = glyphMask(text);
  if (!glyph) {
    cache.set(text, null);
    return null;
  }
  const loops = traceLoops(glyph.mask, glyph.width, glyph.height).map(smooth).filter((loop) => loop.length >= 3);
  // 逆時針（面積為正）是外框，順時針是字裡的洞；洞放進包著它、面積最小的外框
  const outers = loops.filter((loop) => signedArea(loop) > 0).sort((a, b) => signedArea(a) - signedArea(b));
  const shapes = new Map(outers.map((loop) => [loop, new THREE.Shape(toVectors(loop))]));
  for (const hole of loops.filter((loop) => signedArea(loop) < 0)) {
    const owner = outers.find((outer) => contains(outer, hole[0] ?? [0, 0]));
    if (owner) shapes.get(owner)?.holes.push(new THREE.Path(toVectors(hole)));
  }
  if (shapes.size === 0) {
    cache.set(text, null);
    return null;
  }
  const geometry = new THREE.ExtrudeGeometry([...shapes.values()], {
    depth: DEPTH_PX, bevelEnabled: true, bevelThickness: BEVEL_PX, bevelSize: BEVEL_PX * 0.6, bevelSegments: 1, curveSegments: 1,
  });
  geometry.computeBoundingBox();
  const center = geometry.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
  geometry.translate(-center.x, -center.y, -center.z).scale(1 / EM_PX, 1 / EM_PX, 1 / EM_PX);
  geometry.computeBoundingBox();
  cache.set(text, geometry);
  return geometry;
}
