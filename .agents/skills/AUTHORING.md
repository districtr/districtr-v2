# Authoring agent skills

Normative reference for writing and revising the skills in this directory. Synthesized
from Anthropic's official skill documentation (Claude Code skills reference, the Agent
Skills engineering post, and the platform best-practices guide — all as of 2026-08-27)
and from this repo's own principles about what content actually informs a competent
model. Where the two sources pull apart, the divergence is stated and grounded.

## How skills load (mechanics, verified 2026-08-27)

Skills load via **progressive disclosure**: (1) every skill's `name` + `description` is
pre-loaded into the system prompt at startup; (2) the SKILL.md body loads only when the
model judges the description relevant to the current task; (3) bundled files load only
when the work demands them, and bundled scripts execute without their source entering
context at all. The model itself is the router — there is no classifier or keyword
matcher. Two consequences:

- **The `name: description` line is the entire triggering mechanism.** The model decides
  from that text alone — see the next section for what that text has to look like.
- **Skills hold task-conditional content only.** Diffusely-relevant context (project
  priorities, team norms, overall architecture) has no trigger condition and belongs in
  the eagerly-loaded files (CLAUDE.md, AGENTS.md), not in a skill.

## How routing actually behaves (measured 2026-09-01)

An in-house experiment (~170 fresh `claude -p` runs against this repo, hooks disabled,
`learn-backend` as the subject, Haiku and Sonnet, 2–4 trials per cell) replaced several
assumptions about descriptions with observations. The large effects below were consistent
across cells; differences of one trial in four are noise. Scope: these findings describe
Claude Code's router with those two models. The other sync targets (Cursor, Codex) deliver
skills through different mechanisms and models, and were not measured — treat the
principles as untested hypotheses there.

- **Matching runs against the model's own restatement of the task.** Before its first
  tool call the model writes a one-sentence restatement in standard engineering
  vocabulary ("explore the backend data model…") and matches *that* against the
  `name: description` line. So the words that trigger are the model's nouns — backend,
  endpoint/route, API, data model, server, share link, public id — and house terms
  ("conventions", "notes", "invariants", "territory", "concern") match nothing.
  Precision vs. vagueness is the wrong axis; *whose vocabulary* is the right one.
- **Grammatical phrases, never keyword lists.** The same seven words as a readable phrase
  triggered 4/4 in every split between name and description; the same words scrambled
  triggered 0/12. Name and description are one line: words are interchangeable between
  them, the name is just one more phrase, and an opaque name costs nothing if the
  description carries the phrase.
- **Model choice dominates everything above.** Haiku invoked the skill in 3/72
  direct-task runs regardless of description, and in 0/20 indirectly framed runs even
  though 19 of them read files under the skill's territory — it never consults the
  skill listing, so for Haiku a skill exists only if something else injects it. Sonnet
  33/58 on direct tasks. Subagents almost never invoke skills (one invocation across the
  whole experiment). Anything delegated to a subagent gets its hard invariants stated
  in the spawn prompt, not left to routing.
Writing a description: use the plain engineering nouns a developer would say when
restating a task in this concern — that's the vocabulary the model produces, and guessing
it is normally enough. If a skill observably fails to load on tasks it should catch, then measure: run a
few agents on such tasks, read each one's first planning sentence, and take the nouns
from there.

Repo-specific delivery constraint: Claude Code discovers `.claude/skills/<name>/SKILL.md`
exactly one level deep. `scripts/sync-skills.sh` therefore flattens this directory's
grouping (e.g. `project/`) when syncing — verified empirically here on 2026-08-27, when
all 12 nested project skills turned out to have been invisible to native routing since
their creation. Skill names must be unique across groups (the sync errors on collision).

## Individuation: one skill per concern, not per surface

A skill's unit is a **concern** — a coherent body of relevance: a question the agent
needs answered, or a risk it must not trip. Not a file surface, not a tool. The same
surface edit expresses different concerns on different days: one `docker-compose.yml`
edit is about stack topology (`learn-infra`), another is about the memory limits that
have bitten the server before (`learn-performance`). Path- or keyword-based routing
cannot tell these apart; a description that names the concern lets the model route on
*why* it is working, not *where*.

