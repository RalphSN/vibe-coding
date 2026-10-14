#!/usr/bin/env node
// 從 Standard Ebooks 抓英文書的單頁版（XHTML），產生閱讀器用的資料檔（每章一個 .js，直接開檔也能載入）。
// Standard Ebooks 的校對與排版以 CC0 釋出，原文本身是公有領域。
// 用法：node tools/fetch-standard-ebook.mjs --ebook f-scott-fitzgerald/the-great-gatsby --out books/the-great-gatsby [--dry-run]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://standardebooks.org/ebooks';
const USER_AGENT = 'vibe-coding-book-reader/1.0 (personal reading site)';
const EXCERPT_WORDS = 7; // 目錄裡每章顯示開頭幾個字（原書各章沒有標題）
const HELP = `用法：node tools/fetch-standard-ebook.mjs --ebook <作者/書名> --out <輸出資料夾> [--cache <檔案>] [--dry-run]

  --ebook    Standard Ebooks 網址裡的路徑，例如 f-scott-fitzgerald/the-great-gatsby
  --out      輸出資料夾（相對 repo 根目錄），會寫入 text/NNN.js 與 toc.js
  --cache    原始 XHTML 的快取檔（選填），有快取就不重抓，調整轉換規則時用
  --dry-run  只抓取與轉換，列出結果，不寫檔

範例：node tools/fetch-standard-ebook.mjs --ebook f-scott-fitzgerald/the-great-gatsby --out books/the-great-gatsby`;

// 內文標記：斜體用 \\u0005…\\u0006 包起來，閱讀器再轉回 <i>（和紅樓夢註腳的 \\u0003N\\u0004 同一種做法）
const ITALIC_OPEN = '\u0005';
const ITALIC_CLOSE = '\u0006';

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--help' || key === '-h') args.help = true;
    else if (key === '--dry-run') args.dryRun = true;
    else if (key === '--ebook') args.ebook = argv[++i];
    else if (key === '--out') args.out = argv[++i];
    else if (key === '--cache') args.cache = argv[++i];
    else throw new Error(`不認得的參數：${key}`);
  }
  return args;
}

const pad3 = (n) => String(n).padStart(3, '0');

