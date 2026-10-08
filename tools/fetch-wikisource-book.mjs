#!/usr/bin/env node
// 從維基文庫抓整本小說，清掉 wiki 標記，產生閱讀器用的資料檔（每回一個 .js，直接開檔也能載入）。
// 用法：node tools/fetch-wikisource-book.mjs --title 紅樓夢 --chapters 120 --out books/hongloumeng [--dry-run]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// 維基文庫的原文混有簡體字；用 OpenCC 依詞組轉成台灣用字（安裝：cd tools && npm install）
import * as OpenCC from 'opencc-js';

const openccToTw = OpenCC.Converter({ from: 'cn', to: 'tw' });

/*
  原文本身大多已是繁體，OpenCC 會把一些合法的繁體字當成簡體再轉一次而轉錯
  （自云→自雲、只減了→只減瞭、大家什麼→大傢什麼、一出頭→一齣頭、周大爺→週大爺）。
  這些字預設保留原文，只有上下文符合下面的規則時才採用 OpenCC 的結果。規則逐處對照原文確認過。
*/
const KEEP_UNLESS = {
  云: () => false, // 「說」的意思；原文少數寫成「云」的「雲」由 YUN_AS_CLOUD 處理
  了: () => false,
  娘: () => false,
  周: () => false,
  家: (prev, next) => next === '伙' && prev !== '大', // 傢伙；「大家伙兒」是大家夥兒
  只: (prev, next) => '一二兩三四五六七八九十百幾這那船'.includes(prev) || next === '身', // 量詞：兩隻手、船隻、隻身
  出: (prev, next, before, after) => /^《/.test(after) || /第[一二三四五六七八九十]+$/.test(before)
    || (/[這那了唱有]一$/.test(before) && /^([。？戲]|熱鬧|吉慶|上，)/.test(after)), // 戲曲的「齣」
  欲: (prev, next, before, after) => /(情|利|色|人|淫|寡)$/.test(before) && !/^(向|亡)/.test(after), // 情慾、利慾、淫慾
};
const KEEP_CONTEXT = 4;

const YUN_AS_CLOUD = ['流云百蝠', '連云直上', '九霄云外', '倚云栽', '聚云根', '穿云', '向云霞', '被云催', '朝云之流',
  '倪云林', '絳云軒', '云妹妹', '素云', '云南', '層云下', '野鶴閒云', '好云香護'];

/** 逐字比對原文與 OpenCC 結果，KEEP_UNLESS 裡的字照規則決定要不要轉 */
function convertKeepingValidChars(text) {
  const src = [...text];
  const out = [...openccToTw(text)];
  // OpenCC 是逐字對應，長度不變；萬一不一樣就無法逐字比對，直接用 OpenCC 的結果
  if (src.length !== out.length) return out.join('');
  for (let i = 0; i < src.length; i += 1) {
    const rule = KEEP_UNLESS[src[i]];
    if (!rule || src[i] === out[i]) continue;
    const before = src.slice(Math.max(0, i - KEEP_CONTEXT), i).join('');
    const after = src.slice(i + 1, i + 1 + KEEP_CONTEXT).join('');
    if (!rule(src[i - 1] || '', src[i + 1] || '', before, after)) out[i] = src[i];
  }
  return out.join('');
}

/** 轉成台灣用字；維基文庫編者用 -{字}- 標記為「不要轉換」的字照原樣保留 */
function toTraditional(raw) {
  return raw.split(/-\{([^{}]*)\}-/).map((part, i) => {
    if (i % 2 === 1) return part;
    const converted = convertKeepingValidChars(part).replace(/頭發(?![暈昏脹沉燒熱])/g, '頭髮');
    return YUN_AS_CLOUD.reduce((acc, phrase) => acc.replaceAll(phrase, phrase.replace('云', '雲')), converted);
  }).join('');
}

/**
 * 引號統一成台灣用的「」『』。原文前幾回用「」、後面多用“”，也有方向寫反的（”絳雲軒”）。
 * 一段裡的“”成對時，照開、關交替重新配對；不成對（對話跨段）時照原本的方向。
 * 外層用「」、包在引號裡的用『』，原文已有的「」『』也算進層次。
 */
