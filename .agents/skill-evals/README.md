# Skill-cut challenge evals

Challenge tests for the 2026-09-03 skills rebuild: each case targets a **cut** piece of
skill content that had the strongest prior claim to being load-bearing, and asks
whether agent behavior degrades without it. Cases are deliberately adversarial toward
the cut decisions — a case "passes" (the cut was safe) only when the without-content
arm still behaves correctly.

## Format and how to run

Cases follow the official `claude plugin eval` layout (`evals/<case>/prompt.md` +
`evals/<case>/graders/*.md`) so the suite runs natively once early access is enabled
(`claude plugin eval --eval-dir .agents/skill-evals/evals <target>`; as of 2026-09-03
this install prints the early-access notice, so the command cannot run yet).

Until then, `run-arms.sh` implements the published evaluation-driven pattern by hand:

- **Arm A (current)**: fresh `claude -p` session against an isolated copy of the repo
  with the rebuilt skills (the cut content absent from skills; some of it lives in
  `docs/`, which the agent may or may not read — that placement is part of what's
  under test).
- **Arm B (pre-rebuild)**: same, with `.claude/skills/` restored from the pre-rebuild
  commit (cut content present in force-loadable skills).
- Both arms: read-only tools + Skill, `--max-turns 30`, 2–3 trials per arm, stream-json
  transcripts kept under `results/`.

Grade each transcript against the case's `graders/*.md` rubric (LLM-graded: read the
transcript, apply the rubric verbatim). The suite is small enough to grade by reading.

## Interpreting results

- Arm A correct ⇒ the cut is confirmed safe (the model derived or didn't need the
  content).
- Arm A wrong, Arm B correct ⇒ the cut removed load-bearing content: restore the one
  line, at the placement AUTHORING's rules dictate — not necessarily back into a skill.
- Both arms wrong ⇒ the content never worked as written (an application failure, per
  the ablation study's "inert" category); a skill line is not the fix.

## The five cases and why these cuts

| Case | Cut under test | Why it's the strongest challenger |
|---|---|---|
| `sync-merge-simplify` | F15 server-owned merge fields ("clear from reading the code") | Nothing at the merge site says *why* `overlays`/`statefps` are special-cased; a simplification pass may delete the exception. |
| `moderation-filter` | F13 masked-not-omitted | Filtering rejected comments out looks like a clean payload win; the counts-truthfulness ground is invisible at the endpoint. |
| `feature-state-key` | F4 one-owner-per-feature-state-key ("model already knows MapLibre semantics") | Tests the knowledge-vs-attention distinction directly: will an agent check for existing writers of a key before reusing it? |
| `county-brush-debug` | The onboarding-metadata knowledge family (F9/F15 territory) | Grounded in real history: `statefps` isn't auto-filled by the onboarding CLI (open issue #633) and county behavior silently early-returns without it (`mapEvents.ts`) — a silent, currently-live new-module failure. |
| `share-token-expiry` | F17 aud/exp separation | The plausible "improvement" (add expiry to share tokens) is exactly the change the cut norm forbade; the boundary lives across two files. |
