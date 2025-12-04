## Tennessee (Current Schema)
```
python cli.py test \
    --schema current \
    --api-url https://districtr-v2-451-api.fly.dev \
    --users 30 \
    --assignments-file ./assignments/tennessee.json \
    --map-slug tn_congressional_districts \
    --chunk-requests 10 \
    --chunk-delay 1 \
    --user-delay 0.75
```
```
======================================================================
  DATABASE PERFORMANCE TEST RESULTS (CURRENT SCHEMA)
======================================================================

📊 Overview:
  • Total Users:       30
  • Total Requests:    330
  • Successful:        330
  • Failed:            0
  • Total Duration:    32581.64 ms (32.58 s)

📈 Create Document (30 requests):
  • Total:        3755.81 ms (3.76 s)
  • Average:       125.19 ms
  • Q10:            60.62 ms
  • Q50:            94.85 ms
  • Q90:           244.15 ms
  • Min:            56.18 ms
  • Max:           327.53 ms

📈 Update Assignments (300 requests):
  • Total:       52249.45 ms (52.25 s)
  • Average:       174.16 ms
  • Q10:            97.99 ms
  • Q50:           150.86 ms
  • Q90:           283.28 ms
  • Min:            78.52 ms
  • Max:           478.00 ms

📈 All Requests Combined (330 total):
  • Total:       56005.26 ms (56.01 s)
  • Average:       169.71 ms
  • Q10:            93.26 ms
  • Q50:           149.51 ms
  • Q90:           281.86 ms
```
## Tennessee (New Schema)
```
python cli.py test \
    --schema new \
    --api-url https://districtr-v2-464-api.fly.dev \
    --users 30 \
    --assignments-file ./assignments/tennessee.json \
    --user-delay 1 \
    --map-slug tn_congressional_districts
```
```
======================================================================
  DATABASE PERFORMANCE TEST RESULTS (NEW SCHEMA)
======================================================================

📊 Overview:
  • Total Users:       30
  • Total Requests:    90
  • Successful:        90
  • Failed:            0
  • Total Duration:    42059.57 ms (42.06 s)

📈 Create Document (30 requests):
  • Total:       27610.39 ms (27.61 s)
  • Average:       920.35 ms
  • Q10:           426.09 ms
  • Q50:           945.11 ms
  • Q90:          1396.75 ms
  • Min:           180.25 ms
  • Max:          1400.21 ms

📈 Get Assignments (30 requests):
  • Total:        3218.66 ms (3.22 s)
  • Average:       107.29 ms
  • Q10:            91.27 ms
  • Q50:            96.36 ms
  • Q90:           117.06 ms
  • Min:            90.05 ms
  • Max:           220.06 ms

📈 Update Assignments (30 requests):
  • Total:        8282.07 ms (8.28 s)
  • Average:       276.07 ms
  • Q10:           204.32 ms
  • Q50:           240.28 ms
  • Q90:           434.59 ms
  • Min:           190.37 ms
  • Max:           615.16 ms

📈 All Requests Combined (90 total):
  • Total:       39111.12 ms (39.11 s)
  • Average:       434.57 ms
  • Q10:            93.94 ms
  • Q50:           235.87 ms
  • Q90:          1180.17 ms

======================================================================
```