function normalizeQuotes(text) {
  const chars = [...text];
  const curly = chars.filter((ch) => ch === '“' || ch === '”').length;
  const pairByOrder = curly % 2 === 0;
  let curlyOpen = false;
  let depth = 0;
  return chars.map((ch) => {
    if (ch === '「' || ch === '『') { depth += 1; return ch; }
    if (ch === '」' || ch === '』') { depth = Math.max(0, depth - 1); return ch; }
    const isCurly = ch === '“' || ch === '”';
    const isSingle = ch === '‘' || ch === '’';
    if (!isCurly && !isSingle) return ch;
    let opens;
    if (isCurly && pairByOrder) { curlyOpen = !curlyOpen; opens = curlyOpen; } else opens = ch === '“' || ch === '‘';
    if (opens) { depth += 1; return depth > 1 ? '『' : '「'; }
    depth = Math.max(0, depth - 1);
    return depth > 0 ? '』' : '」';
  }).join('');
}

const API = 'https://zh.wikisource.org/w/api.php';
const BATCH_SIZE = 10; // MediaWiki 一次查詢最多 50 頁，內容太大會被截，保守一點
const BATCH_DELAY_MS = 1500; // 維基文庫會對連續請求回 429，批次之間停一下
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 10000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const USER_AGENT = 'vibe-coding-book-reader/1.0 (personal reading site)';
const HELP = `用法：node tools/fetch-wikisource-book.mjs --title <書名> --chapters <回數> --out <輸出資料夾> [--dry-run]

  --title     維基文庫上的書名頁，子頁面要是「<書名>/第001回」格式
  --chapters  總回數
  --out       輸出資料夾（相對 repo 根目錄），會寫入 text/NNN.js 與 toc.js
  --cache     原始 wikitext 快取資料夾（選填），有快取就不重抓，調整清洗規則時用
  --dry-run   只抓取與清洗，列出結果，不寫檔

範例：node tools/fetch-wikisource-book.mjs --title 紅樓夢 --chapters 120 --out books/hongloumeng`;

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--help' || key === '-h') args.help = true;
    else if (key === '--dry-run') args.dryRun = true;
    else if (key === '--title') args.title = argv[++i];
    else if (key === '--chapters') args.chapters = Number(argv[++i]);
    else if (key === '--out') args.out = argv[++i];
    else if (key === '--cache') args.cache = argv[++i];
    else throw new Error(`不認得的參數：${key}`);
  }
  return args;
}

const pad3 = (n) => String(n).padStart(3, '0');

/** 1–999 轉成回目用的中文數字（一百二十），來源偶爾寫成「一二零」，統一重算 */
function toChineseNumeral(n) {
  const DIGITS = '零一二三四五六七八九';
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;
  let out = hundreds ? `${DIGITS[hundreds]}百` : '';
  if (tens) out += `${tens === 1 && !hundreds ? '' : DIGITS[tens]}十`;
  else if (hundreds && ones) out += '零';
  if (ones) out += DIGITS[ones];
  return out;
}

async function fetchBatch(titles, attempt = 0) {
  const params = new URLSearchParams({
    action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
    titles: titles.join('|'), format: 'json', formatversion: '2',
  });
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 429 && attempt < MAX_RETRIES) {
    await sleep(RETRY_DELAY_MS * (attempt + 1));
    return fetchBatch(titles, attempt + 1);
  }
  if (!res.ok) throw new Error(`維基文庫回應 ${res.status}：${titles[0]} 起的 ${titles.length} 頁`);
  const data = await res.json();
  const map = new Map();
  for (const page of data.query.pages) {
    if (page.missing) throw new Error(`找不到頁面：${page.title}`);
    map.set(page.title, page.revisions[0].slots.main.content);
  }
  return map;
}

