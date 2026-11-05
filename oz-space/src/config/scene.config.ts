// scene.config.json 的型別。單位：公尺、秒、角度（度）。
// 座標：原點在空間中心的地面；+X 東、-Z 北、+Y 上。

export type ClipRole = 'idle' | 'walk' | 'run' | 'sprint' | 'jumpStart' | 'jumpLoop' | 'jumpLand' | 'blocked' | 'fly' | 'sitEnter' | 'sitLoop' | 'sitExit' | 'swim' | 'swimIdle';
export const CLIP_ROLES: ClipRole[] = ['idle', 'walk', 'run', 'sprint', 'jumpStart', 'jumpLoop', 'jumpLand', 'blocked', 'fly', 'sitEnter', 'sitLoop', 'sitExit', 'swim', 'swimIdle'];

/** 中央的倒圓錐（方塊稿）：圓心在原點，上面是半徑 topRadius 的平台、頂面高 topY，往下 height 收成尖點，懸在空中。 */
export interface CenterConfig { topRadius: number; topY: number; height: number }

/**
 * 圍著中央倒圓錐、懸在空中的環（像星環）：由上往下一層一層，每層寬 width、厚 thickness。
 * 每層內緣和圓錐側面保持同樣的水平距離 clearance；圓錐越往下越細，所以環越往下直徑越小。顏色依序輪替。
 */
export interface RingsConfig {
  clearance: number; width: number; thickness: number;
  /** 由上往下的每一層：style 是樣式，gap 是這層頂面和上一層頂面（第一層是平台）的高度差（m）。 */
  layers: RingLayer[];
}

export interface RingLayer { style: RingStyle; gap: number }

/**
 * 環的樣式：plain 平板、houses 蓋滿房屋、floatingHouses 沒有環面只有歪斜漂浮的房屋、broken 2/3 碎成由大到小的片段、
 * floatingBooks 沒有環面只有飄著的書（開、半開、闔上）、shards 全是碎塊、bookshelf 空中圖書館（一圈圈書櫃中間有走道）、
 * triple 同高三層、restaurant 分區的環狀美食街、courts 各種球場（oz-sports.ts）、track 環形 PU 跑道（oz-track.ts）、pool 環形游泳池（oz-pool.ts）。
 * floatingHouses、floatingBooks、shards 站不上去。
 */
export type RingStyle = 'plain' | 'courts' | 'track' | 'pool' | 'houses' | 'floatingHouses' | 'broken' | 'floatingBooks' | 'shards' | 'bookshelf' | 'triple' | 'restaurant';
export const RING_STYLES: RingStyle[] = ['plain', 'courts', 'track', 'pool', 'houses', 'floatingHouses', 'broken', 'floatingBooks', 'shards', 'bookshelf', 'triple', 'restaurant'];

/**
 * 環周圍的漂浮物數量。clusters 是聚集處的數量：大部分漂浮物聚在這幾處，少數零散分布。
 * bobScale 是所有漂浮物上下飄動幅度的倍率（1 約 0.3–1.5 m，0 不動）。
 */
export interface FloatersConfig { islands: number; platforms: number; hexPads: number; debris: number; clusters: number; bobScale: number }

export interface SceneSection {
  /** 空白地面的邊長（m），以原點為中心；邊緣有隱形圍欄。 */
  groundSize: number;
  /** 第一次進入第一人稱時站的位置；facing 是面向（度，0 朝北、90 朝西，逆時針）。 */
  spawn: { x: number; z: number; facing: number };
  center: CenterConfig;
  rings: RingsConfig;
  floaters: FloatersConfig;
}