- Descriptions cover every route into the concern, but in the model's own engineering
  nouns, as readable phrases (previous section) — "saving and syncing map edits:
  IndexedDB persistence, server sync, conflict resolution", with a "use when" clause
  naming the situations. Abstract concern-language ("whether user work is saved, lost,
  or conflicted") reads well to a human and matches nothing the model writes. The
  territory map inside the body names the files.
- Surfaces map many-to-many onto concerns, and that's expected.
- Skills that would always co-fire share one concern: merge them, and push sub-topic
  depth into `references/`.
- A cross-cutting concern gets its own skill even with no dedicated surface
  (`learn-performance` is the archetype).
Two trigger *types*, reflected in naming: **knowledge skills** (`learn-*`) load when
working within a concern — editing or debugging; **runbooks** (imperative names,
user-invocable) perform a procedure. Debugging guides attach to their concern's
knowledge skill as references — a symptom and an edit route through the same concern.

## Knowledge skills: declarative content, not rule lists

The dominant failure mode is a skill body made of DO/DON'T imperatives. Prefer
assertions: an assertion updates the model's world model, so it composes and transfers
to situations the author never anticipated; a bare rule applies only where its
antecedent matches, gives no guidance elsewhere, and gets over-applied where its grounds
have lapsed — because it never stated them. (Official guidance frames the same territory
as "degrees of freedom": high-freedom tasks get heuristics and objectives, low-freedom
tasks get exact steps. A knowledge skill is high-freedom by nature.)

The highest-value genres, roughly in order:

1. **Worked examples with commentary** — a good real instance (a migration, an
   endpoint, a metrics PR), annotated with why its choices were made. Best
   information-per-token; the model induces the policy from the example more faithfully
   than from an enumeration of the policy's clauses.
2. **Causal history** — what was tried, what failed, why the current shape exists
   ("we used X, hit Y, moved to Z"). This tells the model what problem the practice
   solves, and therefore when its justification stops applying. Date these entries
   ("as of the 2026-04 departitioning…") so staleness is detectable; fold superseded
   states into a collapsed "old patterns" note rather than deleting the why.
3. **Objective structure** — what the task optimizes for and what it trades away.
   Rules are cached outputs of running an objective against anticipated situations;
   given the objective, the model can run it on unanticipated ones.
4. **Map of the territory** — the load-bearing files, dependencies, and constraints
   ("three systems write this table"). Most bad agent actions stem from a false world
   model, not a missing rule.

Keep a *small* invariants section on top, each line marked as such and carrying its
one-line ground, in three cases only: invariants where re-derivation is unwanted
("never modify an applied migration — prod already ran it"), genuine conventions
(coordination points whose only rationale is consistency — say so), and compression
diffs against the model's priors ("SQLAlchemy-first here; raw SQL is the exception that
needs written justification"). Everything below the invariants is declarative.

Assume the model is already smart: cut any sentence it could have written itself.
Every body line competes with conversation history once loaded.

## Runbooks: procedure, scripts, feedback loops

For runbooks the official procedural patterns apply directly:

- Sequential steps; for long workflows, a copyable checklist the agent ticks off.
- **Feedback loops**: run validator → fix → re-run; gate progress on the validator
  passing. For batch or destructive operations, add a verifiable intermediate plan
  (emit a plan file, validate it with a script, then execute).
- **Scripts solve, they don't defer**: handle error conditions inside the script with
  specific messages; justify every constant. State explicitly whether the agent should
  *run* a script or *read* it as reference — these are different instructions.
- Reference bundled scripts via `${CLAUDE_SKILL_DIR}/scripts/…` so they resolve from
  any working directory.
- Offer one default approach with an escape hatch, never a menu of alternatives.

## Structure and mechanics

- Frontmatter: `name` ≤ 64 chars, lowercase/digits/hyphens; `description` ≤ 1,024 chars,
  written in third person (it is injected into the system prompt). Claude Code truncates
  the listing entry at 1,536 chars. The Agent Skills spec's portable fields are `name`,
  `description`, `license`, `compatibility`, `metadata`, `allowed-tools`; fields like
  `user-invocable` (hides the skill from the `/` menu) and `disable-model-invocation`
  (blocks auto-loading) are Claude Code extensions — fine here, since the sync targets
  strip or ignore frontmatter.
- Keep the SKILL.md body under ~500 lines; split into `references/` when approaching it.
- References link **one level deep from SKILL.md** — a reference that points to further
  references gets partially read. Give any reference file over ~100 lines a table of
  contents. Name files by content (`gis-validation.md`, not `doc2.md`).
- `references/` (plural) and `scripts/` are the bundled-directory conventions the sync
  script understands; Cursor sync inlines `references/*.md` and skips `scripts/`.

## Review checklist

Four failure modes recur in skill drafts (all four were found and cut from the first
`learn-backend` draft, 2026-08-28). Check each before committing a new or revised skill:

1. **Invented rationale.** Where the code doesn't state a *why*, don't supply a
   plausible one — it reads as authoritative and, when wrong, plants a false belief no
   agent would have formed from the code alone. A stated rationale must trace to a PR,
   commit, code comment, or verified structural fact. If none exists, state the fact
   without a why — or mark the rationale as unconfirmed and ask a maintainer; many
   design decisions have no written record, and a human answer is the only source.
2. **Sentence-level derivability.** For each sentence ask: would an agent standing at
   the relevant code already see this? A paraphrase of a docstring or inline comment is
   worse than the source — it says the same thing, away from the code, and can drift.
   Cut at the sentence level, not just the section level.
3. **Description where a decision rule is needed.** If the point is a rule, state the
   rule; describing the parts and letting the reader induce the rule invites a wrong
   induction. The descriptions are evidence for the rule, not a substitute for it.
4. **Structure inflation.** A one-payload fact doesn't earn a `##` section — the section
   form pressures padding, and the padding restates context that lives elsewhere in the
   file. A dense bullet in an existing section usually carries it. Check that Territory
   / See-also pointers aren't duplicated into body prose.

## Will a point earn its lines? (ablation-tested 2026-09-01)

Point-ablation runs — 20 randomly sampled points across this directory, Sonnet forced to
load the skill with and without the single point, round-two predictions registered in
advance (8/10 correct) — reduce the value question to four checks, asked in order:

1. **Prior-derivable?** Would a competent engineer with no access to this repo say the
   same thing? Generic accessibility, CSS-performance, and Postgres lore all tested
   derivable: the model states them unprompted, rule present or absent. Cut.
2. **Path-derivable?** Does the agent's working path pass the evidence — code structure
   that embodies the lesson, neighboring methods it will imitate, or the rest of this
   same file? Both sampled causal-history bullets tested derivable because their own
   file's surrounding sections already entailed the conclusion. Cut, or merge into what
   carries it — but weigh what kind of evidence the path holds. *Structural* evidence (a
   dedicated component existing is itself the answer) and a *normative statement at a
   choke point* (a docstring on the function every caller touches — read every time,
   where a skill loads only sometimes) justify the cut. *Conformity of instances*
   (every existing method happens to open with the guard) does not: imitation is
   descriptive, propagates drift instead of correcting it, and one noncompliant
   instance starts teaching the opposite. There, keep the skill's line, or first move
   the rule to a real choke point and then cut. And check provenance: path evidence
   that descends from the skill itself (a copied comment) confirms nothing.
3. **What survives is arbitrary selection among defensible alternatives** — team policy,
   style convention, design intent underdetermined by the code. Both load-bearing points
   were this kind (a deploy-workflow policy; a punctuation convention): each flipped
   behavior cleanly when ablated. A convention is incompressible — nothing else can
   re-derive a choice that could have gone the other way — and that is precisely the
   content a skill exists to carry.
4. **Application gate, on every verdict**: will the model recognize the situation where
   the point applies? A known rule that never fires behaves inert — the active-voice
   rule went unapplied with a planted passive sentence in plain view, and one line
   among ninety has no salience. A point kept under check 3 still needs a trigger the
   model actually notices.

Caution from the same study: load-bearing means the point *changes behavior*, and says
nothing about whether the behavior it produces is right — the study's strongest point
flipped answers toward a rule later found overbroad and rewritten. Ablation measures
leverage; review measures truth.

## Maintenance

Skills are normative and versioned: when practice and skill diverge, either the change
was wrong or the skill needs a deliberate revision. Recording rationale is what makes
revision possible — a rule whose grounds are documented can be retired when the grounds
lapse; an unexplained rule ossifies.

Write skills from observed gaps, not anticipated ones: the trigger for a new skill (or a
revision) is a session that repeatedly surfaced the same correction, the same missing
context, or the same "this team always does X." After shipping, watch how agents
actually use the skill — a reference file that is never opened is unnecessary or badly
signaled; one that is opened every time belongs in the body; an agent that goes off
track while holding the skill is telling you what context it actually needed.
