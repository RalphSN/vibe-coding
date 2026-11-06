// 盧恩符文（Elder Futhark 24 個）：全部是直線筆畫，用一段一段的方柱拼成立體字，不靠字型。
// 用系統字型畫的話，沒有盧恩字型的電腦（例如沒裝 Noto Sans Runic 的 macOS）整個符號會畫不出來。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Stroke = [number, number, number, number];

// 每個符文的筆畫：(x0, y0) → (x1, y1)，字高 1、字寬 0–0.6
const RUNE_STROKES: Readonly<Record<string, readonly Stroke[]>> = {
  fehu: [[0, 0, 0, 1], [0, 0.5, 0.5, 0.8], [0, 0.75, 0.5, 1]],
  uruz: [[0, 0, 0, 1], [0, 1, 0.5, 0.7], [0.5, 0.7, 0.5, 0]],
  thurisaz: [[0, 0, 0, 1], [0, 0.75, 0.4, 0.5], [0.4, 0.5, 0, 0.25]],
  ansuz: [[0, 0, 0, 1], [0, 1, 0.45, 0.75], [0, 0.75, 0.45, 0.5]],
  raido: [[0, 0, 0, 1], [0, 1, 0.45, 0.78], [0.45, 0.78, 0, 0.55], [0, 0.55, 0.45, 0]],
  kaunan: [[0.4, 1, 0, 0.75], [0, 0.75, 0.4, 0.5]],
  gebo: [[0, 1, 0.6, 0], [0.6, 1, 0, 0]],
  wunjo: [[0, 0, 0, 1], [0, 1, 0.4, 0.8], [0.4, 0.8, 0, 0.6]],
  hagalaz: [[0, 0, 0, 1], [0.5, 0, 0.5, 1], [0, 0.65, 0.5, 0.35]],
  naudiz: [[0.25, 0, 0.25, 1], [0, 0.65, 0.5, 0.4]],
  isaz: [[0, 0, 0, 1]],
  jera: [[0.2, 1, 0, 0.75], [0, 0.75, 0.2, 0.5], [0.35, 0.5, 0.55, 0.25], [0.55, 0.25, 0.35, 0]],
  eihwaz: [[0.25, 0, 0.25, 1], [0.25, 1, 0.5, 0.8], [0.25, 0, 0, 0.2]],
  perthro: [[0, 0, 0, 1], [0, 1, 0.4, 0.75], [0.4, 0.75, 0.5, 1], [0, 0, 0.4, 0.25], [0.4, 0.25, 0.5, 0]],
  algiz: [[0.3, 0, 0.3, 1], [0.3, 0.55, 0, 0.95], [0.3, 0.55, 0.6, 0.95]],
  sowilo: [[0.45, 1, 0.05, 0.65], [0.05, 0.65, 0.45, 0.35], [0.45, 0.35, 0.05, 0]],
  tiwaz: [[0.3, 0, 0.3, 1], [0.3, 1, 0, 0.7], [0.3, 1, 0.6, 0.7]],
  berkanan: [[0, 0, 0, 1], [0, 1, 0.4, 0.75], [0.4, 0.75, 0, 0.5], [0, 0.5, 0.4, 0.25], [0.4, 0.25, 0, 0]],
  ehwaz: [[0, 0, 0, 1], [0.6, 0, 0.6, 1], [0, 1, 0.3, 0.7], [0.3, 0.7, 0.6, 1]],
  mannaz: [[0, 0, 0, 1], [0.6, 0, 0.6, 1], [0, 1, 0.6, 0.55], [0.6, 1, 0, 0.55]],
  laguz: [[0, 0, 0, 1], [0, 1, 0.4, 0.75]],
  ingwaz: [[0.3, 0.75, 0.6, 0.5], [0.6, 0.5, 0.3, 0.25], [0.3, 0.25, 0, 0.5], [0, 0.5, 0.3, 0.75]],
  dagaz: [[0, 0, 0, 1], [0.6, 0, 0.6, 1], [0, 1, 0.6, 0], [0.6, 1, 0, 0]],
  othala: [[0.3, 1, 0.55, 0.7], [0.3, 1, 0.05, 0.7], [0.55, 0.7, 0, 0], [0.05, 0.7, 0.6, 0]],
};

/** 24 個符文的名字（Elder Futhark 的順序）。 */
export const RUNES: readonly string[] = Object.keys(RUNE_STROKES);

const STROKE_WIDTH = 0.13;
const STROKE_DEPTH = 0.2;

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * 一個符文的立體幾何：字高約 1、置中在原點、厚度沿 z。
 * 每一筆是一根方柱，兩端多出半個筆寬，轉角才接得起來。
 */
export function runeGeometry(name: string): THREE.BufferGeometry {
  const cached = cache.get(name);
  if (cached) return cached;
  const strokes = RUNE_STROKES[name];
  if (!strokes) throw new Error(`沒有這個盧恩符文：${name}`);
  const parts = strokes.map(([x0, y0, x1, y1]) => {
    const length = Math.hypot(x1 - x0, y1 - y0) + STROKE_WIDTH;
    return new THREE.BoxGeometry(STROKE_WIDTH, length, STROKE_DEPTH)
      .rotateZ(-Math.atan2(x1 - x0, y1 - y0))
      .translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  });
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!geometry) throw new Error(`合併盧恩符文筆畫失敗：${name}`);
  geometry.computeBoundingBox();
  const center = geometry.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingBox();
  cache.set(name, geometry);
  return geometry;
}
