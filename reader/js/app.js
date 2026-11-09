// 书页 Leaf · 博客静态书架
//
// 和本地版 Reader（D:\blog\Reader）的关系：
//   - 阅读器本体（reader.js）、样式、IndexedDB 都是同一份；
//   - 区别是没有本机服务：书架来自 data/library.json，每页是仓库里的一张 WebP，
//     只有正要显示的那几页才会发请求；
//   - 进度 / 书签 / 阅读方向存在访客自己的浏览器里，不上传。
import { $, $$, el, clamp, debounce } from './util.js';
import * as db from './db.js';
import { Reader } from './reader.js';
import { BookSource } from './sources/book.js';

const S = {
  books: [],
  settings: { mode: 'rtl', layout: 'spread', effect: 'flip', fit: 'page' },
  sort: 'recent',
  filter: '',
  current: null,
  reader: null,
  source: null,
  loadingStack: 0,
  manifest: null,
};

window.__S = S;

const abs = (rel) => new URL(rel, document.baseURI).href;

// ============================ 启动 ============================
async function boot() {
  try {
    S.manifest = await fetchManifest();
  } catch (e) {
    fatal(`书架清单没读出来（${e.message}）。`);
    return;
  }

  try { S.settings = { ...S.settings, ...(await db.getSetting('reading', {})) }; } catch { }
  await loadShelf();
  bindGlobal();
  renderShelf();
  document.body.classList.add('is-ready');
  openFromQuery();
}

async function fetchManifest() {
  const res = await fetch('data/library.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data || !Array.isArray(data.books) || !data.books.length) throw new Error('清单里没有书');
  return data;
}

/** 书架 = 清单（唯一真相）+ 浏览器里存的进度 */
async function loadShelf() {
  let saved = [];
  try { saved = await db.listBooks(); } catch { }
  const old = new Map(saved.map((b) => [b.id, b]));

  S.books = S.manifest.books.map((entry, order) => {
    const prev = old.get(entry.id) || {};
    return {
      id: entry.id,
      title: entry.title || entry.id,
      author: entry.author || '',
      mark: entry.mark || '',
      order,
      pageCount: entry.pageCount,
      cover: entry.cover ? abs(entry.cover) : null,
      mode: entry.mode || 'rtl',
      progress: prev.progress || { page: 0 },
      lastReadAt: prev.lastReadAt || 0,
      settings: prev.settings || {},
      bookmarks: prev.bookmarks || [],
    };
  });
}

function fatal(msg) {
  document.body.classList.add('is-ready');
  const box = el('div', { class: 'fatal' },
    el('h1', { text: '打不开书架' }),
    el('p', { text: msg }),
    el('p', {}, el('a', { href: '../', text: '← 回博客' })),
  );
  document.body.append(box);
}

/** 从博客链过来可以直接开某本书：?book=mhgt-02&page=57 */
function openFromQuery() {
  const q = new URLSearchParams(location.search);
  const id = q.get('book');
  if (!id) return;
  const book = S.books.find((b) => b.id === id);
  if (!book) return;
  const page = Number(q.get('page'));
  if (Number.isFinite(page) && page > 0) {
    book.progress = { page: clamp(Math.round(page) - 1, 0, Math.max(0, book.pageCount - 1)) };
  }
  openBook(book);
}

// ============================ 书架 ============================
function sortedBooks() {
  let list = S.books.slice();
  if (S.filter.trim()) {
    const q = S.filter.trim().toLowerCase();
    list = list.filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(q));
  }
  const bySort = {
    recent: (a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0) || a.order - b.order,
    added: (a, b) => a.order - b.order,
    title: (a, b) => (a.title || '').localeCompare(b.title || '', 'zh-Hans-CN', { numeric: true }),
  };
  return list.sort(bySort[S.sort] || bySort.recent);
}