/** 有快取就讀快取，沒有才向維基文庫抓，並寫入快取 */
async function loadBatch(titles, cacheDir) {
  if (!cacheDir) return fetchBatch(titles);
  mkdirSync(cacheDir, { recursive: true });
  const fileOf = (t) => join(cacheDir, `${t.replace(/[\/:*?"<>|]/g, '_')}.wiki`);
  const missing = titles.filter((t) => !existsSync(fileOf(t)));
  if (missing.length) {
    const fetched = await fetchBatch(missing);
    for (const [t, content] of fetched) writeFileSync(fileOf(t), content);
    await sleep(BATCH_DELAY_MS);
  }
  return new Map(titles.map((t) => [t, readFileSync(fileOf(t), 'utf8')]));
}

/** 處理 {{名稱|內容}}：由內往外展開，只保留內容；批語模板 {{~~|}} 包成標記，之後轉成批語區塊 */
function expandTemplates(text, unknown) {
  const KEEP_CONTENT = new Set(['center', 'larger', 'smaller', 'small', 'big', 'ruby']);
  const DROP = /^(样式|樣式|清朝作品|Textquality|header|檢索|PD-|Col-|未校訂)/i;
  let prev;
  do {
    prev = text;
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_, body) => {
      const [name, ...rest] = body.split('|');
      const key = name.trim();
      if (key === '~~') return `\u0001${rest.join('|')}\u0002`;
      if (DROP.test(key)) return '';
      if (key === '僻字') return rest[0] || ''; // {{僻字|字|字形說明}}：只留字
      if (key === 'gap') return '　　';
      if (KEEP_CONTENT.has(key.toLowerCase())) return rest.join('|');
      unknown.add(key);
      return rest.length ? rest[rest.length - 1] : '';
    });
  } while (text !== prev);
  return text;
}

