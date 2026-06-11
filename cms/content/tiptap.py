"""
ProseMirror (TipTap) document -> StreamField raw-data conversion.

Used by `manage.py migrate_tiptap` to port the legacy cms.tags_content /
cms.places_content JSONB docs into content.TagPage / content.PlacePage
bodies. Custom nodes (exact TipTap names, see content/blocks.py) become
their corresponding struct blocks with attrs copied verbatim; consecutive
runs of standard prose nodes collapse into ONE `rich_text` block whose value
is HTML.

Fidelity caveats (HTML produced for Wagtail RichText):
- Internal page/document links and images are emitted as plain
  ``<a href>``/``<img src>`` rather than Wagtail's ``linktype``/``embedtype``
  references. They render fine through the API, but the Wagtail admin treats
  them as external links / will drop raw <img> tags if the block is re-edited.
- ``textStyle`` color marks become ``<span style="color: ...">``; Draftail has
  no color feature, so the span survives in storage but is dropped on re-edit.
- Unknown node/mark types degrade to their plain-text content and are
  reported as warnings.
"""

import html
from dataclasses import dataclass, field
from html.parser import HTMLParser

from wagtail import blocks as wagtail_blocks

from content.blocks import ContentStreamBlock

#: Exact TipTap node names (Node.create({name: ...}) in
#: app/src/app/components/Cms/RichTextEditor/extensions/) -> stream block name.
CUSTOM_NODE_BLOCKS = {
    "boilerplateNode": "boilerplate",
    "sectionHeaderNode": "section_header",
    "planGalleryNode": "plan_gallery",
    "formNode": "form",
    "mapCreateButtonsNode": "map_create_buttons",
    "commentGalleryNode": "comment_gallery",
}

_STREAM_BLOCK = ContentStreamBlock()


@dataclass
class ConversionResult:
    """Raw StreamField data plus bookkeeping for the migration report."""

    stream_data: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------
# Standard prose nodes -> HTML
# --------------------------------------------------------------------------

# mark type -> (open, close); textStyle and link are handled specially.
_SIMPLE_MARKS = {
    "bold": ("<b>", "</b>"),
    "italic": ("<i>", "</i>"),
    "underline": ("<u>", "</u>"),
    "strike": ("<s>", "</s>"),
    "code": ("<code>", "</code>"),
}


def _render_marks(text_html: str, marks: list[dict], warnings: list[str]) -> str:
    # Wrap from the inside out so the first mark ends up outermost.
    for mark in reversed(marks or []):
        mark_type = mark.get("type")
        attrs = mark.get("attrs") or {}
        if mark_type in _SIMPLE_MARKS:
            open_tag, close_tag = _SIMPLE_MARKS[mark_type]
            text_html = f"{open_tag}{text_html}{close_tag}"
        elif mark_type == "link":
            href = html.escape(attrs.get("href") or "", quote=True)
            text_html = f'<a href="{href}">{text_html}</a>'
        elif mark_type == "textStyle":
            color = attrs.get("color")
            if color:
                style = html.escape(f"color: {color}", quote=True)
                text_html = f'<span style="{style}">{text_html}</span>'
        else:
            warnings.append(f"unsupported mark type {mark_type!r} ignored")
    return text_html


def _render_children(node: dict, warnings: list[str]) -> str:
    return "".join(_render_node(child, warnings) for child in node.get("content") or [])


def _render_node(node: dict, warnings: list[str]) -> str:
    node_type = node.get("type")
    attrs = node.get("attrs") or {}

    if node_type == "text":
        return _render_marks(
            html.escape(node.get("text") or ""), node.get("marks") or [], warnings
        )
    if node_type == "paragraph":
        return f"<p>{_render_children(node, warnings)}</p>"
    if node_type == "heading":
        level = attrs.get("level") or 2
        level = min(max(int(level), 1), 6)
        return f"<h{level}>{_render_children(node, warnings)}</h{level}>"
    if node_type == "bulletList":
        return f"<ul>{_render_children(node, warnings)}</ul>"
    if node_type == "orderedList":
        start = attrs.get("start")
        start_attr = f' start="{int(start)}"' if start and int(start) != 1 else ""
        return f"<ol{start_attr}>{_render_children(node, warnings)}</ol>"
    if node_type == "listItem":
        return f"<li>{_render_children(node, warnings)}</li>"
    if node_type == "blockquote":
        return f"<blockquote>{_render_children(node, warnings)}</blockquote>"
    if node_type == "codeBlock":
        return f"<pre><code>{_render_children(node, warnings)}</code></pre>"
    if node_type == "image":
        src = html.escape(attrs.get("src") or "", quote=True)
        alt = html.escape(attrs.get("alt") or "", quote=True)
        title = attrs.get("title")
        title_attr = f' title="{html.escape(title, quote=True)}"' if title else ""
        return f'<img src="{src}" alt="{alt}"{title_attr}>'
    if node_type == "hardBreak":
        return "<br>"
    if node_type == "horizontalRule":
        return "<hr>"

    warnings.append(f"unsupported node type {node_type!r} degraded to its text content")
    return _render_children(node, warnings)


