# Authoring agent skills

Normative reference for writing and revising the skills in this directory. The agents
these files serve already have general engineering capability and can recover most
facts about the codebase by browsing it. A skill or CLAUDE.md exists for three kinds
of content that the repository cannot say by itself: (1) recurring procedures in
development, (2) project-specific norms and values, and (3)
terminology seams — places where one concept has several names across code/UI/external data, one name covers several concepts, or a name misleads.
(Principles here are grounded in Anthropic's skill documentation and this repo's own
routing and point-ablation measurements — the experimental record lives in PR #740.)

## How skills load (mechanics)

Skills load via **progressive disclosure**: (1) every skill's `name` + `description` is
pre-loaded into the system prompt at startup; (2) the SKILL.md body loads only when the
model judges the description relevant to the current task; (3) bundled files load only
when the work demands them, and bundled scripts execute without their source entering
context at all. The model itself is the router — there is no classifier or keyword
matcher. The `name: description` line is therefore the entire triggering mechanism for
model-invoked skills. Under context compaction only roughly the first 5k tokens of a
loaded SKILL.md survive — front-load the most important lines.

Repo-specific delivery constraint: Claude Code discovers `.claude/skills/<name>/SKILL.md`
exactly one level deep; `scripts/sync-skills.sh` therefore flattens any source grouping
when syncing, and skill names must stay unique (the sync errors on collision).

## Descriptions

A description is a guess at the developer's intention at the moment of need, and the
guess differs by content kind. For a recurring procedure it is trivial: say what the
task does. For terminology there is no general recipe — a misleading name generates no
lookup impulse at all — so discovery needs case-by-case judgment. Norms are the other
hard case: a norm binds across many intentions, and none of them announces the norm's
own category — an agent adding an endpoint has no reason to look up "security norms" —
so enumerate the intentions under which the norm binds, and write the description in
those situations' vocabulary. Descriptions are therefore written last, as discovery
plans for an already-fixed norm inventory (see the revision procedure).

Supporting mechanics:

- The router matches against the model's own one-sentence restatement of the task,
  written in standard engineering vocabulary — so trigger on the model's nouns
  (backend, endpoint, data model, share link); house terms ("conventions",
  "invariants", "territory", "concern") match nothing. Precision vs. vagueness is the
  wrong axis; *whose vocabulary* is the right one.
- Write in third person, as grammatical phrases — a scrambled keyword list matches
  nothing. Name and description act as one line: words are interchangeable between
  them, and an opaque name costs nothing if the description carries the phrase.
- A wrong or misleading description vetoes invocation outright; tuning a correct one
  yields little. Guess the nouns — that is normally enough. If a skill observably
  fails to load on tasks it should catch, then measure: run a few agents on such
  tasks, read each one's first planning sentence, and take the nouns from there.
- Smaller models and subagents rarely consult the skill listing at all. Anything
  delegated to a subagent gets its hard invariants stated in the spawn prompt, not
  left to routing.

## The content test: keep only what the code can't speak

For every passage ask: could an agent recover this in a couple of minutes of
glob/grep/read? If yes, delete it — it is a stale-prone paraphrase of ground truth.
Point-ablation testing here bears this out: points stating generic engineering lore,
or content the file's own surroundings entail, produce identical agent behavior with
the line absent; the points that change behavior are the incompressible ones.

What survives falls into four categories, in descending value:

1. **Norms** — the forbidden-but-possible, and what counts as better here, including
   standards the current code sometimes violates. These are needed most exactly where
   imitation of existing code would transmit the violation: conformity of instances is
   descriptive, propagates drift instead of correcting it, and one noncompliant
   instance starts teaching the opposite. A norm is incompressible — nothing else can
   re-derive a choice that could have gone the other way. Where a norm can live as a
   statement at a real choke point instead (a docstring on the function every caller
   touches — read every time, where a skill loads only sometimes), put it there and cut
   the skill line; and treat path evidence that descends from the skill itself (a
   copied comment) as confirming nothing.

   **State a norm at the most fundamental level that still permits inference.** "The
   document UUID is proprietary — possession grants edit rights" reaches returning it,
   logging it, exporting it, embedding it in a URL — situations no function-level rule
   enumerates — and survives changes to the function inventory; a function-level rule
   ("use X when returning documents") can steer behavior strongly and still be wrong
   at the edges. The check against over-abstraction is inferability: an agent holding
   the norm plus the code must be able to derive the concrete behavior. Granularity
   also settles placement: a fundamental norm's trigger is diffuse (undetectable
   need → CLAUDE.md, and fundamental norms are short); a situation-bound norm's
   trigger is detectable (→ a skill).