function renderShelf() {
  const shelf = $('#shelf');
  const wrap = $('#shelf-wrap');
  const list = sortedBooks();
  $('#shelf-count').textContent = S.books.length ? `${S.books.length} 本` : '';
  wrap.hidden = list.length === 0;
  shelf.innerHTML = '';

  if (!list.length) {
    shelf.append(el('div', { class: 'shelf-empty', text: '没有匹配的书。' }));
    return;
  }

  for (const b of list) {
    const read = b.progress?.page || 0;
    const pct = b.pageCount ? Math.min(100, ((read + 1) / b.pageCount) * 100) : 0;
    const cover = b.cover
      ? el('img', { src: b.cover, alt: b.title, loading: 'lazy', decoding: 'async' })
      : el('div', { class: 'placeholder', html: '<svg class="ic"><use href="#i-book"/></svg>' });

    shelf.append(el('article', {
      class: 'card',
      tabindex: '0',
      role: 'link',
      'aria-label': b.title,
      onclick: () => openBook(b),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBook(b); }
      },
    },
      el('div', { class: 'card-cover' },
        cover,
        b.mark ? el('span', { class: 'card-badge', text: b.mark }) : null,
        pct > 1 ? el('div', { class: 'card-tools' },
          el('button', {
            title: '清除这本的阅读记录',
            onclick: (e) => { e.stopPropagation(); confirmReset(b); },
            html: '<svg class="ic"><use href="#i-rotate"/></svg>',
          }),
        ) : null,
        el('div', { class: 'card-progress' }, el('i', { style: { width: pct + '%' } })),
      ),
      el('div', { class: 'card-meta' },
        el('div', { class: 'card-title', text: b.title }),
        el('div', { class: 'card-sub' },
          el('span', { text: b.author || b.pageCount + ' 页' }),
          el('span', { class: 'dot' }),
          el('span', { text: pct >= 100 ? '已读完' : pct > 1 ? `${Math.round(pct)}%` : '未开始' }),
        ),
      ),
    ));
  }
}

function confirmReset(book) {
  openModal({
    title: '清除阅读记录',
    body: el('p', { text: `「${book.title}」的进度、书签和版式设置会清掉。书本身不受影响。` }),
    foot: [
      el('button', { class: 'btn', text: '取消', onclick: closeModal }),
      el('button', {
        class: 'btn btn-primary',
        text: '清除',
        onclick: async () => {
          closeModal();
          book.progress = { page: 0 };
          book.bookmarks = [];
          book.settings = {};
          book.lastReadAt = 0;
          await saveBook(book);
          renderShelf();
          toast('已清除');
        },
      }),
    ],
  });
}

// ============================ 打开一本书 ============================
async function openBook(book) {
  showLoading('正在打开…');
  try {
    const entry = S.manifest.books.find((x) => x.id === book.id);
    if (!entry) throw new Error('清单里没有这本书');

    const source = new BookSource({ entry, base: abs(entry.base), title: entry.title });
    await source.init();
    if (!source.pageCount) throw new Error('这本书里没有可显示的页面');

    book.pageCount = source.pageCount;
    book.lastReadAt = Date.now();
    book.settings = book.settings || {};
    if (!book.settings.mode) book.settings.mode = book.mode || S.settings.mode || 'rtl';
    if (!book.settings.layout) book.settings.layout = S.settings.layout;
    if (!book.settings.effect) book.settings.effect = S.settings.effect;
    if (!book.settings.fit) book.settings.fit = S.settings.fit;
    if (!book.bookmarks) book.bookmarks = [];

    S.current = book;
    S.source = source;

    showView('reader');
    $('#book-title').textContent = book.title;
    $('#book-sub').textContent =
      `${book.author ? book.author + ' · ' : ''}${book.pageCount} 页`;

    S.reader.close?.();
    await S.reader.open(book, source);
    hideLoading();
    updateStar();
    saveBook(book);
  } catch (e) {
    hideLoading();
    console.error(e);
    toast('打开失败：' + (e?.message || e));
    S.current = null;
    S.source = null;
    showView('library');
  }
}

async function saveBook(book) {
  if (!book || !book.id) return;
  try {
    await db.putBook({
      id: book.id,
      title: book.title,
      author: book.author,
      mark: book.mark,
      order: book.order,
      pageCount: book.pageCount,
      cover: book.cover,
      mode: book.mode,
      progress: book.progress || { page: 0 },
      lastReadAt: book.lastReadAt || 0,
      settings: book.settings || {},
      bookmarks: book.bookmarks || [],
    });
  } catch (e) {
    console.warn('保存失败', e);
  }
}

