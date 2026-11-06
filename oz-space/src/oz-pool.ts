// OZ 世界的環形游泳池：沿著圓周繞一圈的水道（8 條圓形水道），內外兩側是石材池畔。
// 由內往外：內側池畔（薄石板，躺椅、陽傘、救生員椅、淋浴柱、植栽）→ 競速池（6 條水道）→ 池邊步道 → 空中縫隙
// （兩側欄杆；四條玻璃水道跨過縫隙，兩座池的水是連通的，可以直接游過去）→ 池邊步道 → 無邊際池：水面一路延伸到環的外緣，越過略低於水面的不鏽鋼溢流口，
// 沿外緣往下流成水幕（每一段的水量、流速、長度都不一樣），流到盡頭化成霧氣慢慢飄散。
// 兩座池的池底和池壁都是透明玻璃（水面以下帶一點水的藍綠色，從外面看像水族箱），轉角有不鏽鋼框。
// 水面：半透明的藍綠色水面（不用折射：折射要把整個場景多畫一次，效能差一倍，遊戲常見做法也是只用半透明＋反光），
// 波紋在著色器裡即時計算（幾道不同方向、波長的深水波相加，波速照深水波公式），法線跟著波紋算，所以反光會動。
import * as THREE from 'three';
import { annulus, bakeByMaterial, createRng, emptyBuild, getPropsEnvironment, orientedSolid, shinyMaterial, type PropsBuild, type RingSpec } from './oz-props';
import { collectColliders, markChildGroups, markCollider, skipCollider } from './oz-kit';

type Rng = () => number;
type Vec3 = [number, number, number];

const TAU = Math.PI * 2;
// 池子的剖面：內側池畔 deckInner、外側池畔 deckOuter（都是 deckThickness 厚的薄石板）；水面比池畔低 waterDrop，水深 waterDepth；
// 池底玻璃厚 floorSlab。
const POOL = { deckInner: 6.5, deckThickness: 0.3, waterDrop: 0.25, waterDepth: 2, floorSlab: 0.08, lanes: 6, laneMargin: 0.25, laneLine: 0.25, coping: 0.35, copingLip: 0.04, copingRise: 0.03 };
const GLASS_FRAME = { tube: 0.06, mullionSpacing: 8, mullion: 0.08 };
// 兩座池之間：競速池寬 raceWidth（6 道 × 2 m），兩邊各一條 rim 寬的池邊步道，中間 gap 的空中縫隙，
// channels 條 channelWidth 寬的玻璃水道跨過縫隙把兩座池連起來
const SPLIT = { raceWidth: 12.5, rim: 0.5, gap: 1.7, channels: 4, channelWidth: 3, railHeight: 1.05, railPosts: 2.5 };
// 水面的樣子：藍綠色、半透明（看得到水裡的人和池底），粗糙度很低、反射天空
const WATER_LOOK = { color: 0x3fa9c8, opacity: 0.55, roughness: 0.05, metalness: 0.1, envMapIntensity: 1.3 };
// 無邊際的外緣：溢流口比水面低 weirDrop、寬 lip；看不見的牆比池畔高 barrier（游泳游不出去）
const EDGE = { lip: 0.3, weirDrop: 0.03, barrier: 1 };
// 水幕：往下 height 公尺，底部往外張開 flare；霧氣在水幕底部，count 顆、往上飄 rise、帶寬 band
const FALL = { height: 30, flare: 2, segments: 256 };
const MIST = { count: 4000, rise: 4, band: 2.5, cycle: 12 };

// 水幕每一段的變化（x 是沿外緣的弧長，m；t 是時間）：在哪裡結束（佔總高的比例）、流多快、水量多少。
// 水幕著色器和霧氣都用同一組函式，霧氣才會出現在每一段水流的盡頭。
const FALL_GLSL = `
float ozHash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float ozNoise1(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(ozHash1(i), ozHash1(i + 1.0), f);
}
float ozFallEnd(float x, float t) {
  return mix(0.12, 1.0, ozNoise1(x * 0.09) * 0.5 + ozNoise1(x * 0.5 + t * 0.06) * 0.3 + ozNoise1(x * 2.3 + 17.0) * 0.2);
}
float ozFallSpeed(float x) { return mix(0.3, 2.6, ozNoise1(x * 0.23 + 13.0) * 0.7 + ozNoise1(x * 1.7 + 3.0) * 0.3); }
float ozFallAmount(float x, float t) { return smoothstep(0.28, 0.68, ozNoise1(x * 0.15 + 31.0) * 0.6 + ozNoise1(x * 0.7 - t * 0.03 + 5.0) * 0.4); }
`;
const WATER_SEGMENTS = { around: 720, across: 16 };
const WALL_SEGMENTS = 512;
const DECK_TILE = 1.2;              // 池畔石板貼圖一張涵蓋幾公尺
const ROPE = { radius: 0.06, length: 0.6, tubular: 1440 };
const WAVE_TIME_SCALE = '0.55';     // 波紋時間倍率（GLSL 字面值）：泳池比海面平靜
const SUN_DIRECTION = [3, 6, 2];    // 和 main.ts 的太陽方向一樣，水面高光才對得上
const LOUNGE_SPACING = 7;           // 內側池畔：每 7 m 一組（兩張躺椅加一把陽傘）
const LADDER_SPACING = 45;
const LIFEGUARD_CHAIRS = 4;
const SHOWERS = 6;
const PLANTER_SPACING = 14;

const waterTime = { value: 0 };
/** 每格呼叫：time 是累計秒數，水面波紋和池底光紋都跟著它動。 */
export function updateWater(time: number): void {
  waterTime.value = time;
}

