// 檢查每層的牆兩側有沒有地板（結構樓板會往外擴 0.25 m），找出懸空或沒接好的牆段。只讀。
const fs = require('fs');
const path = require('path');

const USAGE = `用法：node tools/check-floors.cjs [scene.config.json 路徑]
  沿每面牆取樣，列出兩側都沒有地板的牆段（懸空或沒接好的地方）。只讀，不改檔。
  二樓樓梯塔外圍的牆旁邊本來就沒有樓板（牆會往下接到一樓牆頂），出現在清單上是正常的。
範例：npm run check-floors`;
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const configPath = process.argv[2] ?? path.join(__dirname, '..', 'src', 'config', 'scene.config.json');
if (!fs.existsSync(configPath)) {
  console.error(`找不到設定檔：${configPath}\n${USAGE}`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const inPoly = (x, z, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]; const [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
const FILL = 0.25;
for (const level of cfg.scene.house.levels) {
  const covered = (x, z) => level.floors.some((f) => [[0, 0], [FILL, 0], [-FILL, 0], [0, FILL], [0, -FILL]].some(([dx, dz]) => inPoly(x + dx, z + dz, f.points)))
    && !level.voids.some((v) => inPoly(x, z, v));
  const bad = [];
  for (const w of level.walls) {
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
    const ux = (w.x2 - w.x1) / len, uz = (w.z2 - w.z1) / len;
    let misses = 0, n = 0;
    for (let t = 0.25; t < len - 0.2; t += 0.5) {
      n++;
      const x = w.x1 + ux * t, z = w.z1 + uz * t;
      const left = covered(x - uz * 0.35, z + ux * 0.35);
      const right = covered(x + uz * 0.35, z - ux * 0.35);
      if (!left && !right) misses++;
    }
    if (misses > 0) bad.push(`${w.label}（${misses}/${n} 個取樣兩側都沒地板）`);
  }
  console.log(`${level.label}：${bad.length} 面牆有問題`);
  for (const b of bad) console.log('  ' + b);
}
