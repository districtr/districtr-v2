"""
Idempotent provisioning of the three per-type index pages (Tags, Places,
Static pages) under the site home page.

Shared by the ``0008_provision_index_pages`` data migration (fresh sites get
the tree without any manual checklist step) and ``manage.py migrate_tiptap``
(which additionally needs per-locale copies of the indexes for translated
legacy rows).

Uses the real models rather than migration-state models: Wagtail's treebeard
page tree cannot be built through historical models, and the page classes
here carry no fields beyond Page itself.
"""

from wagtail.models import Locale, Page, Site

DEFAULT_LANGUAGE = "en"


def home_page():
    """The default site's root page (or the first page under the tree root
    on bare fixtures). Raises RuntimeError when there is nothing to attach
    index pages to."""
    site = Site.objects.filter(is_default_site=True).first() or Site.objects.first()
    if site is not None:
        return site.root_page
    root = Page.get_first_root_node()
    home = root.get_children().first() if root else None
    if home is None:
        raise RuntimeError("No site/home page to attach index pages to.")
    return home


def ensure_index(index_model, title, slug, locale=None):
    """Get or create the singleton index page of ``index_model`` in
    ``locale`` (default locale when omitted). Translated copies are aliases
    sharing the default-locale page's translation_key."""
    default_locale = Locale.objects.get_or_create(language_code=DEFAULT_LANGUAGE)[0]

    index = index_model.objects.filter(locale=default_locale).first()
    if index is None:
        index = index_model(title=title, slug=slug, locale=default_locale)
        home_page().add_child(instance=index)
        index.save_revision().publish()

    if locale is None or locale == default_locale:
        return index
    translated = index.get_translation_or_none(locale)
    if translated is None:
        translated = index.copy_for_translation(locale, copy_parents=True, alias=True)
    return translated


def ensure_default_index_pages():
    """Create any missing default-locale index pages under the site home."""
    from content.models import PlacesIndexPage, StaticIndexPage, TagsIndexPage

    for index_model, title, slug in (
        (TagsIndexPage, "Tags", "tags"),
        (PlacesIndexPage, "Places", "places"),
        (StaticIndexPage, "Static pages", "static-pages"),
    ):
        ensure_index(index_model, title, slug)