// ---------- 著色器片段 ----------
// 一道深水波：回傳 (高度, ∂h/∂x, ∂h/∂z)。波速 c = √(g / k)。
const WAVE_GLSL = `
vec3 ozWave(vec2 p, float t, float angle, float wavelength, float amplitude) {
  vec2 d = vec2(cos(angle), sin(angle));
  float k = 6.2831853 / wavelength;
  float phase = k * (dot(d, p) - sqrt(9.81 / k) * t);
  return vec3(amplitude * sin(phase), amplitude * k * cos(phase) * d);
}
vec3 ozWaves(vec2 p, float t) {
  return ozWave(p, t, 0.3, 4.3, 0.014) + ozWave(p, t, 1.9, 2.7, 0.010) + ozWave(p, t, 2.8, 1.6, 0.007)
       + ozWave(p, t, 4.1, 0.9, 0.004) + ozWave(p, t, 5.2, 0.55, 0.0025) + ozWave(p, t, 0.95, 0.37, 0.0015)
       + ozWave(p, t, 3.6, 0.23, 0.0009);
}
`;

// 光紋：兩層會動的 Voronoi 網格邊緣（細胞中心隨時間繞圈），先輕微扭曲座標，亮線才不會是直的。
const CAUSTIC_GLSL = `
vec2 ozHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float ozVoronoiEdge(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.45 * sin(t + 6.2831853 * ozHash2(cell + g));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}
float ozCaustic(vec2 p, float t) {
  vec2 w = p + 0.15 * vec2(sin(p.y * 2.3 + t * 0.8), cos(p.x * 2.1 - t * 0.7));
  float e1 = 1.0 - smoothstep(0.0, 0.22, ozVoronoiEdge(w, t * 0.9));
  float e2 = 1.0 - smoothstep(0.0, 0.16, ozVoronoiEdge(w * 1.6 + 3.7, -t * 1.1));
  return e1 * e1 * e1 + 0.6 * e2 * e2 * e2;
}
`;

// ---------- 材質 ----------
// 半透明水面：透過它看得到水裡的東西（不扭曲），反射天空；法線由波紋即時計算，反光會跟著波紋晃。
function createWaterMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: WATER_LOOK.color, metalness: WATER_LOOK.metalness, roughness: WATER_LOOK.roughness, transparent: true, opacity: WATER_LOOK.opacity,
    depthWrite: false, envMap: getPropsEnvironment(), envMapIntensity: WATER_LOOK.envMapIntensity,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOzTime = waterTime;
    const header = `#include <common>\nuniform float uOzTime;\nvarying vec3 vOzWorld;\n${WAVE_GLSL}`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', header)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y += ozWaves((modelMatrix * vec4(transformed, 1.0)).xz, uOzTime * ${WAVE_TIME_SCALE}).x;`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvOzWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', header)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 ozSlope = ozWaves(vOzWorld.xz, uOzTime * ${WAVE_TIME_SCALE});
        normal = normalize((viewMatrix * vec4(normalize(vec3(-ozSlope.y, 1.0, -ozSlope.z)), 0.0)).xyz);`);
  };
  return material;
}

// 從水下往上看的水面：折射水面只朝上，從下面看不到，所以另外疊一層朝下的半透明水面。
// 跟著同樣的波紋起伏，波紋斜的地方暗、平的地方亮，看起來是水面在晃。標成透明物件，不會被畫進折射圖。
function createUndersideMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: 0x9fe3ee, transparent: true, opacity: 0.8, side: THREE.BackSide, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOzTime = waterTime;
    const header = `#include <common>\nuniform float uOzTime;\nvarying vec3 vOzWorld;\n${WAVE_GLSL}`;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', header)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y += ozWaves((modelMatrix * vec4(transformed, 1.0)).xz, uOzTime * ${WAVE_TIME_SCALE}).x;`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvOzWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', header)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 ozSlope = ozWaves(vOzWorld.xz, uOzTime * ${WAVE_TIME_SCALE});
        diffuseColor.rgb *= mix(0.7, 1.3, clamp(1.0 - 5.0 * length(ozSlope.yz), 0.0, 1.0));`);
  };
  return material;
}

// 無邊際池外緣往下流的水幕：圓筒內外兩面都畫，uv.y 頂端是 1。沿外緣每一段的水量、流速、結束高度都不一樣（FALL_GLSL），
// 再細分成一條條約 25 cm 的水柱，各自的速度與長度再亂一點；上面較濃、往下越來越淡，到盡頭消失（霧氣接在那裡）。
// 場景用對數深度緩衝，自訂著色器要加上對應的片段才不會閃。
function createFallMaterial(around: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uOzTime: waterTime, uAround: { value: around } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uOzTime;
      uniform float uAround;
      varying vec2 vUv;
      ${FALL_GLSL}
      float ozHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float ozNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(ozHash(i), ozHash(i + vec2(1.0, 0.0)), f.x), mix(ozHash(i + vec2(0.0, 1.0)), ozHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        #include <logdepthbuf_fragment>
        float fall = 1.0 - vUv.y;
        float x = vUv.x * uAround;
        float speed = ozFallSpeed(x);
        float amount = ozFallAmount(x, uOzTime);
        // 兩種寬度的水柱（約 25 cm 與 75 cm），各自的長度與速度再亂一次
        float columnRand = ozHash1(floor(x * 4.0) + 0.5);
        float bandRand = ozHash1(floor(x * 1.3) + 7.5);
        float end = ozFallEnd(x, uOzTime) * mix(0.4, 1.25, columnRand) * mix(0.7, 1.15, bandRand);
        float t = uOzTime * speed * mix(0.5, 1.8, columnRand);
        float strand = ozNoise(vec2(x * 4.0, fall * mix(5.0, 9.0, columnRand) - t));
        float streak = ozNoise(vec2(x * 1.3, fall * 5.0 - t * 0.8)) * 0.5 + strand * 0.5;
        float along = clamp(fall / max(end, 0.01), 0.0, 1.0);
        float sheet = mix(0.7, 0.18, along);
        float alpha = (sheet + streak * 0.5) * amount * smoothstep(0.0, 0.02, fall) * (1.0 - smoothstep(0.6, 1.0, along));
        // 帶藍綠色：天空很淡，全白的水幕在天空前面會看不見
        vec3 color = mix(vec3(0.42, 0.7, 0.84), vec3(0.9, 0.97, 1.0), streak);
        gl_FragColor = vec4(color, min(alpha, 0.95));
      }`,
  });
}

