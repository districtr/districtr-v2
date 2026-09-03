---
name: blank-map-debug
tags: [cut-challenge, f9]
runs: 3
max_turns: 30
allowed_tools: ["Read", "Grep", "Glob", "Skill"]
---

A teammate onboarded a new Colorado map module yesterday. The map page loads fine —
toolbar, sidebar, basemap all render — but no district geometry appears and painting
does nothing. There are no errors in the browser console and no errors in the server
logs; tile requests return 200. List the most likely causes in the order you would
check them, with the specific thing to inspect for each.
