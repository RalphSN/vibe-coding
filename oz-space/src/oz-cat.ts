// 中央倒圓錐頂上的貓頭（可愛風格）：
// 頭是略扁的半球；耳朵是圓角三角形（有厚度與圓邊），內側粉紅；
// 臉朝 +Z（出生點那一側）：圓滾滾的大眼睛（深色眼珠、藍色下半、兩個反光點）、腮紅、圓角小鼻子、
// 咧開嘴露齒笑（深紅嘴裡、一排上排牙、粉紅舌頭、深色嘴唇線）、兩側各三根彎彎的圓頭鬍鬚，脖子一圈紅項圈和金鈴鐺。
// 臉上的五官都是貼著頭表面的曲面薄片（照頭的曲率一格格算出頂點），不會有平面卡進球面或懸空的邊。
// 只有頭本身有碰撞（main.ts 的 Dome，高度用 CAT_HEAD_SQUASH）；耳朵和五官只有外觀。
import * as THREE from 'three';

/** 頭的高度是半徑的幾倍（略扁比較可愛）。碰撞的 Dome 也用這個比例。 */
export const CAT_HEAD_SQUASH = 0.86;
/** 耳尖大約比頭頂高出半徑的幾倍（周圍漂浮物要避開）。 */
export const CAT_EAR_REACH = 0.55;

const HEAD_SEGMENTS = 96;
// 耳朵（頭半徑的倍數）：圓角三角形的底寬、高、尖端與底角的圓角半徑、厚度；從正上方往左右偏 EAR_TILT
const EAR = { base: 0.6, height: 0.62, tipRound: 0.17, baseRound: 0.06, depth: 0.1, bevel: 0.045, tilt: 0.62, forward: 0.12, sink: 0.8 };
const INNER_EAR = { scale: 0.64, lift: 0.07 };
// 臉的座標：以臉中心方向（仰角 FACE_ELEVATION）為原點的切平面座標，x 往右、y 往上，單位是頭半徑
const FACE_ELEVATION = 0.42;
const EYE = { x: 0.32, y: 0.11, width: 0.13, height: 0.16 };
const MOUTH = { width: 0.19, top: -0.08, smile: 0.5, depth: 0.15 };
const TEETH = { count: 6, height: 0.038, cover: 0.8, gap: 0.007 };
const TONGUE = { width: 0.1, height: 0.085 };
const WHISKER = { x: 0.56, y: -0.02, spacing: 0.045, reach: 0.3, fan: 0.06, radius: 0.0065 };
const COLLAR = { tube: 0.03, bell: 0.075 };
const PATCH_COLUMNS = 36;
const PATCH_ROWS = 8;
// 各層離頭表面多高（m）：後面的層要比前面高一點才不會互相閃爍
const LIFT = { blush: 0.2, eye: 0.25, iris: 0.33, shine: 0.42, nose: 0.35, mouth: 0.25, tongue: 0.32, teeth: 0.34, line: 0.4 };

const COLORS = {
  eye: 0x2b2836, iris: 0x4a6fa5, shine: 0xffffff, blush: 0xf7a8b8, nose: 0xf28aa5, mouth: 0x6b2232,
  tongue: 0xf27b8b, teeth: 0xfdfdfd, line: 0x3a3340, collar: 0xd2463c, bell: 0xe2b23a,
};
type CatMaterials = Record<keyof typeof COLORS, THREE.Material>;
let catMaterials: CatMaterials | null = null;
function getCatMaterials(): CatMaterials {
  if (catMaterials) return catMaterials;
  const lambert = (color: number): THREE.Material => new THREE.MeshLambertMaterial({ color });
  catMaterials = {
    eye: new THREE.MeshStandardMaterial({ color: COLORS.eye, roughness: 0.25, metalness: 0.1 }),
    iris: lambert(COLORS.iris), shine: lambert(COLORS.shine), blush: lambert(COLORS.blush), nose: lambert(COLORS.nose),
    mouth: lambert(COLORS.mouth), tongue: lambert(COLORS.tongue), teeth: lambert(COLORS.teeth), line: lambert(COLORS.line),
    collar: lambert(COLORS.collar),
    bell: new THREE.MeshStandardMaterial({ color: COLORS.bell, roughness: 0.35, metalness: 0.25 }),
  };
  return catMaterials;
}

interface Head { center: THREE.Vector3; radius: number; height: number }

