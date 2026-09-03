# Agent Instructions

> **`.agents/` is the canonical, git-committed directory** for all agent configuration
> and skills (including project guides). Agent-specific directories (`.claude/`, `.cursor/`, `codex.md`)
> are gitignored sync targets — see [Skills](#skills) below.

## Issue Tracking

**bd (beads >=1.0.0, optional)** tracks all work — never ad-hoc TODO lists. Claude
sessions get the full command reference and session-close protocol injected by the
SessionStart hook; other agents (and humans) run `bd prime` for the same. Install:
`brew install steveyegge/beads/bd`.

## Skills

`.agents/skills/` is the canonical, git-tracked source; `.claude/`, `.cursor/`, and
`codex.md` are gitignored build artifacts. Edit skills in `.agents/skills/` only, then
run `./scripts/sync-skills.sh` (`--help` for targets). Read
[`skills/AUTHORING.md`](./skills/AUTHORING.md) before writing or revising a skill.

## Project Skills

Skills live in `.agents/skills/`, in two kinds: **norm skills** (project norms and
vocabulary the repository can't state about itself, loaded when working in their
situations) and **`run-*` runbooks** (procedures, invoked when the task is the
procedure). Each `SKILL.md`'s frontmatter description is its trigger and the
authoritative summary — agents receive all of them at session start via their sync
target, so there is no separate index to maintain. Orientation deliberately lives in
`docs/`, not in skills.

## Session Completion

Base work on the `dev` branch. When ending a session: close/update bd issues and
file follow-ups; run the quality gates for whatever the diff touched (see
`run-quality-gate`); then `git pull --rebase && git push` — work is complete only
when `git status` shows up to date with origin. Never stop before pushing, and
never hand the push back to the human.
