### Storage (all 646 local plans + one synthetic 200k plan)

| format | total | heap | toast | index |
|---|---|---|---|---|
| rel | 91.3 MB | 41.9 MB | 8 KB | 49.4 MB |
| js | 3.0 MB | 240 KB | 2.7 MB | 48 KB |
| js_lz4 | 4.3 MB | 280 KB | 3.9 MB | 48 KB |
| js_byzone | 3.0 MB | 256 KB | 2.6 MB | 40 KB |

539 of 646 jsonb plans are small enough to stay inline (<2 KB).

| plan | rows | relational (est.) | jsonb pglz | jsonb lz4 | {zone:[ids]} pglz | raw JSON text |
|---|---|---|---|---|---|---|
| OR 1k | 1,045 | 152 KB | 4 KB | 5 KB | 4 KB | 19 KB |
| CO 8k | 8,286 | 1.2 MB | 32 KB | 45 KB | 30 KB | 179 KB |
| TX 23k | 22,686 | 3.2 MB | 89 KB | 128 KB | 84 KB | 516 KB |
| KS 52k | 52,432 | 7.4 MB | 200 KB | 285 KB | 193 KB | 1.1 MB |
| TX 200k (synthetic) | 200,000 | 28.3 MB | 986 KB | 1.5 MB | 949 KB | 4.3 MB |

### Whole-plan reads into Python (ms, p50)

| query | OR 1k | CO 8k | TX 23k | KS 52k | TX 200k (synthetic) |
|---|---|---|---|---|---|
| rel rows | 0.43 | 2.92 | 7.46 | 17.8 | 74.82 |
| js blob -> dict | 0.48 | 2.73 | 7.47 | 18.6 | 87.76 |
| js_lz4 blob -> dict | 0.43 | 2.61 | 7.2 | 17.63 | 84.23 |
| js jsonb_each_text rows | 0.59 | 4.0 | 10.38 | 28.86 | 119.81 |
| rel distinct zones | 0.29 | 1.46 | 3.37 | 8.8 | 35.58 |
| js distinct zones | 0.76 | 4.99 | 12.27 | 34.38 | 133.21 |

### Save latency, ms p50 (warm)

| plan | k changed | rel_full (current) | rel_delta | js_full | js_delta | js_lz4_delta |
|---|---|---|---|---|---|---|
| OR 1k | 1 | (11.22) | 0.92 | (3.14) | 2 | 1.53 |
| OR 1k | 10 | (11.22) | 1.09 | (3.14) | 2 | 1.58 |
| OR 1k | 100 | 11.22 | 3.08 | 3.14 | 2.45 | 1.99 |
| CO 8k | 1 | (61.8) | 1.15 | (17.69) | 9.13 | 7.76 |
| CO 8k | 10 | (61.8) | 1.11 | (17.69) | 10.35 | 7.31 |
| CO 8k | 100 | 61.8 | 2.8 | 17.69 | 11.49 | 8.59 |
| CO 8k | 1,000 | (61.8) | 14.6 | (17.69) | 15.87 | 11.51 |
| TX 23k | 1 | (157.18) | 1.02 | (49.45) | 24.23 | 14.38 |
| TX 23k | 10 | (157.18) | 1.38 | (49.45) | 26.44 | 18.66 |
| TX 23k | 100 | 157.18 | 2.8 | 49.45 | 29.19 | 19.74 |
| TX 23k | 1,000 | (157.18) | 18.44 | (49.45) | 34.33 | 23.93 |
| TX 23k | 10,000 | (157.18) | 133.31 | (49.45) | 73.41 | 60.07 |
| KS 52k | 1 | (374.43) | 0.96 | (130.35) | 56.05 | 36.65 |
| KS 52k | 10 | (374.43) | 1.2 | (130.35) | 62.66 | 45.13 |
| KS 52k | 100 | 374.43 | 2.9 | 130.35 | 69.01 | 49.81 |
| KS 52k | 1,000 | (374.43) | 17.74 | (130.35) | 76.76 | 54.22 |
| KS 52k | 10,000 | (374.43) | 141.19 | (130.35) | 111.48 | 88.82 |
| TX 200k (synthetic) | 1 | (1430.43) | 1.27 | (488.51) | 239.73 | 138.99 |
| TX 200k (synthetic) | 10 | (1430.43) | 1.49 | (488.51) | 266.16 | 169.12 |
| TX 200k (synthetic) | 100 | 1430.43 | 3.49 | 488.51 | 297.32 | 200.05 |
| TX 200k (synthetic) | 1,000 | (1430.43) | 20.87 | (488.51) | 296.52 | 200.12 |
| TX 200k (synthetic) | 10,000 | (1430.43) | 218.24 | (488.51) | 339.45 | 241.57 |

### WAL bytes per save, p50 (warm)

