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

<h2 class="sec-title">连载 · 《电控学习笔记》</h2>

<p class="column-intro">STM32 的输入输出、时钟与串口，从寄存器里的两只 MOS 管一路做到能跑的实验。<a class="column-more" href="{{ '/diankong-biji/' | relative_url }}">进入栏目 →</a></p>

<ul class="post-list">
  <li class="post-item">
    <h2 class="post-item-title"><a href="{{ '/stm32/' | relative_url }}">一、GPIO 的输入与输出</a></h2>
    <p class="post-item-meta">推挽与开漏 · 上拉、下拉与浮空 · 点灯与按键</p>
    <p class="post-item-excerpt">从端口里的两只 MOS 管和两只上下拉电阻讲起，一路走到推挽与开漏、上拉与浮空，最后落成两个能跑的实验：点亮 LED，和用按键控制它。</p>
  </li>
  <li class="post-item">
    <h2 class="post-item-title"><a href="{{ '/stm32/clock.html' | relative_url }}">二、时钟系统</a></h2>
    <p class="post-item-meta">四种时钟源 · SYSCLK 与 PLL · 分频器 · 8MHz 到 72MHz</p>
    <p class="post-item-excerpt">把时钟树按树根、树干、树枝、树叶四层拆开，再用一个实验把 HCLK 从 8MHz 提到 72MHz，两段录屏对比。</p>
  </li>
  <li class="post-item">
    <h2 class="post-item-title"><a href="{{ '/stm32/uart.html' | relative_url }}">三、串口通信</a></h2>
    <p class="post-item-meta">帧结构 · 校验位 · 波特率 · USART1 与 USB 转 TTL</p>
    <p class="post-item-excerpt">两根线，一根发一根收，中间没有时钟线，两边只靠事先约好的波特率对齐节拍；把一帧数据拆到每一位上，再在 CubeMX 里配一个 115200 8N1。</p>
  </li>
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
