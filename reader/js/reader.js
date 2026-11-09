// 阅读舞台：版面计算、单页/对开、纸张翻转动画、缩放平移
import { clamp, raf } from './util.js';

const FLIP_MS = 520;
const FADE_MS = 240;
const CACHE_MAX = 8;

const div = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };

class PageArea {
  constructor() {
    this.el = div('book-area');
    this.shadow = div('book-shadow');
    this.left = div('slot slot-left');
    this.gutter = div('gutter');
    this.right = div('slot slot-right');
    this.flip = div('flip-layer');
    this.el.append(this.shadow, this.left, this.gutter, this.right, this.flip);
    this.holders = {
      left: { node: null, dispose: null, key: '' },
      right: { node: null, dispose: null, key: '' },
    };
  }
  setSize(w, h) { this.el.style.width = w + 'px'; this.el.style.height = h + 'px'; }
  slot(name) { return name === 'right' ? this.right : this.left; }
  holder(name) { return this.holders[name]; }
  setSlotRect(name, rect) {
    const el = this.slot(name);
    el.hidden = false;
    el.style.left = rect.x + 'px';
    el.style.top = rect.y + 'px';
    el.style.width = rect.w + 'px';
    el.style.height = rect.h + 'px';
  }
  clearSlot(name) {
    const h = this.holder(name);
    h.dispose?.();
    h.node = null;
    h.dispose = null;
    h.key = '';
    this.slot(name).innerHTML = '';
  }
  gutterOn(on) { this.gutter.classList.toggle('is-on', !!on); }
  dispose() {
    for (const name of ['left', 'right']) this.clearSlot(name);
    this.el.remove();
  }
}

export class Reader {
  constructor({ stage, onProgress, onToast, onRequestUI, onStateChange, onEnd, onTurned, onZone }) {
    this.stage = stage;
    this.onProgress = onProgress || (() => { });
    this.onToast = onToast || (() => { });
    this.onRequestUI = onRequestUI || (() => { });
    this.onStateChange = onStateChange || (() => { });
    this.onEnd = onEnd || (() => { });
    this.onTurned = onTurned || (() => { });
    this.onZone = onZone || (() => { });

    this.src = null;
    this.book = null;
    this.pageCount = 0;
    this.spreadIndex = 0;
    this.mode = 'rtl';
    this.layoutMode = 'spread';
    this.effect = 'flip';
    this.fit = 'page';
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.busy = false;
    this.cache = new Map();
    this.area = null;
    this.layout = null;
    this._prefetching = false;
    this._lastNav = 0;

    this._bindInput();
    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(stage);
  }

  // ---------------- 打开 / 关闭 ----------------
  async open(book, source) {
    this.close();
    this.book = book;
    this.src = source;
    this.pageCount = source.pageCount;
    this.coverAlone = source.coverAlone !== false;
    const s = book.settings || {};
    this.mode = s.mode === 'ltr' ? 'ltr' : 'rtl';
    this.layoutMode = s.layout === 'single' ? 'single' : 'spread';
    this.effect = s.effect || 'flip';
    this.fit = s.fit || 'page';
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };

    this.area = new PageArea();
    this.stage.append(this.area.el);
    this.box = await this.sampleBox();
    const start = clamp(book.progress?.page ?? 0, 0, Math.max(0, this.pageCount - 1));
    this.spreadIndex = this.spreadIndexForPage(start);
    await this.paint(this.spreadIndex);
    this._emit();
    this._schedulePrefetch();
  }

  close() {
    this.cache.forEach((v) => v.dispose?.());
    this.cache.clear();
    this.area?.dispose();
    this.area = null;
    this.box = null;
    this.layout = null;
    this.src?.close?.();
    this.src = null;
    this.book = null;
    this.pageCount = 0;
  }

  // ---------------- 索引 ----------------
  get spreadTotal() {
    if (this.layoutMode === 'single') return this.pageCount;
    if (this.pageCount <= 1) return Math.max(0, this.pageCount);
    return this.coverAlone
      ? 1 + Math.ceil((this.pageCount - 1) / 2)
      : Math.ceil(this.pageCount / 2);
  }

  pagesFor(spreadIndex) {
    if (this.pageCount === 0) return [];
    if (this.layoutMode === 'single') return [{ index: clamp(spreadIndex, 0, this.pageCount - 1), slot: 'center' }];
    if (this.coverAlone && spreadIndex === 0) return [{ index: 0, slot: 'center' }];
    const base = this.coverAlone ? 1 + (spreadIndex - 1) * 2 : spreadIndex * 2;
    const items = [];
    if (base < this.pageCount) items.push({ index: base, slot: this.mode === 'rtl' ? 'right' : 'left' });
    if (base + 1 < this.pageCount) items.push({ index: base + 1, slot: this.mode === 'rtl' ? 'left' : 'right' });
    if (!items.length) items.push({ index: this.pageCount - 1, slot: 'center' });
    return items;
  }

  spreadIndexForPage(page) {
    if (this.layoutMode === 'single') return clamp(page, 0, Math.max(0, this.pageCount - 1));
    if (!this.coverAlone) return Math.floor(page / 2);
    if (page <= 0) return 0;
    return 1 + Math.floor((page - 1) / 2);
  }

  pageRangeOf(spreadIndex) {
    const idx = this.pagesFor(spreadIndex).map((i) => i.index).filter((i) => i != null);
    if (!idx.length) return { from: 0, to: 0 };
    return { from: Math.min(...idx), to: Math.max(...idx) };
  }

  get currentPage() { return this.pageRangeOf(this.spreadIndex).from; }

  getState() {
    return {
      page: this.currentPage,
      pageCount: this.pageCount,
      spreadIndex: this.spreadIndex,
      spreadTotal: this.spreadTotal,
      mode: this.mode,
      layout: this.layoutMode,
      effect: this.effect,
      fit: this.fit,
      zoom: this.zoom,
      title: this.book?.title || '',
    };
  }

  _emit() { this.onStateChange(this.getState()); }

  // ---------------- 版面 ----------------
  available() {
    const w = this.stage.clientWidth || window.innerWidth;
    const h = this.stage.clientHeight || window.innerHeight;
    const padX = w < 760 ? 18 : 52;
    const padY = h < 620 ? 24 : 58;
    return { w: Math.max(120, w - padX * 2), h: Math.max(120, h - padY * 2) };
  }

  async computeLayout(spreadIndex) {
    const base = this.pagesFor(spreadIndex);
    if (!base.length) return { items: [], width: 1, height: 1, single: true, spineX: 0 };
    const box = this.box || { w: 1000, h: 1414 };
    const avail = this.available();
    const single = base.length === 1;

    // 整本书共用一个页框：这样每一屏的几何完全一致，纸张才能严丝合缝地翻过去
    const natW = single ? box.w : box.w * 2;
    const natH = box.h;
    let s = Math.min(avail.w / natW, avail.h / natH);
    if (this.fit === 'height') s = Math.min(avail.h / natH, avail.w / natW);
    else if (this.fit === 'width') s = Math.min(avail.w / natW, avail.h / natH);
    s = Math.max(s, 0.02) * this.zoom;

    const W = Math.round(box.w * s);
    const H = Math.round(box.h * s);

    if (single) {
      return {
        items: [{ index: base[0].index, slot: 'center', rect: { x: 0, y: 0, w: W, h: H } }],
        width: W, height: H, single: true, spineX: 0,
      };
    }

    const items = [];
    if (base.some((b) => b.slot === 'left')) {
      items.push({ index: base.find((b) => b.slot === 'left').index, slot: 'left', rect: { x: 0, y: 0, w: W, h: H } });
    }
    if (base.some((b) => b.slot === 'right')) {
      items.push({ index: base.find((b) => b.slot === 'right').index, slot: 'right', rect: { x: W, y: 0, w: W, h: H } });
    }
    return { items, width: W * 2, height: H, single: false, spineX: W };
  }

  async sampleBox() {
    const n = this.pageCount;
    const picks = new Set([0, n - 1]);
    const step = Math.max(1, Math.floor(n / 12));
    for (let i = 0; i < n; i += step) picks.add(i);
    const sizes = [];
    for (const i of picks) {
      try {
        const s = await this.src.pageSize(i);
        if (s && s.width > 20 && s.height > 20) sizes.push(s);
      } catch { }
    }
    if (!sizes.length) return { w: 1000, h: 1414 };
    const median = (arr) => {
      const a = arr.slice().sort((x, y) => x - y);
      return a[Math.min(a.length - 1, Math.floor(a.length * 0.7))];
    };
    const w = median(sizes.map((s) => s.width));
    const h = median(sizes.map((s) => s.height));
    return { w, h };
  }

  async paint(spreadIndex, { reuse = true } = {}) {
    const layout = await this.computeLayout(spreadIndex);
    const area = this.area;
    if (!area) return;
    area.setSize(layout.width, layout.height);
    const want = { left: null, right: null };
    for (const it of layout.items) want[it.slot === 'center' ? 'left' : it.slot] = it;

    for (const name of ['left', 'right']) {
      const it = want[name];
      const holder = area.holder(name);
      if (!it) {
        area.clearSlot(name);
        area.slot(name).hidden = true;
        continue;
      }
      area.setSlotRect(name, it.rect);
      const key = this._key(it.index, it.rect);
      if (reuse && holder.key === key && holder.node) continue;
      const fresh = await this.getPageNode(it.index, it.rect.w, it.rect.h);
      area.clearSlot(name);
      area.slot(name).append(fresh.node);
      holder.node = fresh.node;
      holder.dispose = fresh.dispose;
      holder.key = key;
    }
    area.gutterOn(!layout.single && layout.items.length === 2);
    area.gutter.style.left = (layout.spineX || 0) + 'px';
    this.applyTransform();
    this.layout = layout;
    this.spreadIndex = spreadIndex;
    this.onProgress(this.currentPage, this.pageCount);
    this._emit();
  }

  applyTransform(area = this.area) {
    if (!area) return;
    const z = this.zoom;
    area.el.style.transform = `translate(calc(-50% + ${this.pan.x}px), calc(-50% + ${this.pan.y}px)) scale(${z})`;
    if (area === this.area) this.stage.classList.toggle('is-zoomed', z > 1.001);
  }

  _key(index, rect) { return `${index}@${rect.w}x${rect.h}`; }
  _dpr() { return Math.min(window.devicePixelRatio || 1, 2); }

  async getPageNode(index, w, h) {
    if (index == null) {
      const blank = div('page is-empty');
      return { node: blank, dispose: () => blank.remove(), key: 'blank' };
    }
    const key = this._key(index, { w, h });
    if (this.cache.has(key)) {
      const hit = this.cache.get(key);
      this.cache.delete(key);
      return hit;
    }
    const res = await this.src.renderPage(index, { width: w, height: h, dpr: this._dpr() });
    const page = div('page');
    page.append(res.node);
    return { node: page, dispose: () => { res.dispose?.(); page.remove(); }, key };
  }

  _cache(entry) {
    if (!entry || !entry.key || entry.key === 'blank') return;
    if (this.cache.has(entry.key)) { entry.dispose?.(); return; }
    this.cache.set(entry.key, entry);
    while (this.cache.size > CACHE_MAX) {
      const k = this.cache.keys().next().value;
      this.cache.get(k)?.dispose?.();
      this.cache.delete(k);
    }
  }

  async prefetch(spreadIndex) {
    if (!this.src) return;
    if (spreadIndex < 0 || spreadIndex >= this.spreadTotal) return;
    try {
      const layout = await this.computeLayout(spreadIndex);
      for (const it of layout.items) {
        if (it.index == null) continue;
        const key = this._key(it.index, it.rect);
        if (this.cache.has(key)) continue;
        const node = await this.getPageNode(it.index, it.rect.w, it.rect.h);
        this._cache(node);
      }
    } catch { }
  }

  _schedulePrefetch() {
    if (this._prefetching) return;
    const run = async () => {
      this._prefetching = true;
      try {
        await new Promise((r) => setTimeout(r, 280));
        await this.prefetch(this.spreadIndex + 1);
        await this.prefetch(this.spreadIndex + 2);
        await this.prefetch(this.spreadIndex - 1);
      } finally { this._prefetching = false; }
    };
    setTimeout(run, 0);
  }

  // ---------------- 翻页 ----------------
  async turn(dir) {
    if (this.busy || !this.src) return false;
    const target = this.spreadIndex + dir;
    if (target < 0 || target >= this.spreadTotal) {
      if (dir > 0) this.onEnd();
      return false;
    }
    this.busy = true;
    try {
      const fromLay = this.layout;
      const toLay = await this.computeLayout(target);
      let flipped = false;
      if (this.zoom <= 1.001 && this.effect === 'flip' && this._canFlip(fromLay, toLay)) {
        flipped = await this._flip(dir, fromLay, toLay);
      }
      this.lastTransition = flipped ? 'flip' : 'fade';
      this.stats = this.stats || { flip: 0, fade: 0 };
      this.stats[flipped ? 'flip' : 'fade']++;
      if (!flipped) await this._transit(target, toLay, dir);
      this.spreadIndex = target;
      this.onProgress(this.currentPage, this.pageCount);
      this._emit();
      this.onTurned();
      this._schedulePrefetch();
      return true;
    } finally {
      this.busy = false;
      this._drainPending();
    }
  }

  _drainPending() {
    if (this._pendingPage != null) {
      const p = this._pendingPage;
      this._pendingPage = null;
      this.goPage(p);
      return;
    }
    if (this._resizeAfter) {
      this._resizeAfter = false;
      this._onResize();
    }
  }

  _rectEq(a, b) {
    if (!a || !b) return !a && !b;
    return Math.abs(a.x - b.x) < 1.2 && Math.abs(a.y - b.y) < 1.2 &&
      Math.abs(a.w - b.w) < 1.2 && Math.abs(a.h - b.h) < 1.2;
  }

  _canFlip(a, b) {
    if (!a || !b) return false;
    if (a.single !== b.single) return false;
    if (Math.abs(a.width - b.width) > 1.2 || Math.abs(a.height - b.height) > 1.2) return false;
    if (a.single) return this._rectEq(a.items[0]?.rect, b.items[0]?.rect);
    const pa = (s) => a.items.find((i) => i.slot === s)?.rect;
    const pb = (s) => b.items.find((i) => i.slot === s)?.rect;
    if (!this._rectEq(pa('left'), pb('left'))) return false;
    if (!this._rectEq(pa('right'), pb('right'))) return false;
    // 纸张翻过去时背面对齐需要两侧等宽
    const la = pa('left'), ra = pa('right');
    if (la && ra && Math.abs(la.w - ra.w) > 1.2) return false;
    return true;
  }

  _newSheet(rect, origin) {
    const sheet = div('sheet');
    sheet.style.cssText = `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;transform-origin:${origin};`;
    const front = div('face front');
    const back = div('face back');
    const curl = div('curl');
    sheet.append(front, back, curl);
    this.area.flip.append(sheet);
    curl.animate([{ opacity: 0 }, { opacity: .9, offset: .45 }, { opacity: 0 }], {
      duration: this.flipMs || FLIP_MS, easing: 'ease-in-out',
    });
    return { sheet, front, back };
  }

  _animateSheet(sheet, fromT, toT) {
    const ms = this.flipMs || FLIP_MS;
    sheet.style.transform = fromT;
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        sheet.classList.add('turning');
        const anim = sheet.animate([{ transform: fromT }, { transform: toT }], {
          duration: ms, easing: 'cubic-bezier(.32,.06,.24,1)', fill: 'forwards',
        });
        anim.finished.then(() => resolve()).catch(() => resolve());
      });
    });
  }

  async _flip(dir, fromLay, toLay) {
    const LTR = this.mode === 'ltr';
    const area = this.area;
    const angle = LTR ? -180 : 180;

    if (fromLay.single) {
      const rect = fromLay.items[0].rect;
      const targetIndex = toLay.items[0]?.index;
      const holder = area.holder('left');
      const slot = area.slot('left');
      const oldDispose = holder.dispose;
      const { sheet, front, back } = this._newSheet(rect, LTR ? 'left center' : 'right center');
      let incoming = null;

      if (dir > 0) {
        if (holder.node) { holder.node.remove(); front.append(holder.node); }
        incoming = await this.getPageNode(targetIndex, rect.w, rect.h);
        slot.innerHTML = '';
        slot.append(incoming.node);
        holder.node = incoming.node;
        holder.dispose = incoming.dispose;
        holder.key = this._key(targetIndex, rect);
        back.style.background = '#faf7f2';
      } else {
        incoming = await this.getPageNode(targetIndex, rect.w, rect.h);
        front.append(incoming.node);
        if (holder.node) { holder.node.remove(); back.append(holder.node); }
      }

      await this._animateSheet(sheet, dir > 0 ? 'rotateY(0deg)' : `rotateY(${angle}deg)`,
        dir > 0 ? `rotateY(${angle}deg)` : 'rotateY(0deg)');

      if (dir < 0) {
        front.firstChild?.remove();
        slot.innerHTML = '';
        slot.append(incoming.node);
        holder.node = incoming.node;
        holder.dispose = incoming.dispose;
        holder.key = this._key(targetIndex, rect);
      }
      oldDispose?.();
      sheet.remove();
      this.layout = toLay;
      return true;
    }

    // 双页：绕书脊翻
    const turning = LTR ? 'right' : 'left';
    const other = LTR ? 'left' : 'right';
    const rectT = fromLay.items.find((i) => i.slot === turning)?.rect;
    if (!rectT) return false;
    const rectO = fromLay.items.find((i) => i.slot === other)?.rect || rectT;

    const turnHolder = area.holder(turning);
    const otherHolder = area.holder(other);
    const oldTurnNode = turnHolder.node;
    const oldTurnDispose = turnHolder.dispose;
    const oldOtherNode = otherHolder.node;
    const oldOtherDispose = otherHolder.dispose;

    const { sheet, front, back } = this._newSheet(rectT, LTR ? 'left center' : 'right center');
    const newTurnIdx = toLay.items.find((i) => i.slot === turning)?.index;
    const newOtherIdx = toLay.items.find((i) => i.slot === other)?.index;

    let incoming = null;
    let backEntry = null;

    if (dir > 0) {
      // 当前页抬起来，底下换成新的这一侧
      if (oldTurnNode) { oldTurnNode.remove(); front.append(oldTurnNode); }
      incoming = await this.getPageNode(newTurnIdx, rectT.w, rectT.h);
      area.slot(turning).innerHTML = '';
      area.slot(turning).append(incoming.node);
      turnHolder.node = incoming.node;
      turnHolder.dispose = incoming.dispose;
      turnHolder.key = this._key(newTurnIdx, rectT);

      backEntry = await this.getPageNode(newOtherIdx, rectT.w, rectT.h);
      back.append(backEntry.node);
    } else {
      // 上一页从另一侧翻回来
      incoming = await this.getPageNode(newTurnIdx, rectT.w, rectT.h);
      front.append(incoming.node);

      const fresh = await this.getPageNode(newOtherIdx, rectO.w, rectO.h);
      area.slot(other).innerHTML = '';
      area.slot(other).append(fresh.node);
      otherHolder.node = fresh.node;
      otherHolder.dispose = fresh.dispose;
      otherHolder.key = this._key(newOtherIdx, rectO);

      if (oldOtherNode) { oldOtherNode.remove(); back.append(oldOtherNode); }
    }

    await this._animateSheet(sheet, dir > 0 ? 'rotateY(0deg)' : `rotateY(${angle}deg)`,
      dir > 0 ? `rotateY(${angle}deg)` : 'rotateY(0deg)');

    if (dir > 0) {
      back.firstChild?.remove();
      area.slot(other).innerHTML = '';
      area.slot(other).append(backEntry.node);
      otherHolder.node = backEntry.node;
      otherHolder.dispose = backEntry.dispose;
      otherHolder.key = this._key(newOtherIdx, rectT);
      oldOtherDispose?.();
    } else {
      front.firstChild?.remove();
      area.slot(turning).innerHTML = '';
      area.slot(turning).append(incoming.node);
      turnHolder.node = incoming.node;
      turnHolder.dispose = incoming.dispose;
      turnHolder.key = this._key(newTurnIdx, rectT);
    }

    oldTurnDispose?.();
    oldOtherDispose?.();
    sheet.remove();
    area.gutterOn(true);
    this.layout = toLay;
    return true;
  }

  async _transit(target, layout, dir = 1) {
    const area = this.area;
    const ghost = new PageArea();
    this.stage.append(ghost.el);
    ghost.el.style.opacity = '0';
    ghost.el.style.pointerEvents = 'none';
    await this._paintArea(ghost, layout);
    this.applyTransform(ghost);

    const slide = this.effect === 'slide';
    const dur = this.effect === 'none' ? 120 : slide ? 300 : FADE_MS;
    const shiftIn = dir > 0 ? '5%' : '-5%';
    const shiftOut = dir > 0 ? '-4%' : '4%';
    const inFrames = slide
      ? [{ opacity: 0, translate: `${shiftIn} 0` }, { opacity: 1, translate: '0 0' }]
      : [{ opacity: 0 }, { opacity: 1 }];
    const outFrames = slide
      ? [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `${shiftOut} 0` }]
      : [{ opacity: 1 }, { opacity: 0 }];

    const a = ghost.el.animate(inFrames, { duration: dur, easing: 'cubic-bezier(.25,.6,.3,1)', fill: 'forwards' });
    area.el.animate(outFrames, { duration: dur, easing: 'cubic-bezier(.25,.6,.3,1)', fill: 'forwards' });
    await a.finished.catch(() => { });
    area.dispose();
    this.area = ghost;
    ghost.el.style.opacity = '1';
    ghost.el.style.pointerEvents = '';
    ghost.el.style.translate = '0 0';
    this.applyTransform(ghost);
    this.layout = layout;
    this.spreadIndex = target;
  }

  async _paintArea(area, layout) {
    area.setSize(layout.width, layout.height);
    const want = { left: null, right: null };
    for (const it of layout.items) want[it.slot === 'center' ? 'left' : it.slot] = it;
    for (const name of ['left', 'right']) {
      const it = want[name];
      area.clearSlot(name);
      if (!it) { area.slot(name).hidden = true; continue; }
      area.setSlotRect(name, it.rect);
      const fresh = await this.getPageNode(it.index, it.rect.w, it.rect.h);
      area.slot(name).append(fresh.node);
      const h = area.holder(name);
      h.node = fresh.node;
      h.dispose = fresh.dispose;
      h.key = this._key(it.index, it.rect);
    }
    area.gutterOn(layout.items.length === 2);
    area.gutter.style.left = (layout.spineX || 0) + 'px';
  }

  async goPage(page, { animate = false } = {}) {
    if (!this.src) return;
    page = clamp(page, 0, this.pageCount - 1);
    if (this.busy) { this._pendingPage = page; return; }
    const target = this.spreadIndexForPage(page);
    if (target === this.spreadIndex) { this._emit(); return; }
    if (!animate || Math.abs(target - this.spreadIndex) > 1) {
      this.busy = true;
      try {
        await this.paint(target);
        this._schedulePrefetch();
      } finally {
        this.busy = false;
        this._drainPending();
      }
    } else {
      await this.turn(target > this.spreadIndex ? 1 : -1);
    }
  }

  next() { return this.turn(1); }
  prev() { return this.turn(-1); }

  // ---------------- 设置 ----------------
  async setMode(mode) {
    if (this.busy) return;
    const next = mode === 'ltr' ? 'ltr' : 'rtl';
    if (next === this.mode) return;
    this.mode = next;
    this.book.settings = { ...(this.book.settings || {}), mode: next };
    await this.paint(this.spreadIndex);
    this._schedulePrefetch();
  }

  async setLayout(mode) {
    if (this.busy) return;
    const next = mode === 'spread' ? 'spread' : 'single';
    if (next === this.layoutMode) return;
    const page = this.currentPage;
    this.layoutMode = next;
    this.book.settings = { ...(this.book.settings || {}), layout: next };
    this.spreadIndex = this.spreadIndexForPage(page);
    await this.paint(this.spreadIndex);
    this._schedulePrefetch();
  }

  setEffect(effect) {
    this.effect = ['flip', 'fade', 'slide', 'none'].includes(effect) ? effect : 'flip';
    this.book.settings = { ...(this.book.settings || {}), effect: this.effect };
  }

  async setFit(fit) {
    if (this.busy) return;
    this.fit = ['page', 'height', 'width'].includes(fit) ? fit : 'page';
    this.book.settings = { ...(this.book.settings || {}), fit: this.fit };
    await this.paint(this.spreadIndex);
  }

  setZoom(z) {
    this.zoom = clamp(z, 1, 4);
    if (this.zoom <= 1.001) { this.zoom = 1; this.pan = { x: 0, y: 0 }; }
    this.applyTransform();
    this._emit();
  }

  zoomBy(f) { this.setZoom(this.zoom * f); }

  panBy(dx, dy) {
    if (this.zoom <= 1.001) return;
    const maxX = (this.stage.clientWidth * (this.zoom - 1)) / 2 + 60;
    const maxY = (this.stage.clientHeight * (this.zoom - 1)) / 2 + 60;
    this.pan.x = clamp(this.pan.x + dx, -maxX, maxX);
    this.pan.y = clamp(this.pan.y + dy, -maxY, maxY);
    this.applyTransform();
  }

  // ---------------- 输入 ----------------
  _bindInput() {
    const stage = this.stage;
    let down = null;
    let pinch = null;
    let moved = false;

    const zoneAt = (clientX) => {
      const rect = stage.getBoundingClientRect();
      const fx = (clientX - rect.left) / Math.max(1, rect.width);
      return fx < 0.3 ? 'left' : fx > 0.7 ? 'right' : 'mid';
    };

    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, panX: this.pan.x, panY: this.pan.y };
      moved = false;
      if (this.zoom > 1.001) {
        stage.classList.add('is-panning');
        try { stage.setPointerCapture(e.pointerId); } catch { }
      }
    });

    stage.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      if (this.zoom > 1.001) {
        this.pan.x = down.panX + dx;
        this.pan.y = down.panY + dy;
        this.applyTransform();
      }
    });

    const finish = (e) => {
      if (!down) return;
      stage.classList.remove('is-panning');
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      const dist = Math.hypot(dx, dy);
      down = null;

      if (this.zoom > 1.001) {
        if (dist > 4) {
          const maxX = (this.stage.clientWidth * (this.zoom - 1)) / 2 + 60;
          const maxY = (this.stage.clientHeight * (this.zoom - 1)) / 2 + 60;
          this.pan.x = clamp(this.pan.x, -maxX, maxX);
          this.pan.y = clamp(this.pan.y, -maxY, maxY);
          this.applyTransform();
        }
        return;
      }
      if (dist > 46 && Math.abs(dx) > Math.abs(dy)) {
        const LTR = this.mode === 'ltr';
        const forward = LTR ? dx < 0 : dx > 0;
        forward ? this.next() : this.prev();
        return;
      }
      if (dist < 6 && !moved) {
        const zone = zoneAt(e.clientX);
        if (zone === 'mid') {
          clearTimeout(this._midTimer);
          this._midTimer = setTimeout(() => this.onZone('mid'), 230);
        } else {
          this.onZone(zone);
        }
      }
    };
    stage.addEventListener('pointerup', finish);
    stage.addEventListener('pointercancel', () => { down = null; stage.classList.remove('is-panning'); });

    stage.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (!pinch) { pinch = { d, z: this.zoom }; return; }
      this.setZoom(pinch.z * (d / pinch.d));
    }, { passive: false });
    stage.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });

    stage.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
        return;
      }
      if (this.zoom > 1.001) {
        e.preventDefault();
        this.panBy(-e.deltaX, -e.deltaY);
        return;
      }
      if (Math.abs(e.deltaY) < 6 && Math.abs(e.deltaX) < 6) return;
      e.preventDefault();
      const now = performance.now();
      if (now - this._lastNav < 340) return;
      this._lastNav = now;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const LTR = this.mode === 'ltr';
      const forward = LTR ? delta > 0 : delta < 0;
      forward ? this.next() : this.prev();
    }, { passive: false });

    stage.addEventListener('dblclick', (e) => {
      if (e.target.closest('.ui-layer')) return;
      if (this._midTimer) { clearTimeout(this._midTimer); this._midTimer = null; }
      this.setZoom(this.zoom > 1.001 ? 1 : 2);
    });
  }

  _onResize() {
    if (!this.src || !this.area) return;
    if (this.busy) { this._resizeAfter = true; return; }
    clearTimeout(this._rz);
    this._rz = setTimeout(() => {
      if (!this.src) return;
      if (this.busy) { this._resizeAfter = true; return; }
      const keep = this.currentPage;
      this.paint(this.spreadIndexForPage(keep)).then(() => this._schedulePrefetch());
    }, 220);
  }

  destroy() {
    this._ro?.disconnect();
    this.close();
  }
}