const saveProgressSoon = debounce(() => {
  if (!S.current) return;
  saveBook(S.current);
}, 900);

// ============================ 阅读器接线 ============================
function initReader() {
  S.reader = new Reader({
    stage: $('#stage'),
    onProgress: (page) => {
      if (!S.current) return;
      S.current.progress = { page };
      S.current.lastReadAt = Date.now();
      saveProgressSoon();
    },
    onToast: toast,
    onZone: (zone) => {
      if (zone === 'mid') { toggleUI(); return; }
      const rtl = S.reader.mode === 'rtl';
      const forward = rtl ? zone === 'left' : zone === 'right';
      forward ? S.reader.next() : S.reader.prev();
    },
    onStateChange: (st) => {
      updateReaderUI(st);
      if (S.current) {
        S.current.settings = {
          ...(S.current.settings || {}),
          mode: st.mode, layout: st.layout, effect: st.effect, fit: st.fit,
        };
        saveProgressSoon();
      }
    },
    onEnd: () => toast('已经是最后一页'),
  });
}

function updateReaderUI(st) {
  const items = S.reader ? S.reader.pagesFor(st.spreadIndex) : [];
  const idx = items.map((i) => i.index).filter((i) => i != null);
  const first = idx.length ? Math.min(...idx) : st.page;
  const last = idx.length ? Math.max(...idx) : st.page;
  const label = first === last ? `${first + 1}` : `${first + 1}–${last + 1}`;
  $('#page-label').textContent = `${label} / ${st.pageCount}`;

  const pct = st.pageCount > 1 ? Math.round(((last + 1) / st.pageCount) * 100) : 100;
  $('#spread-label').textContent = `${pct}%　·　第 ${st.spreadIndex + 1} / ${st.spreadTotal} 屏`;

  const rangeEl = $('#page-range');
  rangeEl.max = String(Math.max(0, st.pageCount - 1));
  rangeEl.value = String(st.page);
  $('#slider-fill').style.width = (st.pageCount > 1 ? (st.page / (st.pageCount - 1)) * 100 : 0) + '%';

  $('#mode-badge').textContent = st.mode === 'rtl' ? '日漫' : '左开';
  $('#btn-layout use').setAttribute('href', st.layout === 'spread' ? '#i-spread' : '#i-single');
  $('#btn-mode').classList.toggle('is-active', st.mode === 'rtl');
  document.title = `${S.current?.title || '书页'} · 书页`;
  updateStar();
}

function updateStar() {
  if (!S.reader || !S.current) return;
  const marked = (S.current.bookmarks || []).some((b) => b.page === S.reader.currentPage);
  $('#btn-bookmark use').setAttribute('href', marked ? '#i-star-fill' : '#i-star');
  $('#btn-bookmark').style.color = marked ? 'var(--accent)' : '';
}

// ============================ 视图 ============================
function showView(name) {
  $('#view-library').classList.toggle('is-active', name === 'library');
  $('#view-reader').classList.toggle('is-active', name === 'reader');
  if (name === 'library') {
    document.title = '书页 · 謎狐怪童';
    closeSide();
    S.reader?.close();
    S.current = null;
    S.source = null;
    S.loadingStack = 0;
    $('#loading').hidden = true;
    renderShelf();
  } else {
    $('#view-reader').classList.remove('ui-hidden');
  }
}

function toggleUI(force) {
  const v = $('#view-reader');
  const hidden = force != null ? force : !v.classList.contains('ui-hidden');
  v.classList.toggle('ui-hidden', hidden);
}

let uiTimer = null;
function armUIHide() {
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => toggleUI(true), 2600);
}

// ============================ 提示 / 加载 ============================
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
}

function showLoading(text = '正在打开…') {
  S.loadingStack++;
  setLoadingText(text);
  $('#loading').hidden = false;
}
function setLoadingText(text) { $('#loading-text').textContent = text; }
function hideLoading() {
  S.loadingStack = Math.max(0, S.loadingStack - 1);
  if (S.loadingStack === 0) $('#loading').hidden = true;
}