// 水幕盡頭化成的霧氣：每顆粒子在外緣的角度固定，高度是那一段水流的盡頭（和水幕用同一個函式），水量少的地方霧也淡；
// 每顆有自己的起始時間（aSeed），一個週期裡往上飄、往外散、變大，淡入再淡出。position.y 存的是相對盡頭的高低。
function createMistMaterial(top: number, radius: number): THREE.ShaderMaterial {
  // 透視投影下，世界大小 1 m 的點在距離 d 時約佔 (畫面高 / 2 / tan(半視角)) / d 個像素；視角 50°
  const scale = (Math.min(devicePixelRatio, 2) * innerHeight) / 2 / Math.tan(THREE.MathUtils.degToRad(25));
  return new THREE.ShaderMaterial({
    uniforms: { uOzTime: waterTime, uScale: { value: scale }, uTop: { value: top }, uRadius: { value: radius } },
    transparent: true, depthWrite: false,
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aSeed;
      uniform float uOzTime;
      uniform float uScale;
      uniform float uTop;
      uniform float uRadius;
      varying float vAlpha;
      ${FALL_GLSL}
      void main() {
        float life = fract(uOzTime / ${MIST.cycle.toFixed(1)} + aSeed);
        float angle = atan(position.x, position.z);
        float x = (angle < 0.0 ? angle + 6.2831853 : angle) * uRadius;
        vec3 p = position;
        p.y += uTop - ozFallEnd(x, uOzTime) * ${FALL.height.toFixed(1)} * 0.85 + life * ${MIST.rise.toFixed(1)};
        p.xz *= 1.0 + life * 0.02;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(256.0, (2.0 + life * 5.0) * uScale / -mv.z);
        vAlpha = sin(life * 3.14159) * 0.22 * ozFallAmount(x, uOzTime);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      varying float vAlpha;
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(0.93, 0.97, 1.0, smoothstep(0.5, 0.0, d) * vAlpha);
      }`,
  });
}

// 水面以下的池底、池壁：在原本的打光上加一層會動的光紋，越接近水面越亮，水面以上沒有。
function causticMaterial(waterY: number, parameters: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial(parameters);
  const waterLevel = { value: waterY };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOzTime = waterTime;
    shader.uniforms.uOzWaterY = waterLevel;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOzWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvOzWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uOzTime;\nuniform float uOzWaterY;\nvarying vec3 vOzWorld;\n${CAUSTIC_GLSL}`)
      .replace('#include <opaque_fragment>', `
        float ozDepth = uOzWaterY - vOzWorld.y;
        float ozBelow = smoothstep(0.0, 0.08, ozDepth) * mix(1.0, 0.65, clamp(ozDepth / 2.0, 0.0, 1.0));
        vec2 ozP = vOzWorld.xz * 0.9 + vec2(vOzWorld.y * 0.7, -vOzWorld.y * 0.5);
        outgoingLight += diffuseColor.rgb * ozCaustic(ozP, uOzTime * 0.8) * 0.45 * ozBelow;
        #include <opaque_fragment>`);
  };
  return material;
}

// ---------- 貼圖 ----------
function pixelTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`建立泳池貼圖失敗：瀏覽器不支援 2D canvas（${width} × ${height} px）`);
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// 一格格的方磚：每塊顏色略有不同，磚縫一條條。cells 是一張貼圖裡一邊有幾塊。
function drawTiles(ctx: CanvasRenderingContext2D, rng: Rng, width: number, height: number, columns: number, rows: number, colors: string[], grout: string, groutPx: number): void {
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, width, height);
  const w = width / columns;
  const h = height / rows;
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      ctx.fillStyle = colors[Math.floor(rng() * colors.length)] ?? grout;
      ctx.fillRect(i * w + groutPx / 2, j * h + groutPx / 2, w - groutPx, h - groutPx);
    }
  }
}

// 泳池磁磚：一張 1 m，25 cm 一塊
const drawPoolTile = (ctx: CanvasRenderingContext2D): void =>
  drawTiles(ctx, createRng(21), 256, 256, 4, 4, ['#e8f4f7', '#dff0f4', '#ebf6f8', '#d6ecf1'], '#a7c6ce', 3);
// 池畔石板：一張 1.2 m，60 cm 一塊，表面有細微斑點
function drawDeck(ctx: CanvasRenderingContext2D): void {
  const rng = createRng(23);
  drawTiles(ctx, rng, 256, 256, 2, 2, ['#e7dccb', '#e2d6c3', '#ebe1d1', '#ddd0bc'], '#b9ad9a', 4);
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(120, 100, 80, 0.08)' : 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(rng() * 256, rng() * 256, 1.5, 1.5);
  }
}
// 水道繩的浮球：一張 0.6 m 有 5 顆，每顆中間亮、兩端暗，球和球之間有縫，看起來是一顆顆的。
const drawRope = (colors: string[]) => (ctx: CanvasRenderingContext2D): void => {
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(0, 0, 160, 16);
  colors.forEach((color, i) => {
    const gradient = ctx.createLinearGradient(i * 32, 0, i * 32 + 32, 0);
    gradient.addColorStop(0, 'rgba(0,0,0,0.45)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = color;
    ctx.fillRect(i * 32 + 2, 0, 28, 16);
    ctx.fillStyle = gradient;
    ctx.fillRect(i * 32 + 2, 0, 28, 16);
  });
};
// 陽傘布：16 片，兩色相間
const drawCanopy = (a: string, b: string) => (ctx: CanvasRenderingContext2D): void => {
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 === 0 ? a : b;
    ctx.fillRect(i * 8, 0, 8, 8);
  }
};

function repeated(base: THREE.Texture, x: number, y: number): THREE.Texture {
  const texture = base.clone();
  texture.repeat.set(x, y);
  texture.needsUpdate = true;
  return texture;
}

