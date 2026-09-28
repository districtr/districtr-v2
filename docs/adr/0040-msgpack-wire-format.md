# 40. msgpack wire format for assignment-heavy endpoints

Date: 2026-06-10 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Assignment-heavy endpoints paid the cost of Pydantic response validation and `JSON.parse`/`stringify` on both ends, plus JSON's per-row repeated dict keys, for data that is naturally tuple-shaped (PR #550).

## Decision

Use msgpack, not JSON, as the wire format for assignment-heavy endpoints: `GET /api/get_assignments/{id}` returns rows as 3-tuples (`[geo_id, zone, parent_path]`) rather than repeated-key dicts, `PUT /api/assignments` accepts a msgpack body (still validated against `AssignmentsCreate` after decode), and the connected-component bboxes endpoint responds in msgpack. Shared client helpers (`getMsgpack`/`putMsgpack`) keep each handler a few lines.

## Consequences

Assignment payloads drop both the JSON serialization/validation overhead and the per-row key repetition. Clients holding a stale bundle from before this cutover cannot decode the new wire format — this motivated the version-skew detection mechanism (ADR 0042) added the next day.
