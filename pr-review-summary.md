# PR Review: Full cutover stack (#745–#754, #772) against dev

## Verdict: REQUEST CHANGES

## Overview

This stack replaces the legacy comment system with portal submissions: form configs, answers stored one row per field (an EAV table), a frozen copy of each submitted map, and four collection modes. It moves zone notes into `comments.district_notes`. It adds the CMS Portals hub, with portal-first admin, a question wizard, takedown moderation and metrics. It also finishes the Wagtail cutover: the PortalPage rename, scoped partner grants, and final-state docs. I reviewed it against the PR descriptions, `docs/WAGTAIL-CUTOVER-FOLLOWUPS.md`, and the pre-agreed decisions in the review plan. Ten reviewers each covered one factor: the eight planned ones, plus two I added for concurrency and the public, signed-out surface. Most of what the PRs promise is there and works. The team-scoping core is solid: absent, empty and admin `teams` claims behave correctly on both services, and one scoping rule (`user_administers`) is reused everywhere. The row locks do what their comments say. Two-thread tests showed that, and the wizard is properly atomic. Clone-at-submission is a clean way to freeze gallery entries. The migrations run as one atomic upgrade, and the downgrade recreates dev's schema byte for byte.

I verified by running everything that can run here. CI is green. The backend has 491 tests passing and one alembic head. The CMS has 300 passing with no migration drift. Frontend tsc, the unit tests, eslint and ruff are all clean. Infra is checked for types only, because `pulumi preview` can't run locally. Reviewers also ran:

- migration round trips starting from dev's schema, including dev's own backend code against the head schema;
- 26 code mutations, to see which the tests catch;
- two-thread race tests and a deadlock reproduction;
- event-loop stall timings;
- a headless-browser reproduction of the frozen editor.

Every live-stack command was read-only.

There are four High findings:

- Nine new submissions endpoints do blocking database work inside `async def`. That undoes #729, merged two weeks ago, and it stalls every request on a worker while a map is cloned.
- Pages the portal wizard creates have no owner, so partners can't edit the portal they just made.
- The new "Submit to portal" menu item leaves the map editor ignoring the mouse until reload.
- Portal identity comes from each locale's own slug. After an admin renames a translated portal, another team can claim the old slug and receive the translated page's submissions, including emails.

The fourth is High because it sends personal data across teams, which is this repo's historical bug class. It does need an admin action first, so "Important, arguably High" is fair. Beyond the Highs, the Important findings cluster in three places:

- **Moderation integrity.** A moderator's blur is undone by the author's next rename. Private emails are sent to OpenAI. Map tags and copied zone notes are never scored. A slow OpenAI call leaves an entry unblurred.
- **Portal slug renames.** Wizard galleries, translations and saved drafts all stay on the old slug.
- **Deploy and rollback plan.** The legacy-table drop ships with the code switch, which breaks the rolling deploy and image-tag rollback. Merging to dev drops dev's legacy comments before any dump. The runbook's config steps have ordering and secrecy gaps.

The test suite is broad, but R6's mutations show gaps on exactly the paths the testing policy calls ALWAYS-test: per-URL team scoping, the `portals` content route, the community-map clone, the translation rename guard, and the migration data paths.

Suggested order: fix the four Highs. The first three are small fixes, and the fourth needs a design choice. Then the moderation cluster, where most fixes are one line. Then the deploy and runbook items before anything merges to dev. The rest can follow in this PR or right after.

## Severity summary

| Severity | Count |
|---|---|
| High | 4 |
| Important | 45 |
| Personal preference | 11 |
| Opinion | 12 |

## Inline notes

### `backend/app/submissions/main.py`