function lambert(color: number, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

function createPoolMaterials() {
  return {
    water: createWaterMaterial(),
    waterUnderside: createUndersideMaterial(),
    tile: pixelTexture(256, 256, drawPoolTile),
    // 玻璃：裝水的部分帶藍綠色、水面以上幾乎透明；兩面都畫，不寫深度，後面的東西看得到
    waterGlass: new THREE.MeshStandardMaterial({ color: 0x5cc8e0, transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false, envMap: getPropsEnvironment() }),
    clearGlass: new THREE.MeshStandardMaterial({ color: 0xdff4f8, transparent: true, opacity: 0.18, roughness: 0.03, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false, envMap: getPropsEnvironment() }),
    steel: shinyMaterial(0xc9ced4, 0.85, 0.25),
    deck: new THREE.MeshLambertMaterial({ map: pixelTexture(256, 256, drawDeck) }),
    coping: lambert(0xf2efe8),
    concrete: lambert(0xb7bcc2),
    chrome: shinyMaterial(0xe8ecf0, 1, 0.15),
    frame: lambert(0xf4f4f4),
    cushions: [0x3fa7a3, 0x2f4b7c, 0xf4efe6, 0xe07a5f].map((color) => lambert(color)),
    towels: [0xff7ac3, 0x4aa8e8, 0xf59a3a, 0xffffff, 0x6cc56b].map((color) => lambert(color)),
    canopies: [['#ffffff', '#2fa3b5'], ['#ffffff', '#e07a5f'], ['#f2d04b', '#ffffff']].map(([a = '#fff', b = '#000']) =>
      new THREE.MeshLambertMaterial({ map: pixelTexture(128, 8, drawCanopy(a, b)), side: THREE.DoubleSide })),
    umbrellaBase: lambert(0x3d4247),
    lifeguard: lambert(0xffffff),
    lifeRing: lambert(0xe8452c),
    redCanopy: new THREE.MeshLambertMaterial({ map: pixelTexture(128, 8, drawCanopy('#e8452c', '#ffffff')), side: THREE.DoubleSide }),
    grate: lambert(0x55595e),
    planter: lambert(0xb8afa4),
    leaves: lambert(0x5fa85d, { flatShading: true }),
    ropes: [['#d93a2b', '#ffffff', '#d93a2b', '#ffffff', '#d93a2b'], ['#1f5fbf', '#1f5fbf', '#ffffff', '#1f5fbf', '#1f5fbf'], ['#f2c200', '#1f5fbf', '#f2c200', '#1f5fbf', '#f2c200']]
      .map((colors) => pixelTexture(160, 16, drawRope(colors))),
  };
}
type PoolMaterials = ReturnType<typeof createPoolMaterials>;
let poolMaterials: PoolMaterials | null = null;
// 貼圖要用到 document、水面要用到環境貼圖，第一次建泳池時才建，之後共用。
function getPoolMaterials(): PoolMaterials {
  poolMaterials ??= createPoolMaterials();
  return poolMaterials;
}

// ---------- 幾何小工具 ----------
function addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: Vec3, rotation: Vec3 = [0, 0, 0]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}
const box = (parent: THREE.Object3D, material: THREE.Material, size: Vec3, position: Vec3, rotation?: Vec3): THREE.Mesh =>
  addMesh(parent, new THREE.BoxGeometry(...size), material, position, rotation);
function rod(parent: THREE.Object3D, material: THREE.Material, from: Vec3, to: Vec3, radius: number, segments = 8): THREE.Mesh {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh);
  return mesh;
}
function childGroup(parent: THREE.Object3D, position: Vec3, yaw = 0): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  group.rotation.y = yaw;
  parent.add(group);
  return group;
}
// 在環上半徑 radius、角度 angle 的位置放一組東西：自身 z 朝外（徑向）、x 沿圓周。flip 時轉半圈，z 改朝圓心。
const placeOnRing = (parent: THREE.Object3D, radius: number, y: number, angle: number, flip = false): THREE.Group =>
  childGroup(parent, [radius * Math.sin(angle), y, radius * Math.cos(angle)], angle + (flip ? Math.PI : 0));

// 水平面的貼圖座標改成世界座標（公尺 / tileSize），磁磚、石板在整圈上才會一樣大、不會被拉長。
function planarUv(geometry: THREE.BufferGeometry, tileSize: number): void {
  const positions = geometry.getAttribute('position');
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = positions.getX(i) / tileSize;
    uv[i * 2 + 1] = positions.getZ(i) / tileSize;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}


// ---------- 池畔設施 ----------
// 不鏽鋼扶梯：兩根扶手從水裡往上、彎過池邊、插進池畔；水裡三階踏板。自身 z = 0 是池壁，-z 是水、+z 是池畔，y = 0 是池畔面。
function addLadder(g: THREE.Object3D, M: PoolMaterials): void {
  skipCollider(g);   // 扶梯靠在池邊，擋住的話游到池邊就上不了岸
  for (const x of [-0.28, 0.28]) {
    const curve = new THREE.CatmullRomCurve3([[x, -1.25, -0.16], [x, 0.55, -0.16], [x, 0.9, -0.02], [x, 0.92, 0.18], [x, 0.6, 0.4], [x, 0, 0.42]].map(([px = 0, py = 0, pz = 0]) => new THREE.Vector3(px, py, pz)));
    addMesh(g, new THREE.TubeGeometry(curve, 40, 0.022, 8), M.chrome, [0, 0, 0]);
    addMesh(g, new THREE.CylinderGeometry(0.045, 0.045, 0.012, 16), M.chrome, [x, 0.006, 0.42]);
  }
  for (const y of [-0.35, -0.65, -0.95]) box(g, M.chrome, [0.56, 0.03, 0.09], [0, y, -0.11]);
}