export interface CharacterConfig {
  /** 模型縮放；1 是 ual1-standard.glb 原本的 1.83 m。第一人稱的眼睛高度跟著身高換算。 */
  scale: number;
  /** 碰撞半徑：身體當成邊長 2 × radius 的方塊。 */
  radius: number;
  /** 比腳高這麼多以內的表面直接走上去（m），更高要跳。 */
  stepHeight: number;
  /** 走路／跑步的移動速度（m/s）；預設跑步，按 Shift 切換成走路。 */
  walkSpeed: number;
  runSpeed: number;
  /** A／D 轉身速度（度/秒）。 */
  turnSpeed: number;
  /** 起跳到最高點時腳離地多高（m）。 */
  jumpHeight: number;
  /** 重力加速度（m/s²）。 */
  gravity: number;
  /** 動作之間的過渡秒數。 */
  fadeSeconds: number;
  /** 落地後至少蹲這麼久才接回走路（秒）。 */
  landLockSeconds: number;
  /**
   * 各動作用哪段動畫（glb 裡的片段名稱）。blocked 是按著方向鍵卻被牆擋住時播的（例如推牆）；fly 是飛行時的底層姿勢（腳尖下垂另外疊上去）；
   * sprint 是加速時超過跑步速度用的；sitEnter／sitLoop／sitExit 是坐下、坐著、站起來；swim 是往前游（抬頭蛙式）、swimIdle 是停在水中踩水。
   */
  clips: Record<ClipRole, string>;
  /**
   * 走路、跑步、衝刺動畫原本的移動速度（m/s），也是混合空間的三個節點：速度介於兩個節點之間時兩段按比例混合，
   * 一個步伐週期走的距離也跟著插值，腳才不會滑；超過 sprint 就加快步伐週期跟上。
   */
  clipSpeeds: { walk: number; run: number; sprint: number };
  /** 游泳速度（m/s）：水深超過一定深度就自動游泳，不受走路／跑步切換與加速影響。 */
  swimSpeed: number;
  /** 按 Z 切換的加速：地面跑步速度乘 run、飛行速度（水平與升降）乘 fly；走路、游泳不加速。 */
  boost: { run: number; fly: number };
  /** 平移時身體轉向移動方向的平滑時間（秒）。沒有平移動畫，用轉身代替。 */
  turnToMoveSeconds: number;
  /** 身體轉向移動方向的上限（度）；90 是純平移時完全側身。 */
  maxMoveTurn: number;
  /** 其中由下半身扭轉負責的上限（度）：骨盆和腿轉向移動方向，上半身仍朝前；超過的部分轉整個身體。 */
  legTurnLimit: number;
  /** 顯示骨架（除錯用）。 */
  showSkeleton: boolean;
}

export interface CameraConfig {
  /** 第三人稱預設視角：往前走、滑鼠沒抓著畫面時平滑回到這裡。distance 離頭多遠；pitch 俯仰（負的往下看）；height 支點比眼睛高多少。 */
  thirdPerson: { distance: number; pitch: number; height: number };
  firstPersonFov: number;
  /** 拖曳畫面時每移動 1 px 轉幾弧度。 */
  lookSensitivity: number;
  /** 上下看的最大角度（度）。 */
  maxPitch: number;
  /** 滾輪 deltaY 每單位拉遠幾公尺（滾一格約 100）。 */
  zoomPerWheel: number;
  /** 第三人稱最近距離；推得比這近就回第一人稱。 */
  minDistance: number;
  maxDistance: number;
  /** 滾輪拉遠拉近的平滑時間。 */
  zoomSmoothTime: number;
  /** 被障礙物擋住時拉近的平滑時間（要快）。 */
  obstructSmoothTime: number;
  /** 障礙物離開後退回的平滑時間（要慢，過門框才不會忽遠忽近）。 */
  releaseSmoothTime: number;
  /** 移動時鏡頭轉回角色背後的平滑時間。 */
  followSmoothTime: number;
  /** 往前走時距離、俯仰角回到預設的平滑時間。 */
  resetSmoothTime: number;
}

export interface SceneConfig {
  scene: SceneSection;
  character: CharacterConfig;
  camera: CameraConfig;
}

// ---------- 型別守衛：JSON 是手改或存檔寫回的，載入時檢查一次，錯了直接說哪裡錯 ----------
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function missingNumbers(value: unknown, keys: string[]): string[] {
  if (!isObject(value)) return keys;
  return keys.filter((key) => typeof value[key] !== 'number' || !Number.isFinite(value[key]));
}

const isRingLayerList = (value: unknown): value is RingLayer[] =>
  Array.isArray(value) && value.every((layer) =>
    isObject(layer) && (RING_STYLES as unknown[]).includes(layer.style) && missingNumbers(layer, ['gap']).length === 0);

