"""
One-shot (but idempotent) migration of the legacy TipTap CMS content
(cms.tags_content / cms.places_content, read via raw SQL — the tables are
Alembic-owned and have no Django models) into Wagtail pages
(content.TagPage / content.PlacePage).

Mapping:
- one legacy (slug, language) row -> one page in that locale;
- the English row is the canonical page (created under the per-type index
  page); other languages become Wagtail translations sharing its
  translation_key via copy_for_translation. If a slug has no English row,
  the first language (sorted) is used as canonical instead (warned).
- published_content -> published revision; draft_content (when different)
  -> an additional unpublished revision on top. Draft-only rows stay
  unpublished.
- Re-running upserts by (type, slug, locale): existing pages are updated in
  place (and skipped entirely when already identical), never duplicated.

Not carried over: legacy `author` (an Auth0 subject string with no Django
user to map to) and created_at/updated_at (Wagtail manages its own
first/last_published_at via publish()).

--dry-run converts everything without writing and emits a per-row report:
input node-type counts, output block-type counts, and a
whitespace-normalised plain-text diff verdict. Any text-loss row fails the
run (non-zero exit). --json-report PATH writes the full report as JSON.
"""

import json
from collections import Counter, defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from wagtail.models import Locale, Page, Site

from content.models import PlacePage, PlacesIndexPage, TagPage, TagsIndexPage
from content.tiptap import (
    extract_prosemirror_text,
    extract_stream_text,
    tiptap_to_stream_data,
)

CONTENT_TYPES = {
    "tags": {
        "table": "cms.tags_content",
        "map_column": "districtr_map_slug",
        "page_model": TagPage,
        "index_model": TagsIndexPage,
        "index_title": "Tags",
        "index_slug": "tags",
    },
    "places": {
        "table": "cms.places_content",
        "map_column": "districtr_map_slugs",
        "page_model": PlacePage,
        "index_model": PlacesIndexPage,
        "index_title": "Places",
        "index_slug": "places",
    },
}

DEFAULT_LANGUAGE = "en"


