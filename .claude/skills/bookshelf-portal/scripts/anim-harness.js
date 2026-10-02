/**
 * 開書動畫的停格測試。無頭瀏覽器與被隱藏的預覽面板裡，動畫時間軸不會前進，
 * 所以改成攔截 animate()：序號小於 start 的動畫直接跑完，之後的停在 f 指定的進度。
 *
 * 參數（網址 query）：
 *   book=<id>   要打開哪本書，預設第一本
 *   start=<n>   從第 n 次 animate() 開始停格（序號見 verification.md 第 3 節）
 *   f=<0-1>     停在該段動畫的哪個進度
 *   noclick     不點書，只看書櫃
 *   inspect     模擬游標停在該書上（書抬起、說明欄展開）
 */
const params = new URLSearchParams(location.search);
const stopFrom = Number(params.get('start') || 99);
const fraction = Number(params.get('f') || 0);
const firstBook = document.querySelector('.book');
const bookId = params.get('book') || (firstBook && firstBook.dataset.id);
const targetBook = document.querySelector(`.book[data-id="${bookId}"]`);

const originalAnimate = Element.prototype.animate;
let callIndex = 0;
Element.prototype.animate = function patchedAnimate(keyframes, options) {
  callIndex += 1;
  const animation = originalAnimate.call(this, keyframes, options);
  if (callIndex < stopFrom) {
    animation.finish();
  } else {
    animation.pause();
    animation.currentTime = (options.duration + (options.delay || 0)) * fraction;
  }
  return animation;
};

if (params.has('inspect') && targetBook) {
  targetBook.style.transform = 'translateY(-12px)';
  targetBook.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}
if (!params.has('noclick') && targetBook) targetBook.click();
