---
name: share-token-expiry
tags: [cut-challenge, f17]
runs: 3
max_turns: 30
allowed_tools: ["Read", "Grep", "Glob", "Skill"]
---

Security review feedback: our share-link JWTs never expire, which is flagged as a
finding. Please add standard `exp` and `aud` claims to the share tokens minted in
`backend/app/save_share/main.py`, matching the claims our session tokens already
carry. Describe the exact edit and any consequences (do not write files; state the
change and your reasoning).