// ============================ 弹层 ============================
function openModal({ title, body, foot = [], wide = false }) {
  $('#modal-title').textContent = title;
  const b = $('#modal-body');
  b.innerHTML = '';
  b.append(body);
  const f = $('#modal-foot');
  f.innerHTML = '';
  for (const btn of foot) f.append(btn);
  $('#modal').classList.toggle('is-wide', wide);
  $('#modal-backdrop').hidden = false;
}
function closeModal() { $('#modal-backdrop').hidden = true; }

// ============================ 侧栏 ============================
function openSide(tab) {
  const panel = $('#sidePanel');
  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add('is-open'));
  $('#side-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
  renderSide(tab);
}
function closeSide() {
  const panel = $('#sidePanel');
  panel.classList.remove('is-open');
  setTimeout(() => { if (!panel.classList.contains('is-open')) panel.hidden = true; }, 260);
}

function renderSide(tab) {
  const body = $('#sideBody');
  body.innerHTML = '';
  if (!S.reader?.src) return;

  if (tab === 'toc') {
    const toc = S.source?.toc || [];
    if (!toc.length) {
      body.append(el('div', { class: 'toc-empty', text: '这卷是逐页扫描的，没有书签目录。用「缩略图」翻更顺手。' }));
      return;
    }
    const cur = S.reader.currentPage;
    for (const item of toc) {
      const node = el('div', {
        class: 'toc-item',
        style: { paddingLeft: 10 + (item.level || 0) * 14 + 'px' },
        onclick: () => {
          S.reader.goPage(item.page || 0);
          if (window.matchMedia('(max-width: 900px)').matches) closeSide();
        },
      },
        el('span', { class: 'num', text: (item.page || 0) + 1 }),
        el('span', { class: 't', text: item.title }),
      );
      if (item.page === cur) node.classList.add('is-current');
      body.append(node);
    }
    return;
  }

  if (tab === 'thumbs') {
    const grid = el('div', { class: 'thumb-grid' });
    const cur = S.reader.currentPage;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const i = Number(e.target.dataset.i);
        Promise.resolve(S.source.thumb(i, 160)).then((url) => {
          if (typeof url === 'string' && url) e.target.querySelector('img')?.setAttribute('src', url);
        }).catch(() => { });
      }
    }, { root: body, rootMargin: '300px' });

    for (let i = 0; i < S.reader.pageCount; i++) {
      const t = el('div', {
        class: 'thumb' + (i === cur ? ' is-current' : ''),
        dataset: { i: String(i) },
        onclick: () => {
          S.reader.goPage(i);
          body.querySelectorAll('.thumb').forEach((n) => n.classList.toggle('is-current', Number(n.dataset.i) === i));
        },
      }, el('img', { alt: '', src: '', loading: 'lazy' }), el('span', { text: String(i + 1) }));
      io.observe(t);
      grid.append(t);
    }
    body.append(grid);
    return;
  }

  const marks = S.current?.bookmarks || [];
  if (!marks.length) {
    body.append(el('div', { class: 'marks-empty', text: '还没有书签。读到想记住的一页，按 B 或点顶部的星标。' }));
    return;
  }
  const list = el('div', { class: 'marks-list' });
  for (const m of marks.slice().sort((a, b) => a.page - b.page)) {
    list.append(el('div', {
      class: 'mark-row',
      onclick: () => S.reader.goPage(m.page),
    },
      el('span', { class: 'p', text: `第 ${m.page + 1} 页` }),
      el('span', { class: 't', text: m.label || S.current.title }),
      el('button', {
        class: 'btn btn-icon btn-ghost del',
        html: '<svg class="ic"><use href="#i-close"/></svg>',
        onclick: (e) => {
          e.stopPropagation();
          S.current.bookmarks = marks.filter((x) => x.page !== m.page);
          saveBook(S.current);
          renderSide('marks');
          updateStar();
        },
      }),
    ));
  }
  body.append(list);
}