2. **Terminology seams** — places where one concept has several names across code, UI,
   and external data; one name covers several concepts; or a name misleads.
3. **Reasoned absences** — things an agent would expect to exist and might reimplement
   ("no ORM on purpose"; "X is deliberately uncached because…").
4. **Lexically hidden structure** — logic living in infra config, dynamic imports,
   cross-system contracts no grep can find (two write paths that must agree and never
   reference each other).

Plain descriptions of visible structure — file maps, restated function behavior — get
cut unless they fall under (4). Worked examples and causal history earn their lines
only as carriers of the categories above: an annotated example that transmits a norm,
a history that grounds a reasoned absence. History as narrative fails the test.

Prefer assertions over DO/DON'T imperatives for all of it: an assertion updates the
model's world model and transfers to situations the author never anticipated; a bare
rule applies only where its antecedent matches and gets over-applied where its grounds
have lapsed — because it never stated them.

Two gates on every kept point:

- **Application**: will the model recognize the situation where the point applies? A
  known rule that never fires behaves inert — a style rule buried in a ninety-line list
  goes unapplied even with a violation in plain view. A point worth keeping needs a
  trigger the model actually notices.
- **Leverage is not truth**: a point can reliably steer agents toward a rule that is
  itself wrong. Ablation measures leverage; review measures truth.

## Placement: route by detectability of need

Where a surviving point lives depends on whether an agent can *detect that it needs
it*, not on the point's content type:

- **Undetectable need → CLAUDE.md.** Knowledge that must correct an agent before it
  knows it's wrong — terminology traps, cross-cutting norms — cannot be retrieved:
  skill loading is gated on recognized relevance, and confident error generates no
  retrieval signal. CLAUDE.md taxes every session, so it must stay small; the content
  that belongs there is inherently small, and if it isn't, something is misrouted.
- **Request-triggered → a skill, via its description** (the routing section above).
- **Subsystem-scoped → a skill gated on `paths` globs**: norms and seam documentation
  that apply whenever certain files are touched, regardless of how the task was framed.
- **Human-useful, agent-derivable → docs, not skills.** Orientation material a person
  needs but an agent can rebuild from the code (architecture overviews, file maps)
  belongs in `docs/` or AGENTS.md's human-facing sections. When writing a passage, ask
  who it serves; the two audiences fail differently, and skills serve only the agent.

## Individuation: one skill per concern, not per surface

A skill's unit is a **concern** — a coherent body of relevance: a question the agent
needs answered, or a risk it must not trip. Not a file surface, not a tool. The same
surface edit expresses different concerns on different days: one `docker-compose.yml`
edit is about stack topology (`learn-infra`), another is about the memory limits that
have bitten the server before (`learn-performance`). A description that names the
concern lets the model route on *why* it is working, not *where*.

- Surfaces map many-to-many onto concerns, and that's expected.
- Skills that would always co-fire share one concern: merge them, and push sub-topic
  depth into `references/`.
- A cross-cutting concern gets its own skill even with no dedicated surface
  (`learn-performance` is the archetype).

Two trigger *types*, reflected in naming: **knowledge skills** (`learn-*`) load when
working within a concern — editing or debugging; **runbooks** (imperative names,
user-invocable) perform a procedure. Debugging guides attach to their concern's
knowledge skill as references — a symptom and an edit route through the same concern.

## Form

