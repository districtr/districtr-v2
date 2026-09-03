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

Progressive disclosure, frontmatter fields, and discovery rules are official-docs
territory: https://code.claude.com/docs/en/skills. The operative consequences: the
`name: description` line is the entire triggering mechanism for model-invoked skills
(the model itself is the router), and under context compaction only roughly the first
5k tokens of a loaded SKILL.md survive — front-load the most important lines.

Repo-specific delivery constraint: Claude Code discovers `.claude/skills/<name>/SKILL.md`
exactly one level deep; `scripts/sync-skills.sh` therefore flattens any source grouping
when syncing, and skill names must stay unique (the sync errors on collision).
`references/` and `scripts/` are the bundled-directory conventions the sync script
understands; Cursor sync inlines `references/*.md` and skips `scripts/`.

## What to include

1. **Runbooks** — the paradigmatic kind of skill: the step-by-step procedure for
   executing a task. Procedural patterns (checklists, validator feedback loops,
   bundled scripts, one default approach) are well covered by the official guide:
   https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.

2. **Norms/Value** — the forbidden-but-possible, and what counts as better here, including
   standards the current code sometimes violates.

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

3. **Terminology seams** — places where one concept has several names across code, UI,
   and external data; one name covers several concepts; or a name misleads.

## What NOT to include

For every passage ask: could an agent recover this in a couple of seconds of
glob/grep/read? If yes, delete it — it is a drift-prone paraphrase of ground truth.
Point-ablation testing here bears this out: points stating generic engineering lore,
or content the file's own surroundings entail, produce identical agent behavior with
the line absent; the points that change behavior are the incompressible ones.

The official include/exclude table under "Write an effective CLAUDE.md"
(https://code.claude.com/docs/en/best-practices) says the same for the eagerly-loaded
file and applies here unchanged — with one reading note: its "architectural decisions
specific to your project" (include) means the *decisions*, which are norms and reasoned
absences; an architecture *overview* is triggerless orientation and lives in
`.agents/ARCHITECTURE.md` instead.

The test weighs derivation cost against drift rate. Plain descriptions of visible
detail — file maps, restated function behavior — are cheap to re-derive and drift
fast: leave them out. A system-level architecture overview is the opposite case —
expensive to infer and slow to drift — so it earns a documentation home
(`.agents/ARCHITECTURE.md`) despite being derivable; it still has no place in a
skill, since orientation has no trigger. Examples and causal history earn their lines
only as carriers of the categories above: an annotated example or a history that
transmits a norm, or terminological idiosyncrasies.


## Placement: route by detectability of need

Where a skills lives depends on whether an agent can *detect that it needs
it*:

- **Undetectable need → CLAUDE.md.** Knowledge that must correct an agent before it
  knows it's wrong — terminology traps, cross-cutting norms — cannot be retrieved:
  skill loading is gated on recognized relevance, and confident error generates no
  retrieval signal. CLAUDE.md taxes every session, so it must stay small; the content
  that belongs there is inherently small, and if it isn't, something is misrouted.
- **Request-triggered → a skill, via its description** (the routing section above).
- **Subsystem-scoped → a skill gated on `paths` globs**: norms and seam documentation
  that apply whenever certain files are touched, regardless of how the task was framed.

Content that is real but has no skill-shaped trigger goes elsewhere:

- **Triggerless orientation → docs, not skills.** Material that orients rather than
  corrects — architecture overviews, file maps — has no moment of need to route on and
  belongs in the documentation layer (`.agents/ARCHITECTURE.md`, AGENTS.md, `docs/`),
  where both humans and agents read it eagerly. When writing a passage, ask who it
  serves and when: skills serve only the agent, at a detectable moment.
- **Related to a specific line of code** For instance, if a suggestion is related to the
  function every caller touches, put it as a docstring, which is read every time. Remove
  it from skills.

## Specifying skill discoverability: how to write skill descriptions

A description is a guess at the developer's intention at the moment of need, and the
guess differs by content kind. For a recurring procedure it is trivial: say what the
task does. For terminology and norms there are no general recipe — a misleading name generates no
lookup impulse at all, and a norm/values binds across many intentions — so discovery
needs case-by-case judgment. Since norms/values can be written at varying levels of
abstraction, it is useful to specify these first before writing the suitable descriptions for discovery(see the revision procedure).

Supporting mechanics:

- The router matches against the model's own one-sentence restatement of the task —
  so write third-person grammatical phrases in the model's engineering nouns (backend,
  endpoint, data model, share link); house terms ("conventions", "invariants",
  "territory") and scrambled keyword lists match nothing. Name and description act as
  one line; an opaque name costs nothing if the description carries the phrase.
- A wrong description vetoes invocation outright; tuning a correct one yields little.
  Guess the nouns — that is normally enough. If a skill observably fails to load,
  measure: run a few agents on such tasks and take the nouns from their first planning
  sentence.
- Smaller models and subagents rarely consult the skill listing at all. Anything
  delegated to a subagent gets its hard invariants stated in the spawn prompt, not
  left to routing.


## Individuation: one skill per triggering condition

A skill's unit is its **trigger** — the detectable moment of need that loads it. Not a
file surface, not a content type. The same file edit can express different triggers on
different days (one `docker-compose.yml` edit is about stack topology, another about
memory limits), and one trigger can call for a mix of content kinds — norms and
terminology bound to the same situations belong in the same file.

- Procedure skills start with the `run-` prefix and name their task specifically
  (`run-quality-gate`, `run-map-onboarding`), distinguishing them at a glance from
  skills with other trigger kinds; the request itself is the trigger, and the
  description just says what the task does.
- Triggers that would always fire together are one skill: merge, and push sub-topic
  depth into `references/`.
- Content that would need loading under several unrelated triggers is a granularity
  signal, not grounds for a wider skill: restate it more fundamentally and route it by
  the placement rule (usually CLAUDE.md).

## Format

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

## Testing skills

Follow the official **evaluation-driven development** pattern (baseline without the
skill, gap-derived scenarios, deterministic graders, model tiers):
https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.
Prefer official tooling over hand-rolled harnesses to justify skill edits:
**`claude plugin eval`** (early access; case suites with graders including `baseline` —
the with/without comparison the content test calls for; covers plain project skills),
**`/skill-doctor`** (early access; usage stats and never-invoked warnings — the
cheapest trace-evidence source), **`claude plugin validate`** (structure only). Until
early access is enabled, run the published pattern by hand, and keep the eval cases
with the skill they test so a revision can rerun them.

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
4. Treat the result as a floor, grown only by **trace evidence** (`/skill-doctor`'s
   usage stats, observed sessions): when an agent is
   observed grepping the wrong term, conflating concepts, rebuilding something that
   exists under another name, or violating a standard, add the one line that would have
   prevented it, in the right location. Bias every judgment call toward brevity: an
   omission discovered by trace costs one bad session; a bloated always-loaded file
   costs every session.

Skills are normative: when practice and skill diverge, either the change
was wrong or the skill needs a deliberate revision. A rule whose grounds are documented
can be retired when the grounds lapse; an unexplained rule ossifies. After shipping,
watch usage — a reference file that is never opened is unnecessary or badly signaled;
one opened every time belongs in the body; an agent that goes off track while holding
the skill is telling you what context it actually needed.
