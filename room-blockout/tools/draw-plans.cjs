// 讀 scene.config.json，畫出每層的平面圖（SVG）：房間編號、名稱、尺寸、門窗、樓梯、家具輪廓、格線與比例尺。只讀設定檔。
const fs = require('fs');
const path = require('path');

const USAGE = `用法：node tools/draw-plans.cjs [scene.config.json 路徑] [輸出資料夾]
  每層畫一張 floor-plan-<n>f.svg：空間編號、名稱、尺寸、門窗、樓梯、家具輪廓、格線、比例尺。
  沒給參數時讀 src/config/scene.config.json，輸出到 room-blockout/。
範例：npm run plans`;
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const configPath = args[0] ?? path.join(__dirname, '..', 'src', 'config', 'scene.config.json');
const outDir = args[1] ?? path.join(__dirname, '..');
if (!fs.existsSync(configPath) || !fs.existsSync(outDir)) {
  console.error(`找不到設定檔或輸出資料夾：${configPath}、${outDir}\n${USAGE}`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { house } = cfg.scene;

const PX = 20;          // 1 m 幾像素
const MARGIN = 60;
const SIDE = 330;       // 右側房間清單寬度
const FONT = "'Microsoft JhengHei','PingFang TC','Noto Sans TC',sans-serif";
const COLORS = {
  room: '#f4f1ea', garage: '#e1e1dc', deck: '#e7cfae', stair: '#d9c2a3', void: '#ffffff',
  wall: '#3a3a3a', door: '#d0473d', slider: '#2f78c4', window: '#29a3a3', furniture: '#9aa3ad', grid: '#e6e6e6',
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fmt = (v) => (Math.round(v * 10) / 10).toString();

const allPoints = house.levels.flatMap((l) => [...l.floors.flatMap((f) => f.points), ...l.walls.flatMap((w) => [[w.x1, w.z1], [w.x2, w.z2]])]);
const minX = Math.floor(Math.min(...allPoints.map((p) => p[0]))) - 1;
const maxX = Math.ceil(Math.max(...allPoints.map((p) => p[0]))) + 1;
const minZ = Math.floor(Math.min(...allPoints.map((p) => p[1]))) - 1;
const maxZ = Math.ceil(Math.max(...allPoints.map((p) => p[1]))) + 1;
const X = (x) => MARGIN + (x - minX) * PX;
const Y = (z) => MARGIN + 40 + (z - minZ) * PX;
const planW = (maxX - minX) * PX;
const planH = (maxZ - minZ) * PX;
const width = MARGIN * 2 + planW + SIDE;

function centroid(points) {
  let a = 0, cx = 0, cz = 0;
  points.forEach(([x1, z1], i) => {
    const [x2, z2] = points[(i + 1) % points.length];
    const k = x1 * z2 - x2 * z1;
    a += k; cx += (x1 + x2) * k; cz += (z1 + z2) * k;
  });
  return a === 0 ? points[0] : [cx / (3 * a), cz / (3 * a)];
}
const bbox = (points) => {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) };
};

house.levels.forEach((level, li) => {
  const out = [];
  const lines = [];
  const height = Math.max(MARGIN * 2 + 40 + planH + 60, 0);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="${FONT}">`);
  out.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  out.push(`<text x="${MARGIN}" y="${MARGIN - 18}" font-size="26" font-weight="700" fill="#222">${esc(level.label)}平面圖</text>`);
  out.push(`<text x="${MARGIN}" y="${MARGIN + 6}" font-size="13" fill="#666">地板高度 ${level.elevation} m、牆高 ${level.wallHeight} m　格線 1 m（粗線 5 m）　北在上</text>`);
  // 格線
  for (let x = minX; x <= maxX; x++) {
    out.push(`<line x1="${X(x)}" y1="${Y(minZ)}" x2="${X(x)}" y2="${Y(maxZ)}" stroke="${x % 5 === 0 ? '#d4d4d4' : COLORS.grid}" stroke-width="${x % 5 === 0 ? 1 : 0.5}"/>`);
    if (x % 5 === 0) out.push(`<text x="${X(x)}" y="${Y(minZ) - 6}" font-size="11" fill="#999" text-anchor="middle">${x}</text>`);
  }
  for (let z = minZ; z <= maxZ; z++) {
    out.push(`<line x1="${X(minX)}" y1="${Y(z)}" x2="${X(maxX)}" y2="${Y(z)}" stroke="${z % 5 === 0 ? '#d4d4d4' : COLORS.grid}" stroke-width="${z % 5 === 0 ? 1 : 0.5}"/>`);
    if (z % 5 === 0) out.push(`<text x="${X(minX) - 6}" y="${Y(z) + 4}" font-size="11" fill="#999" text-anchor="end">${z}</text>`);
  }
  // 地板（露台在下、室內在上）
  const ordered = [...level.floors].sort((a, b) => (a.kind === 'deck' ? -1 : 0) - (b.kind === 'deck' ? -1 : 0));
  const codes = new Map();
  level.floors.forEach((f, i) => codes.set(f, `${li + 1}-${String(i + 1).padStart(2, '0')}`));
  for (const f of ordered) {
    const fill = f.label.includes('樓梯') ? COLORS.stair : COLORS[f.kind] ?? COLORS.room;
    out.push(`<polygon points="${f.points.map(([x, z]) => `${X(x)},${Y(z)}`).join(' ')}" fill="${fill}" stroke="#bbb" stroke-width="0.8"/>`);
  }
  for (const v of level.voids) {
    out.push(`<polygon points="${v.map(([x, z]) => `${X(x)},${Y(z)}`).join(' ')}" fill="${COLORS.stair}" stroke="#bbb" stroke-width="0.8"/>`);
  }
  // 樓梯（一樓畫台階，二樓畫挖空區）
  for (const s of level.steps) {
    out.push(`<rect x="${X(s.minX)}" y="${Y(s.minZ)}" width="${(s.maxX - s.minX) * PX}" height="${(s.maxZ - s.minZ) * PX}" fill="none" stroke="#9b7b55" stroke-width="0.6"/>`);
  }
  for (const r of level.ramps) {
    const cx = X((r.minX + r.maxX) / 2);
    const [y0, y1] = r.uphill === 'south' ? [Y(r.minZ) + 6, Y(r.maxZ) - 6] : [Y(r.maxZ) - 6, Y(r.minZ) + 6];
    out.push(`<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y1}" stroke="#7a5a35" stroke-width="2" marker-end="url(#up)"/>`);
  }
  // 家具輪廓
  for (const item of Object.values(cfg.furniture).filter((it) => it.level === li)) {
    const w = item.width * PX;
    const d = item.depth * PX;
    out.push(`<g transform="translate(${X(item.x)},${Y(item.z)}) rotate(${-item.rotation})"><rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" fill="#ffffff" fill-opacity="0.6" stroke="${COLORS.furniture}" stroke-width="1"/><line x1="${-w / 2}" y1="${-d / 2}" x2="${w / 2}" y2="${-d / 2}" stroke="${COLORS.furniture}" stroke-width="2.2"/></g>`);
  }
  // 牆與門窗
  for (const wall of level.walls) {
    out.push(`<line x1="${X(wall.x1)}" y1="${Y(wall.z1)}" x2="${X(wall.x2)}" y2="${Y(wall.z2)}" stroke="${COLORS.wall}" stroke-width="${house.wallThickness * PX}" stroke-linecap="square"/>`);
  }
  for (const r of level.railings) {
    out.push(`<line x1="${X(r.x1)}" y1="${Y(r.z1)}" x2="${X(r.x2)}" y2="${Y(r.z2)}" stroke="#6b5a4a" stroke-width="2" stroke-dasharray="6 3"/>`);
  }
  const openingNames = [];
  for (const wall of level.walls) {
    const len = Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
    const ux = (wall.x2 - wall.x1) / len;
    const uz = (wall.z2 - wall.z1) / len;
    for (const o of wall.openings) {
      const a = o.offset - o.width / 2;
      const b = o.offset + o.width / 2;
      const [x1, z1, x2, z2] = [wall.x1 + ux * a, wall.z1 + uz * a, wall.x1 + ux * b, wall.z1 + uz * b];
      out.push(`<line x1="${X(x1)}" y1="${Y(z1)}" x2="${X(x2)}" y2="${Y(z2)}" stroke="#ffffff" stroke-width="${house.wallThickness * PX + 1}"/>`);
      out.push(`<line x1="${X(x1)}" y1="${Y(z1)}" x2="${X(x2)}" y2="${Y(z2)}" stroke="${COLORS[o.kind]}" stroke-width="${o.kind === 'window' ? 3 : 4}"/>`);
      if (!openingNames.some((n) => n.label === o.label)) openingNames.push({ label: o.label, kind: o.kind, width: o.width });
    }
  }
  // 房間編號與名稱
  for (const f of level.floors) {
    const [cx, cz] = centroid(f.points);
    const { w, d } = bbox(f.points);
    const code = codes.get(f);
    const isRoomy = w * PX >= 70 && d * PX >= 40;
    out.push(`<text x="${X(cx)}" y="${Y(cz) - (isRoomy ? 8 : -4)}" font-size="${isRoomy ? 13 : 11}" font-weight="700" fill="#1f3b70" text-anchor="middle">${code}</text>`);
    if (isRoomy) {
      out.push(`<text x="${X(cx)}" y="${Y(cz) + 8}" font-size="12" fill="#222" text-anchor="middle">${esc(f.label)}</text>`);
      out.push(`<text x="${X(cx)}" y="${Y(cz) + 22}" font-size="10.5" fill="#666" text-anchor="middle">${fmt(w)} × ${fmt(d)} m</text>`);
    }
    lines.push({ code, label: f.label, size: `${fmt(w)} × ${fmt(d)} m`, kind: f.kind });
  }
  // 比例尺與北
  const sbY = Y(maxZ) + 30;
  out.push(`<line x1="${X(minX)}" y1="${sbY}" x2="${X(minX) + 5 * PX}" y2="${sbY}" stroke="#333" stroke-width="3"/>`);
  out.push(`<text x="${X(minX) + 5 * PX + 8}" y="${sbY + 4}" font-size="12" fill="#333">5 m</text>`);
  out.push(`<text x="${X(maxX) - 10}" y="${Y(minZ) + 30}" font-size="16" font-weight="700" fill="#333" text-anchor="end">北 ↑</text>`);
  // 右側：房間清單、門窗圖例
  const sx = MARGIN + planW + 30;
  let sy = MARGIN + 40;
  out.push(`<text x="${sx}" y="${sy}" font-size="16" font-weight="700" fill="#222">房間與空間</text>`);
  sy += 22;
  for (const row of lines) {
    const tag = row.kind === 'deck' ? '（戶外）' : row.kind === 'garage' ? '（車庫）' : '';
    out.push(`<text x="${sx}" y="${sy}" font-size="12.5" fill="#1f3b70" font-weight="700">${row.code}</text>`);
    out.push(`<text x="${sx + 44}" y="${sy}" font-size="12.5" fill="#222">${esc(row.label)}${tag}</text>`);
    out.push(`<text x="${sx + SIDE - 40}" y="${sy}" font-size="11" fill="#777" text-anchor="end">${row.size}</text>`);
    sy += 18;
  }
  sy += 14;
  out.push(`<text x="${sx}" y="${sy}" font-size="16" font-weight="700" fill="#222">圖例</text>`);
  sy += 20;
  const legend = [
    ['#7a5a35', 2, '樓梯往上的方向（箭頭）'], [COLORS.door, 4, '門'], [COLORS.slider, 4, '拉門／通道'], [COLORS.window, 3, '窗'],
    ['#6b5a4a', 2, '欄杆（虛線）'], [COLORS.furniture, 1, '家具（粗邊是背面）'],
  ];
  for (const [color, w, text] of legend) {
    out.push(`<line x1="${sx}" y1="${sy - 4}" x2="${sx + 30}" y2="${sy - 4}" stroke="${color}" stroke-width="${w}" ${text.startsWith('欄杆') ? 'stroke-dasharray="6 3"' : ''}/>`);
    out.push(`<text x="${sx + 40}" y="${sy}" font-size="12.5" fill="#222">${text}</text>`);
    sy += 18;
  }
  for (const [color, text] of [[COLORS.room, '室內'], [COLORS.deck, '露台／陽台'], [COLORS.garage, '車庫'], [COLORS.stair, '樓梯塔']]) {
    out.push(`<rect x="${sx}" y="${sy - 12}" width="30" height="14" fill="${color}" stroke="#bbb"/>`);
    out.push(`<text x="${sx + 40}" y="${sy}" font-size="12.5" fill="#222">${text}</text>`);
    sy += 18;
  }
  out.splice(2, 0, `<defs><marker id="up" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#7a5a35"/></marker></defs>`);
  out.push('</svg>');
  const name = `floor-plan-${li + 1}f.svg`;
  fs.writeFileSync(path.join(outDir, name), out.join('\n'));
  console.log(`${name}：${lines.length} 個空間、${openingNames.length} 個門窗`);
});