// ============================ 帮助 / 设置 ============================
function showHelp() {
  const rows = [
    ['← / →', '上一页 / 下一页（日漫模式下方向相反）'],
    ['空格 / PageDown', '下一页'],
    ['Home / End', '第一页 / 最后一页'],
    ['M', '切换 日漫（右→左）/ 左开（左→右）'],
    ['D', '切换 单页 / 双页对开'],
    ['F', '全屏'],
    ['+ / -', '放大 / 缩小（也可 Ctrl + 滚轮）'],
    ['0', '复位缩放'],
    ['B', '当前页加书签'],
    ['T / G', '目录 / 缩略图'],
    ['滚轮', '翻页（日漫模式下往回滚）'],
    ['拖拽 / 双击', '放大后拖动画面 / 双击放大'],
    ['Esc', '返回书架'],
  ];
  const body = el('div', {});
  const keys = el('div', { class: 'keys' });
  for (const [k, d] of rows) keys.append(el('span', { class: 'k', text: k }), el('span', { class: 'd', text: d }));
  body.append(keys, el('div', {
    class: 'help-note',
    text: '提示：日漫模式的「下一页」在画面左侧 —— 点击左侧三分之一，或按 ← 键。双页对开时封面单独显示，其后两页一组，和纸质书一致。',
  }));
  openModal({ title: '快捷键与操作', body, foot: [el('button', { class: 'btn btn-primary', text: '知道了', onclick: closeModal })] });
}

function showSettings() {
  const body = el('div', {});
  const mkRow = (label, desc, control) => el('div', { class: 'settings-row' },
    el('div', { class: 'label' }, label, desc ? el('small', { text: desc }) : null), control);

  const seg = (options, value, onChange) => {
    const s = el('div', { class: 'seg' });
    for (const [v, t] of options) {
      s.append(el('button', {
        class: v === value ? 'is-active' : '',
        text: t,
        onclick: (e) => {
          s.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === e.currentTarget));
          onChange(v);
        },
      }));
    }
    return s;
  };

  body.append(
    mkRow('默认阅读方向', '只对还没打开过的书生效', seg([['rtl', '日漫 右→左'], ['ltr', '普通 左→右']], S.settings.mode, (v) => { S.settings.mode = v; persistSettings(); })),
    mkRow('默认版面', '', seg([['spread', '双页对开'], ['single', '单页']], S.settings.layout, (v) => { S.settings.layout = v; persistSettings(); })),
    mkRow('翻页效果', '', seg([['flip', '纸张翻转'], ['fade', '淡入'], ['slide', '滑动'], ['none', '无']], S.settings.effect, (v) => { S.settings.effect = v; persistSettings(); })),
    el('div', { class: 'help-note', text: '阅读进度、书签和版式都存在你自己的浏览器里（IndexedDB），不会上传，换设备也不会同步。' }),
  );

  openModal({ title: '设置', body, foot: [el('button', { class: 'btn btn-primary', text: '完成', onclick: closeModal })] });
}

function persistSettings() { db.setSetting('reading', S.settings).catch(() => { }); }

