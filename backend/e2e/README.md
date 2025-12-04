# Districtr Database Performance Testing Harness

A CLI tool for testing database performance when creating documents and uploading district assignments. Supports both the **current** (incremental) and **new** (atomic) update schemas.

## Installation

The dependencies are already included in the main backend `requirements.txt`. If you need to run this standalone:

```bash
pip install click httpx
```

## Usage

### Basic Test

```bash
# Navigate to e2e directory
cd backend/e2e

# Test current schema (incremental updates) with 5 users
python cli.py test \
    --schema current \
    --api-url http://localhost:8000 \
    --users 5 \
    --assignments-file assignments.json \
    --map-slug ca_congressional_districts \
    --chunk-requests 10

# Test new schema (atomic updates) with 5 users
python cli.py test \
    --schema new \
    --api-url http://localhost:8000 \
    --users 5 \
    --assignments-file assignments.json \
    --map-slug ca_congressional_districts
```

### Commands

#### `test` - Run Performance Test

Run a performance test against the Districtr API.

```bash
python cli.py test [OPTIONS]
```

**Options:**
| Option | Required | Description |
|--------|----------|-------------|
| `--schema` | Yes | Schema type: `current` (incremental) or `new` (atomic) |
| `--api-url` | Yes | Base URL of the API (e.g., `http://localhost:8000`) |
| `--users` | No | Number of simultaneous users (default: 1) |
| `--assignments-file` | Yes | Path to JSON file containing assignments |
| `--map-slug` | Yes | Districtr map slug for document creation |
| `--chunk-requests` | No | Number of requests to break assignments into (current schema only, default: 1) |
| `--chunk-delay` | No | Delay in seconds between chunks within a user's session (current schema only, default: 0) |
| `--user-delay` | No | Current schema: staggered start time between users. New schema: delay between update requests. (default: 0) |
| `--sequential` | No | Run users sequentially instead of concurrently |
| `--verbose` | No | Enable verbose output |
| `--output-json` | No | Path to save results as JSON |

**Examples:**

```bash
# Test current schema with 10 chunks per user, 100ms delay between chunks
python cli.py test \
    --schema current \
    --api-url https://districtr-v2-451-api.fly.dev \
    --users 10 \
    --assignments-file california_districts.json \
    --map-slug ca_congressional_districts \
    --chunk-requests 10 \
    --chunk-delay 0.1

# Test current schema with staggered users (500ms between each user's updates)
python cli.py test \
    --schema current \
    --api-url https://districtr-v2-451-api.fly.dev \
    --users 5 \
    --assignments-file california_districts.json \
    --map-slug ca_congressional_districts \
    --chunk-requests 10 \
    --user-delay 0.5

# Test new schema with staggered updates (500ms delay between each user's update)
python cli.py test \
    --schema new \
    --api-url https://districtr-v2-464-api.fly.dev \
    --users 5 \
    --assignments-file california_districts.json \
    --map-slug ca_congressional_districts \
    --user-delay 0.5

# Save results to JSON
python cli.py test \
    --schema new \
    --api-url http://localhost:8000 \
    --users 5 \
    --assignments-file assignments.json \
    --map-slug test_map \
    --output-json results.json
```

#### `generate-sample` - Generate Sample Assignments

Create a sample assignments file for testing.

```bash
python cli.py generate-sample [OPTIONS]
```

**Options:**
| Option | Description |
|--------|-------------|
| `-o, --output` | Output file path (required) |
| `-n, --count` | Number of assignments to generate (default: 100) |
| `-z, --zones` | Number of zones/districts (default: 4) |

**Example:**

```bash
# Generate 5000 sample assignments with 10 districts
python cli.py generate-sample -o sample.json -n 5000 -z 10
```

#### `sweep` - Parameter Sweep

Run multiple tests with varying user counts.

```bash
python cli.py sweep [OPTIONS]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--schema` | Schema type (required) |
| `--api-url` | Base URL of the API (required) |
| `--assignments-file` | Path to assignments JSON (required) |
| `--map-slug` | Districtr map slug (required) |
| `--min-users` | Minimum number of users (default: 1) |
| `--max-users` | Maximum number of users (default: 10) |
| `--step` | User count step size (default: 1) |
| `--output-json` | Path to save sweep results |

**Example:**

```bash
# Test with 1, 5, 10, 15, 20 concurrent users
python cli.py sweep \
    --schema new \
    --api-url http://localhost:8000 \
    --assignments-file assignments.json \
    --map-slug ca_congressional_districts \
    --min-users 1 \
    --max-users 20 \
    --step 5 \
    --output-json sweep_results.json
```

#### `health` - Check API Health

Verify the API is reachable.

```bash
python cli.py health --api-url http://localhost:8000
```

## Assignments File Format

The assignments file should be a JSON file with one of the following formats:

### Array Format