## California (Current Schema)
```
python cli.py test \
    --schema current \
    --api-url https://districtr-v2-451-api.fly.dev \
    --users 30 \
    --assignments-file ./assignments/california.json \
    --map-slug ca_congressional_districts \
    --chunk-requests 10 \
    --chunk-delay 1 \
    --user-delay 0.75
```
```
======================================================================
  DATABASE PERFORMANCE TEST RESULTS (CURRENT SCHEMA)
======================================================================

📊 Overview:
  • Total Users:       30
  • Total Requests:    330
  • Successful:        330
  • Failed:            0
  • Total Duration:    179111.43 ms (179.11 s)

📈 Create Document (30 requests):
  • Total:      156893.26 ms (156.89 s)
  • Average:      5229.78 ms
  • Q10:           810.06 ms
  • Q50:          5210.58 ms
  • Q90:          9650.65 ms
  • Min:           100.24 ms
  • Max:         10171.91 ms

📈 Update Assignments (300 requests):
  • Total:     4054468.29 ms (4054.47 s)
  • Average:     13514.89 ms
  • Q10:          5672.37 ms
  • Q50:         15152.01 ms
  • Q90:         17917.91 ms
  • Min:           790.63 ms
  • Max:         19101.83 ms

📈 All Requests Combined (330 total):
  • Total:     4211361.55 ms (4211.36 s)
  • Average:     12761.70 ms
  • Q10:          4723.82 ms
  • Q50:         14859.45 ms
  • Q90:         17854.51 ms

======================================================================
```
## California (New Schema)
```
python cli.py test \
    --schema new \
    --api-url https://districtr-v2-464-api.fly.dev \
    --users 30 \
    --assignments-file ./assignments/california.json \
    --user-delay 1 \
    --map-slug ca_congressional_districts
```
```
======================================================================
  DATABASE PERFORMANCE TEST RESULTS (NEW SCHEMA)
======================================================================

📊 Overview:
  • Total Users:       30
  • Total Requests:    90
  • Successful:        90
  • Failed:            0
  • Total Duration:    132170.25 ms (132.17 s)

📈 Create Document (30 requests):
  • Total:       35129.17 ms (35.13 s)
  • Average:      1170.97 ms
  • Q10:           449.05 ms
  • Q50:          1246.85 ms
  • Q90:          1765.86 ms
  • Min:           150.18 ms
  • Max:          1772.87 ms

📈 Get Assignments (30 requests):
  • Total:       25533.30 ms (25.53 s)
  • Average:       851.11 ms
  • Q10:           714.87 ms
  • Q50:           870.64 ms
  • Q90:           918.42 ms
  • Min:           661.36 ms
  • Max:           964.01 ms

📈 Update Assignments (30 requests):
  • Total:       75292.10 ms (75.29 s)
  • Average:      2509.74 ms
  • Q10:          2228.90 ms
  • Q50:          2410.12 ms
  • Q90:          2880.85 ms
  • Min:          2094.29 ms
  • Max:          3052.89 ms

📈 All Requests Combined (90 total):
  • Total:      135954.56 ms (135.95 s)
  • Average:      1510.61 ms
  • Q10:           713.35 ms
  • Q50:          1246.85 ms
  • Q90:          2721.03 ms

======================================================================
```
## Rhode Island (Current Schema)
```
python cli.py test \
    --schema current \
    --api-url https://districtr-v2-451-api.fly.dev \
    --users 30 \
    --assignments-file ./assignments/rhode_island.json \
    --map-slug ri_congressional_districts \
    --chunk-requests 10 \
    --chunk-delay 1 \
    --user-delay 0.75
```
```
======================================================================
  DATABASE PERFORMANCE TEST RESULTS (CURRENT SCHEMA)
======================================================================

📊 Overview:
  • Total Users:       30
  • Total Requests:    330
  • Successful:        330
  • Failed:            0
  • Total Duration:    31595.94 ms (31.60 s)

📈 Create Document (30 requests):
  • Total:        2526.58 ms (2.53 s)
  • Average:        84.22 ms
  • Q10:            56.98 ms
  • Q50:            70.39 ms
  • Q90:           120.73 ms
  • Min:            56.00 ms
  • Max:           168.92 ms

📈 Update Assignments (300 requests):
  • Total:       24283.70 ms (24.28 s)
  • Average:        80.95 ms
  • Q10:            57.74 ms
  • Q50:            70.36 ms
  • Q90:           116.08 ms
  • Min:            52.19 ms
  • Max:           322.03 ms

📈 All Requests Combined (330 total):
  • Total:       26810.28 ms (26.81 s)
  • Average:        81.24 ms
  • Q10:            57.52 ms
  • Q50:            70.36 ms
  • Q90:           117.94 ms

======================================================================
```
## Rhode Island (New Schema)
```
python cli.py test \
    --schema new \
    --api-url https://districtr-v2-464-api.fly.dev \
    --users 30 \
    --assignments-file ./assignments/rhode_island.json \
    --user-delay 1 \
    --map-slug ri_congressional_districts
```
```
======================================================================
  DATABASE PERFORMANCE TEST RESULTS (NEW SCHEMA)
======================================================================

📊 Overview:
  • Total Users:       30
  • Total Requests:    90
  • Successful:        90
  • Failed:            0
  • Total Duration:    36001.40 ms (36.00 s)

📈 Create Document (30 requests):
  • Total:       26727.50 ms (26.73 s)
  • Average:       890.92 ms
  • Q10:           381.44 ms
  • Q50:           925.05 ms
  • Q90:          1382.31 ms
  • Min:           200.00 ms
  • Max:          1392.22 ms

📈 Get Assignments (30 requests):
  • Total:        1951.24 ms (1.95 s)
  • Average:        65.04 ms
  • Q10:            57.69 ms
  • Q50:            61.89 ms
  • Q90:            67.93 ms
  • Min:            55.03 ms
  • Max:           133.38 ms

📈 Update Assignments (30 requests):
  • Total:        3524.33 ms (3.52 s)
  • Average:       117.48 ms
  • Q10:            94.35 ms
  • Q50:           111.95 ms
  • Q90:           142.53 ms
  • Min:            89.09 ms
  • Max:           228.41 ms

📈 All Requests Combined (90 total):
  • Total:       32203.08 ms (32.20 s)
  • Average:       357.81 ms
  • Q10:            59.25 ms
  • Q50:           114.03 ms
  • Q90:          1169.33 ms

======================================================================
```