def prosemirror_to_html(doc: dict | None, warnings: list[str] | None = None) -> str:
    """Render a ProseMirror doc (or fragment) to rich-text HTML."""
    if not doc:
        return ""
    if warnings is None:
        warnings = []
    if doc.get("type") == "doc":
        return _render_children(doc, warnings)
    return _render_node(doc, warnings)


# --------------------------------------------------------------------------
# Custom nodes -> struct block values
# --------------------------------------------------------------------------


def _struct_value_from_attrs(block_name: str, attrs: dict, warnings: list[str]) -> dict:
    """Copy TipTap attrs verbatim into a struct value, normalising nulls.

    The struct definitions in content/blocks.py are the source of truth for
    the child names (exact camelCase attr names) and defaults. Legacy `null`
    becomes the block-appropriate empty value ([] / "" / block default); the
    public API converts the configured filter attrs back to null
    (CompatStructBlock.nullable_if_empty).
    """
    struct_block = _STREAM_BLOCK.child_blocks[block_name]
    value = {}
    for name, child in struct_block.child_blocks.items():
        raw = attrs.get(name)
        if isinstance(child, wagtail_blocks.RichTextBlock):
            # boilerplate.customContent nests a full ProseMirror doc.
            value[name] = (
                prosemirror_to_html(raw, warnings)
                if isinstance(raw, dict)
                else (raw or "")
            )
        elif isinstance(child, wagtail_blocks.ListBlock):
            value[name] = raw if isinstance(raw, list) else []
        elif raw is None:
            value[name] = child.get_default()
        else:
            value[name] = raw
    for name in attrs:
        if name not in struct_block.child_blocks:
            warnings.append(
                f"attr {name!r} on {block_name} has no block child; dropped"
            )
    return value


# --------------------------------------------------------------------------
# Document -> stream data
# --------------------------------------------------------------------------


def tiptap_to_stream_data(doc: dict | None) -> ConversionResult:
    """Convert a full TipTap doc into raw StreamField data.

    Consecutive standard prose nodes collapse into one `rich_text` block;
    each custom node becomes its own struct block.
    """
    result = ConversionResult()
    if not doc:
        return result

    pending_html: list[str] = []

    def flush():
        html_run = "".join(pending_html)
        pending_html.clear()
        if html_run.strip():
            result.stream_data.append({"type": "rich_text", "value": html_run})

    for node in doc.get("content") or []:
        node_type = node.get("type")
        block_name = CUSTOM_NODE_BLOCKS.get(node_type)
        if block_name:
            flush()
            if node.get("content"):
                # Custom nodes are content: 'inline*' but never render their
                # children; surface any inline text so the dry-run text diff
                # flags it instead of silently dropping it.
                result.warnings.append(
                    f"inline content inside {node_type!r} is not preserved"
                )
            result.stream_data.append(
                {
                    "type": block_name,
                    "value": _struct_value_from_attrs(
                        block_name, node.get("attrs") or {}, result.warnings
                    ),
                }
            )
        else:
            pending_html.append(_render_node(node, result.warnings))
    flush()
    return result


# --------------------------------------------------------------------------
# Plain-text extraction (for the dry-run fidelity check)
# --------------------------------------------------------------------------


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.chunks: list[str] = []

    def handle_data(self, data):
        self.chunks.append(data)


def html_to_text(value: str) -> str:
    parser = _TextExtractor()
    parser.feed(value or "")
    return " ".join(parser.chunks)


def _walk_prosemirror_text(node: dict, chunks: list[str]) -> None:
    if node.get("type") == "text":
        chunks.append(node.get("text") or "")
    attrs = node.get("attrs") or {}
    # boilerplateNode nests a doc under customContent — its text counts too.
    custom_content = attrs.get("customContent")
    if isinstance(custom_content, dict):
        _walk_prosemirror_text(custom_content, chunks)
    for child in node.get("content") or []:
        _walk_prosemirror_text(child, chunks)


def extract_prosemirror_text(doc: dict | None) -> str:
    """Whitespace-normalised text content of a ProseMirror doc."""
    if not doc:
        return ""
    chunks: list[str] = []
    _walk_prosemirror_text(doc, chunks)
    return normalize_text(" ".join(chunks))


def extract_stream_text(stream_data: list[dict]) -> str:
    """Whitespace-normalised text content of converted stream data."""
    chunks: list[str] = []
    for block in stream_data:
        if block["type"] == "rich_text":
            chunks.append(html_to_text(block["value"]))
        elif block["type"] == "boilerplate":
            chunks.append(html_to_text(block["value"].get("customContent") or ""))
    return normalize_text(" ".join(chunks))


def normalize_text(value: str) -> str:
    return " ".join(value.split())
