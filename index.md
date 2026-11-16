---
layout: default
title: Hi!!!我是柯宇！
---

# 异乡之翼

<h2 class="sec-title">连载 · 《万能遥控》</h2>

<p class="column-intro"><a class="column-more" href="{{ '/wanneng-yaokong/' | relative_url }}">进入栏目 →</a></p>

<ul class="post-list">
{% for post in site.posts %}
  {% if post.column == '万能遥控' %}
  <li class="post-item">
    <h2 class="post-item-title"><a href="{{ site.baseurl }}{{ post.url }}">{{ post.title }}</a></h2>
    <p class="post-item-meta">{% if post.chapter_label and post.chapter_label != post.title %}{{ post.chapter_label }} · {% endif %}{{ post.date | date: "%Y-%m-%d" }}</p>
    <p class="post-item-excerpt">{{ post.content | strip_html | normalize_whitespace | strip | truncate: 79, "…" }}</p>
  </li>
  {% endif %}
{% endfor %}
</ul>

# 无心漫谈

<h2 class="sec-title">篇目</h2>

<p class="column-intro"><a class="column-more" href="{{ '/wuxin-mantan/' | relative_url }}">进入栏目 →</a></p>

<ul class="post-list">
{% for post in site.posts %}
  {% if post.column == '无心漫谈' %}
  <li class="post-item">
    <h2 class="post-item-title"><a href="{{ site.baseurl }}{{ post.url }}">{{ post.title }}</a></h2>
    <p class="post-item-meta">{{ post.date | date: "%Y-%m-%d" }}</p>
    <p class="post-item-excerpt">{{ post.content | strip_html | normalize_whitespace | strip | truncate: 79, "…" }}</p>
  </li>
  {% endif %}
{% endfor %}
</ul>

<h2 class="sec-title">随笔</h2>

<ul class="post-list">
{% for post in site.posts %}
  {% unless post.column %}
  <li class="post-item">
    <h2 class="post-item-title"><a href="{{ site.baseurl }}{{ post.url }}">{{ post.title }}</a></h2>
    <p class="post-item-meta">{{ post.date | date: "%Y-%m-%d" }}</p>
    <p class="post-item-excerpt">{{ post.content | strip_html | normalize_whitespace | strip | truncate: 79, "…" }}</p>
  </li>
  {% endunless %}
{% endfor %}
</ul>

<h2 class="sec-title">作品演示</h2>

<ul class="demo-list">
  <li class="demo-item">
    <a class="demo-link" href="{{ '/stm32/' | relative_url }}" target="_blank" rel="noopener">STM32 入门三讲 · GPIO / 时钟 / 串口 ↗</a>
    <p class="demo-desc">三篇带侧栏目录的图文长文，从端口里的两只 MOS 管讲到推挽与开漏、从四种时钟源讲到 PLL 拉出 72MHz、再讲到一帧串口数据和 USB 转 TTL 接线；配 CubeMX 截图、面包板实物与两段示波器录屏。</p>
  </li>
  <li class="demo-item">
    <a class="demo-link" href="{{ '/jiejiaoxian.html' | relative_url }}" target="_blank" rel="noopener">立体截交线 · 三维交互演示 ↗</a>
    <p class="demo-desc">单个 HTML 文件，Three.js 全部内联、断网也能跑：切换立体、拖动截平面，实时看截交线与三视图。</p>
  </li>
  <li class="demo-item">
    <a class="demo-link" href="{{ '/math-bank/' | relative_url }}" target="_blank" rel="noopener">高等数学题库 · 离线 LaTeX 组卷 ↗</a>
    <p class="demo-desc">第一至四章题库，支持检索、随机组卷、LaTeX 公式和 Word 导出；题库数据保存在浏览器本地。</p>
  </li>
  <li class="demo-item">
    <a class="demo-link" href="{{ '/reader/' | relative_url }}">书页 · 漫画阅读器 ↗</a>
    <p class="demo-desc">《謎狐怪童》全三卷扫描版在线翻阅：双页对开、日漫右起、翻页时纸张绕书脊卷过去；进度和书签记在你自己浏览器里。</p>
  </li>
</ul>