| plan | k changed | rel_full (current) | rel_delta | js_full | js_delta | js_lz4_delta |
|---|---|---|---|---|---|---|
| OR 1k | 1 | (277 KB) | 0 KB | (5 KB) | 5 KB | 6 KB |
| OR 1k | 10 | (277 KB) | 2 KB | (5 KB) | 5 KB | 7 KB |
| OR 1k | 100 | 277 KB | 15 KB | 5 KB | 5 KB | 8 KB |
| CO 8k | 1 | (2.0 MB) | 0 KB | (38 KB) | 40 KB | 50 KB |
| CO 8k | 10 | (2.0 MB) | 2 KB | (38 KB) | 40 KB | 51 KB |
| CO 8k | 100 | 2.0 MB | 18 KB | 38 KB | 41 KB | 55 KB |
| CO 8k | 1,000 | (2.0 MB) | 144 KB | (38 KB) | 44 KB | 70 KB |
| TX 23k | 1 | (5.3 MB) | 0 KB | (102 KB) | 105 KB | 141 KB |
| TX 23k | 10 | (5.3 MB) | 3 KB | (102 KB) | 105 KB | 142 KB |
| TX 23k | 100 | 5.3 MB | 22 KB | 102 KB | 107 KB | 147 KB |
| TX 23k | 1,000 | (5.3 MB) | 159 KB | (102 KB) | 118 KB | 176 KB |
| TX 23k | 10,000 | (5.3 MB) | 1.3 MB | (102 KB) | 125 KB | 202 KB |
| KS 52k | 1 | (12.4 MB) | 0 KB | (222 KB) | 225 KB | 314 KB |
| KS 52k | 10 | (12.4 MB) | 3 KB | (222 KB) | 225 KB | 314 KB |
| KS 52k | 100 | 12.4 MB | 24 KB | 222 KB | 227 KB | 320 KB |
| KS 52k | 1,000 | (12.4 MB) | 173 KB | (222 KB) | 242 KB | 358 KB |
| KS 52k | 10,000 | (12.4 MB) | 1.4 MB | (222 KB) | 269 KB | 436 KB |
| TX 200k (synthetic) | 1 | (47.0 MB) | 0 KB | (1.1 MB) | 1.1 MB | 1.6 MB |
| TX 200k (synthetic) | 10 | (47.0 MB) | 3 KB | (1.1 MB) | 1.1 MB | 1.6 MB |
| TX 200k (synthetic) | 100 | 47.0 MB | 28 KB | 1.1 MB | 1.1 MB | 1.6 MB |
| TX 200k (synthetic) | 1,000 | (47.0 MB) | 224 KB | (1.1 MB) | 1.1 MB | 1.6 MB |
| TX 200k (synthetic) | 10,000 | (47.0 MB) | 1.5 MB | (1.1 MB) | 1.1 MB | 1.6 MB |

After a CHECKPOINT (first touch of each page pays a full-page image) — the realistic case for a plan saved every few seconds/minutes:

| plan | k changed | rel_full (current) | rel_delta | js_full | js_delta | js_lz4_delta |
|---|---|---|---|---|---|---|
| OR 1k | 1 | (552 KB) | 8 KB | (19 KB) | 19 KB | 24 KB |
| OR 1k | 10 | (552 KB) | 55 KB | (19 KB) | 19 KB | 28 KB |
| OR 1k | 100 | 552 KB | 93 KB | 19 KB | 19 KB | 30 KB |
| CO 8k | 1 | (3.3 MB) | 19 KB | (84 KB) | 83 KB | 109 KB |
| CO 8k | 10 | (3.3 MB) | 96 KB | (84 KB) | 82 KB | 110 KB |
| CO 8k | 100 | 3.3 MB | 489 KB | 84 KB | 85 KB | 125 KB |
| CO 8k | 1,000 | (3.3 MB) | 833 KB | (84 KB) | 91 KB | 156 KB |
| TX 23k | 1 | (8.8 MB) | 18 KB | (216 KB) | 216 KB | 281 KB |
| TX 23k | 10 | (8.8 MB) | 126 KB | (216 KB) | 218 KB | 289 KB |
| TX 23k | 100 | 8.8 MB | 741 KB | 216 KB | 227 KB | 307 KB |
| TX 23k | 1,000 | (8.8 MB) | 2.0 MB | (216 KB) | 251 KB | 377 KB |
| TX 23k | 10,000 | (8.8 MB) | 3.4 MB | (216 KB) | 261 KB | 403 KB |
| KS 52k | 1 | (20.6 MB) | 16 KB | (441 KB) | 444 KB | 623 KB |
| KS 52k | 10 | (20.6 MB) | 148 KB | (441 KB) | 445 KB | 622 KB |
| KS 52k | 100 | 20.6 MB | 865 KB | 441 KB | 453 KB | 643 KB |
| KS 52k | 1,000 | (20.6 MB) | 3.6 MB | (441 KB) | 497 KB | 752 KB |
| KS 52k | 10,000 | (20.6 MB) | 5.9 MB | (441 KB) | 528 KB | 862 KB |
| TX 200k (synthetic) | 1 | (74.9 MB) | 17 KB | (2.1 MB) | 2.1 MB | 3.2 MB |
| TX 200k (synthetic) | 10 | (74.9 MB) | 149 KB | (2.1 MB) | 2.1 MB | 3.2 MB |
| TX 200k (synthetic) | 100 | 74.9 MB | 1.2 MB | 2.1 MB | 2.1 MB | 3.2 MB |
| TX 200k (synthetic) | 1,000 | (74.9 MB) | 7.0 MB | (2.1 MB) | 2.1 MB | 3.2 MB |
| TX 200k (synthetic) | 10,000 | (74.9 MB) | 17.0 MB | (2.1 MB) | 2.1 MB | 3.2 MB |