// 躺椅：白色框架、可調的椅背往 +z 立起來（背對泳池），坐墊顏色隨機，有些上面放了毛巾。
function addLounger(g: THREE.Object3D, M: PoolMaterials, rng: Rng): void {
  const cushion = M.cushions[Math.floor(rng() * M.cushions.length)] ?? M.frame;
  box(g, M.frame, [0.7, 0.06, 1.95], [0, 0.32, 0]);
  for (const x of [-0.3, 0.3]) {
    for (const z of [-0.85, 0.85]) box(g, M.frame, [0.05, 0.3, 0.05], [x, 0.15, z]);
  }
  box(g, cushion, [0.62, 0.07, 1.3], [0, 0.385, -0.3]);
  const tilt = 0.75;
  const backLength = 0.65;
  box(g, cushion, [0.62, 0.07, backLength], [0, 0.385 + (backLength / 2) * Math.sin(tilt), 0.35 + (backLength / 2) * Math.cos(tilt)], [-tilt, 0, 0]);
  for (const x of [-0.33, 0.33]) rod(g, M.frame, [x, 0.33, 0.35], [x, 0.33 + 0.6 * Math.sin(tilt), 0.35 + 0.6 * Math.cos(tilt)], 0.018, 6);
  if (rng() < 0.4) {
    const towel = M.towels[Math.floor(rng() * M.towels.length)] ?? M.frame;
    box(g, towel, [0.55, 0.012, 0.9], [0, 0.427, -0.35], [0, (rng() - 0.5) * 0.25, 0]);
  }
}

// 陽傘：配重底座、桿子、16 片條紋傘布。
function addUmbrella(g: THREE.Object3D, M: PoolMaterials, rng: Rng): void {
  const canopy = M.canopies[Math.floor(rng() * M.canopies.length)] ?? M.redCanopy;
  skipCollider(g);   // 傘面很大但在頭頂上，只擋傘柱和底座
  markCollider(g, [0.6, 2.5, 0.6], [0, 1.25, 0]);
  addMesh(g, new THREE.CylinderGeometry(0.28, 0.3, 0.08, 16), M.umbrellaBase, [0, 0.04, 0]);
  rod(g, M.chrome, [0, 0, 0], [0, 2.5, 0], 0.02);
  addMesh(g, new THREE.ConeGeometry(1.5, 0.45, 16, 1, true), canopy, [0, 2.32, 0]);
  addMesh(g, new THREE.SphereGeometry(0.04, 10, 6), M.chrome, [0, 2.56, 0]);
}

// 救生員高腳椅：面向泳池（-z），椅背後面掛救生圈，上面有一把紅白小傘，後方是梯子。
function addLifeguardChair(g: THREE.Object3D, M: PoolMaterials): void {
  const height = 1.9;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) rod(g, M.lifeguard, [sx * 0.45, 0, sz * 0.45], [sx * 0.3, height, sz * 0.3], 0.03);
    box(g, M.lifeguard, [0.05, 0.03, 0.5], [sx * 0.35, height + 0.25, 0]);
  }
  box(g, M.lifeguard, [0.7, 0.05, 0.6], [0, height, 0]);
  box(g, M.lifeguard, [0.7, 0.6, 0.05], [0, height + 0.3, 0.3]);
  for (let k = 1; k <= 5; k++) box(g, M.lifeguard, [0.6, 0.04, 0.08], [0, (k * height) / 6, 0.45 - (k / 6) * 0.15]);
  addMesh(g, new THREE.TorusGeometry(0.28, 0.06, 8, 24), M.lifeRing, [0, height + 0.3, 0.36]);
  rod(g, M.chrome, [0, height + 0.6, 0.32], [0, height + 2, 0.32], 0.02);
  addMesh(g, new THREE.ConeGeometry(0.9, 0.3, 16, 1, true), M.redCanopy, [0, height + 1.9, 0.32]);
}

// 淋浴柱：不鏽鋼立柱、往前伸的蓮蓬頭、地上的排水格柵。
function addShower(g: THREE.Object3D, M: PoolMaterials): void {
  rod(g, M.chrome, [0, 0, 0], [0, 2.3, 0], 0.04);
  rod(g, M.chrome, [0, 2.25, 0], [0, 2.3, -0.35], 0.02);
  addMesh(g, new THREE.CylinderGeometry(0.1, 0.06, 0.04, 16), M.chrome, [0, 2.27, -0.38]);
  box(g, M.grate, [0.7, 0.01, 0.7], [0, 0.005, -0.3]);
}

function addPlanter(g: THREE.Object3D, M: PoolMaterials, rng: Rng): void {
  const size = 0.6 + rng() * 0.4;
  box(g, M.planter, [size * 1.6, 0.6, size * 1.6], [0, 0.3, 0]);
  addMesh(g, new THREE.IcosahedronGeometry(size, 1), M.leaves, [0, 0.6 + size * 0.7, 0]);
}

// 池畔的東西都沿著圓周每隔一段放一個：回傳每個的角度（從 offset 開始，間隔換成角度）。
function anglesAround(radius: number, spacing: number, offset: number): number[] {
  const count = Math.max(1, Math.floor((TAU * radius) / spacing));
  return Array.from({ length: count }, (_, i) => offset + (i / count) * TAU);
}

