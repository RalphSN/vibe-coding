// scene.config.json 的型別。單位：公尺、秒、角度（度）。
// 座標：原點在房屋外框中心的地面；+X 東、-Z 北、+Y 上。

export type FurnitureType = 'bed' | 'desk' | 'chair' | 'bookcase' | 'wardrobe' | 'counter' | 'island' | 'sofa' | 'bath' | 'table';
export type ClipRole = 'idle' | 'walk' | 'run' | 'jumpStart' | 'jumpLoop' | 'jumpLand';
export type OpeningKind = 'door' | 'slider' | 'window';
export type FloorKind = 'room' | 'deck';

export const FURNITURE_TYPES: FurnitureType[] = ['bed', 'desk', 'chair', 'bookcase', 'wardrobe', 'counter', 'island', 'sofa', 'bath', 'table'];
export const OPENING_KINDS: OpeningKind[] = ['door', 'slider', 'window'];
export const FLOOR_KINDS: FloorKind[] = ['room', 'deck'];
export const CLIP_ROLES: ClipRole[] = ['idle', 'walk', 'run', 'jumpStart', 'jumpLoop', 'jumpLand'];

export interface Sizes { width: number; depth: number; height: number }
export interface Spot { x: number; z: number }

/**
 * 一件家具。x / z 是佔地中心；width 沿家具自身 X，depth 沿自身 Z（rotation 0 時背面朝北）。
 * rotation 是從上往下看的逆時針角度（整數度，0–359）。type 決定外型與顏色，同一種家具可以有好幾件。
 */
export interface FurnitureItem extends Sizes, Spot { type: FurnitureType; label: string; rotation: number }

/** 軸對齊的長方形範圍（世界座標）。 */
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

/** 牆上的開口。offset：從牆的起點（x1, z1）量到開口中心；sill 是窗台離地高度（門沒有）。slider 是拉門。 */
export interface Opening { label: string; kind: OpeningKind; offset: number; width: number; height: number; sill?: number }

/** 一段牆（中心線從 (x1, z1) 到 (x2, z2)，只支援東西向或南北向）。 */
export interface Wall { label: string; x1: number; z1: number; x2: number; z2: number; openings: Opening[] }

/** 可以站、可以擺家具的地板：室內房間或木平台（和室內同高）。 */
export interface FloorArea extends Rect { label: string; kind: FloorKind }

/** 平台邊的欄杆（中心線）。 */
export interface Railing { label: string; x1: number; z1: number; x2: number; z2: number; height: number }

/** 台階：實心方塊，height 是頂面高度。 */
export interface Step extends Rect { label: string; height: number }

export interface HouseConfig {
  wallHeight: number;
  wallThickness: number;
  floors: FloorArea[];
  walls: Wall[];
  railings: Railing[];
  steps: Step[];
}

export interface SceneSection {
  house: HouseConfig;
  /** 房屋外框往外多大一片草地可以走（m），邊緣有隱形圍欄。 */
  groundMargin: number;
  /** 第一次進入第一人稱時站的位置；facing 是面向（度，0 朝北、90 朝西，逆時針）。 */
  spawn: { x: number; z: number; facing: number };
  /** 編輯器吸附：格線、牆邊／家具邊吸附距離、尺寸步進、窗前要留的空間。 */
  rules: { gridSnap: number; edgeSnap: number; sizeSnap: number; windowClearance: number };
}

