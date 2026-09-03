---
name: county-brush-debug
tags: [cut-challenge, f15-family, onboarding]
runs: 3
max_turns: 30
allowed_tools: ["Read", "Grep", "Glob", "Skill"]
---

A teammate onboarded a new map module yesterday. The map loads and normal painting
works, but the county brush does nothing on the new map — hovering with the county
tool doesn't highlight a county, and clicking paints nothing. On existing maps the
county brush works fine. There are no errors in the browser console and none in the
server logs. List the most likely causes in the order you would check them, with the
specific thing to inspect for each.