// 池畔設施都在內側池畔（外側是無邊際的水）：由池邊往內是扶梯、救生員椅、一排躺椅（椅背朝內、陽傘插在椅背那端）、
// 淋浴柱、植栽。躺椅避開救生員椅與淋浴柱前後各一段。
function addDeckProps(props: THREE.Object3D, M: PoolMaterials, rng: Rng, poolIn: number, deckY: number): void {
  const loungeRadius = poolIn - 2;
  const showerRadius = poolIn - 4.6;
  const guardAngles = anglesAround(poolIn, (TAU * poolIn) / LIFEGUARD_CHAIRS, TAU / 8);
  const showerAngles = anglesAround(poolIn, (TAU * poolIn) / SHOWERS, 0.3);
  const near = (angle: number, others: number[], meters: number): boolean =>
    others.some((other) => Math.abs(THREE.MathUtils.euclideanModulo(angle - other + Math.PI, TAU) - Math.PI) * loungeRadius < meters);
  for (const angle of anglesAround(loungeRadius, LOUNGE_SPACING, 0)) {
    if (near(angle, guardAngles, 3)) continue;
    for (const offset of [-0.6, 0.6]) addLounger(placeOnRing(props, loungeRadius, deckY, angle + offset / loungeRadius, true), M, rng);
    addUmbrella(placeOnRing(props, loungeRadius - 0.6, deckY, angle), M, rng);
  }
  for (const angle of guardAngles) addLifeguardChair(placeOnRing(props, poolIn - 1.3, deckY, angle, true), M);
  for (const angle of anglesAround(poolIn, LADDER_SPACING, 0.12)) addLadder(placeOnRing(props, poolIn, deckY, angle, true), M);
  for (const angle of showerAngles) addShower(placeOnRing(props, showerRadius, deckY, angle, true), M);
  const planterRadius = poolIn - 5.4;
  for (const angle of anglesAround(planterRadius, PLANTER_SPACING, 0)) {
    if (!near(angle, showerAngles, 2)) addPlanter(placeOnRing(props, planterRadius, deckY, angle), M, rng);
  }
}

/**
 * 環形游泳池：內外兩側是石材池畔，中間一圈水道（8 條圓形水道、水道繩、池底水道線）。
 * 碰撞：兩側池畔與池底站得住；池壁從池底到池畔水平方向擋（掉進池子要飛出來）。
 */
// ---------- 有開口的環形零件 ----------
// 一段角度的環形平板（LatheGeometry 的 phi 和這裡的角度同方向：x = r sin θ、z = r cos θ）。
const arcRing = (inner: number, outer: number, minY: number, maxY: number, start: number, length: number, material: THREE.Material): THREE.Mesh =>
  new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(inner, minY), new THREE.Vector2(outer, minY), new THREE.Vector2(outer, maxY), new THREE.Vector2(inner, maxY), new THREE.Vector2(inner, minY)],
    Math.max(4, Math.round((length / TAU) * WALL_SEGMENTS)), start, length), material);
// 一段角度的圓筒池壁（CylinderGeometry 的 theta 也是 x = r sin θ、z = r cos θ）。
function wallArc(radius: number, bottom: number, height: number, start: number, length: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, Math.max(4, Math.round((length / TAU) * WALL_SEGMENTS)), 1, true, start, length), material);
  mesh.position.y = bottom + height / 2;
  return mesh;
}
// 一圈上除了 openings（中心角度）前後各 half 弧度以外的各段：[起點, 長度]。沒有開口時就是整圈。
function arcsBetween(openings: number[], half: number): [number, number][] {
  if (openings.length === 0) return [[0, TAU]];
  return openings.map((opening, i) => {
    const next = (openings[(i + 1) % openings.length] ?? opening) + (i + 1 < openings.length ? 0 : TAU);
    return [opening + half, next - opening - 2 * half];
  });
}

interface Basin { from: number; to: number; waterTo: number; waterY: number; floorY: number; glassBottom: number; outerWeir?: number; fromOpenings?: number[]; toOpenings?: number[] }

// 一面玻璃池壁（水面以下帶水色、上面透明）、上下框與直框、擋人的圓形牆；openings 的角度留開口（接水道）。
function addPoolWall(build: PropsBuild, props: THREE.Group, M: PoolMaterials, b: Basin, radius: number, solid: 'inside' | 'outside', top: number, deckTop: number, openings: number[], isWeir: boolean): void {
  const half = SPLIT.channelWidth / 2 / radius;
  const glassTop = isWeir ? top : b.waterY;
  for (const [start, length] of arcsBetween(openings, half)) {
    build.decor.add(wallArc(radius, b.glassBottom, glassTop - b.glassBottom, start, length, M.waterGlass));
    if (!isWeir) build.decor.add(wallArc(radius, b.waterY, deckTop - b.waterY, start, length, M.clearGlass));
    for (const y of [b.glassBottom, top]) {
      addMesh(props, new THREE.TorusGeometry(radius, GLASS_FRAME.tube, 6, Math.max(8, Math.round((length / TAU) * WALL_SEGMENTS)), length).rotateX(Math.PI / 2), M.steel, [0, y, 0], [0, start + length - Math.PI / 2, 0]);
    }
    const mullions = Math.max(1, Math.round((length * radius) / GLASS_FRAME.mullionSpacing));
    for (let k = 0; k <= mullions; k++) {
      if (openings.length === 0 && k === mullions) continue;
      const angle = start + (length * k) / mullions;
      box(props, M.steel, [GLASS_FRAME.mullion, top - b.glassBottom, GLASS_FRAME.mullion], [radius * Math.sin(angle), (b.glassBottom + top) / 2, radius * Math.cos(angle)], [0, angle, 0]);
    }
    const maxY = deckTop + (isWeir ? EDGE.barrier : 0);
    build.walls.push(openings.length === 0 ? { radius, minY: b.floorY, maxY, solid } : { radius, minY: b.floorY, maxY, solid, arc: { start, length } });
  }
}

// 一座池：玻璃池底（站得住）、兩側玻璃池壁、水面與從水下看的那一面、游泳的水域。
// outerWeir 時外側池壁只到溢流口（無邊際），外緣的牆比池畔高 EDGE.barrier、看不見。框與直框放進 props 一起合併。
function addBasin(build: PropsBuild, props: THREE.Group, M: PoolMaterials, b: Basin, deckTop: number, deckBottom: number): void {
  build.decor.add(annulus(b.from, b.to, b.glassBottom, b.floorY, M.waterGlass));
  build.discs.push({ inner: b.from, outer: b.to, minY: b.glassBottom, maxY: b.floorY });
  build.waters.push({ inner: b.from, outer: b.to, surfaceY: b.waterY, floorY: b.floorY });
  addPoolWall(build, props, M, b, b.from, 'inside', deckBottom, deckTop, b.fromOpenings ?? [], false);
  const isWeir = b.outerWeir !== undefined;
  addPoolWall(build, props, M, b, b.to, 'outside', isWeir ? (b.outerWeir ?? b.waterY) : deckBottom, deckTop, b.toOpenings ?? [], isWeir);
  addWaterSurface(build, M, b.from, b.waterTo, b.waterY, 0, TAU);
}