- **L333, L370, L426, L532, L564, L596, L684, L701, L746** `HIGH` `[performance]` **All nine new submissions endpoints run blocking database work on the event loop** — Each route is `async def` but uses the sync `Session`, so its database calls run on the event loop thread. `create_submission` and `finalize_submission` also clone the whole map there. While that runs, every other request on the worker waits, including other users' saves and the load balancer's health checks. That is the 63-second stall from the stress test. On dev, #729 moved the comment endpoints these replace to `def`, and `backend/app/main.py:236-241` records the rule. R9 measured a probe request stuck behind the handler for 1.03 s; behind a `def` handler it took 0.11 s. Fix: remove `async` from the seven handlers that never `await`. In the two Turnstile handlers, keep the `await` and move the rest into `await run_in_threadpool(...)`, as #729 did.
- **L332–366, L425–528** `IMPORTANT` `[security]` **Unpublished, draft and deleted portals still take submissions and list them publicly** — The backend's only test of whether a portal exists is a `form_configs` row. The wizard creates that row while the page is still a draft, and nothing updates it on unpublish or delete. On the live stack, `GET /api/submissions` returns entries for `9-21-test` and `legacy`, and neither has a page. Pre-launch test entries and unannounced portal slugs are therefore public, and anyone who guesses a slug can seed its gallery. Consider an `accepting`/`public` flag driven by publish, unpublish and delete, or at least document the behavior.
- **L193–240** `IMPORTANT` `[correctness]` **Submission copies never get a thumbnail, so prompt and form gallery cards show the placeholder** — `create_document`'s copy path schedules `publish_district_stats_to_s3`, but `clone_document_for_submission` doesn't. Nobody holds the clone's edit id, so its thumbnail can't be requested later. Fix: have `create_submission` and `finalize_submission` schedule the publish for the clone after commit. Confidence: likely (no page was rendered).
- **L446–478** `IMPORTANT` `[performance]` **The public list's sort order matches no index, so each page reads every visible row** — The query orders by `coalesce(submitted_at, created_at) DESC, id DESC`, and no index supports that. With no portal filter, it scanned all 364k content rows for one page. Because the `submitted_iff_timestamp` check guarantees `submitted_at` exists when status is `submitted`, you can order by `submitted_at DESC, id DESC` and add partial indexes `WHERE status='submitted' AND hidden=false`. R7 measured the unscoped page going from 95 ms to 0.8 ms. The migration hasn't shipped yet, so now is the cheapest time.
- **L223–234** `IMPORTANT` `[tests]` **The community-map branch of the submission clone has no test** — R6's mutation "always copy district assignments" passed all 70 submission and community tests. Once the edit id is gone, a community submission with an empty clone can't be repaired. Add one test that submits a ready community map and compares the clone's assignments.
- **L370–393** `PREF` `[correctness]` **A non-UUID `submission_id` on finalize returns 500, not the documented 404** — Postgres raises `DataError`, and only `OperationalError` has a handler. Typing the path parameter as `uuid.UUID` gives a 422 instead. Low impact.
- **L764–794** `PREF` `[concurrency]` **One submission per portal and map depends only on untested row locks** — Both locks worked in R9's two-thread tests, and R6's mutation that removed the admin-add lock survived. A partial unique index on `(portal_id, map_public_id) WHERE map_public_id IS NOT NULL`, or R9's two-thread test, would stop a later refactor from quietly allowing duplicates.
- **L572–578** `PREF` `[tests]` **The flag endpoint's refusal of drafts is untested** — The hidden and internal cases are pinned, but the draft case isn't; R6's mutation dropping it survived. One more assert in `test_flag_visible_only` covers it.
- **L490–505** `OPINION` `[performance]` **Gallery search is an unindexed `ILIKE '%…%'` scan across all portals** — It takes 44 ms at 415k rows, which is fine for now. A `pg_trgm` GIN index is the fix if galleries grow. No change needed.
- **L243–262** `OPINION` `[security]` **Anyone can re-list a map by public id, even after takedown or from an internal portal** — `_resolve_ready_document` accepts any ready map by its sequential public id. A hidden live entry can be re-submitted into the same gallery, and an internal portal's map can be submitted to a public one. The map was already reachable by public id, so this re-lists it rather than leaking it. Is that the product intent? If not, refuse `map_ref` when the map has a hidden entry in the target portal or belongs to an internal-mode portal.

### `backend/app/submissions/moderation.py`

- **L95–99** `IMPORTANT` `[privacy]` **Moderation sends the private email field (and zip) to OpenAI** — The query selects every answer, `email` included, and joins them into the text sent to the OpenAI moderation API. The legacy code left email out on purpose. The form promises "my email address will be kept confidential", and the CMS help text calls email "the private channel". An email address can also trip the profanity fallback and blur a clean comment. Fix: filter out `PRIVATE_FIELDS` in the select, and add a test that the scored text has no email in it. Arguably High.
- **L113–117** `IMPORTANT` `[moderation]` **The author's next rename or status change undoes a moderator's Blur** — `moderate_submission` always writes `nsfw = score >= 0.2`, and nothing records that a person set it. For live entries (auto_public, admin-added), renaming the map or switching scratch → in_progress triggers a re-score that clears a manual blur. It also re-blurs a manual unblur. R3's probe tests reproduced both. Fix: have automatic scoring only ever raise `nsfw`, or add a manual-verdict marker the scorer respects.
- **L107–110** `IMPORTANT` `[moderation]` **Map tags appear on public gallery cards but are never scored** — `map_texts` reads only `name` and `description`. The plan card shows `tags` by default, and `DocumentMetadata.tags` is still writable through the API. A clean-titled map with abusive tags reaches an auto_public gallery unblurred. Fix: score the joined tags and re-score when they change, or drop `tags` from `DocumentMetadata`.
- **L92–116** `IMPORTANT` `[concurrency]` **Moderation holds a database transaction open across the OpenAI call, and fails open after 60 s** — The reads start a transaction and the OpenAI call runs inside it. The pool sets `idle_in_transaction_session_timeout = 60s`, and the OpenAI client defaults to a 600 s timeout with 2 retries. If a call runs long, the connection is killed, the UPDATE fails, and the entry stays `nsfw=false` with no score. R9 reproduced this. Fix: read the texts, close the transaction, then score, then write. Also set a client timeout under 60 s.