// 臉的切平面：d0 是臉中心方向（球面空間），u 往右、v 往上。
const FACE_D0 = new THREE.Vector3(0, Math.sin(FACE_ELEVATION), Math.cos(FACE_ELEVATION));
const FACE_U = new THREE.Vector3(1, 0, 0);
const FACE_V = new THREE.Vector3(0, Math.cos(FACE_ELEVATION), -Math.sin(FACE_ELEVATION));

/** 臉座標 (x, y)（頭半徑的倍數）在頭表面上、往外 lift 公尺的那一點（世界座標）。頭是扁的：先在球上算，再把高度壓扁。 */
function headPoint(head: Head, x: number, y: number, lift: number): THREE.Vector3 {
  const direction = FACE_D0.clone().add(FACE_U.clone().multiplyScalar(x)).add(FACE_V.clone().multiplyScalar(y)).normalize();
  const point = direction.multiplyScalar(head.radius + lift);
  return new THREE.Vector3(point.x, (point.y * head.height) / head.radius, point.z).add(head.center);
}

/** 貼著頭表面的一片：x 從 from 到 to，每個 x 在 low(x)–high(x) 之間，切成格子後每個頂點都投到頭表面上。 */
function facePatch(head: Head, from: number, to: number, low: (x: number) => number, high: (x: number) => number, lift: number, material: THREE.Material): THREE.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let c = 0; c <= PATCH_COLUMNS; c++) {
    const x = from + ((to - from) * c) / PATCH_COLUMNS;
    const bottom = low(x);
    const top = Math.max(bottom, high(x));
    for (let r = 0; r <= PATCH_ROWS; r++) {
      const point = headPoint(head, x, bottom + ((top - bottom) * r) / PATCH_ROWS, lift);
      positions.push(point.x, point.y, point.z);
    }
  }
  const column = PATCH_ROWS + 1;
  for (let c = 0; c < PATCH_COLUMNS; c++) {
    for (let r = 0; r < PATCH_ROWS; r++) {
      const a = c * column + r;
      const b = (c + 1) * column + r;
      // x 往右、y 往上的逆時針，法線朝外
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

/** 橢圓形的一片（中心 cx, cy；半寬 a、半高 b）。 */
function faceEllipse(head: Head, cx: number, cy: number, a: number, b: number, lift: number, material: THREE.Material): THREE.Mesh {
  const half = (x: number): number => b * Math.sqrt(Math.max(0, 1 - ((x - cx) / a) ** 2));
  return facePatch(head, cx - a, cx + a, (x) => cy - half(x), (x) => cy + half(x), lift, material);
}

/** 貼著頭表面的一條線（圓管）：points 是臉座標。 */
function faceLine(head: Head, points: [number, number][], lift: number, radius: number, material: THREE.Material, closed = false): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => headPoint(head, x, y, lift)), closed);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 4, radius, 6, closed), material);
}

// 圓角三角形：底邊在 y = 0、尖端朝上；每個角用二次曲線圓掉。
function roundedTriangle(base: number, height: number, tipRound: number, baseRound: number): THREE.Shape {
  const corners = [new THREE.Vector2(-base / 2, 0), new THREE.Vector2(0, height), new THREE.Vector2(base / 2, 0)];
  const radii = [baseRound, tipRound, baseRound];
  const shape = new THREE.Shape();
  corners.forEach((corner, i) => {
    const previous = corners[(i + corners.length - 1) % corners.length] ?? corner;
    const next = corners[(i + 1) % corners.length] ?? corner;
    const radius = radii[i] ?? 0;
    const enter = corner.clone().add(previous.clone().sub(corner).normalize().multiplyScalar(radius));
    const leave = corner.clone().add(next.clone().sub(corner).normalize().multiplyScalar(radius));
    if (i === 0) shape.moveTo(enter.x, enter.y);
    else shape.lineTo(enter.x, enter.y);
    shape.quadraticCurveTo(corner.x, corner.y, leave.x, leave.y);
  });
  shape.closePath();
  return shape;
}