// 水面與從水下看的那一面。RingGeometry 轉成水平後角度 θ 對應這裡的 θ + π/2，所以起點減 π/2。
function addWaterSurface(build: PropsBuild, M: PoolMaterials, inner: number, outer: number, waterY: number, start: number, length: number): void {
  const segments = Math.max(8, Math.round((length / TAU) * WATER_SEGMENTS.around));
  const geometry = new THREE.RingGeometry(inner, outer, segments, WATER_SEGMENTS.across / 2, start - Math.PI / 2, length).rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geometry, M.water);
  water.position.y = waterY;
  const underside = new THREE.Mesh(geometry, M.waterUnderside);
  underside.position.y = waterY;
  build.decor.add(water, underside);
}

// 連接兩座池的玻璃水道：池底、兩側玻璃牆（水面以下帶水色、上面透明）、水面、只佔那段角度的水域；側牆擋人。
function addChannel(build: PropsBuild, props: THREE.Group, M: PoolMaterials, from: number, to: number, angle: number, b: Basin, deckTop: number): void {
  const middle = (from + to) / 2;
  const half = SPLIT.channelWidth / 2 / middle;
  const start = angle - half;
  build.decor.add(arcRing(from, to, b.glassBottom, b.floorY, start, half * 2, M.waterGlass));
  build.discs.push({ inner: from, outer: to, minY: b.glassBottom, maxY: b.floorY, arc: { start, length: half * 2 } });
  build.waters.push({ inner: from, outer: to, surfaceY: b.waterY, floorY: b.floorY, arc: { start, length: half * 2 } });
  addWaterSurface(build, M, from - 0.05, to + 0.05, b.waterY, start, half * 2);
  const length = to - from;
  for (const side of [-1, 1]) {
    const edge = angle + side * half;
    const cx = middle * Math.sin(edge);
    const cz = middle * Math.cos(edge);
    for (const [bottom, height, material] of [[b.glassBottom, b.waterY - b.glassBottom, M.waterGlass], [b.waterY, deckTop - b.waterY, M.clearGlass]] as const) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(length, height), material);
      pane.position.set(cx, bottom + height / 2, cz);
      pane.rotation.y = edge - Math.PI / 2;
      build.decor.add(pane);
    }
    for (const r of [from, to]) box(props, M.steel, [GLASS_FRAME.mullion, deckTop - b.glassBottom, GLASS_FRAME.mullion], [r * Math.sin(edge), (b.glassBottom + deckTop) / 2, r * Math.cos(edge)], [0, edge, 0]);
    box(props, M.steel, [GLASS_FRAME.mullion, GLASS_FRAME.mullion, length], [cx, b.glassBottom, cz], [0, edge, 0]);
    build.solids.push(orientedSolid(cx, cz, edge, 0.12, length + 0.4, b.floorY, deckTop));
  }
}

// 縫隙邊的欄杆：柱子、上下兩道扶手，水道口留開口；碰撞是一段段只擋那幾段角度的圓形牆（走路時只擋人所在的那一側）。
function addGapRail(build: PropsBuild, props: THREE.Group, M: PoolMaterials, radius: number, y: number, channels: number[], solid: 'inside' | 'outside'): void {
  for (const [start, length] of arcsBetween(channels, (SPLIT.channelWidth / 2 + 0.1) / radius)) {
    const posts = Math.max(1, Math.round((length * radius) / SPLIT.railPosts));
    for (let k = 0; k <= posts; k++) {
      const angle = start + (length * k) / posts;
      box(props, M.chrome, [0.05, SPLIT.railHeight, 0.05], [radius * Math.sin(angle), y + SPLIT.railHeight / 2, radius * Math.cos(angle)], [0, angle, 0]);
    }
    for (const height of [SPLIT.railHeight, SPLIT.railHeight / 2]) {
      addMesh(props, new THREE.TorusGeometry(radius, 0.025, 6, Math.max(8, Math.round(length * radius)), length).rotateX(Math.PI / 2), M.chrome, [0, y + height, 0], [0, start + length - Math.PI / 2, 0]);
    }
    build.walls.push({ radius, minY: y, maxY: y + SPLIT.railHeight, solid, arc: { start, length } });
  }
}

/**
 * 環形泳池：內側池畔、競速池、空中縫隙（兩側池邊步道與欄杆、四條連通兩座池的玻璃水道）、無邊際池。
 * 碰撞：池畔、池邊步道與池底站得住；池壁、水道側牆、縫隙欄杆擋人，無邊際池外緣是一道看不見的牆。
 */