```json
[
    {"geo_id": "06001020100", "zone": 1, "parent_path": null},
    {"geo_id": "06001020200", "zone": 1, "parent_path": null},
    {"geo_id": "06001020300", "zone": 2, "parent_path": null}
]
```

### Object Format

```json
{
    "assignments": [
        {"geo_id": "06001020100", "zone": 1, "parent_path": null},
        {"geo_id": "06001020200", "zone": 1, "parent_path": null},
        {"geo_id": "06001020300", "zone": 2, "parent_path": null}
    ]
}
```

**Fields:**
- `geo_id` (string): The census geography identifier
- `zone` (number | null): The district number (1-indexed) or null if unassigned
- `parent_path` (string | null): Parent geography path (new schema only)

## Output

### Console Output

The CLI outputs detailed timing statistics:

```
======================================================================
  DATABASE PERFORMANCE TEST RESULTS (NEW SCHEMA)
======================================================================

📊 Overview:
  • Total Users:       5
  • Total Requests:    10
  • Successful:        10
  • Failed:            0
  • Total Duration:    2345.67 ms (2.35 s)

📈 Create Document (5 requests):
  • Average:      123.45 ms
  • Q10:           98.23 ms
  • Q50:          120.00 ms
  • Q90:          145.67 ms
  • Min:           95.00 ms
  • Max:          150.00 ms

📈 Update Assignments (5 requests):
  • Average:      345.67 ms
  • Q10:          289.00 ms
  • Q50:          340.00 ms
  • Q90:          410.00 ms
  • Min:          280.00 ms
  • Max:          450.00 ms

📈 Get Assignments (5 requests):  # New schema only
  • Average:       85.23 ms
  • Q10:           72.00 ms
  • Q50:           84.00 ms
  • Q90:           98.00 ms
  • Min:           70.00 ms
  • Max:          105.00 ms

======================================================================
```

### JSON Output

When using `--output-json`, results are saved in a structured format:

```json
{
  "schema": "new",
  "total_users": 5,
  "total_requests": 15,
  "total_duration_ms": 2345.67,
  "successful_requests": 15,
  "failed_requests": 0,
  "statistics": {
    "create_document": {
      "count": 5,
      "avg": 123.45,
      "q10": 98.23,
      "q50": 120.00,
      "q90": 145.67,
      "min": 95.00,
      "max": 150.00
    },
    "update_assignments": {
      "count": 5,
      "avg": 345.67,
      "q10": 289.00,
      "q50": 340.00,
      "q90": 410.00,
      "min": 280.00,
      "max": 450.00
    },
    "get_assignments": {
      "count": 5,
      "avg": 85.23,
      "q10": 72.00,
      "q50": 84.00,
      "q90": 98.00,
      "min": 70.00,
      "max": 105.00
    }
  },
  "timings": [...]
}
```

## Schema Differences

### Current Schema (Incremental)

- Uses `POST /api/create_document` with `user_id`
- Uses `PATCH /api/update_assignments` for incremental updates
- Supports chunking assignments into multiple requests
- Each request only sends a subset of assignments
- **Concurrent users with staggered starts**: Users run their full sessions (create + all chunk updates) concurrently, but start times are staggered by `--user-delay`
- **Chunk delay**: Configurable delay between each chunk within a user's session (simulates incremental painting)

**Example with 3 users, `--user-delay 1.0`, `--chunk-delay 0.2`:**
```
t=0.0s: User 1 starts → create → chunk1 → [0.2s] → chunk2 → [0.2s] → chunk3
t=1.0s: User 2 starts → create → chunk1 → [0.2s] → chunk2 → [0.2s] → chunk3
t=2.0s: User 3 starts → create → chunk1 → [0.2s] → chunk2 → [0.2s] → chunk3
```
All users run concurrently/overlapping, simulating realistic multi-user load.

### New Schema (Atomic)

- Uses `POST /api/create_document` (no user_id required)
- Uses `PUT /api/assignments` for atomic updates
- Sends all assignments in a single request
- Supports `overwrite` flag for full replacement
- **Automatically fetches assignments** via `GET /api/get_assignments/{document_id}` after each update (simulates client reload behavior)
- **Phased execution**: Creates all documents concurrently first, then runs update requests sequentially with configurable delay between each user's update

**Example with 3 users, `--user-delay 0.5`:**
```
Phase 1 (concurrent): All users create documents simultaneously
Phase 2 (sequential): User 1 update+get → [0.5s] → User 2 update+get → [0.5s] → User 3 update+get
```

## Tips

1. **Start with generate-sample**: Create test data before running against production
2. **Use health check first**: Verify API connectivity before running tests
3. **Compare schemas**: Run the same test with both schemas to compare performance
4. **Use sweep for load testing**: Gradually increase users to find breaking points
5. **Save results**: Always use `--output-json` for later analysis

