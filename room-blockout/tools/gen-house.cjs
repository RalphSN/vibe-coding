// 豪宅方正版（套房格局）：參照 66388WE 的功能與大小，牆一律東西向或南北向，一、二樓的走廊、樓梯塔、電梯上下對齊。
// 臥室都是套房（房間＋衛浴），一樓門廳旁另有客用衛浴。尺寸參考室內設計準則（見 room-blockout/README.md）。
// 座標單位公尺，原點約在房屋中心，+x 東、+z 南。房間是長方形（主浴是 L 型），牆由房間邊界自動產生。
const fs = require('fs');
const path = require('path');

const USAGE = `用法：node tools/gen-house.cjs [scene.config.json 路徑] [--dry-run]
  重新產生 scene.config.json 的房屋（scene.house、scene.spawn）與家具，角色、鏡頭等其他設定保留。
  沒給路徑時用 src/config/scene.config.json；寫入前先備份成同資料夾的 scene.config.backup.json。
  --dry-run  只印出會產生多少地板、牆、開口、家具，不寫檔
範例：npm run house`;
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const isDryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('-')) ?? path.join(__dirname, '..', 'src', 'config', 'scene.config.json');
if (!fs.existsSync(file)) {
  console.error(`找不到設定檔：${file}
${USAGE}`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
const r2 = (v) => Math.round(v * 100) / 100;
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// ---------- 一樓 ----------
// 臥室都做成套房（房間＋衛浴）：主臥套房在西北、客房套房在西南；門廳旁另有一間客用衛浴。
const F1 = {
  rooms: [
    { label: '主臥套房', pts: rect(-22, -8, -15, 0) },
    { label: '主臥衛浴', pts: rect(-15, -8, -11, -3) },
    { label: '主臥更衣室', pts: rect(-15, -3, -11, 0) },
    { label: '家庭室', pts: rect(-11, -8, 0, 0) },
    { label: '餐廳', pts: rect(0, -7, 6, 0) },
    { label: '廚房與休息區', pts: rect(6, -8, 14, 0) },
    { label: '主走廊', pts: rect(-22, 0, 16, 2.2) },
    { label: '客房套房', pts: [[-22, 2.2], [-15, 2.2], [-15, 5.2], [-11, 5.2], [-11, 8.2], [-22, 8.2]] },
    { label: '客房衛浴', pts: rect(-15, 2.2, -11, 5.2) },
    { label: '客用衛浴', pts: rect(-11, 2.2, -7, 5.2) },
    { label: '門廳', pts: rect(-7, 2.2, -1, 6.2) },
    { label: '樓梯塔', pts: rect(4, 2.2, 8, 7.7), ceiling: false },
    { label: '工作備餐間', pts: rect(8, 2.2, 12, 9) },
    { label: '洗衣與儲藏', pts: rect(12, 2.2, 16, 9) },
    { label: '電梯', pts: rect(12, 9, 14, 11) },
    { label: '車庫', kind: 'garage', pts: rect(16, 2, 24, 23) },
    { label: '車庫儲藏室', pts: rect(24, 17, 26.5, 22) },
    { label: '入口門廊', kind: 'deck', ceiling: true, pts: rect(-5.5, 6.2, -2.5, 9) },
    { label: '門廳旁露台', kind: 'deck', ceiling: true, pts: rect(-1, 2.2, 3, 5.5) },
    { label: '側門門廊', kind: 'deck', ceiling: true, pts: rect(9, 9, 12, 11.5) },
    { label: '北側有頂露台', kind: 'deck', ceiling: true, pts: rect(-22, -12, 0, -8) },
    { label: '餐廳北側露台', kind: 'deck', pts: rect(0, -12, 6, -7) },
    { label: '東側有頂露台', kind: 'deck', ceiling: true, pts: [[6, -12], [19, -12], [19, 0], [14, 0], [14, -8], [6, -8]] },
    { label: '烤肉露台', kind: 'deck', pts: [[19, -12], [27, -12], [27, 2], [16, 2], [16, 0], [19, 0]] },
  ],
  openings: [
    { label: '大門', kind: 'door', at: [-4, 6.2], width: 1.8, height: 2.6 },
    { label: '門廳通道', kind: 'slider', at: [-4, 2.2], width: 3, height: 3 },
    { label: '客用衛浴門', kind: 'door', at: [-9, 2.2], width: 1 },
    { label: '家庭室柱廊', kind: 'slider', at: [-5.5, 0], width: 7, height: 3 },
    { label: '家庭室落地門', kind: 'slider', at: [-5.5, -8], width: 5, height: 2.6 },
    { label: '家庭室往餐廳', kind: 'slider', at: [0, -3.5], width: 3, height: 3 },
    { label: '餐廳往走廊', kind: 'slider', at: [3, 0], width: 3, height: 3 },
    { label: '餐廳北門', kind: 'slider', at: [3, -7], width: 2.4 },
    { label: '廚房往餐廳', kind: 'slider', at: [6, -3.5], width: 2.5, height: 3 },
    { label: '廚房往走廊', kind: 'slider', at: [10, 0], width: 3, height: 3 },
    { label: '廚房北拉門', kind: 'slider', at: [10, -8], width: 2.4 },
    { label: '廚房東拉門', kind: 'slider', at: [14, -4], width: 2.4 },
    { label: '走廊往露台', kind: 'slider', at: [15, 0], width: 1.6 },
    { label: '走廊往烤肉露台', kind: 'door', at: [16, 1.1], width: 1.2 },
    { label: '主臥門', kind: 'door', at: [-18, 0], width: 1.1 },
    { label: '主臥往露台', kind: 'slider', at: [-18.5, -8], width: 2.4 },
    { label: '主臥往衛浴', kind: 'door', at: [-15, -5.5], width: 1 },
    { label: '主臥往更衣室', kind: 'door', at: [-15, -1.5], width: 1 },
    { label: '更衣室往衛浴', kind: 'door', at: [-13, -3], width: 1 },
    { label: '主臥西窗', kind: 'window', at: [-22, -4], width: 1.8 },
    { label: '主臥衛浴窗', kind: 'window', at: [-13, -8], width: 1.2, sill: 1.1 },
    { label: '客房門', kind: 'door', at: [-19, 2.2], width: 1.1 },
    { label: '客房往衛浴', kind: 'door', at: [-15, 3.7], width: 1 },
    { label: '客房西窗', kind: 'window', at: [-22, 5.2], width: 1.8 },
    { label: '客房南窗', kind: 'window', at: [-17, 8.2], width: 1.8 },
    { label: '樓梯塔入口', kind: 'slider', at: [7, 2.2], width: 1.6, height: 3 },
    { label: '樓梯塔窗', kind: 'window', at: [4, 6.2], width: 1.2 },
    { label: '備餐間門', kind: 'door', at: [10, 2.2], width: 1.2 },
    { label: '洗衣間門', kind: 'door', at: [14, 2.2], width: 1.2 },
    { label: '洗衣間往車庫', kind: 'door', at: [16, 5], width: 1 },
    { label: '備餐間往洗衣間', kind: 'door', at: [12, 6.5], width: 1 },
    { label: '側門', kind: 'door', at: [10.5, 9], width: 1 },
    { label: '電梯門', kind: 'door', at: [13, 9], width: 1 },
    // 車庫大門：雙車寬 18 × 8 ft（5.5 × 2.4 m），往上捲收，淨空用拉門的規則
    { label: '車庫大門', kind: 'slider', at: [20, 23], width: 5.5, height: 2.4 },
    { label: '車庫儲藏室門', kind: 'door', at: [24, 21.4], width: 1 },
    { label: '車庫東窗 1', kind: 'window', at: [24, 8], width: 1.2, sill: 1.2, height: 1 },
    { label: '車庫東窗 2', kind: 'window', at: [24, 16], width: 1.2, sill: 1.2, height: 1 },
  ],
  railings: [],
};

// 樓梯塔 4..8 × 2.2..7.7：U 型梯。東半邊往南上到 2.0 m 平台，西半邊往北上到 4.0 m 接二樓走廊。
function stairParts() {
  const [x0, z0, x1, z1] = [4, 2.2, 8, 7.7];
  const mid = (x0 + x1) / 2;
  const landing = r2(z1 - 1.3);
  const start = r2(z0 + 0.3);
  const count = 10;
  const tread = (landing - start) / count;
  const steps = [];
  for (let i = 0; i < count; i++) {
    const a = r2(start + tread * i);
    steps.push({ label: `樓梯 ${i + 1}`, minX: mid, maxX: r2(x1 - 0.08), minZ: a, maxZ: r2(a + tread), height: r2(0.2 * (i + 1)), isVisualOnly: true });
  }
  steps.push({ label: '樓梯平台', minX: r2(x0 + 0.08), maxX: r2(x1 - 0.08), minZ: landing, maxZ: r2(z1 - 0.08), height: 2 });
  for (let i = 0; i < count; i++) {
    const b = r2(landing - tread * i);
    const isTop = i === count - 1;
    steps.push({ label: `樓梯 ${count + i + 1}`, minX: r2(x0 + 0.08), maxX: mid, minZ: isTop ? r2(z0 + 0.08) : r2(b - tread), maxZ: b, height: r2(2 + 0.2 * (i + 1)), isVisualOnly: !isTop });
  }
  const half = tread / 2;
  const ramps = [
    { label: '樓梯斜面（東段）', minX: mid, maxX: r2(x1 - 0.08), minZ: r2(start - half), maxZ: r2(landing - half), uphill: 'south', bottom: 0, top: 2 },
    { label: '樓梯斜面（西段）', minX: r2(x0 + 0.08), maxX: mid, minZ: r2(start + half), maxZ: r2(landing + half), uphill: 'north', bottom: 2, top: 4 },
  ];
  return { steps, ramps };
}

// ---------- 二樓（地板 4.0 m） ----------
// 三間套房：臥室 3、臥室 2（L 型房間，衛浴背對背放在中間）、主臥套房 2（獨立大衛浴）；健身房不再細分。
const F2 = {
  rooms: [
    { label: '臥室套房 3', pts: [[-13, -6], [-6.5, -6], [-6.5, -2.5], [-9.5, -2.5], [-9.5, 0], [-13, 0]] },
    { label: '臥室 3 衛浴', pts: rect(-9.5, -2.5, -6.5, 0) },
    { label: '臥室 2 衛浴', pts: rect(-6.5, -2.5, -3.5, 0) },
    { label: '臥室套房 2', pts: [[-6.5, -6], [0, -6], [0, 0], [-3.5, 0], [-3.5, -2.5], [-6.5, -2.5]] },
    { label: '主臥 2 衛浴', pts: rect(0, -6, 6, 0) },
    { label: '主臥套房 2', pts: rect(6, -6, 14, 0) },
    { label: '二樓走廊', pts: rect(-13, 0, 14, 2.2) },
    { label: '健身房', pts: rect(8, 2.2, 16, 9) },
    { label: '二樓電梯', pts: rect(12, 9, 14, 11) },
    { label: '車庫上方儲藏', pts: rect(16, 2, 24, 14) },
    { label: '北側有頂陽台', kind: 'deck', ceiling: true, pts: rect(-13, -9, 0, -6) },
    { label: '南側有頂陽台', kind: 'deck', ceiling: true, pts: rect(-10, 2.2, -1, 5.5) },
    { label: '東側無頂陽台', kind: 'deck', pts: [[6, -12], [19, -12], [19, 2], [14, 2], [14, -6], [6, -6]] },
  ],
  wallsOnly: [{ label: '樓梯塔（二樓）', pts: rect(4, 2.2, 8, 7.7) }],
  openings: [
    { label: '臥室 3 門', kind: 'door', at: [-11.25, 0], width: 1.1 },
    { label: '臥室 3 衛浴門', kind: 'door', at: [-8, -2.5], width: 1 },
    { label: '臥室 3 陽台門', kind: 'slider', at: [-12, -6], width: 1.6 },
    { label: '臥室 2 門', kind: 'door', at: [-1.75, 0], width: 1.1 },
    { label: '臥室 2 衛浴門', kind: 'door', at: [-5, -2.5], width: 1 },
    { label: '臥室 2 陽台門', kind: 'slider', at: [-1.5, -6], width: 1.6 },
    { label: '主臥 2 衛浴門', kind: 'door', at: [6, -3], width: 1 },
    { label: '主臥 2 衛浴窗', kind: 'window', at: [3, -6], width: 1.2, sill: 1.1 },
    { label: '主臥 2 門', kind: 'door', at: [10, 0], width: 1.1 },
    { label: '主臥 2 陽台門', kind: 'slider', at: [10, -6], width: 2.4 },
    { label: '主臥 2 東門', kind: 'slider', at: [14, -3], width: 2 },
    { label: '走廊往陽台', kind: 'slider', at: [14, 1.1], width: 1.6 },
    { label: '南陽台門', kind: 'slider', at: [-5.5, 2.2], width: 1.8 },
    { label: '樓梯塔二樓入口', kind: 'slider', at: [5, 2.2], width: 1.6, height: 2.6 },
    { label: '健身房門', kind: 'slider', at: [11, 2.2], width: 1.6 },
    { label: '二樓電梯門', kind: 'door', at: [13, 9], width: 1 },
    { label: '健身房往儲藏', kind: 'door', at: [16, 7], width: 1.2 },
    { label: '走廊西窗', kind: 'window', at: [-13, 1.1], width: 1.2 },
    { label: '車庫上方東窗', kind: 'window', at: [24, 8], width: 1.2, sill: 1.1, height: 1 },
  ],
  railings: [
    [[-13, -9], [0, -9]], [[-13, -9], [-13, -6]], [[0, -9], [0, -6]],
    [[-10, 5.5], [-1, 5.5]], [[-10, 2.2], [-10, 5.5]], [[-1, 2.2], [-1, 5.5]],
    [[6, -12], [19, -12]], [[19, -12], [19, 2]], [[14, 2], [16, 2]], [[6, -12], [6, -6]],
  ],
};

// ---------- 產生器：房間邊界 → 牆（在所有頂點處切段、去除重複）→ 依座標點開門窗 ----------
const key = ([x, z]) => `${r2(x)},${r2(z)}`;
function buildLevel(spec, index, elevation, wallHeight) {
  const floors = spec.rooms.map((room) => {
    const floor = { label: room.label, kind: room.kind ?? 'room', points: room.pts.map(([x, z]) => [r2(x), r2(z)]) };
    if (room.ceiling !== undefined) floor.ceiling = room.ceiling;
    return floor;
  });
  const shapes = [...spec.rooms, ...(spec.wallsOnly ?? [])];
  const vertices = shapes.flatMap((room) => room.pts);
  const segments = new Map();
  for (const room of shapes) {
    if ((room.kind ?? 'room') === 'deck') continue;
    room.pts.forEach((a, i) => {
      const b = room.pts[(i + 1) % room.pts.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / length;
      const uz = (b[1] - a[1]) / length;
      const cuts = [0, length];
      for (const v of vertices) {
        const t = (v[0] - a[0]) * ux + (v[1] - a[1]) * uz;
        const off = Math.abs((v[0] - a[0]) * uz - (v[1] - a[1]) * ux);
        if (off < 0.01 && t > 0.01 && t < length - 0.01) cuts.push(t);
      }
      cuts.sort((p, q) => p - q);
      for (let k = 0; k + 1 < cuts.length; k++) {
        if (cuts[k + 1] - cuts[k] < 0.01) continue;
        const p = [a[0] + ux * cuts[k], a[1] + uz * cuts[k]];
        const q = [a[0] + ux * cuts[k + 1], a[1] + uz * cuts[k + 1]];
        const id = [key(p), key(q)].sort().join('|');
        if (!segments.has(id)) segments.set(id, { label: `${room.label}牆`, p, q });
      }
    });
  }
  const walls = [...segments.values()].map(({ label, p, q }, i) => ({
    label: `${label} ${i + 1}`, x1: r2(p[0]), z1: r2(p[1]), x2: r2(q[0]), z2: r2(q[1]), openings: [],
  }));
  for (const o of spec.openings) {
    const [px, pz] = o.at;
    let hits = 0;
    for (const wall of walls) {
      const dx = wall.x2 - wall.x1;
      const dz = wall.z2 - wall.z1;
      const length = Math.hypot(dx, dz);
      const t = ((px - wall.x1) * dx + (pz - wall.z1) * dz) / length;
      const dist = Math.abs((px - wall.x1) * dz - (pz - wall.z1) * dx) / length;
      if (dist > 0.05 || t < -0.01 || t > length + 0.01) continue;
      const width = Math.min(o.width, r2(length - 0.1));
      const offset = r2(Math.min(Math.max(t, width / 2), length - width / 2));
      const opening = { label: o.label, kind: o.kind, offset, width, height: o.height ?? (o.kind === 'window' ? 1.5 : 2.2) };
      if (o.kind === 'window') opening.sill = o.sill ?? 0.9;
      wall.openings.push(opening);
      hits++;
    }
    if (hits === 0) console.warn(`找不到牆：${o.label} at ${o.at}`);
  }
  const railings = spec.railings.map(([a, b], i) => ({ label: `欄杆 ${i + 1}`, x1: a[0], z1: a[1], x2: b[0], z2: b[1], height: 1.05 }));
  const stair = index === 0 ? stairParts() : { steps: [], ramps: [] };
  const voids = (spec.wallsOnly ?? []).map((room) => room.pts);
  return { label: index === 0 ? '一樓' : '二樓', elevation, wallHeight, floors, walls, railings, steps: stair.steps, ramps: stair.ramps, voids };
}

const SLAB = 0.25;
const levels = [buildLevel(F1, 0, 0, 4 - SLAB), buildLevel(F2, 1, 4, 3.2)];

// ---------- 家具 ----------
const roomRect = (level, label) => {
  const room = [F1, F2][level].rooms.find((r) => r.label === label);
  if (!room) throw new Error(`找不到房間：${label}`);
  const xs = room.pts.map((p) => p[0]);
  const zs = room.pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
};
const GAP = 0.14;   // 靠牆家具離牆中心線的距離（半個牆厚＋一點空隙）
const furniture = {};
let serial = 0;
const put = (level, type, label, x, z, rotation, width, depth, height) => {
  furniture[`f${String(++serial).padStart(3, '0')}`] = { type, label, x: r2(x), z: r2(z), rotation, width, depth, height, level };
};
// 靠某面牆：side 是 N／S／E／W，along 是從那面牆的西端（南北牆）或北端（東西牆）量起的中心位置；背面朝牆。
const wallPut = (level, type, label, room, side, along, width, depth, height) => {
  const r = roomRect(level, room);
  const inset = GAP + depth / 2;
  const spots = {
    N: [r.x0 + along, r.z0 + inset, 0], S: [r.x0 + along, r.z1 - inset, 180],
    W: [r.x0 + inset, r.z0 + along, 90], E: [r.x1 - inset, r.z0 + along, 270],
  };
  const [x, z, rotation] = spots[side];
  put(level, type, label, x, z, rotation, width, depth, height);
};
const ring = (level, label, cx, cz, radius, angles) => angles.forEach((deg, i) => {
  const rad = (deg * Math.PI) / 180;
  put(level, 'chair', `${label} ${i + 1}`, cx + Math.cos(rad) * radius, cz - Math.sin(rad) * radius, (((deg - 90) % 360) + 360) % 360, 0.45, 0.45, 0.9);
});
// 桌子兩側的椅子：axis 'x' 東西兩側、'z' 南北兩側；offsets 是沿桌子另一軸的位置
const sideChairs = (level, label, cx, cz, axis, reach, offsets) => {
  let n = 0;
  for (const side of [-1, 1]) {
    for (const off of offsets) {
      const [x, z] = axis === 'x' ? [cx + side * reach, cz + off] : [cx + off, cz + side * reach];
      const rotation = axis === 'x' ? (side < 0 ? 90 : 270) : (side < 0 ? 0 : 180);
      put(level, 'chair', `${label} ${++n}`, x, z, rotation, 0.45, 0.45, 0.9);
    }
  }
};

// ===== 一樓 =====
// 依準則：床兩側與床尾留 0.9 m、衛浴設備前方留約 0.76 m、餐桌四周留 1 m 以上、烤爐在活動區邊緣。
// 主臥套房
wallPut(0, 'bed', '主臥大床', '主臥套房', 'W', 4, 1.93, 2.03, 0.5);
wallPut(0, 'table', '主臥床頭櫃 1', '主臥套房', 'W', 2.6, 0.45, 0.45, 0.6);
wallPut(0, 'table', '主臥床頭櫃 2', '主臥套房', 'W', 5.4, 0.45, 0.45, 0.6);
wallPut(0, 'sofa', '主臥雙人沙發', '主臥套房', 'N', 6, 1.6, 0.85, 0.8);
wallPut(0, 'counter', '主臥五斗櫃', '主臥套房', 'S', 1.6, 1.4, 0.5, 0.85);
wallPut(0, 'bath', '主臥浴缸', '主臥衛浴', 'N', 2, 1.7, 0.9, 0.6);
wallPut(0, 'bath', '主臥洗手台', '主臥衛浴', 'E', 2.0, 1.6, 0.55, 0.85);
wallPut(0, 'bath', '主臥馬桶', '主臥衛浴', 'W', 4.3, 0.45, 0.7, 0.8);
put(0, 'bath', '主臥淋浴間', -11.64, -3.64, 180, 1.0, 1.0, 2.1);
wallPut(0, 'wardrobe', '更衣室衣櫃 1', '主臥更衣室', 'E', 0.9, 1.2, 0.6, 2.2);
wallPut(0, 'wardrobe', '更衣室衣櫃 2', '主臥更衣室', 'E', 2.1, 1.2, 0.6, 2.2);
wallPut(0, 'wardrobe', '更衣室衣櫃 3', '主臥更衣室', 'S', 1.5, 1.2, 0.6, 2.2);
// 客房套房與客用衛浴
wallPut(0, 'bed', '客房床', '客房套房', 'W', 3, 1.52, 2.03, 0.5);
wallPut(0, 'table', '客房床頭櫃 1', '客房套房', 'W', 1.8, 0.45, 0.45, 0.6);
wallPut(0, 'table', '客房床頭櫃 2', '客房套房', 'W', 4.2, 0.45, 0.45, 0.6);
wallPut(0, 'desk', '客房書桌', '客房套房', 'S', 5, 1.2, 0.6, 0.75);
put(0, 'chair', '客房椅子', -17, 7.05, 180, 0.45, 0.45, 0.9);
wallPut(0, 'wardrobe', '客房衣櫃', '客房套房', 'S', 9, 1.2, 0.6, 2.2);
wallPut(0, 'bath', '客房馬桶', '客房衛浴', 'N', 2, 0.45, 0.7, 0.8);
wallPut(0, 'bath', '客房洗手台', '客房衛浴', 'S', 2.2, 1.2, 0.55, 0.85);
put(0, 'bath', '客房淋浴間', -11.6, 3.0, 0, 0.9, 0.9, 2.1);
wallPut(0, 'bath', '客用馬桶', '客用衛浴', 'E', 2.2, 0.45, 0.7, 0.8);
wallPut(0, 'bath', '客用洗手台', '客用衛浴', 'W', 1.5, 1.2, 0.55, 0.85);
// 家庭室
put(0, 'sofa', '家庭室沙發', -5.5, -1.4, 180, 3.0, 0.95, 0.85);
wallPut(0, 'sofa', '家庭室側沙發', '家庭室', 'W', 4, 2.2, 0.95, 0.85);
put(0, 'sofa', '家庭室單人沙發 1', -2.4, -4.9, 270, 0.9, 0.9, 0.85);
put(0, 'sofa', '家庭室單人沙發 2', -2.4, -3.2, 270, 0.9, 0.9, 0.85);
put(0, 'table', '家庭室咖啡桌', -5.5, -3.6, 0, 1.3, 0.7, 0.45);
wallPut(0, 'bookcase', '家庭室書櫃 1', '家庭室', 'N', 1, 1.0, 0.35, 2.0);
wallPut(0, 'bookcase', '家庭室書櫃 2', '家庭室', 'N', 10, 1.0, 0.35, 2.0);
// 餐廳：十人餐桌（每人 0.6 m），長邊沿南北，四周留 1.7 m 以上
put(0, 'table', '十人餐桌', 3, -3.5, 90, 3.0, 1.2, 0.75);
sideChairs(0, '餐椅', 3, -3.5, 'x', 1.05, [-1.2, -0.6, 0, 0.6, 1.2]);
// 廚房
put(0, 'island', '廚房中島', 10, -4, 0, 3.0, 1.1, 0.95);
wallPut(0, 'counter', '廚房檯面（西北）', '廚房與休息區', 'N', 1.3, 2.0, 0.65, 0.9);
wallPut(0, 'counter', '廚房檯面（東北）', '廚房與休息區', 'N', 6.35, 1.5, 0.65, 0.9);
wallPut(0, 'wardrobe', '冰箱', '廚房與休息區', 'E', 1.6, 0.9, 0.7, 2.0);
put(0, 'sofa', '休息區沙發', 12.3, -1.45, 180, 2.0, 0.9, 0.85);
put(0, 'table', '早餐桌', 7.6, -1.8, 0, 1.0, 1.0, 0.75);
put(0, 'chair', '早餐椅 1', 7.6, -2.85, 0, 0.45, 0.45, 0.9);
put(0, 'chair', '早餐椅 2', 7.6, -0.8, 180, 0.45, 0.45, 0.9);
// 門廳、備餐間、洗衣
wallPut(0, 'table', '玄關桌', '門廳', 'W', 2.5, 1.2, 0.35, 0.8);
wallPut(0, 'counter', '備餐間檯面（西）', '工作備餐間', 'W', 2, 2.4, 0.6, 0.9);
wallPut(0, 'counter', '備餐間檯面（東）', '工作備餐間', 'E', 2, 1.6, 0.6, 0.9);
wallPut(0, 'bookcase', '備餐間層架', '工作備餐間', 'W', 5.5, 1.2, 0.45, 2.0);
wallPut(0, 'counter', '洗衣機與烘衣機', '洗衣與儲藏', 'E', 5.3, 1.6, 0.6, 0.9);
wallPut(0, 'bookcase', '洗衣間層架', '洗衣與儲藏', 'W', 1.3, 1.2, 0.45, 2.0);
// 車庫
// 車子南北向停，車頭朝南邊的大門：門口一排三台、後排一台
for (const [i, [x, z]] of [[17.5, 18.5], [20, 18.5], [22.5, 18.5], [20, 11]].entries()) put(0, 'car', `車 ${i + 1}`, x, z, 180, i === 3 ? 1.95 : 1.85, i === 3 ? 5.0 : 4.8, i === 3 ? 1.8 : 1.45);
wallPut(0, 'bookcase', '車庫層架 1', '車庫', 'E', 1.0, 1.2, 0.45, 2.0);
wallPut(0, 'bookcase', '車庫層架 2', '車庫', 'E', 2.3, 1.2, 0.45, 2.0);
wallPut(0, 'bookcase', '儲藏室層架', '車庫儲藏室', 'E', 1.5, 1.2, 0.45, 2.0);
// 露台：有頂露台只留一組休息沙發；烤肉露台放長桌與烤爐
put(0, 'sofa', '北露台沙發', -8, -11.3, 0, 2.4, 0.85, 0.8);
put(0, 'table', '北露台茶几', -8, -10.1, 0, 1.0, 0.5, 0.4);
put(0, 'table', '烤肉長桌', 22, -5, 0, 3.6, 1.0, 0.75);
sideChairs(0, '烤肉椅', 22, -5, 'z', 0.85, [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5]);
put(0, 'counter', '烤爐與備料檯', 26.35, -9, 270, 2.4, 0.7, 0.9);

// ===== 二樓 =====
// 臥室套房 3
wallPut(1, 'bed', '臥室 3 床', '臥室套房 3', 'N', 4, 1.52, 2.03, 0.5);
wallPut(1, 'table', '臥室 3 床頭櫃 1', '臥室套房 3', 'N', 2.8, 0.45, 0.45, 0.6);
wallPut(1, 'table', '臥室 3 床頭櫃 2', '臥室套房 3', 'N', 5.2, 0.45, 0.45, 0.6);
wallPut(1, 'desk', '臥室 3 書桌', '臥室套房 3', 'W', 1.5, 1.2, 0.6, 0.75);
put(1, 'chair', '臥室 3 椅子', -11.95, -4.5, 270, 0.45, 0.45, 0.9);
wallPut(1, 'wardrobe', '臥室 3 衣櫃', '臥室套房 3', 'W', 4.9, 1.2, 0.6, 2.2);
wallPut(1, 'bath', '臥室 3 馬桶', '臥室 3 衛浴', 'S', 0.6, 0.45, 0.7, 0.8);
wallPut(1, 'bath', '臥室 3 洗手台', '臥室 3 衛浴', 'S', 1.6, 1.0, 0.5, 0.85);
put(1, 'bath', '臥室 3 淋浴間', -7.05, -1.95, 0, 0.9, 0.9, 2.1);
// 臥室套房 2
wallPut(1, 'bed', '臥室 2 床', '臥室套房 2', 'N', 2.5, 1.52, 2.03, 0.5);
wallPut(1, 'table', '臥室 2 床頭櫃 1', '臥室套房 2', 'N', 1.3, 0.45, 0.45, 0.6);
wallPut(1, 'table', '臥室 2 床頭櫃 2', '臥室套房 2', 'N', 3.7, 0.45, 0.45, 0.6);
wallPut(1, 'desk', '臥室 2 書桌', '臥室套房 2', 'E', 3.0, 1.2, 0.6, 0.75);
put(1, 'chair', '臥室 2 椅子', -1.05, -3.0, 90, 0.45, 0.45, 0.9);
wallPut(1, 'wardrobe', '臥室 2 衣櫃', '臥室套房 2', 'E', 4.9, 1.2, 0.6, 2.2);
wallPut(1, 'bath', '臥室 2 馬桶', '臥室 2 衛浴', 'S', 2.4, 0.45, 0.7, 0.8);
wallPut(1, 'bath', '臥室 2 洗手台', '臥室 2 衛浴', 'S', 1.4, 1.0, 0.5, 0.85);
put(1, 'bath', '臥室 2 淋浴間', -5.95, -1.95, 0, 0.9, 0.9, 2.1);
// 主臥套房 2 與衛浴
put(1, 'bath', '主臥 2 浴缸', 3, -4.2, 0, 1.7, 0.9, 0.6);
wallPut(1, 'bath', '主臥 2 洗手台', '主臥 2 衛浴', 'S', 3, 1.8, 0.55, 0.85);
wallPut(1, 'bath', '主臥 2 馬桶', '主臥 2 衛浴', 'W', 1.0, 0.45, 0.7, 0.8);
put(1, 'bath', '主臥 2 淋浴間', 5.36, -5.36, 0, 1.0, 1.0, 2.1);
wallPut(1, 'bed', '主臥 2 大床', '主臥套房 2', 'S', 6.2, 1.93, 2.03, 0.5);
wallPut(1, 'table', '主臥 2 床頭櫃 1', '主臥套房 2', 'S', 4.9, 0.5, 0.45, 0.6);
wallPut(1, 'table', '主臥 2 床頭櫃 2', '主臥套房 2', 'S', 7.5, 0.5, 0.45, 0.6);
put(1, 'sofa', '主臥 2 沙發', 12.2, -4.5, 0, 1.8, 0.9, 0.85);
wallPut(1, 'desk', '主臥 2 書桌', '主臥套房 2', 'W', 1.2, 1.4, 0.6, 0.75);
put(1, 'chair', '主臥 2 椅子', 7.15, -4.8, 270, 0.45, 0.45, 0.9);
wallPut(1, 'wardrobe', '主臥 2 衣櫃 1', '主臥套房 2', 'S', 1.2, 1.2, 0.6, 2.2);
wallPut(1, 'wardrobe', '主臥 2 衣櫃 2', '主臥套房 2', 'S', 2.5, 1.2, 0.6, 2.2);
// 健身房、儲藏
put(1, 'island', '跑步機 1', 9.4, 7.4, 180, 1.9, 0.85, 1.0);
put(1, 'island', '跑步機 2', 11.5, 7.4, 180, 1.9, 0.85, 1.0);
put(1, 'table', '健身房長凳', 14, 5.5, 90, 1.2, 0.5, 0.45);
wallPut(1, 'bookcase', '健身房層架', '健身房', 'N', 1.0, 1.2, 0.45, 2.0);
for (const [i, along] of [2, 4, 9.6, 11.2].entries()) wallPut(1, 'bookcase', `車庫上方層架 ${i + 1}`, '車庫上方儲藏', 'E', along, 1.2, 0.45, 2.0);
// 陽台：簡單的休息座位
put(1, 'sofa', '北陽台單人椅 1', -9, -8.3, 0, 0.9, 0.9, 0.85);
put(1, 'sofa', '北陽台單人椅 2', -5, -8.3, 0, 0.9, 0.9, 0.85);
put(1, 'table', '北陽台小桌', -7, -8.4, 0, 0.6, 0.6, 0.5);
put(1, 'table', '南陽台桌', -5.5, 4.2, 0, 1.2, 0.8, 0.75);
sideChairs(1, '南陽台椅', -5.5, 4.2, 'x', 0.95, [0]);
put(1, 'sofa', '東陽台躺椅 1', 16.5, -4.2, 90, 0.75, 1.9, 0.4);
put(1, 'sofa', '東陽台躺椅 2', 16.5, -2.4, 90, 0.75, 1.9, 0.4);

// ---------- 基地與街道（參考比佛利山莊平地區：大基地、深前院、寬行道樹草帶） ----------
// 每塊基地 69 × 62 m；本宅與東西鄰地在街道北側，對街兩塊錯開半個基地寬。
// 道路用地 18 m：人行道 1.5＋草帶 2.5＋車道 10＋草帶 2.5＋人行道 1.5。每塊基地一條 5.5 m 車道接到路面。
const LOT = { w: 69, d: 62 };
const STREET = { north: 40, walkN: 41.5, curbN: 44, curbS: 54, walkS: 56.5, south: 58 };
const SITE_X = [-101, 106];
const lots = [
  { label: '本宅基地', x0: -32, z0: STREET.north - LOT.d, driveway: [17.25, 22.75], from: 23 },
  { label: '西鄰基地', x0: -101, z0: STREET.north - LOT.d, driveway: [-88, -82.5], from: 15 },
  { label: '東鄰基地', x0: 37, z0: STREET.north - LOT.d, driveway: [88, 93.5], from: 15 },
  { label: '對街西鄰基地', x0: -66.5, z0: STREET.south, driveway: [-24, -18.5], to: 83 },
  { label: '對街東鄰基地', x0: 2.5, z0: STREET.south, driveway: [40, 45.5], to: 83 },
];
// 把 [x0, x1] 扣掉車道經過的區段（人行道和草帶在車道處斷開，車道直接接到路面）
const splitX = (x0, x1, cuts) => {
  const spans = [];
  let cursor = x0;
  for (const [a, b] of [...cuts].sort((p, q) => p[0] - q[0])) {
    if (a > cursor) spans.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < x1) spans.push([cursor, x1]);
  return spans;
};
const northCuts = lots.filter((lot) => lot.from !== undefined).map((lot) => lot.driveway);
const southCuts = lots.filter((lot) => lot.to !== undefined).map((lot) => lot.driveway);
const site = [
  { label: '街道路面', kind: 'street', points: rect(SITE_X[0], STREET.curbN, SITE_X[1], STREET.curbS) },
  ...splitX(SITE_X[0], SITE_X[1], northCuts).flatMap(([a, b], i) => [
    { label: `北側人行道 ${i + 1}`, kind: 'sidewalk', points: rect(a, STREET.north, b, STREET.walkN) },
    { label: `北側行道樹草帶 ${i + 1}`, kind: 'parkway', points: rect(a, STREET.walkN, b, STREET.curbN) },
  ]),
  ...splitX(SITE_X[0], SITE_X[1], southCuts).flatMap(([a, b], i) => [
    { label: `南側行道樹草帶 ${i + 1}`, kind: 'parkway', points: rect(a, STREET.curbS, b, STREET.walkS) },
    { label: `南側人行道 ${i + 1}`, kind: 'sidewalk', points: rect(a, STREET.walkS, b, STREET.south) },
  ]),
  ...lots.map((lot) => ({ label: lot.label, kind: 'lot', points: rect(lot.x0, lot.z0, lot.x0 + LOT.w, lot.z0 + LOT.d) })),
  ...lots.map((lot) => {
    const [a, b] = lot.driveway;
    const name = lot.label.replace('基地', '車道');
    return lot.from !== undefined
      ? { label: name, kind: 'driveway', points: rect(a, lot.from, b, STREET.curbN) }
      : { label: name, kind: 'driveway', points: rect(a, STREET.curbS, b, lot.to) };
  }),
];

// ---------- 鄰宅外觀量體（參考比佛利山莊平地區常見的復古風格，只有外殼、進不去） ----------
// 每棟高度含屋頂控制在約 10 m 內（中央區獨棟住宅上限 32 ft ≈ 9.75 m，第三方法規整理，未對照官方條文）。
// 前牆退到和本宅差不多的位置；車庫門對齊每塊基地的車道盡頭。
const mass = (label, rect, height, roof, pitch, ridge = 'x', base = 0) => ({ label, rect, base, height, roof, pitch, ridge });
const box = (label, part, min, max) => ({ label, part, min, max });
const FACE = 0.06;   // 貼在牆面上的細節凸出多少
// side = +1 表示牆面朝 +z（南），-1 朝 -z（北）；細節往牆外凸出
const onFace = (label, part, z, side, x0, x1, y0, y1) =>
  box(label, part, [x0, y0, side > 0 ? z : z - FACE], [x1, y1, side > 0 ? z + FACE : z]);
const windowRow = (label, z, side, xs, rows, width) =>
  xs.flatMap((x, i) => rows.map(([y0, y1], j) => onFace(`${label} ${j + 1}-${i + 1}`, 'glass', z, side, x - width / 2, x + width / 2, y0, y1)));
const GLASS = '#6f8fa6';

const buildings = [
  {
    label: '西鄰住宅', style: '西班牙殖民復興（Spanish Colonial Revival）',
    colors: { wall: '#efe6d6', roof: '#b4552f', trim: '#5a3d2b', glass: GLASS },
    masses: [
      mass('主樓', [-80, 4, -60, 22], 6.2, 'hip', 20),
      mass('側翼', [-60, -4, -46, 16], 3.6, 'gable', 22, 'z'),
      mass('樓梯塔', [-65, 20, -61, 24], 7.6, 'hip', 25),
      mass('車庫', [-92, 3, -80, 15], 3.2, 'hip', 20),
    ],
    details: [
      ...[-58, -55, -52, -49, -46.4].map((x, i) => box(`拱廊柱 ${i + 1}`, 'wall', [x - 0.2, 0, 18.1], [x + 0.2, 3, 18.5])),
      box('拱廊瓦頂', 'roof', [-60, 3, 16], [-46, 3.3, 18.6]),
      ...windowRow('主樓窗', 22, 1, [-78, -74.5, -71], [[1, 2.4], [4.2, 5.4]], 1.2),
      onFace('大門', 'trim', 22, 1, -68.6, -67.2, 0, 2.6),
      onFace('樓梯塔窗', 'glass', 24, 1, -63.4, -62.6, 4.5, 6),
      onFace('車庫門', 'trim', 15, 1, -88, -82.5, 0, 2.4),
      box('煙囪', 'wall', [-79, 0, 10], [-77.6, 10.2, 11.4]),
    ],
  },
  {
    label: '東鄰住宅', style: '都鐸復興（Tudor Revival）',
    colors: { wall: '#ebe3d0', roof: '#4a4846', trim: '#3a2b20', glass: GLASS },
    masses: [
      mass('主樓', [52, 10, 80, 22], 5.4, 'gable', 35),
      mass('正面山牆', [60, 22, 69, 26], 5.4, 'gable', 42, 'z'),
      mass('後翼', [54, -4, 78, 10], 3.4, 'hip', 30),
      mass('連廊', [80, 6, 84, 14], 3, 'gable', 35),
      mass('車庫', [84, 3, 97, 15], 3.2, 'gable', 40),
    ],
    details: [
      // 半木構：二樓外露的深色木框
      onFace('山牆腰帶', 'trim', 26, 1, 60, 69, 2.9, 3.15),
      ...[60.9, 63.1, 65.4, 67.6].map((x, i) => onFace(`山牆木框 ${i + 1}`, 'trim', 26, 1, x - 0.11, x + 0.11, 3.15, 5.4)),
      onFace('主樓腰帶', 'trim', 22, 1, 52, 80, 2.9, 3.15),
      ...[53.5, 57, 71, 74.5, 78].map((x, i) => onFace(`主樓木框 ${i + 1}`, 'trim', 22, 1, x - 0.11, x + 0.11, 3.15, 5.4)),
      ...windowRow('主樓窗', 22, 1, [55.3, 72.8, 76.3], [[1, 2.3], [3.5, 4.8]], 1.6),
      onFace('山牆凸窗', 'glass', 26, 1, 62.5, 66.5, 1, 2.3),
      onFace('山牆上窗', 'glass', 26, 1, 63.6, 65.4, 3.4, 4.6),
      onFace('大門', 'trim', 22, 1, 70, 71.3, 0, 2.4),
      onFace('車庫門', 'trim', 15, 1, 88, 93.5, 0, 2.3),
      box('煙囪', 'trim', [50.6, 0, 15], [52, 11.5, 17]),
    ],
  },
  {
    label: '對街西鄰住宅', style: '喬治亞／殖民復興（Georgian / Colonial Revival）',
    colors: { wall: '#a65a44', roof: '#3f4347', trim: '#f3efe6', glass: GLASS },
    masses: [
      mass('主樓', [-52, 75, -28, 89], 6.4, 'hip', 25),
      mass('西翼', [-61, 78, -52, 88], 3.6, 'hip', 25, 'z'),
      mass('車庫翼', [-28, 83, -15.5, 95], 3.4, 'hip', 25, 'z'),
    ],
    details: [
      // 正面左右對稱：中央門廊四根白柱、上方簷部，兩側各兩列窗
      ...[-43, -41, -39, -37].map((x, i) => box(`門廊柱 ${i + 1}`, 'trim', [x - 0.25, 0, 73], [x + 0.25, 5.6, 73.5])),
      box('門廊簷部', 'trim', [-44.2, 5.6, 72.6], [-35.8, 6.1, 75]),
      onFace('大門', 'roof', 75, -1, -40.6, -39.4, 0, 2.6),
      ...windowRow('主樓窗', 75, -1, [-50, -46.5, -33.5, -30], [[1, 2.6], [4, 5.6]], 1.2),
      onFace('簷口飾帶', 'trim', 75, -1, -52.2, -27.8, 6.1, 6.4),
      ...windowRow('西翼窗', 78, -1, [-58, -55], [[1, 2.4]], 1.2),
      box('西煙囪', 'wall', [-51.5, 0, 81], [-50.3, 11, 83]),
      box('東煙囪', 'wall', [-29.7, 0, 81], [-28.5, 11, 83]),
      onFace('車庫門', 'trim', 83, -1, -24, -18.5, 0, 2.4),
    ],
  },
  {
    label: '對街東鄰住宅', style: '中世紀現代（Mid-century Modern）',
    colors: { wall: '#f1f0ec', roof: '#cfcdc6', trim: '#2f2f2f', glass: '#7fa3b8' },
    masses: [
      mass('主量體', [12, 78, 37.5, 96], 3.8, 'flat', 0),
      mass('車庫', [37.5, 83, 48.5, 95], 3.4, 'flat', 0),
      mass('二樓懸挑', [16, 76, 32, 90], 3.2, 'flat', 0, 'x', 4.1),
      mass('後側', [16, 96, 32, 100], 3.5, 'flat', 0),
    ],
    details: [
      onFace('一樓落地玻璃', 'glass', 78, -1, 13, 30, 0.3, 3.4),
      onFace('二樓帶狀窗', 'glass', 76, -1, 17, 31, 4.6, 6.8),
      box('入口雨遮', 'trim', [30, 3, 75.5], [37, 3.2, 78]),
      box('雨遮細柱', 'trim', [36.7, 0, 75.6], [36.9, 3, 75.8]),
      box('石材景牆', 'roof', [30, 0, 74], [30.6, 3, 78]),
      onFace('大門', 'trim', 78, -1, 33, 34.4, 0, 2.6),
      onFace('車庫門', 'trim', 83, -1, 40, 45.5, 0, 2.4),
    ],
  },
];

cfg.scene = {
  house: { wallThickness: 0.15, slabThickness: SLAB, levels },
  site,
  buildings,
  groundMargin: 6,
  spawn: { x: -3.5, z: 10.5, facing: 0 },
  rules: cfg.scene.rules,
};
cfg.furniture = furniture;
if (isDryRun) {
  console.log('（--dry-run：沒有寫檔）');
} else {
  fs.copyFileSync(file, path.join(path.dirname(file), 'scene.config.backup.json'));
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`已寫入 ${file}（舊檔備份為 scene.config.backup.json）`);
}
console.log(levels.map((l) => `${l.label}: ${l.floors.length} 地板、${l.walls.length} 牆、${l.walls.reduce((n, w) => n + w.openings.length, 0)} 開口`).join('\n'));
console.log(`家具 ${Object.keys(furniture).length} 件`);
