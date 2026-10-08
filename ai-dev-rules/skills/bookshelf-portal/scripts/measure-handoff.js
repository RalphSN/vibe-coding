/**
 * 交接量測：搭配 anim-harness.js（?start=2&f=0）使用。
 * 印出抽出後的書背位置與 3D 書脊位置，兩者應在 2px 內。
 * 書櫃上的書在交接後會恢復原位，所以書背 rect 要用「原位 + 抽出位移」換算：
 *   抽出後 top ≈ 原 top − 36 − 原高 × 0.03，left ≈ 原 left − 原寬 × 0.03，寬高 × 1.06
 */
setTimeout(() => {
  const fmt = (box) => [box.left, box.top, box.width, box.height].map(Math.round).join(',');
  const book = document.querySelector('.book.is-pulled .spine');
  const spine3d = document.querySelector('.b3-spine');
  const out = document.createElement('pre');
  out.id = 'measure';
  if (!book || !spine3d) {
    out.textContent = '找不到元素：請用 ?start=2&f=0 開啟';
  } else {
    const rest = book.getBoundingClientRect();
    const pulled = {
      left: rest.left - rest.width * 0.03,
      top: rest.top - 36 - rest.height * 0.03,
      width: rest.width * 1.06,
      height: rest.height * 1.06,
    };
    out.textContent = `pulled=${fmt(pulled)} spine3d=${fmt(spine3d.getBoundingClientRect())}`;
  }
  document.body.append(out);
}, 300);
