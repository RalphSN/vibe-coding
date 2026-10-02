/**
 * 書櫃版面檢查：在瀏覽器 console（或 javascript_tool）貼上後執行 bookshelfAudit()。
 * 每種寬度執行一次，回傳 "寬度 OK | 書名字級" 或問題清單。
 */
window.bookshelfAudit = () => {
  if (typeof fitSpineTitles === 'function') fitSpineTitles();
  const issues = [];
  const vw = document.documentElement.clientWidth;

  if (document.documentElement.scrollWidth > vw) issues.push('出現水平捲軸');
  document.querySelectorAll('body *').forEach((el) => {
    const box = el.getBoundingClientRect();
    if (box.width && (box.right > vw + 0.5 || box.left < -0.5)) issues.push(`溢出畫面：${el.tagName}.${el.className}`);
  });

  const sizes = [];
  document.querySelectorAll('.spine-label').forEach((label) => {
    const title = label.querySelector('.spine-title');
    sizes.push(getComputedStyle(title).fontSize);
    if (title.scrollHeight > label.clientHeight - 20 + 1) issues.push(`書名被截斷：${title.textContent}`);
  });

  const brand = document.querySelector('.brand').getBoundingClientRect();
  const themeSwitch = document.querySelector('.theme-switch').getBoundingClientRect();
  if (brand.right > themeSwitch.left - 8 || brand.height > 30) issues.push('頂部列擠壓或換行');

  const board = document.querySelector('.board').getBoundingClientRect();
  document.querySelectorAll('.book').forEach((book) => {
    const box = book.getBoundingClientRect();
    if (box.bottom < board.top || box.bottom > board.top + 4) issues.push(`書沒站在層板上：${book.dataset.id}`);
  });
  const bookend = document.querySelector('.bookend');
  if (bookend && Math.abs(bookend.getBoundingClientRect().bottom - board.top) > 1) issues.push('書擋沒站在層板上');

  const lastItem = document.querySelector('.books li:last-child').getBoundingClientRect();
  if (lastItem.right > document.querySelector('.bookcase').getBoundingClientRect().right) issues.push('書超出書櫃，書太多要換行或縮小');

  document.querySelectorAll('.theme-switch button').forEach((btn) => {
    const box = btn.getBoundingClientRect();
    if (box.width < 44 || box.height < 32) issues.push('主題按鈕太小');
  });

  return `${vw} ${issues.length ? issues.join('；') : 'OK'} | 書名 ${sizes.join('/')}`;
};