### `backend/app/main.py`

- **L1546–1551** `IMPORTANT` `[correctness]` **The unfiltered and `draft_status`-only document lists still show hidden and internal maps** — The hidden filter only runs inside the `ids` branch, and the internal filter only inside `portal_ids`. A `PlanGalleryBlock` with empty ids and tags reaches the unfiltered branch from a real page. That contradicts "Hide removes an entry from every public listing". R3's probe confirmed it. Fix: apply the hidden filter unconditionally, and consider the internal filter too.
- **L1464** `IMPORTANT` `[compat]` **Dropping the `tags` parameter makes old frontends list every map during the deploy window** — FastAPI ignores the unknown `tags` parameter. So the old bundle's `?tags=<portal>` hits the unfiltered branch: live, `?tags=al-test` returned 20 maps from several portals, while `?portal_ids=al-test` returned 1. The reverse also breaks. The new frontend asks the CMS for `portals`, and the old CMS answers 404 while the two deploys overlap. Fix: accept `tags` as an alias of `portal_ids` for one release. Optionally, have `getCMSContent` retry with `tags` on a 404.
- **L1536–1537** `IMPORTANT` `[tests]` **Nothing tests that scratch maps stay out of the portal gallery** — The old tests that asserted this were replaced, and R6's mutation dropping `SUBMITTED_DRAFT_STATUSES` survived. Admin-added live maps depend on this rule when their author moves them back to scratch. R6's probe (admin add → scratch → gallery empty) is ready to commit.
- **L1519** `PREF` `[tests]` **The gallery's "same portal as the map" condition is untested** — R6's mutation dropping it survived. The f3a9 backfill can create the state it guards against. One test with an other-portal submission on this portal's map would pin it.
- **L357–362** `OPINION` `[security]` **With session enforcement off, one unauthenticated POST publishes an auto_public gallery entry** — This is no worse than dev's metadata tags. Noted for the session-enforcement follow-up. No change needed here.

### `backend/app/district_notes/services.py`