### On-disk growth per save before vacuum (warm)

| plan | k changed | rel_full (current) | rel_delta | js_full | js_delta | js_lz4_delta |
|---|---|---|---|---|---|---|
| OR 1k | 1 | (76 KB) | 0 KB | (7 KB) | 7 KB | 7 KB |
| OR 1k | 10 | (76 KB) | 0 KB | (7 KB) | 7 KB | 9 KB |
| OR 1k | 100 | 76 KB | 4 KB | 7 KB | 7 KB | 10 KB |
| CO 8k | 1 | (595 KB) | 0 KB | (36 KB) | 41 KB | 51 KB |
| CO 8k | 10 | (595 KB) | 0 KB | (36 KB) | 41 KB | 51 KB |
| CO 8k | 100 | 595 KB | 4 KB | 36 KB | 41 KB | 54 KB |
| CO 8k | 1,000 | (595 KB) | 13 KB | (36 KB) | 43 KB | 65 KB |
| TX 23k | 1 | (1.5 MB) | 0 KB | (98 KB) | 101 KB | 135 KB |
| TX 23k | 10 | (1.5 MB) | 0 KB | (98 KB) | 102 KB | 136 KB |
| TX 23k | 100 | 1.5 MB | 5 KB | 98 KB | 104 KB | 140 KB |
| TX 23k | 1,000 | (1.5 MB) | 16 KB | (98 KB) | 112 KB | 167 KB |
| TX 23k | 10,000 | (1.5 MB) | 212 KB | (98 KB) | 120 KB | 193 KB |
| KS 52k | 1 | (3.6 MB) | 4 KB | (212 KB) | 216 KB | 297 KB |
| KS 52k | 10 | (3.6 MB) | 4 KB | (212 KB) | 216 KB | 298 KB |
| KS 52k | 100 | 3.6 MB | 7 KB | 212 KB | 217 KB | 305 KB |
| KS 52k | 1,000 | (3.6 MB) | 17 KB | (212 KB) | 230 KB | 340 KB |
| KS 52k | 10,000 | (3.6 MB) | 97 KB | (212 KB) | 256 KB | 410 KB |
| TX 200k (synthetic) | 1 | (13.9 MB) | 0 KB | (1.0 MB) | 1.0 MB | 1.5 MB |
| TX 200k (synthetic) | 10 | (13.9 MB) | 0 KB | (1.0 MB) | 1.0 MB | 1.5 MB |
| TX 200k (synthetic) | 100 | 13.9 MB | 8 KB | 1.0 MB | 1.0 MB | 1.5 MB |
| TX 200k (synthetic) | 1,000 | (13.9 MB) | 29 KB | (1.0 MB) | 1.0 MB | 1.5 MB |
| TX 200k (synthetic) | 10,000 | (13.9 MB) | 128 KB | (1.0 MB) | 1.0 MB | 1.6 MB |

### Geometry joins (ms, p50) — relational table vs jsonb_each_text expansion

| plan | source | join all units | bbox one zone | union one zone | join plan |
|---|---|---|---|---|---|
| CO 8k | rel | 93.3 | 14.0 | 1073.1 | Merge Join est=8479 actual=5222; Merge Join est=8479 actual=3064 |
| CO 8k | jsonb | 41.4 | 14.8 | 1079.9 | Nested Loop est=100 actual=5222; Nested Loop est=100 actual=3064 |
| TX 23k | rel | 128.6 | 15.4 | 852.9 | Nested Loop est=22631 actual=15614; Merge Join est=22631 actual=7072 |
| TX 23k | jsonb | 111.2 | 18.5 | 852.0 | Nested Loop est=100 actual=15614; Nested Loop est=100 actual=7072 |
| KS 52k | rel | 204.1 | 101.4 | 5559.9 | Merge Join est=54123 actual=49162; Hash Join est=54123 actual=3270 |
| KS 52k | jsonb | 211.3 | 108.4 | 5585.5 | Nested Loop est=100 actual=49162; Nested Loop est=100 actual=3270 |