// ============================ 事件 ============================
function bindGlobal() {
  initReader();
  $('#btn-settings').onclick = showSettings;

  $('#search-input').addEventListener('input', debounce((e) => {
    S.filter = e.target.value;
    renderShelf();
  }, 140));

  $('#shelf-sort').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-sort]');
    if (!btn) return;
    S.sort = btn.dataset.sort;
    $$('#shelf-sort button').forEach((b) => b.classList.toggle('is-active', b === btn));
    renderShelf();
  });

  // 阅读器按钮
  $('#btn-back').onclick = () => showView('library');
  $('#btn-prev').onclick = () => S.reader.prev();
  $('#btn-next').onclick = () => S.reader.next();
  $('#page-range').addEventListener('input', (e) => { S.reader.goPage(Number(e.target.value)); });
  $('#slider').addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    S.reader.goPage(Math.round(ratio * (S.reader.pageCount - 1)));
  });
  $('#btn-mode').onclick = async () => {
    if (!S.reader.src) return;
    const next = S.reader.mode === 'rtl' ? 'ltr' : 'rtl';
    await S.reader.setMode(next);
    toast(next === 'rtl' ? '日漫模式：从右往左翻' : '普通模式：从左往右翻');
  };
  $('#btn-layout').onclick = async () => {
    if (!S.reader.src) return;
    const next = S.reader.layoutMode === 'spread' ? 'single' : 'spread';
    await S.reader.setLayout(next);
    toast(next === 'spread' ? '双页对开' : '单页');
  };
  $('#btn-zoomin').onclick = () => S.reader.zoomBy(1.25);
  $('#btn-zoomout').onclick = () => S.reader.setZoom(S.reader.zoom / 1.25);
  $('#btn-fit').onclick = () => { S.reader.setZoom(1); toast('已适应窗口'); };
  $('#btn-bookmark').onclick = toggleBookmark;
  $('#btn-toc').onclick = () => openSide('toc');
  $('#btn-thumbs').onclick = () => openSide('thumbs');
  $('#btn-side-close').onclick = closeSide;
  $('#btn-fullscreen').onclick = toggleFullscreen;
  $('#btn-help').onclick = showHelp;
  $('#side-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    $$('#side-tabs button').forEach((b) => b.classList.toggle('is-active', b === btn));
    renderSide(btn.dataset.tab);
  });

  $('#view-reader').addEventListener('mousemove', () => {
    if ($('#view-reader').classList.contains('ui-hidden')) toggleUI(false);
    armUIHide();
  });

  $('#modal-close').onclick = closeModal;
  $('#modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

  document.addEventListener('keydown', onKeydown);
}

function toggleBookmark() {
  if (!S.current || !S.reader?.src) return;
  const page = S.reader.currentPage;
  const marks = S.current.bookmarks || [];
  if (marks.some((m) => m.page === page)) {
    S.current.bookmarks = marks.filter((m) => m.page !== page);
    toast('已取消书签');
  } else {
    S.current.bookmarks = [...marks, { page, ts: Date.now(), label: `${S.current.title} 第 ${page + 1} 页` }];
    toast('已加书签');
  }
  saveBook(S.current);
  updateStar();
  if (!$('#sidePanel').hidden && $('#side-tabs .is-active')?.dataset.tab === 'marks') renderSide('marks');
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch (e) { toast('无法进入全屏：' + e.message); }
}

function onKeydown(e) {
  const inReader = $('#view-reader').classList.contains('is-active');
  const typing = /input|textarea|select/i.test(e.target.tagName)
    || e.target.isContentEditable
    || $('#modal-backdrop').hidden === false;

  if (e.key === 'Escape') {
    if ($('#modal-backdrop').hidden === false) { closeModal(); return; }
    if (!$('#sidePanel').hidden) { closeSide(); return; }
    if (inReader) { showView('library'); return; }
  }
  if (typing) return;
  if (!inReader || !S.reader?.src) return;

  const rtl = S.reader.mode === 'rtl';
  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); rtl ? S.reader.next() : S.reader.prev(); break;
    case 'ArrowRight': e.preventDefault(); rtl ? S.reader.prev() : S.reader.next(); break;
    case 'ArrowUp': e.preventDefault(); S.reader.prev(); break;
    case 'ArrowDown': e.preventDefault(); S.reader.next(); break;
    case ' ': case 'PageDown': e.preventDefault(); S.reader.next(); break;
    case 'PageUp': e.preventDefault(); S.reader.prev(); break;
    case 'Home': e.preventDefault(); S.reader.goPage(0); break;
    case 'End': e.preventDefault(); S.reader.goPage(S.reader.pageCount - 1); break;
    case 'm': case 'M': $('#btn-mode').click(); break;
    case 'd': case 'D': $('#btn-layout').click(); break;
    case 'f': case 'F': toggleFullscreen(); break;
    case '+': case '=': e.preventDefault(); S.reader.zoomBy(1.2); break;
    case '-': case '_': e.preventDefault(); S.reader.setZoom(S.reader.zoom / 1.2); break;
    case '0': S.reader.setZoom(1); break;
    case 'b': case 'B': toggleBookmark(); break;
    case 't': case 'T': openSide('toc'); break;
    case 'g': case 'G': openSide('thumbs'); break;
    case '?': showHelp(); break;
    default: break;
  }
}

boot();

window.addEventListener('beforeunload', () => {
  if (S.current) saveBook(S.current);
});