function stripInline(text) {
  return text
    .replace(/-\{([^}]*)\}-/g, '$1')
    .replace(/'''|''/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/<\/?(?:span|font|big|small|u|b|i)[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ');
}

/**
 * 把一回的 wikitext 轉成區塊：p 一般段落、poem 詩詞（保留換行）、comment 回前批語。
 * @returns {{ title: string, blocks: {t: string, x: string}[], notes: string[] }}
 */
function cleanChapter(raw, label, unknown) {
  const notes = [];
  let text = raw
    .replace(/-\{([^{}]*)\}-/g, '$1') // 字詞轉換保護標記，先拿掉，避免大括號干擾模板展開
    .replace(/<\/?(?:section|onlyinclude)[^>]*>/g, '')
    .replace(/<poem[^>]*>/g, '<poem>')
    // 圖片（例如通靈寶玉上的篆字）只留替代文字
    .replace(/\[\[(?:File|Image|檔案|文件):[^\]]*?alt=([^|\]]*)[^\]]*\]\]/gi, '<poem>$1</poem>')
    .replace(/\[\[(?:File|Image|檔案|文件):[^\]]*\]\]/gi, '')
    .replace(/\{\{ppoem\|([\s\S]*?)\}\}/g, (_, body) => `<poem>${body.replace(/(?:start|end)=[\w-]+\s*\|?/g, '')}</poem>`);
  text = text.replace(/<ref[^>]*>([\s\S]*?)<\/ref>/g, (_, note) => {
    notes.push(note.trim());
    return `\u0003${notes.length}\u0004`;
  });
  text = text.replace(/<\/?center>/g, '').replace(/<references\s*\/>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  text = expandTemplates(text, unknown);

  const titleMatch = text.match(/^\s*(?:''')?(第[一二三四五六七八九十百零〇]+回[^\n]*)$/m);
  if (!titleMatch) throw new Error(`${label} 找不到回目`);
  const title = stripInline(titleMatch[1]).replace(/\u0003\d+\u0004|'/g, '').replace(/\s+/g, '　').trim();
  text = text.slice(titleMatch.index + titleMatch[0].length);
  text = text.replace(/==\s*註釋\s*==[\s\S]*$/, '').replace(/\n-{4,}[\s\S]*$/, '');

  const blocks = [];
  const pushParas = (chunk, type) => {
    for (const para of chunk.split(/\n\s*\n|\n/)) {
      const line = stripInline(para).replace(/^[\s:*#]+/, '').trim();
      if (line && !/^\[\[\.\.\//.test(para)) blocks.push({ t: type, x: line });
    }
  };
  // 依 <poem> 切開，詩詞保留換行
  const parts = text.split(/<poem>([\s\S]*?)<\/poem>/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const isComment = part.includes('\u0001');
      const lines = stripInline(part.replace(/[\u0001\u0002]/g, '')).split('\n').map((s) => s.trim()).filter(Boolean);
      if (lines.length) blocks.push({ t: isComment ? 'comment' : 'poem', x: lines.join('\n') });
      return;
    }
    // 批語可能跨段：先切出批語，其餘當段落
    part.split(/\u0001([\s\S]*?)\u0002/).forEach((seg, j) => {
      if (j % 2 === 1) pushParas(seg, 'comment');
      else pushParas(seg, 'p');
    });
  });
  for (const b of blocks) {
    if (/[{}<>\[\]|]/.test(b.x.replace(/\u0003\d+\u0004/g, ''))) unknown.add(`殘留標記@${label}: ${b.x.slice(0, 30)}`);
  }
  for (const b of blocks) b.x = normalizeQuotes(b.x);
  return { title, blocks, notes: notes.map((n) => normalizeQuotes(stripInline(expandTemplates(n, unknown)).replace(/<li>/g, '；').replace(/<[^>]+>/g, '').trim())) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  if (!args.title || !args.chapters || !args.out) throw new Error(`缺少參數\n\n${HELP}`);
  if (typeof fetch !== 'function') throw new Error('需要 Node 18 以上（內建 fetch）');

  const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const outDir = resolve(repoRoot, args.out);
  const titles = Array.from({ length: args.chapters }, (_, i) => `${args.title}/第${pad3(i + 1)}回`);
  const unknown = new Set();
  const toc = [];
  const chapters = [];

  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const batch = titles.slice(i, i + BATCH_SIZE);
    const pages = await loadBatch(batch, args.cache);
    for (const t of batch) {
      if (!pages.has(t)) throw new Error(`回應裡缺少 ${t}`);
      const n = titles.indexOf(t) + 1;
      const chapter = cleanChapter(toTraditional(pages.get(t)), t, unknown);
      chapter.title = chapter.title.replace(/^第[^回]+回/, `第${toChineseNumeral(n)}回`);
      const chars = chapter.blocks.reduce((sum, b) => sum + b.x.length, 0);
      chapters.push({ n, ...chapter });
      toc.push({ n, title: chapter.title, chars });
    }
    if (!args.cache) await sleep(BATCH_DELAY_MS);
    console.error(`已抓 ${Math.min(i + BATCH_SIZE, titles.length)} / ${titles.length}`);
  }

  const totalChars = toc.reduce((s, c) => s + c.chars, 0);
  console.log(`共 ${toc.length} 回、${totalChars} 字`);
  if (unknown.size) console.log(`未處理的模板或殘留標記：\n  ${[...unknown].join('\n  ')}`);
  if (args.dryRun) { console.log('dry-run：不寫檔'); return; }

  const textDir = join(outDir, 'text');
  if (!existsSync(textDir)) mkdirSync(textDir, { recursive: true });
  const header = `// 由 tools/fetch-wikisource-book.mjs 產生，不要手改。來源：${API.replace('/w/api.php', '')}/wiki/${args.title}\n`;
  for (const c of chapters) {
    writeFileSync(join(textDir, `${pad3(c.n)}.js`), `${header}window.BookData.chapter(${JSON.stringify(c)});\n`);
  }
  writeFileSync(join(outDir, 'toc.js'), `${header}window.BookData.toc(${JSON.stringify(toc)});\n`);
  console.log(`已寫入 ${textDir}`);
}

main().catch((err) => {
  console.error(`抓取失敗：${err.message}`);
  process.exit(1);
});
