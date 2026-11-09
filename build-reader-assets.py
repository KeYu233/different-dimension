# -*- coding: utf-8 -*-
"""
把 Reader 里的三本扫描版 PDF 转成博客可托管的静态逐页图片。

输出（相对于 OUT_ROOT）：
  books/<id>/pages/0001.webp     阅读用页面，长边 1920*SCALE（当前 0.66 → 约 1267px）
  books/<id>/thumbs/0001.webp    缩略图，宽 200
  books/<id>/cover.webp          书架封面，宽 420
  data/library.json              书架清单（含每页宽高，前端不必逐张探测）

为什么要转：GitHub 单文件上限 100MB，而三本原 PDF 是 94/106/129MB，
其中两本超限；按页切片后单文件只有几百 KB，还能按需懒加载。
"""
import sys, os, io, json, time
import fitz
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')

SRC = r'D:\blog\Reader'
OUT_ROOT = r'D:\blog\different-dimension\reader'

SCALE = 0.66          # 长边 1920 -> 约 1267（0.75 时总量 168MB，0.66 约 126MB）
PAGE_Q = 78           # 阅读页质量
PAGE_METHOD = 6
THUMB_W = 200
THUMB_Q = 75
COVER_W = 420
COVER_Q = 82

BOOKS = [
    dict(id='mhgt-01', pdf='Mhgt_01.pdf', title='謎狐怪童 第1卷', mark='壹'),
    dict(id='mhgt-02', pdf='Mhgt_02.pdf', title='謎狐怪童 第2卷', mark='貳'),
    dict(id='mhgt-03', pdf='Mhgt_03.pdf', title='謎狐怪童 第3卷', mark='參'),
]


def page_image(doc, i):
    """取第 i 页的位图。扫描件每页内嵌一张 JPEG，直接抽出来比重新光栅化清晰。"""
    imgs = doc[i].get_images(full=True)
    if imgs:
        d = doc.extract_image(imgs[0][0])
        try:
            return Image.open(io.BytesIO(d['image'])).convert('RGB')
        except Exception:
            pass
    pm = doc[i].get_pixmap(dpi=150)
    return Image.frombytes('RGB', (pm.width, pm.height), pm.samples)


def save_webp(im, path, quality, method):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.part'
    im.save(tmp, 'WEBP', quality=quality, method=method)
    os.replace(tmp, path)
    return os.path.getsize(path)


def main():
    lib = {'books': []}
    grand_pages = grand_bytes = 0
    for b in BOOKS:
        src = os.path.join(SRC, b['pdf'])
        book_dir = os.path.join(OUT_ROOT, 'books', b['id'])
        doc = fitz.open(src)
        n = doc.page_count
        print('=' * 70)
        print('%s  %s  %d 页  %.1f MB' % (b['id'], b['pdf'], n, os.path.getsize(src) / 1048576))

        # 清掉上一次的残留，避免页数变少时留下多余文件
        for sub in ('pages', 'thumbs'):
            d = os.path.join(book_dir, sub)
            if os.path.isdir(d):
                for f in os.listdir(d):
                    os.remove(os.path.join(d, f))

        dims = []
        bytes_total = 0
        t0 = time.time()
        for i in range(n):
            im = page_image(doc, i)
            W, H = im.size
            pw, ph = max(1, round(W * SCALE)), max(1, round(H * SCALE))
            small = im if (pw, ph) == (W, H) else im.resize((pw, ph), Image.LANCZOS)

            bytes_total += save_webp(small, os.path.join(book_dir, 'pages', '%04d.webp' % (i + 1)), PAGE_Q, PAGE_METHOD)

            tw = THUMB_W
            th = max(1, round(small.height * tw / small.width))
            save_webp(small.resize((tw, th), Image.LANCZOS),
                      os.path.join(book_dir, 'thumbs', '%04d.webp' % (i + 1)), THUMB_Q, 4)

            dims.append([small.width, small.height])
            if (i + 1) % 20 == 0 or i + 1 == n:
                el = time.time() - t0
                print('  %3d/%d  %5.1f MB  %4.0fs  (%.2fs/页)'
                      % (i + 1, n, bytes_total / 1048576, el, el / (i + 1)), flush=True)

        # 封面：第一页（彩色）
        cover = page_image(doc, 0)
        cw = COVER_W
        ch = max(1, round(cover.height * cw / cover.width))
        cover_kb = save_webp(cover.resize((cw, ch), Image.LANCZOS),
                             os.path.join(book_dir, 'cover.webp'), COVER_Q, 6) / 1024

        lib['books'].append({
            'id': b['id'],
            'title': b['title'],
            'mark': b['mark'],
            'author': '植芝理一',
            'mode': 'rtl',
            'pageCount': n,
            'base': 'books/%s/' % b['id'],
            'cover': 'books/%s/cover.webp' % b['id'],
            'coverSize': [cw, ch],
            'pages': dims,
        })
        grand_pages += n
        grand_bytes += bytes_total
        print('  -> 页面合计 %.1f MB，封面 %.0f KB' % (bytes_total / 1048576, cover_kb))
        doc.close()

    os.makedirs(os.path.join(OUT_ROOT, 'data'), exist_ok=True)
    out = os.path.join(OUT_ROOT, 'data', 'library.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(lib, f, ensure_ascii=False, separators=(',', ':'))
    print('=' * 70)
    print('总计 %d 页，%.1f MB' % (grand_pages, grand_bytes / 1048576))
    print('清单 -> %s (%.0f KB)' % (out, os.path.getsize(out) / 1024))


if __name__ == '__main__':
    main()
