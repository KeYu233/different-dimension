---
layout: default
title: 《电控学习笔记》
permalink: /diankong-biji/
---

<h2 class="chapter-heading">篇目<span class="chapter-count">共 3 篇</span></h2>

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
    <p class="post-item-excerpt">两根线，一根发一根收，中间没有时钟线，两边只靠事先约好的波特率对齐节拍。把一帧数据拆到每一位上，再看 CubeMX 里怎么配一个 115200 8N1。</p>
  </li>
</ul>

<p class="post-back">
  <a href="{{ '/' | relative_url }}" class="btn-back">⬅️ 返回首页</a>
</p>