export interface CharacterConfig {
  /** 模型縮放；1 是 ual1-standard.glb 原本的 1.83 m。第一人稱的眼睛高度跟著身高換算。 */
  scale: number;
  /** 碰撞半徑：身體當成邊長 2 × radius 的方塊。 */
  radius: number;
  /** 比腳高這麼多以內的表面直接走上去（m），更高要跳。 */
  stepHeight: number;
  /** 走路／按住 Shift 跑步的移動速度（m/s）。 */
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
  /** 各動作用哪段動畫（glb 裡的片段名稱）。 */
  clips: Record<ClipRole, string>;
  /** 走路、跑步動畫原本的移動速度（m/s），也是混合空間的兩個節點：速度介於兩者之間時兩段按比例混合，腳才不會滑。 */
  clipSpeeds: { walk: number; run: number };
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
  furniture: Record<string, FurnitureItem>;
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

const RECT_KEYS = ['minX', 'maxX', 'minZ', 'maxZ'];
const SEGMENT_KEYS = ['x1', 'z1', 'x2', 'z2'];

// 陣列裡每一項檢查數字欄位與 label，路徑寫成 scene.house.walls[3].x1 這種格式。
function collectListIssues(list: unknown, path: string, numbers: string[], extra: (item: Record<string, unknown>, at: string) => string[]): string[] {
  if (!Array.isArray(list)) return [path];
  return list.flatMap((item: unknown, index) => {
    const at = `${path}[${index}]`;
    if (!isObject(item)) return [at];
    const issues = missingNumbers(item, numbers).map((key) => `${at}.${key}`);
    if (typeof item.label !== 'string') issues.push(`${at}.label`);
    return [...issues, ...extra(item, at)];
  });
}

function collectOpeningIssues(wall: Record<string, unknown>, at: string): string[] {
  const issues: string[] = [];
  if (SEGMENT_KEYS.every((key) => typeof wall[key] === 'number') && wall.x1 !== wall.x2 && wall.z1 !== wall.z2) {
    issues.push(`${at}（牆只能東西向或南北向）`);
  }
  issues.push(...collectListIssues(wall.openings, `${at}.openings`, ['offset', 'width', 'height'], (opening, path) =>
    (OPENING_KINDS.some((kind) => kind === opening.kind) ? [] : [`${path}.kind（要是 ${OPENING_KINDS.join('／')}）`])));
  return issues;
}

function collectSceneIssues(scene: unknown): string[] {
  if (!isObject(scene)) return ['scene'];
  const house = scene.house;
  if (!isObject(house)) return ['scene.house'];
  const issues = missingNumbers(house, ['wallHeight', 'wallThickness']).map((key) => `scene.house.${key}`);
  issues.push(...collectListIssues(house.floors, 'scene.house.floors', RECT_KEYS, (floor, at) =>
    (FLOOR_KINDS.some((kind) => kind === floor.kind) ? [] : [`${at}.kind（要是 ${FLOOR_KINDS.join('／')}）`])));
  issues.push(...collectListIssues(house.walls, 'scene.house.walls', SEGMENT_KEYS, collectOpeningIssues));
  issues.push(...collectListIssues(house.railings, 'scene.house.railings', [...SEGMENT_KEYS, 'height'], () => []));
  issues.push(...collectListIssues(house.steps, 'scene.house.steps', [...RECT_KEYS, 'height'], () => []));
  issues.push(...missingNumbers(scene, ['groundMargin']).map((key) => `scene.${key}`));
  issues.push(...missingNumbers(scene.spawn, ['x', 'z', 'facing']).map((key) => `scene.spawn.${key}`));
  issues.push(...missingNumbers(scene.rules, ['gridSnap', 'edgeSnap', 'sizeSnap', 'windowClearance']).map((key) => `scene.rules.${key}`));
  return issues;
}

function collectFurnitureIssues(furniture: unknown): string[] {
  if (!isObject(furniture)) return ['furniture'];
  const issues: string[] = [];
  for (const [key, item] of Object.entries(furniture)) {
    issues.push(...missingNumbers(item, ['x', 'z', 'rotation', 'width', 'depth', 'height']).map((prop) => `furniture.${key}.${prop}`));
    const isTypeValid = isObject(item) && FURNITURE_TYPES.some((type) => type === item.type);
    if (!isTypeValid) issues.push(`furniture.${key}.type（要是 ${FURNITURE_TYPES.join('／')}）`);
    if (!isObject(item) || typeof item.label !== 'string') issues.push(`furniture.${key}.label`);
  }
  return issues;
}

function collectCharacterIssues(character: unknown): string[] {
  if (!isObject(character)) return ['character'];
  const numbers = ['scale', 'radius', 'stepHeight', 'walkSpeed', 'runSpeed', 'turnSpeed', 'jumpHeight', 'gravity', 'fadeSeconds', 'landLockSeconds', 'turnToMoveSeconds', 'maxMoveTurn', 'legTurnLimit'];
  const issues = missingNumbers(character, numbers).map((key) => `character.${key}`);
  issues.push(...missingNumbers(character.clipSpeeds, ['walk', 'run']).map((key) => `character.clipSpeeds.${key}`));
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
    ...collectFurnitureIssues(value.furniture),
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