- **Terminology as a concordance, not a glossary**: keyed by concept, listing the code
  name, the user-facing name, the external-system name, and the actual meaning — with
  only imperfect correspondences included (exact synonymy needs no row). Where the
  translation between vocabularies is localized in code (an adapter or importer
  module), reduce the entry to a pointer to that module.
- **Norms under their own header** (e.g. "Constraints"), separate from terminology,
  each carrying its one-line ground.
- **Durable phrasing** over anything version- or date-bound. For facts that stay
  volatile (routes, schema), prefer generated context or a script over hand-written
  description; where a volatile claim must be written by hand, date it so staleness is
  detectable.
- One consistent term per concept throughout a skill.

## Runbooks: procedure, scripts, feedback loops

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
  third person (it is injected into the system prompt). Claude Code truncates the
  listing entry at 1,536 chars. `user-invocable: false` for pure background knowledge;
  never `context: fork` for reference content. Fields like `user-invocable` and
  `disable-model-invocation` are Claude Code extensions — fine here, since the sync
  targets strip or ignore frontmatter.
- Front-load each SKILL.md: the most important lines first (compaction keeps ~5k
  tokens). Keep the body well under ~500 lines; split into `references/` early.
- References link **one level deep from SKILL.md** — a reference that points to further
  references gets partially read. Give any reference file over ~100 lines a table of
  contents. Name files by content (`gis-validation.md`, not `doc2.md`).
- `references/` (plural) and `scripts/` are the bundled-directory conventions the sync
  script understands; Cursor sync inlines `references/*.md` and skips `scripts/`.

## Review checklist

Four failure modes recur in skill drafts. Check each before committing a new or revised
skill:

1. **Invented rationale.** Where the code doesn't state a *why*, don't supply a
   plausible one — it reads as authoritative and, when wrong, plants a false belief no
   agent would have formed from the code alone. A stated rationale must trace to a PR,
   commit, code comment, or verified structural fact. If none exists, state the fact
   without a why — or mark the rationale as unconfirmed and ask a maintainer; many
   design decisions have no written record, and a human answer is the only source.
2. **Sentence-level derivability** — the content test above, applied per sentence, not
   just per section. A paraphrase of a docstring or inline comment is worse than the
   source: it says the same thing, away from the code, and can drift.
3. **Description where a decision rule is needed.** If the point is a rule, state the
   rule; describing the parts and letting the reader induce the rule invites a wrong
   induction. The descriptions are evidence for the rule, not a substitute for it.
4. **Structure inflation.** A one-payload fact doesn't earn a `##` section — the section
   form pressures padding, and the padding restates context that lives elsewhere in the
   file. A dense bullet in an existing section usually carries it.

## Revision procedure

Do not add content by introspection or completeness instinct — insider enumeration of
seams and norms is unreliable (the curse of knowledge: resolved ambiguities don't rise
to attention). Instead:

1. Apply the content test to everything existing; expect the first pass to be net
   deletion — if the revised files are longer than the originals, the test was
   misapplied.
2. Fix the norm inventory before anything else: write out the norms that survive, and
   set each one's granularity (most fundamental level that still permits inference).
   Skill boundaries emerge from partitioning that inventory by binding situation —
   they are an output of this step, not an input to it.
3. Re-route what survives per the placement rule, and only then write descriptions —
   discovery plans for the now-fixed inventory.
4. Treat the result as a floor, grown only by **trace evidence**: when an agent is
   observed grepping the wrong term, conflating concepts, rebuilding something that
   exists under another name, or violating a standard, add the one line that would have
   prevented it, in the right location. Bias every judgment call toward brevity: an
   omission discovered by trace costs one bad session; a bloated always-loaded file
   costs every session.

Skills are normative and versioned: when practice and skill diverge, either the change
was wrong or the skill needs a deliberate revision. A rule whose grounds are documented
can be retired when the grounds lapse; an unexplained rule ossifies. After shipping,
watch usage — a reference file that is never opened is unnecessary or badly signaled;
one opened every time belongs in the body; an agent that goes off track while holding
the skill is telling you what context it actually needed.
