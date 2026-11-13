// 球場、健身房共用的建模小工具：加網格、兩點之間的桿子、canvas 貼圖與畫線。
// 這些零件最後都會被 bakeByMaterial 依材質合併，所以每個零件各自 new 一個幾何也沒關係。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SolidBox } from './oz-props';

export type Rng = () => number;
export type Vec3 = [number, number, number];
export type Range = [number, number];

export const TAU = Math.PI * 2;
export const range = (rng: Rng, [min, max]: Range): number => min + (max - min) * rng();
export const pickFrom = <T>(rng: Rng, items: readonly T[], fallback: T): T => items[Math.floor(rng() * items.length)] ?? fallback;

export function addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: Vec3, rotation: Vec3 = [0, 0, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}
export const box = (parent: THREE.Object3D, material: THREE.Material, size: Vec3, position: Vec3, rotation?: Vec3): THREE.Mesh =>
  addMesh(parent, new THREE.BoxGeometry(...size), material, position, rotation);
export const cylinder = (parent: THREE.Object3D, material: THREE.Material, radius: number, height: number, position: Vec3, segments = 16, rotation?: Vec3): THREE.Mesh =>
  addMesh(parent, new THREE.CylinderGeometry(radius, radius, height, segments), material, position, rotation);
export const sphere = (parent: THREE.Object3D, material: THREE.Material, radius: number, position: Vec3, segments = 16): THREE.Mesh =>
  addMesh(parent, new THREE.SphereGeometry(radius, segments, Math.max(6, segments / 2)), material, position);
/** 水平的平面（地板、球場）：寬沿 x、深沿 z。 */
export const flat = (width: number, depth: number): THREE.BufferGeometry => new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2);
/** 直立、面向 ±x 的平面（球網）：寬度沿 z。 */
export const upright = (width: number, height: number): THREE.BufferGeometry => new THREE.PlaneGeometry(width, height).rotateY(Math.PI / 2);

/** 兩點之間的圓柱（桿子、斜撐、球桿）：radiusFrom 在 from 那一端。 */
export function rod(parent: THREE.Object3D, material: THREE.Material, from: Vec3, to: Vec3, radiusFrom: number, radiusTo = radiusFrom, segments = 8): THREE.Mesh {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTo, radiusFrom, direction.length(), segments), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh);
  return mesh;
}

export function childGroup(parent: THREE.Object3D, position: Vec3, yaw = 0): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  group.rotation.y = yaw;
  parent.add(group);
  return group;
}

/** 合併幾個形狀成一個（例如座椅的椅面、椅背、支柱）；屬性不一致時直接報錯。 */
export function merge(parts: THREE.BufferGeometry[], what: string): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error(`合併形狀失敗（${what}）：各部分的屬性不一致`);
  return merged;
}

// ---------- 碰撞 ----------
// 設施的碰撞是「看不見的標記」：一個空的 Object3D，userData 記著方塊大小，跟著設施一起擺位置；
// 整區建好後 collectColliders 依標記的世界位置、轉向換成有向方塊（SolidBox）。合併網格時只收網格，標記不受影響。
const COLLIDER_KEY = 'ozCollider';
const SKIP_KEY = 'ozNoCollider';
const isVec3 = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number');

/** 在 parent 座標的 center 放一個 size 大小的碰撞方塊（yaw 是繞垂直軸轉的角度）。 */
export function markCollider(parent: THREE.Object3D, size: Vec3, center: Vec3, yaw = 0): void {
  const marker = new THREE.Object3D();
  marker.position.set(...center);
  marker.rotation.y = yaw;
  marker.userData[COLLIDER_KEY] = size;
  parent.add(marker);
}

