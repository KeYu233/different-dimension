---
layout: default
title: 无心漫谈
permalink: /wuxin-mantan/
---

{% assign mantan = site.posts | where: "column", "无心漫谈" %}

<h2 class="chapter-heading">篇目<span class="chapter-count">共 {{ mantan | size }} 篇</span></h2>

<ul class="post-list">
{% for post in mantan %}
  <li class="post-item">
    <h2 class="post-item-title"><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h2>
    <p class="post-item-meta">{{ post.date | date: "%Y-%m-%d" }}</p>
    <p class="post-item-excerpt">{{ post.content | strip_html | normalize_whitespace | strip | truncate: 79, "…" }}</p>
  </li>
{% else %}
  <li class="post-item post-item-empty">还没有漫谈。</li>
{% endfor %}
</ul>

<p class="post-back">
  <a href="{{ '/' | relative_url }}" class="btn-back">⬅️ 返回首页</a>
</p>
