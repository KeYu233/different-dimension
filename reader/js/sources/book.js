// 静态书源：每一页就是仓库里的一张 WebP，清单里带着每页宽高。
// 所以 pageSize() 不用真的把图下载下来 —— 版面计算（共用页框）立刻就能完成，
// 只有真正要显示的那几页才会发请求。
import { Source } from './base.js';

const pad = (n) => String(n + 1).padStart(4, '0');

export class BookSource extends Source {
  type = 'comic';

  /**
   * @param entry  library.json 里的一本书：{ title, base, cover, pages:[[w,h]…], pageCount }
   * @param base   这本书目录的绝对 URL（以 / 结尾）
   */
  constructor({ entry, base, title }) {
    super();
    this.entry = entry || {};
    this.base = base;
    this.title = title || this.entry.title || '';
    this.pageCount = this.entry.pageCount || (this.entry.pages || []).length;
    this.coverAlone = true;              // 封面单独一屏，之后两页一组，和纸质书一致
    this.toc = this.entry.toc || [];
    this.meta = { author: this.entry.author || '' };
  }

  async init() { return this; }

  pageUrl(i) { return `${this.base}pages/${pad(i)}.webp`; }
  thumbUrl(i) { return `${this.base}thumbs/${pad(i)}.webp`; }

  async pageSize(i) {
    const p = this.entry.pages && this.entry.pages[i];
    if (p && p[0] > 20 && p[1] > 20) return { width: p[0], height: p[1] };
    // 清单缺尺寸时兜底，量一次真图
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 1000, height: img.naturalHeight || 1400 });
      img.onerror = () => resolve({ width: 1000, height: 1400 });
      img.src = this.pageUrl(i);
    });
  }

  async renderPage(i, box) {
    const img = document.createElement('img');
    img.decoding = 'async';
    img.src = this.pageUrl(i);
    img.alt = `第 ${i + 1} 页`;
    img.draggable = false;
    img.style.width = box.width + 'px';
    img.style.height = box.height + 'px';
    img.style.objectFit = 'contain';
    // 提前解出，避免翻页那一瞬闪白
    try { await img.decode(); } catch { }
    return { node: img, dispose: () => { } };
  }

  async thumb(i) {
    if (i < 0 || i >= this.pageCount) return null;
    return this.thumbUrl(i);
  }

  async cover() {
    return this.entry.cover ? this.base + 'cover.webp' : this.thumbUrl(0);
  }

  close() { }
}