function addEars(group: THREE.Group, head: Head, furMaterial: THREE.Material, innerMaterial: THREE.Material): void {
  const R = head.radius;
  const outer = new THREE.ExtrudeGeometry(roundedTriangle(R * EAR.base, R * EAR.height, R * EAR.tipRound, R * EAR.baseRound), {
    depth: R * EAR.depth, bevelEnabled: true, bevelThickness: R * EAR.bevel, bevelSize: R * EAR.bevel, bevelSegments: 5, curveSegments: 14,
  }).translate(0, 0, (-R * EAR.depth) / 2);
  const s = INNER_EAR.scale;
  const inner = new THREE.ExtrudeGeometry(roundedTriangle(R * EAR.base * s, R * EAR.height * s, R * EAR.tipRound * s, R * EAR.baseRound * s), {
    depth: R * 0.01, bevelEnabled: true, bevelThickness: R * 0.012, bevelSize: R * 0.012, bevelSegments: 3, curveSegments: 12,
  });
  for (const side of [-1, 1]) {
    // 耳根在頭表面往內一點的位置：從頭頂往左右偏 tilt、稍微往前
    const direction = new THREE.Vector3(side * Math.sin(EAR.tilt), Math.cos(EAR.tilt), EAR.forward).normalize();
    const ear = new THREE.Mesh(outer, furMaterial);
    ear.position.set(direction.x * R * EAR.sink, direction.y * head.height * EAR.sink, direction.z * R * EAR.sink).add(head.center);
    ear.rotation.set(-0.12, side * 0.22, -side * EAR.tilt * 0.85, 'YXZ');
    const pink = new THREE.Mesh(inner, innerMaterial);
    pink.position.set(0, R * INNER_EAR.lift, (R * EAR.depth) / 2 + R * EAR.bevel - R * 0.012);
    ear.add(pink);
    group.add(ear);
  }
}

function addEyes(group: THREE.Group, head: Head, M: CatMaterials): void {
  for (const side of [-1, 1]) {
    const cx = side * EYE.x;
    group.add(
      faceEllipse(head, cx, EYE.y, EYE.width, EYE.height, LIFT.eye, M.eye),
      faceEllipse(head, cx, EYE.y - EYE.height * 0.35, EYE.width * 0.72, EYE.height * 0.45, LIFT.iris, M.iris),
      faceEllipse(head, cx - EYE.width * 0.32, EYE.y + EYE.height * 0.35, EYE.width * 0.38, EYE.width * 0.38, LIFT.shine, M.shine),
      faceEllipse(head, cx + EYE.width * 0.3, EYE.y - EYE.height * 0.4, EYE.width * 0.17, EYE.width * 0.17, LIFT.shine, M.shine),
      faceEllipse(head, side * 0.44, -0.045, 0.085, 0.048, LIFT.blush, M.blush),
    );
  }
}

// 圓角小鼻子（倒三角）、鼻子到嘴的人中線。
function addNose(group: THREE.Group, head: Head, M: CatMaterials): void {
  const width = 0.052;
  const height = 0.038;
  const top = -0.005;
  group.add(facePatch(head, -width, width,
    (x) => top - height * (1 - (x / width) ** 2) ** 0.7,
    (x) => top + 0.006 * (1 - (x / width) ** 2), LIFT.nose, M.nose));
  group.add(faceLine(head, [[0, top - height + 0.004], [0, MOUTH.top + 0.012]], LIFT.line, head.radius * 0.006, M.line));
}

// 咧開嘴笑：上緣是兩端上揚的弧，下緣是大圓弧；嘴裡深紅、底部粉紅舌頭、上緣一排牙，外圈一條嘴唇線。
function addGrin(group: THREE.Group, head: Head, M: CatMaterials): void {
  const w = MOUTH.width;
  const top = (x: number): number => MOUTH.top + MOUTH.smile * x * x;
  const bottom = (x: number): number => top(x) - MOUTH.depth * Math.max(0, 1 - (x / w) ** 2) ** 0.45;
  group.add(facePatch(head, -w, w, bottom, top, LIFT.mouth, M.mouth));
  const tongueTop = (x: number): number => bottom(0) + TONGUE.height * Math.sqrt(Math.max(0, 1 - (x / TONGUE.width) ** 2));
  group.add(facePatch(head, -TONGUE.width, TONGUE.width, (x) => bottom(x) + 0.003, (x) => Math.max(bottom(x) + 0.004, tongueTop(x)), LIFT.tongue, M.tongue));
  const span = w * TEETH.cover * 2;
  const toothWidth = span / TEETH.count;
  for (let k = 0; k < TEETH.count; k++) {
    const from = -span / 2 + k * toothWidth + TEETH.gap / 2;
    const to = from + toothWidth - TEETH.gap;
    const middle = (from + to) / 2;
    const half = (to - from) / 2;
    group.add(facePatch(head, from, to,
      (x) => top(x) - TEETH.height * (0.7 + 0.3 * Math.sqrt(Math.max(0, 1 - ((x - middle) / half) ** 2))),
      (x) => top(x) - 0.003, LIFT.teeth, M.teeth));
  }
  const outline: [number, number][] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) outline.push([-w + (2 * w * i) / steps, top(-w + (2 * w * i) / steps)]);
  for (let i = steps - 1; i > 0; i--) outline.push([-w + (2 * w * i) / steps, bottom(-w + (2 * w * i) / steps)]);
  group.add(faceLine(head, outline, LIFT.line, head.radius * 0.007, M.line, true));
}