/** 用 object 底下所有網格的外框（在 object 自己的座標裡算）當碰撞方塊。 */
export function markBounds(object: THREE.Object3D, padding = 0.03): void {
  object.updateWorldMatrix(true, true);
  const toLocal = object.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  const part = new THREE.Box3();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.computeBoundingBox();
    const box = child.geometry.boundingBox;
    if (box) bounds.union(part.copy(box).applyMatrix4(child.matrixWorld).applyMatrix4(toLocal));
  });
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3()).addScalar(padding * 2);
  const center = bounds.getCenter(new THREE.Vector3());
  markCollider(object, [size.x, size.y, size.z], [center.x, center.y, center.z]);
}

/** 標記這個群組不要自動加外框碰撞（例如裡面要分開標的壁球牆、只有花台要擋的樹）。 */
export function skipCollider(object: THREE.Object3D): void {
  object.userData[SKIP_KEY] = true;
}

/** 一區設施裡每個直接的子群組（一件器材、一張桌子、一張長椅）各用自己的外框擋人。 */
export function markChildGroups(section: THREE.Object3D): void {
  for (const child of [...section.children]) {
    if (child instanceof THREE.Group && child.userData[SKIP_KEY] !== true) markBounds(child);
  }
}

/** 收集 root 底下所有碰撞標記，換成世界座標的有向方塊。 */
export function collectColliders(root: THREE.Object3D): SolidBox[] {
  root.updateMatrixWorld(true);
  const solids: SolidBox[] = [];
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axisU = new THREE.Vector3();
  const axisV = new THREE.Vector3();
  root.traverse((object) => {
    const size: unknown = object.userData[COLLIDER_KEY];
    if (!isVec3(size)) return;
    object.matrixWorld.decompose(position, rotation, scale);
    axisU.set(1, 0, 0).applyQuaternion(rotation).setY(0).normalize();
    axisV.set(-axisU.z, 0, axisU.x);   // 水平面上和 u 垂直
    const halfHeight = (size[1] * scale.y) / 2;
    solids.push({
      cx: position.x, cz: position.z, ux: axisU.x, uz: axisU.z, vx: axisV.x, vz: axisV.z,
      hu: (size[0] * scale.x) / 2, hv: (size[2] * scale.z) / 2, minY: position.y - halfHeight, maxY: position.y + halfHeight,
    });
  });
  return solids;
}

// ---------- 夜間燈光 ----------
// 燈也是看不見的標記（同碰撞）：放在燈泡位置，記著燈的種類、離下方地面多高、光斑往前偏多少（照明燈斜照時）。
// 整區合併網格前用 collectLights 收集成世界座標，夜晚的光暈、地面光斑、光束都照這份清單畫（見 oz-night.ts）。
const LIGHT_KEY = 'ozLight';
/** 燈的種類：street 路燈、path 步道燈、indoor 室內吊燈與檯燈、flood 照明燈（有光束、光斑大）、underwater 泳池水下燈（藍綠色，光斑在池底） */
export type LightKind = 'street' | 'path' | 'indoor' | 'flood' | 'underwater';
/**
 * 一盞燈（世界座標）：燈泡位置、光斑中心與地面高度（照明燈的光束從燈泡打到光斑中心）。
 * poolRadius 是光斑半徑（0 = 用這種燈的預設）；光斑只畫在離圓心 clipInner–clipOuter 的範圍，
 * 不會蓋到環外的空中或環上的縫隙（main.ts 預設設成整圈環的範圍，有縫隙的環自己縮小）。
 */
export interface LightSpot {
  kind: LightKind; x: number; y: number; z: number; poolX: number; poolY: number; poolZ: number;
  poolRadius: number; clipInner: number; clipOuter: number;
}
interface LightMark { kind: LightKind; drop: number; reach: number; poolRadius: number }
const isLightMark = (value: unknown): value is LightMark =>
  typeof value === 'object' && value !== null && 'kind' in value && 'drop' in value && 'reach' in value && 'poolRadius' in value;

/**
 * 在 parent 座標的 center 放一盞燈；drop 是燈泡到下方地面的高度（預設 center 的 y，也就是 parent 在地面上），
 * reach 是光斑沿 parent 的 +z 往前偏多遠，poolRadius 是光斑半徑（0 = 用這種燈的預設）。
 */
