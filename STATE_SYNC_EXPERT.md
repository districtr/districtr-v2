# STATE_SYNC_EXPERT

## Purpose
Define the sync model between local IndexedDB, in-memory stores, and server state, including conflict detection and resolution.

## When To Use
- You are changing document loading or map sync behavior.
- You are modifying conflict handling for local vs remote updates.
- You are changing persistence rules for assignments/metadata/comments.

## Canonical Files
- `app/src/app/utils/api/apiHandlers/fetchDocument.ts`
- `app/src/app/hooks/useDocumentWithSync.tsx`
- `app/src/app/store/assignmentsStore.ts`
- `app/src/app/store/mapStore.ts`
- `app/src/app/utils/idb/idb.ts`
- `app/src/app/hooks/useIdbDocument.tsx`
- `app/src/app/components/SyncConflictModal.tsx`
- `app/src/app/components/SaveConflictModal.tsx`

## Hard Invariants
- `updated_at` (server) and `clientLastUpdated` (local) semantics must remain distinct.
- Public document loads prefer server freshness; edit flows preserve local edits until resolved.
- Conflict resolution options must remain explicit (`use-local`, `use-server`, `keep-local`, `fork`).
- Assignment formatting must preserve shatter metadata (`parent_path`, parent/child maps).
- IDB writes for rapid paint updates remain debounced unless immediate flush is required.

## Preferred Patterns
- Reuse existing conflict interfaces and modal flow.
- Keep fetch/load logic centralized in `fetchDocument` + `useDocumentWithSync`.
- Persist both document metadata and assignments consistently.
- Use helper formatters to translate between API payloads and store maps.

## Anti-Patterns
- Silent overwrite of remote changes without conflict signaling.
- Treating `clientLastUpdated` as equivalent to server `updated_at`.
- Mutating IDB shape without updating read/write paths together.
- Skipping immediate flush before destructive/navigation-sensitive operations.

## Change Checklist
1. Validate no-conflict load path (local and remote both).
2. Validate conflict detection when remote is newer.
3. Validate each conflict-resolution branch behavior.
4. Validate local persistence integrity after resolution.
5. Validate assignment/shatter maps remain consistent.

## Validation Commands
- `cd app && bun run build`
- Manual sync scenario tests: remote newer, local newer, same timestamp, fork path.

## Common Failure Modes
- Duplicate/conflicting assignment sources applied to stores.
- Lost local edits due to premature remote preference.
- Incorrect conflict UI state lifecycle (modal stuck/open incorrectly).
- IDB stale metadata causing false conflict detection.