- **L119–145** `IMPORTANT` `[moderation]` **Submission copies take zone notes before they are scored, and nothing scores the copies afterward** — The source note is scored in a background task after save. The clone copies whatever `nsfw` and `moderation_score` it has at that moment. The submit modal saves and then finalizes right away, inside that window. The clone's note is then served unblurred from `/map/<public_id>` indefinitely. Fix: have `moderate_submission` also score the clone's notes where `moderation_score IS NULL`. Confidence: likely (the race timing wasn't exercised).

### `backend/app/district_notes/tasks.py`

- **L24–37** `IMPORTANT` `[concurrency]` **A stale score can land on newer note text, and nothing ever re-scores it** — Two quick saves run two scoring tasks, and the first save's score can arrive last. Dev re-scored every note on every save, which accidentally repaired this. Now an unchanged note is never re-scored. Fix (one line): add `WHERE note = :text` to the UPDATE.

### `backend/app/submissions/fields.py`

- **L21** `PREF` `[correctness]` **Validation rules drift across the three field registries even though the keys match** — The backend ZIP pattern accepts non-ASCII digits and ZIP+4. The frontend `pattern` rejects ZIP+4, and its `validator` is unanchored, so it accepts `123456789`. The registry length caps never reach the inputs. Suggest `[0-9]` or `re.ASCII`, an anchored frontend validator, and `maxLength` on `FieldSpec`.

### `backend/app/models.py`

- **L291–300** `IMPORTANT` `[migrations]` **Autogenerate now proposes dropping `document_portal_id_fkey`, so runbook step 6 can't pass** — The foreign key exists only in the migration, to avoid a circular import. The next `alembic revision --autogenerate` will include a `drop_constraint`. If nobody notices, slug renames stop cascading to `document.portal_id`. Fix: append the `ForeignKeyConstraint` to `Document.__table__` from `submissions/models.py`. Also reword step 6 to list the known pre-existing drift.

### `backend/app/alembic/versions/d8f1b52c96e3_drop_legacy_comment_tables.py`

- **L99–103** `IMPORTANT` `[migrations]` **The table drop ships with the code switch, so old tasks 500 on map loads in rollout and rollback** — Dev's backend reads `comments.document_comment` on every document load. R2 ran dev's code against the head schema and got `UndefinedTable` on `GET /api/document/<uuid>`. While old tasks drain, map loads return 500. If the circuit breaker rolls back, or someone follows the README's image-tag rollback, the site stays down until a fix-forward. Fix: move the drops into a follow-up revision one release later. Otherwise, document the error window and state that rollback needs a database restore.

### `backend/app/alembic/versions/b3d9f47a25c1_district_notes.py`

- **L121–125** `IMPORTANT` `[data-loss]` **A full downgrade deletes every zone note, though the comment says it restores the prior state** — d8f1's downgrade recreates the legacy tables empty. b3d9's downgrade then drops `district_notes`, which by then is the only copy. Notes written after cutover aren't in the step-1 dump. Fix: repopulate the legacy rows in d8f1's downgrade (R2 wrote the SQL). Otherwise, correct the comment and require `-x allow_data_loss=1`.
- **L78–118** `IMPORTANT` `[tests]` **No automated test covers any migration data path** — The policy lists migrations as ALWAYS-test. R6 checked the b3d9, d8f1 and f3a9 data paths by hand, and they behave as documented. Nothing would catch an edit made before cutover. An opt-in pytest that stops at a revision, seeds rows, upgrades and asserts would cover it. R6's seed SQL is a starting point.
- **L1** `PREF` `[migrations]` **All five revisions lock `document.document` in one transaction with no `lock_timeout`** — The hold itself is short (under 2 s on 500k documents). The risk is queueing: a long query blocks the migration, and every request queues behind the migration. `SET LOCAL lock_timeout = '5s'` at the start makes a blocked deploy fail fast.

### `backend/app/alembic/versions/f3a9c1d27e58_document_portal_id_drop_submission_tags.py`

- **L4–7** `IMPORTANT` `[migrations]` **Legacy galleries driven by map tags go empty after cutover, and the runbook doesn't say so** — Production's `CreateButton` stamps `metadata.tags`, and dev's gallery matched on those tags. The new gallery matches `document.portal_id` plus a visible submission, and nothing backfills either. The local CMS copy has two tag-filtered plan galleries, one on `tn-counties-workshop`. The docstring calls `submissions.tags` "the only other membership mechanism", which is wrong for production. Fix: add a runbook step that turns each legacy `plan_gallery.tags` into curated `ids`, and correct the docstring. Also run the count query on prod before cutover.

### `backend/app/alembic/versions/c7e2a94d81f5_submissions_schema.py`

- **L95, L172, L200** `PREF` `[performance]` **Several new indexes duplicate others or are never used** — `ix_…_submission_id`, `ix_…_form_configs_portal_id` and `ix_…_form_fields_custom_portal_id` duplicate unique constraints or their leading columns. `idx_submissions_drafts` has no reader. They are cheap to drop now, before the migration ships.

### `infra/waf.ts`

- **L84–90** `IMPORTANT` `[security]` **The `/flag` rate limit is bypassed by percent-encoding one character of the path** — The rule matches `uriPath` exactly, with no text transformation. Starlette decodes the path before routing, so `/api/submissions/fla%67` reaches `flag_submission` without being counted. Two reviewers confirmed the decoding on the local backend. Fix: add `textTransformations: [{priority: 0, type: "URL_DECODE"}]`. Confidence: likely (the WAF itself can't be tested locally).

### `infra/cms.ts`

- **L178–186** `IMPORTANT` `[deploy]` **`MIGRATE_TIPTAP_OWNERS` reaches the migrate task only via a `pulumi up` that runs after it** — `deploy-cms.yml` runs the existing `cms-migrate` task definition with only the image swapped. The env var arrives later, in "Update service". Unless `infra.yml` wins the race, the prod cutover fails at content/0003, and a retry fails the same way. Fix: add a runbook step that applies infra and confirms the task definition has the variable before step 7. Confidence: likely.

### `infra/config.ts`

- **L75** `IMPORTANT` `[privacy]` **The runbook commits the author mapping (Auth0 ids, emails) as plain config in a public repo** — `infra/Pulumi.prod.yaml` is committed, the repo is public, and `migrateTiptapOwners` is read with `cfg.get`. "Remove it after the cutover deploy" doesn't remove it from git history. Fix: use `pulumi config set --secret` and `cfg.getSecret`, pass it through SSM, or supply it with `run-task --overrides`.

### `docs/WAGTAIL-CUTOVER-FOLLOWUPS.md`

- **L64–72** `IMPORTANT` `[migrations]` **Merging this stack to dev drops the dev stack's legacy comments before any dump** — `deploy-api.yml` runs `alembic upgrade head` on every push to `dev` that touches `backend/**`. Step 1's `pg_dump` and step 6's "rehearse on dev" are written as if they come later. Dev holds live legacy testimony (the TN workshop). Add "dump the dev stack's `comments` schema before merging to dev". Automated RDS backups may allow recovery, but that shouldn't be the plan.

### `docs/decisions.md`

- **L39–41** `IMPORTANT` `[docs]` **The final-state docs pass missed `decisions.md` and `backend/README.md`** — `decisions.md` has no entry for this stack's decisions: the JWT issuer, fail-closed teams scoping, submissions without an approval gate, clone-at-submission, one portal per map, dropping legacy comments, the `tags` alias. It still describes the removed CMS publishing design. `backend/README.md:306-318` still documents Auth0 roles and scopes. Add one dated entry, retire the stale one, and point the README at `docs/overview.md#auth-and-sharing`.

### `cms/content/portal_wizard.py`

- **L350–357** `HIGH` `[correctness]` **Pages the wizard creates have no owner, so the partner who made a portal can't edit it** — `PortalPage(...)` is built without `owner`, and `add_child` doesn't set one. Partners hold only `add_page`, so their edit right is Wagtail's owner rule. Both R1 and R4 reproduced this: the wizard's own redirect to the edit page bounces to `/admin/` with permission denied, and so does the hub's "Edit page" link. The live pages 129 and 130 have `owner_id` NULL. Setting `owner=request.user` fixes the creator. Teammates still can't edit, though, and granting tree-wide `change_page` would widen the gap in the `cms/content/wagtail_hooks.py` note below. R1's suggested fix covers both: a team-aware `permissions_for_user` on the content page classes.
- **L104–115** `IMPORTANT` `[correctness]` **Wizard galleries hardcode `tags: [slug]`, so they go empty after a supported rename** — `PortalPage.save` moves the FormConfig, and the foreign keys cascade to documents and submissions, but the page body keeps the old slug. The plan gallery then matches nothing, and the comment gallery ANDs the new `portalId` with the old tag and also returns nothing. If another portal later takes the old slug, this gallery shows that portal's maps. Fix: don't store the slug. Inject it when serving, as `_inject_portal_id` already does for comment galleries, or rewrite the tags on rename. The FormConfig help text that tells admins to re-point `portal_id` by hand is stale too.
- **L136–142** `OPINION` `[correctness]` **An over-long URL answer causes a 500 instead of a form error** — `forms.SlugField` has no `max_length`, and the Page `ValidationError` isn't caught. Nothing half-created is left behind. `max_length=255` fixes it.

### `cms/content/models.py`

- **L267–312** `HIGH` `[security]` **Portal identity is per-locale slug, so after a rename another team can take a portal's submissions** — Several places treat `page.slug` at any locale as the portal id: `_inject_form_config`, `_is_out_of_scope_page` and the explorer hook (`cms/content/api.py:64-81`, `cms/content/wagtail_hooks.py:52`). But wagtail-localize treats `slug` as translatable, and `save`/`clean` act only on the default locale. R1 proved it end to end. First, an admin renames a translated portal, and the es page keeps the old slug. Next, a partner on another team runs the wizard with that old slug; `portal_wizard.py:219-222` checks only default-locale pages, so they get a FormConfig for their own team with no approval. From then on, the victim's Spanish page serves the claimant's form. Its submissions, emails included, go to the claimant's admin view, and the page moves into the claimant's edit scope. Without any attack, a rename also strips the form from every translation (R4). Fix: add `SynchronizedField("slug")` to `override_translatable_fields`, and resolve portal identity through the default-locale translation. Also make the wizard reject any slug that a PortalPage uses in any locale. High, arguably Important: it needs an admin rename, or an admin approving a changed translated slug.
- **L285–293** `IMPORTANT` `[concurrency]` **The slug rename isn't atomic with the FormConfig move, and the move can deadlock with backend saves** — Publishing has no outer transaction, so the new slug commits before the FormConfig UPDATE runs. The cascade locks `submissions` before `document`. The backend's metadata save locks them in the opposite order. R9 reproduced the deadlock and the split state that results: the page is at the new slug and the config is still at the old one. Also, `_form_configs()` treats any `DatabaseError` as "table absent", which silently skips both the collision check and the move. Fix: wrap `save` in `transaction.atomic()`, and narrow the except to the missing-table error.

### `cms/content/provision.py`

- **L41–82** `IMPORTANT` `[permissions]` **Translated index pages created after authapi/0004 get no partner `add_page` grant** — wagtail-localize creates a new locale's Portals and Places index when content is first translated into that locale, and nothing grants partners access to it. Partners then can't add pages there, or edit pages they own there. The old root grant covered this. zh, vi, ht and pt are configured but have no index pages yet. It fails closed. Fix: a `post_save(created=True)` receiver on both index models that calls `grant_partner_add`.

### `cms/content/wagtail_hooks.py`

- **L13–21, L74–97** `IMPORTANT` `[security]` **Only six hooks enforce team scope; out-of-scope owners keep history, preview and translation views** — Wagtail and wagtail-localize gate many views on `can_edit()` alone. For a partner who owns a page outside their team, R1 got 200s on `history/`, `revisions/compare/`, `revisions/<id>/view/`, `view_draft/` and `usage/`. By reading the code, the localize edit views are open too. The cutover makes this situation common: legacy authors own pages, and step 10 assigns teams by hand. Fix: a team-aware `permissions_for_user` on the page classes. It is one choke point, and the same fix as the wizard-owner High.

### `cms/content/blocks.py`

- **L150–186** `IMPORTANT` `[coherence]` **auto_public promises public in-progress maps, but the gallery lists ready-to-share only** — The mode description and the followups doc both promise it, and the backend auto-finalizes at `in_progress`. But `PlanGallery` sends `draft_status=ready_to_share` unless `includeInProgress` is set, and `PlanGalleryBlock` has no such field. Fix: add `includeInProgress` to the block and have the wizard set it for auto_public, or stop sending `draft_status` for portal galleries.

### `cms/content/templates/content/portal_wizard.html`

- **L124–125** `IMPORTANT` `[correctness]` **The module filter never filters single modules, and it can hide the checked ones** — Django 5.2 renders the checkboxes in `<div>`s, so `closest('li')` finds the `<li>` that wraps the whole field. Every checkbox toggles that one element. A query that matches nothing hides the whole list. Fix: `input.closest('#id_map_modules > div')`.

### `cms/portals/views.py`

- **L536–551** `IMPORTANT` `[correctness]` **"Pin to page gallery" turns a wizard portal's automatic gallery into a one-map curated gallery** — It appends to the first `plan_gallery`, which on wizard pages is `{ids: [], tags: [slug]}`. Once it has an id, the frontend prefers `ids`, so the published gallery shows only the pinned map. Fix: pin into a curated block (one with no tags), or add a new one.
- **L331–359** `IMPORTANT` `[performance]` **Each metrics cell can hold a CMS thread for up to 110 s, three per open tab, out of 8 in total** — The same 8 threads (2 workers × 4) serve the public content API. Three cold metrics tabs can stall public portal pages. Fix: a short CMS-side timeout that returns `pending` for the JavaScript to retry, or call the evaluation endpoint from the browser. Confidence: likely.
- **L67–99** `IMPORTANT` `[performance]` **The metrics row check pages through the portal's whole submission list on every cache miss** — Checking that one `public_id` belongs to the portal costs ⌈n/100⌉ backend calls. That was 61 calls for a 6,060-map portal, three of these sweeps at a time, and each call also blocks the event loop because of the async-handler High. Fix: add a `map_public_id` filter to `/api/submissions/admin`; it is already indexed. Confidence: likely.
- **L127–131** `IMPORTANT` `[tests]` **Per-URL team scoping isn't tested against a real other-team portal** — Every "inaccessible portal" test uses a slug that has no page. R6's mutation removing the team filter from `_get_portal_or_denied` passed all 300 CMS tests. That guard is the only one on `add_to_portal_gallery`. One test on the shared guard, with an existing portal owned by another team, closes it; R6's probe does exactly that.
- **L59–64** `PREF` `[concurrency]` **Metrics cache `_prune` iterates a shared dict that other threads change** — Under `--threads 4` it can raise "dictionary changed size during iteration", which R9 reproduced. The fix is one line: `list(cache.items())`.
- **L37–38** `OPINION` `[coherence]` **The hub's backend client lives in `moderation`, which now holds only site settings** — Reusing the client is right. Moving it to `core/` or `portals/` would match what it serves. No change needed.

### `cms/datastore/wagtail_hooks.py`

- **L617–640** `IMPORTANT` `[coherence]` **The custom-question key rule is written twice, and the copies already disagree** — The wizard rejects a label with no letters or digits. The snippet formset stores key `custom_`, which passes the database check and reaches the backend and frontend as a field called `custom_`. Move the rule into one helper next to `FormFieldCustom`.
- **L691–730** `OPINION` `[security]` **Choosers and the admin API list other teams' portal names, even to partners with no team** — The FormConfig chooser is new in this PR and lists every config. The page chooser, the admin page API and the team chooser do the same. Only names and slugs leak, no bodies or submissions, but it goes past the documented "no team reaches nothing" rule. Scope the chooser with `administered_by_user`, or document the limit.
- **L506–533** `OPINION` `[correctness]` **A FormConfig whose portal page was deleted can't be edited or reused** — `clean_portal_id` rejects every save, and the wizard refuses the slug. Live dev already has three of these. Consider checking page existence only when `portal_id` changes.

### `cms/authapi/teams.py`

- **L76, L117, L138** `IMPORTANT` `[docs]` **Auth and scoping docstrings describe the old contract** — `instance_in_scope` says team-less users "always pass". `TeamScopedModelPermissionPolicy` says they're "unaffected". The `Team` docstring (`models.py:13-25`) says non-admins with no team aren't scoped. `authapi/wagtail_hooks.py:4-6` describes claims riding a refresh token. The code correctly fails closed and mints on every request. A maintainer who "fixes" the code to match these comments would reopen the fail-open. The fix is text only.

### `cms/authapi/wagtail_hooks.py`

- **L56–76** `OPINION` `[security]` **(Pre-existing, #714) Any partner can list every CMS user's email through the user chooser** — `UserChooserViewSet` has no `permission_policy`. This is outside this diff, but it contradicts the fail-closed decision. A one-line policy fix fits in a separate PR.

### `app/src/app/components/Topbar/MapActionsDropdown.tsx`

- **L166–174** `HIGH` `[correctness]` **"Submit to portal" leaves `pointer-events: none` on the page, so the map editor stops responding** — `onSelect` opens the dialog synchronously while the dropdown still has the body locked. The dialog saves `none` as the original value and puts it back when it closes. After Not now, Escape or a successful submit, the page ignores the mouse until reload. The same file already works around this for Share (L48–50). R5 reproduced it in headless Chromium. Fix (one line): `setTimeout(() => openSubmitPrompt(id), 0)`.

### `app/src/app/components/Forms/SubmissionForm.tsx`

- **L132–146** `IMPORTANT` `[correctness]` **With `require_email_confirm` on, an optional email becomes required** — The confirm input is always `required` when shown. A blank email therefore fails `checkValidity()`, and the only way to submit is to enter the one private field. Fix: `required={required.has('email') || !!emailValue}`.

### `app/src/app/utils/map/editUrl.ts`

- **L69–95** `IMPORTANT` `[correctness]` **`parseMapRef` takes the last number from any URL, on any host** — A classic `districtr.org/plan/12345` link resolves to an unrelated v2 map, and the backend clones that stranger's map into a public submission. `submitForm` doesn't re-check the host. Meanwhile the still-supported `/map?document_id=<uuid>` returns null. Fix: accept only `/(map|coi)/<id>[/edit|/eval]`, `?private_edit_id=` and `?document_id=`, and add those cases to `editUrl.test.ts`. The CMS twin `parse_public_id` (`cms/portals/views.py:411-417`) has the same leniency: pasting a Wagtail editor URL `…/admin/pages/123/edit/` resolves to map 123. It also returns a 500 on non-ASCII digits (`'²'.isdigit()` is true), so give it the same fix.

### `app/src/app/components/MapPage/SubmitToPortalModal.tsx`

- **L57–77** `IMPORTANT` `[correctness]` **A portal slug rename permanently breaks in-progress prompt drafts** — The localStorage draft stores the slug, and `getFormConfig(<old>)` then returns 404 on every ready flip. Finalize is keyed on `submission_id` and would still work. Look the config up through the submission. On a 404, retire the draft record.
- **L120–129** `IMPORTANT` `[concurrency]` **The save before finalize can race autosave and show a false conflict** — Clicking the Turnstile iframe fires a window `blur`, which starts an autosave. If Submit lands during that save, a second PUT goes out with the same `last_updated_at`, one of them gets a 409, and the conflict modal opens. Making `handlePutAssignments` single-flight at the store level fixes this and the older SaveButton gap. Confidence: likely. Important, arguably lower: the underlying gap existed before this PR.
- **L130–151** `OPINION` `[correctness]` **A finalize retried after a lost response stays marked "unsubmitted"** — The server correctly returns 409 "already finalized". Treating that specific 409 as success would stop the prompt from reopening and costing another captcha.

### `app/src/app/utils/api/apiHandlers/getComments.ts`

- **L61–73** `IMPORTANT` `[correctness]` **Custom answers are public but never shown, so custom-only entries render as blank cards** — `flatten` keeps only registry keys. The backend counts custom answers as public content and lists the entry. Live row 8 would render as "Anonymous" with an empty body. Render `custom_*` fields using labels from the form config, or at least hide empty bodies.

### `app/src/app/components/Toolbar/SaveShareModal/SaveShareModal.tsx`

- **L121–137** `PREF` `[correctness]` **Submit from Map Details can save a non-ready status and then open the prompt** — Finalize then fails with a 409 after the captcha is used. Gate `openSubmitPrompt` on the status being saved.

### `app/src/app/utils/draftSubmissions.ts`

- **L21–28** `OPINION` `[correctness]` **A literal `null` stored under `draft-submissions` crashes the map page** — Only a tampered value can cause it. A one-line shape guard closes it.

### `.github/workflows/test-cms.yml`

- **L4–10** `IMPORTANT` `[ci]` **The field-registry lockstep test doesn't run when two of its three inputs change** — The workflow triggers on `cms/**` and alembic, not on `backend/app/submissions/fields.py` or `fieldRegistry.tsx`. Drift in either file shows up on some later, unrelated CMS PR. Add both paths.

### `cms/content/tests.py`

- **L751–834 (and 15 call sites)** `IMPORTANT` `[tests]` **Content API tests all use the old `tags` alias; the `portals` route the frontend calls is untested** — R6's mutations C6 (inject the form only for `tags`) and C9 (drop the comment-gallery `portalId`) both survived. Point `FormConfigInjectionTests` at `/api/content/portals/`, assert `portalId`, and keep one alias smoke test.
- **L477–485** `IMPORTANT` `[tests]` **The partner grant on translated index pages is untested** — The test checks `objects.first()`, which is the default locale. R6's mutation dropping `grant_partner_add(translated)` passed all 300 tests.
- **L537–557** `PREF` `[tests]` **A few new tests restate configuration** — `test_partner_sees_portals_hub_menu` asserts a URL, and `portals/tests.py:95-102` asserts link labels. These break on renames and catch nothing, which is the NEVER list in `AGENTS.md`.

### `cms/datastore/tests.py`

- **L475–520** `IMPORTANT` `[tests]` **The rename sync has no translation test, so deleting its locale guard fails nothing** — R6's mutation "`_owns_form_config_key` always true" passed all 300 tests. A translator publishing a Spanish slug would move the English portal's FormConfig and cascade every submission. R6's probe (translate, change the slug, publish, config unchanged) is ready to commit.

### `cms/portals/tests.py`

- **L311–364** `IMPORTANT` `[tests]` **Dropping the append-in-order test lets "pin" overwrite a curated gallery without any test failing** — Dev's `test_appends_to_existing_gallery_block_in_order` wasn't ported, and R6's mutation `ids = [public_id]` survived. Every pin would silently replace the partner's curated list. Restore the two-pin assertion.
- **L152–169** `OPINION` `[tests]` **Nothing checks that hub calls run as the acting user** — Dev's test asserted the token's `sub`, and this one doesn't. One header assert would pin it, which matters because `submission_action` has no CMS-side portal check.

### `backend/tests/test_submissions.py`

- **L571–577, L684–698** `OPINION` `[tests]` **Two tests pass for reasons other than the one they name** — `test_ids_cannot_fish_out_drafts` passes even without the status filter, because drafts have no content. The docstring of `test_takedown_demotes_the_frozen_clone` contradicts the decision that the map stays reachable. `test_district_notes.py:5-6` points at the deleted `test_comments.py`.

### Various files

- **`backend/app/submissions/models.py:6`, `cms/authapi/scopes.py:25`, `cms/datastore/models.py:298-301`, `cms/datastore/drift.py:15-17`, `.github/workflows/preview.yml:26`, `fieldRegistry.tsx:117`, `agent-skills/run-quality-gate/SKILL.md`** `PREF` `[coherence]` **Small stale references and dead code** — They still mention TagPage, per-reviewer tag scoping, legacy table collisions, "six mirrors" (there are eight) and an Auth0 prerequisite. `PRIVATE_FIELDS` is exported but unused. The quality-gate skill doesn't mention the new `bun run test` gate or the CMS tests.