export function markLight(parent: THREE.Object3D, center: Vec3, kind: LightKind, drop = center[1], reach = 0, poolRadius = 0): void {
  const marker = new THREE.Object3D();
  marker.position.set(...center);
  const mark: LightMark = { kind, drop, reach, poolRadius };
  marker.userData[LIGHT_KEY] = mark;
  parent.add(marker);
}

/** 收集 root 底下所有燈的標記，換成世界座標。 */
export function collectLights(root: THREE.Object3D): LightSpot[] {
  root.updateMatrixWorld(true);
  const spots: LightSpot[] = [];
  const position = new THREE.Vector3();
  const forward = new THREE.Vector3();
  root.traverse((object) => {
    const mark: unknown = object.userData[LIGHT_KEY];
    if (!isLightMark(mark)) return;
    object.getWorldPosition(position);
    forward.set(0, 0, 1).transformDirection(object.matrixWorld).setY(0);
    if (forward.lengthSq() > 0) forward.normalize();
    spots.push({
      kind: mark.kind, x: position.x, y: position.y, z: position.z,
      poolX: position.x + forward.x * mark.reach, poolY: position.y - mark.drop, poolZ: position.z + forward.z * mark.reach,
      poolRadius: mark.poolRadius, clipInner: 0, clipOuter: Infinity,
    });
  });
  return spots;
}

/** 水平面的貼圖座標改成世界座標（公尺 / tileSize），磁磚、地墊在整圈上才會一樣大、不會被拉長。 */
export function planarUv(geometry: THREE.BufferGeometry, tileSize: number): void {
  const positions = geometry.getAttribute('position');
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = positions.getX(i) / tileSize;
    uv[i * 2 + 1] = positions.getZ(i) / tileSize;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function disposeGeometries(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
}

export function lambert(color: number, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}
export const mapped = (map: THREE.Texture, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ map, ...extra });

// ---------- 貼圖 ----------
function finishTexture(texture: THREE.CanvasTexture): THREE.CanvasTexture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** 以公尺為單位畫的貼圖：原點在中心，x 沿長邊、y 沿短邊（貼到水平平面上就是世界的 x、z）。 */
export function meterTexture(widthM: number, heightM: number, pxPerM: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(widthM * pxPerM));
  canvas.height = Math.max(1, Math.round(heightM * pxPerM));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`建立貼圖失敗：瀏覽器不支援 2D canvas（${widthM} × ${heightM} m）`);
  ctx.scale(canvas.width / widthM, canvas.height / heightM);
  ctx.translate(widthM / 2, heightM / 2);
  draw(ctx);
  return finishTexture(new THREE.CanvasTexture(canvas));
}

/** 以像素為單位畫的貼圖（重複鋪的網子、條紋、球的花紋）：原點在左上角，會重複鋪。 */
export function pixelTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`建立貼圖失敗：瀏覽器不支援 2D canvas（${width} × ${height} px）`);
  draw(ctx);
  const texture = finishTexture(new THREE.CanvasTexture(canvas));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** 線條以外緣對齊（規則裡線寬算在場地內），所以描邊要往內縮半條線。 */
export function strokeBox(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, line: number): void {
  ctx.lineWidth = line;
  ctx.strokeRect(x + line / 2, y + line / 2, width - line, height - line);
}
export function strokeLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, line: number): void {
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
export function strokeArc(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, from: number, to: number, line: number, dash: number[] = []): void {
  ctx.lineWidth = line;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.arc(x, y, radius, from, to);
  ctx.stroke();
  ctx.setLineDash([]);
}
export function fillDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}
/** 隨機小點（地墊的顆粒、沙子、絨布的紋理）。 */
export function speckle(ctx: CanvasRenderingContext2D, rng: Rng, width: number, height: number, count: number, colors: string[], size: Range): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)] ?? '#000';
    const s = range(rng, size);
    ctx.fillRect((rng() - 0.5) * width, (rng() - 0.5) * height, s, s);
  }
}