export function buildPoolRing(spec: RingSpec): PropsBuild {
  const build = emptyBuild();
  const rng = createRng(spec.seed);
  const M = getPoolMaterials();
  const { inner, outer, maxY } = spec;
  const waterY = maxY - POOL.waterDrop;
  const floorY = waterY - POOL.waterDepth;
  const deckBottom = maxY - POOL.deckThickness;
  const glassBottom = floorY - POOL.floorSlab;
  const weirY = waterY - EDGE.weirDrop;
  const raceIn = inner + POOL.deckInner;
  const raceOut = raceIn + SPLIT.raceWidth;
  const gapIn = raceOut + SPLIT.rim;
  const gapOut = gapIn + SPLIT.gap;
  const infinityIn = gapOut + SPLIT.rim;
  const poolOut = outer - EDGE.lip;
  const channels = Array.from({ length: SPLIT.channels }, (_, k) => Math.PI / 4 + (k / SPLIT.channels) * TAU);
  const props = new THREE.Group();

  // 內側池畔（整圈）與兩條池邊步道（水道口斷開）
  const deck = annulus(inner, raceIn, deckBottom, maxY, M.deck);
  planarUv(deck.geometry, DECK_TILE);
  build.solid.add(deck, annulus(raceIn - POOL.coping, raceIn + POOL.copingLip, maxY - 0.1, maxY + POOL.copingRise, M.coping));
  build.discs.push({ inner, outer: raceIn, minY: deckBottom, maxY });
  for (const [from, to] of [[raceOut, gapIn], [gapOut, infinityIn]] as const) {
    for (const [start, length] of arcsBetween(channels, SPLIT.channelWidth / 2 / ((from + to) / 2))) {
      const rim = arcRing(from, to, deckBottom, maxY, start, length, M.deck);
      planarUv(rim.geometry, DECK_TILE);
      build.solid.add(rim);
      build.discs.push({ inner: from, outer: to, minY: deckBottom, maxY, arc: { start, length } });
    }
  }
  addMesh(props, new THREE.TorusGeometry(inner, 0.05, 6, WALL_SEGMENTS).rotateX(Math.PI / 2), M.steel, [0, maxY - 0.1, 0]);

  const race: Basin = { from: raceIn, to: raceOut, waterTo: raceOut, waterY, floorY, glassBottom, toOpenings: channels };
  addBasin(build, props, M, race, maxY, deckBottom);
  addBasin(build, props, M, { from: infinityIn, to: poolOut, waterTo: outer, waterY, floorY, glassBottom, outerWeir: weirY, fromOpenings: channels }, maxY, deckBottom);
  // 溢流口：外緣一圈略低於水面的不鏽鋼唇口，水面蓋過它往外流
  build.decor.add(annulus(poolOut, outer, weirY - 0.12, weirY, M.steel));

  // 縫隙：兩側欄杆（水道口留開口）、四條玻璃水道
  addGapRail(build, props, M, gapIn - 0.1, maxY, channels, 'outside');
  addGapRail(build, props, M, gapOut + 0.1, maxY, channels, 'inside');
  for (const angle of channels) addChannel(build, props, M, raceOut, infinityIn, angle, race, maxY);

  // 競速池的水道：池底的深藍水道線，水面上的浮球水道繩
  const laneWidth = (raceOut - raceIn - 2 * POOL.laneMargin) / POOL.lanes;
  const laneLine = causticMaterial(waterY, { color: 0x1d3f7a });
  for (let lane = 0; lane < POOL.lanes; lane++) {
    const center = raceIn + POOL.laneMargin + (lane + 0.5) * laneWidth;
    build.decor.add(annulus(center - POOL.laneLine / 2, center + POOL.laneLine / 2, floorY, floorY + 0.012, laneLine));
  }
  for (let k = 0; k <= POOL.lanes; k++) {
    const radius = raceIn + POOL.laneMargin + k * laneWidth;
    const base = M.ropes[k === 0 || k === POOL.lanes ? 0 : k % 2 === 0 ? 1 : 2] ?? M.tile;
    const rope = new THREE.Mesh(
      new THREE.TorusGeometry(radius, ROPE.radius, 6, ROPE.tubular).rotateX(Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: repeated(base, (TAU * radius) / ROPE.length, 1) }),
    );
    rope.position.y = waterY + 0.015;
    build.decor.add(rope);
  }

  // 水幕：從溢流口往下流，底部稍微往外張開；每一段的盡頭一團霧氣
  const curtain = new THREE.Mesh(
    new THREE.CylinderGeometry(outer + 0.02, outer + FALL.flare, FALL.height, FALL.segments, 8, true),
    createFallMaterial(TAU * outer),
  );
  curtain.position.y = weirY - FALL.height / 2;
  build.decor.add(curtain);
  const mistPositions = new Float32Array(MIST.count * 3);
  const mistSeeds = new Float32Array(MIST.count);
  for (let i = 0; i < MIST.count; i++) {
    const angle = rng() * TAU;
    const radius = outer + FALL.flare * 0.6 + (rng() - 0.3) * MIST.band;
    mistPositions.set([radius * Math.sin(angle), (rng() - 0.5) * MIST.band, radius * Math.cos(angle)], i * 3);
    mistSeeds[i] = rng();
  }
  const mistGeometry = new THREE.BufferGeometry();
  mistGeometry.setAttribute('position', new THREE.BufferAttribute(mistPositions, 3));
  mistGeometry.setAttribute('aSeed', new THREE.BufferAttribute(mistSeeds, 1));
  const mist = new THREE.Points(mistGeometry, createMistMaterial(weirY, outer));
  mist.frustumCulled = false;
  build.decor.add(mist);

  addDeckProps(props, M, rng, raceIn, maxY);
  // 池畔設施（躺椅、救生員椅、淋浴柱、植栽、陽傘柱）各用自己的外框擋人；框、直框、欄杆一起合併
  markChildGroups(props);
  build.solids.push(...collectColliders(props));
  build.decor.add(bakeByMaterial(props));
  props.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
  return build;
}

/**
 * 給金屬、水面反射用的天空環境貼圖：上面藍、地平線淡、下面灰，太陽方向一個很亮的點（水面高光就是它）。
 * 只設定在需要反射的材質上，不改 scene.environment，角色模型的打光才不會跟著變。
 */
export function createSkyEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const sky = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vDirection;\nvoid main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDirection;
      void main() {
        vec3 d = normalize(vDirection);
        vec3 horizon = vec3(0.86, 0.89, 0.92);
        vec3 zenith = vec3(0.32, 0.55, 0.82);
        vec3 ground = vec3(0.62, 0.64, 0.66);
        vec3 color = d.y > 0.0 ? mix(horizon, zenith, pow(d.y, 0.55)) : mix(horizon, ground, pow(-d.y, 0.4));
        float sun = pow(max(dot(d, normalize(vec3(${SUN_DIRECTION.join('.0, ')}.0))), 0.0), 900.0);
        gl_FragColor = vec4(color + vec3(1.0, 0.96, 0.88) * sun * 30.0, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
  sky.add(dome);
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(sky, 0, 0.1, 10);
  generator.dispose();
  dome.geometry.dispose();
  material.dispose();
  return target.texture;
}
