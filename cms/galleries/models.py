"""
Galleries were folded into content pages (2026-08-06): a portal or static
page's plan_gallery block now holds the curated plan ids directly, page
team-scoping owns access, and the page workflow owns approval. This app
survives only for its migration history (authapi/0007 and content/0007
depend on it); galleries/0004 drops the tables.
"""