function collectSceneIssues(scene: unknown): string[] {
  if (!isObject(scene)) return ['scene'];
  return [
    ...missingNumbers(scene, ['groundSize']).map((key) => `scene.${key}`),
    ...missingNumbers(scene.spawn, ['x', 'z', 'facing']).map((key) => `scene.spawn.${key}`),
    ...missingNumbers(scene.center, ['topRadius', 'topY', 'height']).map((key) => `scene.center.${key}`),
    ...missingNumbers(scene.rings, ['clearance', 'width', 'thickness']).map((key) => `scene.rings.${key}`),
    ...(isRingLayerList(isObject(scene.rings) ? scene.rings.layers : undefined) ? [] : ['scene.rings.layers']),
    ...missingNumbers(scene.floaters, ['islands', 'platforms', 'hexPads', 'debris', 'clusters', 'bobScale']).map((key) => `scene.floaters.${key}`),
  ];
}

function collectCharacterIssues(character: unknown): string[] {
  if (!isObject(character)) return ['character'];
  const numbers = ['scale', 'radius', 'stepHeight', 'walkSpeed', 'runSpeed', 'swimSpeed', 'turnSpeed', 'jumpHeight', 'gravity', 'fadeSeconds', 'landLockSeconds', 'turnToMoveSeconds', 'maxMoveTurn', 'legTurnLimit'];
  const issues = missingNumbers(character, numbers).map((key) => `character.${key}`);
  issues.push(...missingNumbers(character.clipSpeeds, ['walk', 'run', 'sprint']).map((key) => `character.clipSpeeds.${key}`));
  issues.push(...missingNumbers(character.boost, ['run', 'fly']).map((key) => `character.boost.${key}`));
  const clips = isObject(character.clips) ? character.clips : {};
  issues.push(...CLIP_ROLES.filter((role) => typeof clips[role] !== 'string').map((role) => `character.clips.${role}`));
  if (typeof character.showSkeleton !== 'boolean') issues.push('character.showSkeleton');
  return issues;
}

function collectCameraIssues(camera: unknown): string[] {
  if (!isObject(camera)) return ['camera'];
  const numbers = [
    'firstPersonFov', 'lookSensitivity', 'maxPitch', 'zoomPerWheel', 'minDistance', 'maxDistance',
    'zoomSmoothTime', 'obstructSmoothTime', 'releaseSmoothTime', 'followSmoothTime', 'resetSmoothTime',
  ];
  const issues = missingNumbers(camera, numbers).map((key) => `camera.${key}`);
  issues.push(...missingNumbers(camera.thirdPerson, ['distance', 'pitch', 'height']).map((key) => `camera.thirdPerson.${key}`));
  return issues;
}

/** 列出 value 不符合 SceneConfig 的欄位路徑；空陣列代表格式正確。 */
export function findConfigIssues(value: unknown): string[] {
  if (!isObject(value)) return ['（整個檔案不是物件）'];
  return [
    ...collectSceneIssues(value.scene),
    ...collectCharacterIssues(value.character),
    ...collectCameraIssues(value.camera),
  ];
}

export const isSceneConfig = (value: unknown): value is SceneConfig => findConfigIssues(value).length === 0;

/**
 * 檢查 scene.config.json 的內容並回傳一份新拷貝（改它不會動到原本匯入的物件）。
 * JSON 由呼叫端匯入：vite.config.ts 也用這個檔的型別守衛，這裡匯入 JSON 的話，存檔會讓 Vite 以為設定變了而重啟。
 * @param raw 匯入的 JSON
 * @throws 格式不對時，錯誤訊息列出有問題的欄位。
 */
export function loadSceneConfig(raw: unknown): SceneConfig {
  const copy: unknown = structuredClone(raw);
  if (!isSceneConfig(copy)) throw new Error(`scene.config.json 格式不對：${findConfigIssues(copy).join('、')}`);
  return copy;
}

/** vite dev 外掛接收「儲存」的端點（只在開發伺服器存在）。 */
export const SAVE_ENDPOINT = '/__scene-config';