def _normalize_raw(value):
    """Strip stream/list-item wrappers and ids so stored StreamField data can
    be compared with freshly converted raw data."""
    if isinstance(value, dict):
        if "type" in value and "value" in value and set(value) <= {
            "type",
            "value",
            "id",
        }:
            if value["type"] == "item":
                # ListBlock child wrapper: fresh raw data uses plain lists.
                return _normalize_raw(value["value"])
            return {"type": value["type"], "value": _normalize_raw(value["value"])}
        return {key: _normalize_raw(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_normalize_raw(item) for item in value]
    return value


class Command(BaseCommand):
    help = (
        "Migrate legacy TipTap content (cms.tags_content/cms.places_content) "
        "into Wagtail TagPage/PlacePage trees."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Convert and report without writing any pages.",
        )
        parser.add_argument(
            "--json-report",
            metavar="PATH",
            help="Write the full per-row report to PATH as JSON.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        report = []
        failed_rows = 0
        pages_created = 0
        pages_updated = 0
        pages_skipped = 0

        for content_type, config in CONTENT_TYPES.items():
            rows = self._fetch_rows(config)
            by_slug = defaultdict(dict)
            for row in rows:
                by_slug[row["slug"]][row["language"]] = row

            for slug in sorted(by_slug):
                lang_rows = by_slug[slug]
                canonical_language = (
                    DEFAULT_LANGUAGE
                    if DEFAULT_LANGUAGE in lang_rows
                    else sorted(lang_rows)[0]
                )
                if canonical_language != DEFAULT_LANGUAGE:
                    self.stderr.write(
                        self.style.WARNING(
                            f"{content_type}/{slug}: no English row; using "
                            f"'{canonical_language}' as canonical"
                        )
                    )

                canonical_page = None
                # Canonical language first; translations need it to exist.
                ordered = [canonical_language] + [
                    language
                    for language in sorted(lang_rows)
                    if language != canonical_language
                ]
                for language in ordered:
                    row = lang_rows[language]
                    entry = self._convert_row(content_type, row)
                    report.append(entry)
                    if not entry["text_ok"]:
                        failed_rows += 1
                    self._print_entry(entry)

                    if dry_run:
                        continue

                    with transaction.atomic():
                        page, action = self._upsert_page(
                            config,
                            row,
                            entry,
                            canonical_page=canonical_page,
                            is_canonical=(language == canonical_language),
                        )
                    if language == canonical_language:
                        canonical_page = page
                    if action == "created":
                        pages_created += 1
                    elif action == "updated":
                        pages_updated += 1
                    else:
                        pages_skipped += 1

        if options["json_report"]:
            with open(options["json_report"], "w") as f:
                json.dump(report, f, indent=2)
            self.stdout.write(f"Report written to {options['json_report']}")

        if not dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Done: {pages_created} created, {pages_updated} updated, "
                    f"{pages_skipped} unchanged."
                )
            )

        if failed_rows:
            raise CommandError(
                f"{failed_rows} row(s) failed the plain-text fidelity check "
                "(see report lines marked TEXT-LOSS)."
            )
        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(f"Dry run OK: {len(report)} row(s) converted.")
            )

    # ------------------------------------------------------------------
    # Legacy reads
    # ------------------------------------------------------------------

    def _fetch_rows(self, config):
        query = (
            f"SELECT id, slug, language, draft_content, published_content, "
            f"{config['map_column']}, author, created_at, updated_at "
            f"FROM {config['table']} ORDER BY slug, language"
        )
        with connection.cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        # Django's raw cursor returns jsonb as text.
        for row in rows:
            for column in ("draft_content", "published_content"):
                if isinstance(row[column], str):
                    row[column] = json.loads(row[column])
        return rows

    # ------------------------------------------------------------------
    # Conversion + report
    # ------------------------------------------------------------------

    def _convert_row(self, content_type, row):
        published_doc = row["published_content"]
        draft_doc = row["draft_content"]
        # Legacy publishing nulled draft_content; ignore drafts identical to
        # the published doc.
        if draft_doc is not None and draft_doc == published_doc:
            draft_doc = None

        entry = {
            "content_type": content_type,
            "slug": row["slug"],
            "language": row["language"],
            "input_nodes": Counter(),
            "output_blocks": Counter(),
            "warnings": [],
            "text_ok": True,
            "docs": {},
        }

        for kind, doc in (("published", published_doc), ("draft", draft_doc)):
            if doc is None:
                continue
            result = tiptap_to_stream_data(doc)
            input_counts = Counter(
                node.get("type") for node in doc.get("content") or []
            )
            output_counts = Counter(block["type"] for block in result.stream_data)
            source_text = extract_prosemirror_text(doc)
            output_text = extract_stream_text(result.stream_data)
            text_ok = source_text == output_text
            entry["docs"][kind] = {
                "stream_data": result.stream_data,
                "input_nodes": dict(input_counts),
                "output_blocks": dict(output_counts),
                "text_ok": text_ok,
                "source_text": source_text,
                "output_text": output_text,
            }
            entry["input_nodes"].update(input_counts)
            entry["output_blocks"].update(output_counts)
            entry["warnings"].extend(
                f"{kind}: {warning}" for warning in result.warnings
            )
            entry["text_ok"] = entry["text_ok"] and text_ok

        entry["input_nodes"] = dict(entry["input_nodes"])
        entry["output_blocks"] = dict(entry["output_blocks"])
        return entry

    def _print_entry(self, entry):
        verdict = "text OK" if entry["text_ok"] else "TEXT-LOSS"
        style = self.style.SUCCESS if entry["text_ok"] else self.style.ERROR
        self.stdout.write(
            style(
                f"{entry['content_type']}/{entry['slug']}/{entry['language']}: "
                f"in={entry['input_nodes']} out={entry['output_blocks']} "
                f"[{verdict}]"
            )
        )
        for warning in entry["warnings"]:
            self.stdout.write(self.style.WARNING(f"  warning: {warning}"))

    # ------------------------------------------------------------------
    # Page writes
    # ------------------------------------------------------------------

    def _upsert_page(self, config, row, entry, canonical_page, is_canonical):
        model = config["page_model"]
        locale = Locale.objects.get_or_create(language_code=row["language"])[0]
        page = (
            model.objects.filter(slug=row["slug"], locale=locale)
            .first()
        )
        created = False
        if page is not None:
            page = page.specific
        elif is_canonical:
            index = self._ensure_index(config, locale)
            page = model(
                title=self._derive_title(row, entry),
                slug=row["slug"],
                locale=locale,
                live=False,
            )
            index.add_child(instance=page)
            created = True
        else:
            # Translation sharing the canonical page's translation_key;
            # creates translated index/home pages (as aliases) when missing.
            page = canonical_page.copy_for_translation(
                locale, copy_parents=True, alias=False
            )
            created = True

        changed = self._apply_row(config, page, row, entry)
        if created:
            return page, "created"
        return page, ("updated" if changed else "unchanged")

    def _derive_title(self, row, entry):
        """First section-header title in the doc, else the humanised slug."""
        for kind in ("published", "draft"):
            doc = entry["docs"].get(kind)
            if not doc:
                continue
            for block in doc["stream_data"]:
                if block["type"] == "section_header" and block["value"].get("title"):
                    return block["value"]["title"]
        return row["slug"].replace("-", " ").title()

    def _set_fields(self, config, page, row, stream_data, entry):
        page.title = self._derive_title(row, entry)
        page.body = stream_data
        if config["map_column"] == "districtr_map_slug":
            page.districtr_map_slug = row["districtr_map_slug"] or ""
        else:
            page.districtr_map_slugs = row["districtr_map_slugs"] or []

    def _fields_match(self, config, page, row, stream_data, entry):
        if page.title != self._derive_title(row, entry):
            return False
        if config["map_column"] == "districtr_map_slug":
            if page.districtr_map_slug != (row["districtr_map_slug"] or ""):
                return False
        elif page.districtr_map_slugs != (row["districtr_map_slugs"] or []):
            return False
        return _normalize_raw(page.body.get_prep_value()) == _normalize_raw(
            stream_data
        )

    def _apply_row(self, config, page, row, entry):
        """Sync one page with one legacy row's published/draft docs.

        Returns True when anything was written. clean=False on
        save_revision: legacy data is migrated verbatim — validation (e.g.
        a map slug that has since been deleted) must not abort the
        migration.
        """
        published = entry["docs"].get("published")
        draft = entry["docs"].get("draft")
        changed = False

        if published is not None:
            live_matches = page.live and self._fields_match(
                config, page, row, published["stream_data"], entry
            )
            if not live_matches:
                self._set_fields(config, page, row, published["stream_data"], entry)
                page.save_revision(clean=False).publish()
                changed = True
        elif page.live:
            # Legacy row was never published (draft-only); keep page hidden.
            page.unpublish()
            changed = True

        if draft is not None:
            latest = page.get_latest_revision_as_object()
            if not self._fields_match(config, latest, row, draft["stream_data"], entry):
                self._set_fields(config, page, row, draft["stream_data"], entry)
                page.save_revision(clean=False)
                changed = True
        return changed

    def _ensure_index(self, config, locale):
        """Get or create the per-type index page in the given locale."""
        index_model = config["index_model"]
        default_locale = Locale.objects.get_or_create(
            language_code=DEFAULT_LANGUAGE
        )[0]

        index = index_model.objects.filter(locale=default_locale).first()
        if index is None:
            home = self._home_page()
            index = index_model(
                title=config["index_title"],
                slug=config["index_slug"],
                locale=default_locale,
            )
            home.add_child(instance=index)
            index.save_revision().publish()

        if locale == default_locale:
            return index
        translated = index.get_translation_or_none(locale)
        if translated is None:
            translated = index.copy_for_translation(
                locale, copy_parents=True, alias=True
            )
        return translated

    def _home_page(self):
        site = (
            Site.objects.filter(is_default_site=True).first() or Site.objects.first()
        )
        if site is not None:
            return site.root_page
        # Bare tree (e.g. minimal test fixtures): fall back to the first
        # page under the root.
        root = Page.get_first_root_node()
        home = root.get_children().first()
        if home is None:
            raise CommandError("No site/home page to attach index pages to.")
        return home
