---
layout: default
title: Hi!!!我是柯宇！
---

# 异乡之翼

<ul class="post-list">
{% for post in site.posts %}
  <li class="post-item">
    <h2 class="post-item-title"><a href="{{ site.baseurl }}{{ post.url }}">{{ post.title }}</a></h2>
    <p class="post-item-meta">{{ post.date | date: "%Y-%m-%d" }}</p>
    <p class="post-item-excerpt">{{ post.content | strip_html | normalize_whitespace | strip | truncate: 79, "…" }}</p>
  </li>
{% endfor %}
</ul>