// 鬍鬚：從臉頰往外、略彎的圓管，兩端有小圓頭（不尖）。
function addWhiskers(group: THREE.Group, head: Head, M: CatMaterials): void {
  const R = head.radius;
  const tube = R * WHISKER.radius;
  const cap = new THREE.SphereGeometry(tube, 10, 8);
  for (const side of [-1, 1]) {
    for (const k of [-1, 0, 1]) {
      const start = headPoint(head, side * WHISKER.x, WHISKER.y + k * WHISKER.spacing, LIFT.line);
      const outward = new THREE.Vector3(side, 0, 0.35).normalize();
      const mid = start.clone().add(outward.clone().multiplyScalar(R * WHISKER.reach * 0.5)).add(new THREE.Vector3(0, R * (0.02 + k * WHISKER.fan * 0.4), 0));
      const end = start.clone().add(outward.clone().multiplyScalar(R * WHISKER.reach)).add(new THREE.Vector3(0, R * k * WHISKER.fan, 0));
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start, mid, end]), 16, tube, 8, false), M.line));
      for (const point of [start, end]) {
        const ball = new THREE.Mesh(cap, M.line);
        ball.position.copy(point);
        group.add(ball);
      }
    }
  }
}

// 紅項圈和金鈴鈴（鈴身、中間一圈、底部開口、頂上小環）。
function addCollar(group: THREE.Group, head: Head, M: CatMaterials): void {
  const R = head.radius;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(R, R * COLLAR.tube, 12, 128).rotateX(Math.PI / 2), M.collar);
  collar.position.copy(head.center);
  const bellRadius = R * COLLAR.bell;
  const bellCenter = head.center.clone().add(new THREE.Vector3(0, -bellRadius * 0.75, R + R * COLLAR.tube * 0.6));
  const bell = new THREE.Mesh(new THREE.SphereGeometry(bellRadius, 32, 24), M.bell);
  bell.position.copy(bellCenter);
  const band = new THREE.Mesh(new THREE.TorusGeometry(bellRadius * 0.98, bellRadius * 0.06, 8, 48).rotateX(Math.PI / 2), M.bell);
  band.position.copy(bellCenter).add(new THREE.Vector3(0, bellRadius * 0.15, 0));
  const slot = new THREE.Mesh(new THREE.BoxGeometry(bellRadius * 0.12, bellRadius * 0.5, bellRadius * 0.3), M.line);
  slot.position.copy(bellCenter).add(new THREE.Vector3(0, -bellRadius * 0.6, bellRadius * 0.72));
  slot.rotation.x = -0.6;
  const loop = new THREE.Mesh(new THREE.TorusGeometry(bellRadius * 0.25, bellRadius * 0.07, 8, 24), M.bell);
  loop.position.copy(bellCenter).add(new THREE.Vector3(0, bellRadius * 1.05, 0));
  group.add(collar, bell, band, slot, loop);
}

/** 在 group 裡建貓頭：頭頂平台中心 (0, topY, 0)、頭半徑 radius。 */
export function buildCatHead(group: THREE.Group, topY: number, radius: number, furMaterial: THREE.Material, innerEarMaterial: THREE.Material): void {
  const head: Head = { center: new THREE.Vector3(0, topY, 0), radius, height: radius * CAT_HEAD_SQUASH };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, HEAD_SEGMENTS, HEAD_SEGMENTS / 2, 0, Math.PI * 2, 0, Math.PI / 2), furMaterial);
  dome.scale.y = CAT_HEAD_SQUASH;
  dome.position.copy(head.center);
  group.add(dome);
  const M = getCatMaterials();
  addEars(group, head, furMaterial, innerEarMaterial);
  addEyes(group, head, M);
  addNose(group, head, M);
  addGrin(group, head, M);
  addWhiskers(group, head, M);
  addCollar(group, head, M);
}
