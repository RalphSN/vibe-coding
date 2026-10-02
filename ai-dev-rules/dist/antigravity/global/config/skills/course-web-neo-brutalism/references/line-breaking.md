<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# 換行規範：以字詞完整為準

適用：標題、卡片標題、按鈕、側欄連結、上一課／下一課、標籤、表格標頭等短文字。內文段落只套用 2.2 節的 `p, li, td` 設定。

依據：
- W3C《中文排版需求》（[clreq](https://www.w3.org/TR/clreq/)）：避頭尾、避免孤字。
- `text-wrap: balance` 已是 Baseline 2024（Chrome／Edge 114、Firefox 121、Safari 17.5）（[Chrome for Developers](https://developer.chrome.com/docs/css-ui/css-text-wrap-balance)）。
- Google BudouX 有繁體中文模型，用於標題的詞組斷行（[budoux README](https://unpkg.com/budoux@0.9.2/README.md)）。
- Awwwards 沒有公開的排版規範可以引用；這份以上面三個來源為準。

## 1. 判斷基準

短文字要換行時，每一條都要成立：

1. 字詞不拆開：中文詞（「開發」「模式」）、英文單字、專有名詞（「Claude Code」）、編號（「7-7」）、數字和單位（「30 分鐘」）都不能分在兩行。
2. 斷在語意邊界：斷點只能在詞組之間，優先順序是標點後 → 連接詞前（與、和、或、的、讓、用）→ 中英文交界的空格。
3. 不留孤行：任何一行都不能只有 1–2 個字，或只有編號、符號（例如單獨一行的「7-7」）。3 個字以上的完整詞組（「讓檢查」）可以自成一行。照第 2 節的順序處理，最後一步是動態縮小字級（2.5）。
4. 行長平衡：兩行時，短的一行至少是長的一行的 40%。
5. 避頭尾：行首不能是 `，。、；：！？）」』` 這類結尾標點，行尾不能是 `（「『` 這類開頭標點。
6. 按鈕不換行優先：按鈕文字控制在 8 個中文字內。真的要換行，最多 2 行，並符合第 1–5 條。

範例：`7-7 Headless 模式與 worktree 平行開發`

| 寫法 | 結果 | 判定 |
|---|---|---|
| 瀏覽器預設 | `7-7 Headless 模式與 worktree 平行開` ／ `發` | ✗ 拆開「開發」、留孤字 |
| 平衡但沒分詞 | `7-7 Headless 模式與 wo` ／ `rktree 平行開發` | ✗ 拆開英文 |
| 照詞組分行 | `7-7 Headless 模式` ／ `與 worktree 平行開發` | ✓ |

## 2. 做法（照順序採用）

### 2.1 資料裡標出斷點（標題、按鈕優先用這個）

課程資料的標題用 `|` 標出「可以斷的地方」，渲染成一段段 `inline-block`。放得下就一行，放不下只會在 `|` 的位置換行：

```js
// COURSES 裡的單元標題
{ id: '7-7', title: 'Headless 模式|與 worktree 平行開發' }
```

```js
const wordSegmenter = new Intl.Segmenter('zh-Hant', { granularity: 'word' });

const HAN = /\p{Script=Han}/u;

// 詞組內再把中文詞包一層：詞組比容器寬時，只會在詞與詞之間換行
// 英文單字不包：瀏覽器本來就不會拆英文單字，包了 nowrap 反而會在窄容器溢出
function wrapWordsHtml(text) {
  return [...wordSegmenter.segment(text)]
    .map(({ segment, isWordLike }) => (isWordLike && HAN.test(segment) ? `<span class="word">${escapeHtml(segment)}</span>` : escapeHtml(segment)))
    .join('');
}

function renderPhrases(text) {
  return text
    .split('|')
    .map((phrase) => `<span class="phrase">${wrapWordsHtml(phrase)}</span>`)
    .join('');
}
```

```css
.phrase { display: inline-block; max-width: 100%; }
.word { white-space: nowrap; }
```

- `inline-block` 讓整段詞組一起換行；`max-width: 100%` 讓單一詞組比容器還寬時（手機）仍能在內部換行，不會溢出。
- 只有 `.phrase` 不夠：實測 200px 寬時，詞組內部會斷成「模」／「式」。加上 `.word` 之後，120–200px 都只斷在詞與詞之間（2026-10-02 在 Chromium 測試）。
- 英文單字也包 `.word` 時，實測「Engineering」在 160px、36px 字級下會溢出容器，所以只包中文詞。
- 搜尋、`<title>`、`aria-label` 用的是去掉 `|` 的純文字。中英文交界的 `|` 要補回空格：`'Claude Code|與 Cowork'` 的純文字是「Claude Code 與 Cowork」；渲染時空格放在兩個 `.phrase` 之間（inline-block 裡的頭尾空白會被吃掉）。
- 標題裡連續的英文詞（`auto mode`、`GitHub Actions`）在 14 個字元以內時，用不換行空白（U+00A0）黏在一起；超過 14 個字元（`managed settings`）不黏，手機上寧可在空白處換行，也不要從單字中間斷開。
- 上一課／下一課的編號和標題的第一個詞組放在同一個 `.phrase`：`renderPhrases(\`${id} ${title}\`)`，編號才不會單獨成一行。
- 按鈕的上一行說明（「從這裡開始」「下一課 →」）是刻意分行的方向標籤，至少 3 個字，不要寫成 2 個字的「開始」。
- 新寫的標題一律加 `|`；超過 12 個中文字的標題至少一個 `|`。

### 2.2 CSS 預設值

```css
h1, h2, h3, .btn, .card-title, .lesson-nav a, .nav-link {
  text-wrap: balance;      /* 各行等長，避免最後一行只剩幾個字 */
  line-break: strict;      /* 嚴格避頭尾 */
  overflow-wrap: break-word;
  hyphens: manual;         /* 英文不自動加連字號斷字 */
}
p, li, td { text-wrap: pretty; line-break: strict; }
```

- `balance` 在不支援的瀏覽器會退回一般換行，不會壞。
- `pretty` 用在內文，減少段落最後一行的孤字；截至 2026-10 Firefox 尚未支援，會退回一般換行。
- 不用 `word-break: keep-all` 處理中文：沒有空格的長句會整句不換行而溢出。
- 不靠 `word-break: auto-phrase`：截至 2026-10 只有 Chrome／Edge 支援，而且只對日文有效。

### 2.3 沒有手動斷點時：執行期分詞

舊資料或使用者產生的文字沒有 `|`，用瀏覽器內建的 `Intl.Segmenter` 把每個詞包起來，至少保證詞不被拆開：

```js
const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'word' });

function wrapWords(element) {
  if (element.dataset.wrapped) return;
  const text = element.textContent;
  element.textContent = '';
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    const node = isWordLike && /\p{Script=Han}/u.test(segment) ? Object.assign(document.createElement('span'), { className: 'word', textContent: segment }) : document.createTextNode(segment);
    element.append(node);
  }
  element.dataset.wrapped = 'true';
}
```

```css
.word { white-space: nowrap; }
```

- 只包中文詞，理由同 2.1。
- 只用在短文字，不用在內文段落（節點太多）。
- 分詞是詞級，不是詞組級：可能斷成「平行」／「開發」，可以接受；但比不上 2.1 的手動斷點。
- 未查證：瀏覽器內建中文分詞的準確度各家不同，專有名詞可能被切開。重要標題仍用 2.1。

### 2.4 更好的自動詞組斷行：BudouX（要新增相依套件，先問）

BudouX 有繁體中文模型，會在詞組邊界插入零寬空格，效果最接近手動斷行。它是新的外部相依，照個人規範要先寫出理由、替代方案、大小、維護狀態，等使用者確認才加。

### 2.5 最後手段：動態縮小字級

做完 2.1–2.4 仍有一行只剩 1–2 個字（或只剩編號），就把這個元素的字級往下縮，每次 5%，直到孤行消失或縮到下限 80%。

```css
h1 { font-size: calc(var(--fs-h1) * var(--fit, 1)); }
h2 { font-size: calc(var(--fs-h2) * var(--fit, 1)); }
.card-title, .lesson-nav .ttl { font-size: calc(var(--fs-h3) * var(--fit, 1)); }
```

```js
const FIT = { minScale: 0.8, step: 0.05, shortChars: 2 };
const FIT_TARGETS = 'h1, h2, .card-title, .lesson-nav .ttl';

// 1–2 個字，或沒有任何文字（只有編號、符號）的行算孤行
const isShortLine = (line) => line.length <= FIT.shortChars || !/\p{L}/u.test(line);

function hasShortLine(element) {
  const lines = measureLines(element); // 見 4.2
  return lines.length > 1 && lines.some(isShortLine);
}

function fitShortText(element) {
  let scale = 1;
  element.style.setProperty('--fit', '1');
  while (hasShortLine(element) && scale - FIT.step >= FIT.minScale - 1e-6) {
    scale = Math.round((scale - FIT.step) * 100) / 100;
    element.style.setProperty('--fit', String(scale));
  }
  if (hasShortLine(element)) {
    console.warn('縮到字級下限仍有孤行，請改寫標題或調整 | 斷點：', element.textContent.trim());
  }
}

function fitAll(root = document) {
  root.querySelectorAll(FIT_TARGETS).forEach(fitShortText);
}

// 寬度、字型載入、字級設定改變時重算；用 rAF 合併同一畫格內的多次觸發
let fitFrame = 0;
const scheduleFit = () => {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => fitAll());
};
new ResizeObserver(scheduleFit).observe(document.querySelector('main'));
document.fonts.ready.then(scheduleFit);
// 換課渲染完、側欄寬度或字級設定改變後，也呼叫 scheduleFit()
```

- 下限 80%：再小會破壞標題層級（h1 縮到接近 h2）。縮到下限仍有孤行，代表標題太長或斷點放錯，回頭改 2.1 的 `|` 或改寫標題；`console.warn` 會列出是哪一個。
- 只縮有孤行的那個元素，不改全站字級；使用者自己設定的字級（`--font-scale`）照樣生效，`--fit` 是乘在上面。
- 只用在標題與卡片標題。按鈕用第 1 節第 6 條（控制在 8 字內），不靠縮字。
- 縮字不加轉場：換課或改寬度時直接套用最終字級，避免標題跳動。

實測（2026-10-02，Chromium；標題 `7-7 Headless 模式|與 worktree 平行開發`）：

| 容器寬 × 字級 | 縮字前 | 縮字後 |
|---|---|---|
| 280px × 36px | `7-7` ／ `Headless 模式` ／ `與 worktree` ／ `平行開發` | 縮到 90%：`7-7 Headless 模式` ／ `與 worktree` ／ `平行開發` |
| 200px × 24px | `7-7` ／ `Headless 模式` ／ … | 縮到 95%：`7-7 Headless 模式` ／ … |
| 343px × 24–36px | 沒有孤行 | 不縮 |
| 160px × 36px | 每行 1 個詞 | 縮到 80% 仍有孤行，`console.warn` 提示改寫 |

另一個標題 `Context Engineering|的四種策略|與取捨` 在 200px × 36px 時，原本是 `Engineerin` ／ `g`，縮到 90% 後變成完整的 `Engineering`。

## 3. 寫的時候就避免

- 標題先寫短：能刪的字先刪（「關於…的介紹」→ 直接寫主題）。
- 按鈕用動詞開頭的短詞：「看答案」「下一課」「重新作答」。
- 上一課／下一課這類卡片，方向標籤與課名分兩行排，課名自己再照第 1 節斷行。

## 4. 驗證

### 4.1 要看的寬度

375、768、1280 三種寬度，各配字級 100% 與 150%，一共 6 種組合。字級 150% 時特別看側欄：它的寬度若沒有跟著字級放大，單元標題會被擠到一個字一行（layout-geometry.md 第 3 節）。

SVG 的 `<text>` 不受這份規範的詞組斷行與縮字保護，用 layout-geometry.md 6.5 節的腳本另外檢查。

### 4.2 自動檢查（瀏覽器 console）

找出被拆開的詞、孤字、行長不平衡的短文字：

```js
const SHORT_TEXT = 'h1, h2, h3, .btn, .card-title, .lesson-nav a, .nav-link';
const SHORT_CHARS = 2;
const BALANCE_MIN = 0.4;
const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'word' });

// 依字元位置把文字分成行：top 差距超過字高一半就算新的一行
function measureLines(element) {
  const chars = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (let i = 0; i < node.length; i += 1) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getClientRects()[0];
      if (rect && node.data[i].trim()) chars.push({ ch: node.data[i], top: rect.top, height: rect.height });
    }
  }
  const lines = [];
  for (const c of chars) {
    const last = lines[lines.length - 1];
    if (!last || c.top - last.top > c.height / 2) lines.push({ top: c.top, text: c.ch });
    else last.text += c.ch;
  }
  return lines.map((l) => l.text);
}

const issues = [];
for (const element of document.querySelectorAll(SHORT_TEXT)) {
  const lines = measureLines(element);
  if (lines.length < 2) continue;
  const lengths = lines.map((l) => l.length);
  const label = element.textContent.trim().slice(0, 30);
  if (lines.some((l) => l.length <= SHORT_CHARS || !/\p{L}/u.test(l))) issues.push([label, '孤行', lines]);
  if (Math.min(...lengths) / Math.max(...lengths) < BALANCE_MIN) issues.push([label, '行長不平衡', lines]);
  for (let i = 0; i < lines.length - 1; i += 1) {
    const joint = lines[i].slice(-4) + lines[i + 1].slice(0, 4);
    const cut = lines[i].slice(-4).length;
    let pos = 0;
    for (const { segment, isWordLike } of segmenter.segment(joint)) {
      if (isWordLike && segment.length > 1 && pos < cut && pos + segment.length > cut) issues.push([label, `拆開「${segment}」`, lines]);
      pos += segment.length;
    }
  }
}
issues;
```

- 2026-10-02 在 Chromium 用 `7-7 Headless 模式與 worktree 平行開發` 測過：預設寫法會抓到孤字、行長不平衡、拆開「開發」三項；用 2.1 的寫法，在 240px 以上是 0 筆。
- 這支腳本靠瀏覽器分詞判斷「拆開」，可能誤報或漏報；結果 0 筆之後，仍要用眼睛看一次側欄、上一課／下一課與所有按鈕。
- 每個課程頁都要跑：搭配 verification.md 第 1 節的逐課迴圈。