async function loadXhtml(ebook, cacheFile) {
  if (cacheFile && existsSync(cacheFile)) return readFileSync(cacheFile, 'utf8');
  const url = `${SITE}/${ebook}/text/single-page`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Standard Ebooks 回應 ${res.status}：${url}`);
  const xhtml = await res.text();
  if (cacheFile) {
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, xhtml);
  }
  return xhtml;
}

function section(xhtml, id) {
  const match = xhtml.match(new RegExp(`<section[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</section>`));
  return match ? match[1] : null;
}

/** 行內標記轉純文字：斜體留標記，<br/> 換行，其他標籤（abbr、time、span、b）只留文字 */
function inlineText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(i|em)\b[^>]*>/g, ITALIC_OPEN)
    .replace(/<\/(i|em)>/g, ITALIC_CLOSE)
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t\r\n]*\n[ \t\r\n]*/g, '\n')
    .replace(/[ \t\r]+/g, ' ')
    .trim();
}

const paragraphs = (html) => [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => ({ attrs: m[0].slice(0, m[0].indexOf('>')), text: inlineText(m[1]) }));

/** blockquote：詩（每行一個 span）、信件（段落＋署名）、清單（標題＋條列） */
function blockquoteBlocks(attrs, inner, label, unknown) {
  if (/z3998:verse/.test(attrs)) {
    const lines = [...inner.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map((m) => inlineText(m[1]));
    const cite = inner.match(/<cite\b[^>]*>([\s\S]*?)<\/cite>/);
    return [{ t: 'poem', x: lines.join('\n'), ...(cite ? { cite: inlineText(cite[1]) } : {}) }];
  }
  if (/<ul\b/.test(inner)) {
    const title = inner.match(/<header\b[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/);
    const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => inlineText(m[1]));
    return [{ t: 'list', title: title ? inlineText(title[1]) : '', items }];
  }
  if (/z3998:letter/.test(attrs) || /<p\b/.test(inner)) {
    const footer = inner.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/);
    const body = footer ? inner.replace(footer[0], '') : inner;
    return [
      ...paragraphs(body).map((p) => ({ t: 'quote', x: p.text })),
      ...(footer ? paragraphs(footer[1]).map((p) => ({ t: 'quote', x: p.text, sign: true })) : []),
    ];
  }
  unknown.add(`未處理的 blockquote@${label}`);
  return [];
}

function tableBlock(inner) {
  const rows = [...inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => inlineText(m[1])));
  return { t: 'table', rows };
}

/**
 * 把一章的 XHTML 轉成區塊。依出現順序處理最外層的元素：
 * h2 章名、p 段落、hr 分場、blockquote 詩／信件／清單、table 表格。
 * @returns {{ title: string, blocks: object[], notes: string[] }}
 */
function convertChapter(html, label, unknown) {
  const title = inlineText((html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || '');
  if (!title) throw new Error(`${label} 找不到章名`);
  const blocks = [];
  const top = /<(p|blockquote|table)\b([^>]*)>([\s\S]*?)<\/\1>|<hr\b[^>]*\/?>|<h2\b[\s\S]*?<\/h2>/g;
  for (const m of html.matchAll(top)) {
    if (m[0].startsWith('<h2')) continue;
    if (m[0].startsWith('<hr')) { blocks.push({ t: 'break' }); continue; }
    const [, tag, attrs, inner] = m;
    if (tag === 'p') blocks.push({ t: 'p', x: inlineText(inner), ...(/class="continued"/.test(attrs) ? { cont: true } : {}) });
    else if (tag === 'blockquote') blocks.push(...blockquoteBlocks(attrs, inner, label, unknown));
    else if (tag === 'table') blocks.push(tableBlock(inner));
  }
  for (const b of blocks) {
    const text = [b.x, b.title, ...(b.items || []), ...(b.rows || []).flat()].filter(Boolean).join('');
    if (/[<>]/.test(text)) unknown.add(`殘留標記@${label}: ${text.slice(0, 40)}`);
  }
  return { title, blocks, notes: [] };
}

const plain = (text) => text.replace(/[\u0005\u0006]/g, '');
const blockText = (b) => plain([b.x, b.title, ...(b.items || []), ...(b.rows || []).flat()].filter(Boolean).join(' '));

/** 卷首用的獻詞與題詞 */
function frontMatter(xhtml) {
  const dedication = section(xhtml, 'dedication');
  const epigraph = section(xhtml, 'epigraph');
  const unknown = new Set();
  return {
    dedication: dedication ? paragraphs(dedication).map((p) => plain(p.text)).join('\n') : '',
    epigraph: epigraph ? blockquoteBlocks((epigraph.match(/<blockquote([^>]*)>/) || [])[1] || '', epigraph, 'epigraph', unknown)[0] : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  if (!args.ebook || !args.out) throw new Error(`缺少參數\n\n${HELP}`);
  if (typeof fetch !== 'function') throw new Error('需要 Node 18 以上（內建 fetch）');

  const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const outDir = resolve(repoRoot, args.out);
  const xhtml = await loadXhtml(args.ebook, args.cache && resolve(args.cache));
  const unknown = new Set();
  const chapters = [];
  for (let n = 1; ; n += 1) {
    const html = section(xhtml, `chapter-${n}`);
    if (!html) break;
    chapters.push({ n, ...convertChapter(html, `chapter-${n}`, unknown) });
  }
  if (!chapters.length) throw new Error(`找不到任何 chapter-N 段落：${args.ebook}`);

  const toc = chapters.map((c) => {
    const first = c.blocks.find((b) => b.t === 'p');
    const words = first ? plain(first.x).split(/\s+/) : [];
    const excerpt = words.slice(0, EXCERPT_WORDS).join(' ') + (words.length > EXCERPT_WORDS ? '…' : '');
    return { n: c.n, title: c.title, excerpt, chars: c.blocks.reduce((sum, b) => sum + blockText(b).length, 0) };
  });
  const front = frontMatter(xhtml);

  const totalWords = chapters.reduce((sum, c) => sum + c.blocks.reduce((s, b) => s + blockText(b).split(/\s+/).filter(Boolean).length, 0), 0);
  console.log(`共 ${chapters.length} 章、約 ${totalWords} 字（words）`);
  if (unknown.size) console.log(`未處理的標記：\n  ${[...unknown].join('\n  ')}`);
  if (args.dryRun) { console.log('dry-run：不寫檔'); return; }

  const textDir = join(outDir, 'text');
  mkdirSync(textDir, { recursive: true });
  const header = `// 由 tools/fetch-standard-ebook.mjs 產生，不要手改。來源：${SITE}/${args.ebook}\n`;
  for (const c of chapters) {
    writeFileSync(join(textDir, `${pad3(c.n)}.js`), `${header}window.BookData.chapter(${JSON.stringify(c)});\n`);
  }
  writeFileSync(join(outDir, 'toc.js'), `${header}window.BookData.toc(${JSON.stringify(toc)}, ${JSON.stringify(front)});\n`);
  console.log(`已寫入 ${textDir}`);
}

main().catch((err) => {
  console.error(`抓取失敗：${err.message}`);
  process.exit(1);
});
