// 各类书源：PDF / 图片（文件夹、CBZ、ZIP）/ EPUB
// 统一接口：pageCount、pageSize(i)、renderPage(i, box)、thumb(i, w)、toc

export class Source {
  type = 'base';
  title = '';
  pageCount = 0;
  toc = [];
  meta = {};
  coverAlone = true;

  async init() { }
  async pageSize() { return { width: 1000, height: 1400 }; }
  async renderPage(i, box) { throw new Error('not implemented'); }
  async thumb() { return null; }
  close() { }
}

export function makePlaceholder(text, box) {
  const d = document.createElement('div');
  d.className = 'page-fallback';
  d.textContent = text;
  d.style.width = box.width + 'px';
  d.style.height = box.height + 'px';
  return d;
}
